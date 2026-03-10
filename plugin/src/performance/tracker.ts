import type { HermesDB } from '../db/database.js';
import type { ToolResult } from '../types.js';
import { DIMENSIONS } from '../interview/evaluator.js';

export class Tracker {
  constructor(private db: HermesDB) {}

  getHistory(limit?: number): ToolResult {
    const sessions = this.db.getCompletedSessions(limit);

    if (sessions.length === 0) {
      return { content: 'No completed sessions yet.' };
    }

    const lines: string[] = [];

    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      const jd = this.db.getJobDescription(session.jd_id);
      const title = jd?.title ?? 'Unknown Role';
      const company = jd?.company ?? 'Unknown Company';

      const rounds = this.db.getSessionRounds(session.id);
      const roundLines: string[] = [];

      for (const round of rounds) {
        const scores = this.db.getRoundScores(round.id);
        if (scores.length > 0) {
          const avg = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
          roundLines.push(`    Round ${round.round_number} "${round.title}": ${avg.toFixed(2)}/5`);
        } else {
          roundLines.push(`    Round ${round.round_number} "${round.title}": no scores`);
        }
      }

      const overallScore = session.overall_score !== null ? `${session.overall_score}` : 'N/A';
      const date = session.completed_at ? session.completed_at.slice(0, 10) : 'unknown';

      lines.push(`${i + 1}. ${title} @ ${company}`);
      lines.push(`   Overall Score: ${overallScore}/5 | Completed: ${date}`);
      if (roundLines.length > 0) {
        lines.push(`   Rounds:`);
        lines.push(...roundLines);
      }
    }

    return { content: lines.join('\n') };
  }

  getDimensionTrend(dimension: string): ToolResult {
    const dimensionSet = new Set<string>(DIMENSIONS);
    if (!dimensionSet.has(dimension)) {
      return { content: '', error: `Unknown dimension: "${dimension}". Valid dimensions: ${DIMENSIONS.join(', ')}.` };
    }

    // Walk completed sessions in chronological order (oldest first via reverse of DESC),
    // collecting scores for this dimension round-by-round to guarantee ordering by session.
    const sessions = this.db.getCompletedSessions();
    const chronologicalSessions = [...sessions].reverse(); // oldest first

    const chronologicalValues: number[] = [];
    for (const session of chronologicalSessions) {
      const rounds = this.db.getSessionRounds(session.id);
      for (const round of rounds) {
        const scores = this.db.getRoundScores(round.id);
        for (const score of scores) {
          if (score.dimension === dimension) {
            chronologicalValues.push(score.score);
          }
        }
      }
    }

    if (chronologicalValues.length === 0) {
      return { content: `No data for dimension "${dimension}".` };
    }

    const values = chronologicalValues;
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;

    let trend: string;
    if (values.length < 2) {
      trend = 'stable';
    } else {
      const first = values[0];
      const last = values[values.length - 1];
      if (last > first) {
        trend = 'improving';
      } else if (last < first) {
        trend = 'declining';
      } else {
        trend = 'stable';
      }
    }

    const scoreSequence = values.join(' → ');

    const lines = [
      `Dimension: ${dimension}`,
      `Scores: ${scoreSequence}`,
      `Average: ${avg.toFixed(2)}/5`,
      `Data Points: ${values.length}`,
      `Trend: ${trend}`,
    ];

    return { content: lines.join('\n') };
  }
}
