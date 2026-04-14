import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { costEvents, agents, teams } from '../db/schema.js';
import { startOfMonth } from '../lib/time.js';

export interface CostSummary {
  totalCents: number;
  byAgent: { agentId: string; agentName: string; totalCents: number }[];
  byModel: { model: string; totalCents: number; inputTokens: number; outputTokens: number }[];
}

export function getCostSummary(days?: number, agentId?: string, teamId?: string): CostSummary {
  const db = getDb();

  const conditions = [];
  if (days) {
    const since = new Date(Date.now() - days * 86400_000);
    conditions.push(sql`${costEvents.occurredAt} >= ${Math.floor(since.getTime() / 1000)}`);
  }
  if (agentId) {
    conditions.push(eq(costEvents.agentId, agentId));
  }
  if (teamId) {
    const teamAgentIds = db.select({ id: agents.id }).from(agents).where(eq(agents.teamId, teamId)).all().map(a => a.id);
    if (teamAgentIds.length === 0) return { totalCents: 0, byAgent: [], byModel: [] };
    conditions.push(inArray(costEvents.agentId, teamAgentIds));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Total
  const totalResult = db
    .select({ total: sql<number>`COALESCE(SUM(${costEvents.costCents}), 0)` })
    .from(costEvents)
    .where(where)
    .get();

  // By agent
  const byAgent = db
    .select({
      agentId: costEvents.agentId,
      agentName: agents.name,
      totalCents: sql<number>`COALESCE(SUM(${costEvents.costCents}), 0)`,
    })
    .from(costEvents)
    .leftJoin(agents, eq(costEvents.agentId, agents.id))
    .where(where)
    .groupBy(costEvents.agentId)
    .orderBy(desc(sql`SUM(${costEvents.costCents})`))
    .all();

  // By model
  const byModel = db
    .select({
      model: costEvents.model,
      totalCents: sql<number>`COALESCE(SUM(${costEvents.costCents}), 0)`,
      inputTokens: sql<number>`COALESCE(SUM(${costEvents.inputTokens}), 0)`,
      outputTokens: sql<number>`COALESCE(SUM(${costEvents.outputTokens}), 0)`,
    })
    .from(costEvents)
    .where(where)
    .groupBy(costEvents.model)
    .orderBy(desc(sql`SUM(${costEvents.costCents})`))
    .all();

  return {
    totalCents: totalResult?.total ?? 0,
    byAgent: byAgent.map(r => ({
      agentId: r.agentId,
      agentName: r.agentName ?? r.agentId,
      totalCents: r.totalCents,
    })),
    byModel,
  };
}

export function getAgentMonthlySpend(agentId: string): number {
  const db = getDb();
  const monthStart = startOfMonth();

  const result = db
    .select({ total: sql<number>`COALESCE(SUM(${costEvents.costCents}), 0)` })
    .from(costEvents)
    .where(
      and(
        eq(costEvents.agentId, agentId),
        sql`${costEvents.occurredAt} >= ${Math.floor(monthStart.getTime() / 1000)}`
      )
    )
    .get();

  return result?.total ?? 0;
}

export function getTeamMonthlySpend(teamId: string): number {
  const db = getDb();
  const monthStart = startOfMonth();

  const teamAgentIds = db.select({ id: agents.id }).from(agents).where(eq(agents.teamId, teamId)).all().map(a => a.id);
  if (teamAgentIds.length === 0) return 0;

  const result = db
    .select({ total: sql<number>`COALESCE(SUM(${costEvents.costCents}), 0)` })
    .from(costEvents)
    .where(
      and(
        inArray(costEvents.agentId, teamAgentIds),
        sql`${costEvents.occurredAt} >= ${Math.floor(monthStart.getTime() / 1000)}`
      )
    )
    .get();

  return result?.total ?? 0;
}

export interface BudgetStatus {
  agents: {
    agentId: string;
    agentName: string;
    budgetCents: number | null;
    spentCents: number;
    percentUsed: number | null;
  }[];
  teamBudgetCents: number | null;
  teamSpentCents: number;
}

export function getBudgetStatus(teamId?: string): BudgetStatus {
  const db = getDb();
  const monthStart = startOfMonth();

  const where = teamId ? eq(agents.teamId, teamId) : undefined;
  const allAgents = db.select().from(agents).where(where).all();

  const agentBudgets = allAgents.map(agent => {
    const result = db
      .select({ total: sql<number>`COALESCE(SUM(${costEvents.costCents}), 0)` })
      .from(costEvents)
      .where(
        and(
          eq(costEvents.agentId, agent.id),
          sql`${costEvents.occurredAt} >= ${Math.floor(monthStart.getTime() / 1000)}`
        )
      )
      .get();

    const spent = result?.total ?? 0;

    return {
      agentId: agent.id,
      agentName: agent.name,
      budgetCents: agent.budgetMonthlyCents,
      spentCents: spent,
      percentUsed: agent.budgetMonthlyCents ? Math.round((spent / agent.budgetMonthlyCents) * 100) : null,
    };
  });

  let teamBudgetCents: number | null = null;
  let teamSpentCents = 0;

  if (teamId) {
    const team = db.select().from(teams).where(eq(teams.id, teamId)).get();
    teamBudgetCents = team?.budgetMonthlyCents ?? null;
    teamSpentCents = getTeamMonthlySpend(teamId);
  }

  return {
    agents: agentBudgets,
    teamBudgetCents,
    teamSpentCents,
  };
}
