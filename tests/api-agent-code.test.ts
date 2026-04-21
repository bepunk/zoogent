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

describe('POST /agents with typescript runtime', () => {
  it('creates a typescript agent and bundles source atomically', async () => {
    const team = createTestTeam('ts-create');
    const res = await req(`/api/teams/${team.id}/agents`, {
      method: 'POST',
      body: JSON.stringify({
        id: 'ts-agent-1',
        name: 'TS Agent 1',
        source: `import Anthropic from '@anthropic-ai/sdk'; console.log(typeof Anthropic);`,
      }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe('ts-agent-1');
    expect(data.runtime).toBe('typescript');
    expect(data.source).toBeUndefined();
    expect(data.bundle).toBeUndefined();
  });

  it('creates a typescript agent without source (deferred upload)', async () => {
    const team = createTestTeam('ts-defer');
    const res = await req(`/api/teams/${team.id}/agents`, {
      method: 'POST',
      body: JSON.stringify({ id: 'ts-defer-1', name: 'Deferred' }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.runtime).toBe('typescript');
  });

  it('rejects typescript agent with invalid source atomically (agent not created)', async () => {
    const team = createTestTeam('ts-bad');
    const res = await req(`/api/teams/${team.id}/agents`, {
      method: 'POST',
      body: JSON.stringify({
        id: 'ts-bad-1',
        name: 'Bad TS',
        source: `import x from 'no-such-lib'; console.log(x);`,
      }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/bundle failed/i);
    expect(data.details).toContain('no-such-lib');

    // Verify atomic — agent should NOT have been inserted
    const getRes = await req(`/api/teams/${team.id}/agents/ts-bad-1`);
    expect(getRes.status).toBe(404);
  });

  it('rejects invalid id', async () => {
    const team = createTestTeam('ts-invalid-id');
    const res = await req(`/api/teams/${team.id}/agents`, {
      method: 'POST',
      body: JSON.stringify({ id: 'bad id with spaces!', name: 'X' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /agents with exec runtime', () => {
  it('creates an exec agent with command+args', async () => {
    const team = createTestTeam('exec-create');
    const res = await req(`/api/teams/${team.id}/agents`, {
      method: 'POST',
      body: JSON.stringify({
        id: 'exec-1', name: 'Exec 1',
        runtime: 'exec',
        command: 'echo',
        args: ['hi'],
      }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.runtime).toBe('exec');
    expect(data.command).toBe('echo');
  });

  it('rejects exec agent without command', async () => {
    const team = createTestTeam('exec-no-cmd');
    const res = await req(`/api/teams/${team.id}/agents`, {
      method: 'POST',
      body: JSON.stringify({ id: 'exec-2', name: 'Exec 2', runtime: 'exec' }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/command/i);
  });
});

describe('PUT /agents/:id/code', () => {
  it('uploads code and returns hash', async () => {
    const team = createTestTeam('code-put');
    await req(`/api/teams/${team.id}/agents`, {
      method: 'POST',
      body: JSON.stringify({ id: 'code-put-1', name: 'Code Put' }),
    });

    const res = await req(`/api/teams/${team.id}/agents/code-put-1/code`, {
      method: 'PUT',
      body: JSON.stringify({ source: `console.log('ok');` }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns 400 on bundle error without corrupting state', async () => {
    const team = createTestTeam('code-put-bad');
    await req(`/api/teams/${team.id}/agents`, {
      method: 'POST',
      body: JSON.stringify({
        id: 'code-put-bad-1', name: 'Bad',
        source: `console.log('first-valid');`,
      }),
    });

    const res = await req(`/api/teams/${team.id}/agents/code-put-bad-1/code`, {
      method: 'PUT',
      body: JSON.stringify({ source: `import x from 'unknown-lib-xyz'; console.log(x);` }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/bundle failed/i);
    expect(data.details).toContain('unknown-lib-xyz');

    // GET /code should surface the stored source + bundleError
    const getRes = await req(`/api/teams/${team.id}/agents/code-put-bad-1/code`);
    expect(getRes.status).toBe(200);
    const codeData = await getRes.json();
    expect(codeData.source).toContain('unknown-lib-xyz');
    expect(codeData.bundleError).toContain('unknown-lib-xyz');
  });

  it('returns 400 for exec-runtime agents', async () => {
    const team = createTestTeam('code-put-exec');
    await req(`/api/teams/${team.id}/agents`, {
      method: 'POST',
      body: JSON.stringify({
        id: 'code-put-exec-1', name: 'Exec',
        runtime: 'exec', command: 'echo',
      }),
    });

    const res = await req(`/api/teams/${team.id}/agents/code-put-exec-1/code`, {
      method: 'PUT',
      body: JSON.stringify({ source: `console.log('x');` }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for nonexistent agent', async () => {
    const team = createTestTeam('code-put-404');
    const res = await req(`/api/teams/${team.id}/agents/nope/code`, {
      method: 'PUT',
      body: JSON.stringify({ source: `console.log('x');` }),
    });
    expect(res.status).toBe(404);
  });

  it('rejects missing source in body', async () => {
    const team = createTestTeam('code-put-nobody');
    await req(`/api/teams/${team.id}/agents`, {
      method: 'POST',
      body: JSON.stringify({ id: 'code-put-nobody-1', name: 'X' }),
    });
    const res = await req(`/api/teams/${team.id}/agents/code-put-nobody-1/code`, {
      method: 'PUT',
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('enforces team isolation', async () => {
    const teamA = createTestTeam('iso-a');
    const teamB = createTestTeam('iso-b');
    await req(`/api/teams/${teamA.id}/agents`, {
      method: 'POST',
      body: JSON.stringify({ id: 'iso-a1', name: 'Iso A1' }),
    });

    const res = await req(`/api/teams/${teamB.id}/agents/iso-a1/code`, {
      method: 'PUT',
      body: JSON.stringify({ source: `console.log('x');` }),
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /agents/:id/code', () => {
  it('returns stored source after upload', async () => {
    const team = createTestTeam('code-get-api');
    await req(`/api/teams/${team.id}/agents`, {
      method: 'POST',
      body: JSON.stringify({
        id: 'code-get-api-1', name: 'GetCode',
        source: `console.log('get-me');`,
      }),
    });

    const res = await req(`/api/teams/${team.id}/agents/code-get-api-1/code`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.source).toContain('get-me');
    expect(data.bundleHash).toMatch(/^[a-f0-9]{64}$/);
    expect(data.bundleError).toBeNull();
  });

  it('returns 400 for exec-runtime agent', async () => {
    const team = createTestTeam('code-get-exec');
    await req(`/api/teams/${team.id}/agents`, {
      method: 'POST',
      body: JSON.stringify({
        id: 'code-get-exec-1', name: 'E',
        runtime: 'exec', command: 'echo',
      }),
    });
    const res = await req(`/api/teams/${team.id}/agents/code-get-exec-1/code`);
    expect(res.status).toBe(400);
  });
});

describe('PATCH /agents/:id rejects code-related fields', () => {
  it('rejects source field in PATCH (must use PUT /code)', async () => {
    const team = createTestTeam('patch-reject-src');
    createTestAgent(team.id, { id: 'patch-rs-1', runtime: 'exec' });

    const res = await req(`/api/teams/${team.id}/agents/patch-rs-1`, {
      method: 'PATCH',
      body: JSON.stringify({ source: `console.log('x');` }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects runtime change', async () => {
    const team = createTestTeam('patch-reject-rt');
    createTestAgent(team.id, { id: 'patch-rt-1', runtime: 'exec' });

    const res = await req(`/api/teams/${team.id}/agents/patch-rt-1`, {
      method: 'PATCH',
      body: JSON.stringify({ runtime: 'typescript' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects command/args on typescript agent', async () => {
    const team = createTestTeam('patch-reject-cmd');
    await req(`/api/teams/${team.id}/agents`, {
      method: 'POST',
      body: JSON.stringify({ id: 'patch-cmd-1', name: 'TS' }),
    });

    const res = await req(`/api/teams/${team.id}/agents/patch-cmd-1`, {
      method: 'PATCH',
      body: JSON.stringify({ command: 'echo' }),
    });
    expect(res.status).toBe(400);
  });
});
