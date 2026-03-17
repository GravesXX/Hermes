import { v4 as uuidv4 } from 'uuid';
import { ObsidianAdapter } from 'obsidian-adapter';

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface JobDescription {
  id: string;
  title: string;
  company: string | null;
  raw_text: string;
  requirements: string | null;
  seniority_level: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  jd_id: string;
  status: string;
  plan: string | null;
  overall_score: number | null;
  overall_feedback: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface Round {
  id: string;
  session_id: string;
  round_number: number;
  type: string;
  title: string;
  status: string;
  questions: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface Exchange {
  id: string;
  round_id: string;
  sequence: number;
  question_text: string;
  answer_text: string | null;
  answer_source: string | null;
  created_at: string;
}

export interface Score {
  id: string;
  round_id: string;
  dimension: string;
  score: number;
  evidence: string | null;
  created_at: string;
}

export interface Drill {
  id: string;
  session_id: string;
  round_id: string | null;
  dimension: string;
  exercise_text: string;
  priority: number;
  status: string;
  created_at: string;
}

// ── Exchange parsing helpers ────────────────────────────────────────────────

const EXCHANGE_TAG_RE = /<!-- exchange:([^:]+):seq=(\d+):source=(.*?) -->/;

function formatExchange(ex: Exchange): string {
  const source = ex.answer_source ?? '';
  let block = `### Q${ex.sequence} (${ex.created_at})\n\n**Question:**\n${ex.question_text}\n`;
  if (ex.answer_text) {
    block += `\n**Answer:**\n${ex.answer_text}\n`;
  }
  block += `\n<!-- exchange:${ex.id}:seq=${ex.sequence}:source=${source} -->`;
  return block;
}

function parseExchanges(body: string, roundId: string): Exchange[] {
  const exchanges: Exchange[] = [];
  const blocks = body.split(/(?=^### Q\d+)/m);

  for (const block of blocks) {
    const headerMatch = block.match(/^### Q(\d+) \((\S+)\)/);
    const tagMatch = block.match(EXCHANGE_TAG_RE);
    if (!headerMatch || !tagMatch) continue;

    const questionMatch = block.match(/\*\*Question:\*\*\n([\s\S]*?)(?=\n\*\*Answer:\*\*|\n<!-- exchange:)/);
    const answerMatch = block.match(/\*\*Answer:\*\*\n([\s\S]*?)(?=\n<!-- exchange:)/);

    exchanges.push({
      id: tagMatch[1],
      round_id: roundId,
      sequence: parseInt(headerMatch[1], 10),
      question_text: questionMatch ? questionMatch[1].trim() : '',
      answer_text: answerMatch ? answerMatch[1].trim() : null,
      answer_source: tagMatch[3] || null,
      created_at: headerMatch[2],
    });
  }
  return exchanges.sort((a, b) => a.sequence - b.sequence);
}

// ── Score parsing helpers ───────────────────────────────────────────────────

const SCORE_ROW_RE = /^\| (.+?) \| (\d) \| (.+?) \| (.+?) \| (.+?) \|$/;

function parseScores(body: string, roundId: string): Score[] {
  const scores: Score[] = [];
  const lines = body.split('\n');

  for (const line of lines) {
    const match = line.match(SCORE_ROW_RE);
    if (!match) continue;
    const dimension = match[1].trim();
    const score = parseInt(match[2], 10);
    const evidence = match[3].trim();
    const created = match[4].trim();
    const id = match[5].trim();

    if (id === 'ID') continue; // header row

    scores.push({
      id,
      round_id: roundId,
      dimension,
      score,
      evidence: evidence === '-' ? null : evidence,
      created_at: created,
    });
  }
  return scores.sort((a, b) => a.dimension.localeCompare(b.dimension));
}

function buildScoreTable(scores: Score[]): string {
  if (scores.length === 0) return '';
  let table = '\n## Scores\n\n';
  table += '| Dimension | Score | Evidence | Created | ID |\n';
  table += '| --- | --- | --- | --- | --- |\n';
  for (const s of scores) {
    table += `| ${s.dimension} | ${s.score} | ${s.evidence ?? '-'} | ${s.created_at} | ${s.id} |\n`;
  }
  return table;
}

// ── HermesDB ─────────────────────────────────────────────────────────────────

export class HermesDB {
  private adapter: ObsidianAdapter;

  constructor(vaultPath: string) {
    this.adapter = new ObsidianAdapter(vaultPath, 'Agents/Hermes');

    this.adapter.ensureFolder('Job Descriptions');
    this.adapter.ensureFolder('Sessions');
    this.adapter.ensureFolder('Rounds');
    this.adapter.ensureFolder('Drills');
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  close(): void {
    // No-op for Obsidian adapter
  }

  // ── Introspection ───────────────────────────────────────────────────────

  listTables(): string[] {
    return ['job_descriptions', 'sessions', 'rounds', 'exchanges', 'scores', 'drills'];
  }

  // ── Job Descriptions ────────────────────────────────────────────────────

  createJobDescription(
    title: string,
    rawText: string,
    company?: string,
    requirements?: string,
    seniorityLevel?: string
  ): JobDescription {
    const id = uuidv4();
    const now = new Date().toISOString();
    const companyPart = company ? ` - ${this.adapter.sanitize(company)}` : '';
    const filename = `${this.adapter.sanitize(title)}${companyPart} - ${this.adapter.shortId(id)}.md`;

    this.adapter.createNote('Job Descriptions', filename, {
      id,
      type: 'hermes-jd',
      title,
      company: company ?? null,
      requirements: requirements ?? null,
      seniority_level: seniorityLevel ?? null,
      created_at: now,
      tags: ['hermes', 'jd'],
    }, `# ${title}\n\n${rawText}\n`);

    return this.getJobDescription(id)!;
  }

  getJobDescription(id: string): JobDescription | undefined {
    const entry = this.adapter.findById(id);
    if (!entry || entry.frontmatter.type !== 'hermes-jd') return undefined;
    return this.jdFromEntry(entry);
  }

  getAllJobDescriptions(): JobDescription[] {
    return this.adapter.findByType('hermes-jd')
      .map(e => this.jdFromEntry(e))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  // ── Sessions ────────────────────────────────────────────────────────────

  createSession(jdId: string): Session {
    const id = uuidv4();
    const now = new Date().toISOString();

    // Determine folder name from JD title
    const jd = this.getJobDescription(jdId);
    const jdTitle = jd ? this.adapter.sanitize(jd.title) : jdId.slice(0, 8);
    const folderPath = `Sessions/${jdTitle}`;
    this.adapter.ensureFolder(folderPath);

    const filename = `${this.adapter.shortId(id)}.md`;

    this.adapter.createNote(folderPath, filename, {
      id,
      type: 'hermes-session',
      jd_id: jdId,
      status: 'planning',
      overall_score: null,
      created_at: now,
      completed_at: null,
      tags: ['hermes', 'session'],
    }, `# Interview Session\n\n## Plan\n\n## Debrief\n`);

    return this.getSession(id)!;
  }

  getSession(id: string): Session | undefined {
    const entry = this.adapter.findById(id);
    if (!entry || entry.frontmatter.type !== 'hermes-session') return undefined;
    return this.sessionFromEntry(entry);
  }

  getActiveSession(): Session | undefined {
    const activeStatuses = ['planning', 'approved', 'in_progress'];
    const sessions = this.adapter.findByType('hermes-session')
      .filter(e => activeStatuses.includes(e.frontmatter.status as string))
      .map(e => this.sessionFromEntry(e))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return sessions[0];
  }

  updateSessionStatus(id: string, status: string): void {
    const entry = this.adapter.findById(id);
    if (!entry) return;
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { status };
    if (status === 'completed') {
      updates.completed_at = now;
    }
    this.adapter.updateFrontmatter(entry.relativePath, updates);
  }

  updateSessionPlan(id: string, plan: string): void {
    const entry = this.adapter.findById(id);
    if (!entry) return;
    const note = this.adapter.readNote(entry.relativePath);
    if (!note) return;

    let body = note.body;
    body = body.replace(
      /## Plan\n[\s\S]*?(?=\n## Debrief)/,
      `## Plan\n\n${plan}\n\n`
    );
    this.adapter.replaceBody(entry.relativePath, body);
  }

  updateSessionDebrief(id: string, overallScore: number, overallFeedback: string): void {
    const entry = this.adapter.findById(id);
    if (!entry) return;

    this.adapter.updateFrontmatter(entry.relativePath, {
      overall_score: overallScore,
    });

    const note = this.adapter.readNote(entry.relativePath);
    if (!note) return;

    let body = note.body;
    // Replace everything after ## Debrief
    const debriefIndex = body.indexOf('## Debrief');
    if (debriefIndex !== -1) {
      body = body.slice(0, debriefIndex) + `## Debrief\n\n**Overall Score:** ${overallScore}/5\n\n${overallFeedback}\n`;
    }
    this.adapter.replaceBody(entry.relativePath, body);
  }

  getCompletedSessions(limit?: number): Session[] {
    let sessions = this.adapter.findByType('hermes-session')
      .filter(e => e.frontmatter.status === 'completed')
      .map(e => this.sessionFromEntry(e))
      .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));

    if (limit !== undefined) {
      sessions = sessions.slice(0, limit);
    }
    return sessions;
  }

  // ── Rounds ──────────────────────────────────────────────────────────────

  createRound(
    sessionId: string,
    roundNumber: number,
    type: string,
    title: string,
    questions?: string
  ): Round {
    const id = uuidv4();
    const session = this.getSession(sessionId);
    const sessionShortId = this.adapter.shortId(sessionId);
    const folderPath = `Rounds/${sessionShortId}`;
    this.adapter.ensureFolder(folderPath);

    const filename = `R${roundNumber} - ${this.adapter.sanitize(title)}.md`;

    this.adapter.createNote(folderPath, filename, {
      id,
      type: 'hermes-round',
      session_id: sessionId,
      round_number: roundNumber,
      round_type: type,
      title,
      status: 'pending',
      started_at: null,
      completed_at: null,
      tags: ['hermes', 'round'],
    }, `# R${roundNumber}: ${title}\n\n## Questions\n\n${questions ?? ''}\n\n## Exchanges\n`);

    return this.getRound(id)!;
  }

  getRound(id: string): Round | undefined {
    const entry = this.adapter.findById(id);
    if (!entry || entry.frontmatter.type !== 'hermes-round') return undefined;
    return this.roundFromEntry(entry);
  }

  getSessionRounds(sessionId: string): Round[] {
    return this.adapter.findByType('hermes-round')
      .filter(e => e.frontmatter.session_id === sessionId)
      .map(e => this.roundFromEntry(e))
      .sort((a, b) => a.round_number - b.round_number);
  }

  getNextPendingRound(sessionId: string): Round | undefined {
    const rounds = this.adapter.findByType('hermes-round')
      .filter(e => e.frontmatter.session_id === sessionId && e.frontmatter.status === 'pending')
      .map(e => this.roundFromEntry(e))
      .sort((a, b) => a.round_number - b.round_number);
    return rounds[0];
  }

  getActiveRound(sessionId: string): Round | undefined {
    const rounds = this.adapter.findByType('hermes-round')
      .filter(e => e.frontmatter.session_id === sessionId && e.frontmatter.status === 'active')
      .map(e => this.roundFromEntry(e));
    return rounds[0];
  }

  updateRoundStatus(id: string, status: string): void {
    const entry = this.adapter.findById(id);
    if (!entry) return;
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { status };
    if (status === 'active') {
      updates.started_at = now;
    } else if (status === 'completed' || status === 'scored') {
      updates.completed_at = now;
    }
    this.adapter.updateFrontmatter(entry.relativePath, updates);
  }

  // ── Exchanges ───────────────────────────────────────────────────────────

  createExchange(roundId: string, sequence: number, questionText: string): Exchange {
    const id = uuidv4();
    const now = new Date().toISOString();
    const ex: Exchange = {
      id,
      round_id: roundId,
      sequence,
      question_text: questionText,
      answer_text: null,
      answer_source: null,
      created_at: now,
    };

    const entry = this.adapter.findById(roundId);
    if (!entry) throw new Error(`Round ${roundId} not found`);

    this.adapter.appendToBody(entry.relativePath, formatExchange(ex));
    return ex;
  }

  getExchange(id: string): Exchange | undefined {
    const rounds = this.adapter.findByType('hermes-round');
    for (const entry of rounds) {
      const note = this.adapter.readNote(entry.relativePath);
      if (!note) continue;
      const exchanges = parseExchanges(note.body, entry.frontmatter.id as string);
      const found = exchanges.find(e => e.id === id);
      if (found) return found;
    }
    return undefined;
  }

  getRoundExchanges(roundId: string): Exchange[] {
    const entry = this.adapter.findById(roundId);
    if (!entry) return [];
    const note = this.adapter.readNote(entry.relativePath);
    if (!note) return [];
    return parseExchanges(note.body, roundId);
  }

  getLatestExchange(roundId: string): Exchange | undefined {
    const exchanges = this.getRoundExchanges(roundId);
    return exchanges.length > 0 ? exchanges[exchanges.length - 1] : undefined;
  }

  recordAnswer(exchangeId: string, answerText: string, source: string): void {
    const rounds = this.adapter.findByType('hermes-round');
    for (const entry of rounds) {
      const note = this.adapter.readNote(entry.relativePath);
      if (!note) continue;
      if (!note.body.includes(`exchange:${exchangeId}`)) continue;

      const exchanges = parseExchanges(note.body, entry.frontmatter.id as string);
      const target = exchanges.find(e => e.id === exchangeId);
      if (!target) continue;

      target.answer_text = answerText;
      target.answer_source = source;

      const newBody = note.body.replace(
        new RegExp(
          `### Q${target.sequence} \\(${target.created_at.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)\\n[\\s\\S]*?<!-- exchange:${exchangeId}:seq=\\d+:source=.*? -->`
        ),
        formatExchange(target)
      );
      this.adapter.replaceBody(entry.relativePath, newBody);
      return;
    }
  }

  // ── Scores ──────────────────────────────────────────────────────────────

  createScore(
    roundId: string,
    dimension: string,
    score: number,
    evidence?: string
  ): Score {
    const id = uuidv4();
    const now = new Date().toISOString();
    const s: Score = {
      id,
      round_id: roundId,
      dimension,
      score,
      evidence: evidence ?? null,
      created_at: now,
    };

    const entry = this.adapter.findById(roundId);
    if (!entry) throw new Error(`Round ${roundId} not found`);

    const note = this.adapter.readNote(entry.relativePath);
    if (!note) throw new Error(`Round note not readable: ${roundId}`);

    // Get existing scores, add the new one, rebuild the table
    const existing = parseScores(note.body, roundId);
    existing.push(s);

    // Remove old scores section if present, then append new one
    let body = note.body.replace(/\n## Scores\n[\s\S]*$/, '');
    body = body.trimEnd() + '\n' + buildScoreTable(existing);

    this.adapter.replaceBody(entry.relativePath, body);
    return s;
  }

  getScore(id: string): Score | undefined {
    const rounds = this.adapter.findByType('hermes-round');
    for (const entry of rounds) {
      const note = this.adapter.readNote(entry.relativePath);
      if (!note) continue;
      const scores = parseScores(note.body, entry.frontmatter.id as string);
      const found = scores.find(s => s.id === id);
      if (found) return found;
    }
    return undefined;
  }

  getRoundScores(roundId: string): Score[] {
    const entry = this.adapter.findById(roundId);
    if (!entry) return [];
    const note = this.adapter.readNote(entry.relativePath);
    if (!note) return [];
    return parseScores(note.body, roundId);
  }

  getScoresByDimension(dimension: string, limit?: number): Score[] {
    const allScores: Score[] = [];
    const rounds = this.adapter.findByType('hermes-round');
    for (const entry of rounds) {
      const note = this.adapter.readNote(entry.relativePath);
      if (!note) continue;
      const scores = parseScores(note.body, entry.frontmatter.id as string);
      allScores.push(...scores.filter(s => s.dimension === dimension));
    }
    allScores.sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (limit !== undefined) {
      return allScores.slice(0, limit);
    }
    return allScores;
  }

  // ── Drills ──────────────────────────────────────────────────────────────

  createDrill(
    sessionId: string,
    dimension: string,
    exerciseText: string,
    priority: number,
    roundId?: string
  ): Drill {
    const id = uuidv4();
    const now = new Date().toISOString();
    const filename = `${this.adapter.sanitize(dimension)} - ${this.adapter.shortId(id)}.md`;

    this.adapter.createNote('Drills', filename, {
      id,
      type: 'hermes-drill',
      session_id: sessionId,
      round_id: roundId ?? null,
      dimension,
      priority,
      status: 'pending',
      created_at: now,
      tags: ['hermes', 'drill'],
    }, `# Drill: ${dimension}\n\n${exerciseText}\n`);

    return this.getDrill(id)!;
  }

  getDrill(id: string): Drill | undefined {
    const entry = this.adapter.findById(id);
    if (!entry || entry.frontmatter.type !== 'hermes-drill') return undefined;
    return this.drillFromEntry(entry);
  }

  getDrills(filters?: { dimension?: string; status?: string }): Drill[] {
    let entries = this.adapter.findByType('hermes-drill');

    if (filters?.dimension !== undefined) {
      entries = entries.filter(e => e.frontmatter.dimension === filters.dimension);
    }
    if (filters?.status !== undefined) {
      entries = entries.filter(e => e.frontmatter.status === filters.status);
    }

    return entries
      .map(e => this.drillFromEntry(e))
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.created_at.localeCompare(b.created_at);
      });
  }

  completeDrill(id: string): void {
    const entry = this.adapter.findById(id);
    if (!entry) return;
    this.adapter.updateFrontmatter(entry.relativePath, { status: 'practiced' });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private jdFromEntry(entry: { relativePath: string; frontmatter: Record<string, unknown> }): JobDescription {
    const fm = entry.frontmatter;
    const note = this.adapter.readNote(entry.relativePath);
    // Body after the title heading is the raw_text
    let rawText = '';
    if (note) {
      // Strip the leading "# Title\n\n" to get raw_text
      rawText = note.body.replace(/^# .+\n\n/, '').trim();
    }
    return {
      id: fm.id as string,
      title: fm.title as string,
      company: (fm.company as string) ?? null,
      raw_text: rawText,
      requirements: (fm.requirements as string) ?? null,
      seniority_level: (fm.seniority_level as string) ?? null,
      created_at: fm.created_at as string,
    };
  }

  private sessionFromEntry(entry: { relativePath: string; frontmatter: Record<string, unknown> }): Session {
    const fm = entry.frontmatter;
    const note = this.adapter.readNote(entry.relativePath);

    // Extract plan from body
    let plan: string | null = null;
    let overallFeedback: string | null = null;
    if (note) {
      const planMatch = note.body.match(/## Plan\n\n([\s\S]*?)(?=\n## Debrief)/);
      if (planMatch && planMatch[1].trim()) {
        plan = planMatch[1].trim();
      }

      const debriefMatch = note.body.match(/## Debrief\n\n(?:\*\*Overall Score:\*\* \d+\/5\n\n)?([\s\S]*?)$/);
      if (debriefMatch && debriefMatch[1].trim()) {
        overallFeedback = debriefMatch[1].trim();
      }
    }

    return {
      id: fm.id as string,
      jd_id: fm.jd_id as string,
      status: fm.status as string,
      plan,
      overall_score: fm.overall_score != null ? Number(fm.overall_score) : null,
      overall_feedback: overallFeedback,
      created_at: fm.created_at as string,
      completed_at: (fm.completed_at as string) ?? null,
    };
  }

  private roundFromEntry(entry: { relativePath: string; frontmatter: Record<string, unknown> }): Round {
    const fm = entry.frontmatter;
    const note = this.adapter.readNote(entry.relativePath);
    let questions: string | null = null;
    if (note) {
      const qMatch = note.body.match(/## Questions\n\n([\s\S]*?)(?=\n## Exchanges)/);
      if (qMatch && qMatch[1].trim()) {
        questions = qMatch[1].trim();
      }
    }
    return {
      id: fm.id as string,
      session_id: fm.session_id as string,
      round_number: fm.round_number as number,
      type: fm.round_type as string,
      title: fm.title as string,
      status: fm.status as string,
      questions,
      started_at: (fm.started_at as string) ?? null,
      completed_at: (fm.completed_at as string) ?? null,
    };
  }

  private drillFromEntry(entry: { relativePath: string; frontmatter: Record<string, unknown> }): Drill {
    const fm = entry.frontmatter;
    const note = this.adapter.readNote(entry.relativePath);
    let exerciseText = '';
    if (note) {
      exerciseText = note.body.replace(/^# .+\n\n/, '').trim();
    }
    return {
      id: fm.id as string,
      session_id: fm.session_id as string,
      round_id: (fm.round_id as string) ?? null,
      dimension: fm.dimension as string,
      exercise_text: exerciseText,
      priority: fm.priority as number,
      status: fm.status as string,
      created_at: fm.created_at as string,
    };
  }
}
