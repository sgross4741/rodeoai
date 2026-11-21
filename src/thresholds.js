// =====================================================================
// All tunable numbers for RodeoAI live in this one file.
//
// IMPORTANT: the stability thresholds below are UNCALIBRATED starting
// guesses. They have not been validated against coach judgment. The
// 90-day validation test (see README) is how you tune them.
//
// Units:
//   - Angles are in degrees.
//   - Hip / shoulder / drift values are fractions of the rider's torso
//     length (mid-hip to mid-shoulder), so they don't change just because
//     the rider is closer to or farther from the camera.
// =====================================================================

// ---- Frame sampling ------------------------------------------------
export const SAMPLE_FRAMES_PER_SECOND = 2; // ~16 frames for an 8-second ride
export const MIN_SAMPLE_FRAMES = 8;
export const MAX_SAMPLE_FRAMES = 24;
export const MIN_FRAME_SPACING_SECONDS = 0.25;
// With 8 frames at least 0.25s apart, a video must be at least 2s long.
export const MIN_VIDEO_SECONDS = MIN_SAMPLE_FRAMES * MIN_FRAME_SPACING_SECONDS;
export const SEEK_TIMEOUT_MS = 5000;
export const ANALYSIS_FRAME_MAX_WIDTH = 960; // frames are downscaled to this before pose detection

// ---- Pose detection --------------------------------------------------
export const MAX_POSES_PER_FRAME = 3; // detect up to 3 people, track the largest
export const MIN_LANDMARK_VISIBILITY = 0.5; // shoulders + hips must be at least this visible
export const MIN_DETECTION_RATE = 0.5; // below this we refuse to score (honesty rule)

// ---- Confidence guard (applied server-side after DeepSeek answers) ---
// If fewer than this share of frames had the rider, "high" confidence
// is downgraded to "medium".
export const HIGH_CONFIDENCE_MIN_DETECTION_RATE = 0.75;

// ---- Stability rating -------------------------------------------------
// Each metric earns 0 points (at or under GOOD), 1 point (at or under FAIR),
// or 2 points (above FAIR). Points are summed across the five metrics.
export const STABILITY_THRESHOLDS = {
  avgSpineAngleDeg: { good: 15, fair: 30 },
  spineAngleVariance: { good: 60, fair: 200 }, // degrees squared
  hipInstability: { good: 0.004, fair: 0.015 }, // variance of (L-R hip Y) / torso
  shoulderAsymmetry: { good: 0.08, fair: 0.18 }, // mean |L-R shoulder Y| / torso
  cogDrift: { good: 0.25, fair: 0.6 }, // mean |hip-mid X drift| / torso
};
export const STABILITY_HIGH_MAX_POINTS = 2; // 0-2 points  -> High
export const STABILITY_MEDIUM_MAX_POINTS = 5; // 3-5 points  -> Medium, 6+ -> Low

// ---- Score colors on the results page ----------------------------------
export const SCORE_STRONG_MIN = 75; // gold
export const SCORE_AVERAGE_MIN = 50; // amber; below this is red
