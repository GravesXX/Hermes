import type { HermesDB } from '../db/database.js';
import type { ToolResult } from '../types.js';

interface PlanRound {
  type: string;
  title: string;
  rationale: string;
}

export class Planner {
  constructor(private db: HermesDB) {}

  buildPlanPrompt(sessionId: string): string {
    const session = this.db.getSession(sessionId);
    if (!session) {
      return `Error: Session ${sessionId} not found.`;
    }

    const jd = this.db.getJobDescription(session.jd_id);
    if (!jd) {
      return `Error: Job description for session ${sessionId} not found.`;
    }

    const seniorityNote = jd.seniority_level
      ? `\nSeniority Level: ${jd.seniority_level}`
      : '';

    const requirementsNote = jd.requirements
      ? `\nKey Requirements: ${jd.requirements}`
      : '';

    const companyNote = jd.company ? `\nCompany: ${jd.company}` : '';

    return `You are designing an interview plan for the following role.

=== JOB DESCRIPTION ===
Title: ${jd.title}${companyNote}${seniorityNote}${requirementsNote}

Full Job Description:
${jd.raw_text}

=== TASK ===
Design 3 to 5 interview rounds for this position. Return a JSON array where each element has:
- type: one of "experience_screen", "technical", "behavioral", "culture_fit", "hiring_manager"
- title: a concise round title
- rationale: why this round is included for this specific role

=== GUIDELINES ===
- Always include a behavioral round to assess soft skills and culture alignment
- For senior, staff, or lead seniority levels, include a system design round (use type "technical" with a system design focus)
- The first round should be a screen (experience_screen or equivalent)
- The last round should typically be culture_fit or hiring_manager
- Tailor the rounds to the specific requirements of this role

Return ONLY a valid JSON array, no other text.`;
  }

  approvePlan(sessionId: string, planJson: string): ToolResult {
    const session = this.db.getSession(sessionId);
    if (!session) {
      return { content: '', error: `Session ${sessionId} not found.` };
    }

    if (session.status !== 'planning') {
      return {
        content: '',
        error: `Session is not in planning status (current status: ${session.status}). Only sessions in planning status can be approved.`,
      };
    }

    let rounds: PlanRound[];
    try {
      const parsed = JSON.parse(planJson);
      if (!Array.isArray(parsed)) {
        return { content: '', error: 'Plan must be a JSON array of round objects.' };
      }
      rounds = parsed as PlanRound[];
    } catch {
      return { content: '', error: 'Invalid JSON: could not parse the plan.' };
    }

    if (rounds.length === 0) {
      return { content: '', error: 'Plan must contain at least one round.' };
    }

    // Store plan and update status
    this.db.updateSessionPlan(sessionId, planJson);
    this.db.updateSessionStatus(sessionId, 'approved');

    // Create round records
    const createdRounds = rounds.map((round, index) => {
      return this.db.createRound(
        sessionId,
        index + 1,
        round.type,
        round.title
      );
    });

    const roundList = createdRounds
      .map((r) => `  Round ${r.round_number}: [${r.type}] ${r.title}`)
      .join('\n');

    return {
      content: `Interview plan approved for session ${sessionId}. ${createdRounds.length} rounds created:\n${roundList}`,
    };
  }
}
