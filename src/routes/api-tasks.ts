import { Hono } from 'hono';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { agentTasks, agentEvaluations, agents } from '../db/schema.js';
import { evaluateConsensus } from '../core/consensus.js';
import { startAgent } from '../core/process-manager.js';
import { getTeamAgentIds, agentBelongsToTeam } from '../lib/team-utils.js';

export const apiTasksRoutes = new Hono();

/** Check if a task belongs to the given team (via its agent). */
function taskBelongsToTeam(taskId: number, teamId: string): boolean {
  const db = getDb();
  const task = db.select({ agentId: agentTasks.agentId }).from(agentTasks).where(eq(agentTasks.id, taskId)).get();
  if (!task) return false;
  return agentBelongsToTeam(task.agentId, teamId);
}

// POST /api/tasks — create task
apiTasksRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const { agentId, createdByAgentId, title, payload, consensus, consensusAgents, consensusStrategy } = body;
  const teamId = c.get('teamId' as any);

  if (!agentId || !title) {
    return c.json({ error: 'agentId and title are required' }, 400);
  }

  if (!agentBelongsToTeam(agentId, teamId)) {
    return c.json({ error: 'Agent not found in this team' }, 404);
  }

  const db = getDb();
  const task = db.insert(agentTasks).values({
    agentId,
    createdByAgentId: createdByAgentId ?? null,
    title,
    payload: payload ? JSON.stringify(payload) : null,
    consensus: consensus ?? false,
    consensusAgents: consensusAgents ? JSON.stringify(consensusAgents) : null,
    consensusStrategy: consensusStrategy ?? null,
  }).returning().get();

  // Wake on assignment: if the target agent has wakeOnAssignment, trigger it
  const targetAgent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (targetAgent?.wakeOnAssignment && targetAgent.enabled) {
    startAgent(agentId, 'assignment');
  }

  return c.json(task, 201);
});

// GET /api/tasks — list tasks (filterable, scoped to team)
apiTasksRoutes.get('/', async (c) => {
  const agentId = c.req.query('agentId');
  const status = c.req.query('status');
  const teamId = c.get('teamId' as any);

  const teamAgentIds = getTeamAgentIds(teamId);
  if (teamAgentIds.length === 0) return c.json([]);

  const db = getDb();
  const conditions = [inArray(agentTasks.agentId, teamAgentIds)];
  if (agentId) conditions.push(eq(agentTasks.agentId, agentId));
  if (status) conditions.push(eq(agentTasks.status, status as any));

  const where = and(...conditions);
  const tasks = db.select().from(agentTasks).where(where).orderBy(desc(agentTasks.createdAt)).limit(50).all();

  return c.json(tasks);
});

// GET /api/tasks/:id — single task with evaluations
apiTasksRoutes.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const teamId = c.get('teamId' as any);

  if (!taskBelongsToTeam(id, teamId)) {
    return c.json({ error: 'Task not found' }, 404);
  }

  const db = getDb();
  const task = db.select().from(agentTasks).where(eq(agentTasks.id, id)).get();
  if (!task) return c.json({ error: 'Task not found' }, 404);
  const evals = db.select().from(agentEvaluations).where(eq(agentEvaluations.taskId, id)).all();
  return c.json({ ...task, evaluations: evals });
});

// POST /api/tasks/:id/checkout — atomic lock
apiTasksRoutes.post('/:id/checkout', async (c) => {
  const id = parseInt(c.req.param('id'));
  const teamId = c.get('teamId' as any);

  if (!taskBelongsToTeam(id, teamId)) {
    return c.json({ error: 'Task not found' }, 404);
  }

  const db = getDb();
  // Atomic update: only succeeds if status is still 'pending'
  const updated = db
    .update(agentTasks)
    .set({ status: 'in_progress' })
    .where(and(eq(agentTasks.id, id), eq(agentTasks.status, 'pending')))
    .returning()
    .get();

  if (!updated) {
    return c.json({ error: 'Task not available (already taken or not found)' }, 409);
  }

  return c.json(updated);
});

// PATCH /api/tasks/:id — update task
apiTasksRoutes.patch('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json();
  const { status, result } = body;
  const teamId = c.get('teamId' as any);

  if (!taskBelongsToTeam(id, teamId)) {
    return c.json({ error: 'Task not found' }, 404);
  }

  const db = getDb();
  const updates: any = {};
  if (status) updates.status = status;
  if (result !== undefined) updates.result = typeof result === 'string' ? result : JSON.stringify(result);
  if (status === 'done' || status === 'failed') updates.completedAt = new Date();

  const updated = db
    .update(agentTasks)
    .set(updates)
    .where(eq(agentTasks.id, id))
    .returning()
    .get();

  if (!updated) {
    return c.json({ error: 'Task not found' }, 404);
  }

  return c.json(updated);
});

// POST /api/tasks/:id/evaluate — consensus vote
apiTasksRoutes.post('/:id/evaluate', async (c) => {
  const taskId = parseInt(c.req.param('id'));
  const body = await c.req.json();
  const { agentId, verdict, score, reasoning } = body;
  const teamId = c.get('teamId' as any);

  if (!agentId || !verdict) {
    return c.json({ error: 'agentId and verdict are required' }, 400);
  }

  if (!taskBelongsToTeam(taskId, teamId)) {
    return c.json({ error: 'Task not found' }, 404);
  }

  const db = getDb();
  db.insert(agentEvaluations).values({
    taskId,
    agentId,
    verdict,
    score: score ?? null,
    reasoning: reasoning ?? null,
  }).run();

  // Check if consensus is now complete
  const result = evaluateConsensus(taskId);

  return c.json(result);
});
