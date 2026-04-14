import { eq, and, desc, sql } from 'drizzle-orm';
import { getDb, getSqlite } from '../db/index.js';
import { agentMemories } from '../db/schema.js';

export interface MemoryEntry {
  id: number;
  agentId: string;
  content: string;
  source: 'feedback' | 'auto' | 'manual';
  importance: number;
  tags: string[] | null;
  active: boolean;
  createdAt: Date;
}

/**
 * Search memories using FTS5 full-text search.
 */
export function searchMemories(query: string, agentId?: string, limit = 20): MemoryEntry[] {
  const sqlite = getSqlite();

  // Escape FTS5 query: wrap in double quotes for literal matching
  const escaped = '"' + query.replace(/"/g, '""') + '"';

  let sql_query: string;
  let params: any[];

  if (agentId) {
    sql_query = `
      SELECT m.* FROM agent_memories m
      JOIN agent_memories_fts fts ON fts.rowid = m.id
      WHERE agent_memories_fts MATCH ? AND m.agent_id = ? AND m.active = 1
      ORDER BY m.importance DESC, m.created_at DESC
      LIMIT ?
    `;
    params = [escaped, agentId, limit];
  } else {
    sql_query = `
      SELECT m.* FROM agent_memories m
      JOIN agent_memories_fts fts ON fts.rowid = m.id
      WHERE agent_memories_fts MATCH ? AND m.active = 1
      ORDER BY m.importance DESC, m.created_at DESC
      LIMIT ?
    `;
    params = [escaped, limit];
  }

  const rows = sqlite.prepare(sql_query).all(...params) as any[];
  return rows.map(rowToMemory);
}

/**
 * Get top memories for an agent, ranked by importance and recency.
 */
export function getAgentMemories(agentId: string, limit = 10, tags?: string[]): MemoryEntry[] {
  const db = getDb();

  let query = db
    .select()
    .from(agentMemories)
    .where(
      and(
        eq(agentMemories.agentId, agentId),
        eq(agentMemories.active, true)
      )
    )
    .orderBy(desc(agentMemories.importance), desc(agentMemories.createdAt))
    .limit(limit);

  const results = query.all();

  // Filter by tags in application code (SQLite JSON support is limited)
  if (tags && tags.length > 0) {
    return results.filter(m => {
      if (!m.tags) return false;
      const memTags: string[] = JSON.parse(m.tags);
      return tags.some(t => memTags.includes(t));
    }).map(rowToMemory);
  }

  return results.map(rowToMemory);
}

/**
 * Build a ZOOGENT_MEMORIES JSON string to inject into agent env.
 * Uses composite scoring: 0.4*recency + 0.3*frequency + 0.3*importance
 * Applies Ebbinghaus decay: memories lose relevance over time.
 */
export function buildMemoryInjection(agentId: string, maxItems = 10): string {
  const db = getDb();
  const sqlite = getSqlite();

  // Get all active memories for this agent
  const rows = db
    .select()
    .from(agentMemories)
    .where(and(eq(agentMemories.agentId, agentId), eq(agentMemories.active, true)))
    .all();

  if (rows.length === 0) return '';

  const now = Date.now();
  const DECAY_CONSTANT = 0.03; // ~23 day half-life
  const MAX_AGE_DAYS = 90; // ignore memories older than 90 days with low importance

  // Score and rank
  const scored = rows
    .map(m => {
      const createdAt = m.createdAt instanceof Date ? m.createdAt.getTime() : (m.createdAt as number);
      const daysSinceCreation = (now - createdAt) / 86400_000;

      // Skip very old low-importance memories
      if (daysSinceCreation > MAX_AGE_DAYS && (m.importance ?? 5) < 7) return null;

      const recency = Math.exp(-DECAY_CONSTANT * daysSinceCreation);
      const frequency = Math.min((m.accessCount ?? 0) / 10, 1); // normalize to 0-1
      const importance = (m.importance ?? 5) / 10; // normalize to 0-1

      const score = 0.4 * recency + 0.3 * frequency + 0.3 * importance;

      return { memory: m, score };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems);

  if (scored.length === 0) return '';

  // Update access_count and last_accessed for selected memories
  const ids = scored.map(s => s.memory.id);
  for (const id of ids) {
    sqlite.prepare('UPDATE agent_memories SET access_count = access_count + 1, last_accessed = ? WHERE id = ?').run(now, id);
  }

  return JSON.stringify(
    scored.map(s => ({
      content: s.memory.content,
      source: s.memory.source,
      importance: s.memory.importance,
      tags: s.memory.tags ? JSON.parse(s.memory.tags) : null,
    }))
  );
}

function rowToMemory(row: any): MemoryEntry {
  return {
    id: row.id,
    agentId: row.agent_id ?? row.agentId,
    content: row.content,
    source: row.source,
    importance: row.importance,
    tags: row.tags ? (typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags) : null,
    active: typeof row.active === 'number' ? !!row.active : row.active,
    createdAt: typeof row.created_at === 'number'
      ? new Date(row.created_at)
      : (row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)),
  };
}
