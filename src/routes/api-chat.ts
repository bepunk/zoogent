import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { chat, getChatHistory, clearChatHistory } from '../core/architect.js';

export const apiChatRoutes = new Hono();

// POST /api/chat — send message, stream response via SSE
apiChatRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const { message } = body;

  if (!message || typeof message !== 'string') {
    return c.json({ error: 'message is required' }, 400);
  }

  const teamId = c.get('teamId' as any);

  return streamSSE(c, async (stream) => {
    try {
      for await (const event of chat(message, teamId)) {
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event),
        });
      }
    } catch (err: any) {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ type: 'error', content: err.message || 'Unknown error' }),
      });
    }
  });
});

// GET /api/chat/history — get chat history
apiChatRoutes.get('/history', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');
  const teamId = c.get('teamId' as any);
  const history = getChatHistory(limit, teamId);
  return c.json(history);
});

// DELETE /api/chat/history — clear chat history
apiChatRoutes.delete('/history', async (c) => {
  const teamId = c.get('teamId' as any);
  clearChatHistory(teamId);
  return c.json({ ok: true });
});
