import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { getDb, initFts, runMigrations } from './db/index.js';
import { cleanupOrphanRuns, startAgent, stopAgent, getRunningAgents } from './core/process-manager.js';
import { initScheduler, stopScheduler } from './core/scheduler.js';
import { seedSystemSkills } from './db/seed-skills.js';
import { authRoutes } from './routes/auth.js';
import { apiAgentsRoutes } from './routes/api-agents.js';
import { apiReportRoutes } from './routes/api-report.js';
import { apiTasksRoutes } from './routes/api-tasks.js';
import { apiSkillsRoutes } from './routes/api-skills.js';
import { apiMemoryRoutes } from './routes/api-memory.js';
import { apiLlmsRoutes } from './routes/api-llms.js';
import { apiChatRoutes } from './routes/api-chat.js';
import { apiTeamsRoutes } from './routes/api-teams.js';
import { agents, agentStore, teams, teamKnowledge, systemSkills, users } from './db/schema.js';
import { eq, and, lt, sql, asc, desc } from 'drizzle-orm';
import { getCostSummary, getBudgetStatus } from './core/cost-tracker.js';
import { getAuth } from './lib/auth.js';
import { resolve as resolvePath } from 'node:path';
import { writeFileSync as writePid, unlinkSync } from 'node:fs';
import { unifiedAuth } from './lib/auth-middleware.js';
import { pageRoutes } from './routes/pages.js';

function cleanupExpiredStore() {
  const db = getDb();
  const cleaned = db.delete(agentStore).where(lt(agentStore.expiresAt, new Date())).returning().all();
  if (cleaned.length > 0) console.log(`[store] Cleaned ${cleaned.length} expired entries`);
}

const app = new Hono();

// Security headers
app.use('*', secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "https://cdn.tailwindcss.com", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://fonts.googleapis.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com"],
    imgSrc: ["'self'", "data:"],
    connectSrc: ["'self'"],
  },
  xFrameOptions: 'DENY',
}));

// Static files (resolve from package root, not cwd)
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname_index = dirname(fileURLToPath(import.meta.url));
app.use('/static/*', serveStatic({ root: __dirname_index + '/public/', rewriteRequestPath: (path) => path.replace('/static', '') }));

// Block public sign-up after first user exists
app.use('/api/auth/sign-up/*', async (c, next) => {
  const db = getDb();
  const result = db.select({ count: sql<number>`COUNT(*)` }).from(users).get();
  const userCount = result?.count ?? 0;

  if (userCount === 0) {
    return next();
  }

  const auth = getAuth();
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: 'Registration is closed' }, 403);
  }

  const owner = db.select().from(users).orderBy(asc(users.createdAt)).limit(1).get();
  if (owner?.id !== session.user.id) {
    return c.json({ error: 'Only the owner can add members' }, 403);
  }

  return next();
});

// ─── Auth routes ────────────────────────────────────────────────────────────────
app.route('/api/auth', authRoutes);

// ─── Teams API (global) ─────────────────────────────────────────────────────────
app.route('/api/teams', apiTeamsRoutes);

// ─── Team-scoped API routes ─────────────────────────────────────────────────────
// Middleware: validate team exists, set teamId in context
app.use('/api/teams/:teamId/*', unifiedAuth, async (c, next) => {
  const teamId = c.req.param('teamId');
  const db = getDb();
  const team = db.select().from(teams).where(eq(teams.id, teamId)).get();
  if (!team) return c.json({ error: 'Team not found' }, 404);
  c.set('teamId' as any, teamId);
  await next();
});

// Mount team-scoped sub-routes
app.route('/api/teams/:teamId/agents', apiAgentsRoutes);
app.route('/api/teams/:teamId/skills', apiSkillsRoutes);
app.route('/api/teams/:teamId/tasks', apiTasksRoutes);
app.route('/api/teams/:teamId/memory', apiMemoryRoutes);
app.route('/api/teams/:teamId/chat', apiChatRoutes);

// Team-scoped inline routes
app.get('/api/teams/:teamId/costs', async (c) => {
  const teamId = c.get('teamId' as any);
  const days = parseInt(c.req.query('days') || '30');
  const agentId = c.req.query('agentId');
  return c.json(getCostSummary(days, agentId, teamId));
});

app.get('/api/teams/:teamId/budget-status', async (c) => {
  const teamId = c.get('teamId' as any);
  return c.json(getBudgetStatus(teamId));
});

app.get('/api/teams/:teamId/knowledge', async (c) => {
  const teamId = c.get('teamId' as any);
  const db = getDb();
  const status = c.req.query('status');
  const conditions = [eq(teamKnowledge.teamId, teamId)];
  if (status) conditions.push(eq(teamKnowledge.status, status as any));
  const entries = db.select().from(teamKnowledge).where(and(...conditions)).orderBy(desc(teamKnowledge.createdAt)).all();
  return c.json(entries);
});

app.post('/api/teams/:teamId/knowledge/:id/approve', async (c) => {
  const id = parseInt(c.req.param('id')!);
  const db = getDb();
  db.update(teamKnowledge).set({ status: 'active', approvedAt: new Date(), updatedAt: new Date() }).where(eq(teamKnowledge.id, id)).run();
  return c.json({ ok: true });
});

app.post('/api/teams/:teamId/knowledge/:id/archive', async (c) => {
  const id = parseInt(c.req.param('id')!);
  const db = getDb();
  db.update(teamKnowledge).set({ status: 'archived', updatedAt: new Date() }).where(eq(teamKnowledge.id, id)).run();
  return c.json({ ok: true });
});

// ─── System Skills API (global, read-only) ──────────────────────────────────────
app.get('/api/system-skills', unifiedAuth, async (c) => {
  const db = getDb();
  const all = db.select({
    path: systemSkills.path,
    name: systemSkills.name,
    description: systemSkills.description,
    category: systemSkills.category,
  }).from(systemSkills).all();
  return c.json(all);
});

app.get('/api/system-skills/:path{.+}', unifiedAuth, async (c) => {
  const skillPath = c.req.param('path')!;
  const db = getDb();
  const skill = db.select().from(systemSkills).where(eq(systemSkills.path, skillPath)).get();
  if (!skill) return c.json({ error: 'System skill not found' }, 404);
  return c.json(skill);
});

// ─── Report API (agent-side, global) ────────────────────────────────────────────
app.route('/api/report', apiReportRoutes);

// ─── Members API (owner creates members via Better Auth sign-up) ────────────────
const membersRoute = new Hono();
membersRoute.post('/api/members', async (c) => {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const db = getDb();
  const owner = db.select().from(users).orderBy(asc(users.createdAt)).limit(1).get();
  if (owner?.id !== session.user.id) {
    return c.json({ error: 'Only the owner can add members' }, 403);
  }

  const body = await c.req.json();
  const { name, email, password } = body;
  if (!name || !email || !password) return c.json({ error: 'name, email, and password are required' }, 400);
  if (password.length < 8) return c.json({ error: 'Password must be at least 8 characters' }, 400);

  try {
    const result = await auth.api.signUpEmail({ body: { name, email, password } });
    return c.json({ ok: true, email });
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to create member' }, 400);
  }
});
app.route('/', membersRoute);

// AI-readable docs
app.route('/', apiLlmsRoutes);

// Web panel pages
app.route('/', pageRoutes);

export function main() {
  // Initialize database
  getDb();
  runMigrations();
  initFts();

  // Cleanup orphaned runs from previous crashes
  const orphanedAgentIds = cleanupOrphanRuns();

  // Cleanup expired store entries
  cleanupExpiredStore();

  // Seed system skills for Architect AI (idempotent)
  seedSystemSkills();

  // Start cron scheduler
  initScheduler();

  // Auto-restart long-running agents that were running when server stopped
  for (const agentId of orphanedAgentIds) {
    const agent = getDb().select().from(agents).where(
      and(eq(agents.id, agentId), eq(agents.enabled, true), eq(agents.type, 'long-running'))
    ).get();
    if (agent) {
      startAgent(agentId, 'api');
      console.log(`[server] Auto-restarted long-running agent: ${agentId}`);
    }
  }

  // Write PID file
  const pidPath = resolvePath(process.env.DATA_DIR || './data', '.zoogent.pid');
  writePid(pidPath, String(process.pid));

  // Graceful shutdown
  const shutdown = () => {
    console.log('[server] Shutting down...');
    stopScheduler();
    for (const id of getRunningAgents()) stopAgent(id);
    try { unlinkSync(pidPath); } catch {}
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  const port = parseInt(process.env.PORT || '3200');

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`\n  ZooGent running at http://localhost:${info.port}\n`);
  });
}

// Run if called directly (not imported)
const isMain = process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js');
if (isMain) {
  main();
}

export default app;
