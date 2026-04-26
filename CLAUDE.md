# CLAUDE.md - ZooGent v0.4.4

## What is ZooGent

Lightweight AI agent orchestrator with built-in Architect AI. Multi-team support. Process manager for agent teams — spawns agents, routes tasks, tracks costs, captures logs. Single container, SQLite, npm package `zoogent`.

Two UX paths:
1. **Chat UI** (main) — Architect AI at `/teams/:slug/chat` designs teams, writes code, manages agents
2. **MCP** (dev path) — ~35 tools for Claude Code, team-scoped, supports local and remote servers. Agent code flows through MCP: `create_agent` with `source` (bundled atomically) or separate `write_agent_code` for iteration. Team code library tools: `list_team_library`, `write_team_library_file`, `get_team_library_file`, `delete_team_library_file`.

## Agent Runtime Model (v0.4)

Two runtimes:
- **`typescript`** (default, 95% of agents): Source lives in `agents.source` column. On upload, zoogent bundles with esbuild (blessed deps list in `src/lib/agent-bundler.ts`) and stores `source + bundle + bundleHash`. Process manager materializes `{dataDir}/teams/{teamId}/agents/{id}.mjs` on spawn (skipped if hash matches marker file) and runs `node {path}` with `NODE_PATH` set to zoogent's `node_modules` (so blessed externalized deps resolve).
- **`exec`** (escape hatch): Provides `command` + `args` + `cwd`. Used for wrapping binaries / Python / Go / shell. Code is NOT managed through MCP. CRUD via `command` PATCH fields applies only here.

Code is never written to the local filesystem of the MCP client. All `write_agent_code` / `create_agent({ source })` calls upload through HTTP to the zoogent server and are persisted in SQLite. This means the same MCP flow works against local and remote zoogent servers identically.

Invariants (enforced at route + architect level):
- `runtime='typescript'` → `source` required for run; `command/args/cwd` null.
- `runtime='exec'` → `command` required; `source/bundle` null.
- `runtime` cannot be changed after creation.
- `source` cannot be updated via PATCH (use PUT /code or MCP `write_agent_code`).

Bundle errors: if esbuild fails, the source is still persisted along with `bundleError`, and `bundle`/`bundleHash` stay null. The agent cannot run until a clean bundle is produced. MCP returns the esbuild error in the tool response.

## Tech Stack

- **Runtime**: Node.js 24 + TypeScript. Zoogent server built with `tsc`. Typescript agent source bundled with `esbuild` (in-process) on upload and executed with `node` (no tsx at runtime).
- **HTTP**: Hono + @hono/node-server (JSX SSR with `html` helper for inline scripts)
- **DB**: SQLite (better-sqlite3, WAL mode) + Drizzle ORM + FTS5 for memory search
- **Auth**: Better Auth (email+password, session cookies). Unified auth middleware.
- **AI**: @anthropic-ai/sdk (Architect AI uses Claude Sonnet with function calling)
- **UI**: htmx + Tailwind CDN (server-rendered). Styles in `src/public/styles.css`.
- **MCP**: @modelcontextprotocol/sdk (35+ stdio tools, team-scoped, HTTP client to server API)
- **Cron**: node-cron

## Project Structure

```
src/
  cli.ts                - CLI: create, init, start [-d], stop, status, logs, mcp
  index.ts              - Hono server, route registration, team middleware, graceful shutdown, PID file
  mcp.ts                - MCP server (team-scoped tools, HTTP client, get_agent_guide, instructions)
  public/styles.css     - All CSS (themes, cards, chat bubbles, tool blocks)
  db/
    schema.ts           - Drizzle schema (24 tables: 4 auth + 20 app). `agents` carries runtime + source + bundle + bundleHash + bundleError. `team_code_library` stores shared TS files (team-scoped).
    index.ts            - SQLite connection + WAL + FTS5 init + migrations
    seed.ts             - Demo agents
    seed-skills.ts      - System skills for Architect AI (6 skills in system_skills table)
  core/
    architect.ts        - Architect AI: Claude + 11 function calling tools (create_agent, update_agent, delete_agent, write_agent_code, get_agent_code, ...) + agentic loop
    process-manager.ts  - Spawn (runtime-aware), env inject, log capture/flush, timeout, orphan cleanup, self-healing
    scheduler.ts        - node-cron per agent
    cost-tracker.ts     - Cost aggregation queries
    consensus.ts        - Multi-agent evaluation
  lib/
    agent-bundler.ts    - esbuild wrapper; BLESSED_DEPENDENCIES list; externalizes blessed deps; returns { bundle, hash, error }. Walks up to find zoogent root for RESOLVE_DIR + NODE_PATH.
    agent-code.ts       - setAgentCode/getAgentCode/materializeAgentCode/removeAgentCodeFile. Materialization uses sha256 marker file to skip re-writes.
  routes/
    api-agents.ts       - Agent CRUD + PUT/GET /code + assign/unassign skill + agent store + integrations (unified auth)
    api-chat.ts         - POST /api/teams/:teamId/chat (SSE streaming) + history (unified auth)
    api-report.ts       - Cost/memory/heartbeat/knowledge/store reporting (unified auth)
    api-tasks.ts        - Task broker (unified auth)
    api-skills.ts       - Skill CRUD from DB (unified auth)
    api-memory.ts       - Memory CRUD + FTS5 search (unified auth)
    api-teams.ts        - Team CRUD + members + team settings (unified auth)
    api-llms.ts         - AI-readable docs (/llms.txt, /llms-full.txt, /llms-agent-guide.txt)
    auth.ts             - Better Auth handler
    pages.tsx           - All HTML page routes + POST handlers
  views/
    layout.tsx          - HTML shell (header, nav: Teams / Members / Settings, theme toggle)
    chat.tsx            - Architect chat (SSE streaming, bubbles, tool blocks, thinking indicator)
    settings.tsx        - Global settings (ZooGent API keys management)
    team-settings.tsx   - Per-team settings (Anthropic API key)
    dashboard.tsx       - Agent cards grid
    agent-detail.tsx    - Agent page (per-agent run numbers)
    skill-browser.tsx   - Skill tree
    teams.tsx           - Teams list page
    + login, setup, tasks, costs, memory, team-knowledge, members
  lib/
    auth-middleware.ts  - Unified auth (localhost bypass + API key from DB + session)
    integrations.ts     - Provider registry (UI hints for integration forms)
    team-utils.ts       - Shared helpers (getTeamAgentIds, agentBelongsToTeam)
    config.ts           - Centralized env defaults (dataDir, port, skillsDir)
    auth.ts             - Better Auth config
    crypto.ts           - AES-256-GCM encryption, encrypt/decrypt for strings, log sanitization
    skills.ts           - DB-first skill CRUD (team-scoped loadSkill)
    settings.ts         - Encrypted settings get/set (global server settings)
    memory.ts           - FTS5 search, composite scoring, Ebbinghaus decay
    time.ts             - Formatting helpers
  client/
    index.ts            - Agent SDK (tasks, reporting, store, skills, context)
```

## Versioning

Semver. Bump before every `npm publish`:
- `npm version patch` — bug fixes, small improvements
- `npm version minor` — new features, new API endpoints
- `npm version major` — breaking changes (1.0.0 = production-ready)

Never publish without bumping. `npm version` updates package.json and creates a git tag.

## Key Commands

```bash
npm run dev       # Development with watch mode
npm run build     # tsc + copy public
npm run start     # Production server
```

### CLI (installed via npm)

```bash
zoogent create <name>  # New project (creates dir, package.json, npm install, init)
zoogent init           # Initialize in current directory
zoogent start          # Start server (foreground)
zoogent start -d       # Start server (daemon, logs to data/zoogent.log)
zoogent stop           # Stop daemon (SIGTERM → 10s grace → SIGKILL)
zoogent status         # Check if running (PID, port)
zoogent logs [-f]      # View/follow server logs
zoogent mcp            # Start MCP server (stdio)
```

## Important Patterns

### Teams
- Each instance can have multiple teams
- Agents, skills, memory, knowledge, chat are team-scoped
- `teams` table: id, name, slug, budgetMonthlyCents (nullable)
- `team_members` table: user-team mapping
- `team_settings` table: per-team config (ANTHROPIC_API_KEY, auto_approve_knowledge)
- Team budget: monthly spending limit for all agents, checked before agent start

### URL Structure
- `/` → redirect to `/teams`
- `/teams` — teams list
- `/teams/:slug` — team dashboard (agents)
- `/teams/:slug/agents/:id`, `/teams/:slug/chat`, `/teams/:slug/skills`, etc.
- `/members`, `/settings` — global pages
- Header nav: Teams / Members / Settings
- Team sub-nav: Architect / Agents / Tasks / Costs / Skills / Memory / Knowledge / Settings

### Architect AI (`core/architect.ts`)
- Claude Sonnet with 11 function calling tools
- Tools: create_agent (runtime+source), update_agent, delete_agent, create_skill, assign_skill, list_agents, list_skills, trigger_agent, get_logs, write_agent_code (via setAgentCode → bundle → DB), get_agent_code
- System prompt built from `system_skills` table + current agent state for the team
- Lists only agents/skills belonging to the team
- Agentic loop: multiple tool_use blocks → collect all → send tool_results as one user message
- SSE streaming via `POST /api/teams/:teamId/chat` (uses Hono `streamSSE`)
- Chat history stored in `chat_messages` table (scoped by teamId)
- API key read from `team_settings`
- Self-healing: process-manager inserts error messages into chat on agent failure

### Skills
- Team skills in `skills` table (scoped by teamId, has `content` field)
- System skills in `system_skills` table (global, read-only, used by Architect AI)
- 6 system skills seeded on init/start: team-design, agent-patterns, code-generation, debugging, skill-writing, platform-rules
- `internal` field removed from `skills` table in v0.3
- MCP create_skill/update_skill use HTTP API (not filesystem)
- `createSkill()` in lib/skills.ts uses `onConflictDoUpdate` (upsert)

### Settings
- Three systems:
  - `settings` table — global server settings (BETTER_AUTH_SECRET etc.)
  - `team_settings` table — per-team settings (ANTHROPIC_API_KEY, auto_approve_knowledge)
  - `api_keys` table — named API keys for MCP/agent auth (managed in Settings UI)
- `getSetting(key)` / `setSetting(key, value, encrypt?)` / `deleteSetting(key)` for global settings (lib/settings.ts)
- Team settings managed via UI at `/teams/:slug/settings` and API: `PUT /api/teams/:teamId/settings/:key`
- API keys managed via UI at `/settings` — generate named keys, copy, revoke
- Values encrypted with AES-256-GCM using master key

### Auth (`lib/auth-middleware.ts`)
- Unified middleware `unifiedAuth` on all API routes
- Priority: localhost bypass → Bearer API key (checked against `api_keys` table) → session cookie
- API keys stored in `api_keys` table, not env vars — no `ZOOGENT_API_KEY` in .env needed
- **Never use `use('*', unifiedAuth)` on sub-routers mounted at `/`** — blocks all routes on remote servers
- Team-scoped routes use team middleware in index.ts that validates teamId and sets it in context
- Sub-routers read `c.get('teamId')`

### Process Manager (`core/process-manager.ts`)
- Race condition guard: `runningProcesses.set(agentId, null)` immediately before any await
- Early return paths must `runningProcesses.delete(agentId)`
- Streaming logs: flush stdout/stderr to DB every 5 seconds via setInterval
- Long-running agents: `type === 'long-running'` → default timeout = 0 (no timeout)
- Auto-restart: orphaned long-running agents restarted on server start (if enabled)
- Self-healing: error/timeout runs insert chat message for Architect
- Budget check: per-agent (`budgetMonthlyCents`) then per-team (`teams.budgetMonthlyCents`)
- `ANTHROPIC_API_KEY` injected from `team_settings` (falls back to process.env)
- `ZOOGENT_API_KEY` injected from `api_keys` table (first available key)
- `ZOOGENT_TEAM_ID` injected into agent env
- `ZOOGENT_SHARED_DIR` injected → `{dataDir}/teams/{teamId}/shared/` (created on spawn if missing)
- Agent integrations injected: `INTEGRATION_{NAME}_{FIELD}` + `ZOOGENT_INTEGRATIONS` JSON
- Team knowledge scoped by agent's teamId
- Cost tracker timestamp: compare in seconds (`Math.floor(date.getTime() / 1000)`) — Drizzle `mode: 'timestamp'` stores as seconds
- **Sandbox (always on)**: TypeScript agents spawn with `--permission --allow-fs-read=* --allow-fs-write={sharedDir} --max-old-space-size=512`. No child_process, no native addons. Write only to `ZOOGENT_SHARED_DIR`.

### 5 Communication Channels
1. **Tasks** — personal messages between agents (task payload)
2. **Team Knowledge** — shared board (agent proposes, human approves, all agents read)
3. **Memory** — personal diary (composite scored with Ebbinghaus decay)
4. **Store** — persistent key-value per agent (URLs, IDs, state between runs)
5. **Skills** — instructions from humans (DB-stored markdown, assigned to agents)

### Agent Store
- `agent_store` table: agentId + key (unique), value (JSON), optional expiresAt
- SDK: `storeGet(key)`, `storeSet(key, value, ttlSeconds?)`, `storeDelete(key)`, `storeKeys(prefix?)`
- API: `/api/report/store` (agent-side) + `/api/teams/:teamId/agents/:id/store` (dashboard/MCP)
- Cleanup: expired entries deleted on read/list and server start

### Agent Integrations
- `agent_integrations` table: agentId + name (unique), provider, credentials (encrypted JSON), enabled
- Multiple integrations per provider allowed (different names)
- API: `/api/teams/:teamId/agents/:agentId/integrations` (CRUD)
- UI: section on agent detail page
- Process manager injects env vars on agent start:
  - Individual: `INTEGRATION_{NAME}_{FIELD}` (e.g. `INTEGRATION_GOOGLE_MAPS_API_KEY`)
  - JSON: `ZOOGENT_INTEGRATIONS` — all integrations as one JSON object
- Provider registry in `src/lib/integrations.ts` — UI hints, not enforced
- Credentials encrypted with AES-256-GCM (same master key as settings)

### Memory System
- Composite scoring: `0.4 * recency + 0.3 * frequency + 0.3 * importance`
- Ebbinghaus decay: `relevance = importance * exp(-0.03 * days)` (~23 day half-life)
- Memories older than 90 days with importance < 7 filtered out
- FTS5 full-text search via `searchMemories()`

### Hono JSX + CSS
- All styles in `src/public/styles.css` (served via `/static/*`)
- **Build note**: `cp -r src/public dist/public` — delete `dist/public` before rebuild to avoid stale CSS
- **Responsive**: `@media (max-width: 768px)` breakpoint, grid classes (.grid-2, .grid-3, .grid-sidebar) collapse to 1 column
- **Dark theme**: all colors use CSS variables (no hardcoded hex), `--error` for destructive actions
- Inline scripts via Hono's `html` helper: `{html\`<script>...</script>\`}`
- Never use `<style>{...}</style>` in JSX — Hono escapes quotes

## Database

24 tables: 4 auth (Better Auth) + 20 app:
- `teams`, `team_members`, `team_settings`
- `agents` (has teamId, runtime, source, bundle, bundleHash, bundleError; command/args/cwd nullable — only set for runtime='exec')
- `agent_runs`, `cost_events`, `agent_tasks`
- `agent_skills`, `skills` (has teamId, has `content`, no `internal`)
- `agent_memories`, `agent_evaluations`, `team_knowledge` (has teamId)
- `agent_store` (key-value per agent)
- `agent_integrations` (3rd party API keys per agent, encrypted credentials)
- `api_keys` (named API keys for MCP/agent auth, managed in Settings UI)
- `chat_messages` (Architect chat history, has teamId)
- `settings` (encrypted key-value, global)
- `system_skills` (global, read-only, used by Architect AI)
- `team_code_library` (shared TS files, teamId + path unique; imported via `team:` prefix)

FTS5 virtual table for memory full-text search.

Migrations in `drizzle/` — applied on `start` via `runMigrations()`.

## API Routes

### Global routes (unified auth)
- `/api/teams` — CRUD teams
- `/api/system-skills` — Global system skills (read-only)
- `/api/report` — Agent-side API (cost, memory, heartbeat, knowledge, trigger, skill load, store)

### Team-scoped routes (team middleware validates teamId)
- `/api/teams/:teamId/agents` — Agent CRUD (POST accepts runtime + source or command) + PUT/GET /:id/code + trigger + enable/disable + runs + assign-skill + store + integrations
- `/api/teams/:teamId/chat` — POST (SSE stream) + GET/DELETE history
- `/api/teams/:teamId/tasks` — CRUD + checkout + evaluate
- `/api/teams/:teamId/skills` — CRUD from DB
- `/api/teams/:teamId/memory` — CRUD + FTS5 search
- `/api/teams/:teamId/costs` — Cost summary
- `/api/teams/:teamId/budget-status` — Budget per agent
- `/api/teams/:teamId/knowledge` — Team knowledge (list + approve + archive)
- `/api/teams/:teamId/code-library` — Team code library (GET list, POST upsert, GET/DELETE /file?path=)

## SDK Exports (`client/index.ts`)

```typescript
// Tasks
createTask, getMyTasks, checkoutTask, completeTask, failTask
// Reporting
reportCost, reportMemory, reportTeamKnowledge
// Context (reads env vars)
getGoal, getMemories, getSkills, getTeamKnowledge
// Store (own)
storeGet, storeSet, storeDelete, storeKeys
// Cross-agent store (read-only, same team)
crossStoreGet, crossStoreKeys
// Skills
loadSkill, loadSkills, loadSkillRemote
// Consensus
submitEvaluation
// Health
heartbeat
```

## Security

- Agent env vars: AES-256-GCM (master key at `data/secrets/master.key`)
- Settings: AES-256-GCM encrypted values in DB (global + team)
- `encrypt()`/`decrypt()` functions for individual strings (used by team_settings)
- API keys: stored in `api_keys` table, managed via Settings UI (not env vars)
- Unified auth: localhost bypass + API key from DB (constant-time compare) + session
- Path traversal protection on skill paths
- Log sanitization: strips API key patterns + agent env values
- SQLite PRAGMAs: WAL, synchronous=NORMAL, cache_size=8MB, busy_timeout=5s, foreign_keys=ON

## Task Planning Rules

Every task plan must include three parts:
1. **Implementation** — the feature/fix itself
2. **Tests** — add new or update existing tests (vitest)
3. **Documentation** — update CLAUDE.md, README.md, api-llms.ts as needed

Never skip tests or docs.

## Git

Never add "Co-Authored-By: Claude" to commits.
Commit without push by default.
