import { describe, it, expect } from 'vitest';
import app from '../src/index.js';
import { createTestTeam, createTestAgent } from './helpers.js';

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

describe('API Tasks CRUD', () => {
  it('POST creates a task', async () => {
    const team = createTestTeam('Tasks Create');
    const agentId = createTestAgent(team.id, { id: 'task-agent-1' });

    const res = await req(`/api/teams/${team.id}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ agentId, title: 'Do something', payload: { key: 'value' } }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.title).toBe('Do something');
    expect(data.status).toBe('pending');
    expect(data.agentId).toBe(agentId);
    expect(data.id).toBeDefined();
  });

  it('POST rejects missing agentId or title', async () => {
    const team = createTestTeam('Tasks Validation');
    const res = await req(`/api/teams/${team.id}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ title: 'No agent' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST rejects task for agent from another team', async () => {
    const teamA = createTestTeam('Tasks Team A');
    const teamB = createTestTeam('Tasks Team B');
    const agentA = createTestAgent(teamA.id, { id: 'task-cross-a' });

    const res = await req(`/api/teams/${teamB.id}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ agentId: agentA, title: 'Cross-team task' }),
    });
    expect(res.status).toBe(404);
  });

  it('GET / lists tasks filtered by agentId', async () => {
    const team = createTestTeam('Tasks List');
    const agentId = createTestAgent(team.id, { id: 'task-list-a' });
    const agentId2 = createTestAgent(team.id, { id: 'task-list-b' });

    await req(`/api/teams/${team.id}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ agentId, title: 'Task for A' }),
    });
    await req(`/api/teams/${team.id}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ agentId: agentId2, title: 'Task for B' }),
    });

    // Filter by agentId
    const res = await req(`/api/teams/${team.id}/tasks?agentId=${agentId}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe('Task for A');
  });

  it('GET / lists tasks filtered by status', async () => {
    const team = createTestTeam('Tasks Status');
    const agentId = createTestAgent(team.id, { id: 'task-status-a' });

    const createRes = await req(`/api/teams/${team.id}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ agentId, title: 'Pending task' }),
    });
    const task = await createRes.json();

    // Checkout to set in_progress
    await req(`/api/teams/${team.id}/tasks/${task.id}/checkout`, { method: 'POST' });

    // Filter by pending — should be empty now
    const res = await req(`/api/teams/${team.id}/tasks?status=pending`);
    const data = await res.json();
    const found = data.find((t: any) => t.id === task.id);
    expect(found).toBeUndefined();
  });

  it('GET /:id returns task with evaluations', async () => {
    const team = createTestTeam('Tasks Detail');
    const agentId = createTestAgent(team.id, { id: 'task-detail-a' });

    const createRes = await req(`/api/teams/${team.id}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ agentId, title: 'Detail task' }),
    });
    const task = await createRes.json();

    const res = await req(`/api/teams/${team.id}/tasks/${task.id}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.title).toBe('Detail task');
    expect(data.evaluations).toBeDefined();
    expect(data.evaluations).toHaveLength(0);
  });

  it('POST /:id/checkout atomically locks pending task', async () => {
    const team = createTestTeam('Tasks Checkout');
    const agentId = createTestAgent(team.id, { id: 'task-checkout-a' });

    const createRes = await req(`/api/teams/${team.id}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ agentId, title: 'Checkout task' }),
    });
    const task = await createRes.json();

    // First checkout succeeds
    const res1 = await req(`/api/teams/${team.id}/tasks/${task.id}/checkout`, { method: 'POST' });
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.status).toBe('in_progress');

    // Second checkout fails (already taken)
    const res2 = await req(`/api/teams/${team.id}/tasks/${task.id}/checkout`, { method: 'POST' });
    expect(res2.status).toBe(409);
  });

  it('PATCH /:id completes a task', async () => {
    const team = createTestTeam('Tasks Complete');
    const agentId = createTestAgent(team.id, { id: 'task-complete-a' });

    const createRes = await req(`/api/teams/${team.id}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ agentId, title: 'Complete me' }),
    });
    const task = await createRes.json();

    const res = await req(`/api/teams/${team.id}/tasks/${task.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'done', result: 'All done' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('done');
    expect(data.result).toBe('All done');
    expect(data.completedAt).toBeDefined();
  });

  it('PATCH /:id fails a task', async () => {
    const team = createTestTeam('Tasks Fail');
    const agentId = createTestAgent(team.id, { id: 'task-fail-a' });

    const createRes = await req(`/api/teams/${team.id}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ agentId, title: 'Fail me' }),
    });
    const task = await createRes.json();

    const res = await req(`/api/teams/${team.id}/tasks/${task.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'failed', result: { error: 'something broke' } }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('failed');
    expect(data.completedAt).toBeDefined();
  });
});
