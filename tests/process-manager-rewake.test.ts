import { describe, it, expect } from 'vitest';
import { eq, asc } from 'drizzle-orm';
import { getDb } from '../src/db/index.js';
import { agentRuns, agentTasks } from '../src/db/schema.js';
import { startAgent, isRunning } from '../src/core/process-manager.js';
import { createTestTeam, createTestAgent } from './helpers.js';

async function waitFor(predicate: () => boolean, timeoutMs = 10_000, intervalMs = 50): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

async function waitForRunCount(agentId: string, n: number, timeoutMs = 10_000): Promise<void> {
  const db = getDb();
  const ok = await waitFor(() => {
    const runs = db.select().from(agentRuns).where(eq(agentRuns.agentId, agentId)).all();
    return runs.length >= n;
  }, timeoutMs);
  if (!ok) {
    const runs = db.select().from(agentRuns).where(eq(agentRuns.agentId, agentId)).all();
    throw new Error(`expected ${n} runs for ${agentId}, got ${runs.length}`);
  }
}

async function waitForNotRunning(agentId: string, timeoutMs = 10_000): Promise<void> {
  const ok = await waitFor(() => !isRunning(agentId), timeoutMs);
  if (!ok) throw new Error(`Agent ${agentId} still running after ${timeoutMs}ms`);
}

// Inline node script: sleep `ms` then exit with `code`.
const sleepNode = (ms: number, code = 0) => ['-e', `setTimeout(() => process.exit(${code}), ${ms})`];

describe('process-manager: wakeOnAssignment rewake race', () => {
  it('re-fires startAgent for tasks queued during a run', async () => {
    const team = createTestTeam('rewake-happy');
    const agentId = createTestAgent(team.id, {
      command: 'node',
      args: sleepNode(1500),
      wakeOnAssignment: true,
    });
    const db = getDb();

    db.insert(agentTasks).values({ agentId, title: 'a', status: 'pending' }).run();
    const runId1 = await startAgent(agentId, 'assignment');
    expect(runId1).not.toBeNull();
    expect(isRunning(agentId)).toBe(true);

    // Wait until the agent process is comfortably in flight, then queue a wake.
    await new Promise((r) => setTimeout(r, 300));
    expect(isRunning(agentId)).toBe(true);

    db.insert(agentTasks).values({ agentId, title: 'b', status: 'pending' }).run();
    const runId2Same = await startAgent(agentId, 'assignment');
    expect(runId2Same).toBeNull();

    await waitForNotRunning(agentId, 5000);
    await waitForRunCount(agentId, 2, 5000);

    const runs = db.select().from(agentRuns).where(eq(agentRuns.agentId, agentId)).orderBy(asc(agentRuns.id)).all();
    expect(runs.length).toBe(2);
    expect(runs[0].status).toBe('success');
    expect(runs[1].trigger).toBe('assignment');
  }, 15_000);

  it('does not re-fire when no wake arrived during the run', async () => {
    const team = createTestTeam('rewake-noextra');
    const agentId = createTestAgent(team.id, {
      command: 'node',
      args: sleepNode(600),
      wakeOnAssignment: true,
    });

    const runId1 = await startAgent(agentId, 'assignment');
    expect(runId1).not.toBeNull();

    await waitForNotRunning(agentId, 5000);
    // Window for any spurious rewake to manifest.
    await new Promise((r) => setTimeout(r, 600));

    const db = getDb();
    const runs = db.select().from(agentRuns).where(eq(agentRuns.agentId, agentId)).all();
    expect(runs.length).toBe(1);
  }, 10_000);

  it('skips rewake on fast failure (crash-loop guard)', async () => {
    const team = createTestTeam('rewake-crash');
    const agentId = createTestAgent(team.id, {
      command: 'node',
      args: sleepNode(200, 1),
      wakeOnAssignment: true,
    });
    const db = getDb();

    db.insert(agentTasks).values({ agentId, title: 'a', status: 'pending' }).run();
    const runId1 = await startAgent(agentId, 'assignment');
    expect(runId1).not.toBeNull();

    // Queue a wake while the abortive run is still in flight.
    await new Promise((r) => setTimeout(r, 50));
    db.insert(agentTasks).values({ agentId, title: 'b', status: 'pending' }).run();
    const runId2Same = await startAgent(agentId, 'assignment');
    expect(runId2Same).toBeNull();

    await waitForNotRunning(agentId, 5000);
    // Window for any rewake to manifest — it should NOT fire because the run
    // failed fast (<2s, non-success).
    await new Promise((r) => setTimeout(r, 600));

    const runs = db.select().from(agentRuns).where(eq(agentRuns.agentId, agentId)).all();
    expect(runs.length).toBe(1);
    expect(runs[0].status).toBe('error');
    expect(runs[0].durationMs).toBeLessThan(2000);
  }, 10_000);
});
