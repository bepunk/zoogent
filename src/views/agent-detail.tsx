import type { FC } from 'hono/jsx';
import { Layout } from './layout.js';
import { formatUsd, timeAgo, formatDuration } from '../lib/time.js';

interface Integration {
  id: string;
  provider: string;
  name: string;
  credentials: Record<string, string>; // masked
  enabled: boolean;
}

interface AgentDetailProps {
  agent: any;
  runs: any[];
  skills: any[];
  memories: any[];
  integrations: Integration[];
  monthlySpendCents: number;
  running: boolean;
  totalRuns: number;
  teamBase: string;
  teamSlug?: string;
  teamName?: string;
}

export const AgentDetailPage: FC<AgentDetailProps> = ({ agent, runs, skills, memories, integrations, monthlySpendCents, running, totalRuns, teamBase, teamSlug, teamName }) => {
  const statusClass = running ? 'badge-running' : agent.enabled ? 'badge-success' : 'badge-idle';
  const statusLabel = running ? 'Running' : agent.enabled ? 'Enabled' : 'Disabled';

  return (
    <Layout title={agent.name} currentPath="/agents" teamSlug={teamSlug} teamName={teamName}>
      {/* Back link */}
      <div class="animate-in" style="margin-bottom: 28px;">
        <a href={teamBase} style="font-size: 15px; color: var(--text-muted); text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
          &larr; Back to agents
        </a>
      </div>

      {/* Header */}
      <div class="animate-in delay-1" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
        <div style="display: flex; align-items: center; gap: 14px;">
          {running && <div class="pulse-dot" />}
          <h1 class="font-display" style="font-size: 32px; font-weight: 800; margin: 0; letter-spacing: -0.03em;">{agent.name}</h1>
          <span class={`badge ${statusClass}`}>{statusLabel}</span>
        </div>
        <div style="display: flex; gap: 10px;">
          <form method="post" action={`${teamBase}/agents/${agent.id}/trigger`} style="display: inline;">
            <button type="submit" class="btn btn-primary">Run Now</button>
          </form>
          {agent.enabled ? (
            <form method="post" action={`${teamBase}/agents/${agent.id}/disable`} style="display: inline;">
              <button type="submit" class="btn">Disable</button>
            </form>
          ) : (
            <form method="post" action={`${teamBase}/agents/${agent.id}/enable`} style="display: inline;">
              <button type="submit" class="btn">Enable</button>
            </form>
          )}
        </div>
      </div>

      {agent.description && (
        <p class="animate-in delay-1" style="font-size: 16px; color: var(--text-secondary); margin-bottom: 20px; line-height: 1.6;">{agent.description}</p>
      )}

      {/* Goal */}
      {agent.goal && (
        <div class="card animate-in delay-1" style="padding: 24px 28px; margin-bottom: 28px; border-left: 4px solid var(--accent);">
          <div class="stat-label" style="margin-bottom: 8px;">Goal</div>
          <p style="font-size: 15px; color: var(--text-primary); margin: 0; line-height: 1.7;">{agent.goal}</p>
        </div>
      )}

      {/* Stats */}
      <div class="animate-in delay-2" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 40px;">
        <div class="card" style="padding: 22px 26px;">
          <div class="stat-label">Type</div>
          <div class="font-display" style="font-size: 20px; font-weight: 700; margin-top: 6px;">{agent.type}</div>
          {agent.cronSchedule && <div style="font-size: 14px; color: var(--text-muted); margin-top: 4px;">{agent.cronSchedule}</div>}
        </div>
        <div class="card" style="padding: 22px 26px;">
          <div class="stat-label">Monthly Spend</div>
          <div class="font-display" style={`font-size: 20px; font-weight: 700; margin-top: 6px; color: var(--warning);`}>
            {formatUsd(monthlySpendCents)}
          </div>
          {agent.budgetMonthlyCents && (
            <div style="font-size: 14px; color: var(--text-muted); margin-top: 4px;">
              of {formatUsd(agent.budgetMonthlyCents)} budget
            </div>
          )}
        </div>
        <div class="card" style="padding: 22px 26px;">
          <div class="stat-label">Total Runs</div>
          <div class="font-display" style="font-size: 20px; font-weight: 700; margin-top: 6px;">{runs.length}</div>
        </div>
        <div class="card" style="padding: 22px 26px;">
          <div class="stat-label">Model</div>
          <div class="font-display" style="font-size: 16px; font-weight: 700; margin-top: 6px; color: var(--accent);">{agent.model || 'Not set'}</div>
        </div>
        <div class="card" style="padding: 22px 26px;">
          <div class="stat-label">Timeout</div>
          <div class="font-display" style="font-size: 20px; font-weight: 700; margin-top: 6px;">{agent.timeoutSec}s</div>
        </div>
      </div>

      {/* Runs */}
      <div class="animate-in delay-3">
        <h2 class="section-title" style="margin-bottom: 16px;">Recent Runs</h2>
        {runs.length === 0 ? (
          <div class="card" style="padding: 40px; text-align: center; color: var(--text-muted); font-size: 16px; margin-bottom: 40px;">No runs yet</div>
        ) : (
          <div class="card" style="overflow: hidden; margin-bottom: 40px;">
            <table>
              <thead>
                <tr><th>ID</th><th>Status</th><th>Trigger</th><th>Started</th><th>Duration</th><th>Exit</th></tr>
              </thead>
              <tbody>
                {runs.map((run, index) => {
                  const bc = run.status === 'success' ? 'badge-success'
                    : run.status === 'running' ? 'badge-running'
                    : run.status === 'error' || run.status === 'timeout' ? 'badge-error'
                    : 'badge-idle';
                  return (
                    <tr>
                      <td class="font-mono" style="font-size: 14px; color: var(--text-muted);">#{totalRuns - index}</td>
                      <td><span class={`badge ${bc}`}>{run.status}</span></td>
                      <td style="color: var(--text-secondary);">{run.trigger}</td>
                      <td>{run.startedAt ? timeAgo(new Date(run.startedAt)) : '-'}</td>
                      <td class="font-mono" style="font-size: 14px;">{run.durationMs != null ? formatDuration(run.durationMs) : '-'}</td>
                      <td class="font-mono" style="font-size: 14px;">{run.exitCode ?? '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Skills */}
      <div class="animate-in delay-4">
        <h2 class="section-title" style="margin-bottom: 16px;">Skills ({skills.length})</h2>
        <div class="card card-body" style="margin-bottom: 40px; min-height: 120px; display: flex; align-items: center;">
          {skills.length === 0 ? (
            <div style="width: 100%; text-align: center; color: var(--text-muted); font-size: 16px;">No skills assigned</div>
          ) : (
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              {skills.map((s: any) => (
                <a href={`${teamBase}/skills/${s.skillPath}`} style="text-decoration: none;">
                  <div style="padding: 10px 18px; background: var(--bg-inset); border-radius: 10px; display: flex; align-items: center; gap: 8px; transition: background 0.2s;">
                    <span class="font-display" style="font-size: 15px; font-weight: 600; color: var(--accent);">{s.skillPath}</span>
                    {s.required && <span class="badge badge-idle" style="font-size: 11px; padding: 2px 8px;">req</span>}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Integrations */}
      <div class="animate-in delay-2" style="margin-bottom: 36px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
          <h2 class="section-title" style="font-size: 20px;">Integrations</h2>
        </div>

        {integrations.length > 0 && (
          <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px;">
            {integrations.map((int) => (
              <div class="card" style="padding: 16px 20px; display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <span class={`badge ${int.enabled ? 'badge-success' : 'badge-idle'}`}>{int.provider}</span>
                  <span style="font-family: 'JetBrains Mono', monospace; font-size: 14px; color: var(--text-primary);">{int.name}</span>
                  <span style="font-size: 12px; color: var(--text-muted);">
                    {Object.entries(int.credentials).map(([k, v]) => `${k}: ${v}`).join(', ')}
                  </span>
                </div>
                <form method="post" action={`${teamBase}/agents/${agent.id}/integrations/${int.id}/delete`} style="display: inline;">
                  <button type="submit" style="background: none; border: none; color: var(--error); cursor: pointer; font-size: 13px; padding: 4px 8px;">Remove</button>
                </form>
              </div>
            ))}
          </div>
        )}

        <details style="margin-top: 8px;">
          <summary style="cursor: pointer; font-size: 14px; color: var(--accent); font-weight: 600;">Add integration</summary>
          <form method="post" action={`${teamBase}/agents/${agent.id}/integrations`} style="margin-top: 12px; display: flex; flex-direction: column; gap: 12px; max-width: 480px;">
            <div style="display: flex; gap: 12px;">
              <div style="flex: 1;">
                <label class="label" style="font-size: 12px; margin-bottom: 4px;">Provider</label>
                <select name="provider" required class="input">
                  <option value="gmail">Gmail</option>
                  <option value="google_maps">Google Maps</option>
                  <option value="hunter_io">Hunter.io</option>
                  <option value="telegram">Telegram</option>
                  <option value="tavily">Tavily</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div style="flex: 1;">
                <label class="label" style="font-size: 12px; margin-bottom: 4px;">Name (slug)</label>
                <input type="text" name="name" required placeholder="e.g. gmail_support" pattern="[a-z0-9_]+"
                  class="input" />
              </div>
            </div>
            <div>
              <label class="label" style="font-size: 12px; margin-bottom: 4px;">Credentials (JSON)</label>
              <textarea name="credentials" required placeholder='{"apiKey": "your-key-here"}' rows={3}
                class="input input-mono" style="font-size: 13px; resize: vertical;" />
            </div>
            <button type="submit" class="btn btn-primary" style="align-self: flex-start; padding: 8px 20px; font-size: 13px;">Save</button>
          </form>
        </details>
      </div>

      {/* Memories */}
      <div>
        <h2 class="section-title" style="margin-bottom: 16px;">Memories ({memories.length})</h2>
        {memories.length === 0 ? (
          <div class="card" style="padding: 40px; text-align: center; color: var(--text-muted); font-size: 16px;">No memories yet</div>
        ) : (
          <div style="display: flex; flex-direction: column; gap: 10px;">
            {memories.map((m: any) => (
              <div class="card" style="padding: 18px 24px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                  <span class={`badge ${m.source === 'feedback' ? 'badge-success' : m.source === 'auto' ? 'badge-accent' : 'badge-idle'}`}>{m.source}</span>
                  <span style="font-size: 13px; color: var(--text-muted); font-weight: 600;">importance: {m.importance}/10</span>
                </div>
                <p style="font-size: 16px; margin: 0; line-height: 1.6;">{m.content}</p>
                {m.tags && (
                  <div style="display: flex; gap: 6px; margin-top: 10px;">
                    {(typeof m.tags === 'string' ? JSON.parse(m.tags) : m.tags).map((t: string) => (
                      <span style="font-size: 12px; padding: 3px 10px; background: var(--bg-inset); color: var(--text-muted); border-radius: 6px; font-weight: 600; font-family: 'Plus Jakarta Sans', sans-serif;">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};
