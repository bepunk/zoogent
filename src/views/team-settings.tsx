import type { FC } from 'hono/jsx';
import { Layout } from './layout.js';

interface TeamSettingsPageProps {
  teamBase: string;
  teamSlug: string;
  teamName: string;
  hasAnthropicKey: boolean;
  anthropicKeyMasked: string | null;
  autoApproveKnowledge: boolean;
  teamBudgetCents: number | null;
  teamSpentCents: number;
  message?: string;
  error?: string;
}

export const TeamSettingsPage: FC<TeamSettingsPageProps> = ({ teamBase, teamSlug, teamName, hasAnthropicKey, anthropicKeyMasked, autoApproveKnowledge, teamBudgetCents, teamSpentCents, message, error }) => {
  return (
    <Layout title="Team Settings" currentPath={`${teamBase}/settings`} teamSlug={teamSlug} teamName={teamName}>
      <div class="animate-in" style="margin-bottom: 32px;">
        <h1 class="page-title">Team Settings</h1>
        <p class="page-subtitle">API keys and configuration for {teamName}</p>
      </div>

      {message && (
        <div class="animate-in" style="background: var(--accent); color: white; padding: 12px 20px; border-radius: 10px; margin-bottom: 24px; font-size: 14px;">
          {message}
        </div>
      )}

      {error && (
        <div class="animate-in" style="padding: 18px 24px; margin-bottom: 24px; border-radius: 16px; background: var(--error-soft); border: 1px solid rgba(239,68,68,0.15);">
          <p style="margin: 0; font-size: 15px; color: var(--error);">{error}</p>
        </div>
      )}

      <div class="card card-body-lg animate-in delay-1" style="max-width: 640px; margin-bottom: 24px;">
        <h2 class="section-title" style="margin-bottom: 8px;">Anthropic API Key</h2>
        <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 20px;">
          Required for the Architect AI. Get your key at <a href="https://console.anthropic.com/settings/keys" target="_blank" style="color: var(--accent);">console.anthropic.com</a>
        </p>

        <form method="post" action={`${teamBase}/settings/anthropic-key`} style="display: flex; flex-direction: column; gap: 16px;">
          <div>
            <label class="label">API Key</label>
            <input
              type="password"
              name="apiKey"
              placeholder={hasAnthropicKey ? 'sk-ant-••••••••••••••••' : 'sk-ant-api03-...'}
              class="input input-mono"
            />
          </div>
          <div style="display: flex; gap: 12px; align-items: center;">
            <button type="submit" class="btn btn-primary" style="padding: 10px 24px;">
              {hasAnthropicKey ? 'Update Key' : 'Save Key'}
            </button>
            {hasAnthropicKey && anthropicKeyMasked && (
              <span style="color: var(--text-muted); font-size: 13px; font-family: 'JetBrains Mono', monospace;">{anthropicKeyMasked}</span>
            )}
          </div>
        </form>

        {hasAnthropicKey && (
          <form method="post" action={`${teamBase}/settings/anthropic-key/delete`} style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
            <button type="submit" style="background: none; border: none; color: var(--error); cursor: pointer; font-size: 13px; padding: 0;">
              Remove API key
            </button>
          </form>
        )}
      </div>

      <div class="card card-body-lg animate-in delay-2" style="max-width: 640px; margin-bottom: 24px;">
        <h2 class="section-title" style="margin-bottom: 8px;">Team Budget</h2>
        <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 20px;">
          Monthly spending limit for all agents in this team. Leave empty for no limit.
        </p>

        {teamBudgetCents !== null && (
          <div style="margin-bottom: 20px; padding: 14px 18px; background: var(--bg-inset); border-radius: 8px;">
            <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 6px;">Current month</div>
            <div style="font-size: 20px; font-weight: 700;">
              ${(teamSpentCents / 100).toFixed(2)} <span style="font-size: 14px; font-weight: 500; color: var(--text-muted);">of ${(teamBudgetCents / 100).toFixed(2)}</span>
            </div>
            <div style="margin-top: 8px; height: 6px; background: var(--border); border-radius: 3px; overflow: hidden;">
              <div style={`height: 100%; border-radius: 3px; background: ${teamSpentCents >= teamBudgetCents ? 'var(--error)' : 'var(--accent)'}; width: ${Math.min(100, Math.round((teamSpentCents / teamBudgetCents) * 100))}%;`}></div>
            </div>
          </div>
        )}

        <form method="post" action={`${teamBase}/settings/budget`} style="display: flex; flex-direction: column; gap: 16px;">
          <div>
            <label class="label">Monthly Budget (USD)</label>
            <input
              type="number"
              name="budget"
              step="0.01"
              min="0"
              placeholder={teamBudgetCents !== null ? (teamBudgetCents / 100).toFixed(2) : 'e.g. 50.00'}
              class="input input-mono"
            />
          </div>
          <div style="display: flex; gap: 12px; align-items: center;">
            <button type="submit" class="btn btn-primary" style="padding: 10px 24px;">
              {teamBudgetCents !== null ? 'Update Budget' : 'Set Budget'}
            </button>
            {teamBudgetCents !== null && (
              <span style="color: var(--text-muted); font-size: 13px;">Budget is active</span>
            )}
          </div>
        </form>

        {teamBudgetCents !== null && (
          <form method="post" action={`${teamBase}/settings/budget`} style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
            <input type="hidden" name="budget" value="" />
            <button type="submit" style="background: none; border: none; color: var(--error); cursor: pointer; font-size: 13px; padding: 0;">
              Remove budget limit
            </button>
          </form>
        )}
      </div>

      <div class="card card-body-lg animate-in delay-3" style="max-width: 640px; margin-bottom: 24px;">
        <h2 class="section-title" style="margin-bottom: 8px;">Auto-approve Knowledge</h2>
        <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 20px;">
          When enabled, knowledge proposed by agents is automatically approved without manual review.
        </p>

        <form method="post" action={`${teamBase}/settings/auto-approve`} style="display: flex; align-items: center; gap: 16px;">
          <input type="hidden" name="enabled" value={autoApproveKnowledge ? 'false' : 'true'} />
          <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: 14px;">
            <span style={`display: inline-block; width: 44px; height: 24px; border-radius: 12px; position: relative; transition: background 0.2s; background: ${autoApproveKnowledge ? 'var(--accent)' : 'var(--border)'};`}>
              <span style={`display: block; width: 20px; height: 20px; border-radius: 50%; background: var(--bg-card); position: absolute; top: 2px; transition: left 0.2s; left: ${autoApproveKnowledge ? '22px' : '2px'};`}></span>
            </span>
            {autoApproveKnowledge ? 'Enabled' : 'Disabled'}
          </label>
          <button type="submit" class="btn btn-primary" style="padding: 8px 20px; font-size: 13px;">
            {autoApproveKnowledge ? 'Disable' : 'Enable'}
          </button>
        </form>
      </div>
    </Layout>
  );
};
