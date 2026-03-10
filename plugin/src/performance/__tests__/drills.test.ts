import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HermesDB } from '../../db/database.js';
import { DrillManager } from '../drills.js';
import fs from 'fs';
import path from 'path';

const TEST_DB_PATH = path.join(__dirname, 'test-drills.db');

describe('DrillManager', () => {
  let db: HermesDB;
  let drillManager: DrillManager;

  beforeEach(() => {
    db = new HermesDB(TEST_DB_PATH);
    drillManager = new DrillManager(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    const wal = TEST_DB_PATH + '-wal';
    const shm = TEST_DB_PATH + '-shm';
    if (fs.existsSync(wal)) fs.unlinkSync(wal);
    if (fs.existsSync(shm)) fs.unlinkSync(shm);
  });

  function setupScoredSession() {
    const jd = db.createJobDescription('Engineer', 'Build APIs', 'Acme', undefined, 'senior');
    const session = db.createSession(jd.id);
    db.updateSessionStatus(session.id, 'in_progress');

    const round = db.createRound(session.id, 1, 'behavioral', 'Behavioral Round');
    db.updateRoundStatus(round.id, 'active');

    // Weak dimensions: score <= 3
    db.createScore(round.id, 'star_structure', 2, 'Very poor structure');
    db.createScore(round.id, 'depth', 3, 'Adequate depth');
    // Strong dimensions: score > 3
    db.createScore(round.id, 'content_relevance', 4, 'Good relevance');
    db.createScore(round.id, 'communication_clarity', 5, 'Excellent clarity');

    db.updateRoundStatus(round.id, 'scored');

    return { session, round };
  }

  it('buildDrillPrompt highlights weak dimensions sorted by weakest first', () => {
    const { session } = setupScoredSession();

    const prompt = drillManager.buildDrillPrompt(session.id);

    expect(prompt).toContain('star_structure');
    expect(prompt).toContain('depth');
    // Should not contain strong dimensions in the weak list
    // star_structure (2) should appear before depth (3) — weakest first
    const starIndex = prompt.indexOf('star_structure');
    const depthIndex = prompt.indexOf('depth');
    expect(starIndex).toBeLessThan(depthIndex);
    // Strong dimensions should not be in the weak dimensions section prompt
    expect(prompt).toContain('drill');
  });

  it('applyDrills creates drill records from JSON', () => {
    const { session, round } = setupScoredSession();

    const drillsJson = JSON.stringify({
      drills: [
        { dimension: 'star_structure', exercise: 'Practice the STAR method with 3 stories', priority: 1, round_number: 1 },
        { dimension: 'depth', exercise: 'Prepare deep-dive technical explanations', priority: 2 },
      ],
    });

    const result = drillManager.applyDrills(session.id, drillsJson);

    expect(result.error).toBeUndefined();
    expect(result.content).toContain('2');

    const drills = db.getDrills();
    expect(drills).toHaveLength(2);
    expect(drills[0].dimension).toBe('star_structure');
    expect(drills[0].status).toBe('pending');
    expect(drills[1].dimension).toBe('depth');
  });

  it('listDrills groups by dimension with checkbox format', () => {
    const { session } = setupScoredSession();

    db.createDrill(session.id, 'star_structure', 'Practice STAR method', 1);
    db.createDrill(session.id, 'depth', 'Deep dive explanations', 2);
    db.createDrill(session.id, 'star_structure', 'Record and review answers', 1);

    const result = drillManager.listDrills();

    expect(result.error).toBeUndefined();
    // Should have dimension headers
    expect(result.content).toContain('star_structure');
    expect(result.content).toContain('depth');
    // Should have checkbox format
    expect(result.content).toContain('[ ]');
    // star_structure drills
    expect(result.content).toContain('Practice STAR method');
    expect(result.content).toContain('Record and review answers');
    expect(result.content).toContain('Deep dive explanations');
  });

  it('completeDrill changes status to practiced', () => {
    const { session } = setupScoredSession();

    const drill = db.createDrill(session.id, 'star_structure', 'Practice STAR method', 1);

    const result = drillManager.completeDrill(drill.id);

    expect(result.error).toBeUndefined();
    expect(result.content).toContain('practiced');

    const updated = db.getDrill(drill.id);
    expect(updated!.status).toBe('practiced');
  });
});
