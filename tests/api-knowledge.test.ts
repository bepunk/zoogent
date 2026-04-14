import { describe, it, expect } from 'vitest';
import app from '../src/index.js';
import { getDb } from '../src/db/index.js';
import { teamKnowledge } from '../src/db/schema.js';
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

/** Insert knowledge directly via DB (simulating agent proposal). */
function insertKnowledge(teamId: string, title: string, content: string, agentId?: string, status: 'draft' | 'active' | 'archived' = 'draft') {
  const db = getDb();
  return db.insert(teamKnowledge).values({
    teamId,
    title,
    content,
    status,
    proposedByAgentId: agentId ?? null,
  }).returning().get();
}

describe('API Team Knowledge', () => {
  it('GET / lists knowledge entries', async () => {
    const team = createTestTeam('Knowledge List');
    const agentId = createTestAgent(team.id, { id: 'know-agent-1' });

    insertKnowledge(team.id, 'Finding 1', 'We discovered X', agentId);
    insertKnowledge(team.id, 'Finding 2', 'We discovered Y', agentId);

    const res = await req(`/api/teams/${team.id}/knowledge`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(2);
    expect(data[0].title).toBeDefined();
    expect(data[0].content).toBeDefined();
    expect(data[0].status).toBe('draft');
  });

  it('GET / filters by status', async () => {
    const team = createTestTeam('Knowledge Status');
    const agentId = createTestAgent(team.id, { id: 'know-agent-2' });

    insertKnowledge(team.id, 'Draft', 'Draft content', agentId, 'draft');
    insertKnowledge(team.id, 'Active', 'Active content', agentId, 'active');
    insertKnowledge(team.id, 'Archived', 'Old content', agentId, 'archived');

    const draftRes = await req(`/api/teams/${team.id}/knowledge?status=draft`);
    const drafts = await draftRes.json();
    expect(drafts).toHaveLength(1);
    expect(drafts[0].title).toBe('Draft');

    const activeRes = await req(`/api/teams/${team.id}/knowledge?status=active`);
    const actives = await activeRes.json();
    expect(actives).toHaveLength(1);
    expect(actives[0].title).toBe('Active');
  });

  it('POST /:id/approve sets status to active', async () => {
    const team = createTestTeam('Knowledge Approve');
    const agentId = createTestAgent(team.id, { id: 'know-agent-3' });
    const entry = insertKnowledge(team.id, 'Pending approval', 'Important finding', agentId);

    const res = await req(`/api/teams/${team.id}/knowledge/${entry.id}/approve`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    // Verify status changed
    const listRes = await req(`/api/teams/${team.id}/knowledge?status=active`);
    const list = await listRes.json();
    const approved = list.find((k: any) => k.id === entry.id);
    expect(approved).toBeDefined();
    expect(approved.status).toBe('active');
    expect(approved.approvedAt).toBeDefined();
  });

  it('POST /:id/archive sets status to archived', async () => {
    const team = createTestTeam('Knowledge Archive');
    const agentId = createTestAgent(team.id, { id: 'know-agent-4' });
    const entry = insertKnowledge(team.id, 'To archive', 'Outdated info', agentId, 'active');

    const res = await req(`/api/teams/${team.id}/knowledge/${entry.id}/archive`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    // Verify status changed
    const listRes = await req(`/api/teams/${team.id}/knowledge?status=archived`);
    const list = await listRes.json();
    const archived = list.find((k: any) => k.id === entry.id);
    expect(archived).toBeDefined();
    expect(archived.status).toBe('archived');
  });

  it('knowledge is team-scoped', async () => {
    const teamA = createTestTeam('Knowledge Isolation A');
    const teamB = createTestTeam('Knowledge Isolation B');
    const agentA = createTestAgent(teamA.id, { id: 'know-iso-a' });

    insertKnowledge(teamA.id, 'Team A only', 'Secret stuff', agentA);

    const resB = await req(`/api/teams/${teamB.id}/knowledge`);
    const dataB = await resB.json();
    expect(dataB.find((k: any) => k.title === 'Team A only')).toBeUndefined();

    const resA = await req(`/api/teams/${teamA.id}/knowledge`);
    const dataA = await resA.json();
    expect(dataA.find((k: any) => k.title === 'Team A only')).toBeDefined();
  });
});
