import type { FC } from 'hono/jsx';
import { html } from 'hono/html';
import { Layout } from './layout.js';

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: string | null;
  createdAt: Date;
}

interface ChatPageProps {
  messages: ChatMessage[];
  hasApiKey: boolean;
  teamBase: string;
  teamId: string;
  teamSlug?: string;
  teamName?: string;
}

export const ChatPage: FC<ChatPageProps> = ({ messages, hasApiKey, teamBase, teamId, teamSlug, teamName }) => {
  return (
    <Layout title="Architect" currentPath="/chat" teamSlug={teamSlug} teamName={teamName}>
      <div id="chat-container" style="display: flex; flex-direction: column; min-height: calc(100vh - 230px);">

        {!hasApiKey && (
          <div class="animate-in" style="padding: 18px 24px; margin-bottom: 20px; border-radius: 12px; background: var(--error-soft); border: 1px solid rgba(239,68,68,0.15);">
            <p style="margin: 0; font-size: 15px; color: var(--error);">
              API key not configured. <a href={`${teamBase}/settings`} style="color: var(--accent); font-weight: 600;">Go to Team Settings</a> to add your Anthropic API key.
            </p>
          </div>
        )}

        {/* Messages */}
        <div id="messages" style="flex: 1; padding: 24px 0; display: flex; flex-direction: column; gap: 12px;">
          {messages.length === 0 ? (
            <div class="chat-empty animate-in">
              <div class="chat-empty-icon">Z</div>
              <h2 class="font-display" style="font-size: 26px; font-weight: 800; color: var(--text-primary); margin: 0 0 8px;">ZooGent Architect</h2>
              <p style="color: var(--text-muted); font-size: 17px; line-height: 1.6; margin: 0;">Describe what you want to automate.<br/>I'll design the team, write skills, and generate code.</p>
            </div>
          ) : (
            messages.map(msg => (
              <div class={`chat-bubble-row chat-bubble-row-${msg.role}`}>
                {msg.role === 'assistant' && <div class="chat-avatar chat-avatar-assistant">Arch</div>}
                <div class={`chat-bubble chat-bubble-${msg.role}`}>
                  <div class="chat-bubble-text" dangerouslySetInnerHTML={{ __html: escapeHtml(msg.content) }} />
                  {msg.toolCalls && renderToolCalls(msg.toolCalls)}
                </div>
                {msg.role === 'user' && <div class="chat-avatar chat-avatar-user">User</div>}
              </div>
            ))
          )}
          <div id="thinking-indicator" class="chat-thinking">
            <div class="chat-avatar chat-avatar-assistant">Arch</div>
            <div class="chat-thinking-dots"><span></span><span></span><span></span></div>
          </div>
          <div id="streaming-row" style="display: none;" class="chat-bubble-row chat-bubble-row-assistant">
            <div class="chat-avatar chat-avatar-assistant">Arch</div>
            <div class="chat-bubble chat-bubble-assistant">
              <div id="streaming-content" class="chat-bubble-text"></div>
              <div id="streaming-tools"></div>
            </div>
          </div>
        </div>

        {/* Input */}
        <div class="chat-input-wrap">
          <form id="chat-form" class="chat-input-bar">
            <textarea
              id="chat-input"
              placeholder={hasApiKey ? 'Message Architect...' : 'Add API key in Settings first'}
              disabled={!hasApiKey}
              rows={1}
            />
            <button type="submit" id="send-btn" disabled={!hasApiKey} class="chat-send-btn" aria-label="Send">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
          </form>
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 8px 0;">
            <span id="chat-status" style="font-size: 13px; color: var(--text-muted);"></span>
            {messages.length > 0 && (
              <button id="clear-btn" style="font-size: 13px; color: var(--text-muted); background: none; border: none; cursor: pointer; opacity: 0.7; transition: opacity 0.2s;">Clear</button>
            )}
          </div>
        </div>
      </div>

      {html`<script>
      (function() {
        var chatApiUrl = '/api/teams/${teamId}/chat';
        var chatHistoryUrl = '/api/teams/${teamId}/chat/history';
        var form = document.getElementById('chat-form');
        var input = document.getElementById('chat-input');
        var sendBtn = document.getElementById('send-btn');
        var messages = document.getElementById('messages');
        var streamingRow = document.getElementById('streaming-row');
        var streamingContent = document.getElementById('streaming-content');
        var streamingTools = document.getElementById('streaming-tools');
        var status = document.getElementById('chat-status');
        var thinking = document.getElementById('thinking-indicator');
        var clearBtn = document.getElementById('clear-btn');

        // Auto-resize textarea (max 5 lines ~130px)
        input.addEventListener('input', function() {
          this.style.height = '44px';
          var h = Math.min(this.scrollHeight, 130);
          this.style.height = h + 'px';
        });

        function scrollToBottom() {
          window.scrollTo(0, document.body.scrollHeight);
        }

        function escapeHtml(text) {
          var div = document.createElement('div');
          div.textContent = text;
          return div.innerHTML;
        }

        function addUserMessage(text) {
          var row = document.createElement('div');
          row.className = 'chat-bubble-row chat-bubble-row-user';
          row.innerHTML = '<div class="chat-bubble chat-bubble-user"><div class="chat-bubble-text">' + escapeHtml(text) + '</div></div>' +
            '<div class="chat-avatar chat-avatar-user">User</div>';
          messages.insertBefore(row, streamingRow);
          scrollToBottom();
        }

        function finalizeStreaming() {
          if (streamingContent.textContent.trim() || streamingTools.innerHTML.trim()) {
            var row = document.createElement('div');
            row.className = 'chat-bubble-row chat-bubble-row-assistant';
            row.innerHTML = '<div class="chat-avatar chat-avatar-assistant">Arch</div>' +
              '<div class="chat-bubble chat-bubble-assistant">' +
              '<div class="chat-bubble-text">' + streamingContent.innerHTML + '</div>' +
              streamingTools.innerHTML + '</div>';
            messages.insertBefore(row, streamingRow);
          }
          streamingRow.style.display = 'none';
          streamingContent.innerHTML = '';
          streamingTools.innerHTML = '';
        }

        form.addEventListener('submit', function(e) {
          e.preventDefault();
          var text = input.value.trim();
          if (!text) return;

          addUserMessage(text);
          input.value = '';
          input.style.height = '44px';
          input.disabled = true;
          sendBtn.disabled = true;
          status.textContent = 'Thinking...';

          streamingContent.innerHTML = '';
          streamingTools.innerHTML = '';
          thinking.classList.add('active');
          scrollToBottom();

          fetch(chatApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text }),
          }).then(function(response) {
            var reader = response.body.getReader();
            var decoder = new TextDecoder();
            var buffer = '';

            function read() {
              reader.read().then(function(result) {
                if (result.done) {
                  finalizeStreaming();
                  input.disabled = false;
                  sendBtn.disabled = false;
                  status.textContent = '';
                  input.focus();
                  return;
                }

                buffer += decoder.decode(result.value, { stream: true });
                var lines = buffer.split('\\n');
                buffer = lines.pop() || '';

                for (var i = 0; i < lines.length; i++) {
                  var line = lines[i];
                  if (line.startsWith('data: ')) {
                    try {
                      var event = JSON.parse(line.slice(6));

                      if (event.type === 'text') {
                        thinking.classList.remove('active');
                        streamingRow.style.display = '';
                        streamingContent.innerHTML += escapeHtml(event.content);
                        scrollToBottom();
                      } else if (event.type === 'tool_use') {
                        thinking.classList.remove('active');
                        streamingRow.style.display = '';
                        status.textContent = 'Using ' + event.toolName + '...';
                        var toolDiv = document.createElement('div');
                        toolDiv.className = 'chat-tool';
                        toolDiv.innerHTML = '<div class="chat-tool-header"><span class="chat-tool-icon">&#9889;</span> ' + escapeHtml(event.toolName) + '</div>' +
                          '<pre class="chat-tool-input">' + escapeHtml(JSON.stringify(event.toolInput, null, 2)) + '</pre>' +
                          '<div class="chat-tool-result"><span class="chat-tool-spinner"></span> Running...</div>';
                        streamingTools.appendChild(toolDiv);
                        scrollToBottom();
                      } else if (event.type === 'tool_result') {
                        var tools = streamingTools.querySelectorAll('.chat-tool');
                        if (tools.length > 0) {
                          var last = tools[tools.length - 1];
                          var resultDiv = last.querySelector('.chat-tool-result');
                          if (resultDiv) resultDiv.innerHTML = escapeHtml(event.content);
                        }
                        status.textContent = '';
                        scrollToBottom();
                      } else if (event.type === 'done') {
                        thinking.classList.remove('active');
                        finalizeStreaming();
                        input.disabled = false;
                        sendBtn.disabled = false;
                        status.textContent = '';
                        input.focus();
                      } else if (event.type === 'error') {
                        thinking.classList.remove('active');
                        finalizeStreaming();
                        var errRow = document.createElement('div');
                        errRow.className = 'chat-bubble-row chat-bubble-row-assistant';
                        errRow.innerHTML = '<div class="chat-bubble chat-bubble-error"><div class="chat-bubble-text">' + escapeHtml(event.content) + '</div></div>';
                        messages.insertBefore(errRow, streamingRow);
                        input.disabled = false;
                        sendBtn.disabled = false;
                        status.textContent = '';
                      }
                    } catch(e) {}
                  }
                }
                read();
              });
            }
            read();
          }).catch(function(err) {
            thinking.classList.remove('active');
            finalizeStreaming();
            status.textContent = 'Error: ' + err.message;
            input.disabled = false;
            sendBtn.disabled = false;
          });
        });

        input.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            form.dispatchEvent(new Event('submit'));
          }
        });

        if (clearBtn) {
          clearBtn.addEventListener('click', function() {
            if (!confirm('Clear all chat history?')) return;
            fetch(chatHistoryUrl, { method: 'DELETE' }).then(function() {
              window.location.reload();
            });
          });
        }

        scrollToBottom();
      })();
      </script>`}
    </Layout>
  );
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
}

function renderToolCalls(toolCallsJson: string): any {
  try {
    const calls = JSON.parse(toolCallsJson);
    if (!Array.isArray(calls) || calls.length === 0) return null;
    return (
      <div style="margin-top: 14px; display: flex; flex-direction: column; gap: 8px;">
        {calls.map((tc: any) => (
          <div class="chat-tool">
            <div class="chat-tool-header"><span class="chat-tool-icon">&#9889;</span> {tc.name}</div>
            <pre class="chat-tool-input">{JSON.stringify(tc.input, null, 2)}</pre>
            <div class="chat-tool-result">{tc.result}</div>
          </div>
        ))}
      </div>
    );
  } catch {
    return null;
  }
}
