import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, encryptEnv, decryptEnv, isEncryptedEnv, timeSafeCompare, sanitizeLogs, maskValue, loadMasterKey } from '../src/lib/crypto.js';

describe('Crypto', () => {
  const dataDir = process.env.DATA_DIR || '/tmp/zoogent-test-data';
  let masterKey: Buffer;

  beforeAll(() => {
    masterKey = loadMasterKey(dataDir);
  });

  describe('encrypt/decrypt', () => {
    it('round-trips a string', () => {
      const plain = 'sk-ant-api03-secret-key-here';
      const encrypted = encrypt(plain, masterKey);
      expect(encrypted).not.toBe(plain);
      expect(decrypt(encrypted, masterKey)).toBe(plain);
    });

    it('produces different ciphertext each time (random IV)', () => {
      const plain = 'same-input';
      const a = encrypt(plain, masterKey);
      const b = encrypt(plain, masterKey);
      expect(a).not.toBe(b);
      expect(decrypt(a, masterKey)).toBe(plain);
      expect(decrypt(b, masterKey)).toBe(plain);
    });

    it('handles empty string', () => {
      const encrypted = encrypt('', masterKey);
      expect(decrypt(encrypted, masterKey)).toBe('');
    });

    it('handles unicode', () => {
      const plain = 'Привет мир 🦍';
      expect(decrypt(encrypt(plain, masterKey), masterKey)).toBe(plain);
    });
  });

  describe('encryptEnv/decryptEnv', () => {
    it('round-trips env vars', () => {
      const env = { API_KEY: 'secret123', DB_URL: 'postgres://localhost' };
      const encrypted = encryptEnv(env, masterKey);
      expect(isEncryptedEnv(encrypted)).toBe(true);
      const decrypted = decryptEnv(encrypted, masterKey);
      expect(decrypted).toEqual(env);
    });

    it('isEncryptedEnv returns false for plain JSON', () => {
      expect(isEncryptedEnv('{"key":"value"}')).toBe(false);
      expect(isEncryptedEnv('')).toBe(false);
    });
  });

  describe('timeSafeCompare', () => {
    it('returns true for equal strings', () => {
      expect(timeSafeCompare('abc123', 'abc123')).toBe(true);
    });

    it('returns false for different strings', () => {
      expect(timeSafeCompare('abc123', 'abc124')).toBe(false);
    });

    it('returns false for different lengths', () => {
      expect(timeSafeCompare('short', 'longer-string')).toBe(false);
    });
  });

  describe('sanitizeLogs', () => {
    it('strips API key patterns', () => {
      const log = 'Using key sk-ant-api03-abcdefghijklmnopqrstuv for request';
      const sanitized = sanitizeLogs(log);
      expect(sanitized).not.toContain('sk-ant-api03-abcdefghijklmnopqrstuv');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('strips custom env var values (8+ chars)', () => {
      const log = 'Secret value is my-secret-token here';
      const sanitized = sanitizeLogs(log, { SECRET: 'my-secret-token' });
      expect(sanitized).not.toContain('my-secret-token');
    });

    it('does not strip short env values', () => {
      const log = 'Value is abc here';
      const sanitized = sanitizeLogs(log, { SHORT: 'abc' });
      expect(sanitized).toContain('abc');
    });
  });

  describe('maskValue', () => {
    it('masks long values showing last 5 chars', () => {
      expect(maskValue('sk-ant-api03-longkey')).toBe('•••••ngkey');
    });

    it('fully masks short values (<=5 chars)', () => {
      expect(maskValue('abc')).toBe('•••••');
      expect(maskValue('12345')).toBe('•••••');
    });
  });
});
