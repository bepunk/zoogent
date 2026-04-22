import { Hono } from 'hono';
import { eq, desc, asc, sql, and } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { getDb } from '../db/index.js';
import { agents, agentRuns, agentSkills, agentMemories, agentTasks, skills as skillsTable, users, teamKnowledge, teams, teamMembers, teamSettings, agentIntegrations, apiKeys as apiKeysTable } from '../db/schema.js';
import { getAuth } from '../lib/auth.js';
import { getAgentMonthlySpend, getCostSummary, getTeamMonthlySpend } from '../core/cost-tracker.js';
import { isRunning } from '../core/process-manager.js';
import { getAgentMemories, searchMemories } from '../lib/memory.js';
import { DashboardPage } from '../views/dashboard.js';
import { AgentDetailPage } from '../views/agent-detail.js';
import { CostDashboardPage } from '../views/cost-dashboard.js';
import { SkillBrowserPage } from '../views/skill-browser.js';
import { MemoryBrowserPage } from '../views/memory-browser.js';
import { LoginPage } from '../views/login.js';
import { SetupPage } from '../views/setup.js';
import { MembersPage } from '../views/members.js';
import { TasksPage } from '../views/tasks.js';
import { TeamKnowledgePage } from '../views/team-knowledge.js';
import { SettingsPage } from '../views/settings.js';
import { ChatPage } from '../views/chat.js';
import { TeamsPage } from '../views/teams.js';
import { TeamSettingsPage } from '../views/team-settings.js';
import { getChatHistory } from '../core/architect.js';
import { maskValue } from '../lib/crypto.js';

export const pageRoutes = new Hono();

// ─── Helpers ───────────────────────────────────────────────────────────────

function hasUsers(): boolean {
  const db = getDb();
  const result = db.select({ count: sql<number>`COUNT(*)` }).from(users).get();
  return (result?.count ?? 0) > 0;
}

function getOwner() {
  const db = getDb();
  return db.select().from(users).orderBy(asc(users.createdAt)).limit(1).get();
}

function isOwnerUser(userId: string): boolean {
  const owner = getOwner();
  return owner?.id === userId;
}

function resolveTeam(slug: string) {
  const db = getDb();
  return db.select().from(teams).where(eq(teams.slug, slug)).get();
}

// ─── Public pages ──────────────────────────────────────────────────────────

pageRoutes.get('/setup', (c) => {
  if (hasUsers()) return c.redirect('/login');
  return c.html(<SetupPage />);
});

pageRoutes.get('/login', (c) => {
  if (!hasUsers()) return c.redirect('/setup');
  return c.html(<LoginPage />);
});

pageRoutes.get('/logout', (c) => {
  return c.html(`<html><head><script>
    document.cookie.split(';').forEach(function(c) {
      var name = c.split('=')[0].trim();
      document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
    });
    window.location.href = '/login';
  </script></head><body></body></html>`);
});

// ─── Auth middleware ────────────────────────────────────────────────────────

pageRoutes.use('*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === '/login' || path === '/logout' || path === '/setup') return next();

  if (!hasUsers()) return c.redirect('/setup');

  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.redirect('/login');
    c.set('userId' as any, session.user.id);
    c.set('userEmail' as any, session.user.email);
  } catch {
    return c.redirect('/login');
  }

  await next();
});

// ─── Root → redirect to /teams ─────────────────────────────────────────────

pageRoutes.get('/', (c) => c.redirect('/teams'));

// ─── Teams list ────────────────────────────────────────────────────────────

pageRoutes.get('/teams', async (c) => {
  const db = getDb();
  const allTeams = db.select().from(teams).orderBy(asc(teams.name)).all();

  // Single GROUP BY query instead of per-team COUNT loop
  const counts = db
    .select({ teamId: agents.teamId, count: sql<number>`COUNT(*)` })
    .from(agents)
    .groupBy(agents.teamId)
    .all();
  const countMap = new Map(counts.map(c => [c.teamId, c.count]));

  const teamsWithCounts = allTeams.map(team => ({
    ...team,
    agentCount: countMap.get(team.id) ?? 0,
  }));

  return c.html(<TeamsPage teams={teamsWithCounts} />);
});

// ─── Create team from UI ──────────────────────────────────────────────────

pageRoutes.post('/teams/create', async (c) => {
  const body = await c.req.parseBody();
  const name = (body.name as string || '').trim();
  if (!name) return c.redirect('/teams');

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const id = randomBytes(8).toString('hex');
  const db = getDb();

  try {
    db.insert(teams).values({ id, name, slug }).run();

    const userId = c.get('userId' as any);
    if (userId) {
      db.insert(teamMembers).values({ teamId: id, userId, role: 'owner' }).run();
    }
  } catch (e: any) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return c.redirect('/teams');
    }
    throw e;
  }

  return c.redirect(`/teams/${slug}/chat`);
});

// ─── Team middleware (resolves slug → team) ────────────────────────────────

pageRoutes.use('/teams/:slug/*', async (c, next) => {
  const slug = c.req.param('slug');
  const team = resolveTeam(slug);
  if (!team) return c.redirect('/teams');
  c.set('teamId' as any, team.id);
  c.set('teamSlug' as any, team.slug);
  c.set('teamName' as any, team.name);
  await next();
});

// Also handle the team root (no trailing path)
pageRoutes.use('/teams/:slug', async (c, next) => {
  const slug = c.req.param('slug');
  const team = resolveTeam(slug);
  if (!team) return c.redirect('/teams');
  c.set('teamId' as any, team.id);
  c.set('teamSlug' as any, team.slug);
  c.set('teamName' as any, team.name);
  await next();
});

// Helper to get team context from Hono context
function teamCtx(c: any) {
  const teamId = c.get('teamId' as any) as string;
  const teamSlug = c.get('teamSlug' as any) as string;
  const teamName = c.get('teamName' as any) as string;
  const teamBase = `/teams/${teamSlug}`;
  return { teamId, teamSlug, teamName, teamBase };
}

// ─── Team Dashboard (agents) ───────────────────────────────────────────────

pageRoutes.get('/teams/:slug', async (c) => {
  const { teamId, teamSlug, teamName, teamBase } = teamCtx(c);
  const db = getDb();
  const teamAgents = db.select().from(agents).where(eq(agents.teamId, teamId)).all();

  const agentsWithData = teamAgents.map(agent => {
    const latestRun = db.select().from(agentRuns)
      .where(eq(agentRuns.agentId, agent.id))
      .orderBy(desc(agentRuns.startedAt)).limit(1).get();

    const agentSkillsList = db.select().from(agentSkills)
      .where(eq(agentSkills.agentId, agent.id)).all();

    const monthlySpend = getAgentMonthlySpend(agent.id);

    return {
      id: agent.id, name: agent.name, type: agent.type, model: agent.model,
      enabled: agent.enabled, running: isRunning(agent.id),
      cronSchedule: agent.cronSchedule, budgetMonthlyCents: agent.budgetMonthlyCents,
      monthlySpendCents: monthlySpend,
      skills: agentSkillsList.map(s => s.skillPath),
      latestRun: latestRun ? {
        status: latestRun.status, trigger: latestRun.trigger,
        startedAt: latestRun.startedAt?.toISOString() ?? null,
        durationMs: latestRun.durationMs,
      } : null,
    };
  });

  const totalCost = getCostSummary(30, undefined, teamId);
  const team = db.select().from(teams).where(eq(teams.id, teamId)).get();
  const teamBudgetCents = team?.budgetMonthlyCents ?? null;
  const teamSpentCents = getTeamMonthlySpend(teamId);

  return c.html(<DashboardPage agents={agentsWithData} totalCostCents={totalCost.totalCents} teamBudgetCents={teamBudgetCents} teamSpentCents={teamSpentCents} teamBase={teamBase} teamSlug={teamSlug} teamName={teamName} />);
});

// ─── Agent detail ──────────────────────────────────────────────────────────

pageRoutes.get('/teams/:slug/agents/:id', async (c) => {
  const id = c.req.param('id');
  const { teamId, teamBase, teamSlug, teamName } = teamCtx(c);
  const db = getDb();

  const agent = db.select().from(agents).where(and(eq(agents.id, id), eq(agents.teamId, teamId))).get();
  if (!agent) return c.redirect(teamBase);

  const runs = db.select().from(agentRuns)
    .where(eq(agentRuns.agentId, id))
    .orderBy(desc(agentRuns.startedAt)).limit(20).all();

  const totalRunsResult = db.select({ count: sql<number>`COUNT(*)` }).from(agentRuns)
    .where(eq(agentRuns.agentId, id)).get();

  const agentSkillsList = db.select().from(agentSkills)
    .where(eq(agentSkills.agentId, id)).all();

  const memories = getAgentMemories(id, 10);
  const monthlySpend = getAgentMonthlySpend(id);

  // Load integrations with masked credentials
  const { loadMasterKey, decrypt, maskCredentials } = await import('../lib/crypto.js');
  const dataDir = process.env.DATA_DIR || './data';
  const masterKey = loadMasterKey(dataDir);
  const rawIntegrations = db.select().from(agentIntegrations)
    .where(eq(agentIntegrations.agentId, id)).all();
  const integrations = rawIntegrations.map(i => {
    let creds: Record<string, string> = {};
    try {
      creds = maskCredentials(JSON.parse(decrypt(i.credentials, masterKey)));
    } catch {}
    return { id: i.id, provider: i.provider, name: i.name, credentials: creds, enabled: i.enabled ?? true };
  });

  return c.html(<AgentDetailPage
    agent={agent} runs={runs} skills={agentSkillsList} memories={memories}
    integrations={integrations}
    monthlySpendCents={monthlySpend} running={isRunning(id)}
    totalRuns={totalRunsResult?.count ?? 0} teamBase={teamBase}
    teamSlug={teamSlug} teamName={teamName}
  />);
});

// ─── Agent Integrations (UI forms) ────────────────────────────────────────

pageRoutes.post('/teams/:slug/agents/:id/integrations', async (c) => {
  const agentId = c.req.param('id');
  const { teamBase } = teamCtx(c);
  const body = await c.req.parseBody();
  const provider = (body.provider as string || '').trim();
  const name = (body.name as string || '').trim();
  const credentialsRaw = (body.credentials as string || '').trim();

  if (!provider || !name || !credentialsRaw) return c.redirect(`${teamBase}/agents/${agentId}`);

  let credentials: Record<string, string>;
  try { credentials = JSON.parse(credentialsRaw); } catch {
    return c.redirect(`${teamBase}/agents/${agentId}`);
  }

  const { encrypt, loadMasterKey } = await import('../lib/crypto.js');
  const dataDir = process.env.DATA_DIR || './data';
  const mk = loadMasterKey(dataDir);
  const encrypted = encrypt(JSON.stringify(credentials), mk);
  const id = randomBytes(8).toString('hex');
  const db = getDb();

  try {
    db.insert(agentIntegrations).values({ id, agentId, provider, name, credentials: encrypted }).run();
  } catch {}

  return c.redirect(`${teamBase}/agents/${agentId}`);
});

pageRoutes.post('/teams/:slug/agents/:id/integrations/:intId/delete', async (c) => {
  const agentId = c.req.param('id');
  const intId = c.req.param('intId');
  const { teamBase } = teamCtx(c);
  const db = getDb();
  db.delete(agentIntegrations)
    .where(and(eq(agentIntegrations.id, intId), eq(agentIntegrations.agentId, agentId)))
    .run();
  return c.redirect(`${teamBase}/agents/${agentId}`);
});

// ─── Agent Actions ─────────────────────────────────────────────────────────

pageRoutes.post('/teams/:slug/agents/:id/trigger', async (c) => {
  const id = c.req.param('id');
  const { teamBase } = teamCtx(c);
  const { startAgent } = await import('../core/process-manager.js');
  await startAgent(id, 'manual');
  return c.redirect(`${teamBase}/agents/${id}`);
});

pageRoutes.post('/teams/:slug/agents/:id/enable', async (c) => {
  const id = c.req.param('id');
  const { teamBase } = teamCtx(c);
  const db = getDb();
  db.update(agents).set({ enabled: true, updatedAt: new Date() }).where(eq(agents.id, id)).run();
  const { refreshAgent } = await import('../core/scheduler.js');
  refreshAgent(id);
  return c.redirect(`${teamBase}/agents/${id}`);
});

pageRoutes.post('/teams/:slug/agents/:id/disable', async (c) => {
  const id = c.req.param('id');
  const { teamBase } = teamCtx(c);
  const db = getDb();
  db.update(agents).set({ enabled: false, updatedAt: new Date() }).where(eq(agents.id, id)).run();
  const { stopAgent } = await import('../core/process-manager.js');
  const { refreshAgent } = await import('../core/scheduler.js');
  stopAgent(id);
  refreshAgent(id);
  return c.redirect(`${teamBase}/agents/${id}`);
});

// ─── Tasks ─────────────────────────────────────────────────────────────────

pageRoutes.get('/teams/:slug/tasks', async (c) => {
  const { teamId, teamBase, teamSlug, teamName } = teamCtx(c);
  const filterAgent = c.req.query('agent');
  const filterStatus = c.req.query('status');
  const db = getDb();

  const teamAgentIds = db.select({ id: agents.id }).from(agents).where(eq(agents.teamId, teamId)).all().map(a => a.id);

  let tasks: any[] = [];
  if (teamAgentIds.length > 0) {
    const { inArray } = await import('drizzle-orm');
    const conditions: any[] = [inArray(agentTasks.agentId, teamAgentIds)];
    if (filterAgent) conditions.push(eq(agentTasks.agentId, filterAgent));
    if (filterStatus) conditions.push(eq(agentTasks.status, filterStatus as any));

    const rawTasks = db.select({
      id: agentTasks.id, title: agentTasks.title, status: agentTasks.status,
      agentId: agentTasks.agentId, agentName: agents.name,
      createdByAgentId: agentTasks.createdByAgentId,
      payload: agentTasks.payload, result: agentTasks.result,
      consensus: agentTasks.consensus,
      createdAt: agentTasks.createdAt, completedAt: agentTasks.completedAt,
    }).from(agentTasks)
      .leftJoin(agents, eq(agentTasks.agentId, agents.id))
      .where(and(...conditions))
      .orderBy(desc(agentTasks.createdAt)).limit(100).all();

    tasks = rawTasks.map(t => {
      let createdByAgentName: string | null = null;
      if (t.createdByAgentId) {
        const creator = db.select({ name: agents.name }).from(agents).where(eq(agents.id, t.createdByAgentId)).get();
        createdByAgentName = creator?.name ?? null;
      }
      return { ...t, createdByAgentName };
    });
  }

  const teamAgents = db.select({ id: agents.id, name: agents.name }).from(agents).where(eq(agents.teamId, teamId)).all();

  return c.html(<TasksPage tasks={tasks} agents={teamAgents} filterAgent={filterAgent} filterStatus={filterStatus} teamBase={teamBase} teamSlug={teamSlug} teamName={teamName} />);
});

// ─── Costs ─────────────────────────────────────────────────────────────────

pageRoutes.get('/teams/:slug/costs', async (c) => {
  const { teamId, teamBase, teamSlug, teamName } = teamCtx(c);
  const days = parseInt(c.req.query('days') || '30');
  const summary = getCostSummary(days, undefined, teamId);
  return c.html(<CostDashboardPage summary={summary} days={days} teamBase={teamBase} teamSlug={teamSlug} teamName={teamName} />);
});

// ─── Skills ────────────────────────────────────────────────────────────────

pageRoutes.get('/teams/:slug/skills', async (c) => {
  const { teamId, teamBase, teamSlug, teamName } = teamCtx(c);
  const db = getDb();
  const allSkills = db.select().from(skillsTable).where(eq(skillsTable.teamId, teamId)).all();
  return c.html(<SkillBrowserPage skills={allSkills} teamBase={teamBase} teamSlug={teamSlug} teamName={teamName} />);
});

pageRoutes.get('/teams/:slug/skills/*', async (c) => {
  const { teamId, teamBase, teamSlug, teamName } = teamCtx(c);
  const fullPath = c.req.path;
  const skillPath = fullPath.replace(`/teams/${teamSlug}/skills/`, '');
  if (!skillPath) return c.redirect(`${teamBase}/skills`);

  const db = getDb();
  const allSkills = db.select().from(skillsTable).where(eq(skillsTable.teamId, teamId)).all();

  const { stripFrontmatter } = await import('../lib/skills.js');
  const skill = db.select().from(skillsTable).where(and(eq(skillsTable.teamId, teamId), eq(skillsTable.path, skillPath))).get();
  if (!skill || !skill.content) return c.redirect(`${teamBase}/skills`);

  const content = stripFrontmatter(skill.content);

  const usedBy = db.select({ agentId: agentSkills.agentId, agentName: agents.name })
    .from(agentSkills).leftJoin(agents, eq(agentSkills.agentId, agents.id))
    .where(eq(agentSkills.skillPath, skillPath)).all();

  return c.html(<SkillBrowserPage
    skills={allSkills} activePath={skillPath} activeContent={content}
    activeSkill={{ name: skill.name ?? null, description: skill.description ?? null, path: skillPath, usedBy }}
    teamBase={teamBase} teamSlug={teamSlug} teamName={teamName}
  />);
});

// ─── Memory ────────────────────────────────────────────────────────────────

pageRoutes.get('/teams/:slug/memory', async (c) => {
  const { teamId, teamBase, teamSlug, teamName } = teamCtx(c);
  const searchQuery = c.req.query('search');
  const agentFilter = c.req.query('agentId');
  const db = getDb();

  let memories: any[];
  if (searchQuery) {
    memories = searchMemories(searchQuery, agentFilter || undefined, 50);
  } else if (agentFilter) {
    memories = getAgentMemories(agentFilter, 50);
  } else {
    const teamAgentIds = db.select({ id: agents.id }).from(agents).where(eq(agents.teamId, teamId)).all().map(a => a.id);
    if (teamAgentIds.length > 0) {
      const { inArray } = await import('drizzle-orm');
      memories = db.select().from(agentMemories)
        .where(and(eq(agentMemories.active, true), inArray(agentMemories.agentId, teamAgentIds)))
        .orderBy(desc(agentMemories.createdAt)).limit(50).all();
    } else {
      memories = [];
    }
  }

  const teamAgents = db.select({ id: agents.id, name: agents.name }).from(agents).where(eq(agents.teamId, teamId)).all();

  return c.html(<MemoryBrowserPage
    memories={memories} searchQuery={searchQuery} agentFilter={agentFilter}
    agents={teamAgents} teamBase={teamBase} teamSlug={teamSlug} teamName={teamName}
  />);
});

// ─── Team Knowledge ────────────────────────────────────────────────────────

pageRoutes.get('/teams/:slug/knowledge', async (c) => {
  const { teamId, teamBase, teamSlug, teamName } = teamCtx(c);
  const db = getDb();
  const allEntries = db.select().from(teamKnowledge)
    .where(eq(teamKnowledge.teamId, teamId))
    .orderBy(desc(teamKnowledge.createdAt)).all();

  const entries = allEntries.map(e => {
    let proposedByAgentName: string | null = null;
    if (e.proposedByAgentId) {
      const agent = db.select({ name: agents.name }).from(agents).where(eq(agents.id, e.proposedByAgentId)).get();
      proposedByAgentName = agent?.name ?? null;
    }
    return { ...e, proposedByAgentName };
  });

  return c.html(<TeamKnowledgePage
    entries={entries}
    draftsCount={entries.filter(e => e.status === 'draft').length}
    activeCount={entries.filter(e => e.status === 'active').length}
    autoApprove={false}
    teamBase={teamBase} teamSlug={teamSlug} teamName={teamName}
  />);
});

pageRoutes.post('/teams/:slug/knowledge/:id/approve', async (c) => {
  const id = parseInt(c.req.param('id'));
  const { teamBase } = teamCtx(c);
  const db = getDb();
  db.update(teamKnowledge).set({ status: 'active', approvedAt: new Date(), updatedAt: new Date() }).where(eq(teamKnowledge.id, id)).run();
  return c.redirect(`${teamBase}/knowledge`);
});

pageRoutes.post('/teams/:slug/knowledge/:id/archive', async (c) => {
  const id = parseInt(c.req.param('id'));
  const { teamBase } = teamCtx(c);
  const db = getDb();
  db.update(teamKnowledge).set({ status: 'archived', updatedAt: new Date() }).where(eq(teamKnowledge.id, id)).run();
  return c.redirect(`${teamBase}/knowledge`);
});

// ─── Team Settings ────────────────────────────────────────────────────────

pageRoutes.get('/teams/:slug/settings', async (c) => {
  const { teamId, teamBase, teamSlug, teamName } = teamCtx(c);
  const db = getDb();
  const keySetting = db.select().from(teamSettings)
    .where(and(eq(teamSettings.teamId, teamId), eq(teamSettings.key, 'anthropic_api_key')))
    .get();
  const autoApprove = db.select().from(teamSettings)
    .where(and(eq(teamSettings.teamId, teamId), eq(teamSettings.key, 'auto_approve_knowledge')))
    .get();
  const team = db.select().from(teams).where(eq(teams.id, teamId)).get();
  const teamBudgetCents = team?.budgetMonthlyCents ?? null;
  const teamSpentCents = getTeamMonthlySpend(teamId);
  const msg = c.req.query('msg');
  const err = c.req.query('err');

  let anthropicKeyMasked: string | null = null;
  if (keySetting) {
    try {
      const { loadMasterKey, decrypt } = await import('../lib/crypto.js');
      const dataDir = process.env.DATA_DIR || './data';
      const masterKey = loadMasterKey(dataDir);
      anthropicKeyMasked = maskValue(decrypt(keySetting.value, masterKey));
    } catch {
      anthropicKeyMasked = '•••••';
    }
  }

  return c.html(<TeamSettingsPage
    teamBase={teamBase} teamSlug={teamSlug} teamName={teamName}
    hasAnthropicKey={!!keySetting}
    anthropicKeyMasked={anthropicKeyMasked}
    autoApproveKnowledge={autoApprove?.value === 'true'}
    teamBudgetCents={teamBudgetCents}
    teamSpentCents={teamSpentCents}
    message={msg || undefined} error={err || undefined}
  />);
});

pageRoutes.post('/teams/:slug/settings/anthropic-key', async (c) => {
  const { teamId, teamBase } = teamCtx(c);
  const body = await c.req.parseBody();
  const apiKey = (body.apiKey as string || '').trim();
  if (!apiKey) return c.redirect(`${teamBase}/settings?err=API key is required`);
  if (!apiKey.startsWith('sk-ant-')) return c.redirect(`${teamBase}/settings?err=Invalid key format (should start with sk-ant-)`);

  const db = getDb();
  const dataDir = process.env.DATA_DIR || './data';
  const { encrypt, loadMasterKey } = await import('../lib/crypto.js');
  const masterKey = loadMasterKey(dataDir);
  const encrypted = encrypt(apiKey, masterKey);

  const existing = db.select().from(teamSettings)
    .where(and(eq(teamSettings.teamId, teamId), eq(teamSettings.key, 'anthropic_api_key')))
    .get();

  if (existing) {
    db.update(teamSettings)
      .set({ value: encrypted, encrypted: true, updatedAt: new Date() })
      .where(and(eq(teamSettings.teamId, teamId), eq(teamSettings.key, 'anthropic_api_key')))
      .run();
  } else {
    db.insert(teamSettings).values({
      teamId, key: 'anthropic_api_key', value: encrypted, encrypted: true,
    }).run();
  }

  return c.redirect(`${teamBase}/settings?msg=API key saved`);
});

pageRoutes.post('/teams/:slug/settings/anthropic-key/delete', async (c) => {
  const { teamId, teamBase } = teamCtx(c);
  const db = getDb();
  db.delete(teamSettings)
    .where(and(eq(teamSettings.teamId, teamId), eq(teamSettings.key, 'anthropic_api_key')))
    .run();
  return c.redirect(`${teamBase}/settings?msg=API key removed`);
});

pageRoutes.post('/teams/:slug/settings/budget', async (c) => {
  const { teamId, teamBase } = teamCtx(c);
  const body = await c.req.parseBody();
  const budgetStr = (body.budget as string || '').trim();
  const db = getDb();

  if (!budgetStr || parseFloat(budgetStr) <= 0) {
    // Remove budget limit
    db.update(teams)
      .set({ budgetMonthlyCents: null, updatedAt: new Date() })
      .where(eq(teams.id, teamId))
      .run();
    return c.redirect(`${teamBase}/settings?msg=Budget limit removed`);
  }

  const budgetCents = Math.round(parseFloat(budgetStr) * 100);
  if (isNaN(budgetCents) || budgetCents <= 0) {
    return c.redirect(`${teamBase}/settings?err=Invalid budget amount`);
  }

  db.update(teams)
    .set({ budgetMonthlyCents: budgetCents, updatedAt: new Date() })
    .where(eq(teams.id, teamId))
    .run();

  return c.redirect(`${teamBase}/settings?msg=Budget set to $${(budgetCents / 100).toFixed(2)}/month`);
});

pageRoutes.post('/teams/:slug/settings/auto-approve', async (c) => {
  const { teamId, teamBase } = teamCtx(c);
  const body = await c.req.parseBody();
  const enabled = body.enabled === 'true';
  const db = getDb();

  const existing = db.select().from(teamSettings)
    .where(and(eq(teamSettings.teamId, teamId), eq(teamSettings.key, 'auto_approve_knowledge'))).get();
  if (existing) {
    db.update(teamSettings).set({ value: String(enabled), updatedAt: new Date() })
      .where(and(eq(teamSettings.teamId, teamId), eq(teamSettings.key, 'auto_approve_knowledge'))).run();
  } else {
    db.insert(teamSettings).values({ teamId, key: 'auto_approve_knowledge', value: String(enabled) }).run();
  }

  return c.redirect(`${teamBase}/settings?msg=Auto-approve knowledge ${enabled ? 'enabled' : 'disabled'}`);
});

// ─── Chat (Architect AI) ───────────────────────────────────────────────────

pageRoutes.get('/teams/:slug/chat', async (c) => {
  const { teamId, teamBase, teamSlug, teamName } = teamCtx(c);
  const db = getDb();
  const keySetting = db.select().from(teamSettings)
    .where(and(eq(teamSettings.teamId, teamId), eq(teamSettings.key, 'anthropic_api_key')))
    .get();
  const hasApiKey = !!keySetting;
  const messages = getChatHistory(50, teamId);
  return c.html(<ChatPage messages={messages} hasApiKey={hasApiKey} teamBase={teamBase} teamId={teamId} teamSlug={teamSlug} teamName={teamName} />);
});

// ─── Global: Settings ──────────────────────────────────────────────────────

function renderSettings(c: any, newKey?: string) {
  const db = getDb();
  const keys = db.select().from(apiKeysTable).all();
  const maskedKeys = keys.map(k => ({
    id: k.id,
    name: k.name,
    key: maskValue(k.key),
    createdAt: k.createdAt,
  }));
  return c.html(<SettingsPage apiKeys={maskedKeys} newKey={newKey} />);
}

pageRoutes.get('/settings', async (c) => renderSettings(c));

pageRoutes.post('/settings/api-key/generate', async (c) => {
  const body = await c.req.parseBody();
  const name = (body.name as string || '').trim();
  if (!name) return renderSettings(c);
  const db = getDb();
  const id = randomBytes(8).toString('hex');
  const key = `zg_${randomBytes(24).toString('hex')}`;
  db.insert(apiKeysTable).values({ id, name, key }).run();
  return renderSettings(c, key);
});

pageRoutes.post('/settings/api-key/:id/delete', async (c) => {
  const id = c.req.param('id');
  const db = getDb();
  db.delete(apiKeysTable).where(eq(apiKeysTable.id, id)).run();
  return c.redirect('/settings');
});

// ─── Global: Members ───────────────────────────────────────────────────────

pageRoutes.get('/members', async (c) => {
  const db = getDb();
  const userId = c.get('userId' as any) as string;
  const owner = getOwner();
  const allUsers = db.select().from(users).orderBy(asc(users.createdAt)).all();

  const members = allUsers.map(u => ({
    id: u.id, name: u.name, email: u.email,
    isOwner: u.id === owner?.id, createdAt: u.createdAt,
  }));

  return c.html(<MembersPage members={members} isOwner={isOwnerUser(userId)} />);
});
