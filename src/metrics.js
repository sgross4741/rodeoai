// Pure metric calculations. No browser APIs here, so everything is unit-testable.
//
// Landmarks come from MediaPipe Pose Landmarker: 33 points per person, each
// { x, y, z, visibility } with x and y normalized to 0..1 of the image width
// and height. Because x and y are normalized by DIFFERENT lengths, we multiply x
// by the frame's aspect ratio (width / height) before measuring angles or
// distances, so a 16:9 video doesn't stretch the numbers.

import {
  SAMPLE_FRAMES_PER_SECOND,
  MIN_SAMPLE_FRAMES,
  MAX_SAMPLE_FRAMES,
  MIN_FRAME_SPACING_SECONDS,
  MIN_LANDMARK_VISIBILITY,
  STABILITY_THRESHOLDS,
  STABILITY_HIGH_MAX_POINTS,
  STABILITY_MEDIUM_MAX_POINTS,
} from './thresholds.js';

export const LM = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
};
const CORE_LANDMARKS = [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP];

// ---------------------------------------------------------------------------
// Frame sampling
// ---------------------------------------------------------------------------

/**
 * Evenly spaced timestamps (seconds) to sample from a video.
 * Returns [] if the video is too short to meet the minimum frame count
 * without sampling frames closer than MIN_FRAME_SPACING_SECONDS.
 */
export function computeSampleTimes(duration) {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const maxBySpacing = Math.floor(duration / MIN_FRAME_SPACING_SECONDS + 1e-9);
  const target = Math.round(duration * SAMPLE_FRAMES_PER_SECOND);
  const count = Math.min(MAX_SAMPLE_FRAMES, maxBySpacing, Math.max(MIN_SAMPLE_FRAMES, target));
  if (count < MIN_SAMPLE_FRAMES) return [];
  const step = duration / count;
  // Sample the middle of each slice so we never ask for t=0 (often black) or t=duration.
  return Array.from({ length: count }, (_, i) => round((i + 0.5) * step, 3));
}

// ---------------------------------------------------------------------------
// Person selection
// ---------------------------------------------------------------------------

/** Bounding-box area of a pose (aspect-corrected), using only reasonably visible points. */
export function poseBoxArea(landmarks, aspect = 1) {
  const pts = landmarks.filter((p) => (p.visibility ?? 1) >= MIN_LANDMARK_VISIBILITY);
  if (pts.length < 2) return 0;
  const xs = pts.map((p) => p.x * aspect);
  const ys = pts.map((p) => p.y);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
}

/**
 * Pick the most prominent person (largest bounding box) from a list of poses.
 * Returns { index, landmarks, peopleCount } or null if there are no poses.
 */
export function pickMostProminent(poses, aspect = 1) {
  if (!Array.isArray(poses) || poses.length === 0) return null;
  let best = 0;
  let bestArea = -1;
  poses.forEach((lms, i) => {
    const a = poseBoxArea(lms, aspect);
    if (a > bestArea) {
      bestArea = a;
      best = i;
    }
  });
  return { index: best, landmarks: poses[best], peopleCount: poses.length };
}

/** True if shoulders and hips are all visible enough to measure. */
export function hasCoreLandmarks(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length < 25) return false;
  return CORE_LANDMARKS.every((i) => {
    const p = landmarks[i];
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 1) >= MIN_LANDMARK_VISIBILITY;
  });
}

// ---------------------------------------------------------------------------
// Per-frame geometry
// ---------------------------------------------------------------------------

/**
 * Geometry for one frame. Returns null if the core landmarks aren't usable.
 * spineAngleDeg is signed: 0 = upright, positive = top of torso leans toward
 * the right side of the image, negative = toward the left.
 */
export function frameGeometry(landmarks, aspect = 1) {
  if (!hasCoreLandmarks(landmarks)) return null;
  const ls = landmarks[LM.LEFT_SHOULDER];
  const rs = landmarks[LM.RIGHT_SHOULDER];
  const lh = landmarks[LM.LEFT_HIP];
  const rh = landmarks[LM.RIGHT_HIP];

  const shoulderMid = { x: ((ls.x + rs.x) / 2) * aspect, y: (ls.y + rs.y) / 2 };
  const hipMid = { x: ((lh.x + rh.x) / 2) * aspect, y: (lh.y + rh.y) / 2 };

  const dx = shoulderMid.x - hipMid.x;
  const dyUp = hipMid.y - shoulderMid.y; // image y grows downward
  const torsoLength = Math.hypot(dx, dyUp);
  if (torsoLength < 1e-6) return null;

  return {
    spineAngleDeg: (Math.atan2(dx, dyUp) * 180) / Math.PI,
    hipYDiff: (lh.y - rh.y) / torsoLength,
    shoulderYDiff: (ls.y - rs.y) / torsoLength,
    hipMidX: hipMid.x,
    torsoLength,
  };
}

// ---------------------------------------------------------------------------
// Summary metrics
// ---------------------------------------------------------------------------

/**
 * frames: [{ t, landmarks|null, peopleCount }] — one entry per SAMPLED frame,
 *         including frames where nobody was found (landmarks: null).
 * aspect: video width / height.
 *
 * Returns { framesSampled, framesWithRider, detectionRate, multiplePeopleFrames,
 *           metrics|null, perFrame }.
 * metrics is null when there are fewer than 2 usable frames.
 */
export function computeMetrics(frames, aspect = 1) {
  const framesSampled = frames.length;
  const usable = [];
  let multiplePeopleFrames = 0;

  for (const f of frames) {
    if ((f.peopleCount ?? 0) > 1) multiplePeopleFrames += 1;
    const g = f.landmarks ? frameGeometry(f.landmarks, aspect) : null;
    if (g) usable.push({ t: f.t, ...g });
  }

  const framesWithRider = usable.length;
  const detectionRate = framesSampled ? round(framesWithRider / framesSampled, 3) : 0;

  if (usable.length < 2) {
    return { framesSampled, framesWithRider, detectionRate, multiplePeopleFrames, metrics: null, perFrame: [] };
  }

  const angles = usable.map((u) => u.spineAngleDeg);
  const meanTorso = mean(usable.map((u) => u.torsoLength));
  const startX = usable[0].hipMidX;
  const driftSeries = usable.map((u) => (u.hipMidX - startX) / meanTorso);

  const metrics = {
    avgSpineAngleDeg: round(mean(angles.map(Math.abs)), 2),
    spineAngleVariance: round(variance(angles), 2),
    hipInstability: round(variance(usable.map((u) => u.hipYDiff)), 5),
    shoulderAsymmetry: round(mean(usable.map((u) => Math.abs(u.shoulderYDiff))), 4),
    cogDrift: round(mean(driftSeries.map(Math.abs)), 4),
  };
  const { rating, points } = stabilityRating(metrics);
  metrics.stabilityRating = rating;
  metrics.stabilityPoints = points;

  const perFrame = usable.map((u, i) => ({
    t: u.t,
    spineAngleDeg: round(u.spineAngleDeg, 1),
    hipYDiff: round(u.hipYDiff, 3),
    shoulderYDiff: round(u.shoulderYDiff, 3),
    cogOffset: round(driftSeries[i], 3),
  }));

  return { framesSampled, framesWithRider, detectionRate, multiplePeopleFrames, metrics, perFrame };
}

/** High / Medium / Low from the named thresholds in thresholds.js. */
export function stabilityRating(metrics) {
  let points = 0;
  for (const [key, { good, fair }] of Object.entries(STABILITY_THRESHOLDS)) {
    const v = metrics[key];
    if (!Number.isFinite(v)) continue;
    if (v > fair) points += 2;
    else if (v > good) points += 1;
  }
  const rating = points <= STABILITY_HIGH_MAX_POINTS ? 'High' : points <= STABILITY_MEDIUM_MAX_POINTS ? 'Medium' : 'Low';
  return { rating, points };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
export function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
export function variance(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length; // population variance
}
function round(v, d) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
