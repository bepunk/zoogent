import { Hono } from 'hono';
import { eq, and, inArray } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { agentMemories, agents } from '../db/schema.js';
import { searchMemories, getAgentMemories } from '../lib/memory.js';
import { getTeamAgentIds, agentBelongsToTeam } from '../lib/team-utils.js';

export const apiMemoryRoutes = new Hono();

/** Check if a memory belongs to the given team (via its agent). */
function memoryBelongsToTeam(memoryId: number, teamId: string): boolean {
  const db = getDb();
  const memory = db.select({ agentId: agentMemories.agentId }).from(agentMemories).where(eq(agentMemories.id, memoryId)).get();
  if (!memory) return false;
  return agentBelongsToTeam(memory.agentId, teamId);
}

// GET /api/memory — list/search memories (scoped to team)
apiMemoryRoutes.get('/', async (c) => {
  const agentId = c.req.query('agentId');
  const search = c.req.query('search');
  const limit = parseInt(c.req.query('limit') || '20');
  const teamId = c.get('teamId' as any);

  if (search) {
    // searchMemories uses raw SQL, so we filter results by team agent IDs after
    const results = searchMemories(search, agentId || undefined, limit);
    if (agentId) {
      // If agentId is provided, validate it belongs to team
      if (!agentBelongsToTeam(agentId, teamId)) return c.json([]);
      return c.json(results);
    }
    // Filter results to only include team agents
    const teamAgentIds = new Set(getTeamAgentIds(teamId));
    return c.json(results.filter(m => teamAgentIds.has(m.agentId)));
  }

  if (agentId) {
    if (!agentBelongsToTeam(agentId, teamId)) return c.json([]);
    const results = getAgentMemories(agentId, limit);
    return c.json(results);
  }

  // All active memories for team agents
  const teamAgentIds = getTeamAgentIds(teamId);
  if (teamAgentIds.length === 0) return c.json([]);

  const db = getDb();
  const all = db
    .select()
    .from(agentMemories)
    .where(and(eq(agentMemories.active, true), inArray(agentMemories.agentId, teamAgentIds)))
    .limit(limit)
    .all();

  return c.json(all);
});

// POST /api/memory — add memory manually
apiMemoryRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const { agentId, content, importance, tags } = body;
  const teamId = c.get('teamId' as any);

  if (!agentId || !content) {
    return c.json({ error: 'agentId and content are required' }, 400);
  }

  if (!agentBelongsToTeam(agentId, teamId)) {
    return c.json({ error: 'Agent not found in this team' }, 404);
  }

  const db = getDb();
  const memory = db.insert(agentMemories).values({
    agentId,
    content,
    source: 'manual',
    importance: importance ?? 5,
    tags: tags ? JSON.stringify(tags) : null,
  }).returning().get();

  return c.json(memory, 201);
});

// PATCH /api/memory/:id — update memory
apiMemoryRoutes.patch('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json();
  const teamId = c.get('teamId' as any);

  if (!memoryBelongsToTeam(id, teamId)) {
    return c.json({ error: 'Memory not found' }, 404);
  }

  const db = getDb();
  const updates: any = {};
  if (body.content !== undefined) updates.content = body.content;
  if (body.importance !== undefined) updates.importance = body.importance;
  if (body.active !== undefined) updates.active = body.active;
  if (body.tags !== undefined) updates.tags = body.tags ? JSON.stringify(body.tags) : null;

  const updated = db
    .update(agentMemories)
    .set(updates)
    .where(eq(agentMemories.id, id))
    .returning()
    .get();

  if (!updated) return c.json({ error: 'Memory not found' }, 404);
  return c.json(updated);
});

// DELETE /api/memory/:id
apiMemoryRoutes.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const teamId = c.get('teamId' as any);

  if (!memoryBelongsToTeam(id, teamId)) {
    return c.json({ error: 'Memory not found' }, 404);
  }

  const db = getDb();
  const deleted = db
    .delete(agentMemories)
    .where(eq(agentMemories.id, id))
    .returning()
    .get();

  if (!deleted) return c.json({ error: 'Memory not found' }, 404);
  return c.json({ ok: true });
});
