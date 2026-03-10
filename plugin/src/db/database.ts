import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

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

// ── Schema (inlined for reliable resolution across module systems) ───────────

const SCHEMA = `
CREATE TABLE IF NOT EXISTS job_descriptions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  company TEXT,
  raw_text TEXT NOT NULL,
  requirements TEXT,
  seniority_level TEXT CHECK (seniority_level IN ('junior', 'mid', 'senior', 'staff', 'lead')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  jd_id TEXT NOT NULL REFERENCES job_descriptions(id),
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'approved', 'in_progress', 'completed')),
  plan TEXT,
  overall_score REAL,
  overall_feedback TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS rounds (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  round_number INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('experience_screen', 'technical', 'behavioral', 'culture_fit', 'hiring_manager')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'scored', 'skipped')),
  questions TEXT,
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS exchanges (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES rounds(id),
  sequence INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  answer_text TEXT,
  answer_source TEXT CHECK (answer_source IN ('text', 'voice_transcription')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scores (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES rounds(id),
  dimension TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  evidence TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drills (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  round_id TEXT REFERENCES rounds(id),
  dimension TEXT NOT NULL,
  exercise_text TEXT NOT NULL,
  priority INTEGER NOT NULL CHECK (priority BETWEEN 1 AND 3),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'practiced')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_jd ON sessions(jd_id);
CREATE INDEX IF NOT EXISTS idx_rounds_session ON rounds(session_id);
CREATE INDEX IF NOT EXISTS idx_exchanges_round ON exchanges(round_id);
CREATE INDEX IF NOT EXISTS idx_scores_round ON scores(round_id);
CREATE INDEX IF NOT EXISTS idx_scores_dimension ON scores(dimension);
CREATE INDEX IF NOT EXISTS idx_drills_session ON drills(session_id);
CREATE INDEX IF NOT EXISTS idx_drills_dimension ON drills(dimension);
`;

// ── HermesDB ─────────────────────────────────────────────────────────────────

export class HermesDB {
  private db: Database.Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.db.exec(SCHEMA);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  close(): void {
    this.db.close();
  }

  // ── Introspection ───────────────────────────────────────────────────────

  listTables(): string[] {
    const rows = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    return rows.map((r) => r.name);
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
    this.db
      .prepare(
        'INSERT INTO job_descriptions (id, title, company, raw_text, requirements, seniority_level, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(id, title, company ?? null, rawText, requirements ?? null, seniorityLevel ?? null, now);
    return this.getJobDescription(id)!;
  }

  getJobDescription(id: string): JobDescription | undefined {
    return this.db
      .prepare('SELECT * FROM job_descriptions WHERE id = ?')
      .get(id) as JobDescription | undefined;
  }

  getAllJobDescriptions(): JobDescription[] {
    return this.db
      .prepare('SELECT * FROM job_descriptions ORDER BY created_at DESC')
      .all() as JobDescription[];
  }

  // ── Sessions ────────────────────────────────────────────────────────────

  createSession(jdId: string): Session {
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO sessions (id, jd_id, status, created_at) VALUES (?, ?, 'planning', ?)"
      )
      .run(id, jdId, now);
    return this.getSession(id)!;
  }

  getSession(id: string): Session | undefined {
    return this.db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(id) as Session | undefined;
  }

  getActiveSession(): Session | undefined {
    return this.db
      .prepare(
        "SELECT * FROM sessions WHERE status IN ('planning', 'approved', 'in_progress') ORDER BY created_at DESC LIMIT 1"
      )
      .get() as Session | undefined;
  }

  updateSessionStatus(id: string, status: string): void {
    const now = new Date().toISOString();
    if (status === 'completed') {
      this.db
        .prepare('UPDATE sessions SET status = ?, completed_at = ? WHERE id = ?')
        .run(status, now, id);
    } else {
      this.db
        .prepare('UPDATE sessions SET status = ? WHERE id = ?')
        .run(status, id);
    }
  }

  updateSessionPlan(id: string, plan: string): void {
    this.db
      .prepare('UPDATE sessions SET plan = ? WHERE id = ?')
      .run(plan, id);
  }

  updateSessionDebrief(id: string, overallScore: number, overallFeedback: string): void {
    this.db
      .prepare('UPDATE sessions SET overall_score = ?, overall_feedback = ? WHERE id = ?')
      .run(overallScore, overallFeedback, id);
  }

  getCompletedSessions(limit?: number): Session[] {
    if (limit !== undefined) {
      return this.db
        .prepare(
          "SELECT * FROM sessions WHERE status = 'completed' ORDER BY completed_at DESC LIMIT ?"
        )
        .all(limit) as Session[];
    }
    return this.db
      .prepare(
        "SELECT * FROM sessions WHERE status = 'completed' ORDER BY completed_at DESC"
      )
      .all() as Session[];
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
    this.db
      .prepare(
        "INSERT INTO rounds (id, session_id, round_number, type, title, status, questions) VALUES (?, ?, ?, ?, ?, 'pending', ?)"
      )
      .run(id, sessionId, roundNumber, type, title, questions ?? null);
    return this.getRound(id)!;
  }

  getRound(id: string): Round | undefined {
    return this.db
      .prepare('SELECT * FROM rounds WHERE id = ?')
      .get(id) as Round | undefined;
  }

  getSessionRounds(sessionId: string): Round[] {
    return this.db
      .prepare('SELECT * FROM rounds WHERE session_id = ? ORDER BY round_number ASC')
      .all(sessionId) as Round[];
  }

  getNextPendingRound(sessionId: string): Round | undefined {
    return this.db
      .prepare(
        "SELECT * FROM rounds WHERE session_id = ? AND status = 'pending' ORDER BY round_number ASC LIMIT 1"
      )
      .get(sessionId) as Round | undefined;
  }

  getActiveRound(sessionId: string): Round | undefined {
    return this.db
      .prepare(
        "SELECT * FROM rounds WHERE session_id = ? AND status = 'active' LIMIT 1"
      )
      .get(sessionId) as Round | undefined;
  }

  updateRoundStatus(id: string, status: string): void {
    const now = new Date().toISOString();
    if (status === 'active') {
      this.db
        .prepare('UPDATE rounds SET status = ?, started_at = ? WHERE id = ?')
        .run(status, now, id);
    } else if (status === 'completed' || status === 'scored') {
      this.db
        .prepare('UPDATE rounds SET status = ?, completed_at = ? WHERE id = ?')
        .run(status, now, id);
    } else {
      this.db
        .prepare('UPDATE rounds SET status = ? WHERE id = ?')
        .run(status, id);
    }
  }

  // ── Exchanges ───────────────────────────────────────────────────────────

  createExchange(roundId: string, sequence: number, questionText: string): Exchange {
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO exchanges (id, round_id, sequence, question_text, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(id, roundId, sequence, questionText, now);
    return this.getExchange(id)!;
  }

  getExchange(id: string): Exchange | undefined {
    return this.db
      .prepare('SELECT * FROM exchanges WHERE id = ?')
      .get(id) as Exchange | undefined;
  }

  getRoundExchanges(roundId: string): Exchange[] {
    return this.db
      .prepare('SELECT * FROM exchanges WHERE round_id = ? ORDER BY sequence ASC')
      .all(roundId) as Exchange[];
  }

  getLatestExchange(roundId: string): Exchange | undefined {
    return this.db
      .prepare(
        'SELECT * FROM exchanges WHERE round_id = ? ORDER BY sequence DESC LIMIT 1'
      )
      .get(roundId) as Exchange | undefined;
  }

  recordAnswer(exchangeId: string, answerText: string, source: string): void {
    this.db
      .prepare('UPDATE exchanges SET answer_text = ?, answer_source = ? WHERE id = ?')
      .run(answerText, source, exchangeId);
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
    this.db
      .prepare(
        'INSERT INTO scores (id, round_id, dimension, score, evidence, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(id, roundId, dimension, score, evidence ?? null, now);
    return this.getScore(id)!;
  }

  getScore(id: string): Score | undefined {
    return this.db
      .prepare('SELECT * FROM scores WHERE id = ?')
      .get(id) as Score | undefined;
  }

  getRoundScores(roundId: string): Score[] {
    return this.db
      .prepare('SELECT * FROM scores WHERE round_id = ? ORDER BY dimension ASC')
      .all(roundId) as Score[];
  }

  getScoresByDimension(dimension: string, limit?: number): Score[] {
    if (limit !== undefined) {
      return this.db
        .prepare(
          'SELECT * FROM scores WHERE dimension = ? ORDER BY created_at DESC LIMIT ?'
        )
        .all(dimension, limit) as Score[];
    }
    return this.db
      .prepare('SELECT * FROM scores WHERE dimension = ? ORDER BY created_at DESC')
      .all(dimension) as Score[];
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
    this.db
      .prepare(
        "INSERT INTO drills (id, session_id, round_id, dimension, exercise_text, priority, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)"
      )
      .run(id, sessionId, roundId ?? null, dimension, exerciseText, priority, now);
    return this.getDrill(id)!;
  }

  getDrill(id: string): Drill | undefined {
    return this.db
      .prepare('SELECT * FROM drills WHERE id = ?')
      .get(id) as Drill | undefined;
  }

  getDrills(filters?: { dimension?: string; status?: string }): Drill[] {
    if (!filters || (filters.dimension === undefined && filters.status === undefined)) {
      return this.db
        .prepare('SELECT * FROM drills ORDER BY priority ASC, created_at ASC')
        .all() as Drill[];
    }

    if (filters.dimension !== undefined && filters.status !== undefined) {
      return this.db
        .prepare(
          'SELECT * FROM drills WHERE dimension = ? AND status = ? ORDER BY priority ASC, created_at ASC'
        )
        .all(filters.dimension, filters.status) as Drill[];
    }

    if (filters.dimension !== undefined) {
      return this.db
        .prepare(
          'SELECT * FROM drills WHERE dimension = ? ORDER BY priority ASC, created_at ASC'
        )
        .all(filters.dimension) as Drill[];
    }

    return this.db
      .prepare(
        'SELECT * FROM drills WHERE status = ? ORDER BY priority ASC, created_at ASC'
      )
      .all(filters.status!) as Drill[];
  }

  completeDrill(id: string): void {
    this.db
      .prepare("UPDATE drills SET status = 'practiced' WHERE id = ?")
      .run(id);
  }
}
