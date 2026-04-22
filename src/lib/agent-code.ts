import { writeFileSync, mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { agents, teamCodeLibrary } from '../db/schema.js';
import { config } from './config.js';
import { bundleAgentSource, type BundleResult } from './agent-bundler.js';

export interface SetAgentCodeResult {
  ok: boolean;
  error?: string;
  hash?: string;
  warnings?: string[];
}

export function getAgentCodePath(teamId: string, agentId: string): string {
  return resolve(config.dataDir, 'teams', teamId, 'agents', `${agentId}.mjs`);
}

export async function setAgentCode(teamId: string, agentId: string, source: string): Promise<SetAgentCodeResult> {
  const db = getDb();
  const agent = db.select().from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.teamId, teamId)))
    .get();
  if (!agent) return { ok: false, error: `Agent "${agentId}" not found in team "${teamId}".` };
  if (agent.runtime !== 'typescript') {
    return { ok: false, error: `Agent "${agentId}" has runtime="${agent.runtime}". Code upload is only supported for typescript-runtime agents.` };
  }

  const libraryRows = db.select().from(teamCodeLibrary).where(eq(teamCodeLibrary.teamId, teamId)).all();
  const teamLibrary = Object.fromEntries(libraryRows.map(r => [r.path, r.content]));
  const result: BundleResult = await bundleAgentSource(source, agentId, teamLibrary);
  if (!result.ok) {
    db.update(agents).set({
      source,
      bundleError: result.error,
      updatedAt: new Date(),
    }).where(eq(agents.id, agentId)).run();
    return { ok: false, error: result.error };
  }

  db.update(agents).set({
    source,
    bundle: result.bundle,
    bundleHash: result.hash,
    bundleError: null,
    updatedAt: new Date(),
  }).where(eq(agents.id, agentId)).run();

  return { ok: true, hash: result.hash, warnings: result.warnings };
}

export function getAgentCode(teamId: string, agentId: string): { source: string | null; bundleError: string | null; bundleHash: string | null } | null {
  const db = getDb();
  const agent = db.select({
    source: agents.source,
    bundleError: agents.bundleError,
    bundleHash: agents.bundleHash,
    teamId: agents.teamId,
    runtime: agents.runtime,
  }).from(agents).where(eq(agents.id, agentId)).get();
  if (!agent || agent.teamId !== teamId) return null;
  if (agent.runtime !== 'typescript') return null;
  return { source: agent.source, bundleError: agent.bundleError, bundleHash: agent.bundleHash };
}

/**
 * Materialize an agent's bundle to disk so it can be spawned.
 * Writes only if the stored hash differs from the file's current hash,
 * skipping the IO for no-op re-runs. Returns the absolute file path.
 */
export function materializeAgentCode(agentId: string): string {
  const db = getDb();
  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent) throw new Error(`Agent "${agentId}" not found`);
  if (agent.runtime !== 'typescript') {
    throw new Error(`Agent "${agentId}" runtime is "${agent.runtime}", not typescript`);
  }
  if (!agent.bundle || !agent.bundleHash) {
    throw new Error(`Agent "${agentId}" has no bundled code. Upload source via write_agent_code.`);
  }

  const outPath = getAgentCodePath(agent.teamId, agentId);
  const outDir = dirname(outPath);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  // Skip IO when file already matches stored hash (cheap marker via .hash sibling).
  const marker = `${outPath}.hash`;
  if (existsSync(outPath) && existsSync(marker)) {
    try {
      const existing = readFileSync(marker, 'utf8').trim();
      if (existing === agent.bundleHash) return outPath;
    } catch {}
  }

  writeFileSync(outPath, agent.bundle, 'utf8');
  writeFileSync(marker, agent.bundleHash, 'utf8');
  return outPath;
}

export function removeAgentCodeFile(teamId: string, agentId: string): void {
  const outPath = getAgentCodePath(teamId, agentId);
  try { rmSync(outPath, { force: true }); } catch {}
  try { rmSync(`${outPath}.hash`, { force: true }); } catch {}
}
