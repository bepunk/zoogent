import { getDb } from './index.js';
import { systemSkills as systemSkillsTable } from './schema.js';
import { createHash } from 'node:crypto';

/**
 * Seed system skills for the Architect AI and MCP LLM.
 * Stored in the separate system_skills table (not mixed with team skills).
 * Idempotent via upsert on path PK.
 */
export function seedSystemSkills() {
  const db = getDb();
  const skills = [
    {
      path: 'system/team-design.md',
      name: 'Team Design Framework',
      description: 'How to design agent teams: discovery flow, Jobs-Roles-Flows',
      category: 'system',
      content: `---
name: Team Design Framework
description: How to design agent teams using the Jobs-Roles-Flows framework
category: system
---

# Team Design Framework

Use the Jobs-Roles-Flows (JRF) framework to design agent teams. Walk the user through all three phases before creating anything.

## Phase 1: JOBS — What needs to be done

Ask the user:
1. **Business result** — What is the desired outcome? (e.g., "invoices processed automatically")
2. **Manual steps** — How is this done manually today? List each step in order.
3. **Intelligence vs mechanics** — For each step: does it need LLM reasoning, or is it a mechanical API call / data transform?
4. **Human decisions** — Where is human judgment essential? (approval, exceptions, quality review)
5. **Data flow** — What data is needed at each step? Where does it come from?

Output: a list of jobs (steps) with their type (LLM / mechanical / human).

## Phase 2: ROLES — Who does what

For each job or group of jobs, define an agent:
1. **Skills needed** — What domain knowledge does the agent need?
2. **Grouping** — Can multiple jobs be handled by one agent, or does each need a specialist?
3. **Tools/APIs** — What external services does each agent call?
4. **Success criteria** — How do you know the agent did its job well?
5. **Constraints** — Approval requirements, scope limits, error handling rules, budget caps.

### Learning strategy (important)
For each agent decide:
- **Personal learning** — \`reportMemory()\` for private insights
- **Team sharing** — \`reportTeamKnowledge()\` for facts useful to all agents
- **Working data** — \`storeGet/storeSet\` for state between runs (processed IDs, URLs, cursors)

## Phase 3: FLOWS — How agents connect

1. **Sequence** — Pipeline order (A → B → C)
2. **Parallel** — Fan-out (A → B, A → C)
3. **Data** — Task payload format between agents
4. **Routing** — Where does the flow branch?
5. **Errors** — Retry / fallback / human escalation rules
6. **Coordinator** — For 3+ workers, consider a coordinator agent

Output: a flow diagram (agents + connections + data passed).

## Principles

- **Start small** — 1-2 agents first. Get the core working before adding complexity.
- **Match model to task** — Haiku for simple classification, Sonnet for reasoning and writing, Opus only when needed.
- **One goal per agent** — If a goal contains "and", split into two agents.
- **Skills over code** — Domain rules belong in skills (markdown), not hardcoded in agent logic.

## Team Patterns

- **Pipeline**: A → B → C (each agent processes and passes forward)
- **Fan-out**: A → B, A → C (one distributes work to many)
- **Generator-Critic**: A generates, B reviews, loop until quality threshold met
- **Coordinator + Workers**: Coordinator routes incoming work, workers specialize

## After Design

1. create_skill for each role (domain instructions)
2. create_agent — use runtime="typescript" (default). Pass \`source\` to bundle atomically, or upload later via write_agent_code.
3. assign_skill to wire skills to agents
4. trigger_agent + get_logs to test
5. Iterate: write_agent_code to change behavior, update_agent to tweak config

Default to typescript. Use runtime="exec" only when wrapping an existing binary or non-TS script.
`,
    },
    {
      path: 'system/agent-patterns.md',
      name: 'Agent Patterns',
      description: 'Agent types (cron/manual/long-running), runtime (typescript/exec), common team patterns',
      category: 'system',
      content: `---
name: Agent Patterns
description: Agent types, runtimes, and common team patterns
category: system
---

# Agent Patterns

## Runtimes

### typescript (default)
- Code lives in zoogent's DB. Uploaded via \`write_agent_code\` or \`create_agent({ source })\`.
- Zoogent bundles with esbuild. Unknown imports fail at upload time.
- Executed as \`node {materialized.mjs}\`.
- Use for 95% of agents.

### exec (escape hatch)
- Code lives outside zoogent. Provide \`command\` + \`args\` + \`cwd\`.
- Zoogent just spawns the process, injects env vars, captures logs.
- Use for: wrapping binaries (\`scout-for-claude\`), Python scripts, Go/Rust tools.
- Code is NOT managed through MCP — the user deploys it separately.

## Types

### cron
- Runs on a schedule. \`cronSchedule\` expression required.
- Good for: monitoring, batch processing.
- Default timeout: 600s.

### manual
- Triggered explicitly (human or \`createTask\` from another agent).
- \`wakeOnAssignment: true\` auto-starts when a task lands.

### long-running
- Persistent process (Telegram bot, webhook listener, websocket subscriber).
- No default timeout.
- Auto-restarts if server restarts and the agent was running.

## Team Patterns

### Pipeline (A → B → C)
Sequential processing. Monitor finds work → Analyzer classifies → Responder acts.

### Fan-Out (A → B, A → C)
Router distributes to specialists. Classifier → billing / technical / general teams.

### Generator-Critic
Writer produces → Critic scores → Writer revises if below threshold.

### Coordinator + Workers (3+ agents)
A sonnet-powered coordinator reads status, routes work, prevents duplicates. Workers use cheaper models.

## Feedback Collector
A cron agent (haiku) that runs daily/weekly, compares agent decisions against user corrections, reports patterns as team knowledge.

## When to Add a Coordinator
- 3+ worker agents
- Priorities or ordering matter
- Risk of duplicate work
Skip for 1-2 agents or simple pipelines.
`,
    },
    {
      path: 'system/code-generation.md',
      name: 'Agent Code Generation',
      description: 'How to write agent scripts: blessed dependencies, SDK API, canonical boilerplate',
      category: 'system',
      content: `---
name: Agent Code Generation
description: How to write agent code — blessed dependencies, SDK API, boilerplate
category: system
---

# Agent Code Generation

Agent code is **TypeScript**, uploaded through MCP (\`write_agent_code\` / \`create_agent(source)\`), bundled by zoogent with esbuild. Only the blessed dependency set is allowed — unknown imports fail at upload time.

## Blessed Dependencies

Always available — import directly:

**AI providers**
- \`@anthropic-ai/sdk\` — Claude
- \`openai\` — GPT / embeddings / whisper
- \`@google/generative-ai\` — Gemini
- \`zoogent/client\` — the ZooGent SDK (always)

**Validation**
- \`zod\`

**HTTP & scraping**
- \`axios\` (alternative: native \`fetch\` — no import needed in Node 24)
- \`cheerio\`

**Google stack**
- \`googleapis\` — Gmail, Sheets, Drive, Calendar, Places, etc.

**Flow control**
- \`p-limit\`, \`p-retry\`, \`p-map\`, \`p-queue\`

**Utilities**
- \`date-fns\`
- \`lodash-es\`
- \`slugify\`
- \`he\` — HTML entities
- \`tiktoken\`

**Data formats**
- \`yaml\`
- \`csv-parse\`, \`csv-stringify\`
- \`fast-xml-parser\`
- \`marked\` (md → html)
- \`turndown\` (html → md)

**Email**
- \`nodemailer\` — send
- \`imapflow\` — IMAP read
- \`mailparser\` — parse MIME

**Auth**
- \`jsonwebtoken\`

**Messaging / Bots**
- \`node-telegram-bot-api\` — Telegram bots
- \`discord.js\` — Discord bots (Gateway + REST)

**Image processing**
- \`jimp\` — resize, crop, composite, text, filters. Pure JS, works in sandbox.

**WebSocket**
- \`ws\` — WebSocket client (though Node 24 has global \`WebSocket\` — prefer that)
- \`undici\` — fetch internals (use global \`fetch\` instead)

**Node built-ins** — all available (\`fs\`, \`fs/promises\`, \`crypto\`, \`http(s)\`, \`path\`, \`child_process\`, \`stream\`, \`url\`, \`zlib\`, etc.)

If you need a lib outside this list, tell the user — it requires a zoogent version bump.

## Node 24 Globals — no import needed

These are available without importing:

  fetch, Request, Response, Headers   — HTTP (no node-fetch or undici needed)
  FormData, Blob, File                — multipart / binary
  WebSocket                           — WebSocket client
  URL, URLSearchParams                — URL parsing
  TextEncoder, TextDecoder            — encoding
  structuredClone, atob, btoa, crypto — utilities

Avoid redundant imports:
  ❌ import fetch from 'node-fetch'     → ✅ just use fetch
  ❌ import { fetch } from 'undici'     → ✅ just use fetch
  ❌ import FormData from 'form-data'   → ✅ just use FormData
  ❌ import WebSocket from 'ws'         → ✅ just use WebSocket
  ❌ import { URL } from 'url'          → ✅ just use URL

## Team Code Library

Share TypeScript utilities across agents without copy-pasting.

1. Write shared code with write_team_library_file:
   path: "utils.ts", content: "export const greet = (name: string) => \`Hello \${name}\`;"

2. Import in any agent:
   \`\`\`typescript
   import { greet } from 'team:utils';         // resolves utils.ts
   import { foo } from 'team:lib/helpers';     // resolves lib/helpers.ts
   \`\`\`

The library is bundled INTO the agent at upload time — no runtime dependency.
Missing team: imports fail at upload with a clear error.

## Telegram Bot Pattern

\`\`\`typescript
import TelegramBot from 'node-telegram-bot-api';

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN!, { polling: false });
await bot.sendMessage(process.env.TELEGRAM_CHAT_ID!, 'Hello from ZooGent!');
\`\`\`

For long-running Telegram bots, use \`type: "long-running"\` and \`polling: true\`.

## Discord Bot Pattern

\`\`\`typescript
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
client.once('ready', () => console.log('Bot ready'));
client.login(process.env.DISCORD_TOKEN!);
\`\`\`

For Discord bots always use \`type: "long-running"\`.

## Image Processing Pattern (jimp)

\`\`\`typescript
import Jimp from 'jimp';
const sharedDir = process.env.ZOOGENT_SHARED_DIR!;

const image = await Jimp.read(\`\${sharedDir}/input.jpg\`);
image.resize(800, Jimp.AUTO).quality(85);
await image.writeAsync(\`\${sharedDir}/output.jpg\`);
\`\`\`

## Environment Variables (auto-injected on spawn)

- \`ZOOGENT_API_URL\` — API endpoint for SDK HTTP calls
- \`ZOOGENT_API_KEY\` — auth token for SDK
- \`ZOOGENT_AGENT_ID\` — this agent's ID
- \`ZOOGENT_AGENT_GOAL\` — the agent's mission string
- \`ZOOGENT_AGENT_MODEL\` — configured AI model name
- \`ZOOGENT_RUN_ID\` — current run ID
- \`ZOOGENT_TEAM_ID\` — team ID
- \`ZOOGENT_SHARED_DIR\` — shared folder for the team (agents can read and write here to exchange files)
- \`ZOOGENT_MEMORIES\` — JSON array of scored/decayed memories
- \`ZOOGENT_AGENT_SKILLS\` — concatenated skill contents
- \`ZOOGENT_TEAM_KNOWLEDGE\` — JSON array of active team knowledge
- \`ANTHROPIC_API_KEY\` — auto-injected from team settings
- \`INTEGRATION_{NAME}_{FIELD}\` — per-integration credentials
- \`ZOOGENT_INTEGRATIONS\` — JSON of all enabled integrations

## SDK API (\`zoogent/client\`)

### Context (env-backed, sync)
- \`getGoal(): string\`
- \`getSkills(): string\`
- \`getMemories(): Array<{ content, importance, tags }>\`
- \`getTeamKnowledge(): Array<{ title, content }>\`

### Tasks (async, HTTP)
- \`getMyTasks(status?): Promise<Task[]>\`
- \`checkoutTask(id): Promise<boolean>\` — atomic lock
- \`completeTask(id, result?)\`
- \`failTask(id, result?)\`
- \`createTask({ agentId, title, payload }): Promise<{ id }>\`

### Reporting (async, HTTP)
- \`reportCost({ model, inputTokens, outputTokens, costCents })\`
- \`reportMemory({ content, importance?, tags? })\`
- \`reportTeamKnowledge({ title, content })\`

### Store (persistent key-value per agent)
- \`storeGet(key)\`, \`storeSet(key, value, ttlSeconds?)\` — own store
- \`storeDelete(key)\`, \`storeKeys(prefix?)\` — own store
- \`crossStoreGet(agentId, key)\` — read another agent's store (same team only, read-only)
- \`crossStoreKeys(agentId, prefix?)\` — list another agent's keys (same team only)

To share state between agents in the same team, the producer writes with \`storeSet\`,
and consumers read with \`crossStoreGet(producerAgentId, key)\`. Cross-agent writes
are intentionally not exposed — last-write-wins concurrency is a foot-gun.

### Skills
- \`loadSkill(path): string | null\` — on-demand skill read
- \`loadSkills(paths): string\`

### Health
- \`heartbeat()\` — call periodically in long-running agents

## Canonical Boilerplate (task-worker)

\`\`\`typescript
import {
  getGoal, getMemories, getSkills, getTeamKnowledge,
  getMyTasks, checkoutTask, completeTask,
  reportCost, reportMemory,
} from 'zoogent/client';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();
const goal = getGoal();
const skills = getSkills();

async function main() {
  const tasks = await getMyTasks();

  for (const task of tasks) {
    if (!(await checkoutTask(task.id))) continue;

    try {
      const payload = task.payload ? JSON.parse(task.payload) : {};
      const result = await handleTask(payload);
      await completeTask(task.id, JSON.stringify(result));
    } catch (err) {
      await completeTask(task.id, JSON.stringify({ error: String(err) }));
    }
  }
}

async function handleTask(payload: any) {
  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: \`\${goal}\\n\\n\${skills}\`,
    messages: [{ role: 'user', content: JSON.stringify(payload) }],
  });

  await reportCost({
    model: 'claude-sonnet-4-6',
    inputTokens: resp.usage.input_tokens,
    outputTokens: resp.usage.output_tokens,
    costCents: estimateCost('claude-sonnet-4-6', resp.usage),
  });

  const text = resp.content.find(b => b.type === 'text')?.text || '';
  return { result: text };
}

function estimateCost(model: string, usage: { input_tokens: number; output_tokens: number }): number {
  const rates: Record<string, [number, number]> = {
    'claude-haiku-4-5-20251001': [0.25, 1.25],
    'claude-sonnet-4-6': [3, 15],
    'claude-opus-4-7': [15, 75],
  };
  const [inRate, outRate] = rates[model] || [3, 15];
  return Math.ceil(((usage.input_tokens / 1e6) * inRate + (usage.output_tokens / 1e6) * outRate) * 100);
}

main().catch(console.error);
\`\`\`

## What Doesn't Work

- **Non-blessed imports** — bundle fails. If you need a new lib, tell the user.
- **Writing outside \`ZOOGENT_SHARED_DIR\`** — agents can only write to their team's shared folder. Use \`process.env.ZOOGENT_SHARED_DIR\` to get the path. Use the Store for lightweight state (URLs, IDs), shared dir for actual files.
- **Long-running HTTP servers inside a manual/cron agent** — use \`type="long-running"\` for that.
- **Synchronous waits > timeoutSec** — agent is killed. Either shorten the work or set \`type="long-running"\`.
- **Relative imports** (\`import { foo } from './lib/utils'\`) — zoogent stores a single source string, not a folder. Use Team Code Library (\`import { foo } from 'team:lib/utils'\`) for shared code.
- **\`sharp\`, \`canvas\`, \`@napi-rs/canvas\`** — require native addons, blocked by Node.js \`--permission\` sandbox. Use \`jimp\` for image processing instead. For image generation from scratch: use exec runtime or a cloud API.
- **\`update_agent\` cannot change runtime** — runtime is immutable. Workflow: \`delete_agent\` → \`create_agent\` with new runtime.

## Patterns

- Always \`checkoutTask\` before processing (atomic, returns false if taken).
- Always \`reportCost\` after an LLM call.
- Prefer \`completeTask\` with a structured JSON result — it flows to downstream agents.
- For long work, break into smaller tasks rather than looping forever.
`,
    },
    {
      path: 'system/debugging.md',
      name: 'Debugging Guide',
      description: 'How to read agent logs, diagnose errors, suggest fixes',
      category: 'system',
      content: `---
name: Debugging Guide
description: How to diagnose and fix agent errors
category: system
---

# Debugging Guide

## Reading Logs
- \`get_logs(agentId)\` returns stdout/stderr for the latest run (or \`runId\` for a specific run).
- Logs flush every 5 seconds while the agent runs — long agents show progress.
- Logs are sanitized (API keys stripped).

## Common Errors

### Bundle failed at write_agent_code
- The source references an import not in the blessed deps. Read \`get_agent_guide("code-generation")\` for the list. Fix the import and re-upload.
- Syntax errors also surface here (TypeScript parse errors) — fix the source.

### "Agent not available (disabled, running, over budget, or no code)"
- \`typescript\` agent with no uploaded source → call \`write_agent_code\`.
- Agent is already running → wait, or check \`isRunning\` via \`get_agent\`.
- Over monthly budget → raise \`budgetMonthlyCents\` or wait.

### "Could not resolve authentication method"
- Agent's LLM SDK can't find a key. Set \`ANTHROPIC_API_KEY\` in team settings — zoogent injects it automatically.
- For 3rd-party APIs: create an integration (\`create_integration\`) and reference env vars as \`INTEGRATION_{NAME}_{FIELD}\`.

### Timeout
- Default timeout is 600 s (manual/cron). Long-running agents default to 0 (no timeout).
- Raise via \`update_agent({ timeoutSec })\`, or set \`type="long-running"\`.
- Infinite loop: re-read the code, look for unbounded iteration.

### "Task already taken"
- Another instance of the same agent checked out the task first. Normal — \`checkoutTask\` is atomic; handle false gracefully (\`continue\`).

### Empty stdout
- Agent may still be running (logs flush every 5s).
- Check stderr for crash-on-import errors.
- Check \`bundleError\` on the agent via \`get_agent\`.

## Diagnosis Process
1. \`get_logs\` → read stderr first.
2. Categorize: auth / timeout / code bug / external API / bundle.
3. For code bugs: inspect stack trace (sourcemaps point to original TS lines).
4. Propose a specific fix — write the corrected code, not generic advice.
5. \`write_agent_code\` with the fix, then \`trigger_agent\` to retest.
`,
    },
    {
      path: 'system/skill-writing.md',
      name: 'Skill Writing Guide',
      description: 'How to create effective skills: format, frontmatter, examples',
      category: 'system',
      content: `---
name: Skill Writing Guide
description: How to write effective agent skills
category: system
---

# Skill Writing Guide

## Format
Skills are markdown documents with YAML frontmatter.

\`\`\`markdown
---
name: Descriptive Name
description: One line explaining what this skill teaches
category: tactics|monitoring|platforms|voice|domain
related: ["other/skill.md"]
---

# Skill Title

Content here. Be specific and actionable.
\`\`\`

## What Makes a Good Skill
- **Specific** — "When replying on Reddit, check subreddit rules first" beats "Follow platform rules".
- **Actionable** — Include exact steps, not vague advice.
- **Scoped** — One skill = one topic. Don't mix unrelated instructions.
- **Examples** — Show good and bad behavior concretely.

## Categories
- \`tactics/\` — How to do specific tasks (writing, summarization)
- \`monitoring/\` — What to watch, where, which signals matter
- \`platforms/\` — Platform-specific rules (Reddit, HN, Twitter)
- \`voice/\` — Brand voice, tone, style
- \`domain/\` — Industry / product knowledge
- \`evaluation/\` — Quality scoring, rubrics

## Path Convention
\`folder/filename.md\` — e.g. \`tactics/comment-writing.md\`, \`platforms/reddit-rules.md\`.

## Skills vs Memory
- **Skills** — static instructions authored by humans. Don't change at runtime.
- **Memory** — dynamic learnings from experience. Evolves.
`,
    },
    {
      path: 'system/platform-rules.md',
      name: 'Platform Rules & Limits',
      description: 'ZooGent capabilities, limitations, security rules',
      category: 'system',
      content: `---
name: Platform Rules & Limits
description: ZooGent capabilities and constraints
category: system
---

# Platform Rules & Limits

## What ZooGent Does
- Spawns agent processes; injects context via environment variables
- Routes tasks between agents (SDK → HTTP API)
- Tracks costs, captures logs
- Manages cron schedules, wake-on-assignment
- Stores memories (decayed, scored), team knowledge, per-agent key-value store
- Bundles TypeScript source with esbuild; enforces the blessed deps set

## What ZooGent Does NOT Do
- NOT an AI itself — each agent calls its own LLM
- NOT a container orchestrator — spawn happens on the same machine as zoogent
- NOT a message queue — tasks are simple DB records

## Agent Runtimes
- \`typescript\` (default): source in DB, esbuild bundle, \`node\` execution. Allowed imports = blessed deps.
- \`exec\`: zoogent spawns an arbitrary command. Code lives outside zoogent. Use for binaries / non-TS.

## Security
- Agent env vars AES-256-GCM encrypted at rest
- Settings and integration credentials encrypted with the same master key
- API key auth for agent SDK → server; session auth for dashboard
- Logs sanitized (API keys stripped from stdout/stderr)
- Unknown imports in typescript source → bundle rejected (supply-chain guard)
- **Agent sandbox**: typescript agents run with Node.js \`--permission\`. Write access limited to
  the team shared folder (\`ZOOGENT_SHARED_DIR\`). No child_process spawning, no native addons.

## Limits
- SQLite, single-writer (WAL helps; high-write contention possible)
- One run per agent at a time (concurrency guard)
- Memory: top memories are injected (scored + decayed), not full history
- Source size: 1 MB per upload
- Store: no enforced size limit (be reasonable)
- Skills: no size limit (but very large skills waste tokens)

## Polyglot agents (exec runtime)
ZooGent's SDK is also an HTTP API — agents in any language can call it directly.
\`runtime="exec"\` lets you spawn Python, Go, Rust, shell, whatever.
Code deployment for exec agents is the user's responsibility (volume mount, git clone, image bake).

MCP code tools (\`write_agent_code\`, \`get_agent_code\`) only work for \`runtime="typescript"\`.
`,
    },
    {
      path: 'system/media-agents.md',
      name: 'Media-Generating Agents',
      description: 'How to build agents that generate images, video, audio, or other files and share them within the team',
      category: 'system',
      content: `---
name: Media-Generating Agents
description: Patterns for agents that generate files (images, video, audio, PDFs) and pass them to other agents
category: system
---

# Media-Generating Agents

Agents that generate images, video, audio, or other binary files have two ways to pass output to other agents: **local shared folder** and **cloud storage**. Pick based on whether the file needs to leave the server.

## Shared Folder (local)

Every team has a shared folder injected via \`ZOOGENT_SHARED_DIR\`. Agents in the same team can write and read files there.

\`\`\`typescript
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const sharedDir = process.env.ZOOGENT_SHARED_DIR!;

// Write a generated file
const outputPath = join(sharedDir, \`image-\${Date.now()}.png\`);
writeFileSync(outputPath, imageBuffer);

// Pass the path to the next agent via Task
await createTask({
  agentId: 'publisher-agent',
  title: 'Publish image',
  payload: JSON.stringify({ filePath: outputPath }),
});
\`\`\`

The receiving agent reads the file from the same path:

\`\`\`typescript
const { filePath } = JSON.parse(task.payload);
const imageBuffer = readFileSync(filePath);
\`\`\`

**When to use**: file stays on the server (resize, watermark, embed in PDF, upload to a service that has server-to-server access). Simpler, no external dependencies, zero latency.

> The shared folder is inside \`data/teams/{teamId}/shared/\` which is persisted by the same Docker volume as the rest of \`data/\`. Files survive server restarts. Clean up old files explicitly to avoid disk bloat.

## Cloud Storage

Upload the file to S3, Cloudinary, GCS, or similar, then pass the URL via Task or Store.

\`\`\`typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'; // not blessed — use axios + presigned URL or exec runtime
// OR use axios to call your cloud API directly

// Example: Cloudinary upload via axios
import axios from 'axios';
import FormData from 'form-data'; // not blessed; use native fetch + FormData instead
import { readFileSync } from 'node:fs';

const form = new FormData();
form.append('file', readFileSync(filePath));
form.append('upload_preset', process.env.CLOUDINARY_UPLOAD_PRESET!);

const res = await axios.post(
  \`https://api.cloudinary.com/v1_1/\${process.env.CLOUDINARY_CLOUD_NAME}/image/upload\`,
  form,
  { headers: form.getHeaders() }
);
const url = res.data.secure_url;

// Pass the URL
await createTask({
  agentId: 'publisher-agent',
  title: 'Post image',
  payload: JSON.stringify({ imageUrl: url }),
});
\`\`\`

**When to use**: file needs to be served publicly, embedded in emails, or accessed by external services. Requires cloud credentials (set via Integration).

## Decision Guide

| Situation | Use |
|-----------|-----|
| File processed by another agent on same server | Local shared folder |
| File embedded in email or sent to webhook | Cloud (get public URL) |
| File served to end users | Cloud |
| Temporary intermediate output | Local shared folder |
| File needs long-term retention | Cloud |

## Naming Files

Always include a unique suffix to avoid collisions between concurrent runs:

\`\`\`typescript
import { join } from 'node:path';
const sharedDir = process.env.ZOOGENT_SHARED_DIR!;
const filename = \`report-\${Date.now()}-\${Math.random().toString(36).slice(2)}.pdf\`;
const path = join(sharedDir, filename);
\`\`\`

## Cleanup

Files in the shared folder are not automatically deleted. If your agents generate many files, add a cleanup step:

\`\`\`typescript
import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const sharedDir = process.env.ZOOGENT_SHARED_DIR!;
const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours
const now = Date.now();

for (const file of readdirSync(sharedDir)) {
  const filePath = join(sharedDir, file);
  const { mtimeMs } = statSync(filePath);
  if (now - mtimeMs > maxAgeMs) unlinkSync(filePath);
}
\`\`\`
`,
    },
  ];

  let seeded = 0;
  for (const skill of skills) {
    const contentHash = createHash('sha256').update(skill.content).digest('hex').slice(0, 16);
    db.insert(systemSkillsTable)
      .values({
        path: skill.path,
        name: skill.name,
        description: skill.description,
        category: skill.category,
        content: skill.content,
        contentHash,
      })
      .onConflictDoUpdate({
        target: systemSkillsTable.path,
        set: {
          name: skill.name,
          description: skill.description,
          content: skill.content,
          contentHash,
          updatedAt: new Date(),
        },
      })
      .run();
    seeded++;
  }

  if (seeded > 0) {
    console.log(`[seed] Seeded ${seeded} system skills`);
  }
}
