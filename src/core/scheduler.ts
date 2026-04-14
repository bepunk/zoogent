import cron, { type ScheduledTask } from 'node-cron';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { agents } from '../db/schema.js';
import { startAgent } from './process-manager.js';

const scheduledJobs = new Map<string, ScheduledTask>();

/**
 * Initialize the scheduler: load all enabled cron agents and schedule them.
 */
export function initScheduler() {
  const db = getDb();
  const cronAgents = db
    .select()
    .from(agents)
    .where(
      and(
        eq(agents.enabled, true),
        eq(agents.type, 'cron')
      )
    )
    .all();

  for (const agent of cronAgents) {
    if (agent.cronSchedule) {
      scheduleAgent(agent.id, agent.cronSchedule);
    }
  }

  console.log(`[scheduler] Initialized ${scheduledJobs.size} cron jobs`);
}

/**
 * Schedule or reschedule an agent.
 */
export function scheduleAgent(agentId: string, schedule: string) {
  // Remove existing job if any
  unscheduleAgent(agentId);

  if (!cron.validate(schedule)) {
    console.error(`[scheduler] Invalid cron schedule for ${agentId}: ${schedule}`);
    return;
  }

  const task = cron.schedule(schedule, () => {
    console.log(`[scheduler] Cron trigger for ${agentId}`);
    startAgent(agentId, 'cron');
  });

  scheduledJobs.set(agentId, task);
  console.log(`[scheduler] Scheduled ${agentId}: ${schedule}`);
}

/**
 * Remove an agent from the scheduler.
 */
export function unscheduleAgent(agentId: string) {
  const existing = scheduledJobs.get(agentId);
  if (existing) {
    existing.stop();
    scheduledJobs.delete(agentId);
  }
}

/**
 * Re-read agent config from DB and reschedule.
 */
export function refreshAgent(agentId: string) {
  const db = getDb();
  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();

  if (!agent || !agent.enabled || agent.type !== 'cron' || !agent.cronSchedule) {
    unscheduleAgent(agentId);
    return;
  }

  scheduleAgent(agentId, agent.cronSchedule);
}

/**
 * Stop all scheduled jobs.
 */
export function stopScheduler() {
  for (const [id, task] of scheduledJobs) {
    task.stop();
  }
  scheduledJobs.clear();
  console.log('[scheduler] All jobs stopped');
}

export function getScheduledAgents(): string[] {
  return Array.from(scheduledJobs.keys());
}
