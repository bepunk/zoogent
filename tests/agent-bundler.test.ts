import { describe, it, expect } from 'vitest';
import { bundleAgentSource, BLESSED_DEPENDENCIES, MAX_SOURCE_BYTES } from '../src/lib/agent-bundler.js';

describe('agent-bundler', () => {
  it('bundles a minimal TypeScript source', async () => {
    const src = `
      const n: number = 42;
      console.log('hello', n);
    `;
    const r = await bundleAgentSource(src, 'agent-min');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.bundle.length).toBeGreaterThan(0);
      expect(r.hash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('externalizes blessed deps (does not bundle their code)', async () => {
    const src = `
      import axios from 'axios';
      import Anthropic from '@anthropic-ai/sdk';
      import { z } from 'zod';
      const schema = z.string();
      console.log(typeof axios, typeof Anthropic, schema.parse('ok'));
    `;
    const r = await bundleAgentSource(src, 'agent-ext');
    expect(r.ok).toBe(true);
    if (r.ok) {
      // externals should appear as import statements, not bundled source
      expect(r.bundle).toMatch(/from ["']axios["']/);
      expect(r.bundle).toMatch(/from ["']@anthropic-ai\/sdk["']/);
      expect(r.bundle).toMatch(/from ["']zod["']/);
      // Bundle should be small since deps are external
      expect(r.bundle.length).toBeLessThan(5000);
    }
  });

  it('allows node built-ins via node: prefix', async () => {
    const src = `
      import { readFileSync } from 'node:fs';
      import { createHash } from 'node:crypto';
      console.log(typeof readFileSync, typeof createHash);
    `;
    const r = await bundleAgentSource(src, 'agent-node');
    expect(r.ok).toBe(true);
  });

  it('fails on unknown imports with a readable error', async () => {
    const src = `
      import foo from 'this-package-does-not-exist';
      console.log(foo);
    `;
    const r = await bundleAgentSource(src, 'agent-bad');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/could not resolve/i);
      expect(r.error).toContain('this-package-does-not-exist');
    }
  });

  it('fails on TypeScript syntax errors', async () => {
    const src = `
      const x: number = "not a number"
      this is not valid syntax
    `;
    const r = await bundleAgentSource(src, 'agent-syntax');
    expect(r.ok).toBe(false);
  });

  it('rejects empty source', async () => {
    const r = await bundleAgentSource('', 'agent-empty');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/required/i);
  });

  it('rejects source exceeding max size', async () => {
    const src = 'const x = 0;\n' + 'a'.repeat(MAX_SOURCE_BYTES + 100);
    const r = await bundleAgentSource(src, 'agent-big');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/max size/i);
  });

  it('produces deterministic hash for identical source', async () => {
    const src = `const n: number = 42;\nconsole.log(n);`;
    const a = await bundleAgentSource(src, 'agent-a');
    const b = await bundleAgentSource(src, 'agent-a');
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.hash).toBe(b.hash);
    }
  });

  it('exports the blessed deps list for reference', () => {
    expect(BLESSED_DEPENDENCIES).toContain('axios');
    expect(BLESSED_DEPENDENCIES).toContain('@anthropic-ai/sdk');
    expect(BLESSED_DEPENDENCIES).toContain('openai');
    expect(BLESSED_DEPENDENCIES).toContain('zod');
    expect(BLESSED_DEPENDENCIES).toContain('googleapis');
  });
});
