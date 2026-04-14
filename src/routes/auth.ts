import { Hono } from 'hono';
import { getAuth } from '../lib/auth.js';

export const authRoutes = new Hono();

authRoutes.all('/*', async (c) => {
  const auth = getAuth();
  return auth.handler(c.req.raw);
});
