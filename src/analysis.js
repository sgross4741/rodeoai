// Orchestrates one analysis: sample frames -> pose -> metrics -> proxy -> validate.
import { sampleAndDetect } from './poseDetector.js';
import { computeMetrics } from './metrics.js';
import { validateAnalysis } from './schema.js';
import { getEvent } from './events.js';
import { MIN_DETECTION_RATE } from './thresholds.js';

export const RESULT_SCHEMA_VERSION = 1;

/**
 * onStage(stageKey, detailText) where stageKey is 'reading' | 'detecting' | 'scoring'.
 * Resolves to { status: 'ok', record } or { status: 'low_detection', record }.
 * Throws Error with a user-friendly message on failure.
 */
export async function runAnalysis({ eventId, videoUrl, duration, onStage }) {
  const ev = getEvent(eventId);
  if (!ev) throw new Error('Please pick an event.');

  const { frames, aspect } = await sampleAndDetect(videoUrl, duration, ({ stage, done, total }) => {
    if (stage === 'reading') onStage('reading', 'Loading the video and the motion tracker…');
    else onStage('detecting', `Checked ${done} of ${total} frames`);
  });

  const m = computeMetrics(frames, aspect);
  const base = {
    app: 'RodeoAI',
    schemaVersion: RESULT_SCHEMA_VERSION,
    analyzedAt: new Date().toISOString(),
    event: ev.id,
    eventLabel: ev.label,
    isRoughstock: ev.roughstock,
    duration: Math.round(duration * 100) / 100,
    framesSampled: m.framesSampled,
    framesWithRider: m.framesWithRider,
    detectionRate: m.detectionRate,
    multiplePeopleFrames: m.multiplePeopleFrames,
    trackedPerson: m.multiplePeopleFrames > 0
      ? `More than one person was seen in ${m.multiplePeopleFrames} frame(s). We tracked the largest (closest) person in each frame.`
      : 'One person tracked.',
    metrics: m.metrics,
    perFrame: m.perFrame,
  };

  // Honesty rule: no score if we couldn't see the rider well enough.
  if (m.detectionRate < MIN_DETECTION_RATE || !m.metrics) {
    return { status: 'low_detection', record: { ...base, analysis: null } };
  }

  onStage('scoring', 'Asking the AI coach to score the ride…');
  const payload = {
    event: ev.id,
    isRoughstock: ev.roughstock,
    duration: base.duration,
    detectionRate: m.detectionRate,
    framesSampled: m.framesSampled,
    framesWithRider: m.framesWithRider,
    multiplePeopleFrames: m.multiplePeopleFrames,
    metrics: m.metrics,
    perFrame: m.perFrame,
  };

  let res;
  try {
    res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("We couldn't reach the RodeoAI server. Check your connection and try again.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Scoring failed. Please try again.');

  // Validate again in the browser so the UI never renders a malformed result.
  const v = validateAnalysis(body.analysis, { isRoughstock: ev.roughstock, duration });
  if (!v.ok) throw new Error("The scoring service sent back an answer we couldn't read. Please try again.");

  return {
    status: 'ok',
    record: { ...base, analysis: v.value, notes: [...(body.notes || []), ...v.notes] },
  };
}

/** Save a record (plus coach rating) as a JSON file. Nothing is uploaded. */
export function downloadRecord(record, coachRating) {
  const out = { ...record, coachRating: coachRating || null };
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = record.analyzedAt.replace(/[:.]/g, '-');
  const id = coachRating?.videoId ? `${coachRating.videoId.replace(/[^\w-]/g, '')}-` : '';
  a.href = url;
  a.download = `rodeoai-${id}${record.event}-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
