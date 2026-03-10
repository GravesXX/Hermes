import type { HermesDB } from '../db/database.js';
import type { ToolResult } from '../types.js';

export const DIMENSIONS = [
  'content_relevance',
  'star_structure',
  'communication_clarity',
  'specificity_metrics',
  'depth',
  'confidence_indicators',
  'growth_mindset',
] as const;

const DIMENSION_DESCRIPTIONS: Record<string, string> = {
  content_relevance: 'Did the answer address the actual question asked?',
  star_structure: 'Was the answer organized with clear Situation-Task-Action-Result?',
  communication_clarity: 'Conciseness, logical flow, absence of filler words/rambling',
  specificity_metrics: 'Concrete examples, quantifiable results, named technologies',
  depth: 'Thoroughness of explanation, demonstrates real understanding',
  confidence_indicators: 'Assertive language, decisive statements vs hedging/uncertainty',
  growth_mindset: 'Self-awareness, learning from failures, openness to feedback',
};

interface ScoreEntry {
  dimension: string;
  score: number;
  evidence: string;
}

interface ScoresPayload {
  scores: ScoreEntry[];
}

export class Evaluator {
  constructor(private db: HermesDB) {}

  buildEvaluationPrompt(roundId: string): string {
    const round = this.db.getRound(roundId);
    if (!round) {
      return `Error: Round ${roundId} not found.`;
    }

    const session = this.db.getSession(round.session_id);
    if (!session) {
      return `Error: Session for round ${roundId} not found.`;
    }

    const jd = this.db.getJobDescription(session.jd_id);
    if (!jd) {
      return `Error: Job description not found.`;
    }

    const exchanges = this.db.getRoundExchanges(roundId);

    // Build context lines
    const companyLine = jd.company ? `\nCompany: ${jd.company}` : '';
    const seniorityLine = jd.seniority_level ? `\nSeniority: ${jd.seniority_level}` : '';

    // Check if any exchanges used voice_transcription
    const hasVoiceTranscription = exchanges.some((ex) => ex.answer_source === 'voice_transcription');

    // Build exchange history
    const exchangeHistory = exchanges
      .map((ex) => {
        const answer = ex.answer_text ?? '[No answer recorded]';
        const sourceLine = ex.answer_source ? ` [answer_source: ${ex.answer_source}]` : '';
        return `Q${ex.sequence}: ${ex.question_text}\nA${ex.sequence}${sourceLine}: ${answer}`;
      })
      .join('\n\n');

    // Build dimensions section
    const dimensionsSection = DIMENSIONS.map(
      (dim) => `- ${dim}: ${DIMENSION_DESCRIPTIONS[dim]}`
    ).join('\n');

    // Audio-aware notes
    const voiceNote = hasVoiceTranscription
      ? `\n=== AUDIO-AWARE NOTES ===
One or more answers were captured via voice_transcription. When evaluating these answers:
- Filler words ("um", "uh", "like") and disfluencies are natural in spoken speech — apply appropriate leniency to communication_clarity for voice_transcription answers.
- Transcription artifacts may affect perceived fluency; focus on the substance of what was said.
- Note which answers were voice_transcription when citing evidence for communication_clarity or confidence_indicators.`
      : '';

    return `You are an expert interview evaluator. Your task is to score the following interview round on 7 dimensions.

=== ROLE CONTEXT ===
Title: ${jd.title}${companyLine}${seniorityLine}
Round Type: ${round.type}
Round Title: ${round.title}

=== INTERVIEW EXCHANGES ===
${exchangeHistory}
${voiceNote}
=== EVALUATION DIMENSIONS ===
Score each of the following 7 dimensions:
${dimensionsSection}

=== SCORING SCALE ===
Use a 1–5 integer scale for each dimension:
- 1 (Poor): Answer fails to meet basic expectations for this dimension.
- 2 (Below Average): Partial attempt but significant gaps remain.
- 3 (Average): Meets minimum expectations; room for improvement.
- 4 (Good): Strong performance with minor gaps.
- 5 (Excellent): Exceptional; sets a high bar for this dimension.

=== OUTPUT FORMAT ===
Return ONLY valid JSON in the following structure — no other text:
{
  "scores": [
    { "dimension": "<dimension_name>", "score": <1-5>, "evidence": "<brief quote or observation from the answer>" }
  ],
  "summary": "<2-3 sentence overall assessment of the candidate's performance in this round>"
}

You must include exactly 7 score entries, one for each dimension listed above.`;
  }

  applyScores(roundId: string, scoresJson: string): ToolResult {
    const round = this.db.getRound(roundId);
    if (!round) {
      return { content: '', error: `Round ${roundId} not found.` };
    }

    let parsed: ScoresPayload;
    try {
      parsed = JSON.parse(scoresJson) as ScoresPayload;
    } catch {
      return { content: '', error: 'Invalid JSON: could not parse scores.' };
    }

    if (!parsed.scores || !Array.isArray(parsed.scores)) {
      return { content: '', error: 'Invalid payload: expected { scores: [...] }.' };
    }

    const dimensionSet = new Set<string>(DIMENSIONS);
    const errors: string[] = [];

    for (const entry of parsed.scores) {
      if (!dimensionSet.has(entry.dimension)) {
        errors.push(`Unknown dimension: "${entry.dimension}".`);
      }
      if (typeof entry.score !== 'number' || entry.score < 1 || entry.score > 5 || !Number.isInteger(entry.score)) {
        errors.push(`Score for "${entry.dimension}" must be an integer between 1 and 5 (got ${entry.score}).`);
      }
    }

    if (errors.length > 0) {
      return { content: '', error: errors.join(' ') };
    }

    // Persist scores
    for (const entry of parsed.scores) {
      this.db.createScore(roundId, entry.dimension, entry.score, entry.evidence ?? undefined);
    }

    // Mark round as scored
    this.db.updateRoundStatus(roundId, 'scored');

    // Compute average
    const total = parsed.scores.reduce((sum, e) => sum + e.score, 0);
    const avg = total / parsed.scores.length;

    const scoreLines = parsed.scores
      .map((e) => `  ${e.dimension}: ${e.score}/5`)
      .join('\n');

    return {
      content: `Scores applied to round "${round.title}" (round ${round.id}). ${parsed.scores.length} dimensions scored.\n\n${scoreLines}\n\nAverage: ${avg.toFixed(2)}/5`,
    };
  }

  buildDebriefPrompt(sessionId: string): string {
    const session = this.db.getSession(sessionId);
    if (!session) {
      return `Error: Session ${sessionId} not found.`;
    }

    const jd = this.db.getJobDescription(session.jd_id);
    if (!jd) {
      return `Error: Job description for session ${sessionId} not found.`;
    }

    const rounds = this.db.getSessionRounds(sessionId);

    // Build round summaries with scores
    const roundSummaries = rounds
      .map((round) => {
        const scores = this.db.getRoundScores(round.id);
        if (scores.length === 0) {
          return `Round ${round.round_number}: "${round.title}" [${round.type}] — no scores recorded`;
        }
        const avg = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
        const scoreLines = scores
          .map((s) => `    ${s.dimension}: ${s.score}/5${s.evidence ? ` (${s.evidence})` : ''}`)
          .join('\n');
        return `Round ${round.round_number}: "${round.title}" [${round.type}] — avg ${avg.toFixed(2)}/5\n${scoreLines}`;
      })
      .join('\n\n');

    // Get past completed sessions for comparison
    const pastSessions = this.db.getCompletedSessions(5);
    let trendSection = '';
    if (pastSessions.length > 0) {
      const pastLines = pastSessions
        .map((s) => {
          const scoreLine = s.overall_score !== null ? ` (overall score: ${s.overall_score})` : '';
          const feedbackLine = s.overall_feedback ? `\n  Feedback: ${s.overall_feedback}` : '';
          return `  Session ${s.id.slice(0, 8)}... completed at ${s.completed_at ?? 'unknown'}${scoreLine}${feedbackLine}`;
        })
        .join('\n');
      trendSection = `\n=== PAST COMPLETED SESSIONS (for trend analysis) ===\n${pastLines}\n`;
    }

    const sessionAvg = this.computeSessionAverage(sessionId);

    return `You are an expert interview coach providing a session debrief.

=== ROLE CONTEXT ===
Title: ${jd.title}${jd.company ? `\nCompany: ${jd.company}` : ''}${jd.seniority_level ? `\nSeniority: ${jd.seniority_level}` : ''}

=== SESSION SUMMARY ===
Session ID: ${sessionId}
Total Rounds: ${rounds.length}
Session Average Score: ${sessionAvg.toFixed(2)}/5

=== ROUND SCORES ===
${roundSummaries}
${trendSection}
=== TASK ===
Provide a comprehensive session debrief. Return valid JSON with the following structure:
{
  "overall_score": <number 1.0–5.0>,
  "feedback": "<3-5 sentence narrative assessment of overall interview performance>",
  "strengths": ["<strength 1>", "<strength 2>", ...],
  "weaknesses": ["<area for improvement 1>", "<area for improvement 2>", ...],
  "trend_analysis": "<observation about performance trends compared to past sessions, or 'No past data available' if first session>"
}

Return ONLY valid JSON, no other text.`;
  }

  computeSessionAverage(sessionId: string): number {
    const rounds = this.db.getSessionRounds(sessionId);
    let totalScore = 0;
    let totalCount = 0;

    for (const round of rounds) {
      const scores = this.db.getRoundScores(round.id);
      for (const score of scores) {
        totalScore += score.score;
        totalCount += 1;
      }
    }

    return totalCount === 0 ? 0 : totalScore / totalCount;
  }
}
