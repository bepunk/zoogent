import type { FC } from 'hono/jsx';
import { Layout } from './layout.js';
import { formatUsd } from '../lib/time.js';

interface CostDashboardProps {
  summary: {
    totalCents: number;
    byAgent: { agentId: string; agentName: string; totalCents: number }[];
    byModel: { model: string; totalCents: number; inputTokens: number; outputTokens: number }[];
  };
  days: number;
  teamBase: string;
  teamSlug?: string;
  teamName?: string;
}

export const CostDashboardPage: FC<CostDashboardProps> = ({ summary, days, teamBase, teamSlug, teamName }) => {
  const maxAgentCost = Math.max(...summary.byAgent.map(a => a.totalCents), 1);

  return (
    <Layout title="Costs" currentPath="/costs" teamSlug={teamSlug} teamName={teamName}>
      <div class="animate-in" style="display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 32px; flex-wrap: wrap; gap: 12px;">
        <h1 class="page-title">Cost Tracking</h1>
        <div style="display: flex; gap: 8px;">
          <a href={`${teamBase}/costs?days=7`} class={`btn ${days === 7 ? 'btn-primary' : ''}`}>7 days</a>
          <a href={`${teamBase}/costs?days=30`} class={`btn ${days === 30 ? 'btn-primary' : ''}`}>30 days</a>
          <a href={`${teamBase}/costs?days=90`} class={`btn ${days === 90 ? 'btn-primary' : ''}`}>90 days</a>
        </div>
      </div>

      {/* Total */}
      <div class="card animate-in delay-1" style="padding: 36px; margin-bottom: 32px; text-align: center;" >
        <div class="stat-label">Total Spend ({days} days)</div>
        <div class="stat-value" style="font-size: 44px; color: var(--warning); margin-top: 10px;">
          ${(summary.totalCents / 100).toFixed(2)}
        </div>
      </div>

      <div class="grid-2" style="gap: 24px;">
        {/* By Agent */}
        <div class="animate-in delay-2">
          <h2 class="section-title" style="margin-bottom: 16px;">By Agent</h2>
          {summary.byAgent.length === 0 ? (
            <div class="card" style="padding: 40px; text-align: center; color: var(--text-muted); font-size: 16px;">No cost data</div>
          ) : (
            <div style="display: flex; flex-direction: column; gap: 10px;">
              {summary.byAgent.map(a => (
                <div class="card" style="padding: 18px 24px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <a href={`${teamBase}/agents/${a.agentId}`} class="font-display" style="font-size: 16px; font-weight: 700; color: var(--accent); text-decoration: none;">{a.agentName}</a>
                    <span class="font-display" style="font-size: 16px; font-weight: 700; color: var(--warning);">{formatUsd(a.totalCents)}</span>
                  </div>
                  <div style="height: 6px; background: var(--bg-inset); border-radius: 3px; overflow: hidden;">
                    <div style={`width: ${(a.totalCents / maxAgentCost) * 100}%; height: 100%; background: var(--warning); border-radius: 3px; transition: width 0.5s ease;`} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By Model */}
        <div class="animate-in delay-3">
          <h2 class="section-title" style="margin-bottom: 16px;">By Model</h2>
          {summary.byModel.length === 0 ? (
            <div class="card" style="padding: 40px; text-align: center; color: var(--text-muted); font-size: 16px;">No cost data</div>
          ) : (
            <div class="card" style="overflow: hidden;">
              <table>
                <thead>
                  <tr><th>Model</th><th>Input</th><th>Output</th><th>Cost</th></tr>
                </thead>
                <tbody>
                  {summary.byModel.map(m => (
                    <tr>
                      <td class="font-mono" style="font-size: 14px; color: var(--text-primary); font-weight: 500;">{m.model}</td>
                      <td>{(m.inputTokens / 1000).toFixed(1)}k</td>
                      <td>{(m.outputTokens / 1000).toFixed(1)}k</td>
                      <td class="font-display" style="font-weight: 700; color: var(--warning);">{formatUsd(m.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};
