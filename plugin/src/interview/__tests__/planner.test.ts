import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HermesDB } from '../../db/database.js';
import { Planner } from '../planner.js';
import fs from 'fs';
import path from 'path';

const TEST_DB_PATH = path.join(__dirname, 'test-planner.db');

describe('Planner', () => {
  let db: HermesDB;
  let planner: Planner;

  beforeEach(() => {
    db = new HermesDB(TEST_DB_PATH);
    planner = new Planner(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    const wal = TEST_DB_PATH + '-wal';
    const shm = TEST_DB_PATH + '-shm';
    if (fs.existsSync(wal)) fs.unlinkSync(wal);
    if (fs.existsSync(shm)) fs.unlinkSync(shm);
  });

  it('buildPlanPrompt includes JD title, company, seniority, and "3 to 5 interview rounds"', () => {
    const jd = db.createJobDescription(
      'Senior Software Engineer',
      'We are looking for a senior engineer to build scalable systems.',
      'Acme Corp',
      'TypeScript, Node.js, SQL',
      'senior'
    );
    const session = db.createSession(jd.id);

    const prompt = planner.buildPlanPrompt(session.id);

    expect(prompt).toContain('Senior Software Engineer');
    expect(prompt).toContain('Acme Corp');
    expect(prompt).toContain('senior');
    expect(prompt).toContain('3 to 5 interview rounds');
  });

  it('approvePlan parses JSON, creates 3 rounds, and updates session to approved', () => {
    const jd = db.createJobDescription(
      'Backend Engineer',
      'Node.js backend developer needed.',
      'TechCorp',
      'Node.js, PostgreSQL',
      'mid'
    );
    const session = db.createSession(jd.id);

    const planJson = JSON.stringify([
      { type: 'experience_screen', title: 'Experience Screen', rationale: 'Initial screen for background.' },
      { type: 'technical', title: 'Technical Round', rationale: 'Assess coding ability.' },
      { type: 'behavioral', title: 'Behavioral Round', rationale: 'Evaluate soft skills.' },
    ]);

    const result = planner.approvePlan(session.id, planJson);

    expect(result.error).toBeUndefined();
    expect(result.content).toContain('approved');

    const updatedSession = db.getSession(session.id);
    expect(updatedSession!.status).toBe('approved');
    expect(updatedSession!.plan).toBe(planJson);

    const rounds = db.getSessionRounds(session.id);
    expect(rounds).toHaveLength(3);
    expect(rounds[0].round_number).toBe(1);
    expect(rounds[0].type).toBe('experience_screen');
    expect(rounds[0].title).toBe('Experience Screen');
    expect(rounds[1].round_number).toBe(2);
    expect(rounds[1].type).toBe('technical');
    expect(rounds[2].round_number).toBe(3);
    expect(rounds[2].type).toBe('behavioral');
  });

  it('approvePlan rejects if session is not in planning status', () => {
    const jd = db.createJobDescription(
      'Frontend Engineer',
      'React developer role.',
      'WebCo',
      'React, TypeScript',
      'junior'
    );
    const session = db.createSession(jd.id);

    // Move session to approved first
    db.updateSessionStatus(session.id, 'approved');

    const planJson = JSON.stringify([
      { type: 'behavioral', title: 'Behavioral Round', rationale: 'Culture fit check.' },
    ]);

    const result = planner.approvePlan(session.id, planJson);

    expect(result.error).toBeDefined();
    expect(result.error).toContain('planning');
  });
});
