import type { FC } from 'hono/jsx';
import { html } from 'hono/html';
import { Layout } from './layout.js';
import { EmptyState } from './components/empty-state.js';
import { timeAgo, formatRunTimestamp } from '../lib/time.js';

interface TasksPageProps {
  tasks: {
    id: number;
    teamLocalId: number;
    title: string;
    status: string;
    agentId: string;
    agentName: string | null;
    createdByAgentId: string | null;
    createdByAgentName: string | null;
    payload: string | null;
    result: string | null;
    consensus: boolean;
    createdAt: Date | null;
    completedAt: Date | null;
  }[];
  agents: { id: string; name: string }[];
  filterAgent?: string;
  filterStatus?: string;
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  teamBase: string;
  teamSlug?: string;
  teamName?: string;
}

function formatPayload(raw: string | null): { display: string; isJson: boolean } {
  if (raw == null || raw === '') return { display: '', isJson: false };
  try {
    return { display: JSON.stringify(JSON.parse(raw), null, 2), isJson: true };
  } catch {
    return { display: raw, isJson: false };
  }
}

function pageHref(teamBase: string, page: number, filterAgent?: string, filterStatus?: string): string {
  const params = new URLSearchParams();
  if (filterAgent) params.set('agent', filterAgent);
  if (filterStatus) params.set('status', filterStatus);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return `${teamBase}/tasks${qs ? `?${qs}` : ''}`;
}

export const TasksPage: FC<TasksPageProps> = ({
  tasks, agents, filterAgent, filterStatus,
  page, totalPages, totalCount, pageSize,
  teamBase, teamSlug, teamName,
}) => {
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalCount);

  return (
    <Layout title="Tasks" currentPath="/tasks" teamSlug={teamSlug} teamName={teamName}>
      <div class="animate-in" style="display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 24px;">
        <div>
          <h1 class="font-display" style="font-size: 32px; font-weight: 800; margin: 0; letter-spacing: -0.03em;">Tasks</h1>
          <p class="page-subtitle">
            {totalCount === 0
              ? 'no tasks yet'
              : `${totalCount} total · showing ${rangeStart}–${rangeEnd}`}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div class="card card-body animate-in delay-1" style="margin-bottom: 24px;">
        <form method="get" action={`${teamBase}/tasks`}>
          <div class="grid-2" style="align-items: end;">
            <div class="form-group" style="margin-bottom: 0;">
              <label>Agent</label>
              <select name="agent">
                <option value="">All agents</option>
                {agents.map(a => (
                  <option value={a.id} selected={a.id === filterAgent}>{a.name}</option>
                ))}
              </select>
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label>Status</label>
              <select name="status">
                <option value="">All statuses</option>
                <option value="pending" selected={filterStatus === 'pending'}>Pending</option>
                <option value="in_progress" selected={filterStatus === 'in_progress'}>In Progress</option>
                <option value="done" selected={filterStatus === 'done'}>Done</option>
                <option value="failed" selected={filterStatus === 'failed'}>Failed</option>
              </select>
            </div>
            <button type="submit" class="btn btn-primary">Filter</button>
            {(filterAgent || filterStatus) && (
              <a href={`${teamBase}/tasks`} class="btn">Clear</a>
            )}
          </div>
        </form>
      </div>

      {/* Tasks table */}
      {tasks.length === 0 ? (
        <div class="animate-in delay-2">
          <EmptyState title="No tasks found">
            Tasks are created when agents communicate with each other.
          </EmptyState>
        </div>
      ) : (
        <div class="card animate-in delay-2" style="overflow: hidden;">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>ID</th>
                <th>Title</th>
                <th>Assigned To</th>
                <th>Created By</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(task => {
                const bc = task.status === 'done' ? 'badge-success'
                  : task.status === 'in_progress' ? 'badge-accent'
                  : task.status === 'failed' ? 'badge-error'
                  : 'badge-idle';
                const payload = formatPayload(task.payload);
                const result = formatPayload(task.result);
                return (
                  <>
                    <tr class="task-row" data-task-id={task.id} style="cursor: pointer;">
                      <td style="width: 28px; padding-right: 0; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; font-size: 13px;">
                        <span class="task-toggle-arrow" data-task-id={task.id}>▸</span>
                      </td>
                      <td class="font-mono" style="font-size: 14px; color: var(--text-muted);" title={`global id #${task.id}`}>#{task.teamLocalId}</td>
                      <td style="font-weight: 600; color: var(--text-primary);">
                        {task.title}
                        {task.consensus && <span class="badge badge-accent" style="margin-left: 8px; font-size: 11px; padding: 2px 6px;">consensus</span>}
                      </td>
                      <td>
                        <a href={`${teamBase}/agents/${task.agentId}`} class="task-link" style="text-decoration: none; font-weight: 600;">
                          {task.agentName || task.agentId}
                        </a>
                      </td>
                      <td style="color: var(--text-secondary);">
                        {task.createdByAgentId ? (
                          <a href={`${teamBase}/agents/${task.createdByAgentId}`} class="task-link" style="text-decoration: none;">
                            {task.createdByAgentName || task.createdByAgentId}
                          </a>
                        ) : '—'}
                      </td>
                      <td><span class={`badge ${bc}`}>{task.status.replace('_', ' ')}</span></td>
                      <td style="color: var(--text-muted);">
                        {task.createdAt ? timeAgo(new Date(task.createdAt)) : '—'}
                      </td>
                    </tr>
                    <tr id={`task-detail-${task.id}`} class="task-detail" style="display: none;">
                      <td colspan={7} style="padding: 0; background: var(--bg-inset);">
                        <div style="padding: 20px 24px; display: flex; flex-direction: column; gap: 16px;">
                          <div style="display: flex; gap: 24px; flex-wrap: wrap; font-size: 13px;">
                            <div>
                              <div class="stat-label" style="margin-bottom: 4px;">Created</div>
                              <div class="font-mono" style="color: var(--text-secondary);">
                                {task.createdAt ? formatRunTimestamp(new Date(task.createdAt)) : '—'}
                              </div>
                            </div>
                            <div>
                              <div class="stat-label" style="margin-bottom: 4px;">Completed</div>
                              <div class="font-mono" style="color: var(--text-secondary);">
                                {task.completedAt ? formatRunTimestamp(new Date(task.completedAt)) : '—'}
                              </div>
                            </div>
                            <div>
                              <div class="stat-label" style="margin-bottom: 4px;">Status</div>
                              <span class={`badge ${bc}`}>{task.status.replace('_', ' ')}</span>
                            </div>
                            {task.consensus && (
                              <div>
                                <div class="stat-label" style="margin-bottom: 4px;">Consensus</div>
                                <span class="badge badge-accent">required</span>
                              </div>
                            )}
                          </div>

                          <div>
                            <div class="stat-label" style="margin-bottom: 6px;">Payload</div>
                            {payload.display ? (
                              <pre class="font-mono" style="font-size: 13px; background: var(--bg-elevated); padding: 12px; border-radius: 8px; overflow: auto; max-height: 360px; white-space: pre-wrap; color: var(--text-primary); margin: 0;">{payload.display}</pre>
                            ) : (
                              <div style="font-size: 13px; color: var(--text-muted);">No payload</div>
                            )}
                          </div>

                          <div>
                            <div class="stat-label" style="margin-bottom: 6px;">Result</div>
                            {result.display ? (
                              <pre class="font-mono" style="font-size: 13px; background: var(--bg-elevated); padding: 12px; border-radius: 8px; overflow: auto; max-height: 360px; white-space: pre-wrap; color: var(--text-primary); margin: 0;">{result.display}</pre>
                            ) : (
                              <div style="font-size: 13px; color: var(--text-muted);">No result yet</div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div class="animate-in delay-2" style="display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 20px;">
          {page > 1 ? (
            <a href={pageHref(teamBase, page - 1, filterAgent, filterStatus)} class="btn">‹ Prev</a>
          ) : (
            <span class="btn" style="opacity: 0.4; pointer-events: none;">‹ Prev</span>
          )}
          <span style="font-size: 14px; color: var(--text-muted); font-weight: 600;">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <a href={pageHref(teamBase, page + 1, filterAgent, filterStatus)} class="btn">Next ›</a>
          ) : (
            <span class="btn" style="opacity: 0.4; pointer-events: none;">Next ›</span>
          )}
        </div>
      )}

      {html`
      <script>
      (function() {
        document.addEventListener('click', function(e) {
          // Don't toggle when the click started on an inner link.
          if (e.target.closest('a.task-link')) return;
          var row = e.target.closest('tr.task-row');
          if (!row) return;
          var id = row.getAttribute('data-task-id');
          var detail = document.getElementById('task-detail-' + id);
          if (!detail) return;
          var arrow = row.querySelector('.task-toggle-arrow');
          var open = detail.style.display !== 'none';
          if (open) {
            detail.style.display = 'none';
            if (arrow) arrow.textContent = '▸'; // ▸
          } else {
            detail.style.display = 'table-row';
            if (arrow) arrow.textContent = '▾'; // ▾
          }
        });
      })();
      </script>
      `}
    </Layout>
  );
};
