import { spawn, type ChildProcess } from 'node:child_process';
import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { agents, agentRuns, costEvents, agentSkills, teamKnowledge, chatMessages, teamSettings, agentIntegrations, apiKeys, teams } from '../db/schema.js';
import { decryptEnv, isEncryptedEnv, sanitizeLogs, loadMasterKey, decrypt } from '../lib/crypto.js';
import { startOfMonth } from '../lib/time.js';
import { getTeamMonthlySpend } from './cost-tracker.js';
import { buildMemoryInjection } from '../lib/memory.js';
import { loadSkills } from '../lib/skills.js';
import { resolve } from 'node:path';
import { config } from '../lib/config.js';

const MAX_LOG_BYTES = 50 * 1024; // 50KB

interface RunningProcess {
  child: ChildProcess;
  runId: number;
  agentId: string;
  stdout: string[];
  stderr: string[];
  stdoutBytes: number;
  stderrBytes: number;
  timeoutHandle?: ReturnType<typeof setTimeout>;
  graceHandle?: ReturnType<typeof setTimeout>;
}

const runningProcesses = new Map<string, RunningProcess>();

export function isRunning(agentId: string): boolean {
  return runningProcesses.has(agentId);
}

export async function startAgent(
  agentId: string,
  trigger: 'cron' | 'manual' | 'assignment' | 'api'
): Promise<number | null> {
  // Max 1 concurrent run per agent — reserve slot immediately to prevent race conditions
  // (await on sync better-sqlite3 calls yields to event loop, allowing duplicate triggers)
  if (runningProcesses.has(agentId)) {
    console.log(`[process-manager] Agent ${agentId} already running, skipping`);
    return null;
  }
  runningProcesses.set(agentId, null as any); // reserve slot before any await

  const db = getDb();

  // Load agent config
  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent) {
    console.error(`[process-manager] Agent ${agentId} not found`);
    runningProcesses.delete(agentId);
    return null;
  }

  if (!agent.enabled) {
    console.log(`[process-manager] Agent ${agentId} is disabled, skipping`);
    runningProcesses.delete(agentId);
    return null;
  }

  // Budget check
  if (agent.budgetMonthlyCents) {
    const monthStart = startOfMonth();
    const result = db
      .select({ total: sql<number>`COALESCE(SUM(${costEvents.costCents}), 0)` })
      .from(costEvents)
      .where(
        and(
          eq(costEvents.agentId, agentId),
          sql`${costEvents.occurredAt} >= ${monthStart.getTime()}`
        )
      )
      .get();

    const spent = result?.total ?? 0;
    if (spent >= agent.budgetMonthlyCents) {
      console.log(`[process-manager] Agent ${agentId} over budget: ${spent}/${agent.budgetMonthlyCents} cents`);
      runningProcesses.delete(agentId);
      return null;
    }
  }

  // Team budget check
  if (agent.teamId) {
    const team = db.select().from(teams).where(eq(teams.id, agent.teamId)).get();
    if (team?.budgetMonthlyCents) {
      const teamSpent = getTeamMonthlySpend(agent.teamId);
      if (teamSpent >= team.budgetMonthlyCents) {
        console.log(`[process-manager] Team ${agent.teamId} over budget: ${teamSpent}/${team.budgetMonthlyCents} cents`);
        runningProcesses.delete(agentId);
        return null;
      }
    }
  }

  // Create run record
  const now = new Date();
  const run = db
    .insert(agentRuns)
    .values({
      agentId,
      status: 'running',
      startedAt: now,
      trigger,
    })
    .returning()
    .get();

  // Build environment
  const dataDir = config.dataDir;
  let agentEnv: Record<string, string> = {};

  if (agent.env) {
    try {
      if (isEncryptedEnv(agent.env)) {
        const masterKey = loadMasterKey(dataDir);
        agentEnv = decryptEnv(agent.env, masterKey);
      } else {
        agentEnv = JSON.parse(agent.env);
      }
    } catch (err) {
      console.error(`[process-manager] Failed to parse env for ${agentId}:`, err);
    }
  }

  // Inject Anthropic API key from team_settings or process.env
  let anthropicKey = process.env.ANTHROPIC_API_KEY || '';
  if (!anthropicKey && agent.teamId) {
    const keySetting = db.select().from(teamSettings)
      .where(and(eq(teamSettings.teamId, agent.teamId), eq(teamSettings.key, 'anthropic_api_key')))
      .get();
    if (keySetting) {
      if (keySetting.encrypted) {
        const masterKey = loadMasterKey(dataDir);
        anthropicKey = decrypt(keySetting.value, masterKey);
      } else {
        anthropicKey = keySetting.value;
      }
    }
  }

  const childEnv: Record<string, string> = {
    ...process.env as Record<string, string>,
    ...agentEnv,
    ZOOGENT_API_URL: `http://127.0.0.1:${process.env.PORT || '3200'}`,
    ZOOGENT_AGENT_ID: agentId,
    ZOOGENT_AGENT_GOAL: agent.goal || '',
    ZOOGENT_AGENT_MODEL: agent.model || '',
    ZOOGENT_RUN_ID: String(run.id),
    ZOOGENT_API_KEY: db.select().from(apiKeys).limit(1).get()?.key || '',
    ZOOGENT_SKILLS_DIR: process.env.SKILLS_DIR || resolve(process.cwd(), 'data/skills'),
    ZOOGENT_TEAM_ID: agent.teamId,
    ANTHROPIC_API_KEY: anthropicKey,
  };

  // Inject agent integrations
  const integrations = db.select().from(agentIntegrations)
    .where(and(eq(agentIntegrations.agentId, agentId), eq(agentIntegrations.enabled, true)))
    .all();
  if (integrations.length > 0) {
    const masterKeyForInt = loadMasterKey(dataDir);
    const integrationsJson: Record<string, any> = {};
    for (const int of integrations) {
      try {
        const creds = JSON.parse(decrypt(int.credentials, masterKeyForInt));
        const nameUpper = int.name.toUpperCase().replace(/-/g, '_');
        // Individual env vars: INTEGRATION_{NAME}_{FIELD}
        for (const [field, value] of Object.entries(creds)) {
          const fieldUpper = field.replace(/([A-Z])/g, '_$1').toUpperCase();
          childEnv[`INTEGRATION_${nameUpper}_${fieldUpper}`] = String(value);
          agentEnv[`INTEGRATION_${nameUpper}_${fieldUpper}`] = String(value); // for log sanitization
        }
        integrationsJson[int.name] = { provider: int.provider, ...creds };
      } catch {}
    }
    childEnv.ZOOGENT_INTEGRATIONS = JSON.stringify(integrationsJson);
  }

  // Inject memories (composite scored, decayed)
  const memoriesJson = buildMemoryInjection(agentId);
  if (memoriesJson) childEnv.ZOOGENT_MEMORIES = memoriesJson;

  // Inject required skills content
  const requiredSkills = db
    .select()
    .from(agentSkills)
    .where(and(eq(agentSkills.agentId, agentId), eq(agentSkills.required, true)))
    .all();
  if (requiredSkills.length > 0) {
    const skillPaths = requiredSkills.map(s => s.skillPath);
    const skillsContent = loadSkills(skillPaths, agent.teamId);
    if (skillsContent) childEnv.ZOOGENT_AGENT_SKILLS = skillsContent;
  }

  // Inject active team knowledge (scoped by team)
  const activeKnowledge = db
    .select()
    .from(teamKnowledge)
    .where(and(eq(teamKnowledge.teamId, agent.teamId), eq(teamKnowledge.status, 'active')))
    .all();
  if (activeKnowledge.length > 0) {
    childEnv.ZOOGENT_TEAM_KNOWLEDGE = JSON.stringify(
      activeKnowledge.map(k => ({ title: k.title, content: k.content }))
    );
  }

  // Parse command and args
  const args: string[] = agent.args ? JSON.parse(agent.args) : [];
  const cwd = agent.cwd || process.cwd();

  console.log(`[process-manager] Starting ${agentId}: ${agent.command} ${args.join(' ')}`);

  const child = spawn(agent.command, args, {
    cwd,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const rp: RunningProcess = {
    child,
    runId: run.id,
    agentId,
    stdout: [],
    stderr: [],
    stdoutBytes: 0,
    stderrBytes: 0,
  };

  // Capture stdout (keep tail, cap at MAX_LOG_BYTES)
  child.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    rp.stdoutBytes += chunk.length;
    rp.stdout.push(text);
    // Trim if over limit (keep tail)
    while (rp.stdoutBytes > MAX_LOG_BYTES && rp.stdout.length > 1) {
      const removed = rp.stdout.shift()!;
      rp.stdoutBytes -= Buffer.byteLength(removed);
    }
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    rp.stderrBytes += chunk.length;
    rp.stderr.push(text);
    while (rp.stderrBytes > MAX_LOG_BYTES && rp.stderr.length > 1) {
      const removed = rp.stderr.shift()!;
      rp.stderrBytes -= Buffer.byteLength(removed);
    }
  });

  // Flush logs to DB every 5 seconds (so get_logs shows progress while running)
  const flushInterval = setInterval(() => {
    const stdoutText = sanitizeLogs(rp.stdout.join(''), agentEnv);
    const stderrText = sanitizeLogs(rp.stderr.join(''), agentEnv);
    db.update(agentRuns)
      .set({
        stdout: stdoutText || null,
        stderr: stderrText || null,
      })
      .where(eq(agentRuns.id, run.id))
      .run();
  }, 5000);

  // Timeout handling (0 = no timeout; long-running agents default to no timeout)
  const defaultTimeout = agent.type === 'long-running' ? 0 : 600;
  const timeoutMs = (agent.timeoutSec ?? defaultTimeout) * 1000;
  if (timeoutMs > 0) {
    rp.timeoutHandle = setTimeout(() => {
      console.log(`[process-manager] Agent ${agentId} timed out, sending SIGTERM`);
      child.kill('SIGTERM');

      // Grace period before SIGKILL
      const graceMs = (agent.graceSec ?? 30) * 1000;
      rp.graceHandle = setTimeout(() => {
        if (!child.killed) {
          console.log(`[process-manager] Agent ${agentId} grace period expired, sending SIGKILL`);
          child.kill('SIGKILL');
        }
      }, graceMs);
    }, timeoutMs);
  }

  // Handle exit
  child.on('close', (code, signal) => {
    clearInterval(flushInterval);
    if (rp.timeoutHandle) clearTimeout(rp.timeoutHandle);
    if (rp.graceHandle) clearTimeout(rp.graceHandle);
    runningProcesses.delete(agentId);

    const finished = new Date();
    const durationMs = finished.getTime() - now.getTime();

    // Determine status
    let status: 'success' | 'error' | 'timeout' | 'cancelled';
    if (signal === 'SIGTERM' || signal === 'SIGKILL') {
      status = 'timeout';
    } else if (code === 0) {
      status = 'success';
    } else {
      status = 'error';
    }

    // Sanitize logs before storing
    const stdoutText = sanitizeLogs(rp.stdout.join(''), agentEnv);
    const stderrText = sanitizeLogs(rp.stderr.join(''), agentEnv);

    db.update(agentRuns)
      .set({
        status,
        finishedAt: finished,
        exitCode: code ?? undefined,
        stdout: stdoutText || null,
        stderr: stderrText || null,
        durationMs,
        pid: null,
      })
      .where(eq(agentRuns.id, run.id))
      .run();

    console.log(`[process-manager] Agent ${agentId} finished: ${status} (${code}) in ${durationMs}ms`);

    // Self-healing: notify Architect AI about errors
    if (status === 'error' || status === 'timeout') {
      try {
        const errorSummary = stderrText
          ? stderrText.slice(0, 500)
          : `Agent exited with code ${code}`;
        db.insert(chatMessages).values({
          teamId: agent.teamId,
          role: 'user',
          content: `[Auto] Agent "${agentId}" failed (${status}, exit code ${code}).\n\nStderr:\n${errorSummary}\n\nUse get_logs to see full output and suggest a fix.`,
        }).run();
        console.log(`[process-manager] Error notification added to chat for ${agentId}`);
      } catch {}
    }
  });

  // Store PID for orphan detection
  db.update(agentRuns)
    .set({ pid: child.pid ?? null })
    .where(eq(agentRuns.id, run.id))
    .run();

  runningProcesses.set(agentId, rp);

  return run.id;
}

export function stopAgent(agentId: string): boolean {
  const rp = runningProcesses.get(agentId);
  if (!rp) return false;

  rp.child.kill('SIGTERM');

  const graceMs = 30_000;
  rp.graceHandle = setTimeout(() => {
    if (!rp.child.killed) {
      rp.child.kill('SIGKILL');
    }
  }, graceMs);

  return true;
}

/**
 * On startup, mark any stale "running" runs as "error" (orphan detection).
 */
export function cleanupOrphanRuns(): string[] {
  const db = getDb();
  const orphans = db
    .update(agentRuns)
    .set({ status: 'error', summary: 'Orphaned: server restarted while running' })
    .where(eq(agentRuns.status, 'running'))
    .returning()
    .all();

  if (orphans.length > 0) {
    console.log(`[process-manager] Cleaned up ${orphans.length} orphaned runs`);
  }
  return [...new Set(orphans.map(r => r.agentId))];
}

export function getRunningAgents(): string[] {
  return Array.from(runningProcesses.keys());
}
