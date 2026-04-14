import { describe, it, expect } from 'vitest';
import app from '../src/index.js';
import { createTestTeam, createTestAgent, createTestSkill } from './helpers.js';

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

describe('API Agents CRUD', () => {
  it('POST creates an agent', async () => {
    const team = createTestTeam('Agents CRUD');
    const res = await req(`/api/teams/${team.id}/agents`, {
      method: 'POST',
      body: JSON.stringify({ id: 'crud-agent-1', name: 'Agent One', command: 'echo', type: 'manual' }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe('crud-agent-1');
    expect(data.name).toBe('Agent One');
    expect(data.env).toBeUndefined(); // env never exposed
  });

  it('POST rejects missing required fields', async () => {
    const team = createTestTeam('Agents Validation');
    const res = await req(`/api/teams/${team.id}/agents`, {
      method: 'POST',
      body: JSON.stringify({ name: 'No ID' }),
    });
    expect(res.status).toBe(400);
  });

  it('GET / lists agents for the team', async () => {
    const team = createTestTeam('Agents List');
    createTestAgent(team.id, { id: 'list-a1', name: 'Alpha' });
    createTestAgent(team.id, { id: 'list-a2', name: 'Beta' });

    const res = await req(`/api/teams/${team.id}/agents`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(2);
    expect(data[0].running).toBe(false);
    expect(data[0].skills).toBeDefined();
  });

  it('GET /:id returns agent detail', async () => {
    const team = createTestTeam('Agent Detail');
    createTestAgent(team.id, { id: 'detail-a1' });

    const res = await req(`/api/teams/${team.id}/agents/detail-a1`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe('detail-a1');
    expect(data.runs).toBeDefined();
    expect(data.skills).toBeDefined();
    expect(data.monthlySpendCents).toBeDefined();
  });

  it('GET /:id returns 404 for nonexistent agent', async () => {
    const team = createTestTeam('Agent 404');
    const res = await req(`/api/teams/${team.id}/agents/nonexistent`);
    expect(res.status).toBe(404);
  });

  it('PATCH /:id updates agent', async () => {
    const team = createTestTeam('Agent Patch');
    createTestAgent(team.id, { id: 'patch-a1', name: 'Old Name' });

    const res = await req(`/api/teams/${team.id}/agents/patch-a1`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'New Name', description: 'Updated' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe('New Name');
    expect(data.description).toBe('Updated');
    expect(data.env).toBeUndefined();
  });

  it('DELETE /:id removes agent', async () => {
    const team = createTestTeam('Agent Delete');
    createTestAgent(team.id, { id: 'del-a1' });

    const res = await req(`/api/teams/${team.id}/agents/del-a1`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    // Verify it's gone
    const getRes = await req(`/api/teams/${team.id}/agents/del-a1`);
    expect(getRes.status).toBe(404);
  });
});

describe('API Agent Trigger / Enable / Disable', () => {
  it('POST /:id/trigger returns 409 when agent is disabled', async () => {
    const team = createTestTeam('Agent Trigger');
    createTestAgent(team.id, { id: 'trig-a1' });

    // Disable first
    await req(`/api/teams/${team.id}/agents/trig-a1/disable`, { method: 'POST' });

    const res = await req(`/api/teams/${team.id}/agents/trig-a1/trigger`, { method: 'POST' });
    // Disabled agent should return 409
    expect(res.status).toBe(409);
  });

  it('POST /:id/enable and /disable toggle agent', async () => {
    const team = createTestTeam('Agent Toggle');
    createTestAgent(team.id, { id: 'toggle-a1' });

    const disableRes = await req(`/api/teams/${team.id}/agents/toggle-a1/disable`, { method: 'POST' });
    expect(disableRes.status).toBe(200);

    // Verify disabled via detail
    const detailRes = await req(`/api/teams/${team.id}/agents/toggle-a1`);
    const detail = await detailRes.json();
    expect(detail.enabled).toBe(false);

    const enableRes = await req(`/api/teams/${team.id}/agents/toggle-a1/enable`, { method: 'POST' });
    expect(enableRes.status).toBe(200);

    const detail2Res = await req(`/api/teams/${team.id}/agents/toggle-a1`);
    const detail2 = await detail2Res.json();
    expect(detail2.enabled).toBe(true);
  });
});

describe('API Agent Runs', () => {
  it('GET /:id/runs returns empty array for new agent', async () => {
    const team = createTestTeam('Agent Runs');
    createTestAgent(team.id, { id: 'runs-a1' });

    const res = await req(`/api/teams/${team.id}/agents/runs-a1/runs`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([]);
  });
});

describe('API Agent Skills Assignment', () => {
  it('POST assign-skill and unassign-skill', async () => {
    const team = createTestTeam('Agent Skills');
    createTestAgent(team.id, { id: 'skill-a1' });
    const skillPath = createTestSkill(team.id, 'test/assign-skill.md');

    // Assign
    const assignRes = await req(`/api/teams/${team.id}/agents/skill-a1/assign-skill`, {
      method: 'POST',
      body: JSON.stringify({ skillPath }),
    });
    expect(assignRes.status).toBe(200);

    // Verify in agent detail
    const detailRes = await req(`/api/teams/${team.id}/agents/skill-a1`);
    const detail = await detailRes.json();
    expect(detail.skills.some((s: any) => s.skillPath === skillPath)).toBe(true);

    // Duplicate assign returns 409
    const dupRes = await req(`/api/teams/${team.id}/agents/skill-a1/assign-skill`, {
      method: 'POST',
      body: JSON.stringify({ skillPath }),
    });
    expect(dupRes.status).toBe(409);

    // Unassign
    const unassignRes = await req(`/api/teams/${team.id}/agents/skill-a1/unassign-skill`, {
      method: 'POST',
      body: JSON.stringify({ skillPath }),
    });
    expect(unassignRes.status).toBe(200);
  });

  it('assign-skill returns 400 without skillPath', async () => {
    const team = createTestTeam('Agent Skills Err');
    createTestAgent(team.id, { id: 'skill-a2' });

    const res = await req(`/api/teams/${team.id}/agents/skill-a2/assign-skill`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe('API Agent Store', () => {
  it('GET store is empty for new agent', async () => {
    const team = createTestTeam('Agent Store');
    createTestAgent(team.id, { id: 'store-a1' });

    const res = await req(`/api/teams/${team.id}/agents/store-a1/store`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([]);
  });

  it('DELETE store key returns 404 for nonexistent key', async () => {
    const team = createTestTeam('Agent Store Del');
    createTestAgent(team.id, { id: 'store-a2' });

    const res = await req(`/api/teams/${team.id}/agents/store-a2/store/nope`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});
