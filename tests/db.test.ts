import { describe, it, expect } from 'vitest';
import { getDb } from '../src/db/index.js';
import { teams, teamMembers, teamSettings, agents, agentRuns, agentSkills, skills, agentMemories, agentTasks, agentStore, agentIntegrations, teamKnowledge, chatMessages, settings, systemSkills, costEvents } from '../src/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { createTestTeam, createTestAgent, createTestSkill } from './helpers.js';

describe('Database Schema', () => {
  describe('Teams', () => {
    it('creates and reads a team', () => {
      const team = createTestTeam('DB Test Team');
      const db = getDb();
      const found = db.select().from(teams).where(eq(teams.id, team.id)).get();
      expect(found).toBeDefined();
      expect(found!.name).toBe('DB Test Team');
      expect(found!.slug).toBe('db-test-team');
    });

    it('enforces unique slug', () => {
      createTestTeam('Unique Slug');
      expect(() => createTestTeam('Unique Slug')).toThrow();
    });
  });

  describe('Agents', () => {
    it('creates agent in a team', () => {
      const team = createTestTeam('Agent Team');
      const agentId = createTestAgent(team.id);
      const db = getDb();
      const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
      expect(agent).toBeDefined();
      expect(agent!.teamId).toBe(team.id);
    });

    it('cascades delete when team is deleted', () => {
      const team = createTestTeam('Cascade Team');
      const agentId = createTestAgent(team.id);
      const db = getDb();
      db.delete(teams).where(eq(teams.id, team.id)).run();
      const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
      expect(agent).toBeUndefined();
    });
  });

  describe('Skills', () => {
    it('creates skill in a team', () => {
      const team = createTestTeam('Skill Team');
      const path = createTestSkill(team.id);
      const db = getDb();
      const skill = db.select().from(skills).where(eq(skills.path, path)).get();
      expect(skill).toBeDefined();
      expect(skill!.teamId).toBe(team.id);
    });
  });

  describe('Agent Store', () => {
    it('creates and reads key-value pairs', () => {
      const team = createTestTeam('Store Team');
      const agentId = createTestAgent(team.id);
      const db = getDb();
      db.insert(agentStore).values({ agentId, key: 'test_key', value: JSON.stringify({ foo: 'bar' }) }).run();
      const entry = db.select().from(agentStore).where(and(eq(agentStore.agentId, agentId), eq(agentStore.key, 'test_key'))).get();
      expect(entry).toBeDefined();
      expect(JSON.parse(entry!.value)).toEqual({ foo: 'bar' });
    });

    it('enforces unique agent+key', () => {
      const team = createTestTeam('Store Unique');
      const agentId = createTestAgent(team.id);
      const db = getDb();
      db.insert(agentStore).values({ agentId, key: 'dup_key', value: '"v1"' }).run();
      expect(() => db.insert(agentStore).values({ agentId, key: 'dup_key', value: '"v2"' }).run()).toThrow();
    });
  });

  describe('Agent Integrations', () => {
    it('creates integration with encrypted credentials', () => {
      const team = createTestTeam('Int Team');
      const agentId = createTestAgent(team.id);
      const db = getDb();
      db.insert(agentIntegrations).values({
        id: 'int-1', agentId, provider: 'google_maps', name: 'gmaps',
        credentials: 'encrypted-blob',
      }).run();
      const int = db.select().from(agentIntegrations).where(eq(agentIntegrations.id, 'int-1')).get();
      expect(int).toBeDefined();
      expect(int!.provider).toBe('google_maps');
      expect(int!.name).toBe('gmaps');
    });

    it('enforces unique agent+name', () => {
      const team = createTestTeam('Int Unique');
      const agentId = createTestAgent(team.id);
      const db = getDb();
      db.insert(agentIntegrations).values({ id: 'int-u1', agentId, provider: 'gmail', name: 'gmail_main', credentials: 'x' }).run();
      expect(() => db.insert(agentIntegrations).values({ id: 'int-u2', agentId, provider: 'gmail', name: 'gmail_main', credentials: 'y' }).run()).toThrow();
    });

    it('allows same provider with different names', () => {
      const team = createTestTeam('Int Multi');
      const agentId = createTestAgent(team.id);
      const db = getDb();
      db.insert(agentIntegrations).values({ id: 'int-m1', agentId, provider: 'gmail', name: 'gmail_support', credentials: 'x' }).run();
      db.insert(agentIntegrations).values({ id: 'int-m2', agentId, provider: 'gmail', name: 'gmail_sales', credentials: 'y' }).run();
      const ints = db.select().from(agentIntegrations).where(eq(agentIntegrations.agentId, agentId)).all();
      expect(ints).toHaveLength(2);
    });
  });

  describe('Team Settings', () => {
    it('stores and reads per-team setting', () => {
      const team = createTestTeam('Settings Team');
      const db = getDb();
      db.insert(teamSettings).values({ teamId: team.id, key: 'test_setting', value: 'test_value' }).run();
      const setting = db.select().from(teamSettings)
        .where(and(eq(teamSettings.teamId, team.id), eq(teamSettings.key, 'test_setting'))).get();
      expect(setting!.value).toBe('test_value');
    });
  });

  describe('System Skills', () => {
    it('has seeded system skills', () => {
      const db = getDb();
      const all = db.select().from(systemSkills).all();
      expect(all.length).toBe(6);
      const paths = all.map(s => s.path);
      expect(paths).toContain('system/team-design.md');
      expect(paths).toContain('system/agent-patterns.md');
      expect(paths).toContain('system/code-generation.md');
    });
  });

  describe('Chat Messages', () => {
    it('stores team-scoped messages', () => {
      const team = createTestTeam('Chat Team');
      const db = getDb();
      db.insert(chatMessages).values({ teamId: team.id, role: 'user', content: 'Hello Architect' }).run();
      db.insert(chatMessages).values({ teamId: team.id, role: 'assistant', content: 'Hi!' }).run();
      const msgs = db.select().from(chatMessages).where(eq(chatMessages.teamId, team.id)).all();
      expect(msgs).toHaveLength(2);
    });
  });

  describe('FTS5 Memory Search', () => {
    it('finds memories by full-text search', async () => {
      const team = createTestTeam('FTS Team');
      const agentId = createTestAgent(team.id);
      const db = getDb();
      db.insert(agentMemories).values({ agentId, content: 'The quick brown fox jumps over the lazy dog', importance: 5, source: 'manual' }).run();
      db.insert(agentMemories).values({ agentId, content: 'A completely different memory about cats', importance: 3, source: 'auto' }).run();

      const { searchMemories } = await import('../src/lib/memory.js');
      const results = searchMemories('fox jumps', agentId);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].content).toContain('fox');
    });
  });
});
