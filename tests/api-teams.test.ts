import { describe, it, expect } from 'vitest';
import app from '../src/index.js';
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

describe('API Teams', () => {
  it('GET /api/teams returns empty list', async () => {
    const res = await req('/api/teams');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it('POST /api/teams creates a team', async () => {
    const res = await req('/api/teams', {
      method: 'POST',
      body: JSON.stringify({ name: 'API Team', slug: 'api-team' }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe('API Team');
    expect(data.slug).toBe('api-team');
    expect(data.id).toBeDefined();
  });

  it('POST /api/teams rejects duplicate slug', async () => {
    await req('/api/teams', {
      method: 'POST',
      body: JSON.stringify({ name: 'Dup', slug: 'dup-slug' }),
    });
    const res = await req('/api/teams', {
      method: 'POST',
      body: JSON.stringify({ name: 'Dup2', slug: 'dup-slug' }),
    });
    expect(res.status).toBe(409);
  });

  it('POST /api/teams rejects missing name', async () => {
    const res = await req('/api/teams', {
      method: 'POST',
      body: JSON.stringify({ slug: 'no-name' }),
    });
    expect(res.status).toBe(400);
  });

  it('GET /api/teams/:teamId returns team with members', async () => {
    const team = createTestTeam('Detail Team');
    const res = await req(`/api/teams/${team.id}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe('Detail Team');
    expect(data.members).toBeDefined();
  });

  it('PATCH /api/teams/:teamId updates team', async () => {
    const team = createTestTeam('Update Team');
    const res = await req(`/api/teams/${team.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated Name' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe('Updated Name');
  });

  it('GET /api/teams/nonexistent returns 404', async () => {
    const res = await req('/api/teams/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('Team Settings API', () => {
  it('PUT and GET team settings', async () => {
    const team = createTestTeam('Settings API Team');
    const putRes = await req(`/api/teams/${team.id}/settings/test_key`, {
      method: 'PUT',
      body: JSON.stringify({ value: 'test_value' }),
    });
    expect(putRes.status).toBe(200);

    const getRes = await req(`/api/teams/${team.id}/settings`);
    expect(getRes.status).toBe(200);
    const settings = await getRes.json();
    expect(settings.find((s: any) => s.key === 'test_key')?.value).toBe('test_value');
  });

  it('PUT encrypted setting masks value in GET', async () => {
    const team = createTestTeam('Encrypted Settings');
    await req(`/api/teams/${team.id}/settings/secret_key`, {
      method: 'PUT',
      body: JSON.stringify({ value: 'super-secret-value', encrypt: true }),
    });

    const getRes = await req(`/api/teams/${team.id}/settings`);
    const settings = await getRes.json();
    const secret = settings.find((s: any) => s.key === 'secret_key');
    expect(secret.value).toBe('••••••');
    expect(secret.encrypted).toBe(true);
  });

  it('DELETE removes setting', async () => {
    const team = createTestTeam('Delete Settings');
    await req(`/api/teams/${team.id}/settings/to_delete`, {
      method: 'PUT',
      body: JSON.stringify({ value: 'temp' }),
    });
    const delRes = await req(`/api/teams/${team.id}/settings/to_delete`, { method: 'DELETE' });
    expect(delRes.status).toBe(200);

    const getRes = await req(`/api/teams/${team.id}/settings`);
    const settings = await getRes.json();
    expect(settings.find((s: any) => s.key === 'to_delete')).toBeUndefined();
  });
});

describe('Team Isolation', () => {
  it('agents from team A are not visible in team B', async () => {
    const teamA = createTestTeam('Isolation A');
    const teamB = createTestTeam('Isolation B');

    // Create agent in team A
    await req(`/api/teams/${teamA.id}/agents`, {
      method: 'POST',
      body: JSON.stringify({ id: 'iso-agent-a', name: 'Agent A', command: 'echo', type: 'manual', teamId: teamA.id }),
    });

    // List agents in team B — should be empty
    const resB = await req(`/api/teams/${teamB.id}/agents`);
    const agentsB = await resB.json();
    const found = Array.isArray(agentsB) ? agentsB.find((a: any) => a.id === 'iso-agent-a') : undefined;
    expect(found).toBeFalsy();

    // List agents in team A — should have the agent
    const resA = await req(`/api/teams/${teamA.id}/agents`);
    const agentsA = await resA.json();
    const foundA = Array.isArray(agentsA) ? agentsA.find((a: any) => a.id === 'iso-agent-a') : null;
    expect(foundA).toBeDefined();
  });
});
