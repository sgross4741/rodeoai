// Build synthetic MediaPipe-style landmarks for tests.
import { LM } from '../src/metrics.js';

/**
 * A 33-point pose with hips centered at (hipX, hipY) and shoulders a torso-length
 * above, leaning by `leanDeg` (positive = top leans toward image right).
 * hipTilt / shoulderTilt shift the LEFT point down by that many normalized units.
 */
export function makePose({ hipX = 0.5, hipY = 0.6, torso = 0.2, leanDeg = 0, hipTilt = 0, shoulderTilt = 0, visibility = 0.99, aspect = 1 } = {}) {
  const pts = Array.from({ length: 33 }, () => ({ x: hipX, y: hipY - torso / 2, z: 0, visibility }));
  const rad = (leanDeg * Math.PI) / 180;
  // x is normalized by width, so undo the aspect correction when placing points
  const sx = hipX + (Math.sin(rad) * torso) / aspect;
  const sy = hipY - Math.cos(rad) * torso;
  const half = 0.05;
  pts[LM.LEFT_HIP] = { x: hipX - half, y: hipY + hipTilt / 2, z: 0, visibility };
  pts[LM.RIGHT_HIP] = { x: hipX + half, y: hipY - hipTilt / 2, z: 0, visibility };
  pts[LM.LEFT_SHOULDER] = { x: sx - half, y: sy + shoulderTilt / 2, z: 0, visibility };
  pts[LM.RIGHT_SHOULDER] = { x: sx + half, y: sy - shoulderTilt / 2, z: 0, visibility };
  // a head and feet so the bounding box has real size
  pts[0] = { x: sx, y: sy - torso * 0.4, z: 0, visibility };
  pts[27] = { x: hipX - half, y: hipY + torso * 1.2, z: 0, visibility };
  pts[28] = { x: hipX + half, y: hipY + torso * 1.2, z: 0, visibility };
  return pts;
}

/** Steady, upright rider over n frames. */
export function steadyFrames(n = 16) {
  return Array.from({ length: n }, (_, i) => ({
    t: i * 0.5,
    landmarks: makePose({ leanDeg: 3 + (i % 2), hipTilt: 0.002 * (i % 2) }),
    peopleCount: 1,
  }));
}

/** Rider getting thrown around: big lean swings, tipping hips, drifting. */
export function wobblyFrames(n = 16) {
  return Array.from({ length: n }, (_, i) => ({
    t: i * 0.5,
    landmarks: makePose({
      leanDeg: i % 2 ? 35 : -30,
      hipTilt: i % 2 ? 0.06 : -0.05,
      shoulderTilt: i % 2 ? 0.07 : -0.06,
      hipX: 0.5 + i * 0.02,
    }),
    peopleCount: 1,
  }));
}

/** Example metrics payloads (as the browser would send them). */
export function payloadFrom(computed, overrides = {}) {
  return {
    event: 'bull_riding',
    isRoughstock: true,
    duration: 8,
    detectionRate: computed.detectionRate,
    framesSampled: computed.framesSampled,
    framesWithRider: computed.framesWithRider,
    multiplePeopleFrames: computed.multiplePeopleFrames,
    metrics: computed.metrics,
    perFrame: computed.perFrame,
    ...overrides,
  };
}

/** A schema-valid DeepSeek response. */
export const validAnalysis = () => ({
  riderScore: 72.4,
  animalScore: 65,
  breakdown: { balance: 70, timing: 68, form: 75, control: 71 },
  keyMoments: [
    { timestamp: 4.25, label: 'Big lean', note: 'Upper body tipped right.' },
    { timestamp: 1.5, label: 'Steady start', note: 'Good posture out of the chute.' },
  ],
  techniqueFeedback: ['Keep your chest up.'],
  conditioningPlan: [{ exercise: 'Plank', sets_reps: '3 x 30s', targets: 'Core stability' }],
  confidence: 'medium',
  limitations: ['Single camera.'],
});
