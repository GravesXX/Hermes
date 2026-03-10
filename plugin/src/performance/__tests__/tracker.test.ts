import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HermesDB } from '../../db/database.js';
import { Tracker } from '../tracker.js';
import { DIMENSIONS } from '../../interview/evaluator.js';
import fs from 'fs';
import path from 'path';

const TEST_DB_PATH = path.join(__dirname, 'test-tracker.db');

describe('Tracker', () => {
  let db: HermesDB;
  let tracker: Tracker;

  beforeEach(() => {
    db = new HermesDB(TEST_DB_PATH);
    tracker = new Tracker(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    const wal = TEST_DB_PATH + '-wal';
    const shm = TEST_DB_PATH + '-shm';
    if (fs.existsSync(wal)) fs.unlinkSync(wal);
    if (fs.existsSync(shm)) fs.unlinkSync(shm);
  });

  it('returns session history with scores', () => {
    const jd = db.createJobDescription('Staff Engineer', 'Build distributed systems', 'Acme', undefined, 'staff');
    const session = db.createSession(jd.id);
    db.updateSessionStatus(session.id, 'in_progress');

    const round = db.createRound(session.id, 1, 'behavioral', 'Behavioral Round');
    db.updateRoundStatus(round.id, 'active');
    db.updateRoundStatus(round.id, 'scored');

    // Add scores for the round
    db.createScore(round.id, 'content_relevance', 4, 'Good relevance');
    db.createScore(round.id, 'star_structure', 3, 'Adequate structure');

    // Complete the session with a debrief
    db.updateSessionDebrief(session.id, 3.5, 'Solid performance overall.');
    db.updateSessionStatus(session.id, 'completed');

    const result = tracker.getHistory();

    expect(result.error).toBeUndefined();
    expect(result.content).toContain('Staff Engineer');
    expect(result.content).toContain('Acme');
    expect(result.content).toContain('3.5');
    expect(result.content).toContain('Behavioral Round');
  });

  it('returns dimension trend as improving when scores go up', async () => {
    // Session 1: star_structure score 2 (older)
    const jd1 = db.createJobDescription('Engineer', 'Build APIs', 'Corp A');
    const session1 = db.createSession(jd1.id);
    db.updateSessionStatus(session1.id, 'in_progress');
    const round1 = db.createRound(session1.id, 1, 'behavioral', 'Round 1');
    db.updateRoundStatus(round1.id, 'active');
    db.updateRoundStatus(round1.id, 'scored');
    db.createScore(round1.id, 'star_structure', 2, 'Weak structure');
    db.updateSessionDebrief(session1.id, 2.0, 'Needs improvement');
    db.updateSessionStatus(session1.id, 'completed');

    // Ensure different timestamps so ordering is deterministic
    await new Promise((resolve) => setTimeout(resolve, 5));

    // Session 2: star_structure score 4 (newer)
    const jd2 = db.createJobDescription('Engineer', 'Build APIs', 'Corp B');
    const session2 = db.createSession(jd2.id);
    db.updateSessionStatus(session2.id, 'in_progress');
    const round2 = db.createRound(session2.id, 1, 'behavioral', 'Round 2');
    db.updateRoundStatus(round2.id, 'active');
    db.updateRoundStatus(round2.id, 'scored');
    db.createScore(round2.id, 'star_structure', 4, 'Much better');
    db.updateSessionDebrief(session2.id, 4.0, 'Great improvement');
    db.updateSessionStatus(session2.id, 'completed');

    const result = tracker.getDimensionTrend('star_structure');

    expect(result.error).toBeUndefined();
    expect(result.content).toContain('star_structure');
    expect(result.content).toContain('improving');
    expect(result.content).toContain('2');
    expect(result.content).toContain('4');
  });

  it('handles empty history gracefully', () => {
    const result = tracker.getHistory();

    expect(result.error).toBeUndefined();
    expect(result.content).toContain('No completed sessions yet');
  });
});
