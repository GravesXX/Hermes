import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HermesDB } from '../../db/database.js';
import { Conductor } from '../conductor.js';
import fs from 'fs';
import path from 'path';

const TEST_DB_PATH = path.join(__dirname, 'test-conductor.db');

describe('Conductor', () => {
  let db: HermesDB;
  let conductor: Conductor;

  beforeEach(() => {
    db = new HermesDB(TEST_DB_PATH);
    conductor = new Conductor(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    const wal = TEST_DB_PATH + '-wal';
    const shm = TEST_DB_PATH + '-shm';
    if (fs.existsSync(wal)) fs.unlinkSync(wal);
    if (fs.existsSync(shm)) fs.unlinkSync(shm);
  });

  function setupSession() {
    const jd = db.createJobDescription('Engineer', 'JD text');
    const session = db.createSession(jd.id);
    db.updateSessionStatus(session.id, 'approved');
    db.createRound(session.id, 1, 'experience_screen', 'Experience Screen');
    db.createRound(session.id, 2, 'technical', 'Technical');
    return session;
  }

  // Test 1: startRound starts next pending round, sets active, updates session to in_progress
  it('startRound starts next pending round, sets active, updates session to in_progress', () => {
    const session = setupSession();

    const result = conductor.startRound(session.id);

    expect(result.error).toBeUndefined();
    expect(result.content).toContain('Experience Screen');

    const rounds = db.getSessionRounds(session.id);
    expect(rounds[0].status).toBe('active');
    expect(rounds[1].status).toBe('pending');

    const updatedSession = db.getSession(session.id);
    expect(updatedSession!.status).toBe('in_progress');
  });

  // Test 2: startRound can start a specific round by number
  it('startRound can start a specific round by number', () => {
    const session = setupSession();

    const result = conductor.startRound(session.id, 2);

    expect(result.error).toBeUndefined();
    expect(result.content).toContain('Technical');

    const rounds = db.getSessionRounds(session.id);
    const round2 = rounds.find((r) => r.round_number === 2);
    expect(round2!.status).toBe('active');
  });

  // Test 3: recordAnswer records answer on latest exchange
  it('recordAnswer records answer on latest exchange', () => {
    const session = setupSession();
    conductor.startRound(session.id);

    const rounds = db.getSessionRounds(session.id);
    const activeRound = rounds.find((r) => r.status === 'active')!;

    db.createExchange(activeRound.id, 1, 'Tell me about yourself.');

    const result = conductor.recordAnswer(activeRound.id, 'I am an experienced engineer.', 'text');

    expect(result.error).toBeUndefined();
    expect(result.content).toContain('1');

    const exchanges = db.getRoundExchanges(activeRound.id);
    expect(exchanges[0].answer_text).toBe('I am an experienced engineer.');
    expect(exchanges[0].answer_source).toBe('text');
  });

  // Test 4: completeRound sets status to completed
  it('completeRound sets round status to completed', () => {
    const session = setupSession();
    conductor.startRound(session.id);

    const rounds = db.getSessionRounds(session.id);
    const activeRound = rounds.find((r) => r.status === 'active')!;

    const result = conductor.completeRound(activeRound.id);

    expect(result.error).toBeUndefined();

    const updatedRound = db.getRound(activeRound.id);
    expect(updatedRound!.status).toBe('completed');
  });

  // Test 5: skipRound sets status to skipped
  it('skipRound sets round status to skipped', () => {
    const session = setupSession();

    const rounds = db.getSessionRounds(session.id);
    const pendingRound = rounds[0];

    const result = conductor.skipRound(pendingRound.id);

    expect(result.error).toBeUndefined();

    const updatedRound = db.getRound(pendingRound.id);
    expect(updatedRound!.status).toBe('skipped');
  });

  // Test 6: buildConductPrompt contains round type, JD context, interview rules, exchange history
  it('buildConductPrompt contains round type, JD context, interview rules, and exchange history', () => {
    const jd = db.createJobDescription('Staff Engineer', 'Build distributed systems.', 'BigCo', 'Go, Kubernetes', 'staff');
    const session = db.createSession(jd.id);
    db.updateSessionStatus(session.id, 'approved');
    const round = db.createRound(session.id, 1, 'technical', 'Technical Deep Dive');
    db.updateRoundStatus(round.id, 'active');

    db.createExchange(round.id, 1, 'Describe a distributed system you built.');

    const prompt = conductor.buildConductPrompt(round.id);

    expect(prompt).toContain('Staff Engineer');
    expect(prompt).toContain('BigCo');
    expect(prompt).toContain('staff');
    expect(prompt).toContain('technical');
    expect(prompt).toContain('Technical Deep Dive');
    expect(prompt).toContain('Describe a distributed system you built.');
    // Interview rules
    expect(prompt).toContain('STAR');
    expect(prompt).toContain('seniority');
  });

  // Test 7: getSessionStatus shows all rounds with statuses
  it('getSessionStatus shows all rounds with statuses', () => {
    const session = setupSession();
    conductor.startRound(session.id);

    const result = conductor.getSessionStatus(session.id);

    expect(result.error).toBeUndefined();
    expect(result.content).toContain('Experience Screen');
    expect(result.content).toContain('Technical');
    expect(result.content).toContain('active');
    expect(result.content).toContain('pending');
  });
});
