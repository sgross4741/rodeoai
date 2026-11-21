// Server-side proxy for the DeepSeek call.
//
// - Runs inside the Vite dev/preview server (see vite.config.js). Never bundled
//   into the browser, so DEEPSEEK_API_KEY stays on the server.
// - Accepts ONLY the keypoint/metrics summary. Anything that looks like video
//   or image data is rejected, and the body size is capped.
// - Validates DeepSeek's answer against the schema, retries once on bad JSON,
//   and returns a friendly error if the second try also fails.

import { validateAnalysis, extractJson } from '../src/schema.js';
import { getEvent } from '../src/events.js';
import { MIN_DETECTION_RATE, HIGH_CONFIDENCE_MIN_DETECTION_RATE, STABILITY_THRESHOLDS } from '../src/thresholds.js';

export const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
export const DEEPSEEK_MODEL = 'deepseek-chat';
export const TEMPERATURE = 0.3;
export const MAX_TOKENS = 1500;
export const MAX_BODY_BYTES = 32 * 1024;
export const REQUEST_TIMEOUT_MS = 60_000;

export const SYSTEM_PROMPT =
  'You are an expert rodeo analyst and strength-and-conditioning coach. Use only the data provided. ' +
  'Return ONLY valid JSON matching the schema. If data is weak, say so and lower your confidence.';

const METRIC_KEYS = ['avgSpineAngleDeg', 'spineAngleVariance', 'hipInstability', 'shoulderAsymmetry', 'cogDrift'];

export class ProxyError extends Error {
  constructor(status, userMessage, detail) {
    super(detail || userMessage);
    this.status = status;
    this.userMessage = userMessage;
  }
}

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------
const num = (v) => typeof v === 'number' && Number.isFinite(v);

/** Validate and normalize the browser's payload. Throws ProxyError on bad input. */
export function validatePayload(p) {
  const bad = (msg) => { throw new ProxyError(400, 'The analysis request was not in the expected format.', msg); };
  if (!p || typeof p !== 'object') bad('body must be an object');
  const ev = getEvent(p.event);
  if (!ev) bad('unknown event');
  if (!num(p.duration) || p.duration <= 0 || p.duration > 3600) bad('bad duration');
  if (!num(p.detectionRate) || p.detectionRate < 0 || p.detectionRate > 1) bad('bad detectionRate');
  if (!num(p.framesSampled) || !num(p.framesWithRider)) bad('bad frame counts');
  if (!p.metrics || typeof p.metrics !== 'object') bad('missing metrics');
  for (const k of METRIC_KEYS) if (!num(p.metrics[k])) bad(`metric ${k} missing`);
  if (!['High', 'Medium', 'Low'].includes(p.metrics.stabilityRating)) bad('bad stabilityRating');
  const perFrame = Array.isArray(p.perFrame) ? p.perFrame : [];
  if (perFrame.length > 24) bad('too many frames');
  for (const f of perFrame) {
    if (!f || typeof f !== 'object' || !Object.values(f).every(num)) bad('perFrame must contain numbers only');
  }
  if (p.detectionRate < MIN_DETECTION_RATE) {
    // The browser should already have stopped. Refuse here too so no score is ever invented.
    throw new ProxyError(422, "We couldn't track the rider well enough in this video to score it.");
  }
  return {
    event: ev.id,
    eventLabel: ev.label,
    eventFocus: ev.focus,
    isRoughstock: ev.roughstock, // trust our own event table, not the client flag
    duration: p.duration,
    detectionRate: p.detectionRate,
    framesSampled: p.framesSampled,
    framesWithRider: p.framesWithRider,
    multiplePeopleFrames: num(p.multiplePeopleFrames) ? p.multiplePeopleFrames : 0,
    metrics: Object.fromEntries([...METRIC_KEYS, 'stabilityRating'].map((k) => [k, p.metrics[k]])),
    perFrame: perFrame.map((f) => ({
      t: f.t, spineAngleDeg: f.spineAngleDeg, hipYDiff: f.hipYDiff, shoulderYDiff: f.shoulderYDiff, cogOffset: f.cogOffset,
    })),
  };
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------
export function buildUserPrompt(d) {
  const animalRules = d.isRoughstock
    ? `- This is a roughstock event, so the animal is normally scored. BUT the pose tracker only sees the RIDER; it cannot see the animal at all.
  Any "animalScore" you give must be an ESTIMATE inferred only from how the rider's body was moved (how hard and how often the rider was thrown around).
  Put the sentence "Animal score is estimated from rider motion only; the animal was not tracked." in "limitations".
  If the rider data gives you no reasonable basis for an estimate, set "animalScore" to null.`
    : `- This is a timed event. The animal is not scored. "animalScore" MUST be null.`;

  const ranges = Object.entries(STABILITY_THRESHOLDS)
    .map(([k, { good, fair }]) => `  ${k}: good <= ${good}, fair <= ${fair}, above ${fair} is poor`)
    .join('\n');

  return `Event: ${d.eventLabel}
What matters in this event: ${d.eventFocus}

Data (from single-camera 2D pose estimation of the rider in ${d.framesSampled} frames sampled across a ${d.duration.toFixed(1)}s video):
${JSON.stringify({
    duration: d.duration,
    isRoughstock: d.isRoughstock,
    detectionRate: d.detectionRate,
    framesWithRider: d.framesWithRider,
    framesSampled: d.framesSampled,
    framesWithMultiplePeople: d.multiplePeopleFrames,
    metrics: d.metrics,
    perFrame: d.perFrame,
  })}

What the numbers mean:
- avgSpineAngleDeg: average lean of the torso away from vertical, in degrees (0 = perfectly upright).
- spineAngleVariance: how much that lean changed during the ride (degrees squared). Higher = more whipping around.
- hipInstability: variance of the left-right hip height difference, as a fraction of torso length. Higher = hips tipping side to side.
- shoulderAsymmetry: average left-right shoulder height difference, as a fraction of torso length. Higher = dropped shoulder.
- cogDrift: average sideways drift of the hips from where they started, as a fraction of torso length. Higher = sliding off center. Camera panning also raises this.
- stabilityRating: High / Medium / Low summary of the five metrics.
- perFrame: per-frame values at time t (seconds). spineAngleDeg is signed (+ = leaning toward image right). cogOffset is signed drift.
Rough reference ranges (starting guesses, not yet calibrated against judges):
${ranges}

Rules:
- Base every score and comment on these numbers. Stronger metrics must lead to higher scores; weaker metrics to lower scores. Do not default to middle-of-the-road numbers.
- You cannot see the video. Do not describe things the data cannot show (hand position, spurring, rope work, the animal's moves). If something important can't be judged from this data, say so in "limitations".
${animalRules}
- "keyMoments": 2 to 5 moments, each "timestamp" must be one of the perFrame t values. Point to where the numbers change the most (biggest lean, biggest drift, steadiest stretch).
- "techniqueFeedback": 3 to 5 tips in plain, encouraging language a 13-year-old can follow. Short sentences, no jargon.
- "conditioningPlan": 3 to 5 safe, age-appropriate exercises (bodyweight or light equipment) that target the weaknesses in the data. Keep "sets_reps" simple, like "3 sets of 10".
- "confidence": "low" if detectionRate is under 0.7 or the metrics conflict; never "high" if fewer than 12 frames had the rider.
- "limitations": list what this analysis could not see or measure.

Return ONLY a JSON object with exactly this shape:
{
  "riderScore": number 0-100,
  "animalScore": number 0-100 or null,
  "breakdown": { "balance": number 0-100, "timing": number 0-100, "form": number 0-100, "control": number 0-100 },
  "keyMoments": [ { "timestamp": number (seconds), "label": "short title", "note": "one sentence" } ],
  "techniqueFeedback": [ "tip" ],
  "conditioningPlan": [ { "exercise": "name", "sets_reps": "e.g. 3 sets of 10", "targets": "what it helps" } ],
  "confidence": "high" | "medium" | "low",
  "limitations": [ "text" ]
}`;
}

// ---------------------------------------------------------------------------
// DeepSeek call with one retry
// ---------------------------------------------------------------------------
async function callDeepSeekOnce(messages, { apiKey, fetchImpl }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetchImpl(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
        response_format: { type: 'json_object' },
        messages,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    throw new ProxyError(502, "We couldn't reach the scoring service. Check your internet connection and try again.", String(e));
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 || res.status === 403) {
    throw new ProxyError(500, 'The scoring service rejected the server key. Ask whoever set up this app to check DEEPSEEK_API_KEY in .env.');
  }
  if (res.status === 402) throw new ProxyError(502, 'The scoring service account is out of credit.');
  if (res.status === 429) throw new ProxyError(503, 'The scoring service is busy. Please wait a minute and try again.');
  if (!res.ok) throw new ProxyError(502, 'The scoring service had a problem. Please try again.', `DeepSeek HTTP ${res.status}`);
  const body = await res.json();
  const content = body?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : '';
}

/**
 * Run the full analysis: validate payload, call DeepSeek, validate response,
 * retry once if malformed, apply the confidence guard.
 */
export async function analyze(rawPayload, { apiKey, fetchImpl = fetch } = {}) {
  if (!apiKey) {
    throw new ProxyError(500, "This app isn't set up yet: the server is missing DEEPSEEK_API_KEY in its .env file.");
  }
  const d = validatePayload(rawPayload);
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(d) },
  ];
  const ctx = { isRoughstock: d.isRoughstock, duration: d.duration };

  let lastErrors = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const text = await callDeepSeekOnce(messages, { apiKey, fetchImpl });
    let parsed = null;
    try {
      parsed = extractJson(text);
    } catch (e) {
      lastErrors = [e.message];
    }
    if (parsed) {
      const v = validateAnalysis(parsed, ctx);
      if (v.ok) return applyGuards(v.value, v.notes, d, attempt);
      lastErrors = v.errors;
    }
    if (attempt === 1) {
      messages.push({ role: 'assistant', content: text || '(empty)' });
      messages.push({
        role: 'user',
        content: `Your reply did not match the schema: ${lastErrors.slice(0, 8).join('; ')}. Reply again with ONLY the corrected JSON object.`,
      });
    }
  }
  throw new ProxyError(502, "The scoring service sent back an answer we couldn't read. Please try again.", lastErrors.join('; '));
}

/** Honesty guards applied after validation, so they hold no matter what the model says. */
export function applyGuards(value, notes, d, attempts) {
  const out = { ...value, limitations: [...value.limitations] };
  if (out.confidence === 'high' && d.detectionRate < HIGH_CONFIDENCE_MIN_DETECTION_RATE) {
    out.confidence = 'medium';
    notes = [...notes, `Confidence lowered to medium because the rider was tracked in only ${Math.round(d.detectionRate * 100)}% of frames.`];
  }
  if (d.isRoughstock && out.animalScore !== null) {
    const msg = 'Animal score is estimated from rider motion only; the animal was not tracked.';
    if (!out.limitations.some((l) => /rider motion only/i.test(l))) out.limitations.unshift(msg);
  }
  return { analysis: out, notes, attempts };
}

// ---------------------------------------------------------------------------
// HTTP middleware (Connect-style: works in Vite dev and preview servers)
// ---------------------------------------------------------------------------
export function createAnalyzeMiddleware(getApiKey, fetchImpl = fetch) {
  return async function analyzeMiddleware(req, res, next) {
    if (req.url !== '/api/analyze') return next();
    const send = (status, obj) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(obj));
    };
    if (req.method !== 'POST') return send(405, { error: 'Use POST.' });
    try {
      const raw = await readBody(req, MAX_BODY_BYTES);
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new ProxyError(400, 'The analysis request was not valid JSON.');
      }
      const result = await analyze(payload, { apiKey: getApiKey(), fetchImpl });
      send(200, result);
    } catch (e) {
      const status = e instanceof ProxyError ? e.status : 500;
      const message = e instanceof ProxyError ? e.userMessage : 'Something went wrong on the server. Please try again.';
      // Log the technical detail server-side only. Never log the key.
      console.error(`[api/analyze] ${status}: ${e.message}`);
      send(status, { error: message });
    }
  };
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new ProxyError(413, 'The analysis request was too large. Only the motion summary should be sent, never the video.'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
