import type { FC } from 'hono/jsx';
import { Layout } from './layout.js';
import { AgentCard } from './components/agent-card.js';
import { EmptyState } from './components/empty-state.js';

interface Agent {
  id: string;
  name: string;
  type: string;
  model: string | null;
  enabled: boolean;
  running: boolean;
  cronSchedule: string | null;
  budgetMonthlyCents: number | null;
  monthlySpendCents: number;
  skills: string[];
  latestRun: any;
}

interface DashboardProps {
  agents: Agent[];
  totalCostCents: number;
  teamBudgetCents?: number | null;
  teamSpentCents?: number;
  teamBase: string;
  teamSlug?: string;
  teamName?: string;
}

export const DashboardPage: FC<DashboardProps> = ({ agents, totalCostCents, teamBudgetCents, teamSpentCents, teamBase, teamSlug, teamName }) => {
  const running = agents.filter(a => a.running).length;
  const enabled = agents.filter(a => a.enabled).length;

  return (
    <Layout title="Dashboard" currentPath={teamBase} teamSlug={teamSlug} teamName={teamName}>
      {/* Page header */}
      <div class="animate-in" style="display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 32px;">
        <div>
          <h1 class="font-display" style="font-size: 32px; font-weight: 800; margin: 0; letter-spacing: -0.03em;">Agents</h1>
          <p class="page-subtitle">
            {running} running &middot; {enabled} enabled &middot; {agents.length} total
          </p>
        </div>
        <div class="card" style="padding: 18px 28px; text-align: right;">
          <div class="stat-label">This Month</div>
          <div class="stat-value" style="color: var(--warning);">
            ${(totalCostCents / 100).toFixed(2)}
            {teamBudgetCents ? (
              <span style="font-size: 14px; font-weight: 500; color: var(--text-muted);"> of ${(teamBudgetCents / 100).toFixed(2)}</span>
            ) : null}
          </div>
          {teamBudgetCents && teamSpentCents !== undefined ? (
            <div style="margin-top: 8px; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; min-width: 120px;">
              <div style={`height: 100%; border-radius: 2px; background: ${teamSpentCents >= teamBudgetCents ? 'var(--error)' : 'var(--accent)'}; width: ${Math.min(100, Math.round((teamSpentCents / teamBudgetCents) * 100))}%;`}></div>
            </div>
          ) : null}
        </div>
      </div>

      {agents.length === 0 ? (
        <div class="animate-in delay-1">
          <EmptyState icon="&#129421;" title="No agents yet">
            Go to <a href={`${teamBase}/chat`} style="color: var(--accent); font-weight: 600; text-decoration: none;">Architect</a> and describe what you want to automate. The Architect will create agents, write skills, and set up the team.
          </EmptyState>
        </div>
      ) : (
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 20px;">
          {agents.map((agent, i) => (
            <div class={`animate-in delay-${Math.min(i + 1, 4)}`}>
              <AgentCard {...agent} teamBase={teamBase} />
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
};
