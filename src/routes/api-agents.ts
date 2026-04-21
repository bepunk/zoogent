import { Hono } from 'hono';
import { eq, and, desc, lt } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { agents, agentRuns, agentSkills, agentStore, agentIntegrations } from '../db/schema.js';
import { startAgent, stopAgent, isRunning } from '../core/process-manager.js';
import { refreshAgent } from '../core/scheduler.js';
import { getAgentMonthlySpend } from '../core/cost-tracker.js';
import { encryptEnv, loadMasterKey, maskValue, encrypt, decrypt, maskCredentials } from '../lib/crypto.js';
import { setAgentCode, getAgentCode, removeAgentCodeFile } from '../lib/agent-code.js';
import { bundleAgentSource } from '../lib/agent-bundler.js';
import { randomBytes } from 'node:crypto';

export const apiAgentsRoutes = new Hono();

// GET /api/agents — list all agents
apiAgentsRoutes.get('/', async (c) => {
  const teamId = c.get('teamId' as any);
  const db = getDb();
  const allAgents = db.select().from(agents).where(eq(agents.teamId, teamId)).all();

  const result = allAgents.map(agent => {
    const latestRun = db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.agentId, agent.id))
      .orderBy(desc(agentRuns.startedAt))
      .limit(1)
      .get();

    const monthlySpend = getAgentMonthlySpend(agent.id);

    const agentSkillsList = db
      .select()
      .from(agentSkills)
      .where(eq(agentSkills.agentId, agent.id))
      .all();

    return {
      ...agent,
      env: undefined, // Never expose env in list
      source: undefined, // Large; fetch via GET /:id/code
      bundle: undefined, // Internal; never exposed
      hasSource: !!agent.source,
      bundleReady: !!agent.bundle && !agent.bundleError,
      bundleError: agent.bundleError,
      latestRun,
      monthlySpendCents: monthlySpend,
      running: isRunning(agent.id),
      skills: agentSkillsList.map(s => s.skillPath),
    };
  });

  return c.json(result);
});

// GET /api/agents/:id — agent detail
apiAgentsRoutes.get('/:id', async (c) => {
  const teamId = c.get('teamId' as any);
  const id = c.req.param('id');
  const db = getDb();

  const agent = db.select().from(agents).where(eq(agents.id, id)).get();
  if (!agent) return c.json({ error: 'Agent not found' }, 404);
  if (agent.teamId !== teamId) return c.json({ error: 'Agent not found' }, 404);

  // Mask env values
  let maskedEnv: Record<string, string> | null = null;
  if (agent.env) {
    try {
      const parsed = JSON.parse(agent.env);
      maskedEnv = Object.fromEntries(
        Object.entries(parsed).map(([k, v]) => [k, maskValue(v as string)])
      );
    } catch {
      maskedEnv = null;
    }
  }

  const runs = db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.agentId, id))
    .orderBy(desc(agentRuns.startedAt))
    .limit(20)
    .all();

  const agentSkillsList = db
    .select()
    .from(agentSkills)
    .where(eq(agentSkills.agentId, id))
    .all();

  const monthlySpend = getAgentMonthlySpend(id);

  return c.json({
    ...agent,
    env: maskedEnv,
    source: undefined,
    bundle: undefined,
    hasSource: !!agent.source,
    bundleReady: !!agent.bundle && !agent.bundleError,
    bundleError: agent.bundleError,
    runs,
    skills: agentSkillsList,
    monthlySpendCents: monthlySpend,
    running: isRunning(id),
  });
});

// POST /api/agents — create agent
apiAgentsRoutes.post('/', async (c) => {
  const teamId = c.get('teamId' as any);
  const body = await c.req.json();
  const {
    id, name, description, goal, model, type,
    runtime: rawRuntime,
    source,
    command, args, cwd,
    cronSchedule, env, budgetMonthlyCents, parentAgentId,
    timeoutSec, graceSec, wakeOnAssignment,
  } = body;

  if (!id || !name) {
    return c.json({ error: 'id and name are required' }, 400);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return c.json({ error: 'id must be alphanumeric with dashes/underscores' }, 400);
  }

  const runtime: 'typescript' | 'exec' = rawRuntime === 'exec' ? 'exec' : 'typescript';

  if (runtime === 'exec' && !command) {
    return c.json({ error: 'command is required for exec runtime' }, 400);
  }

  const db = getDb();

  // Bundle source up front (atomic create). If source absent for typescript, agent is
  // registered but cannot run until write_agent_code fills it in.
  let bundle: string | null = null;
  let bundleHash: string | null = null;
  let bundleError: string | null = null;
  if (runtime === 'typescript' && typeof source === 'string' && source.length > 0) {
    const result = await bundleAgentSource(source, id);
    if (!result.ok) {
      return c.json({ error: 'Bundle failed', details: result.error }, 400);
    }
    bundle = result.bundle;
    bundleHash = result.hash;
  }

  // Encrypt env if provided
  let envValue: string | null = null;
  if (env && typeof env === 'object' && Object.keys(env).length > 0) {
    const dataDir = process.env.DATA_DIR || './data';
    const masterKey = loadMasterKey(dataDir);
    envValue = encryptEnv(env, masterKey);
  }

  const agent = db.insert(agents).values({
    id,
    name,
    description: description ?? null,
    goal: goal ?? null,
    model: model ?? null,
    type: type || 'manual',
    runtime,
    source: runtime === 'typescript' ? (typeof source === 'string' ? source : null) : null,
    bundle,
    bundleHash,
    bundleError,
    command: runtime === 'exec' ? command : null,
    args: runtime === 'exec' && args ? JSON.stringify(args) : null,
    cwd: runtime === 'exec' ? (cwd ?? null) : null,
    cronSchedule: cronSchedule ?? null,
    env: envValue,
    budgetMonthlyCents: budgetMonthlyCents ?? null,
    parentAgentId: parentAgentId ?? null,
    timeoutSec: timeoutSec ?? 600,
    graceSec: graceSec ?? 30,
    wakeOnAssignment: wakeOnAssignment ?? false,
    teamId,
  }).returning().get();

  // Schedule if cron
  if (agent.type === 'cron' && agent.cronSchedule && agent.enabled) {
    refreshAgent(agent.id);
  }

  console.log(`[api] Agent created: ${agent.id} (${runtime}) by user ${c.get('userId' as any)}`);

  return c.json({
    ...agent,
    env: undefined,
    source: undefined,  // large; fetch via GET /:id/code
    bundle: undefined,  // large; internal only
  }, 201);
});

// PATCH /api/agents/:id — update agent config (not code; use PUT /code for source)
apiAgentsRoutes.patch('/:id', async (c) => {
  const teamId = c.get('teamId' as any);
  const id = c.req.param('id');
  const body = await c.req.json();
  const db = getDb();

  const existing = db.select().from(agents).where(eq(agents.id, id)).get();
  if (!existing) return c.json({ error: 'Agent not found' }, 404);
  if (existing.teamId !== teamId) return c.json({ error: 'Agent not found' }, 404);

  if (body.runtime !== undefined && body.runtime !== existing.runtime) {
    return c.json({ error: 'runtime cannot be changed after creation' }, 400);
  }
  if (body.source !== undefined) {
    return c.json({ error: 'Use PUT /agents/:id/code to update source' }, 400);
  }

  const updates: any = { updatedAt: new Date() };
  const configFields = ['name', 'description', 'goal', 'model', 'type', 'cronSchedule', 'budgetMonthlyCents', 'parentAgentId', 'timeoutSec', 'graceSec', 'wakeOnAssignment', 'enabled'] as const;
  for (const key of configFields) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  // exec-runtime-only fields
  if (existing.runtime === 'exec') {
    if (body.command !== undefined) updates.command = body.command;
    if (body.cwd !== undefined) updates.cwd = body.cwd;
    if (body.args !== undefined) updates.args = body.args ? JSON.stringify(body.args) : null;
  } else {
    if (body.command !== undefined || body.args !== undefined || body.cwd !== undefined) {
      return c.json({ error: 'command/args/cwd apply only to exec runtime' }, 400);
    }
  }

  if (body.env !== undefined) {
    if (body.env && typeof body.env === 'object' && Object.keys(body.env).length > 0) {
      const dataDir = process.env.DATA_DIR || './data';
      const masterKey = loadMasterKey(dataDir);
      updates.env = encryptEnv(body.env, masterKey);
    } else {
      updates.env = null;
    }
  }

  const updated = db.update(agents).set(updates).where(eq(agents.id, id)).returning().get();

  refreshAgent(id);

  console.log(`[api] Agent updated: ${id} by user ${c.get('userId' as any)}`);

  return c.json({ ...updated, env: undefined, source: undefined, bundle: undefined });
});

// PUT /api/agents/:id/code — upload/replace TypeScript source (typescript runtime only)
apiAgentsRoutes.put('/:id/code', async (c) => {
  const teamId = c.get('teamId' as any);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const source = (body as any).source;
  if (typeof source !== 'string') {
    return c.json({ error: 'source (string) is required in body' }, 400);
  }

  const db = getDb();
  const agent = db.select().from(agents).where(eq(agents.id, id)).get();
  if (!agent) return c.json({ error: 'Agent not found' }, 404);
  if (agent.teamId !== teamId) return c.json({ error: 'Agent not found' }, 404);

  const result = await setAgentCode(teamId, id, source);
  if (!result.ok) {
    return c.json({ error: 'Bundle failed', details: result.error }, 400);
  }
  return c.json({ ok: true, hash: result.hash, warnings: result.warnings ?? [] });
});

// GET /api/agents/:id/code — read back current source + bundle status
apiAgentsRoutes.get('/:id/code', async (c) => {
  const teamId = c.get('teamId' as any);
  const id = c.req.param('id');
  const db = getDb();

  const agent = db.select().from(agents).where(eq(agents.id, id)).get();
  if (!agent) return c.json({ error: 'Agent not found' }, 404);
  if (agent.teamId !== teamId) return c.json({ error: 'Agent not found' }, 404);

  const code = getAgentCode(teamId, id);
  if (!code) return c.json({ error: 'Agent is not a typescript runtime' }, 400);
  return c.json(code);
});

// DELETE /api/agents/:id
apiAgentsRoutes.delete('/:id', async (c) => {
  const teamId = c.get('teamId' as any);
  const id = c.req.param('id');
  const db = getDb();

  const existing = db.select().from(agents).where(eq(agents.id, id)).get();
  if (!existing) return c.json({ error: 'Agent not found' }, 404);
  if (existing.teamId !== teamId) return c.json({ error: 'Agent not found' }, 404);

  stopAgent(id);

  const deleted = db.delete(agents).where(eq(agents.id, id)).returning().get();
  if (!deleted) return c.json({ error: 'Agent not found' }, 404);

  removeAgentCodeFile(teamId, id);
  refreshAgent(id);

  console.log(`[api] Agent deleted: ${id} by user ${c.get('userId' as any)}`);
  return c.json({ ok: true });
});

// POST /api/agents/:id/trigger — manual run
apiAgentsRoutes.post('/:id/trigger', async (c) => {
  const teamId = c.get('teamId' as any);
  const id = c.req.param('id');
  const db = getDb();

  const agent = db.select().from(agents).where(eq(agents.id, id)).get();
  if (!agent) return c.json({ error: 'Agent not found' }, 404);
  if (agent.teamId !== teamId) return c.json({ error: 'Agent not found' }, 404);

  const runId = await startAgent(id, 'manual');
  if (runId === null) {
    return c.json({ error: 'Agent not available (disabled, running, or over budget)' }, 409);
  }
  return c.json({ runId });
});

// GET /api/agents/:id/runs — run history
apiAgentsRoutes.get('/:id/runs', async (c) => {
  const teamId = c.get('teamId' as any);
  const id = c.req.param('id');
  const limit = parseInt(c.req.query('limit') || '20');
  const db = getDb();

  const agent = db.select().from(agents).where(eq(agents.id, id)).get();
  if (!agent) return c.json({ error: 'Agent not found' }, 404);
  if (agent.teamId !== teamId) return c.json({ error: 'Agent not found' }, 404);

  const runs = db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.agentId, id))
    .orderBy(desc(agentRuns.startedAt))
    .limit(limit)
    .all();

  return c.json(runs);
});

// GET /api/agents/:id/runs/:runId — single run detail
apiAgentsRoutes.get('/:id/runs/:runId', async (c) => {
  const teamId = c.get('teamId' as any);
  const id = c.req.param('id');
  const runId = parseInt(c.req.param('runId'));
  const db = getDb();

  const agent = db.select().from(agents).where(eq(agents.id, id)).get();
  if (!agent) return c.json({ error: 'Agent not found' }, 404);
  if (agent.teamId !== teamId) return c.json({ error: 'Agent not found' }, 404);

  const run = db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get();
  if (!run) return c.json({ error: 'Run not found' }, 404);

  return c.json(run);
});

// POST /api/agents/:id/enable
apiAgentsRoutes.post('/:id/enable', async (c) => {
  const teamId = c.get('teamId' as any);
  const id = c.req.param('id');
  const db = getDb();

  const agent = db.select().from(agents).where(eq(agents.id, id)).get();
  if (!agent) return c.json({ error: 'Agent not found' }, 404);
  if (agent.teamId !== teamId) return c.json({ error: 'Agent not found' }, 404);

  db.update(agents).set({ enabled: true, updatedAt: new Date() }).where(eq(agents.id, id)).run();
  refreshAgent(id);
  return c.json({ ok: true });
});

// POST /api/agents/:id/disable
apiAgentsRoutes.post('/:id/disable', async (c) => {
  const teamId = c.get('teamId' as any);
  const id = c.req.param('id');
  const db = getDb();

  const agent = db.select().from(agents).where(eq(agents.id, id)).get();
  if (!agent) return c.json({ error: 'Agent not found' }, 404);
  if (agent.teamId !== teamId) return c.json({ error: 'Agent not found' }, 404);

  db.update(agents).set({ enabled: false, updatedAt: new Date() }).where(eq(agents.id, id)).run();
  stopAgent(id);
  refreshAgent(id);
  return c.json({ ok: true });
});

// POST /api/agents/:id/assign-skill
apiAgentsRoutes.post('/:id/assign-skill', async (c) => {
  const teamId = c.get('teamId' as any);
  const agentId = c.req.param('id');
  const body = await c.req.json();
  const { skillPath } = body;
  if (!skillPath) return c.json({ error: 'skillPath is required' }, 400);

  const db = getDb();

  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent) return c.json({ error: 'Agent not found' }, 404);
  if (agent.teamId !== teamId) return c.json({ error: 'Agent not found' }, 404);

  const exists = db.select().from(agentSkills)
    .where(and(eq(agentSkills.agentId, agentId), eq(agentSkills.skillPath, skillPath))).get();
  if (exists) return c.json({ error: 'Skill already assigned' }, 409);

  db.insert(agentSkills).values({ agentId, skillPath, required: true }).run();
  return c.json({ ok: true });
});

// POST /api/agents/:id/unassign-skill
apiAgentsRoutes.post('/:id/unassign-skill', async (c) => {
  const teamId = c.get('teamId' as any);
  const agentId = c.req.param('id');
  const body = await c.req.json();
  const { skillPath } = body;
  if (!skillPath) return c.json({ error: 'skillPath is required' }, 400);

  const db = getDb();

  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent) return c.json({ error: 'Agent not found' }, 404);
  if (agent.teamId !== teamId) return c.json({ error: 'Agent not found' }, 404);

  db.delete(agentSkills)
    .where(and(eq(agentSkills.agentId, agentId), eq(agentSkills.skillPath, skillPath))).run();
  return c.json({ ok: true });
});

// ─── Agent Store (dashboard/MCP view) ────────────────────────────────────────

// GET /api/agents/:id/store — list all keys
apiAgentsRoutes.get('/:id/store', async (c) => {
  const teamId = c.get('teamId' as any);
  const agentId = c.req.param('id');
  const db = getDb();

  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent) return c.json({ error: 'Agent not found' }, 404);
  if (agent.teamId !== teamId) return c.json({ error: 'Agent not found' }, 404);

  // Cleanup expired
  db.delete(agentStore)
    .where(and(eq(agentStore.agentId, agentId), lt(agentStore.expiresAt, new Date())))
    .run();

  const entries = db.select({
    key: agentStore.key,
    value: agentStore.value,
    updatedAt: agentStore.updatedAt,
    expiresAt: agentStore.expiresAt,
  }).from(agentStore).where(eq(agentStore.agentId, agentId)).all();

  return c.json(entries.map(e => {
    try { return { ...e, value: JSON.parse(e.value) }; }
    catch { return e; }
  }));
});

// GET /api/agents/:id/store/:key — get value
apiAgentsRoutes.get('/:id/store/:key', async (c) => {
  const teamId = c.get('teamId' as any);
  const agentId = c.req.param('id');
  const key = c.req.param('key');
  const db = getDb();

  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent) return c.json({ error: 'Agent not found' }, 404);
  if (agent.teamId !== teamId) return c.json({ error: 'Agent not found' }, 404);

  const entry = db.select().from(agentStore)
    .where(and(eq(agentStore.agentId, agentId), eq(agentStore.key, key)))
    .get();

  if (!entry) return c.json({ error: 'Key not found' }, 404);

  // Check expiry
  if (entry.expiresAt && entry.expiresAt < new Date()) {
    db.delete(agentStore).where(eq(agentStore.id, entry.id)).run();
    return c.json({ error: 'Key expired' }, 404);
  }

  try { return c.json({ key: entry.key, value: JSON.parse(entry.value), updatedAt: entry.updatedAt, expiresAt: entry.expiresAt }); }
  catch { return c.json({ key: entry.key, value: entry.value, updatedAt: entry.updatedAt, expiresAt: entry.expiresAt }); }
});

// DELETE /api/agents/:id/store/:key — delete key
apiAgentsRoutes.delete('/:id/store/:key', async (c) => {
  const teamId = c.get('teamId' as any);
  const agentId = c.req.param('id');
  const key = c.req.param('key');
  const db = getDb();

  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent) return c.json({ error: 'Agent not found' }, 404);
  if (agent.teamId !== teamId) return c.json({ error: 'Agent not found' }, 404);

  const deleted = db.delete(agentStore)
    .where(and(eq(agentStore.agentId, agentId), eq(agentStore.key, key)))
    .returning().get();

  if (!deleted) return c.json({ error: 'Key not found' }, 404);
  return c.json({ ok: true });
});

// ─── Agent Integrations ───────────────────────────────────────────────────

// GET /:id/integrations — list integrations (credentials masked)
apiAgentsRoutes.get('/:id/integrations', async (c) => {
  const agentId = c.req.param('id');
  const teamId = c.get('teamId' as any);
  const db = getDb();

  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent || agent.teamId !== teamId) return c.json({ error: 'Agent not found' }, 404);

  const dataDir = process.env.DATA_DIR || './data';
  const masterKey = loadMasterKey(dataDir);
  const integrations = db.select().from(agentIntegrations)
    .where(eq(agentIntegrations.agentId, agentId)).all();

  return c.json(integrations.map(i => {
    let creds: Record<string, string> = {};
    try { creds = JSON.parse(decrypt(i.credentials, masterKey)); } catch {}
    return { ...i, credentials: maskCredentials(creds) };
  }));
});

// POST /:id/integrations — create integration
apiAgentsRoutes.post('/:id/integrations', async (c) => {
  const agentId = c.req.param('id');
  const teamId = c.get('teamId' as any);
  const db = getDb();

  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent || agent.teamId !== teamId) return c.json({ error: 'Agent not found' }, 404);

  const body = await c.req.json();
  const { provider, name, credentials } = body;

  if (!provider || !name || !credentials) {
    return c.json({ error: 'provider, name, and credentials are required' }, 400);
  }

  if (!/^[a-z0-9_]+$/.test(name)) {
    return c.json({ error: 'name must be lowercase alphanumeric with underscores' }, 400);
  }

  const dataDir = process.env.DATA_DIR || './data';
  const masterKey = loadMasterKey(dataDir);
  const encryptedCreds = encrypt(JSON.stringify(credentials), masterKey);
  const id = randomBytes(8).toString('hex');

  try {
    const integration = db.insert(agentIntegrations).values({
      id, agentId, provider, name, credentials: encryptedCreds,
    }).returning().get();

    return c.json({ ...integration, credentials: maskCredentials(credentials) }, 201);
  } catch (e: any) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return c.json({ error: 'Integration name already exists for this agent' }, 409);
    }
    throw e;
  }
});

// PATCH /:id/integrations/:intId — update integration
apiAgentsRoutes.patch('/:id/integrations/:intId', async (c) => {
  const agentId = c.req.param('id');
  const intId = c.req.param('intId');
  const teamId = c.get('teamId' as any);
  const db = getDb();

  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent || agent.teamId !== teamId) return c.json({ error: 'Agent not found' }, 404);

  const integration = db.select().from(agentIntegrations)
    .where(and(eq(agentIntegrations.id, intId), eq(agentIntegrations.agentId, agentId))).get();
  if (!integration) return c.json({ error: 'Integration not found' }, 404);

  const body = await c.req.json();
  const updates: any = { updatedAt: new Date() };

  if (body.credentials) {
    const dataDir = process.env.DATA_DIR || './data';
    const masterKey = loadMasterKey(dataDir);
    updates.credentials = encrypt(JSON.stringify(body.credentials), masterKey);
  }
  if (body.enabled !== undefined) updates.enabled = body.enabled;
  if (body.provider) updates.provider = body.provider;

  const updated = db.update(agentIntegrations).set(updates)
    .where(eq(agentIntegrations.id, intId)).returning().get();

  return c.json(updated);
});

// DELETE /:id/integrations/:intId — delete integration
apiAgentsRoutes.delete('/:id/integrations/:intId', async (c) => {
  const agentId = c.req.param('id');
  const intId = c.req.param('intId');
  const teamId = c.get('teamId' as any);
  const db = getDb();

  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent || agent.teamId !== teamId) return c.json({ error: 'Agent not found' }, 404);

  const deleted = db.delete(agentIntegrations)
    .where(and(eq(agentIntegrations.id, intId), eq(agentIntegrations.agentId, agentId)))
    .returning().get();

  if (!deleted) return c.json({ error: 'Integration not found' }, 404);
  return c.json({ ok: true });
});
