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

describe('API Agent Integrations', () => {
  it('POST creates an integration with masked credentials', async () => {
    const team = createTestTeam('Int Create');
    const agentId = createTestAgent(team.id, { id: 'int-agent-1' });

    const res = await req(`/api/teams/${team.id}/agents/${agentId}/integrations`, {
      method: 'POST',
      body: JSON.stringify({
        provider: 'gmail',
        name: 'my_gmail',
        credentials: { client_id: 'abc123456', client_secret: 'secret789' },
      }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.provider).toBe('gmail');
    expect(data.name).toBe('my_gmail');
    // Credentials should be masked (first 4 chars + dots)
    expect(data.credentials.client_id).toBe('abc1••••');
    expect(data.credentials.client_secret).toBe('secr••••');
    expect(data.id).toBeDefined();
  });

  it('POST rejects missing fields', async () => {
    const team = createTestTeam('Int Validation');
    const agentId = createTestAgent(team.id, { id: 'int-agent-2' });

    const res = await req(`/api/teams/${team.id}/agents/${agentId}/integrations`, {
      method: 'POST',
      body: JSON.stringify({ provider: 'gmail' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST rejects invalid name format', async () => {
    const team = createTestTeam('Int Name');
    const agentId = createTestAgent(team.id, { id: 'int-agent-3' });

    const res = await req(`/api/teams/${team.id}/agents/${agentId}/integrations`, {
      method: 'POST',
      body: JSON.stringify({
        provider: 'gmail',
        name: 'Invalid-Name!',
        credentials: { key: 'val' },
      }),
    });
    expect(res.status).toBe(400);
  });

  it('GET lists integrations with masked credentials', async () => {
    const team = createTestTeam('Int List');
    const agentId = createTestAgent(team.id, { id: 'int-agent-4' });

    // Create two integrations
    await req(`/api/teams/${team.id}/agents/${agentId}/integrations`, {
      method: 'POST',
      body: JSON.stringify({ provider: 'telegram', name: 'tg_bot', credentials: { token: 'bot_token_12345' } }),
    });
    await req(`/api/teams/${team.id}/agents/${agentId}/integrations`, {
      method: 'POST',
      body: JSON.stringify({ provider: 'tavily', name: 'tavily_api', credentials: { api_key: 'tvly_abcdef' } }),
    });

    const res = await req(`/api/teams/${team.id}/agents/${agentId}/integrations`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(2);
    // All credentials should be masked
    for (const int of data) {
      for (const val of Object.values(int.credentials) as string[]) {
        expect(val).toContain('••••');
      }
    }
  });

  it('POST rejects duplicate name for same agent (unique constraint)', async () => {
    const team = createTestTeam('Int Dup');
    const agentId = createTestAgent(team.id, { id: 'int-agent-5' });

    await req(`/api/teams/${team.id}/agents/${agentId}/integrations`, {
      method: 'POST',
      body: JSON.stringify({ provider: 'gmail', name: 'dup_name', credentials: { key: 'v1' } }),
    });

    const res = await req(`/api/teams/${team.id}/agents/${agentId}/integrations`, {
      method: 'POST',
      body: JSON.stringify({ provider: 'telegram', name: 'dup_name', credentials: { key: 'v2' } }),
    });
    expect(res.status).toBe(409);
  });

  it('PATCH updates integration credentials', async () => {
    const team = createTestTeam('Int Patch');
    const agentId = createTestAgent(team.id, { id: 'int-agent-6' });

    const createRes = await req(`/api/teams/${team.id}/agents/${agentId}/integrations`, {
      method: 'POST',
      body: JSON.stringify({ provider: 'gmail', name: 'patch_int', credentials: { key: 'old_value' } }),
    });
    const created = await createRes.json();

    const patchRes = await req(`/api/teams/${team.id}/agents/${agentId}/integrations/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ credentials: { key: 'new_value_1234' } }),
    });
    expect(patchRes.status).toBe(200);
  });

  it('PATCH updates enabled flag', async () => {
    const team = createTestTeam('Int Enable');
    const agentId = createTestAgent(team.id, { id: 'int-agent-7' });

    const createRes = await req(`/api/teams/${team.id}/agents/${agentId}/integrations`, {
      method: 'POST',
      body: JSON.stringify({ provider: 'custom', name: 'toggle_int', credentials: { x: 'y12345' } }),
    });
    const created = await createRes.json();

    const patchRes = await req(`/api/teams/${team.id}/agents/${agentId}/integrations/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: false }),
    });
    expect(patchRes.status).toBe(200);
    const data = await patchRes.json();
    expect(data.enabled).toBe(false);
  });

  it('DELETE removes integration', async () => {
    const team = createTestTeam('Int Delete');
    const agentId = createTestAgent(team.id, { id: 'int-agent-8' });

    const createRes = await req(`/api/teams/${team.id}/agents/${agentId}/integrations`, {
      method: 'POST',
      body: JSON.stringify({ provider: 'gmail', name: 'del_int', credentials: { key: 'val123' } }),
    });
    const created = await createRes.json();

    const delRes = await req(`/api/teams/${team.id}/agents/${agentId}/integrations/${created.id}`, {
      method: 'DELETE',
    });
    expect(delRes.status).toBe(200);
    expect((await delRes.json()).ok).toBe(true);

    // Verify gone
    const listRes = await req(`/api/teams/${team.id}/agents/${agentId}/integrations`);
    const list = await listRes.json();
    expect(list).toHaveLength(0);
  });

  it('DELETE returns 404 for nonexistent integration', async () => {
    const team = createTestTeam('Int Del 404');
    const agentId = createTestAgent(team.id, { id: 'int-agent-9' });

    const res = await req(`/api/teams/${team.id}/agents/${agentId}/integrations/nonexistent`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(404);
  });
});
