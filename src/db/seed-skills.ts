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
- \`axios\` (alternative: native \`fetch\`)
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

**Node built-ins** — all available (\`fs\`, \`fs/promises\`, \`crypto\`, \`http(s)\`, \`path\`, \`child_process\`, \`stream\`, \`url\`, \`zlib\`, etc.)

If you need a lib outside this list, tell the user — it requires a zoogent version bump.

## Environment Variables (auto-injected on spawn)

- \`ZOOGENT_API_URL\` — API endpoint for SDK HTTP calls
- \`ZOOGENT_API_KEY\` — auth token for SDK
- \`ZOOGENT_AGENT_ID\` — this agent's ID
- \`ZOOGENT_AGENT_GOAL\` — the agent's mission string
- \`ZOOGENT_AGENT_MODEL\` — configured AI model name
- \`ZOOGENT_RUN_ID\` — current run ID
- \`ZOOGENT_TEAM_ID\` — team ID
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
- \`storeGet(key)\`, \`storeSet(key, value, ttlSeconds?)\`
- \`storeDelete(key)\`, \`storeKeys(prefix?)\`

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
- **Filesystem outside \`/tmp\`** — agents should not write project files. Use the Store for state.
- **Long-running HTTP servers inside a manual/cron agent** — use \`type="long-running"\` for that.
- **Synchronous waits > timeoutSec** — agent is killed. Either shorten the work or set \`type="long-running"\`.
- **Relative imports from the agent file** — zoogent stores a single source string, not a folder. Put all code in one file or factor into skills (markdown) or helper utilities that can be bundled from blessed deps.

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
- NOT a sandbox — agents run with the same filesystem/network permissions as zoogent

## Agent Runtimes
- \`typescript\` (default): source in DB, esbuild bundle, \`node\` execution. Allowed imports = blessed deps.
- \`exec\`: zoogent spawns an arbitrary command. Code lives outside zoogent. Use for binaries / non-TS.

## Security
- Agent env vars AES-256-GCM encrypted at rest
- Settings and integration credentials encrypted with the same master key
- API key auth for agent SDK → server; session auth for dashboard
- Logs sanitized (API keys stripped from stdout/stderr)
- Unknown imports in typescript source → bundle rejected (supply-chain guard)

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
