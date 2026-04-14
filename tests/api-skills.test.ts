import { describe, it, expect } from 'vitest';
import app from '../src/index.js';
import { createTestTeam, createTestSkill } from './helpers.js';

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

describe('API Skills CRUD', () => {
  it('POST creates a skill', async () => {
    const team = createTestTeam('Skills Create');
    const res = await req(`/api/teams/${team.id}/skills`, {
      method: 'POST',
      body: JSON.stringify({
        path: 'test/new-skill.md',
        name: 'New Skill',
        description: 'A brand new skill',
        content: '# New Skill\n\nSome instructions.',
        category: 'testing',
      }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.path).toBe('test/new-skill.md');
  });

  it('POST rejects missing path or content', async () => {
    const team = createTestTeam('Skills Validation');
    const res = await req(`/api/teams/${team.id}/skills`, {
      method: 'POST',
      body: JSON.stringify({ name: 'No path' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST upserts on duplicate teamId+path', async () => {
    const team = createTestTeam('Skills Upsert');

    await req(`/api/teams/${team.id}/skills`, {
      method: 'POST',
      body: JSON.stringify({ path: 'test/upsert.md', content: '# Version 1' }),
    });

    const res = await req(`/api/teams/${team.id}/skills`, {
      method: 'POST',
      body: JSON.stringify({ path: 'test/upsert.md', content: '# Version 2' }),
    });
    expect(res.status).toBe(201);

    // Read back — should be version 2
    const getRes = await req(`/api/teams/${team.id}/skills/test/upsert.md`);
    const data = await getRes.json();
    expect(data.content).toContain('Version 2');
  });

  it('GET / lists skills for team', async () => {
    const team = createTestTeam('Skills List');
    createTestSkill(team.id, 'test/list-skill-a.md');
    createTestSkill(team.id, 'test/list-skill-b.md');

    const res = await req(`/api/teams/${team.id}/skills`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(2);
    // List should not include content (only metadata)
    expect(data[0].content).toBeUndefined();
    expect(data[0].path).toBeDefined();
    expect(data[0].name).toBeDefined();
  });

  it('GET /:path returns skill content and usedBy', async () => {
    const team = createTestTeam('Skills Detail');
    createTestSkill(team.id, 'test/detail-skill.md');

    const res = await req(`/api/teams/${team.id}/skills/test/detail-skill.md`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.path).toBe('test/detail-skill.md');
    expect(data.content).toBeDefined();
    expect(data.usedBy).toBeDefined();
    expect(Array.isArray(data.usedBy)).toBe(true);
  });

  it('GET /:path returns 404 for nonexistent skill', async () => {
    const team = createTestTeam('Skills 404');
    const res = await req(`/api/teams/${team.id}/skills/nonexistent/path.md`);
    expect(res.status).toBe(404);
  });

  it('PUT /:path updates skill content', async () => {
    const team = createTestTeam('Skills Update');
    createTestSkill(team.id, 'test/update-skill.md');

    const res = await req(`/api/teams/${team.id}/skills/test/update-skill.md`, {
      method: 'PUT',
      body: JSON.stringify({ content: '# Updated Content\n\nBrand new text.' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    // Verify
    const getRes = await req(`/api/teams/${team.id}/skills/test/update-skill.md`);
    const skill = await getRes.json();
    expect(skill.content).toContain('Brand new text');
  });

  it('PUT returns 404 for nonexistent skill', async () => {
    const team = createTestTeam('Skills Put 404');
    const res = await req(`/api/teams/${team.id}/skills/nonexistent.md`, {
      method: 'PUT',
      body: JSON.stringify({ content: '# Nothing' }),
    });
    expect(res.status).toBe(404);
  });

  it('DELETE removes skill', async () => {
    const team = createTestTeam('Skills Delete');
    createTestSkill(team.id, 'test/delete-skill.md');

    const res = await req(`/api/teams/${team.id}/skills/test/delete-skill.md`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    // Verify gone
    const getRes = await req(`/api/teams/${team.id}/skills/test/delete-skill.md`);
    expect(getRes.status).toBe(404);
  });

  it('DELETE returns 404 for nonexistent skill', async () => {
    const team = createTestTeam('Skills Del 404');
    const res = await req(`/api/teams/${team.id}/skills/nothing.md`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});
