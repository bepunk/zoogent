import { build, type Message } from 'esbuild';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

// Blessed dependencies — the set of packages agents are allowed to import.
// Each string matches its own name and any subpaths (esbuild's rule).
// Node built-in modules are externalized automatically by platform: 'node'.
export const BLESSED_DEPENDENCIES = [
  'zoogent',
  'zoogent/client',
  '@anthropic-ai/sdk',
  'openai',
  '@google/generative-ai',
  'zod',
  'axios',
  'cheerio',
  'googleapis',
  'p-limit',
  'p-retry',
  'p-map',
  'p-queue',
  'date-fns',
  'lodash-es',
  'slugify',
  'he',
  'tiktoken',
  'yaml',
  'csv-parse',
  'csv-stringify',
  'fast-xml-parser',
  'marked',
  'turndown',
  'nodemailer',
  'imapflow',
  'mailparser',
  'jsonwebtoken',
];

export const MAX_SOURCE_BYTES = 1024 * 1024; // 1 MB

export type BundleResult =
  | { ok: true; bundle: string; hash: string; warnings: string[] }
  | { ok: false; error: string };

let _zoogentRoot: string | null = null;

export function getZoogentRoot(): string {
  if (_zoogentRoot) return _zoogentRoot;
  // Walk up from this file to find the directory containing package.json + node_modules
  // (zoogent package root). In dev: src/lib/ → repo root. In prod (dist): dist/lib/ → package root.
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(resolve(dir, 'package.json')) && existsSync(resolve(dir, 'node_modules'))) {
      _zoogentRoot = dir;
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  _zoogentRoot = process.cwd();
  return _zoogentRoot;
}

const RESOLVE_DIR = getZoogentRoot();

function formatMessages(messages: Message[]): string {
  return messages.map(m => {
    const loc = m.location ? ` (line ${m.location.line}:${m.location.column})` : '';
    return `${m.text}${loc}`;
  }).join('\n');
}

export async function bundleAgentSource(source: string, agentId: string): Promise<BundleResult> {
  if (!source || typeof source !== 'string') {
    return { ok: false, error: 'Source is required and must be a string.' };
  }
  if (Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) {
    return { ok: false, error: `Source exceeds max size of ${MAX_SOURCE_BYTES} bytes.` };
  }

  try {
    const result = await build({
      stdin: {
        contents: source,
        loader: 'ts',
        resolveDir: RESOLVE_DIR,
        sourcefile: `${agentId}.ts`,
      },
      bundle: true,
      platform: 'node',
      target: 'node24',
      format: 'esm',
      write: false,
      external: BLESSED_DEPENDENCIES,
      sourcemap: 'inline',
      logLevel: 'silent',
      treeShaking: true,
      minify: false,
      legalComments: 'none',
    });

    const output = result.outputFiles[0];
    if (!output) {
      return { ok: false, error: 'esbuild produced no output.' };
    }

    const bundle = output.text;
    const hash = createHash('sha256').update(bundle).digest('hex');
    const warnings = result.warnings.map(w => w.text);

    return { ok: true, bundle, hash, warnings };
  } catch (err: any) {
    const errors = err?.errors as Message[] | undefined;
    if (errors && errors.length > 0) {
      return { ok: false, error: formatMessages(errors) };
    }
    return { ok: false, error: String(err?.message || err) };
  }
}
