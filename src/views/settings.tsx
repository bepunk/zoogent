import type { FC } from 'hono/jsx';
import { html } from 'hono/html';
import { Layout } from './layout.js';

interface ApiKeyEntry {
  id: string;
  name: string;
  key: string; // always masked
  createdAt: Date;
}

interface SettingsPageProps {
  apiKeys: ApiKeyEntry[];
  newKey?: string; // full key, shown once after creation
}

export const SettingsPage: FC<SettingsPageProps> = ({ apiKeys, newKey }) => {

  return (
    <Layout title="Settings" currentPath="/settings">
      <div class="animate-in" style="margin-bottom: 32px;">
        <h1 class="page-title">Settings</h1>
        <p class="page-subtitle">Server configuration</p>
      </div>

      {newKey && (
        <div class="animate-in" style="background: var(--bg-card); border: 2px solid var(--accent); padding: 20px 24px; border-radius: 12px; margin-bottom: 24px; max-width: 720px;">
          <p style="font-size: 14px; font-weight: 600; color: var(--text-primary); margin: 0 0 8px 0;">API key created. Copy it now — it won't be shown in full again.</p>
          <div style="display: flex; align-items: center; gap: 12px;">
            <input
              id="new-key-display"
              type="text"
              value={newKey}
              readonly
              class="input input-mono" style="flex: 1;"
            />
            {html`<script>
              function copyNewKey() {
                var el = document.getElementById('new-key-display');
                el.select();
                navigator.clipboard.writeText(el.value);
                var btn = document.getElementById('copy-new-btn');
                btn.textContent = 'Copied';
                setTimeout(function() { btn.textContent = 'Copy'; }, 2000);
              }
            </script>`}
            <button id="copy-new-btn" onclick="copyNewKey()" class="btn btn-primary" style="padding: 10px 20px; font-size: 13px;">Copy</button>
          </div>
        </div>
      )}

      <div class="card card-body-lg animate-in delay-1" style="max-width: 720px; margin-bottom: 24px;">
        <h2 class="section-title" style="margin-bottom: 8px;">ZooGent API Keys</h2>
        <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 20px;">
          For connecting MCP clients and agents to this server.
        </p>

        {apiKeys.length > 0 && (
          <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
            {apiKeys.map(k => (
              <div style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--bg-inset); border-radius: 10px;">
                <div style="flex: 1; min-width: 0;">
                  <div style="font-size: 14px; font-weight: 600; color: var(--text-primary);">{k.name}</div>
                  <div style="font-family: 'JetBrains Mono', monospace; font-size: 13px; color: var(--text-muted); margin-top: 2px;">{k.key}</div>
                </div>
                <div style="font-size: 12px; color: var(--text-muted); white-space: nowrap;">
                  {k.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                <form method="post" action={`/settings/api-key/${k.id}/delete`} style="margin: 0; padding: 0; display: flex;">
                  <button type="submit" style="background: none; border: none; color: var(--error); cursor: pointer; font-size: 13px; padding: 0; line-height: 1;">Revoke</button>
                </form>
              </div>
            ))}
          </div>
        )}

        <form method="post" action="/settings/api-key/generate" style="display: flex; align-items: center; gap: 12px;">
          <input type="text" name="name" placeholder="Key name (e.g. MCP, Production)" required
            class="input" style="flex: 1;" />
          <button type="submit" class="btn btn-primary" style="padding: 10px 20px; font-size: 13px;">Generate</button>
        </form>
      </div>

      <div class="card card-body-lg animate-in delay-2" style="max-width: 720px;">
        <h2 class="section-title" style="margin-bottom: 8px;">Anthropic API Keys</h2>
        <p style="color: var(--text-muted); font-size: 14px;">
          Managed per team. Go to a team's Settings page to configure its Anthropic API key.
        </p>
      </div>
    </Layout>
  );
};
