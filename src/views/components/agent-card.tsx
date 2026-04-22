import type { FC } from 'hono/jsx';
import { formatUsd, timeAgo, formatDuration } from '../../lib/time.js';

interface AgentCardProps {
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
  latestRun: {
    status: string;
    trigger: string;
    startedAt: string | null;
    durationMs: number | null;
  } | null;
  teamBase?: string;
}

export const AgentCard: FC<AgentCardProps> = (props) => {
  const borderColor = props.running
    ? 'var(--success)'
    : !props.enabled
    ? 'var(--border)'
    : props.latestRun?.status === 'error'
    ? 'var(--error)'
    : 'var(--accent)';

  const statusClass = props.running
    ? 'badge-running'
    : props.latestRun?.status === 'success'
    ? 'badge-success'
    : props.latestRun?.status === 'error'
    ? 'badge-error'
    : 'badge-idle';

  const statusLabel = props.running
    ? 'Running'
    : !props.enabled
    ? 'Disabled'
    : props.latestRun?.status || 'Idle';

  const budgetPercent = props.budgetMonthlyCents
    ? Math.round((props.monthlySpendCents / props.budgetMonthlyCents) * 100)
    : null;

  return (
    <a href={`${props.teamBase || ''}/agents/${props.id}`} style="text-decoration: none; color: inherit;">
      <div class="card card-interactive" style={`padding: 0; overflow: hidden; height: 100%; display: flex; flex-direction: column;`}>
        {/* Colored top strip */}
        <div style={`height: 4px; background: ${borderColor}; flex-shrink: 0;`} />

        <div style="padding: 24px 28px; display: flex; flex-direction: column; gap: 16px; flex: 1;">
          {/* Header */}
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 10px;">
              {props.running && <div class="pulse-dot" />}
              <span class="font-display" style="font-size: 20px; font-weight: 700; color: var(--text-primary);">{props.name}</span>
            </div>
            <span class={`badge ${statusClass}`}>{statusLabel}</span>
          </div>

          {/* Type + model info */}
          <div style="display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--text-muted); font-weight: 500;">
            <span>
              {props.type === 'cron' && props.cronSchedule
                ? `Cron: ${props.cronSchedule}`
                : props.type.charAt(0).toUpperCase() + props.type.slice(1)}
            </span>
            {props.model && (
              <span class="badge badge-accent" style="font-size: 11px; padding: 2px 8px;">{props.model.replace('claude-', '').replace('-20251001', '')}</span>
            )}
          </div>

          {/* Last run */}
          {props.latestRun && (
            <div style="font-size: 15px; color: var(--text-secondary);">
              Last run {props.latestRun.startedAt ? timeAgo(new Date(props.latestRun.startedAt)) : 'never'}
              {props.latestRun.durationMs != null && (
                <span style="color: var(--text-muted); margin-left: 4px;">
                  ({formatDuration(props.latestRun.durationMs)})
                </span>
              )}
            </div>
          )}

          {/* Skills */}
          {props.skills.length > 0 && (
            <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: auto; padding-top: 4px;">
              {props.skills.slice(0, 3).map(s => (
                <span style="font-size: 12px; padding: 4px 10px; background: var(--bg-inset); color: var(--text-muted); border-radius: 6px; font-weight: 600; font-family: 'Plus Jakarta Sans', sans-serif;">
                  {s.replace(/\.md$/, '').split('/').pop()}
                </span>
              ))}
              {props.skills.length > 3 && (
                <span style="font-size: 12px; color: var(--text-muted); padding: 4px 0; font-weight: 600;">+{props.skills.length - 3}</span>
              )}
            </div>
          )}

          {/* Footer: cost + budget */}
          <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 14px; border-top: 1px solid var(--border);">
            <span style="font-size: 15px; color: var(--text-secondary); font-weight: 600;">
              {formatUsd(props.monthlySpendCents)}
              <span style="color: var(--text-muted); font-weight: 400;"> this month</span>
            </span>
            {budgetPercent !== null && (
              <div style="display: flex; align-items: center; gap: 8px;">
                <div style={`width: 48px; height: 5px; background: var(--bg-inset); border-radius: 3px; overflow: hidden;`}>
                  <div style={`width: ${Math.min(budgetPercent, 100)}%; height: 100%; background: ${budgetPercent > 80 ? 'var(--warning)' : 'var(--accent)'}; border-radius: 3px; transition: width 0.3s ease;`} />
                </div>
                <span style={`font-size: 13px; font-weight: 700; font-family: 'Plus Jakarta Sans', sans-serif; color: ${budgetPercent > 80 ? 'var(--warning)' : 'var(--text-muted)'};`}>{budgetPercent}%</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </a>
  );
};
