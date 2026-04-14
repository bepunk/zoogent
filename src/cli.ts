#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, openSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';

const command = process.argv[2];
const args = process.argv.slice(3);

const DATA_DIR = process.env.DATA_DIR || './data';
const PID_FILE = resolve(DATA_DIR, '.zoogent.pid');
const LOG_FILE = resolve(DATA_DIR, 'zoogent.log');

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

// ─── PID helpers ─────────────────────────────────────────────────────────────

function readPid(): number | null {
  if (!existsSync(PID_FILE)) return null;
  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim());
    if (isNaN(pid)) return null;
    // Check if process is alive
    process.kill(pid, 0);
    return pid;
  } catch {
    // Process not running, clean up stale PID file
    try { unlinkSync(PID_FILE); } catch {}
    return null;
  }
}

// ─── Commands ────────────────────────────────────────────────────────────────

async function init() {
  const dataDir = resolve(process.cwd(), 'data');
  const secretsDir = resolve(dataDir, 'secrets');
  const skillsDir = resolve(dataDir, 'skills');

  // Create directories
  for (const dir of [dataDir, secretsDir, skillsDir]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      console.log(`Created ${dir}`);
    }
  }

  // Create .env with generated secrets
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    const envContent = `# ZooGent Configuration

# Database (SQLite file path)
DATABASE_URL=./data/zoogent.db

# Server
PORT=3200

# Auth
BETTER_AUTH_SECRET=${randomBytes(32).toString('hex')}

# Skills directory
SKILLS_DIR=./data/skills

# Public URL (set to your domain for remote deployment)
# BETTER_AUTH_URL=https://your-domain.com

`;
    writeFileSync(envPath, envContent);
    console.log('Created .env with generated secrets');
  } else {
    console.log('.env already exists, skipping');
  }

  // Create tsconfig.json for agent scripts
  const tsconfigPath = resolve(process.cwd(), 'tsconfig.json');
  if (!existsSync(tsconfigPath)) {
    writeFileSync(tsconfigPath, JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
        allowImportingTsExtensions: true,
        noEmit: true,
      },
      include: ['agents/**/*.ts', 'lib/**/*.ts'],
      exclude: ['node_modules'],
    }, null, 2) + '\n');
    console.log('Created tsconfig.json');
  }

  // Create example skill
  const exampleSkill = resolve(skillsDir, 'example.md');
  if (!existsSync(exampleSkill)) {
    writeFileSync(exampleSkill, `---
name: Example Skill
description: A sample skill to get you started
category: general
related: []
---

# Example Skill

This is a sample skill file. Skills are markdown documents with YAML frontmatter
that define agent knowledge. Agents load skills at startup to guide their behavior.

## How Skills Work

- Skills live in the \`data/skills/\` directory
- Each skill has YAML frontmatter (name, description, category, related)
- Agents reference skills via the \`agent_skills\` table
- Edit skills in the web panel or directly as files
`);
    console.log('Created example skill at data/skills/example.md');
  }

  // Load env for DB path
  loadEnv();

  // Run database migrations
  console.log('Setting up database...');
  try {
    const { runMigrations, initFts } = await import('./db/index.js');
    runMigrations();
    initFts();
    // Seed system skills for Architect AI
    const { seedSystemSkills } = await import('./db/seed-skills.js');
    seedSystemSkills();
    console.log('Database ready.');
  } catch (err: any) {
    console.error('Warning: database setup failed:', err.message);
  }

  console.log('\nZooGent initialized. Ready to start.');
}

async function start() {
  const daemon = args.includes('-d') || args.includes('--daemon');

  if (daemon) {
    // Check if already running
    const existingPid = readPid();
    if (existingPid) {
      console.error(`ZooGent is already running (PID ${existingPid})`);
      process.exit(1);
    }

    // Ensure data dir exists for log file
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

    // Spawn detached process (foreground mode, without -d flag)
    const logFd = openSync(LOG_FILE, 'a');
    const child = spawn(process.execPath, [process.argv[1], 'start'], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      cwd: process.cwd(),
      env: process.env,
    });
    child.unref();

    console.log(`ZooGent started in background (PID ${child.pid})`);
    console.log(`Logs: ${LOG_FILE}`);
    process.exit(0);
  }

  // Foreground mode
  loadEnv();

  // Run migrations before starting (handles updates)
  const { runMigrations, initFts } = await import('./db/index.js');
  runMigrations();
  initFts();

  const { main } = await import('./index.js');
  main();
}

function stop() {
  const pid = readPid();
  if (!pid) {
    console.log('ZooGent is not running');
    return;
  }

  console.log(`Stopping ZooGent (PID ${pid})...`);
  process.kill(pid, 'SIGTERM');

  // Wait for graceful shutdown (up to 10 seconds)
  let attempts = 0;
  const check = setInterval(() => {
    attempts++;
    try {
      process.kill(pid, 0); // Check if alive
      if (attempts >= 20) {
        // 10 seconds passed, force kill
        console.log('Force killing...');
        try { process.kill(pid, 'SIGKILL'); } catch {}
        try { unlinkSync(PID_FILE); } catch {}
        clearInterval(check);
        console.log('ZooGent stopped (forced)');
      }
    } catch {
      // Process exited
      clearInterval(check);
      try { unlinkSync(PID_FILE); } catch {}
      console.log('ZooGent stopped');
    }
  }, 500);
}

function status() {
  loadEnv();
  const pid = readPid();
  const port = process.env.PORT || '3200';

  if (pid) {
    console.log(`ZooGent is running (PID ${pid}, port ${port})`);
  } else {
    console.log('ZooGent is not running');
  }
}

function logs() {
  if (!existsSync(LOG_FILE)) {
    console.log('No log file found. Start with: zoogent start -d');
    return;
  }

  const follow = args.includes('-f') || args.includes('--follow');

  if (follow) {
    // Tail -f using child process
    const tail = spawn('tail', ['-f', LOG_FILE], { stdio: 'inherit' });
    tail.on('error', () => {
      // Fallback: just print last lines
      printLastLines();
    });
    return;
  }

  printLastLines();
}

function printLastLines() {
  const content = readFileSync(LOG_FILE, 'utf-8');
  const lines = content.split('\n');
  const last = lines.slice(-50).join('\n');
  console.log(last);
}

async function create() {
  const dirName = args[0];
  if (!dirName) {
    console.error('Usage: zoogent create <project-name>');
    process.exit(1);
  }

  const projectDir = resolve(process.cwd(), dirName);

  if (existsSync(projectDir)) {
    console.error(`Directory "${dirName}" already exists`);
    process.exit(1);
  }

  console.log(`\nCreating ZooGent project in ${dirName}/\n`);

  // Create directory
  mkdirSync(projectDir, { recursive: true });

  // Create package.json with zoogent as only dependency (SDK bundled inside)
  writeFileSync(resolve(projectDir, 'package.json'), JSON.stringify({
    name: dirName,
    private: true,
    type: 'module',
    dependencies: {
      'zoogent': '*',
      // TODO: remove after publishing zoogent 0.2.0 (SDK will be hoisted from zoogent's own deps)
      '@anthropic-ai/sdk': '*',
    },
  }, null, 2) + '\n');

  // Install dependencies
  console.log('Installing dependencies...');
  const { execSync } = await import('node:child_process');
  try {
    execSync('npm install', { cwd: projectDir, stdio: 'inherit' });
  } catch {
    console.error('Failed to install dependencies. Run manually: cd ' + dirName + ' && npm install');
    process.exit(1);
  }

  // Run init inside the project directory
  console.log('');
  try {
    execSync('npx zoogent init', { cwd: projectDir, stdio: 'inherit' });
  } catch {
    console.error('Failed to initialize. Run manually: cd ' + dirName + ' && npx zoogent init');
    process.exit(1);
  }

  console.log(`
Done! Next steps:

  cd ${dirName}
  npx zoogent start

Then open http://localhost:3200 in your browser.
`);
}

async function mcp() {
  loadEnv();
  await import('./mcp.js');
}

switch (command) {
  case 'create':
    create();
    break;
  case 'init':
    init();
    break;
  case 'start':
    start();
    break;
  case 'stop':
    stop();
    break;
  case 'status':
    status();
    break;
  case 'logs':
    logs();
    break;
  case 'mcp':
    mcp();
    break;
  default:
    console.log(`
ZooGent - Lightweight AI Agent Orchestrator

Usage:
  zoogent create <name>  Create a new project (recommended)
  zoogent init           Initialize in current directory
  zoogent start          Start the server (foreground)
  zoogent start -d       Start the server (daemon, background)
  zoogent stop           Stop the daemon
  zoogent status         Check if server is running
  zoogent logs           Show server logs (use -f to follow)
  zoogent mcp            Start the MCP server (stdio)

Quick start:
  npx zoogent create my-agents
  cd my-agents
  npx zoogent start
`);
    process.exit(command ? 1 : 0);
}
