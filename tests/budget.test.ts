import { describe, it, expect } from 'vitest';
import app from '../src/index.js';
import { getDb } from '../src/db/index.js';
import { teams, agents, costEvents } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { getTeamMonthlySpend, getBudgetStatus } from '../src/core/cost-tracker.js';
import { createTestTeam, createTestAgent } from './helpers.js';

const API_KEY = process.env.ZOOGENT_API_KEY || 'zg_test-key-for-testing';

function req(path: string, options?: RequestInit) {
  return app.request(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      ...options?.headers,
    },
  });
}

describe('Team Budget', () => {
  describe('getTeamMonthlySpend', () => {
    it('returns 0 for team with no cost events', () => {
      const team = createTestTeam('Empty Budget Team');
      expect(getTeamMonthlySpend(team.id)).toBe(0);
    });

    it('sums cost events for all agents in team', () => {
      const team = createTestTeam('Cost Sum Team');
      const agent1 = createTestAgent(team.id);
      const agent2 = createTestAgent(team.id);
      const db = getDb();

      db.insert(costEvents).values({
        agentId: agent1, provider: 'anthropic', model: 'claude-sonnet',
        inputTokens: 100, outputTokens: 50, costCents: 500,
        occurredAt: new Date(),
      }).run();
      db.insert(costEvents).values({
        agentId: agent2, provider: 'anthropic', model: 'claude-sonnet',
        inputTokens: 200, outputTokens: 100, costCents: 300,
        occurredAt: new Date(),
      }).run();

      expect(getTeamMonthlySpend(team.id)).toBe(800);
    });

    it('does not include costs from other teams', () => {
      const teamA = createTestTeam('Budget Iso A');
      const teamB = createTestTeam('Budget Iso B');
      const agentA = createTestAgent(teamA.id);
      const agentB = createTestAgent(teamB.id);
      const db = getDb();

      db.insert(costEvents).values({
        agentId: agentA, provider: 'anthropic', model: 'claude-sonnet',
        inputTokens: 100, outputTokens: 50, costCents: 1000,
        occurredAt: new Date(),
      }).run();
      db.insert(costEvents).values({
        agentId: agentB, provider: 'anthropic', model: 'claude-sonnet',
        inputTokens: 100, outputTokens: 50, costCents: 2000,
        occurredAt: new Date(),
      }).run();

      expect(getTeamMonthlySpend(teamA.id)).toBe(1000);
      expect(getTeamMonthlySpend(teamB.id)).toBe(2000);
    });
  });

  describe('getBudgetStatus', () => {
    it('includes team budget data', () => {
      const team = createTestTeam('Budget Status Team');
      const db = getDb();
      db.update(teams).set({ budgetMonthlyCents: 5000 }).where(eq(teams.id, team.id)).run();

      const status = getBudgetStatus(team.id);
      expect(status.teamBudgetCents).toBe(5000);
      expect(status.teamSpentCents).toBe(0);
      expect(status.agents).toBeDefined();
    });

    it('returns null team budget when not set', () => {
      const team = createTestTeam('No Budget Team');
      const status = getBudgetStatus(team.id);
      expect(status.teamBudgetCents).toBeNull();
    });
  });

  describe('API /budget-status', () => {
    it('returns team and agent budget data', async () => {
      const team = createTestTeam('API Budget Team');
      const db = getDb();
      db.update(teams).set({ budgetMonthlyCents: 10000 }).where(eq(teams.id, team.id)).run();
      const agentId = createTestAgent(team.id);

      const res = await req(`/api/teams/${team.id}/budget-status`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.teamBudgetCents).toBe(10000);
      expect(data.teamSpentCents).toBeDefined();
      expect(data.agents).toBeDefined();
    });
  });

  describe('Budget enforcement', () => {
    it('team budget set but not exceeded — agent can run', () => {
      const team = createTestTeam('Under Budget Team');
      const db = getDb();
      db.update(teams).set({ budgetMonthlyCents: 100000 }).where(eq(teams.id, team.id)).run();
      const agentId = createTestAgent(team.id);

      // No costs yet, budget is 100000 cents — should be under budget
      const spent = getTeamMonthlySpend(team.id);
      const teamRow = db.select().from(teams).where(eq(teams.id, team.id)).get();
      expect(spent).toBeLessThan(teamRow!.budgetMonthlyCents!);
    });

    it('team budget exceeded — spend >= budget', () => {
      const team = createTestTeam('Over Budget Team');
      const db = getDb();
      db.update(teams).set({ budgetMonthlyCents: 100 }).where(eq(teams.id, team.id)).run();
      const agentId = createTestAgent(team.id);

      db.insert(costEvents).values({
        agentId, provider: 'anthropic', model: 'claude-sonnet',
        inputTokens: 1000, outputTokens: 500, costCents: 200,
        occurredAt: new Date(),
      }).run();

      const spent = getTeamMonthlySpend(team.id);
      const teamRow = db.select().from(teams).where(eq(teams.id, team.id)).get();
      expect(spent).toBeGreaterThanOrEqual(teamRow!.budgetMonthlyCents!);
    });

    it('no budget set — no blocking', () => {
      const team = createTestTeam('No Limit Team');
      const teamRow = teams;
      const db = getDb();
      const row = db.select().from(teams).where(eq(teams.id, team.id)).get();
      expect(row!.budgetMonthlyCents).toBeNull();
      // No budget = no limit = always under
    });
  });
});
