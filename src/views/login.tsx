import type { FC } from 'hono/jsx';
import { html } from 'hono/html';

export const LoginPage: FC = () => {
  return (
    <html lang="en" data-theme="light">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Sign In — ZooGent</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Manrope:wght@400;500;600&display=swap" rel="stylesheet" />
      <link rel="stylesheet" href="/static/styles.css" />
    </head>
    <body class="login-body">
      <div class="login-card">
        <div class="login-logo">ZooGent</div>
        <div class="login-subtitle">AI Agent Orchestrator</div>

        <form id="signin-form" style="margin-top: 36px;">
          <div class="form-group">
            <label>Email</label>
            <input type="email" name="email" placeholder="you@example.com" required autocomplete="email" />
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" name="password" placeholder="Your password" required autocomplete="current-password" />
          </div>
          <button type="submit" class="submit-btn">Sign In</button>
        </form>

        <div class="error-msg" id="error-msg"></div>
      </div>

      {html`
      <script>
        (function() {
          var saved = localStorage.getItem('zoogent-theme') || 'light';
          document.documentElement.setAttribute('data-theme', saved);
          var form = document.getElementById('signin-form');
          var errorMsg = document.getElementById('error-msg');
          form.addEventListener('submit', function(e) {
            e.preventDefault();
            errorMsg.textContent = '';
            var btn = form.querySelector('.submit-btn');
            btn.disabled = true; btn.textContent = 'Signing in...';
            var data = {};
            new FormData(form).forEach(function(v, k) { data[k] = v; });
            fetch('/api/auth/sign-in/email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data), credentials: 'include'
            }).then(function(res) {
              if (res.ok) { window.location.href = '/teams'; }
              else { return res.json().then(function(d) {
                errorMsg.textContent = d.message || 'Invalid email or password';
                btn.disabled = false; btn.textContent = 'Sign In';
              }); }
            }).catch(function() {
              errorMsg.textContent = 'Network error';
              btn.disabled = false; btn.textContent = 'Sign In';
            });
          });
        })();
      </script>
      `}
    </body>
    </html>
  );
};
