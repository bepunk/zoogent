import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDb } from '../db/index.js';
import * as schema from '../db/schema.js';

let _auth: any = null;

export function getAuth() {
  if (_auth) return _auth as ReturnType<typeof betterAuth>;

  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      'BETTER_AUTH_SECRET is required. Run `npx zoogent init` to auto-generate it, ' +
      'or set it manually: export BETTER_AUTH_SECRET=$(openssl rand -hex 32)'
    );
  }

  _auth = betterAuth({
    database: drizzleAdapter(getDb(), {
      provider: 'sqlite',
      schema,
      usePlural: true,
    }),
    secret,
    baseURL: process.env.BETTER_AUTH_URL || `http://localhost:${process.env.PORT || '3200'}`,
    trustedOrigins: [
      process.env.BETTER_AUTH_URL || `http://localhost:${process.env.PORT || '3200'}`,
    ],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60, // 5 min
      },
    },
  });

  return _auth;
}
