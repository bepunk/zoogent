import type { FC } from 'hono/jsx';
import { html } from 'hono/html';
import { Layout } from './layout.js';
import { EmptyState } from './components/empty-state.js';
import { timeAgo } from '../lib/time.js';

interface TeamKnowledgeProps {
  entries: {
    id: number;
    title: string;
    content: string;
    status: string;
    proposedByAgentId: string | null;
    proposedByAgentName: string | null;
    approvedAt: Date | null;
    createdAt: Date;
  }[];
  draftsCount: number;
  activeCount: number;
  autoApprove: boolean;
  teamBase: string;
  teamSlug?: string;
  teamName?: string;
}

export const TeamKnowledgePage: FC<TeamKnowledgeProps> = ({ entries, draftsCount, activeCount, autoApprove, teamBase, teamSlug, teamName }) => {
  return (
    <Layout title="Team Knowledge" currentPath="/knowledge" teamSlug={teamSlug} teamName={teamName}>
      <div class="animate-in" style="display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 32px;">
        <div>
          <h1 class="font-display" style="font-size: 32px; font-weight: 800; margin: 0; letter-spacing: -0.03em;">Team Knowledge</h1>
          <p class="page-subtitle">
            {activeCount} active &middot; {draftsCount} pending review
            {autoApprove && <span style="margin-left: 8px;" class="badge badge-accent">Auto-approve ON</span>}
          </p>
        </div>
      </div>

      {/* Drafts needing review */}
      {draftsCount > 0 && (
        <div class="animate-in delay-1" style="margin-bottom: 32px;">
          <h2 class="section-title" style="margin-bottom: 16px;">Pending Review ({draftsCount})</h2>
          <div style="display: flex; flex-direction: column; gap: 10px;">
            {entries.filter(e => e.status === 'draft').map(entry => (
              <div class="card" style="padding: 20px 24px; border-left: 4px solid var(--warning);">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="font-display" style="font-size: 17px; font-weight: 700;">{entry.title}</span>
                    <span class="badge badge-warning">Draft</span>
                  </div>
                  <div style="display: flex; gap: 8px;">
                    <form method="post" action={`${teamBase}/knowledge/${entry.id}/approve`} style="display: inline;">
                      <button type="submit" class="btn btn-primary" style="padding: 6px 16px; height: auto; font-size: 13px;">Approve</button>
                    </form>
                    <form method="post" action={`${teamBase}/knowledge/${entry.id}/archive`} style="display: inline;">
                      <button type="submit" class="btn" style="padding: 6px 16px; height: auto; font-size: 13px;">Reject</button>
                    </form>
                  </div>
                </div>
                <p style="font-size: 15px; margin: 0; line-height: 1.7; color: var(--text-primary); white-space: pre-wrap;">{entry.content}</p>
                <div style="display: flex; gap: 16px; margin-top: 10px; font-size: 13px; color: var(--text-muted);">
                  {entry.proposedByAgentId && (
                    <span>Proposed by <a href={`${teamBase}/agents/${entry.proposedByAgentId}`} style="font-weight: 600;">{entry.proposedByAgentName || entry.proposedByAgentId}</a></span>
                  )}
                  <span>{timeAgo(entry.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active knowledge */}
      <div class="animate-in delay-2">
        <h2 class="section-title" style="margin-bottom: 16px;">Active Knowledge ({activeCount})</h2>
        {activeCount === 0 ? (
          <EmptyState title="No team knowledge yet">
            Agents propose knowledge via <code class="font-mono" style="background: var(--bg-inset); padding: 3px 8px; border-radius: 6px; font-size: 14px;">reportTeamKnowledge()</code>. Active entries are shared with all agents at startup.
          </EmptyState>
        ) : (
          <div style="display: flex; flex-direction: column; gap: 10px;">
            {entries.filter(e => e.status === 'active').map(entry => (
              <div class="card" style="padding: 20px 24px; border-left: 4px solid var(--success);">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="font-display" style="font-size: 17px; font-weight: 700;">{entry.title}</span>
                    <span class="badge badge-success">Active</span>
                  </div>
                  <form method="post" action={`${teamBase}/knowledge/${entry.id}/archive`} style="display: inline;">
                    <button type="submit" class="btn" style="padding: 6px 16px; height: auto; font-size: 13px;">Archive</button>
                  </form>
                </div>
                <p style="font-size: 15px; margin: 0; line-height: 1.7; color: var(--text-primary); white-space: pre-wrap;">{entry.content}</p>
                <div style="display: flex; gap: 16px; margin-top: 10px; font-size: 13px; color: var(--text-muted);">
                  {entry.proposedByAgentId && (
                    <span>From <a href={`${teamBase}/agents/${entry.proposedByAgentId}`} style="font-weight: 600;">{entry.proposedByAgentName || entry.proposedByAgentId}</a></span>
                  )}
                  {entry.approvedAt && <span>Approved {timeAgo(entry.approvedAt)}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};
