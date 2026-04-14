import { Hono } from 'hono';
import { eq, and, lt, like, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { costEvents, agentMemories, teamKnowledge, agentStore, agents, teamSettings } from '../db/schema.js';
import { unifiedAuth } from '../lib/auth-middleware.js';

export const apiReportRoutes = new Hono();

// Unified auth middleware (localhost bypass + API key + session)
apiReportRoutes.use('*', unifiedAuth);

// POST /api/report/cost
apiReportRoutes.post('/cost', async (c) => {
  const body = await c.req.json();
  const { agentId, runId, model, inputTokens, outputTokens, costCents, provider } = body;

  if (!agentId || !model) {
    return c.json({ error: 'agentId and model are required' }, 400);
  }

  const db = getDb();

  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent) return c.json({ error: 'Agent not found' }, 404);

  const event = db.insert(costEvents).values({
    agentId,
    runId: runId ?? null,
    provider: provider || 'anthropic',
    model,
    inputTokens: inputTokens || 0,
    outputTokens: outputTokens || 0,
    costCents: costCents || 0,
  }).returning().get();

  return c.json({ id: event.id });
});

// POST /api/report/heartbeat
apiReportRoutes.post('/heartbeat', async (c) => {
  const body = await c.req.json();
  const { agentId } = body;

  if (!agentId) {
    return c.json({ error: 'agentId is required' }, 400);
  }

  const db = getDb();
  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent) return c.json({ error: 'Agent not found' }, 404);

  // For now, just acknowledge. Long-running agents use this to signal they're alive.
  return c.json({ ok: true });
});

// POST /api/report/memory
apiReportRoutes.post('/memory', async (c) => {
  const body = await c.req.json();
  const { agentId, content, importance, tags, runId, taskId } = body;

  if (!agentId || !content) {
    return c.json({ error: 'agentId and content are required' }, 400);
  }

  const db = getDb();

  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent) return c.json({ error: 'Agent not found' }, 404);

  const memory = db.insert(agentMemories).values({
    agentId,
    content,
    source: 'auto',
    importance: importance ?? 5,
    tags: tags ? JSON.stringify(tags) : null,
    runId: runId ?? null,
    taskId: taskId ?? null,
  }).returning().get();

  return c.json({ id: memory.id });
});

// POST /api/report/knowledge — agent proposes team knowledge
apiReportRoutes.post('/knowledge', async (c) => {
  const body = await c.req.json();
  const { agentId, title, content } = body;

  if (!title || !content) {
    return c.json({ error: 'title and content are required' }, 400);
  }

  const db = getDb();

  // Resolve teamId from the agent's record
  const agent = db.select({ teamId: agents.teamId }).from(agents).where(eq(agents.id, agentId)).get();
  if (!agent) return c.json({ error: 'Agent not found' }, 404);
  const teamId = agent.teamId;

  // Check auto_approve from team settings instead of env var
  const autoApproveSetting = db.select().from(teamSettings)
    .where(and(eq(teamSettings.teamId, teamId), eq(teamSettings.key, 'auto_approve_knowledge')))
    .get();
  const autoApprove = autoApproveSetting?.value === 'true';

  const entry = db.insert(teamKnowledge).values({
    teamId,
    title,
    content,
    status: autoApprove ? 'active' : 'draft',
    proposedByAgentId: agentId ?? null,
    approvedAt: autoApprove ? new Date() : null,
  }).returning().get();

  return c.json({ id: entry.id, status: entry.status });
});

// POST /api/report/trigger/:id — trigger agent (API key auth, used by MCP)
apiReportRoutes.post('/trigger/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const agent = db.select().from(agents).where(eq(agents.id, id)).get();
  if (!agent) return c.json({ error: 'Agent not found' }, 404);
  const { startAgent } = await import('../core/process-manager.js');
  const runId = await startAgent(id, 'api');
  if (runId === null) {
    return c.json({ error: 'Agent not available (disabled, running, or over budget)' }, 409);
  }
  return c.json({ runId });
});

// ─── Agent Store (key-value) ─────────────────────────────────────────────────

function cleanupExpired(db: ReturnType<typeof getDb>, agentId: string) {
  db.delete(agentStore)
    .where(and(eq(agentStore.agentId, agentId), lt(agentStore.expiresAt, new Date())))
    .run();
}

// GET /api/report/store — get value by key
apiReportRoutes.get('/store', async (c) => {
  const agentId = c.req.query('agentId');
  const key = c.req.query('key');
  if (!agentId || !key) return c.json({ error: 'agentId and key are required' }, 400);

  const db = getDb();
  cleanupExpired(db, agentId);

  const entry = db.select().from(agentStore)
    .where(and(eq(agentStore.agentId, agentId), eq(agentStore.key, key)))
    .get();

  if (!entry) return c.json({ value: null });

  try {
    return c.json({ key: entry.key, value: JSON.parse(entry.value), updatedAt: entry.updatedAt, expiresAt: entry.expiresAt });
  } catch {
    return c.json({ key: entry.key, value: entry.value, updatedAt: entry.updatedAt, expiresAt: entry.expiresAt });
  }
});

// PUT /api/report/store — set key/value
apiReportRoutes.put('/store', async (c) => {
  const body = await c.req.json();
  const { agentId, key, value, ttlSeconds } = body;
  if (!agentId || !key || value === undefined) return c.json({ error: 'agentId, key, and value are required' }, 400);

  const db = getDb();
  const now = new Date();
  const expiresAt = ttlSeconds ? new Date(now.getTime() + ttlSeconds * 1000) : null;
  const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);

  // Upsert via INSERT OR REPLACE (unique constraint on agent_id + key)
  const existing = db.select().from(agentStore)
    .where(and(eq(agentStore.agentId, agentId), eq(agentStore.key, key)))
    .get();

  if (existing) {
    db.update(agentStore)
      .set({ value: jsonValue, updatedAt: now, expiresAt })
      .where(eq(agentStore.id, existing.id))
      .run();
  } else {
    db.insert(agentStore).values({
      agentId, key, value: jsonValue, createdAt: now, updatedAt: now, expiresAt,
    }).run();
  }

  return c.json({ ok: true });
});

// DELETE /api/report/store — delete key
apiReportRoutes.delete('/store', async (c) => {
  const agentId = c.req.query('agentId');
  const key = c.req.query('key');
  if (!agentId || !key) return c.json({ error: 'agentId and key are required' }, 400);

  const db = getDb();
  const deleted = db.delete(agentStore)
    .where(and(eq(agentStore.agentId, agentId), eq(agentStore.key, key)))
    .returning()
    .get();

  return c.json({ ok: !!deleted });
});

// GET /api/report/store/keys — list keys
apiReportRoutes.get('/store/keys', async (c) => {
  const agentId = c.req.query('agentId');
  if (!agentId) return c.json({ error: 'agentId is required' }, 400);

  const db = getDb();
  cleanupExpired(db, agentId);

  const prefix = c.req.query('prefix');
  const conditions = [eq(agentStore.agentId, agentId)];
  if (prefix) conditions.push(like(agentStore.key, `${prefix}%`));

  const entries = db.select({ key: agentStore.key, updatedAt: agentStore.updatedAt, expiresAt: agentStore.expiresAt })
    .from(agentStore)
    .where(and(...conditions))
    .all();

  return c.json(entries);
});

// GET /api/report/skill/:path — load skill content (for non-TS agents)
apiReportRoutes.get('/skill/*', async (c) => {
  const skillPath = c.req.path.replace('/api/report/skill/', '');
  if (!skillPath) return c.json({ error: 'Skill path required' }, 400);

  const { validateSkillPath, stripFrontmatter } = await import('../lib/skills.js');
  const { readFileSync, existsSync } = await import('node:fs');

  const fullPath = validateSkillPath(skillPath);
  if (!fullPath) return c.json({ error: 'Invalid skill path' }, 400);
  if (!existsSync(fullPath)) return c.json({ error: 'Skill not found' }, 404);

  const content = readFileSync(fullPath, 'utf-8');
  c.header('Content-Type', 'text/plain');
  return c.text(stripFrontmatter(content));
});
