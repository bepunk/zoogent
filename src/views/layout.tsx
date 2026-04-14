import type { FC, PropsWithChildren } from 'hono/jsx';
import { html } from 'hono/html';

interface LayoutProps {
  title?: string;
  currentPath?: string;
  teamSlug?: string;
  teamName?: string;
}

export const Layout: FC<PropsWithChildren<LayoutProps>> = ({ children, title, currentPath, teamSlug, teamName }) => {
  const teamBase = teamSlug ? `/teams/${teamSlug}` : '';

  return (
    <html lang="en" data-theme="light">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title ? `${title} — ZooGent` : 'ZooGent'}</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <script src="https://unpkg.com/htmx.org@2.0.4"></script>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='35' cy='20' r='12' fill='%236C5CE7'/><circle cx='65' cy='20' r='12' fill='%236C5CE7'/><circle cx='18' cy='45' r='10' fill='%236C5CE7'/><circle cx='82' cy='45' r='10' fill='%236C5CE7'/><ellipse cx='50' cy='65' rx='25' ry='22' fill='%236C5CE7'/></svg>" />
      <link rel="stylesheet" href="/static/styles.css" />
      {html`
      <script>
        (function() {
          var saved = localStorage.getItem('zoogent-theme') || 'light';
          document.documentElement.setAttribute('data-theme', saved);
        })();
        function toggleTheme() {
          var html = document.documentElement;
          var next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
          html.setAttribute('data-theme', next);
          localStorage.setItem('zoogent-theme', next);
          document.getElementById('theme-icon').textContent = next === 'dark' ? '\u2600\uFE0F' : '\u263E';
        }
        function toggleMobileMenu() {
          var menu = document.getElementById('mobile-menu');
          menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex';
        }
        function toggleTeamNav() {
          var nav = document.getElementById('team-nav-items');
          nav.style.display = nav.style.display === 'none' ? 'flex' : 'none';
        }
      </script>
      `}
    </head>
    <body>
      <header style="background: var(--bg-header); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 100;">
        <div style="max-width: 1320px; margin: 0 auto; padding: 0 32px; display: flex; align-items: center; justify-content: space-between; height: 64px;">
          <div style="display: flex; align-items: center; gap: 32px;">
            <a href="/teams" style="text-decoration: none; display: flex; align-items: center; gap: 10px;">
              <span class="font-display" style="font-size: 22px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.04em;">ZooGent</span>
              <span class="font-display" style="font-size: 11px; color: var(--text-muted); font-weight: 700; background: var(--bg-inset); padding: 3px 8px; border-radius: 6px;">v0.3</span>
            </a>
            <nav class="desktop-nav" style="display: flex; gap: 4px;">
              <a href="/teams" class={`nav-link ${currentPath === '/teams' ? 'active' : ''}`}>Teams</a>
              <a href="/members" class={`nav-link ${currentPath === '/members' ? 'active' : ''}`}>Members</a>
              <a href="/settings" class={`nav-link ${currentPath === '/settings' ? 'active' : ''}`}>Settings</a>
            </nav>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <button onclick="toggleTheme()" style="background: none; border: 1px solid var(--border); border-radius: 10px; cursor: pointer; font-size: 16px; padding: 8px 12px; color: var(--text-secondary); transition: all 0.2s;" title="Toggle theme">
              <span id="theme-icon">&#9790;</span>
            </button>
            <a href="/logout" class="btn desktop-nav" style="font-size: 13px; padding: 8px 16px;">Sign Out</a>
            <button class="mobile-burger" onclick="toggleMobileMenu()" style="display: none; background: none; border: 1px solid var(--border); border-radius: 10px; cursor: pointer; font-size: 18px; padding: 8px 12px; color: var(--text-secondary);">
              &#9776;
            </button>
          </div>
        </div>
        <div id="mobile-menu" style="display: none; flex-direction: column; padding: 8px 32px 16px; gap: 4px; border-top: 1px solid var(--border); background: var(--bg-page);">
          <a href="/teams" class={`nav-link ${currentPath === '/teams' ? 'active' : ''}`}>Teams</a>
          <a href="/members" class={`nav-link ${currentPath === '/members' ? 'active' : ''}`}>Members</a>
          <a href="/settings" class={`nav-link ${currentPath === '/settings' ? 'active' : ''}`}>Settings</a>
          <a href="/logout" class="nav-link" style="color: var(--text-muted);">Sign Out</a>
        </div>
      </header>
      {teamSlug && (
        <div style="border-bottom: 1px solid var(--border); background: var(--bg-secondary); position: sticky; top: 64px; z-index: 99;">
          <div style="max-width: 1320px; margin: 0 auto; padding: 0 32px;">
            <div class="team-nav-header" style="display: none; align-items: center; justify-content: space-between; height: 44px;">
              <a href={teamBase} style="text-decoration: none;">
                <span class="font-display" style="font-size: 15px; font-weight: 700; color: var(--text-primary);">{teamName || teamSlug}</span>
              </a>
              <button class="team-nav-toggle" onclick="toggleTeamNav()" style="background: none; border: none; cursor: pointer; font-size: 12px; color: var(--text-muted); padding: 4px 8px;">
                &#9662; Menu
              </button>
            </div>
            <div id="team-nav-items" style="display: flex; align-items: center; gap: 4px; height: 44px; overflow-x: auto;">
              <a href={teamBase} class="desktop-team-name" style="text-decoration: none; margin-right: 16px;">
                <span class="font-display" style="font-size: 15px; font-weight: 700; color: var(--text-primary);">{teamName || teamSlug}</span>
              </a>
              <a href={`${teamBase}/chat`} class={`nav-link ${currentPath?.endsWith('/chat') ? 'active' : ''}`} style="font-size: 13px; font-weight: 700;">Architect</a>
              <a href={teamBase} class={`nav-link ${currentPath === teamBase ? 'active' : ''}`} style="font-size: 13px;">Agents</a>
              <a href={`${teamBase}/tasks`} class={`nav-link ${currentPath?.endsWith('/tasks') ? 'active' : ''}`} style="font-size: 13px;">Tasks</a>
              <a href={`${teamBase}/costs`} class={`nav-link ${currentPath?.endsWith('/costs') ? 'active' : ''}`} style="font-size: 13px;">Costs</a>
              <a href={`${teamBase}/skills`} class={`nav-link ${currentPath?.endsWith('/skills') ? 'active' : ''}`} style="font-size: 13px;">Skills</a>
              <a href={`${teamBase}/memory`} class={`nav-link ${currentPath?.endsWith('/memory') ? 'active' : ''}`} style="font-size: 13px;">Memory</a>
              <a href={`${teamBase}/knowledge`} class={`nav-link ${currentPath?.endsWith('/knowledge') ? 'active' : ''}`} style="font-size: 13px;">Knowledge</a>
              <a href={`${teamBase}/settings`} class={`nav-link ${currentPath?.endsWith('/settings') && currentPath !== '/settings' ? 'active' : ''}`} style="font-size: 13px;">Settings</a>
            </div>
          </div>
        </div>
      )}
      <main style="max-width: 1320px; margin: 0 auto; padding: 36px 32px;">
        {children}
      </main>
    </body>
    </html>
  );
};
