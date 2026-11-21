// OPTIONAL live test against the real DeepSeek API.
// Runs only when DEEPSEEK_API_KEY is set (in .env or the shell):  npm run test:live
// It checks that two clearly different motion summaries get different scores.
import { describe, it, expect } from 'vitest';
import { loadEnv } from 'vite';
import { analyze } from '../server/deepseekProxy.js';
import { computeMetrics } from '../src/metrics.js';
import { steadyFrames, wobblyFrames, payloadFrom } from './helpers.js';

const key = loadEnv('test', process.cwd(), '').DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY;

describe.skipIf(!key)('live DeepSeek scoring', () => {
  it('scores a steady ride higher than a wobbly ride', async () => {
    const steady = await analyze(payloadFrom(computeMetrics(steadyFrames())), { apiKey: key });
    const wobbly = await analyze(payloadFrom(computeMetrics(wobblyFrames())), { apiKey: key });
    console.log('steady', steady.analysis.riderScore, steady.analysis.breakdown, '| wobbly', wobbly.analysis.riderScore, wobbly.analysis.breakdown);
    expect(steady.analysis.riderScore).not.toBe(wobbly.analysis.riderScore);
    expect(steady.analysis.riderScore).toBeGreaterThan(wobbly.analysis.riderScore);
  }, 120_000);
});
