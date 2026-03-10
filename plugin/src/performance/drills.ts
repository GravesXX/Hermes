import type { HermesDB } from '../db/database.js';
import type { ToolResult } from '../types.js';

interface DrillEntry {
  dimension: string;
  exercise: string;
  priority: number;
  round_number?: number;
}

interface DrillsPayload {
  drills: DrillEntry[];
}

export class DrillManager {
  constructor(private db: HermesDB) {}

  buildDrillPrompt(sessionId: string, roundId?: string): string {
    const session = this.db.getSession(sessionId);
    if (!session) {
      return `Error: Session ${sessionId} not found.`;
    }

    const rounds = roundId
      ? (() => {
          const r = this.db.getRound(roundId);
          return r ? [r] : [];
        })()
      : this.db.getSessionRounds(sessionId);

    // Collect all scores from relevant rounds
    const allScores: Array<{ dimension: string; score: number; round_number: number }> = [];

    for (const round of rounds) {
      const scores = this.db.getRoundScores(round.id);
      for (const score of scores) {
        allScores.push({ dimension: score.dimension, score: score.score, round_number: round.round_number });
      }
    }

    // Find weak dimensions (score <= 3), deduplicate by taking worst score per dimension
    const dimensionWorstScore = new Map<string, { score: number; round_number: number }>();
    for (const entry of allScores) {
      if (entry.score <= 3) {
        const existing = dimensionWorstScore.get(entry.dimension);
        if (!existing || entry.score < existing.score) {
          dimensionWorstScore.set(entry.dimension, { score: entry.score, round_number: entry.round_number });
        }
      }
    }

    // Sort by score ascending (weakest first)
    const weakDimensions = Array.from(dimensionWorstScore.entries())
      .sort((a, b) => a[1].score - b[1].score);

    if (weakDimensions.length === 0) {
      return `No weak dimensions found for session ${sessionId}. All scores are above 3.`;
    }

    const weakList = weakDimensions
      .map(([dim, info]) => `  - ${dim}: score ${info.score}/5 (round ${info.round_number})`)
      .join('\n');

    const jd = this.db.getJobDescription(session.jd_id);
    const roleContext = jd ? `${jd.title}${jd.company ? ` @ ${jd.company}` : ''}` : 'Unknown Role';

    return `You are an interview coach generating targeted practice drills.

=== SESSION CONTEXT ===
Session ID: ${sessionId}
Role: ${roleContext}

=== WEAK DIMENSIONS (score ≤ 3, sorted weakest first) ===
${weakList}

=== TASK ===
Generate specific, actionable practice drills for each weak dimension listed above.
Each drill should be a concrete exercise the candidate can do to improve.

Return ONLY valid JSON in the following structure — no other text:
{
  "drills": [
    {
      "dimension": "<dimension_name>",
      "exercise": "<specific actionable exercise>",
      "priority": <1=high, 2=medium, 3=low>,
      "round_number": <round number, optional>
    }
  ]
}

Generate 1-3 drills per weak dimension, prioritizing the weakest dimensions.`;
  }

  applyDrills(sessionId: string, drillsJson: string): ToolResult {
    const session = this.db.getSession(sessionId);
    if (!session) {
      return { content: '', error: `Session ${sessionId} not found.` };
    }

    let parsed: DrillsPayload;
    try {
      parsed = JSON.parse(drillsJson) as DrillsPayload;
    } catch {
      return { content: '', error: 'Invalid JSON: could not parse drills.' };
    }

    if (!parsed.drills || !Array.isArray(parsed.drills)) {
      return { content: '', error: 'Invalid payload: expected { drills: [...] }.' };
    }

    let created = 0;
    for (const entry of parsed.drills) {
      let roundId: string | undefined;

      if (entry.round_number !== undefined) {
        const rounds = this.db.getSessionRounds(sessionId);
        const round = rounds.find((r) => r.round_number === entry.round_number);
        roundId = round?.id;
      }

      this.db.createDrill(sessionId, entry.dimension, entry.exercise, entry.priority, roundId);
      created++;
    }

    return { content: `Created ${created} drill${created !== 1 ? 's' : ''} for session ${sessionId}.` };
  }

  listDrills(dimension?: string, status?: string): ToolResult {
    const drills = this.db.getDrills({
      dimension: dimension,
      status: status,
    });

    if (drills.length === 0) {
      return { content: 'No drills found.' };
    }

    // Group by dimension
    const byDimension = new Map<string, typeof drills>();
    for (const drill of drills) {
      if (!byDimension.has(drill.dimension)) {
        byDimension.set(drill.dimension, []);
      }
      byDimension.get(drill.dimension)!.push(drill);
    }

    const lines: string[] = [];

    for (const [dim, dimDrills] of byDimension) {
      lines.push(`\n## ${dim}`);
      for (const drill of dimDrills) {
        const checkbox = drill.status === 'practiced' ? '[x]' : '[ ]';
        const priorityLabel = drill.priority === 1 ? '!!!' : drill.priority === 2 ? '!!' : '!';
        const shortId = drill.id.slice(0, 8);
        lines.push(`  ${checkbox} ${priorityLabel} ${drill.exercise_text}  [${shortId}]`);
      }
    }

    return { content: lines.join('\n').trim() };
  }

  completeDrill(drillId: string): ToolResult {
    const drill = this.db.getDrill(drillId);

    if (!drill) {
      return { content: '', error: `Drill ${drillId} not found.` };
    }

    if (drill.status !== 'pending') {
      return { content: '', error: `Drill ${drillId} is already ${drill.status}.` };
    }

    this.db.completeDrill(drillId);

    return { content: `Drill marked as practiced: "${drill.exercise_text}" (${drillId.slice(0, 8)}...)` };
  }
}
