import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HermesDB } from '../database.js';
import fs from 'fs';
import path from 'path';

const TEST_DB_PATH = path.join(__dirname, 'test-hermes.db');

describe('HermesDB', () => {
  let db: HermesDB;

  beforeEach(() => {
    db = new HermesDB(TEST_DB_PATH);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    const wal = TEST_DB_PATH + '-wal';
    const shm = TEST_DB_PATH + '-shm';
    if (fs.existsSync(wal)) fs.unlinkSync(wal);
    if (fs.existsSync(shm)) fs.unlinkSync(shm);
  });

  it('should create all 6 tables on initialization', () => {
    const tables = db.listTables();
    expect(tables).toContain('job_descriptions');
    expect(tables).toContain('sessions');
    expect(tables).toContain('rounds');
    expect(tables).toContain('exchanges');
    expect(tables).toContain('scores');
    expect(tables).toContain('drills');
  });

  it('should create and retrieve a job description', () => {
    const jd = db.createJobDescription(
      'Senior Software Engineer',
      'We are looking for a senior engineer...',
      'Acme Corp',
      'TypeScript, Node.js, SQL',
      'senior'
    );
    expect(jd.id).toBeDefined();
    expect(jd.title).toBe('Senior Software Engineer');
    expect(jd.company).toBe('Acme Corp');
    expect(jd.raw_text).toBe('We are looking for a senior engineer...');
    expect(jd.requirements).toBe('TypeScript, Node.js, SQL');
    expect(jd.seniority_level).toBe('senior');

    const fetched = db.getJobDescription(jd.id);
    expect(fetched).toBeDefined();
    expect(fetched!.title).toBe('Senior Software Engineer');

    const all = db.getAllJobDescriptions();
    expect(all).toHaveLength(1);
  });

  it('should create a session linked to a JD', () => {
    const jd = db.createJobDescription('Frontend Engineer', 'React developer role');
    const session = db.createSession(jd.id);
    expect(session.id).toBeDefined();
    expect(session.jd_id).toBe(jd.id);
    expect(session.status).toBe('planning');
    expect(session.plan).toBeNull();
    expect(session.overall_score).toBeNull();

    const fetched = db.getSession(session.id);
    expect(fetched).toBeDefined();
    expect(fetched!.jd_id).toBe(jd.id);

    const active = db.getActiveSession();
    expect(active).toBeDefined();
    expect(active!.id).toBe(session.id);
  });

  it('should create rounds for a session and verify ordering', () => {
    const jd = db.createJobDescription('Backend Engineer', 'Node.js backend role');
    const session = db.createSession(jd.id);

    const round1 = db.createRound(session.id, 1, 'experience_screen', 'Experience Screen');
    const round2 = db.createRound(session.id, 2, 'technical', 'Technical Round');
    const round3 = db.createRound(session.id, 3, 'behavioral', 'Behavioral Round');

    expect(round1.round_number).toBe(1);
    expect(round1.type).toBe('experience_screen');
    expect(round1.status).toBe('pending');

    const rounds = db.getSessionRounds(session.id);
    expect(rounds).toHaveLength(3);
    expect(rounds[0].round_number).toBe(1);
    expect(rounds[1].round_number).toBe(2);
    expect(rounds[2].round_number).toBe(3);
  });

  it('should track round status transitions with timestamps', () => {
    const jd = db.createJobDescription('Staff Engineer', 'Staff engineering role');
    const session = db.createSession(jd.id);
    const round = db.createRound(session.id, 1, 'technical', 'Technical Interview');

    expect(round.status).toBe('pending');
    expect(round.started_at).toBeNull();
    expect(round.completed_at).toBeNull();

    db.updateRoundStatus(round.id, 'active');
    const activeRound = db.getRound(round.id);
    expect(activeRound!.status).toBe('active');
    expect(activeRound!.started_at).not.toBeNull();
    expect(activeRound!.completed_at).toBeNull();

    db.updateRoundStatus(round.id, 'completed');
    const completedRound = db.getRound(round.id);
    expect(completedRound!.status).toBe('completed');
    expect(completedRound!.completed_at).not.toBeNull();
  });

  it('should create exchanges and record answers with voice_transcription source', () => {
    const jd = db.createJobDescription('Data Engineer', 'Data pipeline role');
    const session = db.createSession(jd.id);
    const round = db.createRound(session.id, 1, 'technical', 'Technical Screen');

    const exchange = db.createExchange(round.id, 1, 'Tell me about a complex system you built.');
    expect(exchange.id).toBeDefined();
    expect(exchange.round_id).toBe(round.id);
    expect(exchange.sequence).toBe(1);
    expect(exchange.question_text).toBe('Tell me about a complex system you built.');
    expect(exchange.answer_text).toBeNull();
    expect(exchange.answer_source).toBeNull();

    db.recordAnswer(exchange.id, 'I built a distributed pipeline...', 'voice_transcription');
    const updated = db.getExchange(exchange.id);
    expect(updated!.answer_text).toBe('I built a distributed pipeline...');
    expect(updated!.answer_source).toBe('voice_transcription');

    const exchanges = db.getRoundExchanges(round.id);
    expect(exchanges).toHaveLength(1);

    const latest = db.getLatestExchange(round.id);
    expect(latest).toBeDefined();
    expect(latest!.id).toBe(exchange.id);
  });

  it('should create scores for a round and verify dimension ordering', () => {
    const jd = db.createJobDescription('ML Engineer', 'Machine learning role');
    const session = db.createSession(jd.id);
    const round = db.createRound(session.id, 1, 'technical', 'Technical Assessment');

    const score1 = db.createScore(round.id, 'problem_solving', 4, 'Strong decomposition skills');
    const score2 = db.createScore(round.id, 'communication', 3, 'Could be clearer');
    const score3 = db.createScore(round.id, 'technical_depth', 5, 'Excellent depth');

    expect(score1.score).toBe(4);
    expect(score1.dimension).toBe('problem_solving');
    expect(score2.score).toBe(3);
    expect(score3.score).toBe(5);

    const scores = db.getRoundScores(round.id);
    expect(scores).toHaveLength(3);

    const byDimension = db.getScoresByDimension('technical_depth');
    expect(byDimension).toHaveLength(1);
    expect(byDimension[0].score).toBe(5);
  });

  it('should create and manage drills', () => {
    const jd = db.createJobDescription('DevOps Engineer', 'Infrastructure role');
    const session = db.createSession(jd.id);
    const round = db.createRound(session.id, 1, 'technical', 'Technical Round');

    const drill = db.createDrill(
      session.id,
      'system_design',
      'Practice designing a distributed cache system',
      1,
      round.id
    );

    expect(drill.id).toBeDefined();
    expect(drill.session_id).toBe(session.id);
    expect(drill.round_id).toBe(round.id);
    expect(drill.dimension).toBe('system_design');
    expect(drill.priority).toBe(1);
    expect(drill.status).toBe('pending');

    db.completeDrill(drill.id);
    const completed = db.getDrill(drill.id);
    expect(completed!.status).toBe('practiced');
  });

  it('should filter drills by dimension and status', () => {
    const jd = db.createJobDescription('Security Engineer', 'Security role');
    const session = db.createSession(jd.id);

    db.createDrill(session.id, 'communication', 'Practice STAR method', 2);
    db.createDrill(session.id, 'communication', 'Practice concise answers', 1);
    db.createDrill(session.id, 'technical_depth', 'Study system design patterns', 1);

    const commDrills = db.getDrills({ dimension: 'communication' });
    expect(commDrills).toHaveLength(2);

    const allPending = db.getDrills({ status: 'pending' });
    expect(allPending).toHaveLength(3);

    // Complete one drill, then filter by practiced
    db.completeDrill(commDrills[0].id);
    const practiced = db.getDrills({ status: 'practiced' });
    expect(practiced).toHaveLength(1);

    const commPending = db.getDrills({ dimension: 'communication', status: 'pending' });
    expect(commPending).toHaveLength(1);
  });

  it('should get next pending round skipping completed ones', () => {
    const jd = db.createJobDescription('Product Manager', 'PM role');
    const session = db.createSession(jd.id);

    const round1 = db.createRound(session.id, 1, 'experience_screen', 'Intro Screen');
    db.createRound(session.id, 2, 'behavioral', 'Behavioral Round');
    db.createRound(session.id, 3, 'hiring_manager', 'HM Round');

    // Complete round 1
    db.updateRoundStatus(round1.id, 'active');
    db.updateRoundStatus(round1.id, 'completed');

    const next = db.getNextPendingRound(session.id);
    expect(next).toBeDefined();
    expect(next!.round_number).toBe(2);
    expect(next!.type).toBe('behavioral');
  });

  it('should update session debrief with overall score and feedback', () => {
    const jd = db.createJobDescription('QA Engineer', 'Quality assurance role');
    const session = db.createSession(jd.id);

    db.updateSessionDebrief(session.id, 3.8, 'Good overall performance, needs improvement in communication.');
    const updated = db.getSession(session.id);
    expect(updated!.overall_score).toBe(3.8);
    expect(updated!.overall_feedback).toBe('Good overall performance, needs improvement in communication.');

    // Also test status update to completed sets completed_at
    db.updateSessionStatus(session.id, 'completed');
    const completed = db.getSession(session.id);
    expect(completed!.status).toBe('completed');
    expect(completed!.completed_at).not.toBeNull();

    const completedSessions = db.getCompletedSessions();
    expect(completedSessions).toHaveLength(1);
  });
});
