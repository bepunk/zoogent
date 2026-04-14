import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// ─── Master Key Management ─────────────────────────────────────────────────────

let _masterKey: Buffer | null = null;

export function loadMasterKey(dataDir: string): Buffer {
  if (_masterKey) return _masterKey;

  const secretsDir = resolve(dataDir, 'secrets');
  const keyPath = resolve(secretsDir, 'master.key');

  if (existsSync(keyPath)) {
    _masterKey = Buffer.from(readFileSync(keyPath, 'utf-8').trim(), 'hex');
  } else {
    // Auto-generate on first run
    if (!existsSync(secretsDir)) {
      mkdirSync(secretsDir, { recursive: true });
    }
    const key = randomBytes(32);
    writeFileSync(keyPath, key.toString('hex'), { mode: 0o600 });
    try {
      chmodSync(keyPath, 0o600);
    } catch {
      // May fail on some OS/filesystems
    }
    _masterKey = key;
    console.log('Generated master key at', keyPath);
  }

  return _masterKey;
}

// ─── String Encryption (for settings/credentials) ──────────────────────────────

export function encrypt(plaintext: string, masterKey: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, masterKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(stored: string, masterKey: Buffer): string {
  const parts = stored.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted format');
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, masterKey, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf-8');
}

// ─── Env Var Encryption ─────────────────────────────────────────────────────────

export function encryptEnv(data: Record<string, string>, masterKey: Buffer): string {
  const plaintext = JSON.stringify(data);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, masterKey, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (hex encoded)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptEnv(stored: string, masterKey: Buffer): Record<string, string> {
  const parts = stored.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted env format');
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, masterKey, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString('utf-8'));
}

/**
 * Check if a string looks like an encrypted env (hex:hex:hex format).
 * Plaintext JSON objects start with '{'.
 */
export function isEncryptedEnv(value: string): boolean {
  return /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/i.test(value);
}

// ─── API Key Comparison ─────────────────────────────────────────────────────────

export function timeSafeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;

  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  // Hash both to ensure equal length for timingSafeEqual
  const hashA = createHash('sha256').update(bufA).digest();
  const hashB = createHash('sha256').update(bufB).digest();

  return timingSafeEqual(hashA, hashB);
}

// ─── Log Sanitization ───────────────────────────────────────────────────────────

const SECRET_PATTERNS = [
  /sk-ant-api[0-9A-Za-z_-]{20,}/g,         // Anthropic API key
  /sk-[a-zA-Z0-9]{20,}/g,                   // OpenAI-style key
  /ghp_[a-zA-Z0-9]{36}/g,                   // GitHub personal token
  /gho_[a-zA-Z0-9]{36}/g,                   // GitHub OAuth token
  /xoxb-[0-9]{10,}-[0-9A-Za-z-]+/g,         // Slack bot token
  /xoxp-[0-9]{10,}-[0-9A-Za-z-]+/g,         // Slack user token
  /[0-9]+:AA[0-9A-Za-z_-]{33}/g,            // Telegram bot token
];

export function sanitizeLogs(output: string, envVars?: Record<string, string>): string {
  let sanitized = output;

  // Strip known secret patterns
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }

  // Strip any values from the agent's own env config
  if (envVars) {
    for (const value of Object.values(envVars)) {
      if (value && value.length >= 8) {
        // Only redact values that are long enough to be secrets
        sanitized = sanitized.replaceAll(value, '[REDACTED]');
      }
    }
  }

  return sanitized;
}

// ─── Mask for UI Display ────────────────────────────────────────────────────────

export function maskValue(value: string): string {
  if (value.length <= 8) return '***';
  return `${value.slice(0, 4)}***${value.slice(-3)}`;
}

// ─── Credential Masking ────────────────────────────────────────────────────────

export function maskCredentials(creds: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [k, v] of Object.entries(creds)) {
    masked[k] = v.length > 4 ? v.slice(0, 4) + '••••' : '••••';
  }
  return masked;
}
