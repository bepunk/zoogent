import { getDb } from './index.js';
import { systemSkills as systemSkillsTable } from './schema.js';
import { createHash } from 'node:crypto';

/**
 * Seed system skills for the Architect AI.
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

Ask the user these questions:

1. **Business result** — What is the desired outcome? (e.g., "invoices processed automatically", "customer requests handled within 1 hour")
2. **Manual steps** — How is this done manually today? List each step in order.
3. **Intelligence vs mechanics** — For each step: does it need LLM reasoning, or is it a mechanical API call / data transform?
4. **Human decisions** — Where is human judgment essential? (approval, exceptions, quality review)
5. **Data flow** — What data is needed at each step? Where does it come from?

Output: a list of jobs (steps) with their type (LLM / mechanical / human).

## Phase 2: ROLES — Who does what

For each job or group of jobs, define an agent:

1. **Skills needed** — What knowledge does the agent need? (domain rules, tone, formats)
2. **Grouping** — Can multiple jobs be handled by one agent, or does each need a specialist?
3. **Tools/APIs** — What external services does each agent call? (email API, database, Telegram, etc.)
4. **Success criteria** — How do you know the agent did its job well? (accuracy, speed, user satisfaction)
5. **Constraints** — Approval requirements, scope limits, error handling rules, budget caps.

### Learning strategy (critical)
For each agent, decide:
- **Personal learning** — Does this agent learn from its own experience? → use \`reportMemory()\`
  Example: "Articles with data points get 3x more engagement" — personal insight
- **Team sharing** — Does this agent discover facts useful for the whole team? → use \`reportTeamKnowledge()\`
  Example: "API rate limit is 100 req/hour" — everyone needs to know
- **Working data** — Does this agent track state between runs? → use \`storeGet/storeSet\`
  Example: list of processed invoice IDs, URLs already checked
- **Moderation** — Should team knowledge be auto-approved (\`ZOOGENT_AUTO_APPROVE_KNOWLEDGE=true\`) or require human review? Default: human review.

Output: a list of agents with id, name, goal, model, type, skills, and learning strategy.

## Phase 3: FLOWS — How agents connect

1. **Sequence** — Which agents run in order? (Pipeline: A → B → C)
2. **Parallel** — Which can run simultaneously? (Fan-out: A → B + C)
3. **Data dependencies** — What does each agent pass to the next? (task payload format)
4. **Routing decisions** — Where does the flow branch? (e.g., classifier routes to different specialists)
5. **Error handling** — What happens when an agent fails? (retry, fallback, human escalation)
6. **Coordinator** — For 3+ worker agents, consider adding a coordinator that sees the full picture, prevents duplicate work, and manages priorities.

Output: a flow diagram (agents + connections + data passed between them).

## Principles

- **Start small** — Begin with 1-2 agents. Get the core working before adding complexity.
- **Match model to task** — Haiku for simple classification/filtering, Sonnet for reasoning and writing.
- **One goal per agent** — If an agent's goal needs "and", split it into two agents.
- **Skills over code** — Put domain rules in skills (markdown), not hardcoded in agent logic. Skills are easier to iterate.

## Team Patterns

- **Pipeline**: A → B → C (each agent processes and passes forward)
- **Fan-out**: A → B, A → C (one distributes work to many)
- **Generator-Critic**: A generates, B reviews, loop until quality threshold met
- **Coordinator + Workers**: Coordinator routes incoming work, workers specialize

## After Design

Once JRF is complete:
1. Create skills for each agent (create_skill)
2. Create agents (create_agent) with goals, models, schedules
3. Assign skills to agents (assign_skill)
4. Write agent code (write_agent_code)
5. Test each agent (trigger_agent + get_logs)
6. Iterate based on results
`,
    },
    {
      path: 'system/agent-patterns.md',
      name: 'Agent Patterns',
      description: 'Types of agents, when to use each, coordinator pattern',
      category: 'system',
      content: `---
name: Agent Patterns
description: Types of agents and common team patterns
category: system
---

# Agent Patterns

## Agent Types

### Cron Agent
- Runs on a schedule (e.g., every 2 hours, daily at 9am)
- Good for: monitoring, periodic checks, batch processing
- cronSchedule: standard cron expression
- Timeout applies (default 600s)

### Manual Agent
- Triggered by human or another agent (via task assignment)
- Good for: on-demand processing, reactive workflows
- wakeOnAssignment: true makes it auto-start when a task arrives

### Long-Running Agent
- Persistent process (e.g., Telegram bot, webhook listener)
- No timeout by default
- Auto-restarts if server restarts (if it was running when server stopped)

## Team Patterns

### Pipeline (A → B → C)
Sequential processing. Each agent does one step and passes to the next.
Example: Monitor finds article → Writer summarizes → Editor reviews

### Fan-Out (A → B, A → C)
One agent distributes work to multiple specialists.
Example: Classifier routes tickets to billing/technical/general responders

### Generator-Critic
One agent creates, another evaluates. Loop until approved.
Example: Writer drafts → Critic scores → Writer revises (if score < 80)

### Coordinator (3+ agents)
A coordinator agent sees the full picture and routes work.
- Reads all agent statuses and pending tasks
- Decides priorities
- Prevents duplicate work
- Model: use a smart model (sonnet) for the coordinator, cheaper models for workers

## Feedback Collector Pattern
A cron agent that monitors outcomes and creates learning tasks:
- Runs daily/weekly
- Checks if user corrected agent decisions
- Reports patterns as team knowledge
- Creates feedback tasks for the relevant agent
- Uses cheap model (haiku — just comparing data)

## When to Add a Coordinator
Add when: 3+ worker agents, risk of duplicate work, priorities matter.
Skip when: 1-2 agents, simple pipeline, no routing decisions.
`,
    },
    {
      path: 'system/code-generation.md',
      name: 'Agent Code Generation',
      description: 'How to write agent scripts: SDK, imports, structure, patterns',
      category: 'system',
      content: `---
name: Agent Code Generation
description: How to write agent code using the ZooGent SDK
category: system
---

# Agent Code Generation

## Basic Structure (TypeScript)

\`\`\`typescript
import { getMyTasks, checkoutTask, completeTask, reportCost, reportMemory,
         getGoal, getMemories, getSkills, getTeamKnowledge, createTask,
         storeGet, storeSet, loadSkill } from 'zoogent/client';

const goal = getGoal();
const skills = getSkills();
const memories = getMemories();
const teamKnowledge = getTeamKnowledge();

async function main() {
  const tasks = await getMyTasks();

  for (const task of tasks) {
    const locked = await checkoutTask(task.id);
    if (!locked) continue;

    try {
      const payload = task.payload ? JSON.parse(task.payload) : {};
      // ... process task ...
      await completeTask(task.id, JSON.stringify({ status: 'done' }));
    } catch (err) {
      await completeTask(task.id, JSON.stringify({ error: String(err) }));
    }
  }
}

main().catch(console.error);
\`\`\`

## Key SDK Functions

### Context (read at startup)
- \`getGoal()\` — agent's mission (env var)
- \`getSkills()\` — required skills content (env var, auto-loaded)
- \`getMemories()\` — past learnings array (env var, scored and decayed)
- \`getTeamKnowledge()\` — shared team facts (env var)

### Tasks (inter-agent messaging)
- \`getMyTasks(status?)\` — get pending tasks for this agent
- \`checkoutTask(id)\` — atomic lock (returns false if taken)
- \`completeTask(id, result?)\` — mark done
- \`failTask(id, result?)\` — mark failed
- \`createTask({ agentId, title, payload })\` — send task to another agent

### Reporting
- \`reportCost({ model, inputTokens, outputTokens, costCents })\` — track AI costs
- \`reportMemory({ content, importance?, tags? })\` — save a learning
- \`reportTeamKnowledge({ title, content })\` — propose shared knowledge

### Store (persistent working data)
- \`storeGet(key)\` → value or null
- \`storeSet(key, value, ttlSeconds?)\` — save data between runs
- \`storeDelete(key)\`, \`storeKeys(prefix?)\`

### Cost Estimation
For Anthropic models:
- Haiku: $0.25/M input, $1.25/M output
- Sonnet: $3/M input, $15/M output
- Opus: $15/M input, $75/M output

\`\`\`typescript
function estimateCost(model: string, usage: { input_tokens: number; output_tokens: number }): number {
  const rates: Record<string, [number, number]> = {
    'claude-haiku-4-5-20251001': [0.25, 1.25],
    'claude-sonnet-4-6': [3, 15],
    'claude-opus-4-6': [15, 75],
  };
  const [inputRate, outputRate] = rates[model] || [3, 15];
  return Math.ceil(((usage.input_tokens / 1e6) * inputRate + (usage.output_tokens / 1e6) * outputRate) * 100);
}
\`\`\`

## Rules
- All SDK calls are fail-open (errors caught, agent keeps running)
- Agent scripts run as child processes with injected env vars
- Command: \`node --experimental-strip-types agents/{id}.ts\`
- Logs captured (stdout/stderr), stored in DB
- One run at a time per agent (concurrent guard)
- ANTHROPIC_API_KEY is auto-injected from Settings into agent env (no need to set per-agent)
- \`zoogent/client\` is available via node_modules (installed during init)
- \`@anthropic-ai/sdk\` is also available — use \`import Anthropic from '@anthropic-ai/sdk'\`
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
- Use get_logs(agentId) to see latest run stdout/stderr
- Logs are streamed every 5 seconds while agent runs
- Logs are sanitized (API keys stripped)

## Common Errors

### "Could not resolve authentication method"
Agent's LLM SDK can't find API key. Check:
- ANTHROPIC_API_KEY in server env (process.env inherited by agents)
- Or agent's own encrypted env vars (update_agent with env field)

### Agent times out (600s default)
- Long tasks: increase timeoutSec via update_agent
- Long-running agents: set type to 'long-running' (no timeout)
- Infinite loops: check agent code for unbounded iterations

### "Task not available (already taken)"
Another instance of the same agent checked out the task first.
Normal — checkoutTask is atomic, handle false return gracefully.

### Agent over budget
Monthly cost exceeded budgetMonthlyCents. Options:
- Increase budget via update_agent
- Use cheaper model
- Reduce run frequency

### Empty stdout
- Agent may still be running (logs flush every 5s)
- Check stderr for errors
- Agent might exit before printing (crash on import)

## Diagnosis Process
1. Read the error from get_logs (stderr first)
2. Identify the category (auth, timeout, code bug, external API)
3. For code bugs: look at the stack trace, identify the file and line
4. Suggest a specific fix (not generic advice)
5. If the fix requires code changes, write the corrected code
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
- **Specific**: "When replying on Reddit, always check the subreddit rules first"
- **Actionable**: Include exact steps, not vague advice
- **Scoped**: One skill = one topic. Don't mix unrelated instructions.
- **Examples**: Include concrete examples of good and bad behavior

## Skill Categories
- **tactics/**: How to do specific tasks (comment writing, summarization)
- **monitoring/**: What to watch, where to look, what signals matter
- **platforms/**: Platform-specific rules and conventions (Reddit, HN, Twitter)
- **voice/**: Brand voice, tone, style guidelines
- **domain/**: Domain knowledge (product features, industry terms)
- **evaluation/**: How to assess quality, scoring rubrics

## Path Convention
Use folder/filename.md format: \`tactics/comment-writing.md\`, \`platforms/reddit-rules.md\`

## Memory vs Skills
- Skills: static instructions from humans (what to do)
- Memory: dynamic learnings from experience (what worked)
- Skills don't change at runtime. Memory evolves.
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
- Spawns agent scripts as child processes
- Injects context via environment variables
- Routes tasks between agents
- Tracks costs, captures logs
- Manages cron schedules
- Stores memories, team knowledge, agent data

## What ZooGent Does NOT Do
- NOT an AI itself — each agent calls its own LLM
- NOT a container orchestrator — runs processes on the same machine
- NOT a message queue — tasks are simple DB records
- NOT a monitoring system — the dashboard is basic, for overview only

## Security
- Agent env vars encrypted with AES-256-GCM at rest
- API key auth for agent communication
- Session auth for dashboard
- Logs sanitized (API keys stripped from stdout/stderr)
- Path traversal protection on skill paths

## Limits
- SQLite: single-writer (WAL mode helps, but high-write contention possible)
- One run per agent at a time (concurrent guard)
- Memory: top memories injected (scored, decayed), not full history
- Store: no size limit enforced (be reasonable)
- Skills: no size limit (but very large skills waste tokens)

## Agent Independence
Agents are independent scripts. They can be written in any language.
TypeScript agents use the SDK (zoogent/client). Other languages use HTTP API directly.
Each agent manages its own LLM calls, error handling, and logic.
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
