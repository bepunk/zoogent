import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '../src/db/index.js';
import { agentMemories } from '../src/db/schema.js';
import { searchMemories, getAgentMemories, buildMemoryInjection } from '../src/lib/memory.js';
import { createTestTeam, createTestAgent } from './helpers.js';

/** Insert memory directly into DB with custom createdAt for testing. */
function insertMemory(agentId: string, content: string, importance: number, createdAt?: Date, tags?: string[]) {
  const db = getDb();
  return db.insert(agentMemories).values({
    agentId,
    content,
    source: 'manual',
    importance,
    tags: tags ? JSON.stringify(tags) : null,
    createdAt: createdAt ?? new Date(),
  }).returning().get();
}

describe('Memory System - getAgentMemories', () => {
  it('returns memories sorted by importance desc', () => {
    const team = createTestTeam('MemSys Sort');
    const agentId = createTestAgent(team.id, { id: 'memsys-sort-a' });

    insertMemory(agentId, 'Low importance', 2);
    insertMemory(agentId, 'High importance', 9);
    insertMemory(agentId, 'Medium importance', 5);

    const memories = getAgentMemories(agentId, 10);
    expect(memories).toHaveLength(3);
    expect(memories[0].importance).toBe(9);
    expect(memories[1].importance).toBe(5);
    expect(memories[2].importance).toBe(2);
  });

  it('respects limit parameter', () => {
    const team = createTestTeam('MemSys Limit');
    const agentId = createTestAgent(team.id, { id: 'memsys-limit-a' });

    for (let i = 0; i < 5; i++) {
      insertMemory(agentId, `Memory ${i}`, 5);
    }

    const memories = getAgentMemories(agentId, 3);
    expect(memories).toHaveLength(3);
  });

  it('only returns active memories', () => {
    const team = createTestTeam('MemSys Active');
    const agentId = createTestAgent(team.id, { id: 'memsys-active-a' });

    insertMemory(agentId, 'Active memory', 5);
    const inactive = insertMemory(agentId, 'Inactive memory', 5);
    // Deactivate
    const db = getDb();
    db.update(agentMemories).set({ active: false }).where(
      eq(agentMemories.id, inactive.id)
    ).run();

    const memories = getAgentMemories(agentId, 10);
    expect(memories).toHaveLength(1);
    expect(memories[0].content).toBe('Active memory');
  });
});

describe('Memory System - searchMemories (FTS5)', () => {
  it('finds memories by text search', () => {
    const team = createTestTeam('MemSys FTS');
    const agentId = createTestAgent(team.id, { id: 'memsys-fts-a' });

    insertMemory(agentId, 'The photosynthesis process converts sunlight to energy', 7);
    insertMemory(agentId, 'Database indexing improves query performance', 6);

    const results = searchMemories('photosynthesis', agentId, 10);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].content).toContain('photosynthesis');
  });

  it('filters by agentId in search', () => {
    const team = createTestTeam('MemSys FTS Filter');
    const agent1 = createTestAgent(team.id, { id: 'memsys-fts-b1' });
    const agent2 = createTestAgent(team.id, { id: 'memsys-fts-b2' });

    insertMemory(agent1, 'The mitochondria is the powerhouse', 5);
    insertMemory(agent2, 'The mitochondria provides cellular energy', 5);

    const results = searchMemories('mitochondria', agent1, 10);
    expect(results).toHaveLength(1);
    expect(results[0].agentId).toBe(agent1);
  });
});

describe('Memory System - buildMemoryInjection (Ebbinghaus decay)', () => {
  it('returns empty string for agent with no memories', () => {
    const team = createTestTeam('MemSys Empty');
    const agentId = createTestAgent(team.id, { id: 'memsys-empty-a' });

    const result = buildMemoryInjection(agentId);
    expect(result).toBe('');
  });

  it('returns JSON with scored memories', () => {
    const team = createTestTeam('MemSys Injection');
    const agentId = createTestAgent(team.id, { id: 'memsys-inj-a' });

    insertMemory(agentId, 'Recent and important', 9);
    insertMemory(agentId, 'Recent but trivial', 2);

    const result = buildMemoryInjection(agentId);
    expect(result).toBeTruthy();
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThanOrEqual(1);
    // Important memory should come first (higher composite score)
    expect(parsed[0].content).toBe('Recent and important');
  });

  it('filters out old low-importance memories (90+ days, importance < 7)', () => {
    const team = createTestTeam('MemSys Decay');
    const agentId = createTestAgent(team.id, { id: 'memsys-decay-a' });

    const oldDate = new Date(Date.now() - 100 * 86400_000); // 100 days ago

    insertMemory(agentId, 'Old and unimportant', 3, oldDate);
    insertMemory(agentId, 'Old but important', 9, oldDate);
    insertMemory(agentId, 'Recent and trivial', 3);

    const result = buildMemoryInjection(agentId, 10);
    expect(result).toBeTruthy();
    const parsed = JSON.parse(result);

    const contents = parsed.map((m: any) => m.content);
    // Old + unimportant should be filtered out
    expect(contents).not.toContain('Old and unimportant');
    // Old but important should remain
    expect(contents).toContain('Old but important');
    // Recent should remain regardless of importance
    expect(contents).toContain('Recent and trivial');
  });

  it('respects maxItems parameter', () => {
    const team = createTestTeam('MemSys MaxItems');
    const agentId = createTestAgent(team.id, { id: 'memsys-max-a' });

    for (let i = 0; i < 10; i++) {
      insertMemory(agentId, `Memory number ${i}`, 5 + (i % 5));
    }

    const result = buildMemoryInjection(agentId, 3);
    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(3);
  });
});
