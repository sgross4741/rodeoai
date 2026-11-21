import { describe, it, expect, vi } from 'vitest';
import { analyze, validatePayload, buildUserPrompt, createAnalyzeMiddleware, SYSTEM_PROMPT, TEMPERATURE, MAX_TOKENS } from '../server/deepseekProxy.js';
import { computeMetrics } from '../src/metrics.js';
import { steadyFrames, wobblyFrames, payloadFrom, validAnalysis } from './helpers.js';

const steady = payloadFrom(computeMetrics(steadyFrames()));
const wobbly = payloadFrom(computeMetrics(wobblyFrames()));

/** A fake fetch that returns the given model replies in order and records requests. */
function fakeFetch(...replies) {
  const calls = [];
  const fn = vi.fn(async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (typeof r === 'number') return { ok: false, status: r, json: async () => ({}) };
    const content = typeof r === 'function' ? r(JSON.parse(init.body)) : r;
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) };
  });
  fn.calls = calls;
  return fn;
}
const good = JSON.stringify(validAnalysis());

describe('DeepSeek request', () => {
  it('sends the required model settings and system prompt, with the key only in the header', async () => {
    const f = fakeFetch(good);
    await analyze(steady, { apiKey: 'sk-test', fetchImpl: f });
    const { body, headers } = f.calls[0];
    expect(body.model).toBe('deepseek-chat');
    expect(body.temperature).toBe(TEMPERATURE);
    expect(TEMPERATURE).toBe(0.3);
    expect(body.max_tokens).toBe(MAX_TOKENS);
    expect(MAX_TOKENS).toBe(1500);
    expect(body.messages[0]).toEqual({ role: 'system', content: SYSTEM_PROMPT });
    expect(headers.Authorization).toBe('Bearer sk-test');
    expect(JSON.stringify(body.messages)).not.toContain('sk-test');
  });

  it('tells the model the animal score can only be estimated from rider motion (roughstock)', () => {
    const p = buildUserPrompt(validatePayload(steady));
    expect(p).toMatch(/estimate/i);
    expect(p).toMatch(/rider motion only/i);
    expect(p).toMatch(/cannot see the animal/i);
  });

  it('tells the model animalScore must be null for timed events', () => {
    const p = buildUserPrompt(validatePayload({ ...steady, event: 'barrel_racing', isRoughstock: false }));
    expect(p).toMatch(/"animalScore" MUST be null/);
  });

  it('trusts the server event table over the client roughstock flag', () => {
    expect(validatePayload({ ...steady, event: 'barrel_racing', isRoughstock: true }).isRoughstock).toBe(false);
  });
});

describe('response handling', () => {
  it('retries once on malformed JSON and then succeeds', async () => {
    const f = fakeFetch('sorry, here is { broken', good);
    const r = await analyze(steady, { apiKey: 'k', fetchImpl: f });
    expect(f).toHaveBeenCalledTimes(2);
    expect(r.attempts).toBe(2);
    expect(r.analysis.riderScore).toBe(72);
    // second attempt includes the correction request
    expect(f.calls[1].body.messages.at(-1).content).toMatch(/did not match the schema/);
  });

  it('retries once on schema-invalid JSON', async () => {
    const f = fakeFetch(JSON.stringify({ riderScore: 'great' }), good);
    const r = await analyze(steady, { apiKey: 'k', fetchImpl: f });
    expect(r.analysis.confidence).toBe('medium');
  });

  it('gives a friendly error after two bad replies (no third call)', async () => {
    const f = fakeFetch('nope', 'still nope');
    await expect(analyze(steady, { apiKey: 'k', fetchImpl: f })).rejects.toMatchObject({
      status: 502,
      userMessage: expect.stringMatching(/couldn't read/),
    });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('downgrades "high" confidence when detection was weak', async () => {
    const f = fakeFetch(JSON.stringify({ ...validAnalysis(), confidence: 'high' }));
    const r = await analyze({ ...steady, detectionRate: 0.6 }, { apiKey: 'k', fetchImpl: f });
    expect(r.analysis.confidence).toBe('medium');
  });

  it('always labels a roughstock animal score as estimated', async () => {
    const f = fakeFetch(JSON.stringify({ ...validAnalysis(), limitations: [] }));
    const r = await analyze(steady, { apiKey: 'k', fetchImpl: f });
    expect(r.analysis.limitations[0]).toMatch(/estimated from rider motion only/i);
  });

  it('maps an auth failure to a message that does not reveal the key', async () => {
    const f = fakeFetch(401);
    await expect(analyze(steady, { apiKey: 'sk-secret', fetchImpl: f })).rejects.toSatisfy(
      (e) => /DEEPSEEK_API_KEY/.test(e.userMessage) && !e.userMessage.includes('sk-secret'),
    );
  });
});

describe('honesty guards on the request', () => {
  it('refuses to score when detectionRate is below 50%', async () => {
    const f = fakeFetch(good);
    await expect(analyze({ ...steady, detectionRate: 0.4 }, { apiKey: 'k', fetchImpl: f })).rejects.toMatchObject({ status: 422 });
    expect(f).not.toHaveBeenCalled();
  });
  it('refuses when the server has no key', async () => {
    await expect(analyze(steady, { apiKey: '' })).rejects.toMatchObject({ status: 500 });
  });
  it.each([
    ['unknown event', { event: 'mutton_busting' }],
    ['missing metric', { metrics: { ...steady.metrics, cogDrift: undefined } }],
    ['non-numeric frame data (e.g. image data)', { perFrame: [{ t: 1, image: 'data:image/png;base64,AAAA' }] }],
  ])('rejects %s', (_, override) => {
    expect(() => validatePayload({ ...steady, ...override })).toThrow();
  });
});

describe('scores change with the input', () => {
  it('two clearly different metric sets produce different prompts', () => {
    expect(steady.metrics.stabilityRating).toBe('High');
    expect(wobbly.metrics.stabilityRating).toBe('Low');
    const a = buildUserPrompt(validatePayload(steady));
    const b = buildUserPrompt(validatePayload(wobbly));
    expect(a).not.toEqual(b);
    expect(a).toContain(`"avgSpineAngleDeg":${steady.metrics.avgSpineAngleDeg}`);
    expect(b).toContain(`"avgSpineAngleDeg":${wobbly.metrics.avgSpineAngleDeg}`);
  });

  it('the pipeline passes input-dependent scores through unchanged (nothing hardcoded)', async () => {
    // Stand-in model whose score depends on the metrics it receives.
    const model = (body) => {
      const data = JSON.parse(body.messages[1].content.match(/\{"duration"[\s\S]*?\}\]\}/)[0]);
      const s = Math.max(0, Math.min(100, Math.round(95 - data.metrics.avgSpineAngleDeg * 2)));
      return JSON.stringify({ ...validAnalysis(), riderScore: s, breakdown: { balance: s, timing: s, form: s, control: s } });
    };
    const ra = await analyze(steady, { apiKey: 'k', fetchImpl: fakeFetch(model) });
    const rb = await analyze(wobbly, { apiKey: 'k', fetchImpl: fakeFetch(model) });
    expect(ra.analysis.riderScore).not.toBe(rb.analysis.riderScore);
    expect(ra.analysis.riderScore).toBeGreaterThan(rb.analysis.riderScore);
  });
});

describe('HTTP middleware', () => {
  function fakeReqRes(method, bodyStr) {
    const listeners = {};
    const req = {
      url: '/api/analyze', method,
      on: (ev, cb) => { listeners[ev] = cb; return req; },
      destroy: () => {},
    };
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; this.done(); } };
    const finished = new Promise((r) => { res.done = r; });
    setTimeout(() => { if (bodyStr) listeners.data?.(Buffer.from(bodyStr)); listeners.end?.(); }, 0);
    return { req, res, finished };
  }

  it('returns the validated analysis as JSON', async () => {
    const mw = createAnalyzeMiddleware(() => 'k', fakeFetch(good));
    const { req, res, finished } = fakeReqRes('POST', JSON.stringify(steady));
    mw(req, res, () => {});
    await finished;
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).analysis.riderScore).toBe(72);
  });

  it('rejects oversized bodies (no video uploads)', async () => {
    const mw = createAnalyzeMiddleware(() => 'k', fakeFetch(good));
    const { req, res, finished } = fakeReqRes('POST', 'x'.repeat(40 * 1024));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mw(req, res, () => {});
    await finished;
    errSpy.mockRestore();
    expect(res.statusCode).toBe(413);
  });

  it('passes other URLs through', () => {
    const next = vi.fn();
    createAnalyzeMiddleware(() => 'k')({ url: '/' }, {}, next);
    expect(next).toHaveBeenCalled();
  });
});
