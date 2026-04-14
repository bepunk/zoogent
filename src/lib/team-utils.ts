import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { agents } from '../db/schema.js';

/** Get all agent IDs belonging to a team. Returns empty array if none. */
export function getTeamAgentIds(teamId: string): string[] {
  const db = getDb();
  return db.select({ id: agents.id }).from(agents).where(eq(agents.teamId, teamId)).all().map(a => a.id);
}

/** Check if an agent belongs to the given team. */
export function agentBelongsToTeam(agentId: string, teamId: string): boolean {
  const db = getDb();
  const agent = db.select({ id: agents.id }).from(agents).where(and(eq(agents.id, agentId), eq(agents.teamId, teamId))).get();
  return !!agent;
}
