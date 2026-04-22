import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const TEAM_ID = 'team-abc-123';
const AGENT_ID = 'scout-1';
const API_KEY = 'sdk-test-key';
const BASE = 'http://127.0.0.1:3200';

let fetchMock: any;
let originalFetch: any;

beforeEach(() => {
  process.env.ZOOGENT_TEAM_ID = TEAM_ID;
  process.env.ZOOGENT_AGENT_ID = AGENT_ID;
  process.env.ZOOGENT_API_KEY = API_KEY;
  process.env.ZOOGENT_API_URL = BASE;

  originalFetch = globalThis.fetch;
  fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
    return new Response(JSON.stringify({ id: 42, agentId: AGENT_ID, title: 't', status: 'pending' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  globalThis.fetch = fetchMock as any;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.ZOOGENT_TEAM_ID;
  delete process.env.ZOOGENT_AGENT_ID;
  delete process.env.ZOOGENT_API_KEY;
  delete process.env.ZOOGENT_API_URL;
});

/**
 * Regression: task-related SDK methods must hit team-scoped routes
 * (/api/teams/:teamId/tasks/...). In v0.4.x the non-scoped /api/tasks routes
 * were removed — hitting them returns an HTML fallback page and the SDK
 * crashes with "Unexpected token '<' ... is not valid JSON".
 */
describe('client SDK URL regressions (v0.4 team-scoped routing)', () => {
  it('createTask POSTs to /api/teams/:teamId/tasks', async () => {
    const { createTask } = await import('../src/client/index.ts');
    await createTask({ agentId: AGENT_ID, title: 'x' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/teams/${TEAM_ID}/tasks`);
    expect(init?.method).toBe('POST');
  });

  it('getMyTasks GETs /api/teams/:teamId/tasks?agentId=...', async () => {
    fetchMock.mockResolvedValueOnce(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const { getMyTasks } = await import('../src/client/index.ts');
    await getMyTasks();
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/teams/${TEAM_ID}/tasks?agentId=${AGENT_ID}&status=pending`);
  });

  it('checkoutTask POSTs to /api/teams/:teamId/tasks/:id/checkout', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const { checkoutTask } = await import('../src/client/index.ts');
    await checkoutTask(42);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/teams/${TEAM_ID}/tasks/42/checkout`);
    expect(init?.method).toBe('POST');
  });

  it('completeTask PATCHes /api/teams/:teamId/tasks/:id', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const { completeTask } = await import('../src/client/index.ts');
    await completeTask(42, 'done');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/teams/${TEAM_ID}/tasks/42`);
    expect(init?.method).toBe('PATCH');
  });

  it('failTask PATCHes /api/teams/:teamId/tasks/:id', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const { failTask } = await import('../src/client/index.ts');
    await failTask(42, 'boom');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/teams/${TEAM_ID}/tasks/42`);
  });

  it('submitEvaluation POSTs to /api/teams/:teamId/tasks/:id/evaluate', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const { submitEvaluation } = await import('../src/client/index.ts');
    await submitEvaluation({ taskId: 42, verdict: 'approve' });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/teams/${TEAM_ID}/tasks/42/evaluate`);
  });

  it('reportCost still POSTs to global /api/report/cost', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const { reportCost } = await import('../src/client/index.ts');
    await reportCost({ model: 'x', inputTokens: 1, outputTokens: 1, costCents: 0 });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/report/cost`);
  });
});
