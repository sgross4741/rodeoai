import { describe, it, expect } from 'vitest';
import {
  computeSampleTimes, pickMostProminent, frameGeometry, computeMetrics, stabilityRating, hasCoreLandmarks, variance,
} from '../src/metrics.js';
import { MIN_SAMPLE_FRAMES, MAX_SAMPLE_FRAMES, MIN_FRAME_SPACING_SECONDS, STABILITY_THRESHOLDS } from '../src/thresholds.js';
import { makePose, steadyFrames, wobblyFrames } from './helpers.js';

describe('computeSampleTimes', () => {
  it('samples about 16 frames for an 8-second ride', () => {
    expect(computeSampleTimes(8)).toHaveLength(16);
  });

  it.each([2, 3, 5, 8, 12, 20, 45, 120, 600])('respects min/max count and spacing for %ss', (d) => {
    const ts = computeSampleTimes(d);
    expect(ts.length).toBeGreaterThanOrEqual(MIN_SAMPLE_FRAMES);
    expect(ts.length).toBeLessThanOrEqual(MAX_SAMPLE_FRAMES);
    for (let i = 1; i < ts.length; i++) expect(ts[i] - ts[i - 1]).toBeGreaterThanOrEqual(MIN_FRAME_SPACING_SECONDS - 1e-3);
    expect(ts[0]).toBeGreaterThan(0);
    expect(ts.at(-1)).toBeLessThan(d);
  });

  it('returns nothing for videos too short to sample honestly', () => {
    expect(computeSampleTimes(1.5)).toEqual([]);
    expect(computeSampleTimes(0)).toEqual([]);
    expect(computeSampleTimes(NaN)).toEqual([]);
    expect(computeSampleTimes(Infinity)).toEqual([]);
  });
});

describe('pickMostProminent', () => {
  it('picks the person with the largest bounding box', () => {
    const small = makePose({ torso: 0.05, hipX: 0.2 });
    const big = makePose({ torso: 0.25, hipX: 0.6 });
    const res = pickMostProminent([small, big, small]);
    expect(res.index).toBe(1);
    expect(res.peopleCount).toBe(3);
  });
  it('returns null with no poses', () => {
    expect(pickMostProminent([])).toBeNull();
  });
});

describe('frameGeometry', () => {
  it('measures an upright torso as ~0 degrees', () => {
    expect(frameGeometry(makePose({ leanDeg: 0 })).spineAngleDeg).toBeCloseTo(0, 5);
  });
  it('measures lean direction and size', () => {
    expect(frameGeometry(makePose({ leanDeg: 20 })).spineAngleDeg).toBeCloseTo(20, 3);
    expect(frameGeometry(makePose({ leanDeg: -35 })).spineAngleDeg).toBeCloseTo(-35, 3);
  });
  it('corrects for the video aspect ratio', () => {
    const aspect = 16 / 9;
    const g = frameGeometry(makePose({ leanDeg: 30, aspect }), aspect);
    expect(g.spineAngleDeg).toBeCloseTo(30, 3);
  });
  it('normalizes hip/shoulder differences by torso length (distance-independent)', () => {
    const near = frameGeometry(makePose({ torso: 0.4, hipTilt: 0.04 }));
    const far = frameGeometry(makePose({ torso: 0.1, hipTilt: 0.01 }));
    expect(near.hipYDiff).toBeCloseTo(far.hipYDiff, 6);
  });
  it('rejects frames where shoulders/hips are not visible', () => {
    const p = makePose();
    p[23].visibility = 0.1;
    expect(hasCoreLandmarks(p)).toBe(false);
    expect(frameGeometry(p)).toBeNull();
  });
});

describe('computeMetrics', () => {
  it('reports detectionRate as frames with a usable rider / frames sampled', () => {
    const frames = steadyFrames(16);
    for (let i = 0; i < 6; i++) frames[i] = { t: frames[i].t, landmarks: null, peopleCount: 0 };
    const m = computeMetrics(frames);
    expect(m.framesSampled).toBe(16);
    expect(m.framesWithRider).toBe(10);
    expect(m.detectionRate).toBeCloseTo(0.625, 3);
  });

  it('returns null metrics instead of made-up numbers when nothing was detected', () => {
    const frames = Array.from({ length: 16 }, (_, i) => ({ t: i, landmarks: null, peopleCount: 0 }));
    const m = computeMetrics(frames);
    expect(m.detectionRate).toBe(0);
    expect(m.metrics).toBeNull();
  });

  it('computes each metric correctly on a hand-checked example', () => {
    const frames = [
      { t: 0, landmarks: makePose({ leanDeg: 10, hipX: 0.5 }), peopleCount: 1 },
      { t: 1, landmarks: makePose({ leanDeg: -10, hipX: 0.6, hipTilt: 0.04, shoulderTilt: 0.02 }), peopleCount: 2 },
    ];
    const m = computeMetrics(frames);
    expect(m.metrics.avgSpineAngleDeg).toBeCloseTo(10, 1);
    expect(m.metrics.spineAngleVariance).toBeCloseTo(100, 0); // population variance of [10, -10]
    expect(m.metrics.hipInstability).toBeCloseTo(variance([0, 0.2]), 4); // 0.04 / torso 0.2
    expect(m.metrics.shoulderAsymmetry).toBeCloseTo(0.05, 3); // mean(|0|, |0.1|)
    expect(m.metrics.cogDrift).toBeCloseTo(0.25, 3); // mean(|0|, |0.1/0.2|)
    expect(m.multiplePeopleFrames).toBe(1);
    expect(m.perFrame).toHaveLength(2);
  });

  it('rates a steady ride High and a wobbly ride Low', () => {
    const steady = computeMetrics(steadyFrames());
    const wobbly = computeMetrics(wobblyFrames());
    expect(steady.metrics.stabilityRating).toBe('High');
    expect(wobbly.metrics.stabilityRating).toBe('Low');
    expect(wobbly.metrics.spineAngleVariance).toBeGreaterThan(steady.metrics.spineAngleVariance);
    expect(wobbly.metrics.hipInstability).toBeGreaterThan(steady.metrics.hipInstability);
    expect(wobbly.metrics.cogDrift).toBeGreaterThan(steady.metrics.cogDrift);
  });
});

describe('stabilityRating', () => {
  const at = (level) => Object.fromEntries(Object.entries(STABILITY_THRESHOLDS).map(([k, v]) => [k, level === 'good' ? v.good : level === 'fair' ? v.fair : v.fair * 2]));
  it('uses the named thresholds', () => {
    expect(stabilityRating(at('good'))).toEqual({ rating: 'High', points: 0 });
    expect(stabilityRating(at('fair')).rating).toBe('Medium'); // 5 metrics x 1 point
    expect(stabilityRating(at('poor'))).toEqual({ rating: 'Low', points: 10 });
  });
});
