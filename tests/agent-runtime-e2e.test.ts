import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import app from '../src/index.js';
import { getDb } from '../src/db/index.js';
import { agentRuns } from '../src/db/schema.js';
import { createTestTeam } from './helpers.js';

const API_KEY = process.env.ZOOGENT_API_KEY || 'zg_test-key-for-testing';

function req(path: string, options?: RequestInit) {
  return app.request(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      ...options?.headers,
    },
  });
}

async function waitForRun(runId: number, timeoutMs = 10_000): Promise<any> {
  const db = getDb();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get();
    if (run?.status && run.status !== 'running' && run.status !== 'queued') return run;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`Run ${runId} did not finish within ${timeoutMs}ms`);
}

describe('typescript runtime end-to-end', () => {
  it('creates, bundles, materializes and runs a typescript agent', async () => {
    const team = createTestTeam('e2e-ts');
    // Agent prints a known marker so we can verify stdout capture through
    // the whole bundle → materialize → node spawn → log pipeline.
    const source = `
      import { createHash } from 'node:crypto';
      const marker = 'ZOOGENT_E2E_' + createHash('sha256').update('ok').digest('hex').slice(0, 8);
      console.log(marker);
      process.exit(0);
    `;

    const createRes = await req(`/api/teams/${team.id}/agents`, {
      method: 'POST',
      body: JSON.stringify({ id: 'e2e-ts-1', name: 'E2E TS', source }),
    });
    expect(createRes.status).toBe(201);

    const triggerRes = await req(`/api/teams/${team.id}/agents/e2e-ts-1/trigger`, { method: 'POST' });
    expect(triggerRes.status).toBe(200);
    const { runId } = await triggerRes.json();
    expect(typeof runId).toBe('number');

    const run = await waitForRun(runId);
    expect(run.status).toBe('success');
    expect(run.exitCode).toBe(0);
    expect(run.stdout || '').toMatch(/ZOOGENT_E2E_[a-f0-9]{8}/);
  }, 20_000);

  it('resolves blessed deps at runtime (NODE_PATH wiring)', async () => {
    const team = createTestTeam('e2e-deps');
    // Import a blessed dep and verify it's actually loadable at spawn time.
    // `zod` is small and has no network side effects, perfect smoke.
    const source = `
      import { z } from 'zod';
      const schema = z.object({ ok: z.boolean() });
      const parsed = schema.parse({ ok: true });
      console.log('DEP_OK', parsed.ok);
      process.exit(0);
    `;

    const createRes = await req(`/api/teams/${team.id}/agents`, {
      method: 'POST',
      body: JSON.stringify({ id: 'e2e-deps-1', name: 'E2E Deps', source }),
    });
    expect(createRes.status).toBe(201);

    const triggerRes = await req(`/api/teams/${team.id}/agents/e2e-deps-1/trigger`, { method: 'POST' });
    expect(triggerRes.status).toBe(200);
    const { runId } = await triggerRes.json();

    const run = await waitForRun(runId);
    expect(run.status).toBe('success');
    expect(run.stdout || '').toContain('DEP_OK true');
    expect(run.stderr || '').not.toMatch(/cannot find|could not resolve/i);
  }, 20_000);

  it('agent without uploaded code returns 409 on trigger', async () => {
    const team = createTestTeam('e2e-nocode');
    await req(`/api/teams/${team.id}/agents`, {
      method: 'POST',
      body: JSON.stringify({ id: 'e2e-nocode-1', name: 'No Code' }),
    });

    const res = await req(`/api/teams/${team.id}/agents/e2e-nocode-1/trigger`, { method: 'POST' });
    expect(res.status).toBe(409);
  });
});
