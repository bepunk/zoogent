import { describe, it, expect } from 'vitest';
import app from '../src/index.js';

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

describe('API System Skills', () => {
  it('GET /api/system-skills returns 6 seeded skills', async () => {
    const res = await req('/api/system-skills');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(7);

    const paths = data.map((s: any) => s.path);
    expect(paths).toContain('system/team-design.md');
    expect(paths).toContain('system/agent-patterns.md');
    expect(paths).toContain('system/code-generation.md');
    expect(paths).toContain('system/debugging.md');
    expect(paths).toContain('system/skill-writing.md');
    expect(paths).toContain('system/platform-rules.md');
  });

  it('GET /api/system-skills list does not include content', async () => {
    const res = await req('/api/system-skills');
    const data = await res.json();
    // The list endpoint selects only path, name, description, category
    expect(data[0].content).toBeUndefined();
    expect(data[0].path).toBeDefined();
    expect(data[0].name).toBeDefined();
    expect(data[0].category).toBe('system');
  });

  it('GET /api/system-skills/:path returns skill with content', async () => {
    const res = await req('/api/system-skills/system/team-design.md');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.path).toBe('system/team-design.md');
    expect(data.name).toBe('Team Design Framework');
    expect(data.content).toBeDefined();
    expect(data.content.length).toBeGreaterThan(100);
  });

  it('GET /api/system-skills/:path returns 404 for nonexistent', async () => {
    const res = await req('/api/system-skills/nonexistent/skill.md');
    expect(res.status).toBe(404);
  });

  it('all seeded skills have non-empty content', async () => {
    const listRes = await req('/api/system-skills');
    const skills = await listRes.json();

    for (const skill of skills) {
      const detailRes = await req(`/api/system-skills/${skill.path}`);
      expect(detailRes.status).toBe(200);
      const detail = await detailRes.json();
      expect(detail.content).toBeTruthy();
      expect(detail.content.length).toBeGreaterThan(50);
    }
  });
});
