import type { HermesDB } from '../db/database.js';
import type { ToolResult } from '../types.js';

export class Conductor {
  constructor(private db: HermesDB) {}

  startRound(sessionId: string, roundNumber?: number): ToolResult {
    const session = this.db.getSession(sessionId);
    if (!session) {
      return { content: '', error: `Session ${sessionId} not found.` };
    }

    if (session.status !== 'approved' && session.status !== 'in_progress') {
      return {
        content: '',
        error: `Session is not ready to start a round (current status: ${session.status}). Session must be 'approved' or 'in_progress'.`,
      };
    }

    // Check no other round is already active
    const activeRound = this.db.getActiveRound(sessionId);
    if (activeRound) {
      return {
        content: '',
        error: `Round "${activeRound.title}" (round ${activeRound.round_number}) is already active. Complete or skip it before starting a new round.`,
      };
    }

    let round;
    if (roundNumber !== undefined) {
      // Find specific round by number
      const rounds = this.db.getSessionRounds(sessionId);
      round = rounds.find((r) => r.round_number === roundNumber);
      if (!round) {
        return {
          content: '',
          error: `Round number ${roundNumber} not found in session ${sessionId}.`,
        };
      }
      if (round.status !== 'pending') {
        return {
          content: '',
          error: `Round ${roundNumber} is not pending (current status: ${round.status}). Only pending rounds can be started.`,
        };
      }
    } else {
      // Get next pending round
      round = this.db.getNextPendingRound(sessionId);
      if (!round) {
        return {
          content: '',
          error: `No pending rounds found for session ${sessionId}.`,
        };
      }
    }

    // Activate the round
    this.db.updateRoundStatus(round.id, 'active');

    // If session was approved, move it to in_progress
    if (session.status === 'approved') {
      this.db.updateSessionStatus(sessionId, 'in_progress');
    }

    return {
      content: `Round ${round.round_number} started: "${round.title}" [${round.type}]. Round ID: ${round.id}`,
    };
  }

  recordAnswer(roundId: string, answer: string, source: string = 'text'): ToolResult {
    const round = this.db.getRound(roundId);
    if (!round) {
      return { content: '', error: `Round ${roundId} not found.` };
    }

    if (round.status !== 'active') {
      return {
        content: '',
        error: `Round is not active (current status: ${round.status}). Only active rounds can receive answers.`,
      };
    }

    const exchange = this.db.getLatestExchange(roundId);
    if (!exchange) {
      return {
        content: '',
        error: `No exchanges found for round ${roundId}. A question must be asked before an answer can be recorded.`,
      };
    }

    if (exchange.answer_text !== null) {
      return {
        content: '',
        error: `The latest question has already been answered. Ask a follow-up question before recording another answer.`,
      };
    }

    this.db.recordAnswer(exchange.id, answer, source);

    const exchanges = this.db.getRoundExchanges(roundId);
    return {
      content: `Answer recorded for exchange ${exchange.sequence} in round "${round.title}". Total exchanges so far: ${exchanges.length}.`,
    };
  }

  completeRound(roundId: string): ToolResult {
    const round = this.db.getRound(roundId);
    if (!round) {
      return { content: '', error: `Round ${roundId} not found.` };
    }

    if (round.status !== 'active') {
      return {
        content: '',
        error: `Round is not active (current status: ${round.status}). Only active rounds can be completed.`,
      };
    }

    this.db.updateRoundStatus(roundId, 'completed');

    const exchanges = this.db.getRoundExchanges(roundId);
    return {
      content: `Round "${round.title}" completed. Total exchanges: ${exchanges.length}.`,
    };
  }

  skipRound(roundId: string): ToolResult {
    const round = this.db.getRound(roundId);
    if (!round) {
      return { content: '', error: `Round ${roundId} not found.` };
    }

    if (round.status !== 'pending' && round.status !== 'active') {
      return {
        content: '',
        error: `Round cannot be skipped (current status: ${round.status}). Only pending or active rounds can be skipped.`,
      };
    }

    this.db.updateRoundStatus(roundId, 'skipped');

    return {
      content: `Round "${round.title}" (round ${round.round_number}) has been skipped.`,
    };
  }

  buildConductPrompt(roundId: string): string {
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

    // Build JD context
    const companyLine = jd.company ? `\nCompany: ${jd.company}` : '';
    const seniorityLine = jd.seniority_level ? `\nSeniority: ${jd.seniority_level}` : '';

    // Build exchange history
    let exchangeHistory = '';
    if (exchanges.length === 0) {
      exchangeHistory = '(No questions asked yet)';
    } else {
      exchangeHistory = exchanges
        .map((ex) => {
          const answer = ex.answer_text ? `  Answer: ${ex.answer_text}` : '  Answer: [AWAITING RESPONSE]';
          return `Q${ex.sequence}: ${ex.question_text}\n${answer}`;
        })
        .join('\n\n');
    }

    // Determine current state instructions
    let stateInstructions: string;
    const totalExchanges = exchanges.length;
    const lastExchange = exchanges[exchanges.length - 1];

    if (totalExchanges === 0) {
      stateInstructions = 'STATE: Start the round. Ask your first question for this round type. Be welcoming but professional.';
    } else if (lastExchange && lastExchange.answer_text === null) {
      stateInstructions = 'STATE: The candidate has not yet answered the last question. Wait for their response. Do NOT ask a new question.';
    } else if (totalExchanges >= 6) {
      stateInstructions = `STATE: You have asked ${totalExchanges} questions. Begin wrapping up this round. Ask one final question if needed, then signal round completion.`;
    } else {
      stateInstructions = `STATE: ${totalExchanges} exchange(s) completed. Ask the next question for this round. Probe deeper or pivot to another dimension as appropriate.`;
    }

    return `You are an experienced technical interviewer conducting a mock interview.

=== JD CONTEXT ===
Title: ${jd.title}${companyLine}${seniorityLine}

=== ROUND INFO ===
Round Number: ${round.round_number}
Round Title: ${round.title}
Round Type: ${round.type}

=== INTERVIEW RULES ===
1. CALIBRATED PROBING: Follow up on vague or incomplete answers. Dig for specifics — numbers, timelines, outcomes.
2. TIME-BOXING: Target 4–6 questions per round. Do not exceed 6 unless critical follow-up is needed.
3. NO LEADING: Do not hint at the desired answer. Ask open-ended questions only.
4. SILENCE: After asking a question, stop. Do not fill silence with prompts or encouragement.
5. SENIORITY-AWARE: Calibrate depth and complexity of questions to the candidate's seniority level.
6. STAR ENFORCEMENT: For behavioral questions, require the candidate to structure answers using Situation–Task–Action–Result. If they don't, ask them to reframe.
7. FOLLOW-UP DEPTH: After each answer, consider at least one follow-up before moving to a new dimension.

=== ROUND-TYPE GUIDANCE ===
${this.getRoundTypeGuidance(round.type)}

=== EXCHANGE HISTORY ===
${exchangeHistory}

=== INSTRUCTIONS ===
${stateInstructions}`;
  }

  getSessionStatus(sessionId: string): ToolResult {
    const session = this.db.getSession(sessionId);
    if (!session) {
      return { content: '', error: `Session ${sessionId} not found.` };
    }

    const jd = this.db.getJobDescription(session.jd_id);
    const rounds = this.db.getSessionRounds(sessionId);

    const jdLine = jd ? `${jd.title}${jd.company ? ` at ${jd.company}` : ''}` : 'Unknown';

    const roundLines = rounds.map((round) => {
      const exchanges = this.db.getRoundExchanges(round.id);
      const scores = this.db.getRoundScores(round.id);

      let avgScore = '';
      if (scores.length > 0) {
        const sum = scores.reduce((acc, s) => acc + s.score, 0);
        avgScore = ` | avg score: ${(sum / scores.length).toFixed(1)}`;
      }

      const answeredExchanges = exchanges.filter((ex) => ex.answer_text !== null).length;

      return `  Round ${round.round_number}: [${round.status}] ${round.title} (${round.type}) | exchanges: ${exchanges.length} (${answeredExchanges} answered)${avgScore}`;
    });

    const overallScore = session.overall_score !== null ? `\nOverall Score: ${session.overall_score}` : '';
    const overallFeedback = session.overall_feedback ? `\nOverall Feedback: ${session.overall_feedback}` : '';

    const content = `Session Status: ${session.status}
Role: ${jdLine}
Session ID: ${sessionId}

Rounds (${rounds.length} total):
${roundLines.join('\n')}${overallScore}${overallFeedback}`;

    return { content };
  }

  private getRoundTypeGuidance(type: string): string {
    switch (type) {
      case 'experience_screen':
        return `EXPERIENCE SCREEN GUIDANCE:
- Validate the candidate's background matches the role requirements.
- Confirm key technologies, years of experience, and scope of past roles.
- Ask about the most relevant projects they've worked on.
- Assess communication clarity and enthusiasm for the role.
- Red flags: vague descriptions, inability to recall specifics, mismatched seniority.`;

      case 'technical':
        return `TECHNICAL ROUND GUIDANCE:
- Assess depth of knowledge in the core technical domains for this role.
- Ask about system design, architecture decisions, and trade-offs they've made.
- Probe for understanding of fundamentals (data structures, algorithms, concurrency, etc.) as appropriate.
- Push for concrete examples from their work — hypotheticals are secondary.
- Challenge shallow answers with "Why?" and "What trade-offs did you consider?"
- For senior+ levels: focus on distributed systems, scalability, operational concerns.`;

      case 'behavioral':
        return `BEHAVIORAL ROUND GUIDANCE:
- Use competency-based questions to assess soft skills and past behavior.
- Require STAR format (Situation, Task, Action, Result) for all responses.
- Cover multiple dimensions: leadership, conflict resolution, failure handling, collaboration.
- If the candidate speaks in generalities, ask: "Can you give me a specific example?"
- Look for ownership, self-awareness, and growth mindset.
- Probe the "Result" component — what was the measurable impact?`;

      case 'culture_fit':
        return `CULTURE FIT ROUND GUIDANCE:
- Assess alignment with team values, working style, and company mission.
- Explore what environments the candidate thrives in and what they struggle with.
- Ask about their preferred feedback style, collaboration model, and career motivations.
- Probe for intellectual curiosity, adaptability, and attitude toward ambiguity.
- Avoid hypotheticals — anchor questions to past experiences.
- Look for genuine enthusiasm vs. rehearsed corporate speak.`;

      case 'hiring_manager':
        return `HIRING MANAGER ROUND GUIDANCE:
- Take a holistic view of the candidate's fit for the team and role.
- Discuss career trajectory, long-term goals, and alignment with the team's roadmap.
- Assess executive presence, strategic thinking, and ability to influence.
- Explore their leadership philosophy and how they've grown teams or individuals.
- Give space for the candidate to ask questions — this reveals priorities and curiosity.
- Focus on cultural contribution and unique value they would bring.`;

      default:
        return `GENERAL GUIDANCE:
- Ask open-ended questions relevant to the round's focus area.
- Probe for specifics and concrete examples.
- Calibrate depth to the candidate's seniority level.`;
    }
  }
}
