import type { FC } from 'hono/jsx';
import { html } from 'hono/html';

export const SetupPage: FC = () => {
  return (
    <html lang="en" data-theme="light">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Setup — ZooGent</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Manrope:wght@400;500;600&display=swap" rel="stylesheet" />
      <link rel="stylesheet" href="/static/styles.css" />
    </head>
    <body class="login-body">
      <div class="login-card">
        <div class="login-logo">ZooGent</div>
        <div class="login-subtitle" style="margin-top: 8px;">Welcome! Create your owner account.</div>

        <div style="margin-top: 36px;">
          <form id="setup-form">
            <div class="form-group">
              <label>Name</label>
              <input type="text" name="name" placeholder="Your name" required />
            </div>
            <div class="form-group">
              <label>Email</label>
              <input type="email" name="email" placeholder="you@example.com" required autocomplete="email" />
            </div>
            <div class="form-group">
              <label>Password</label>
              <input type="password" name="password" placeholder="Min 8 characters" required autocomplete="new-password" />
            </div>
            <button type="submit" class="submit-btn">Create Owner Account</button>
          </form>
          <div class="error-msg" id="error-msg"></div>
        </div>
      </div>

      {html`
      <script>
        (function() {
          var saved = localStorage.getItem('zoogent-theme') || 'light';
          document.documentElement.setAttribute('data-theme', saved);
          var form = document.getElementById('setup-form');
          var errorMsg = document.getElementById('error-msg');
          form.addEventListener('submit', function(e) {
            e.preventDefault();
            errorMsg.textContent = '';
            var btn = form.querySelector('.submit-btn');
            btn.disabled = true; btn.textContent = 'Creating account...';
            var data = {};
            new FormData(form).forEach(function(v, k) { data[k] = v; });
            if (data.password.length < 8) {
              errorMsg.textContent = 'Password must be at least 8 characters';
              btn.disabled = false; btn.textContent = 'Create Owner Account';
              return;
            }
            fetch('/api/auth/sign-up/email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data), credentials: 'include'
            }).then(function(res) {
              if (res.ok) { window.location.href = '/teams'; }
              else { return res.json().then(function(d) {
                errorMsg.textContent = d.message || 'Something went wrong';
                btn.disabled = false; btn.textContent = 'Create Owner Account';
              }); }
            }).catch(function() {
              errorMsg.textContent = 'Network error';
              btn.disabled = false; btn.textContent = 'Create Owner Account';
            });
          });
        })();
      </script>
      `}
    </body>
    </html>
  );
};
