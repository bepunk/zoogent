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

describe('API Memory CRUD', () => {
  it('POST creates a memory', async () => {
    const team = createTestTeam('Memory Create');
    const agentId = createTestAgent(team.id, { id: 'mem-agent-1' });

    const res = await req(`/api/teams/${team.id}/memory`, {
      method: 'POST',
      body: JSON.stringify({ agentId, content: 'Learned something important', importance: 8, tags: ['insight'] }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.content).toBe('Learned something important');
    expect(data.importance).toBe(8);
    expect(data.source).toBe('manual');
    expect(data.id).toBeDefined();
  });

  it('POST rejects missing agentId or content', async () => {
    const team = createTestTeam('Memory Validation');
    const res = await req(`/api/teams/${team.id}/memory`, {
      method: 'POST',
      body: JSON.stringify({ content: 'No agent' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST rejects agent from another team', async () => {
    const teamA = createTestTeam('Memory Team A');
    const teamB = createTestTeam('Memory Team B');
    const agentA = createTestAgent(teamA.id, { id: 'mem-cross-a' });

    const res = await req(`/api/teams/${teamB.id}/memory`, {
      method: 'POST',
      body: JSON.stringify({ agentId: agentA, content: 'Cross-team memory' }),
    });
    expect(res.status).toBe(404);
  });

  it('GET / lists memories for team', async () => {
    const team = createTestTeam('Memory List');
    const agentId = createTestAgent(team.id, { id: 'mem-list-a' });

    await req(`/api/teams/${team.id}/memory`, {
      method: 'POST',
      body: JSON.stringify({ agentId, content: 'Memory one' }),
    });
    await req(`/api/teams/${team.id}/memory`, {
      method: 'POST',
      body: JSON.stringify({ agentId, content: 'Memory two' }),
    });

    const res = await req(`/api/teams/${team.id}/memory`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.length).toBeGreaterThanOrEqual(2);
  });

  it('GET / filters by agentId', async () => {
    const team = createTestTeam('Memory Filter');
    const agent1 = createTestAgent(team.id, { id: 'mem-filter-a' });
    const agent2 = createTestAgent(team.id, { id: 'mem-filter-b' });

    await req(`/api/teams/${team.id}/memory`, {
      method: 'POST',
      body: JSON.stringify({ agentId: agent1, content: 'Agent A memory' }),
    });
    await req(`/api/teams/${team.id}/memory`, {
      method: 'POST',
      body: JSON.stringify({ agentId: agent2, content: 'Agent B memory' }),
    });

    const res = await req(`/api/teams/${team.id}/memory?agentId=${agent1}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.every((m: any) => m.agentId === agent1)).toBe(true);
  });

  it('GET / searches via FTS5 query', async () => {
    const team = createTestTeam('Memory Search');
    const agentId = createTestAgent(team.id, { id: 'mem-search-a' });

    await req(`/api/teams/${team.id}/memory`, {
      method: 'POST',
      body: JSON.stringify({ agentId, content: 'The quantum flux capacitor is operational' }),
    });
    await req(`/api/teams/${team.id}/memory`, {
      method: 'POST',
      body: JSON.stringify({ agentId, content: 'Grocery list: eggs, milk, bread' }),
    });

    const res = await req(`/api/teams/${team.id}/memory?search=quantum flux`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.length).toBeGreaterThanOrEqual(1);
    expect(data[0].content).toContain('quantum');
  });

  it('PATCH /:id updates memory content and importance', async () => {
    const team = createTestTeam('Memory Patch');
    const agentId = createTestAgent(team.id, { id: 'mem-patch-a' });

    const createRes = await req(`/api/teams/${team.id}/memory`, {
      method: 'POST',
      body: JSON.stringify({ agentId, content: 'Original memory', importance: 5 }),
    });
    const memory = await createRes.json();

    const res = await req(`/api/teams/${team.id}/memory/${memory.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ content: 'Updated memory', importance: 9 }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.content).toBe('Updated memory');
    expect(data.importance).toBe(9);
  });

  it('PATCH /:id can deactivate a memory', async () => {
    const team = createTestTeam('Memory Deactivate');
    const agentId = createTestAgent(team.id, { id: 'mem-deact-a' });

    const createRes = await req(`/api/teams/${team.id}/memory`, {
      method: 'POST',
      body: JSON.stringify({ agentId, content: 'To be deactivated' }),
    });
    const memory = await createRes.json();

    const res = await req(`/api/teams/${team.id}/memory/${memory.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: false }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.active).toBe(false);
  });

  it('DELETE removes memory', async () => {
    const team = createTestTeam('Memory Delete');
    const agentId = createTestAgent(team.id, { id: 'mem-del-a' });

    const createRes = await req(`/api/teams/${team.id}/memory`, {
      method: 'POST',
      body: JSON.stringify({ agentId, content: 'Delete me' }),
    });
    const memory = await createRes.json();

    const res = await req(`/api/teams/${team.id}/memory/${memory.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it('DELETE returns 404 for nonexistent memory', async () => {
    const team = createTestTeam('Memory Del 404');
    const res = await req(`/api/teams/${team.id}/memory/99999`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});
