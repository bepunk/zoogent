import type { FC } from 'hono/jsx';
import { html } from 'hono/html';
import { Layout } from './layout.js';
import { EmptyState } from './components/empty-state.js';
import { timeAgo } from '../lib/time.js';

interface TasksPageProps {
  tasks: {
    id: number;
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
  teamBase: string;
  teamSlug?: string;
  teamName?: string;
}

export const TasksPage: FC<TasksPageProps> = ({ tasks, agents, filterAgent, filterStatus, teamBase, teamSlug, teamName }) => {
  const statusCounts = {
    all: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
    failed: tasks.filter(t => t.status === 'failed').length,
  };

  return (
    <Layout title="Tasks" currentPath="/tasks" teamSlug={teamSlug} teamName={teamName}>
      <div class="animate-in" style="display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 24px;">
        <div>
          <h1 class="font-display" style="font-size: 32px; font-weight: 800; margin: 0; letter-spacing: -0.03em;">Tasks</h1>
          <p class="page-subtitle">
            {statusCounts.pending} pending &middot; {statusCounts.in_progress} in progress &middot; {statusCounts.done} done
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
                return (
                  <tr style="cursor: pointer;" onclick={`document.getElementById('task-${task.id}').style.display = document.getElementById('task-${task.id}').style.display === 'none' ? 'table-row' : 'none'`}>
                    <td class="font-mono" style="font-size: 14px; color: var(--text-muted);">#{task.id}</td>
                    <td style="font-weight: 600; color: var(--text-primary);">
                      {task.title}
                      {task.consensus && <span class="badge badge-accent" style="margin-left: 8px; font-size: 11px; padding: 2px 6px;">consensus</span>}
                    </td>
                    <td>
                      <a href={`${teamBase}/agents/${task.agentId}`} style="text-decoration: none; font-weight: 600;">
                        {task.agentName || task.agentId}
                      </a>
                    </td>
                    <td style="color: var(--text-secondary);">
                      {task.createdByAgentId ? (
                        <a href={`${teamBase}/agents/${task.createdByAgentId}`} style="text-decoration: none;">
                          {task.createdByAgentName || task.createdByAgentId}
                        </a>
                      ) : '—'}
                    </td>
                    <td><span class={`badge ${bc}`}>{task.status.replace('_', ' ')}</span></td>
                    <td style="color: var(--text-muted);">
                      {task.createdAt ? timeAgo(new Date(task.createdAt)) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {html`
      <script>
        // Toggle task detail rows — handled via inline onclick above
      </script>
      `}
    </Layout>
  );
};
