import type { FC } from 'hono/jsx';
import { Layout } from './layout.js';

interface Team {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  agentCount: number;
}

interface TeamsPageProps {
  teams: Team[];
}

export const TeamsPage: FC<TeamsPageProps> = ({ teams }) => {
  return (
    <Layout title="Teams" currentPath="/teams">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px;">
        <div>
          <h1 class="font-display" style="font-size: 28px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.03em; margin: 0;">Teams</h1>
          <p class="page-subtitle" style="font-size: 14px;">
            {teams.length} team{teams.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {teams.length === 0 ? (
        <div style="text-align: center; padding: 80px 20px;">
          <p style="font-size: 18px; margin-bottom: 12px; color: var(--text-secondary);">Create a team, then use the Architect to design and configure your agents.</p>
          <form action="/teams/create" method="post" style="display: inline-flex; align-items: center; gap: 12px; margin-top: 16px;">
            <input type="text" name="name" placeholder="Team name" required
              class="input" style="width: 240px;" />
            <button type="submit" class="btn btn-primary" style="padding: 10px 20px; font-size: 14px;">Create Team</button>
          </form>
        </div>
      ) : (
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px;">
          {teams.map(team => (
            <a href={`/teams/${team.slug}`} style="text-decoration: none;">
              <div class="card card-body" style="cursor: pointer; transition: all 0.2s;">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                  <div style="width: 40px; height: 40px; border-radius: 12px; background: var(--accent); display: flex; align-items: center; justify-content: center;">
                    <span style="font-size: 18px; color: white; font-weight: 700;">{team.name[0]}</span>
                  </div>
                  <div>
                    <h3 class="font-display" style="font-size: 18px; font-weight: 700; color: var(--text-primary); margin: 0; letter-spacing: -0.02em;">{team.name}</h3>
                    <span style="font-size: 12px; color: var(--text-muted); font-family: 'JetBrains Mono', monospace;">/{team.slug}</span>
                  </div>
                </div>
                {team.description && (
                  <p style="color: var(--text-secondary); font-size: 14px; margin: 0 0 12px 0; line-height: 1.4;">{team.description}</p>
                )}
                <div style="display: flex; gap: 16px; font-size: 13px; color: var(--text-muted);">
                  <span>{team.agentCount} agent{team.agentCount !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </Layout>
  );
};
