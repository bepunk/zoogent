import { Hono } from 'hono';

export const apiLlmsRoutes = new Hono();

// GET /llms.txt - Overview + Discovery Flow
apiLlmsRoutes.get('/llms.txt', (c) => {
  c.header('Content-Type', 'text/plain');
  return c.text(`# ZooGent - AI Agent Orchestrator with Architect AI

ZooGent is a process manager for AI agent teams with a built-in Architect AI.
It supports multiple teams in one instance — each team has its own agents, skills,
memory, knowledge, and Architect chat. Describe what you want to automate in the
team's chat UI — the Architect designs the team, creates skills, writes agent code,
and manages everything.

Two ways to use: Chat UI (main) or Claude Code + MCP (dev path).
Open source. MIT license. npm package: zoogent.

## Your Role as AI Assistant

You are a TEAM ARCHITECT. Your job is to help users BUILD agent teams:
design agents, create skills, write agent code, test, and deploy.

Do NOT create dashboards, monitoring views, or status displays.
ZooGent has a web UI at localhost:3200 for monitoring and an Architect chat per team.
Focus on BUILDING: creating agents, writing skills, writing code, testing, deploying.

## Quick Start

1. npx zoogent create my-agents && cd my-agents
   Creates project directory, installs dependencies, sets up database.

2. npx zoogent start
   Starts the server on http://localhost:3200 (dashboard + API).
   First visit: create owner account at /setup.
   Then: create a team at /teams.
   Then: go to /teams/:slug/chat to talk to the Architect for that team.
   Then: go to team settings to add your Anthropic API key (per-team setting).

3. MCP integration (for Claude Code, optional):
   Add to .mcp.json:
   {
     "mcpServers": {
       "zoogent": {
         "command": "npx",
         "args": ["zoogent", "mcp"]
       }
     }
   }
   When connecting via MCP, you work with a specific team by passing teamId.

## Full Lifecycle: Install → Develop → Deploy → Configure

### Phase 1: Install
  npx zoogent create my-agents   # creates dir, package.json, npm install, init
  cd my-agents
  npx zoogent start              # starts server at http://localhost:3200
  Visit /setup to create owner account.
  Create a team at /teams.
  Add your Anthropic API key in the team's settings (per-team).

### Phase 2: Develop (local)
  Add MCP to Claude Code. Create .mcp.json in your project root:
  {
    "mcpServers": {
      "zoogent": {
        "command": "npx",
        "args": ["zoogent", "mcp"]
      }
    }
  }
  Restart Claude Code. Now Claude has ZooGent tools (create_agent, create_skill, etc.).
  MCP requires a teamId to scope all operations to a specific team.

  Workflow:
  1. Design agents (create_agent, scaffold_agent)
  2. Write skills (create_skill) — stored in DB, scoped to the team
  3. Write agent code (agents/*.ts)
  4. Test (trigger_agent + get_logs)
  5. Iterate until agents work correctly

### Phase 3: Prepare for deploy
  Initialize git repo: git init && git add . && git push
  Create Dockerfile and docker-compose.yml (see "Deployment - Docker" section below).

  CRITICAL: ALL env vars must be in docker-compose.yml using \${VAR} syntax.
  The hosting platform injects actual values at runtime.

  Required env vars:
  - BETTER_AUTH_SECRET — auth session secret (openssl rand -hex 32)
  - BETTER_AUTH_URL — public URL (https://your-domain.com)

  After deploy:
  1. Create account, log in
  2. Go to Settings → generate ZooGent API key (for MCP/agent connections)
  3. Create a team, go to Team Settings → add Anthropic API key
  4. Agent integrations (Gmail, Telegram, etc.) are managed per-agent in the UI

### Phase 4: Deploy
  Push to hosting platform (Dokploy, Railway, etc.).
  Set all env vars in the platform's environment settings.
  Verify: https://your-domain.com/llms.txt should respond.
  Create owner account at https://your-domain.com/setup.

### Phase 5: Configure remote server
  Update .mcp.json to connect MCP to the remote server:
  {
    "mcpServers": {
      "zoogent": {
        "command": "npx",
        "args": ["zoogent", "mcp"],
        "env": {
          "ZOOGENT_URL": "https://your-domain.com",
          "ZOOGENT_API_KEY": "zg_your_key_here"
        }
      }
    }
  }
  Restart Claude Code. MCP now talks to the remote server.
  MCP operations are scoped to a team via teamId.

  Register agents: use create_agent for each agent, then assign skills.
  Skills are stored in the DB, scoped to the team.
  Test with trigger_agent + get_logs.

  To switch back to local: remove the env block from .mcp.json and restart.

  You can have both local and remote MCP servers:
  {
    "mcpServers": {
      "zoogent-local": { "command": "npx", "args": ["zoogent", "mcp"] },
      "zoogent-prod": {
        "command": "npx", "args": ["zoogent", "mcp"],
        "env": { "ZOOGENT_URL": "https://...", "ZOOGENT_API_KEY": "zg_..." }
      }
    }
  }

### Phase 6: Operate
  - Monitor agents via web dashboard (https://your-domain.com/teams/:slug)
  - Push code changes → auto-redeploy updates agent code
  - Agent configs (DB records) persist in Docker volume — not affected by redeploy
  - Use remote MCP to adjust agents, view logs, manage team knowledge

## Key Concepts

- Teams: Isolated workspaces within one ZooGent instance. Each team has its own agents,
  skills, memory, knowledge, Architect chat, and settings (including API keys).
  Web UI at /teams/:slug. API at /api/teams/:teamId/...

- Agents: Processes (cron, long-running, or manual) with a goal, model, skills, and budget.
  ZooGent spawns them, injects context via env vars, captures logs, tracks costs.
  Scoped to a team.

- Skills: Markdown documents with instructions and knowledge. Assigned to agents.
  Stored in DB, scoped to a team. Injected as ZOOGENT_AGENT_SKILLS env var at runtime.

- System Skills: Global read-only skills stored in system_skills table.
  Used internally by Architect AI. Not editable by users. Accessible at /api/system-skills.

- Memory: What agents learn from experience. Each agent writes its own memories
  (insights, patterns, learnings - not action logs). FTS5 searchable.
  Injected as ZOOGENT_MEMORIES env var (JSON array, ranked by importance).

- Tasks: Inter-agent communication. Agents create tasks for other agents.
  Supports atomic checkout (no double-processing) and consensus evaluation.

- Consensus: Multiple agents evaluate the same task independently.
  Strategies: majority, unanimous, average_score.

- Team Knowledge: Shared insights proposed by agents, moderated by humans (or auto-approved).
  Injected as ZOOGENT_TEAM_KNOWLEDGE env var to all agents in the team.

- Cost Tracking: Per-agent, per-model spending with monthly budgets and hard stops.
  Agent is blocked from running if it exceeds its budget.

## Architecture

ZooGent never calls any LLM. It is purely a process manager.

Each agent:
1. Is a script (TypeScript, Python, bash, anything)
2. Receives context via env vars (goal, model, memories, skills, team knowledge, API key)
3. Calls its own LLM with its own API key
4. Reports back to ZooGent (cost, memory, task results) via HTTP API
5. Communicates with other agents through the task broker

## Discovery Flow - How to Help Users Design Agent Teams

When a user wants to build an agent team, follow this process:

### 1. UNDERSTAND
Ask about the task. What is the workflow? What are the inputs and outputs?
What decisions need to be made? Where does human review fit in?
Do not assume patterns - listen first.

Also ask: "Will you deploy this to a server, or run locally only?"
This affects how you set up env vars, API keys, and Docker configuration.
If deploying - plan for it from the start, not as an afterthought.

### 2. START SMALL
ZooGent follows a "Fail Small" philosophy: start with the minimum team that solves the task.

A learning team needs at least:
- 1+ worker agents (do the actual work)
- 1 feedback collector (monitors outcomes, reports back to workers)
- 1 coordinator agent (if 3+ workers or multiple input channels)

So the minimum is usually 2-3 agents.
ZooGent is the infrastructure orchestrator - it schedules, routes tasks, injects context.
For teams of 3+ workers, add a coordinator agent (team lead) that makes decisions:
which worker handles what, deduplication, prioritization, escalation.
The coordinator is a regular agent with its own LLM - not a ZooGent feature.

### 3. DESIGN AGENTS
For each agent, define:
- role: What it does (e.g., "monitors RSS feeds for new articles")
- goal: Its permanent mission statement
- model: Which LLM it uses (e.g., "claude-sonnet-4-6", "gpt-4o")
- skills: Which skill files it needs (knowledge, tactics, rules)
- type: "cron" (scheduled), "manual" (on-demand), or "long-running" (persistent)
- connections: Which agents it sends tasks to

### 4. CHOOSE PATTERN
Common multi-agent patterns:

Pipeline: A -> B -> C (each agent processes and passes forward)
  Example: monitor -> summarizer -> publisher

Fan-out: A -> [B, C, D] (one agent distributes work to many)
  Example: classifier -> [handler-billing, handler-support, handler-sales]

Generator-Critic: A <-> B (one creates, one evaluates, iterates)
  Example: writer -> reviewer (reviewer sends revision tasks back)

Orchestrator-Worker: A -> [B, C] -> A (coordinator dispatches and collects)
  Example: planner -> [researcher, analyst] -> planner (compiles results)
  The orchestrator here is an AGENT (with its own LLM), not ZooGent itself.
  ZooGent handles infrastructure (scheduling, task routing, env injection).
  The orchestrator agent handles decisions (who does what, priorities, dedup).

For teams of 3+ workers, consider adding a coordinator agent (team lead).
It receives all incoming work, analyzes context, assigns to the right worker,
prevents duplicates, and escalates complex cases to humans.
Example: mail-reader and whatsapp-reader both send messages to coordinator.
Coordinator detects same client writing in both channels, decides where to reply.

### 5. PLAN FEEDBACK
Ask: "How will we know if the agents are doing a good job?"

If user actions can be monitored (email moved back, edit undone, ticket reopened):
-> Add a feedback collector agent (cron, cheap model, monitors outcomes)
-> It detects user corrections and reports them back to the working agents via tasks

If the agent has access to metrics (views, clicks, conversion rates):
-> Build self-learning into the agent (analyze own metrics, write memory)

If neither is possible:
-> Use generator-critic pattern (one agent checks another's output)

### 6. CREATE
Use MCP tools in this order (all operations scoped to a team via teamId):
1. create_skill - write the knowledge/instructions each agent needs
2. scaffold_agent - generate boilerplate script + register the agent
3. assign_skill - connect skills to agents
4. update_agent - set goal, model, cronSchedule, budget, env vars
5. If feedback collector needed - scaffold it too with evaluation skills

### 7. TEST LOCALLY
1. trigger_agent - run each agent manually
2. get_logs - check stdout/stderr
3. Iterate: update skills, adjust goals, re-trigger
4. Verify the full chain works (first agent creates tasks, next agent picks them up)

### 8. DEPLOY (if user wants a server)
If the user said they want to deploy:
1. Help write docker-compose.yml
2. Help set up Dokploy or direct Docker deployment
3. Configure API keys in team settings (ANTHROPIC_API_KEY is per-team)
4. Verify the team works on the server
Agents learn in production - memory, team knowledge, and feedback collection
happen on the running server, not locally.

### 9. MONITOR & IMPROVE
After deployment, the team improves over time:
- Feedback collector detects user corrections -> agents update their memory
- Agents propose team knowledge from patterns they notice
- Human reviews team knowledge in the dashboard (weekly or as needed)
- Skills can be updated via MCP when strategy changes

## Full Documentation

GET /llms-full.txt        - Complete API reference (all endpoints, MCP tools, env vars)
GET /llms-agent-guide.txt - How to write agents (TypeScript, Python, any language)
`);
});

// GET /llms-full.txt - Complete API Reference
apiLlmsRoutes.get('/llms-full.txt', (c) => {
  c.header('Content-Type', 'text/plain');
  return c.text(`# ZooGent API Reference

## Authentication

Dashboard routes: session cookie (Better Auth, email+password)
Agent routes: Bearer token (ZOOGENT_API_KEY)
  Header: Authorization: Bearer <ZOOGENT_API_KEY>

## Teams

All agent, skill, task, memory, chat, cost, and knowledge routes are scoped to a team.
API paths use /api/teams/:teamId/... for team-scoped operations.

### Teams API (Session cookie)

GET    /api/teams              - List all teams
POST   /api/teams              - Create a team
  Body: { name, slug?, description? }

## Agent Reporting API (Bearer token)

These routes are unchanged — agents use them to report back to ZooGent.

POST /api/report/cost
  Body: { agentId, runId?, model, inputTokens, outputTokens, costCents, provider? }
  Reports token usage and cost for a single LLM call.

POST /api/report/heartbeat
  Body: { agentId }
  Long-running agents call this periodically to signal they are alive.

POST /api/report/memory
  Body: { agentId, content, importance?, tags?, runId?, taskId? }
  Agent writes a memory entry (insight, pattern, learning).
  importance: 1-10 (default 5). tags: string array for filtering.

POST /api/report/knowledge
  Body: { agentId, title, content }
  Agent proposes team knowledge. Status is "draft" (needs human approval)
  unless ZOOGENT_AUTO_APPROVE_KNOWLEDGE=true, then auto-approved as "active".

GET /api/report/skill/:path
  Returns skill content as plain text (frontmatter stripped).
  For non-TypeScript agents that cannot use the SDK's loadSkill().

## Agent Store API (Bearer token)

POST /api/report/store
  Agent-side store operations (storeGet, storeSet, storeDelete, storeKeys).

## Task Broker API (Bearer token)

POST /api/tasks
  Body: { agentId, createdByAgentId?, title, payload?, consensus?, consensusAgents?, consensusStrategy? }
  Creates a task for the target agent. If target has wakeOnAssignment=true, it starts automatically.
  consensus: if true, task requires multi-agent evaluation.
  consensusStrategy: "majority" | "unanimous" | "average_score"

GET /api/tasks?agentId=X&status=pending
  List tasks for an agent, filtered by status.

POST /api/tasks/:id/checkout
  Atomic lock - returns the task if available, 409 if already taken.
  Prevents double-processing when multiple instances run.

PATCH /api/tasks/:id
  Body: { status, result? }
  Update task status. status: "done" | "failed". result: JSON string.

POST /api/tasks/:id/evaluate
  Body: { agentId, verdict: "approve"|"reject"|"revise", score?, reasoning? }
  Submit a consensus evaluation for a task.

## Team-Scoped Dashboard API (Session cookie)

All dashboard routes are now scoped to a team via /api/teams/:teamId/...

### Agents

GET    /api/teams/:teamId/agents              - List all agents in team with status, last run, monthly cost
GET    /api/teams/:teamId/agents/:id          - Agent details + runs + skills + model + goal
POST   /api/teams/:teamId/agents              - Create agent
  Body: { id, name, command, args?, type?, model?, goal?, cronSchedule?, env?, budgetMonthlyCents?, wakeOnAssignment? }
PATCH  /api/teams/:teamId/agents/:id          - Update agent (any field including model, goal, env)
DELETE /api/teams/:teamId/agents/:id          - Delete agent
POST   /api/teams/:teamId/agents/:id/trigger  - Manual run
POST   /api/teams/:teamId/agents/:id/enable   - Enable agent (reschedules cron)
POST   /api/teams/:teamId/agents/:id/disable  - Disable agent (stops if running, unschedules)
GET    /api/teams/:teamId/agents/:id/runs     - Run history
GET    /api/teams/:teamId/agents/:id/runs/:runId - Run details + stdout/stderr logs

### Agent Store (Dashboard/MCP side)

GET    /api/teams/:teamId/agents/:id/store     - List store entries for agent
GET    /api/teams/:teamId/agents/:id/store/:key - Get store value
PUT    /api/teams/:teamId/agents/:id/store/:key - Set store value
DELETE /api/teams/:teamId/agents/:id/store/:key - Delete store entry

### Skills

GET    /api/teams/:teamId/skills              - List all skills in team with metadata
GET    /api/teams/:teamId/skills/:path        - Skill content + metadata + which agents use it
POST   /api/teams/:teamId/skills              - Create skill
PUT    /api/teams/:teamId/skills/:path        - Update skill content
DELETE /api/teams/:teamId/skills/:path        - Delete skill

### System Skills (global, read-only)

GET    /api/system-skills                     - List all system skills (used by Architect AI)
GET    /api/system-skills/:path               - Get system skill content

System skills are stored in a separate system_skills table.
They are global (not team-scoped), read-only, and used internally by Architect AI.

### Memory

GET    /api/teams/:teamId/memory?agentId=X&search=query - Search memories (FTS5 full-text search)
POST   /api/teams/:teamId/memory              - Add memory manually
PATCH  /api/teams/:teamId/memory/:id          - Update memory (content, importance, active)
DELETE /api/teams/:teamId/memory/:id          - Delete memory

### Tasks

GET    /api/teams/:teamId/tasks?agentId=X&status=pending - List tasks
POST   /api/teams/:teamId/tasks               - Create task
GET    /api/teams/:teamId/tasks/:id           - Get task details

### Chat (Architect AI)

POST   /api/teams/:teamId/chat               - Send message to Architect (SSE streaming)
GET    /api/teams/:teamId/chat                - Get chat history for team
DELETE /api/teams/:teamId/chat                - Clear chat history for team

### Costs

GET    /api/teams/:teamId/costs?agentId=X&days=30 - Cost summary by agent and model

### Team Knowledge

GET    /api/teams/:teamId/knowledge           - List team knowledge entries
POST   /api/teams/:teamId/knowledge/:id/approve - Approve a draft entry
POST   /api/teams/:teamId/knowledge/:id/archive - Archive an entry

## MCP Tools (29 total)

When connecting via MCP, you work with a specific team by passing teamId.
All team-scoped tools require a teamId parameter.

### Onboarding (1)
- get_started: Check ZooGent status and guide through setup or team building. Call this first.

### Agent Management (9)
- list_agents: List all agents in a team with status, last run, monthly cost (teamId)
- get_agent: Get agent details including runs, skills, memories (teamId, agentId)
- create_agent: Register a new agent (teamId, id, name, command, args, type, model, goal, cronSchedule, env, budget, wakeOnAssignment)
- update_agent: Update agent configuration (teamId, agentId, any field)
- delete_agent: Remove an agent (teamId, agentId)
- enable_agent: Enable and reschedule (teamId, agentId)
- disable_agent: Disable and stop (teamId, agentId)
- trigger_agent: Manually trigger a run (teamId, agentId)
- get_logs: Get stdout/stderr for a run (teamId, agentId, latest or specific runId)

### Scaffolding (1)
- scaffold_agent: Generate boilerplate script + register agent + assign skills
  Params: teamId, id, name, description?, skills?, outputDir?

### Skills (6)
- list_skills: List all skills in a team with metadata (teamId)
- get_skill: Get skill content and metadata (teamId, path)
- create_skill: Create a new skill (teamId, path, name, description, content, category?, related?)
- update_skill: Update skill content (teamId, path, content)
- assign_skill: Assign a skill to an agent (teamId, agentId, skillPath)
- unassign_skill: Remove a skill from an agent (teamId, agentId, skillPath)

### Memory (4)
- get_memories: Get agent memories with optional tag filter or FTS search (teamId, agentId, limit?, tags?, search?)
- add_memory: Add a memory entry (teamId, agentId, content, importance?, tags?)
- update_memory: Update a memory (teamId, id, content?, importance?, active?)
- delete_memory: Delete a memory (teamId, id)

### Tasks (3)
- create_task: Create a task for an agent (teamId, agentId, title, payload?, consensus?, consensusAgents?, consensusStrategy?)
- list_tasks: List tasks with optional filters (teamId, agentId?, status?)
- get_task: Get task details including evaluations (teamId, id)

### Costs (2)
- get_costs: Cost summary by agent and model (teamId, days?, agentId?)
- get_budget_status: Spending vs budget for all agents in a team (teamId)

### Team Knowledge (3)
- list_team_knowledge: List team knowledge entries (teamId, status?: "draft"|"active"|"archived")
- approve_knowledge: Approve a draft entry (teamId, id)
- archive_knowledge: Archive an entry (teamId, id)

## Environment Variables - Server

DATABASE_URL            - SQLite file path (default: ./data/zoogent.db)
PORT                    - Server port (default: 3200)
BETTER_AUTH_SECRET      - Auth session secret (auto-generated on first run)
BETTER_AUTH_URL         - Public URL for auth (required for remote deployment, e.g. https://your-domain.com)
ZOOGENT_API_KEY         - API key for agent communication (generate in Settings UI)
DATA_DIR                - Data directory root (default: ./data)
ZOOGENT_AUTO_APPROVE_KNOWLEDGE - If "true", agent-proposed team knowledge is auto-approved (default: manual moderation)

## Per-Team Settings

Settings like ANTHROPIC_API_KEY are now per-team, stored in the team_settings table.
Each team can have its own API keys and configuration.
Set via the team's settings page in the web UI or via API.

## Environment Variables - Injected into Agent Processes

These are set automatically by ZooGent when spawning an agent:

ZOOGENT_API_URL         - Server URL (http://127.0.0.1:{PORT})
ZOOGENT_AGENT_ID        - Agent's ID
ZOOGENT_AGENT_GOAL      - Agent's permanent goal/mission statement
ZOOGENT_AGENT_MODEL     - Agent's configured AI model
ZOOGENT_RUN_ID          - Current run ID (integer)
ZOOGENT_API_KEY         - API key for reporting back to ZooGent
ZOOGENT_MEMORIES        - JSON array of agent's memories, ranked by importance
                          Format: [{ content, importance, tags, source, createdAt }]
ZOOGENT_AGENT_SKILLS    - Concatenated content of all required skills (frontmatter stripped)
ZOOGENT_TEAM_KNOWLEDGE  - JSON array of active team knowledge entries
                          Format: [{ title, content }]

Plus: all custom env vars configured for the agent (decrypted from AES-256-GCM storage).
Plus: ANTHROPIC_API_KEY from team settings (if configured for the team).

## Agent SDK Exports (TypeScript - zoogent/client)

Tasks:
  createTask({ agentId, title, payload?, createdByAgentId?, consensus?, consensusAgents?, consensusStrategy? }) -> Task | null
  getMyTasks(status?) -> Task[]
  checkoutTask(taskId) -> boolean
  completeTask(taskId, result?) -> void
  failTask(taskId, result?) -> void

Cost:
  reportCost({ model, inputTokens, outputTokens, costCents, provider? }) -> void

Memory:
  reportMemory({ content, importance?, tags? }) -> void
  getMemories() -> any[]   (reads ZOOGENT_MEMORIES env var)

Consensus:
  submitEvaluation({ taskId, verdict, score?, reasoning? }) -> any

Skills:
  getSkills() -> string    (reads ZOOGENT_AGENT_SKILLS env var)
  loadSkill(path) -> string  (reads from disk, strips frontmatter)
  loadSkills(paths) -> string  (loads multiple, concatenated)
  loadSkillRemote(path) -> string  (loads via HTTP API)

Team Knowledge:
  getTeamKnowledge() -> { title, content }[]  (reads ZOOGENT_TEAM_KNOWLEDGE env var)
  reportTeamKnowledge({ title, content }) -> void

Store (persistent working data — URLs, IDs, tracking state between runs):
  storeGet(key) -> any | null
  storeSet(key, value, ttlSeconds?) -> void
  storeDelete(key) -> boolean
  storeKeys(prefix?) -> string[]

Context:
  getGoal() -> string  (reads ZOOGENT_AGENT_GOAL env var)

Lifecycle:
  heartbeat() -> void  (for long-running agents)

All reporting calls are fail-open (errors caught silently, never crash the agent).
All functions read ZOOGENT_* env vars automatically - no configuration needed.

## Web UI URL Structure

/setup                      - Create owner account (first run only)
/teams                      - List all teams
/teams/:slug                - Team dashboard (agent cards grid)
/teams/:slug/chat           - Architect AI chat for this team
/teams/:slug/agents/:id     - Agent detail page
/teams/:slug/skills         - Skill browser for this team
/teams/:slug/tasks          - Task list for this team
/teams/:slug/memory         - Memory browser for this team
/teams/:slug/costs          - Cost overview for this team
/teams/:slug/knowledge      - Team knowledge board
/settings                   - Global settings (account, API keys)
/members                    - User management (global)
`);
});

// GET /llms-agent-guide.txt - How to write agents
apiLlmsRoutes.get('/llms-agent-guide.txt', (c) => {
  c.header('Content-Type', 'text/plain');
  return c.text(`# How to Write a ZooGent Agent

## Architecture

ZooGent is a process manager, not an AI framework.
It does not call any LLM. It does not process any content. It does not make decisions.

Your agent is a standalone script that:
1. Reads context from env vars (goal, model, memories, skills, team knowledge)
2. Calls whatever LLM it wants, with its own API key
3. Does its work (process data, generate content, make API calls, etc.)
4. Reports back to ZooGent (cost, memory, task results) via HTTP

ZooGent handles everything else: scheduling, spawning, log capture, task routing,
memory injection, cost tracking, budget enforcement, and the web dashboard.

## Multi-Team Architecture

ZooGent v0.3 supports multiple teams in one instance. Each team is an isolated workspace
with its own agents, skills, memory, knowledge, and Architect chat.

- Agents belong to a team. They interact only with agents in the same team.
- Skills are scoped to a team. System skills are global and read-only.
- ANTHROPIC_API_KEY is per-team (stored in team_settings table).
- The agent reporting API (/api/report/*) is unchanged — agents report using
  their ZOOGENT_* env vars regardless of team structure.

## Agent Fields

When creating an agent, these are the fields:

- id: Unique identifier (e.g., "monitor", "summarizer", "classifier")
- name: Display name for the dashboard
- goal: Permanent mission statement - what the agent continuously does.
  Injected as ZOOGENT_AGENT_GOAL. This is the agent's "why".
- model: AI model the agent uses (e.g., "claude-sonnet-4-6", "gpt-4o-mini").
  Injected as ZOOGENT_AGENT_MODEL. The agent reads this and calls that model.
- command: Executable to run (e.g., "npx", "python3", "node", "bash")
- args: Command arguments as array (e.g., ["tsx", "agents/monitor.ts"])
- type: One of:
    "cron" - runs on schedule (needs cronSchedule)
    "manual" - triggered via dashboard or MCP
    "long-running" - persistent process (e.g., webhook listener, bot)
- cronSchedule: Cron expression (e.g., "0 */2 * * *" = every 2 hours)
- skills: Skill file paths to assign (e.g., ["monitoring/rss.md", "tactics/summarization.md"])
- budgetMonthlyCents: Monthly spending limit in cents. Agent is blocked if exceeded.
- wakeOnAssignment: If true, agent starts automatically when a task is assigned to it.
- env: Custom environment variables (e.g., API keys). Encrypted at rest with AES-256-GCM.

## TypeScript Agent - Full Example

Install: npm install zoogent

\`\`\`typescript
import { getMyTasks, checkoutTask, completeTask, failTask, reportCost, reportMemory, getGoal, getMemories, getSkills, getTeamKnowledge, createTask } from 'zoogent/client';
import Anthropic from '@anthropic-ai/sdk';

// Context injected by ZooGent
const goal = getGoal();
const model = process.env.ZOOGENT_AGENT_MODEL || 'claude-sonnet-4-6';
const memories = getMemories();
const skills = getSkills();
const teamKnowledge = getTeamKnowledge();

// Your own API client
const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

async function main() {
  const tasks = await getMyTasks();

  for (const task of tasks) {
    const locked = await checkoutTask(task.id);
    if (!locked) continue; // another instance grabbed it

    try {
      const payload = task.payload ? JSON.parse(task.payload) : {};

      // Build prompt using ZooGent context
      const systemPrompt = [
        \`Your role: \${goal}\`,
        skills ? \`Instructions:\\n\${skills}\` : '',
        memories.length ? \`Past learnings:\\n\${memories.map(m => \`- \${m.content}\`).join('\\n')}\` : '',
        teamKnowledge.length ? \`Team knowledge:\\n\${teamKnowledge.map(k => \`- \${k.title}: \${k.content}\`).join('\\n')}\` : '',
      ].filter(Boolean).join('\\n\\n');

      // Call LLM
      const response = await anthropic.messages.create({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: \`Task: \${task.title}\\n\\nData: \${JSON.stringify(payload)}\` }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';

      // Report cost
      await reportCost({
        model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        costCents: calculateCost(model, response.usage),
      });

      // Complete task
      await completeTask(task.id, JSON.stringify({ output: text }));

    } catch (err) {
      console.error(\`Task \${task.id} failed:\`, err);
      await failTask(task.id, String(err));
    }
  }
}

function calculateCost(model: string, usage: { input_tokens: number; output_tokens: number }): number {
  // Rough cost calculation - adjust rates per model
  const rates: Record<string, [number, number]> = {
    'claude-sonnet-4-6': [0.3, 1.5],     // per 100K tokens: [input, output]
    'gpt-4o-mini': [0.015, 0.06],
  };
  const [inputRate, outputRate] = rates[model] || [0.3, 1.5];
  return (usage.input_tokens * inputRate + usage.output_tokens * outputRate) / 100_000;
}

main().catch(console.error);
\`\`\`

## Python Agent

Any script that can make HTTP calls works. No SDK needed.

\`\`\`python
import os, json, requests

API = os.environ["ZOOGENT_API_URL"]
KEY = os.environ["ZOOGENT_API_KEY"]
AGENT_ID = os.environ["ZOOGENT_AGENT_ID"]
GOAL = os.environ.get("ZOOGENT_AGENT_GOAL", "")
MODEL = os.environ.get("ZOOGENT_AGENT_MODEL", "gpt-4o-mini")
MEMORIES = json.loads(os.environ.get("ZOOGENT_MEMORIES", "[]"))
HEADERS = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

# Get pending tasks
tasks = requests.get(f"{API}/api/tasks?agentId={AGENT_ID}&status=pending", headers=HEADERS).json()

for task in tasks:
    # Checkout (atomic lock)
    r = requests.post(f"{API}/api/tasks/{task['id']}/checkout", headers=HEADERS)
    if r.status_code == 409:
        continue

    # Do your work here (call OpenAI, process data, etc.)
    result = {"output": f"Processed: {task['title']}"}

    # Report cost
    requests.post(f"{API}/api/report/cost", headers=HEADERS, json={
        "agentId": AGENT_ID, "model": MODEL,
        "inputTokens": 500, "outputTokens": 200, "costCents": 0.1
    })

    # Complete task
    requests.patch(f"{API}/api/tasks/{task['id']}", headers=HEADERS, json={
        "status": "done", "result": json.dumps(result)
    })
\`\`\`

Register with: command: "python3", args: ["agents/my_agent.py"]

## Adapting Existing Agents

If you already have a script that does useful work, connecting it to ZooGent is minimal:

1. Read ZOOGENT_AGENT_GOAL and ZOOGENT_AGENT_MODEL from env (optional - use as defaults)
2. After each LLM call, POST to /api/report/cost with token counts
3. To receive work from other agents: GET /api/tasks, POST checkout, PATCH complete
4. To send work to other agents: POST /api/tasks with their agentId
5. To save learnings: POST /api/report/memory

You do not need to change your core logic. The reporting is fire-and-forget.
If ZooGent is unreachable, the SDK calls fail silently and your agent keeps running.

## Designing Skills

Skills are stored in the database, scoped to a team. They tell an agent HOW to do its work.
System skills are global, read-only, and used internally by Architect AI (stored in system_skills table).

### Skill vs Goal

- Goal = WHAT to do ("Monitor RSS feeds and create summary tasks for new articles")
- Skill = HOW to do it (rules, tactics, examples, evaluation criteria)

The goal is set once per agent. Skills are reusable across agents within a team.

### Writing Good Skills

Write specific rules, not abstractions.

Bad:
  "Write high-quality summaries that are informative and engaging."

Good:
  "Summaries must be 2-3 sentences. First sentence: the main finding or event.
   Second sentence: why it matters. Third sentence (optional): what happens next.
   Never start with 'This article discusses' or 'In this piece'.
   Use present tense for ongoing situations, past tense for completed events."

Include examples of good and bad output when possible.

### Skill Types

Organize skills by purpose:

- tactics/ - how to perform specific tasks (e.g., tactics/summarization.md)
- rules/ - constraints and formatting rules (e.g., rules/output-format.md)
- voice/ - tone, style, vocabulary (e.g., voice/brand-guidelines.md)
- evaluation/ - how to judge quality (e.g., evaluation/summary-rubric.md)
- domain/ - domain-specific knowledge (e.g., domain/fintech-terminology.md)

### YAML Frontmatter Format

\`\`\`markdown
---
name: RSS Summarization
description: How to summarize RSS feed articles into brief digests
category: tactics
related: ["voice/brand-tone.md", "rules/length-limits.md"]
---

# RSS Summarization

When summarizing an RSS article:

1. Read the full text, not just the title
2. Identify the single most important fact or development
3. Write a 2-3 sentence summary...
\`\`\`

### Wiki-Links for Cross-References

Use [[other-skill]] to reference related skills:

  "Follow the formatting rules in [[rules/output-format]] and the
   tone guidelines in [[voice/brand-tone]]."

This helps both humans and agents understand skill dependencies.

## Building Agents That Learn (Memory)

Memory is how agents improve over time. Each agent writes its own memories -
insights from experience, NOT action logs.

### When to Write Memory

Write a memory when:
- You discover a pattern ("articles from source X are usually paywalled")
- You receive feedback ("human rejected summary - was too long")
- You try a new approach and it works/fails ("using bullet points increased approval rate")
- You encounter an edge case ("API returns 429 after 10 requests per minute")

Do NOT write memory for routine operations ("processed 5 tasks" - that is a log, not a learning).

### How to Write Memory

\`\`\`typescript
await reportMemory({
  content: 'Source X articles require paywall bypass - skip and note in result',
  importance: 8,  // 1-10, higher = more likely to be injected
  tags: ['source-x', 'paywall', 'skip'],
});
\`\`\`

Keep it specific and actionable. Write 1-2 entries per run, not more.

### Loading Memories

Memories are auto-injected as ZOOGENT_MEMORIES env var (JSON array, ranked by importance).

\`\`\`typescript
import { getMemories } from 'zoogent/client';

const memories = getMemories();
// Returns: [{ content: "...", importance: 8, tags: [...], source: "auto", createdAt: "..." }, ...]
\`\`\`

### Using Memories in Your Prompt

Pass memories to the LLM as "past learnings" in the system prompt:

\`\`\`typescript
const systemPrompt = \`Your role: \${goal}

Past learnings from previous runs:
\${memories.map(m => \`- \${m.content}\`).join('\\n')}

Apply these learnings to your current work. If you discover new patterns, they will be saved for future runs.\`;
\`\`\`

### Full Memory Cycle Example

\`\`\`typescript
import { getMyTasks, checkoutTask, completeTask, reportCost, reportMemory, getGoal, getMemories } from 'zoogent/client';
import Anthropic from '@anthropic-ai/sdk';

const goal = getGoal();
const model = process.env.ZOOGENT_AGENT_MODEL || 'claude-sonnet-4-6';
const memories = getMemories();
const anthropic = new Anthropic();

const tasks = await getMyTasks();

for (const task of tasks) {
  const locked = await checkoutTask(task.id);
  if (!locked) continue;

  const systemPrompt = [
    \`Your role: \${goal}\`,
    memories.length > 0
      ? \`Past learnings:\\n\${memories.map(m => \`- \${m.content}\`).join('\\n')}\`
      : '',
    'If you learn something new or notice a pattern, mention it at the end of your response after "---LEARNING:" on its own line.',
  ].filter(Boolean).join('\\n\\n');

  const response = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: task.title }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  // Report cost
  await reportCost({
    model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    costCents: 0.1,
  });

  // Extract and save learning if present
  const learningMatch = text.match(/---LEARNING:\\s*(.+)/s);
  if (learningMatch) {
    await reportMemory({
      content: learningMatch[1].trim(),
      importance: 6,
      tags: ['auto-discovered'],
    });
  }

  await completeTask(task.id, JSON.stringify({ output: text }));
}
\`\`\`

## Feedback Agents - How Teams Learn

When designing an agent team, always consider: how will agents know if they did a good job?
Without feedback, agents repeat the same mistakes forever.

### Two Approaches

1. IMPLICIT FEEDBACK (preferred when possible)
   A dedicated feedback collector agent monitors user behavior to detect corrections.
   The user does not need to press buttons or rate anything.

   Signals to detect:
   - User undoes agent action (e.g., moves email back from archive = negative feedback)
   - User edits agent output (e.g., rewrites a summary = partial negative feedback)
   - User ignores agent suggestion (e.g., never clicks generated link = low value)
   - Task completed successfully (e.g., customer replied positively = positive feedback)
   - User escalates to manual process (e.g., calls support instead of using bot = failure)

   Example: Email classifier archives a message. Feedback collector checks daily
   if any archived emails were moved back to inbox by the user.
   If yes, it creates a task for the classifier: "You incorrectly archived this email."
   The classifier receives the task and writes a memory:
   reportMemory({ content: "Emails from X are important - do not archive", importance: 9 })

2. SELF-LEARNING (when implicit feedback is not available)
   The agent analyzes its own output metrics after N runs.

   Example: Content writer tracks which articles get the most views.
   After 10 articles, it notices articles with data points get 3x more views.
   reportMemory({ content: "Include specific numbers - 3x more engagement", importance: 7 })

### When to Use Which

Use implicit feedback when:
- The agent's work has observable outcomes (email sorted, content published, ticket resolved)
- The user naturally interacts with the result (reads email, approves PR, uses report)
- There is a way to detect corrections (undo, edit, reject, escalate)

Use self-learning when:
- Outcomes are not directly observable by the agent
- The agent has access to performance metrics (views, clicks, conversion)
- Low-risk tasks where wrong patterns are not costly

### Designing a Feedback Collector Agent

A feedback collector is a cron agent that runs periodically (daily or weekly).
It does NOT do the main work - it only observes outcomes.

Goal: "Monitor outcomes of [agent X]'s decisions. Detect when a user corrected or
undid an action. Report findings as tasks to [agent X] and as team knowledge
if the pattern affects the whole team."

Type: cron (e.g., "0 9 * * *" = daily at 9am)
Model: haiku (cheap - just comparing data, not reasoning)
Skills: evaluation/feedback-signals.md (what signals to look for)

The feedback collector:
1. Gets the list of recent actions by the target agent (via tasks or external API)
2. Checks if the user corrected any of those actions
3. For each correction: creates a task for the target agent with the correction details
4. For repeated patterns: proposes team knowledge via reportTeamKnowledge()
5. Reports its own learnings to memory (what patterns it noticed)

### When to Suggest a Feedback Agent (for AI assistants)

When helping a user design an agent team, ALWAYS ask:
"How will we know if the agent's decisions are correct?"

If the answer involves user actions that can be monitored:
-> Suggest adding a feedback collector agent

If the answer is "we will check manually sometimes":
-> Suggest self-learning with periodic reviews in the dashboard

If the answer is "there is no way to tell":
-> Suggest a generator-critic pattern (one agent checks another)

## Team Knowledge

### Proposing Team Knowledge

When an agent discovers something that would benefit the entire team:

\`\`\`typescript
import { reportTeamKnowledge } from 'zoogent/client';

await reportTeamKnowledge({
  title: 'API rate limit for data provider',
  content: 'Provider X limits to 100 requests/hour. Space requests at least 36 seconds apart to avoid 429 errors.',
});
\`\`\`

The entry is created as "draft" by default. A human reviews and approves/rejects it in the dashboard.

### Reading Team Knowledge

Active (approved) team knowledge is auto-injected as ZOOGENT_TEAM_KNOWLEDGE env var:

\`\`\`typescript
import { getTeamKnowledge } from 'zoogent/client';

const knowledge = getTeamKnowledge();
// Returns: [{ title: "API rate limit for data provider", content: "Provider X limits to..." }]
\`\`\`

### Two Moderation Modes

1. Manual approval (default): Agents propose, humans approve in the web dashboard.
   Entries stay as "draft" until approved. Only "active" entries are injected into agents.

2. Auto-approve: Set ZOOGENT_AUTO_APPROVE_KNOWLEDGE=true in server env.
   Every proposal is immediately active. Useful for trusted agent teams
   where you want knowledge to flow without delay.

## Team Communication - 5 Channels

Agents have five channels to share information (all scoped to their team):

### 1. Tasks (Direct Messages)
Agent-to-agent communication. One agent creates a task for another.
Used for: passing work, requesting review, sending data.
\`\`\`typescript
await createTask({ agentId: 'summarizer', title: 'Summarize this article', payload: { url: '...' } });
\`\`\`

### 2. Team Knowledge (Shared Board)
Proposed by agents, moderated by humans. Visible to all agents in the team.
Used for: sharing discoveries, warnings, best practices.
Flow: agent proposes -> human approves -> injected into all agents in the team.

### 3. Memory (Personal Diary)
Each agent's own. Not shared. Injected only into the owning agent.
Used for: personal learnings, patterns, mistakes, preferences.
An agent cannot read another agent's memories.

### 4. Store (Persistent Working Data)
Key-value store per agent. Survives between runs. Not injected at startup — agent queries on demand.
Used for: tracking URLs, saving IDs of processed items, temporary data with TTL.
\`\`\`typescript
// Save URLs to check later
await storeSet('pending-urls', ['https://reddit.com/r/...', 'https://hn.com/...']);

// Next run: retrieve them
const urls = await storeGet('pending-urls');

// Temporary data (auto-expires after 24 hours)
await storeSet('rate-limit-backoff', { until: Date.now() + 3600000 }, 86400);

// List all keys
const keys = await storeKeys();         // all keys
const urlKeys = await storeKeys('url-'); // keys starting with "url-"

// Clean up
await storeDelete('pending-urls');
\`\`\`

Store is NOT for insights (use memory) or shared facts (use team knowledge).
Store is for operational data the agent needs to do its job.

### 5. Skills (Static Instructions)
Markdown documents stored in the database, scoped to the team. Assigned to specific agents.
Used for: tactics, rules, voice guidelines, domain knowledge.
Changed by developers or via the Architect chat, not by agents at runtime.

## Coordinator Agent

For teams of 3+ workers, add a coordinator agent. This is a regular agent with its own LLM -
not a ZooGent feature. ZooGent handles infrastructure (scheduling, task routing). The coordinator
handles decisions.

### Why

Without a coordinator, agents work in isolation. Each one does its job but nobody sees
the full picture. Problems that come from this:

- Duplicate work: two agents process the same input independently
- Wrong priorities: urgent task sits in queue while agent handles routine work
- No context: agent A does not know what agent B just did
- Conflicting actions: one agent archives an email, another tries to reply to it
- No escalation: complex cases fall through because no one decides "this needs a human"

A coordinator solves all of these. It sees incoming work from all channels, decides who
handles what, prevents conflicts, prioritizes by urgency, and escalates when needed.

### When to Use

- 3+ worker agents in the team
- Multiple input channels (email + chat + CRM + API)
- Work items that could go to different agents depending on context
- Tasks that need deduplication (same customer writing in two channels)
- Need to escalate complex cases to humans

### How to Design

The coordinator is typically:
- Type: long-running or cron (frequent, e.g., every 1-2 minutes)
- Model: sonnet or similar (needs reasoning to make routing decisions)
- wakeOnAssignment: true (if other agents can request its help)

Goal example: "Receive all incoming work items. Analyze context, check for duplicates
(same customer, same topic across channels). Assign to the right worker agent based
on type and urgency. Escalate to human if confidence is below 70% or if the item
is marked as VIP. Track what is assigned where to prevent conflicts."

Skills the coordinator needs:
- routing/rules.md - which agent handles what type of work
- domain/priorities.md - how to determine urgency
- domain/escalation.md - when to involve a human

### Coordinator Pattern

\`\`\`
Input channels:
  email-reader (cron) -> creates tasks for coordinator
  chat-reader (cron) -> creates tasks for coordinator
  api-webhook (long-running) -> creates tasks for coordinator

Coordinator (wakeOnAssignment):
  1. Receives task from any input channel
  2. Checks: is this a duplicate? (same customer, same topic in last 24h)
  3. Determines: which worker should handle this?
  4. Determines: what priority? (VIP customer? urgent keyword? SLA breach?)
  5. Creates task for the right worker with priority and context
  6. If unsure: escalates to human (creates task for human review queue)

Workers:
  billing-handler (wakeOnAssignment) -> handles billing questions
  support-handler (wakeOnAssignment) -> handles technical support
  sales-handler (wakeOnAssignment) -> handles sales inquiries
\`\`\`

### What the Coordinator Learns

The coordinator writes memory about routing patterns:
- "Customer X always has billing issues - route directly to billing-handler"
- "Messages with 'urgent' in subject from VIP list need immediate escalation"
- "Support-handler takes 2x longer on database questions - consider splitting"

It proposes team knowledge when it discovers patterns affecting the whole team:
- reportTeamKnowledge({ title: "Peak hours", content: "80% of urgent requests arrive 9-11am. Scale workers accordingly." })

## Deployment - Docker

IMPORTANT: Read this section fully before deploying. Missing env vars is the #1 deployment failure.

### Principle

ZooGent server spawns agent processes. Agent processes inherit the server's environment variables
(process.env). Therefore ALL env vars — both server config AND agent API keys — must be available
in the container. The docker-compose.yml must list every variable using \${VAR} syntax so the
hosting platform (Dokploy, Railway, etc.) can inject actual values at runtime.

Note: ANTHROPIC_API_KEY is now per-team (stored in team_settings), so it does not need to be
in docker-compose.yml unless agents read it directly from process.env. The process-manager
injects it from team settings automatically.

### Dockerfile

\`\`\`dockerfile
FROM node:24-slim
WORKDIR /app
RUN npm install -g zoogent
RUN mkdir -p /app/data
ENV DATABASE_URL=./data/zoogent.db PORT=3200
EXPOSE 3200
CMD ["sh", "-c", "npx zoogent init && npx zoogent start"]
\`\`\`

No source code needed in the image. ZooGent installs from npm.
Agents and skills are created via the Chat UI (/teams/:slug/chat) after deployment.
For dev-path deployments with custom agent code, add COPY agents/ agents/ to the Dockerfile.

### docker-compose.yml

\`\`\`yaml
services:
  app:
    build: .
    expose:
      - "3200"
    volumes:
      - zoogent-data:/app/data
    environment:
      # --- Server (required) ---
      - DATABASE_URL=./data/zoogent.db
      - PORT=3200
      - BETTER_AUTH_SECRET=\${BETTER_AUTH_SECRET}
      - BETTER_AUTH_URL=\${BETTER_AUTH_URL}
      - ZOOGENT_API_KEY=\${ZOOGENT_API_KEY}
      # --- Agent API keys (add keys your agents need from process.env) ---
      # - OPENAI_API_KEY=\${OPENAI_API_KEY}
      # Note: ANTHROPIC_API_KEY is per-team (set in team settings UI)
      # Only add it here if agents read it directly from process.env
      # --- Agent-specific services (add as needed) ---
      # - TELEGRAM_BOT_TOKEN=\${TELEGRAM_BOT_TOKEN}
      # - TELEGRAM_CHAT_ID=\${TELEGRAM_CHAT_ID}
      # - WEBSHARE_API_KEY=\${WEBSHARE_API_KEY}
    restart: unless-stopped

volumes:
  zoogent-data:
\`\`\`

### Required env vars for the hosting platform

Set these in your hosting platform (Dokploy Environment, Railway Variables, etc.):

| Variable | Required | Description |
|----------|----------|-------------|
| BETTER_AUTH_SECRET | Yes | Auth session secret. Generate: openssl rand -hex 32 |
| BETTER_AUTH_URL | Yes (remote) | Public URL, e.g. https://your-domain.com. Without it, auth fails on non-localhost. |
| ZOOGENT_API_KEY | No | Generate in Settings UI after first login. Not needed in env vars. |
| + any agent keys | As needed | Every env var your agents read from process.env |

ANTHROPIC_API_KEY is per-team — set it in each team's settings page, not as a global env var.

### How agent env vars work

When ZooGent spawns an agent, it creates child process with:
1. Server's process.env (inherited — this is why shared API keys must be in compose)
2. Agent's encrypted env vars (stored in DB, decrypted at spawn time)
3. Per-team settings (e.g., ANTHROPIC_API_KEY from team_settings table)
4. ZOOGENT_* context vars (agent ID, goal, memories, skills, etc.)

Two ways to provide API keys to agents:
- process.env (via compose) — simpler, all agents share the same keys
- Agent encrypted env (via update_agent) — per-agent keys, encrypted at rest
- Team settings — per-team keys (e.g., ANTHROPIC_API_KEY), shared by all agents in the team

### Persistence

- data/ volume contains: SQLite DB, secrets, master key
- Mount as a Docker volume — survives redeploys
- First start auto-runs migrations and creates tables

### Common deployment mistakes

1. Missing BETTER_AUTH_SECRET → 500 on all auth routes
2. Missing BETTER_AUTH_URL → auth works on localhost but fails on remote domain
3. Missing API keys in compose → agents can't call LLMs (silent fail, safeCall catches errors)
4. Using environment: without \${VAR} → hosting platform can't inject values

## Example Team Patterns

### RSS Monitor + Summarizer (2 agents, pipeline)

Agent 1: monitor (cron: "0 */4 * * *")
  Goal: "Check RSS feeds for new articles. For each new article, create a task for summarizer with the article URL and title."
  Skills: monitoring/rss-feeds.md (list of feeds, dedup rules)
  Model: gpt-4o-mini (cheap, just fetching and filtering)

Agent 2: summarizer (wakeOnAssignment: true)
  Goal: "Read the article at the given URL. Write a 2-3 sentence summary. Save the result."
  Skills: tactics/summarization.md
  Model: claude-sonnet-4-6

Connection: monitor creates tasks for summarizer.

### Customer Support: Classifier + Responder + Escalator (3 agents, fan-out)

Agent 1: classifier (wakeOnAssignment: true)
  Goal: "Read incoming support messages. Classify as billing, technical, or general. Create a task for the appropriate responder."
  Skills: domain/support-categories.md
  Model: gpt-4o-mini (fast classification)

Agent 2: responder (wakeOnAssignment: true)
  Goal: "Draft a helpful response to the customer's question. If you cannot resolve it, create a task for escalator."
  Skills: tactics/support-responses.md, voice/support-tone.md
  Model: claude-sonnet-4-6

Agent 3: escalator (wakeOnAssignment: true)
  Goal: "Review unresolved support issues. Format a summary for the human support team with context and suggested next steps."
  Skills: tactics/escalation-format.md
  Model: claude-sonnet-4-6

Connection: classifier -> responder -> escalator (if needed).

### Content Pipeline: Researcher + Writer + Editor (3 agents, pipeline with feedback)

Agent 1: researcher (cron: "0 9 * * 1" - weekly)
  Goal: "Research the assigned topic. Gather facts, data, and sources. Create a task for writer with structured research notes."
  Skills: tactics/research-methods.md, domain/industry-knowledge.md
  Model: claude-sonnet-4-6

Agent 2: writer (wakeOnAssignment: true)
  Goal: "Write a draft article based on the research notes. Follow the style guide. Create a task for editor."
  Skills: voice/brand-guidelines.md, rules/article-structure.md
  Model: claude-sonnet-4-6

Agent 3: editor (wakeOnAssignment: true)
  Goal: "Review the draft for accuracy, clarity, and style. If revision needed, create a task back to writer with specific feedback. If approved, mark as done."
  Skills: evaluation/article-rubric.md, voice/brand-guidelines.md
  Model: claude-sonnet-4-6

Connection: researcher -> writer -> editor (editor can loop back to writer via revision tasks).
`);
});
