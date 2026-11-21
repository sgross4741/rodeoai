// Validation for the JSON that DeepSeek returns. Shared by the server proxy
// (which retries once if validation fails) and the browser (defense in depth).

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'];
const BREAKDOWN_KEYS = ['balance', 'timing', 'form', 'control'];

/** Pull a JSON object out of model text, tolerating ```json fences or stray prose. */
export function extractJson(text) {
  if (typeof text !== 'string') throw new Error('Response was not text');
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  try {
    return JSON.parse(s);
  } catch {
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(s.slice(start, end + 1));
    throw new Error('Response was not valid JSON');
  }
}

const isScore = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
const isText = (v) => typeof v === 'string' && v.trim().length > 0;

/**
 * Validate an analysis object.
 * context: { isRoughstock: boolean, duration: number }
 *
 * Returns { ok: true, value, notes } or { ok: false, errors }.
 * `value` is a cleaned copy: scores rounded, strings trimmed, key moments
 * outside the video's length dropped. `notes` lists any such cleanups so the
 * UI can be transparent about them.
 */
export function validateAnalysis(data, { isRoughstock, duration } = {}) {
  const errors = [];
  const notes = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, errors: ['Response is not a JSON object'] };
  }

  if (!isScore(data.riderScore)) errors.push('riderScore must be a number from 0 to 100');

  let animalScore = data.animalScore;
  if (animalScore === undefined) animalScore = null;
  if (animalScore !== null && !isScore(animalScore)) errors.push('animalScore must be a number from 0 to 100, or null');
  if (!isRoughstock && animalScore !== null) {
    // Timed events have no judged animal. Never show a number we can't stand behind.
    animalScore = null;
    notes.push('Animal score removed: this event does not score the animal.');
  }

  const b = data.breakdown;
  if (!b || typeof b !== 'object') errors.push('breakdown must be an object');
  else for (const k of BREAKDOWN_KEYS) if (!isScore(b[k])) errors.push(`breakdown.${k} must be a number from 0 to 100`);

  if (!Array.isArray(data.keyMoments)) errors.push('keyMoments must be an array');
  else data.keyMoments.forEach((m, i) => {
    if (!m || typeof m.timestamp !== 'number' || !Number.isFinite(m.timestamp)) errors.push(`keyMoments[${i}].timestamp must be a number`);
    if (!m || !isText(m.label)) errors.push(`keyMoments[${i}].label must be text`);
    if (!m || typeof m.note !== 'string') errors.push(`keyMoments[${i}].note must be text`);
  });

  if (!Array.isArray(data.techniqueFeedback) || data.techniqueFeedback.length === 0) errors.push('techniqueFeedback must be a non-empty array');
  else if (!data.techniqueFeedback.every(isText)) errors.push('techniqueFeedback items must be text');

  if (!Array.isArray(data.conditioningPlan) || data.conditioningPlan.length === 0) errors.push('conditioningPlan must be a non-empty array');
  else data.conditioningPlan.forEach((c, i) => {
    for (const k of ['exercise', 'sets_reps', 'targets']) if (!c || !isText(c[k])) errors.push(`conditioningPlan[${i}].${k} must be text`);
  });

  if (!CONFIDENCE_LEVELS.includes(data.confidence)) errors.push('confidence must be "high", "medium", or "low"');

  if (!Array.isArray(data.limitations)) errors.push('limitations must be an array');
  else if (!data.limitations.every((l) => typeof l === 'string')) errors.push('limitations items must be text');

  if (errors.length) return { ok: false, errors };

  const maxT = Number.isFinite(duration) ? duration : Infinity;
  const keyMoments = data.keyMoments
    .filter((m) => m.timestamp >= 0 && m.timestamp <= maxT)
    .map((m) => ({ timestamp: Math.round(m.timestamp * 100) / 100, label: m.label.trim(), note: m.note.trim() }))
    .sort((a, b2) => a.timestamp - b2.timestamp);
  if (keyMoments.length < data.keyMoments.length) {
    notes.push(`${data.keyMoments.length - keyMoments.length} key moment(s) removed because their time was outside the video.`);
  }

  return {
    ok: true,
    notes,
    value: {
      riderScore: Math.round(data.riderScore),
      animalScore: animalScore === null ? null : Math.round(animalScore),
      breakdown: Object.fromEntries(BREAKDOWN_KEYS.map((k) => [k, Math.round(b[k])])),
      keyMoments,
      techniqueFeedback: data.techniqueFeedback.map((s) => s.trim()),
      conditioningPlan: data.conditioningPlan.map((c) => ({
        exercise: c.exercise.trim(),
        sets_reps: c.sets_reps.trim(),
        targets: c.targets.trim(),
      })),
      confidence: data.confidence,
      limitations: data.limitations.map((s) => s.trim()).filter(Boolean),
    },
  };
}
