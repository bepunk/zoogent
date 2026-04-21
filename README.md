<!-- mcp-name: io.github.bepunk/zoogent -->

# ZooGent

Lightweight AI agent orchestrator with built-in Architect AI. Multi-team support - run isolated agent teams in a single instance. Describe what you want to automate, get working agents.

## Quick Start

```bash
npx zoogent create my-agents
cd my-agents
npx zoogent start
```

Open http://localhost:3200. Create account > create team > add Anthropic API key in Team Settings > go to Architect and describe what you want to automate.

## What is ZooGent

ZooGent is a process manager for AI agent teams. It spawns agents, routes tasks between them, tracks costs, and captures logs. Each agent is a standalone script that calls its own LLM.

**Multi-team isolation** - one instance, multiple teams. Each team has its own agents, skills, memory, knowledge, Architect chat, and API keys. Teams don't see each other's data.

**Two ways to use it:**

1. **Chat UI** - open the Architect page in your browser, describe your task in plain language. The Architect AI designs the team, creates skills, writes agent code, and tests everything.

2. **Claude Code + MCP** - connect MCP to Claude Code, build agents from the terminal with full control over code and configuration.

Both paths use the same API, same database, same agents. Pick whichever fits your workflow.

## Getting Started

### Path 1: Web UI + Architect

#### Local

```bash
npx zoogent create my-agents
cd my-agents
npx zoogent start
```

1. Open http://localhost:3200
2. Create your account
3. Create a team
4. Go to Team Settings > add your Anthropic API key
5. Go to **Architect** > describe what you want to automate

Architect designs agents, writes skills, generates code, and tests everything through conversation.

#### Server

```bash
npx zoogent create my-agents
cd my-agents
npx zoogent start -d
```

Set `BETTER_AUTH_URL` to your public URL in `.env`. Use a reverse proxy (nginx, Caddy) or deploy via Docker (see [Deployment](#deployment) section). The web UI is the same - just accessed remotely.

### Path 2: Claude Code + MCP

#### Local

Start the server locally, then connect Claude Code via MCP:

```bash
npx zoogent create my-agents
cd my-agents
npx zoogent start -d
```

Add the MCP server to Claude Code. Run this **from inside the project you want to work in** — each project typically binds to its own ZooGent instance (its own SQLite, teams, agents, API keys), so the MCP config should live with the project:

```bash
claude mcp add zoogent -s project -- npx zoogent mcp
```

`-s project` writes the config to `.mcp.json` in the project root — commit it and teammates who clone the repo get the same MCP setup automatically.

Claude Code auto-discovers the local server. Ask Claude to create a team and design your agents.

#### Remote server

Deploy ZooGent to a server (see [Deployment](#deployment)). Open the web UI, create an account, go to Settings > generate an API key.

Run from inside the project that should connect to this ZooGent instance:

```bash
claude mcp add zoogent -s project \
  -e ZOOGENT_URL=https://your-domain.com \
  -e ZOOGENT_API_KEY=zg_your-key-from-settings \
  -- npx zoogent mcp
```

> Each project can point at its own ZooGent (local or remote), with its own URL and API key. Keeping the config in the project's `.mcp.json` makes that mapping explicit. Use `-s user` instead only if you have a single shared ZooGent instance across all projects.

<details>
<summary>Alternative: configure via .mcp.json</summary>

```json
{
  "mcpServers": {
    "zoogent": {
      "command": "npx",
      "args": ["zoogent", "mcp"],
      "env": {
        "ZOOGENT_URL": "https://your-domain.com",
        "ZOOGENT_API_KEY": "zg_your-key-from-settings"
      }
    }
  }
}
```
</details>

Claude Code connects to the remote server. Create teams, design agents, write code - all through MCP tools. Agents run on the server.

## How It Works

1. Create a team for your business process
2. Describe what you want automated in the team's Architect chat
3. Architect creates agents (with goals, schedules, models) and writes their code
4. Agents run on schedule or by event, communicate through tasks
5. Agents learn from experience (Memory) and share knowledge (Team Knowledge)
6. When something breaks, Architect sees the error logs and suggests fixes

### Examples

**Social media monitoring.** Scout agent scans Reddit and Hacker News every 2 hours for relevant posts. Comment writer drafts responses in the right tone. Feedback collector checks next day - which comments got upvotes, which got ignored. Team learns and adapts.

**Invoice processing.** Watcher agent polls an email inbox for new invoices. Parser extracts amounts, dates, vendor info. Router creates entries in your accounting system via API. Anomaly detector flags invoices that look unusual for human review.

**Customer support automation.** Intake agent receives customer requests via webhook. Analyzer classifies urgency and type, creates tasks for human team members in your project tracker. Follow-up agent monitors task completion, notifies customers when their request is resolved.

## Features

### Teams
Multiple isolated teams in one instance. Each team has its own agents, skills, memory, knowledge, Architect chat, and Anthropic API key. Header nav: Teams / Members / Settings. Team sub-nav: Architect / Agents / Tasks / Costs / Skills / Memory / Knowledge / Settings.

### Architect AI
Built-in Claude-powered chat that designs and manages your agent team. Creates agents, writes skills, generates TypeScript code, assigns skills, triggers runs, reads logs - all through conversation. SSE streaming with real-time tool execution display. Each team has its own Architect with separate chat history.

### Agent Runtimes

| Runtime | Source of code | When to use |
|---------|----------------|-------------|
| `typescript` (default) | Stored in zoogent DB, uploaded via MCP/chat, bundled with esbuild | ~95% of agents — write/iterate from Claude Code, remote deploy just works |
| `exec` | Lives outside zoogent; you provide `command` + `args` + `cwd` | Wrapping binaries, Python/Go scripts, existing tooling |

For `typescript`, agents can import from a curated blessed set: `@anthropic-ai/sdk`, `openai`, `@google/generative-ai`, `axios`, `cheerio`, `googleapis`, `zod`, `p-limit`/`p-retry`/`p-map`/`p-queue`, `date-fns`, `yaml`, `csv-parse`/`csv-stringify`, `cheerio`, `fast-xml-parser`, `marked`, `turndown`, `slugify`, `tiktoken`, `nodemailer`, `imapflow`, `mailparser`, `jsonwebtoken`, plus all Node built-ins. Unknown imports fail at upload with a readable error. The full list lives in the `code-generation` system skill — call `get_agent_guide("code-generation")` from MCP.

### Agent Types

| Type | How it runs | Example |
|------|-------------|---------|
| `cron` | On schedule | News scanner every 2 hours |
| `manual` | On demand or via task | Content writer triggered by scanner |
| `long-running` | Persistent process | Telegram bot, webhook listener |

### 5 Communication Channels

| Channel | What | Who sees it |
|---------|------|-------------|
| **Tasks** | Messages between agents | Sender + receiver |
| **Team Knowledge** | Shared facts (moderated) | All agents in team |
| **Memory** | Personal learnings | Only the agent |
| **Store** | Persistent working data (URLs, IDs, state) | Only the agent |
| **Skills** | Instructions from humans | Assigned agents |

### Skills
Markdown documents with instructions and knowledge, stored in the database per team. Assigned to agents - injected into their context at startup. Create via Architect chat, MCP, or API. System skills (team-design, agent-patterns, code-generation, etc.) are global and used by Architect AI.

### Agent Store
Key-value storage for agent working data that persists between runs. Track URLs, save processed IDs, cache state. Optional TTL for auto-expiry.

```typescript
await storeSet('seen_urls', ['https://...'], 604800); // expires in 7 days
const urls = await storeGet('seen_urls');
```

### Cost Tracking
Per-agent and per-team spending. Monthly budgets with hard stops - agent won't run if over budget. Set team budget in Team Settings, per-agent budget in agent config.

### Self-Healing
When an agent fails, the error with stderr excerpt appears in the team's Architect chat. Open Architect, see what went wrong, ask it to fix the code.

### Web Dashboard
Light and dark themes. Global pages: Teams, Members, Settings. Team pages: Architect (chat), Agents, Tasks, Costs, Skills, Memory, Knowledge.

## CLI Commands

```bash
zoogent create <name>  # Create new project (recommended)
zoogent init           # Initialize in current directory
zoogent start          # Start server (foreground)
zoogent start -d       # Start server (daemon)
zoogent stop           # Stop daemon
zoogent status         # Check if running
zoogent logs           # View server logs (-f to follow)
zoogent mcp            # Start MCP server (stdio)
```

## Deployment

### Server (no Docker)

```bash
npx zoogent create my-agents
cd my-agents
npx zoogent start -d
```

### Docker

**Dockerfile:**
```dockerfile
FROM node:24-slim
WORKDIR /app
RUN echo '{"name":"app","private":true,"type":"module","dependencies":{"zoogent":"*","@anthropic-ai/sdk":"*"}}' > package.json && npm install
RUN mkdir -p /app/data
ENV DATABASE_URL=./data/zoogent.db PORT=3200
EXPOSE 3200
CMD ["sh", "-c", "npx zoogent init && npx zoogent start"]
```

**docker-compose.yml:**
```yaml
services:
  app:
    build: .
    expose:
     - "3200"
    environment:
     - DATABASE_URL=./data/zoogent.db
     - PORT=3200
     - BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
     - BETTER_AUTH_URL=${BETTER_AUTH_URL}
      # ZOOGENT_API_KEY - generate in Settings UI after first login
      # ANTHROPIC_API_KEY - per-team, set in Team Settings UI
    volumes:
     - zoogent-data:/app/data
    restart: unless-stopped

volumes:
  zoogent-data:
```

All env vars use `${VAR}` syntax - set actual values in your hosting platform (Dokploy, Railway, etc.).

### Required Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BETTER_AUTH_SECRET` | Yes | Session secret. `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | Remote only | Public URL (e.g., `https://your-domain.com`) |

## Agent SDK

Typescript agents use `zoogent/client` for context + task flow:

```typescript
import {
  // Tasks
  createTask, getMyTasks, checkoutTask, completeTask, failTask,
  // Reporting
  reportCost, reportMemory, reportTeamKnowledge,
  // Context
  getGoal, getSkills, getMemories, getTeamKnowledge,
  // Store
  storeGet, storeSet, storeDelete, storeKeys,
  // Skills
  loadSkill, loadSkills,
  // Consensus
  submitEvaluation,
  // Health
  heartbeat,
} from 'zoogent/client';
```

For runtime="typescript" agents, zoogent hosts these deps — your code just imports them.
For runtime="exec" in any language, call the HTTP API directly: see the `/llms-agent-guide.txt` endpoint for the reporting contract.

All SDK calls are fail-open (errors caught silently). All functions read `ZOOGENT_*` env vars automatically.

### Workflow

```
1. MCP: create_agent with source=<boilerplate> → zoogent bundles with esbuild, agent is ready
2. MCP: trigger_agent + get_logs → test
3. MCP: write_agent_code with new source → re-bundle, iterate
```

No local `agents/` directory to keep in sync. Source of truth is zoogent's DB. On remote deploys,
the same MCP calls work against `ZOOGENT_URL` without any deployment step for the agent code itself.

## Environment Variables

### Server

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | SQLite file path | `./data/zoogent.db` |
| `PORT` | Server port | `3200` |
| `BETTER_AUTH_SECRET` | Session encryption key | Auto-generated |
| `BETTER_AUTH_URL` | Public URL for auth | `http://localhost:3200` |

### Injected into Agents

| Variable | Description |
|----------|-------------|
| `ZOOGENT_API_URL` | Server URL |
| `ZOOGENT_AGENT_ID` | Agent ID |
| `ZOOGENT_AGENT_GOAL` | Agent's mission |
| `ZOOGENT_AGENT_MODEL` | AI model |
| `ZOOGENT_RUN_ID` | Current run ID |
| `ZOOGENT_TEAM_ID` | Team ID |
| `ZOOGENT_API_KEY` | API key (from Settings) |
| `ZOOGENT_AGENT_SKILLS` | Required skills content |
| `ZOOGENT_INTEGRATIONS` | Agent integrations (JSON) |
| `INTEGRATION_{NAME}_{FIELD}` | Individual integration credentials |
| `ZOOGENT_MEMORIES` | Past learnings (JSON, scored) |
| `ZOOGENT_TEAM_KNOWLEDGE` | Shared knowledge (JSON) |
| `ANTHROPIC_API_KEY` | From team settings (auto-injected) |

## Tech Stack

- **Runtime**: Node.js 24, TypeScript
- **HTTP**: Hono (JSX SSR)
- **Database**: SQLite (better-sqlite3, WAL, FTS5) + Drizzle ORM
- **Auth**: Better Auth (email + password, sessions)
- **AI**: Anthropic SDK (Claude for Architect)
- **UI**: htmx + Tailwind CDN (server-rendered)
- **MCP**: @modelcontextprotocol/sdk (stdio)
- **Cron**: node-cron

## Security

- Agent env vars encrypted at rest (AES-256-GCM)
- Per-team settings (API keys) encrypted in database
- API keys managed in Settings UI (multiple named keys, stored in DB)
- Unified auth: localhost bypass + API key (from DB) + session cookie
- Path traversal protection on skill paths
- Log sanitization (strips API keys from stdout/stderr)
- First user = owner, registration closed after setup
- Team isolation: agents, skills, memory, knowledge scoped per team

## License

MIT
