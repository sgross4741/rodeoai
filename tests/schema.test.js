import { describe, it, expect } from 'vitest';
import { validateAnalysis, extractJson } from '../src/schema.js';
import { validAnalysis } from './helpers.js';

const ctx = { isRoughstock: true, duration: 8 };

describe('validateAnalysis', () => {
  it('accepts a valid response and cleans it', () => {
    const r = validateAnalysis(validAnalysis(), ctx);
    expect(r.ok).toBe(true);
    expect(r.value.riderScore).toBe(72);
    expect(r.value.keyMoments.map((m) => m.timestamp)).toEqual([1.5, 4.25]); // sorted
  });

  it.each([
    ['riderScore above 100', (a) => { a.riderScore = 140; }],
    ['riderScore as a string', (a) => { a.riderScore = '80'; }],
    ['missing breakdown key', (a) => { delete a.breakdown.timing; }],
    ['negative breakdown', (a) => { a.breakdown.form = -1; }],
    ['bad confidence', (a) => { a.confidence = 'very high'; }],
    ['empty feedback', (a) => { a.techniqueFeedback = []; }],
    ['plan item missing field', (a) => { delete a.conditioningPlan[0].sets_reps; }],
    ['keyMoments not an array', (a) => { a.keyMoments = {}; }],
    ['key moment with string timestamp', (a) => { a.keyMoments[0].timestamp = '4s'; }],
    ['limitations missing', (a) => { delete a.limitations; }],
    ['animalScore out of range', (a) => { a.animalScore = 101; }],
  ])('rejects %s', (_, mutate) => {
    const a = validAnalysis();
    mutate(a);
    const r = validateAnalysis(a, ctx);
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('rejects non-objects', () => {
    expect(validateAnalysis(null, ctx).ok).toBe(false);
    expect(validateAnalysis([], ctx).ok).toBe(false);
  });

  it('forces animalScore to null for timed events', () => {
    const r = validateAnalysis(validAnalysis(), { isRoughstock: false, duration: 8 });
    expect(r.ok).toBe(true);
    expect(r.value.animalScore).toBeNull();
    expect(r.notes.join(' ')).toMatch(/animal/i);
  });

  it('allows a null animalScore for roughstock', () => {
    const a = validAnalysis();
    a.animalScore = null;
    expect(validateAnalysis(a, ctx).value.animalScore).toBeNull();
  });

  it('drops key moments outside the video and says so', () => {
    const a = validAnalysis();
    a.keyMoments.push({ timestamp: 30, label: 'Late', note: '' });
    const r = validateAnalysis(a, ctx);
    expect(r.value.keyMoments).toHaveLength(2);
    expect(r.notes.join(' ')).toMatch(/outside the video/);
  });
});

describe('extractJson', () => {
  it('parses plain JSON', () => expect(extractJson('{"a":1}')).toEqual({ a: 1 }));
  it('parses fenced JSON', () => expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 }));
  it('parses JSON with surrounding prose', () => expect(extractJson('Here you go: {"a":3} thanks')).toEqual({ a: 3 }));
  it('throws on garbage', () => expect(() => extractJson('not json at all')).toThrow());
});
