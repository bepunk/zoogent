import type { FC } from 'hono/jsx';
import { Layout } from './layout.js';
import { EmptyState } from './components/empty-state.js';
import { timeAgo } from '../lib/time.js';

interface MemoryBrowserProps {
  memories: any[];
  searchQuery?: string;
  agentFilter?: string;
  agents: { id: string; name: string }[];
  teamBase: string;
  teamSlug?: string;
  teamName?: string;
}

export const MemoryBrowserPage: FC<MemoryBrowserProps> = ({ memories, searchQuery, agentFilter, agents, teamBase, teamSlug, teamName }) => {
  return (
    <Layout title="Memory" currentPath="/memory" teamSlug={teamSlug} teamName={teamName}>
      <div class="animate-in" style="margin-bottom: 32px;">
        <h1 class="font-display" style="font-size: 32px; font-weight: 800; margin: 0; letter-spacing: -0.03em;">Agent Memory</h1>
      </div>

      {/* Search */}
      <div class="card card-body animate-in delay-1" style="margin-bottom: 28px;">
        <form method="get" action={`${teamBase}/memory`} style="display: flex; gap: 14px; align-items: flex-end;">
          <div style="flex: 1;">
            <label style="font-size: 13px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 8px; font-family: 'Plus Jakarta Sans', sans-serif; text-transform: uppercase; letter-spacing: 0.04em;">Search (FTS5)</label>
            <input type="text" name="search" value={searchQuery || ''} placeholder="Search memories..." />
          </div>
          <div style="width: 220px;">
            <label style="font-size: 13px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 8px; font-family: 'Plus Jakarta Sans', sans-serif; text-transform: uppercase; letter-spacing: 0.04em;">Agent</label>
            <select name="agentId">
              <option value="">All agents</option>
              {agents.map(a => (
                <option value={a.id} selected={a.id === agentFilter}>{a.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" class="btn btn-primary" style="height: 46px;">Search</button>
        </form>
      </div>

      {/* Results */}
      {memories.length === 0 ? (
        <div class="animate-in delay-2">
          <EmptyState title={searchQuery ? 'No results' : 'No memories yet'}>
            {searchQuery
              ? 'Try a different search query'
              : 'Memories are created by agents (auto), human feedback, or manually via MCP'}
          </EmptyState>
        </div>
      ) : (
        <div style="display: flex; flex-direction: column; gap: 10px;">
          {memories.map((m: any, i: number) => (
            <div class={`card animate-in delay-${Math.min(i + 2, 4)}`} style="padding: 20px 24px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <a href={`${teamBase}/agents/${m.agentId ?? m.agent_id}`} class="font-display" style="font-size: 14px; font-weight: 700; color: var(--accent); text-decoration: none;">
                    {m.agentId ?? m.agent_id}
                  </a>
                  <span class={`badge ${m.source === 'feedback' ? 'badge-success' : m.source === 'auto' ? 'badge-accent' : 'badge-idle'}`}>
                    {m.source}
                  </span>
                </div>
                <div style="display: flex; align-items: center; gap: 16px;">
                  <span style="font-size: 13px; color: var(--text-muted); font-weight: 600;">
                    imp: {m.importance}/10
                  </span>
                  <span style="font-size: 13px; color: var(--text-muted);">
                    {m.createdAt ? timeAgo(new Date(typeof m.createdAt === 'number' ? m.createdAt : m.createdAt)) : m.created_at ? timeAgo(new Date(m.created_at)) : ''}
                  </span>
                </div>
              </div>
              <p style="font-size: 16px; margin: 0; line-height: 1.6; color: var(--text-primary);">{m.content}</p>
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
    </Layout>
  );
};
