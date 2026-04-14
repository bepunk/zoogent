import type { FC } from 'hono/jsx';
import { html } from 'hono/html';
import { Layout } from './layout.js';
import { timeAgo } from '../lib/time.js';

interface MembersPageProps {
  members: {
    id: string;
    name: string;
    email: string;
    isOwner: boolean;
    createdAt: Date;
  }[];
  isOwner: boolean;
}

export const MembersPage: FC<MembersPageProps> = ({ members, isOwner }) => {
  return (
    <Layout title="Members" currentPath="/members">
      <div class="animate-in" style="display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 32px;">
        <div>
          <h1 class="font-display" style="font-size: 32px; font-weight: 800; margin: 0; letter-spacing: -0.03em;">Members</h1>
          <p class="page-subtitle">
            {members.length} {members.length === 1 ? 'member' : 'members'}
          </p>
        </div>
      </div>

      {/* Members list */}
      <div class="card animate-in delay-1" style="overflow: hidden; margin-bottom: 32px;">
        <table>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr>
                <td style="font-weight: 600; color: var(--text-primary);">{m.name}</td>
                <td>{m.email}</td>
                <td><span class={`badge ${m.isOwner ? 'badge-accent' : 'badge-idle'}`}>{m.isOwner ? 'Owner' : 'Member'}</span></td>
                <td style="color: var(--text-muted);">{timeAgo(m.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add member form — owner only */}
      {isOwner && (
        <div class="animate-in delay-2">
          <h2 class="section-title" style="margin-bottom: 16px;">Add Member</h2>
          <div class="card" style="padding: 28px;">
            <form id="add-member-form">
              <div class="grid-3" style="margin-bottom: 20px;">
                <div class="form-group" style="margin-bottom: 0;">
                  <label>Name</label>
                  <input type="text" name="name" placeholder="John Doe" required />
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                  <label>Email</label>
                  <input type="email" name="email" placeholder="john@example.com" required />
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                  <label>Password</label>
                  <input type="password" name="password" placeholder="Min 8 characters" required />
                </div>
              </div>
              <button type="submit" class="btn btn-primary">Add Member</button>
            </form>
            <div id="member-msg" style="margin-top: 14px; font-size: 14px; font-weight: 600; min-height: 20px;"></div>
          </div>
        </div>
      )}

      {html`
      <script>
        (function() {
          var form = document.getElementById('add-member-form');
          if (!form) return;
          var msg = document.getElementById('member-msg');
          form.addEventListener('submit', function(e) {
            e.preventDefault();
            msg.textContent = '';
            msg.style.color = 'var(--text-muted)';
            var btn = form.querySelector('.btn-primary');
            btn.disabled = true; btn.textContent = 'Adding...';
            var data = {};
            new FormData(form).forEach(function(v, k) { data[k] = v; });
            if (data.password.length < 8) {
              msg.textContent = 'Password must be at least 8 characters';
              msg.style.color = 'var(--error)';
              btn.disabled = false; btn.textContent = 'Add Member';
              return;
            }
            fetch('/api/members', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data), credentials: 'include'
            }).then(function(res) {
              return res.json().then(function(d) {
                if (res.ok) {
                  msg.textContent = 'Member added successfully';
                  msg.style.color = 'var(--success)';
                  form.reset();
                  setTimeout(function() { window.location.reload(); }, 1000);
                } else {
                  msg.textContent = d.error || 'Something went wrong';
                  msg.style.color = 'var(--error)';
                }
                btn.disabled = false; btn.textContent = 'Add Member';
              });
            }).catch(function() {
              msg.textContent = 'Network error';
              msg.style.color = 'var(--error)';
              btn.disabled = false; btn.textContent = 'Add Member';
            });
          });
        })();
      </script>
      `}
    </Layout>
  );
};
