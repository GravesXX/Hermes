import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HermesDB } from '../../db/database.js';
import { Evaluator, DIMENSIONS } from '../evaluator.js';
import fs from 'fs';
import path from 'path';

const TEST_DB_PATH = path.join(__dirname, 'test-evaluator.db');

describe('Evaluator', () => {
  let db: HermesDB;
  let evaluator: Evaluator;

  beforeEach(() => {
    db = new HermesDB(TEST_DB_PATH);
    evaluator = new Evaluator(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    const wal = TEST_DB_PATH + '-wal';
    const shm = TEST_DB_PATH + '-shm';
    if (fs.existsSync(wal)) fs.unlinkSync(wal);
    if (fs.existsSync(shm)) fs.unlinkSync(shm);
  });

  function setupCompletedRound() {
    const jd = db.createJobDescription('Engineer', 'Build APIs', 'Acme', undefined, 'senior');
    const session = db.createSession(jd.id);
    db.updateSessionStatus(session.id, 'in_progress');
    const round = db.createRound(session.id, 1, 'behavioral', 'Behavioral');
    db.updateRoundStatus(round.id, 'active');
    const e1 = db.createExchange(round.id, 1, 'Tell me about a challenge.');
    db.recordAnswer(e1.id, 'I led a database migration that reduced latency by 40%.', 'text');
    const e2 = db.createExchange(round.id, 2, 'How did you handle disagreements?');
    db.recordAnswer(e2.id, 'Um, I usually like try to understand the other person first, and then...', 'voice_transcription');
    db.updateRoundStatus(round.id, 'completed');
    return { session, round };
  }

  // Test 1: DIMENSIONS exports all 7 dimensions
  it('DIMENSIONS exports all 7 dimensions', () => {
    expect(DIMENSIONS).toHaveLength(7);
    expect(DIMENSIONS).toContain('content_relevance');
    expect(DIMENSIONS).toContain('star_structure');
    expect(DIMENSIONS).toContain('communication_clarity');
    expect(DIMENSIONS).toContain('specificity_metrics');
    expect(DIMENSIONS).toContain('depth');
    expect(DIMENSIONS).toContain('confidence_indicators');
    expect(DIMENSIONS).toContain('growth_mindset');
  });

  // Test 2: buildEvaluationPrompt includes exchanges, dimension descriptions, 1-5 scale, voice_transcription notes
  it('buildEvaluationPrompt includes exchanges, dimension descriptions, 1-5 scale, and voice_transcription notes', () => {
    const { round } = setupCompletedRound();

    const prompt = evaluator.buildEvaluationPrompt(round.id);

    // Exchanges content
    expect(prompt).toContain('Tell me about a challenge.');
    expect(prompt).toContain('I led a database migration that reduced latency by 40%.');
    expect(prompt).toContain('How did you handle disagreements?');
    expect(prompt).toContain('Um, I usually like try to understand the other person first');

    // Dimension descriptions
    expect(prompt).toContain('content_relevance');
    expect(prompt).toContain('star_structure');
    expect(prompt).toContain('communication_clarity');
    expect(prompt).toContain('specificity_metrics');
    expect(prompt).toContain('depth');
    expect(prompt).toContain('confidence_indicators');
    expect(prompt).toContain('growth_mindset');

    // 1-5 scoring scale
    expect(prompt).toContain('1');
    expect(prompt).toContain('5');

    // voice_transcription notes
    expect(prompt).toContain('voice_transcription');
  });

  // Test 3: applyScores parses JSON, creates 7 score records, updates round to 'scored'
  it('applyScores parses JSON, creates 7 score records, and updates round to scored', () => {
    const { round } = setupCompletedRound();

    const scoresJson = JSON.stringify({
      scores: [
        { dimension: 'content_relevance', score: 4, evidence: 'Directly addressed the question.' },
        { dimension: 'star_structure', score: 2, evidence: 'Lacked clear Result component.' },
        { dimension: 'communication_clarity', score: 3, evidence: 'Some filler words present.' },
        { dimension: 'specificity_metrics', score: 5, evidence: 'Cited 40% latency reduction.' },
        { dimension: 'depth', score: 3, evidence: 'Adequate but could go deeper.' },
        { dimension: 'confidence_indicators', score: 4, evidence: 'Generally assertive.' },
        { dimension: 'growth_mindset', score: 4, evidence: 'Showed openness to feedback.' },
      ],
    });

    const result = evaluator.applyScores(round.id, scoresJson);

    expect(result.error).toBeUndefined();

    const savedScores = db.getRoundScores(round.id);
    expect(savedScores).toHaveLength(7);

    const updatedRound = db.getRound(round.id);
    expect(updatedRound!.status).toBe('scored');
  });

  // Test 4: buildDebriefPrompt includes round summaries with scores
  it('buildDebriefPrompt includes round summaries with scores', () => {
    const { session, round } = setupCompletedRound();

    // Apply scores first
    const scoresJson = JSON.stringify({
      scores: DIMENSIONS.map((dim, i) => ({
        dimension: dim,
        score: (i % 5) + 1,
        evidence: `Evidence for ${dim}`,
      })),
    });
    evaluator.applyScores(round.id, scoresJson);

    const prompt = evaluator.buildDebriefPrompt(session.id);

    expect(prompt).toContain('Behavioral');
    // Should contain score info
    expect(prompt).toContain('content_relevance');
  });

  // Test 5: computeSessionAverage returns correct average
  it('computeSessionAverage returns correct average', () => {
    const { session, round } = setupCompletedRound();

    const scoresJson = JSON.stringify({
      scores: [
        { dimension: 'content_relevance', score: 4, evidence: 'e1' },
        { dimension: 'star_structure', score: 2, evidence: 'e2' },
        { dimension: 'communication_clarity', score: 3, evidence: 'e3' },
        { dimension: 'specificity_metrics', score: 5, evidence: 'e4' },
        { dimension: 'depth', score: 3, evidence: 'e5' },
        { dimension: 'confidence_indicators', score: 4, evidence: 'e6' },
        { dimension: 'growth_mindset', score: 4, evidence: 'e7' },
      ],
    });
    evaluator.applyScores(round.id, scoresJson);

    // 4+2+3+5+3+4+4 = 25, 25/7 ≈ 3.57
    const avg = evaluator.computeSessionAverage(session.id);
    expect(avg).toBeCloseTo(3.571, 2);
  });
});
