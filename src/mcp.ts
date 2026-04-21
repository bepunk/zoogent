import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// ─── HTTP Client ─────────────────────────────────────────────────────────────

const BASE = process.env.ZOOGENT_URL || `http://127.0.0.1:${process.env.PORT || '3200'}`;
const API_KEY = process.env.ZOOGENT_API_KEY || '';
const IS_REMOTE = !!process.env.ZOOGENT_URL;

async function api<T = any>(path: string, options?: RequestInit): Promise<{ data: T; ok: boolean; status: number }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options?.headers as Record<string, string>) || {}),
  };
  if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({})) as T;
  return { data, ok: res.ok, status: res.status };
}

function text(msg: string) {
  return { content: [{ type: 'text' as const, text: msg }] };
}

function json(data: any) {
  return text(JSON.stringify(data, null, 2));
}

// ─── Team Context ────────────────────────────────────────────────────────────

let currentTeamId: string | null = null;

function teamPath(path: string): string {
  if (!currentTeamId) throw new Error('No team selected. Call select_team first.');
  return `/api/teams/${currentTeamId}${path}`;
}

async function requireTeam() {
  if (!currentTeamId) {
    return text('No team selected. Call list_teams to see available teams, then select_team to pick one.');
  }
  return null;
}

// ─── MCP Server ──────────────────────────────────────────────────────────────

const server = new McpServer(
  { name: 'zoogent', version: '0.4.1' },
  {
    instructions: `ZooGent — AI agent team orchestrator.

WORKFLOW (build a team from scratch):
1. get_started — check connection and current state
2. create_team or select_team
3. get_agent_guide("team-design") — read Jobs-Roles-Flows methodology
4. For each role: create_skill
5. For each agent: create_agent with TypeScript source
   (read get_agent_guide("code-generation") for blessed imports + boilerplate)
6. assign_skill to wire skills to agents
7. trigger_agent + get_logs to test
8. Iterate: write_agent_code, update_agent

AGENT RUNTIMES:
- "typescript" (default, recommended): zoogent owns the code. Upload via create_agent or write_agent_code.
  Zoogent bundles with esbuild and runs via node. Allowed imports are the blessed set
  (see code-generation guide). Unknown imports fail at upload time with a clear error.
- "exec" (escape hatch): agent code lives outside zoogent. Provide command + args.
  Use only when wrapping binaries or non-TS stacks.

Default to typescript. It is the fast, LLM-native path.

Each team is isolated: own agents, skills, memory, API keys, knowledge.

Call get_started first.`,
  },
);

// ─── Get Started ────────────────────────────────────────────────────────────────

server.tool('get_started', 'Check ZooGent status, list teams, and guide the user through setup. Call this first.', {}, async () => {
  const mode = IS_REMOTE ? 'remote' : 'local';

  // Reachability check
  let serverRunning = false;
  try {
    const res = await fetch(`${BASE}/llms.txt`);
    serverRunning = res.ok;
  } catch {
    serverRunning = false;
  }

  if (!serverRunning) {
    if (IS_REMOTE) {
      return text(`Cannot reach remote server at ${BASE}.

Check that:
1. The server is running and accessible
2. ZOOGENT_URL is correct in your MCP config
3. ZOOGENT_API_KEY matches the server's key`);
    }
    return text(`Cannot reach local ZooGent at ${BASE}.

Run: npx zoogent start

Keep it running in a separate terminal. Once started, call get_started again.`);
  }

  const { data: teamsList } = await api<any[]>('/api/teams');
  const teams = Array.isArray(teamsList) ? teamsList : [];

  const connInfo = IS_REMOTE ? `Connected to REMOTE server: ${BASE}` : `Connected to LOCAL server: ${BASE}`;
  const dashboard = IS_REMOTE ? `Dashboard: ${BASE}` : `Dashboard: http://localhost:${process.env.PORT || '3200'}`;

  if (teams.length === 0) {
    return text(`${connInfo} (${mode} mode)
${dashboard}

No teams yet. Create one with create_team to get started.
Then call get_agent_guide("team-design") to learn how to design agent teams.`);
  }

  // Auto-select if only one team
  if (teams.length === 1) {
    currentTeamId = teams[0].id;
    const { data: agentsList } = await api<any[]>(teamPath('/agents'));
    const agentCount = Array.isArray(agentsList) ? agentsList.length : 0;

    return text(`${connInfo} (${mode} mode)
${dashboard}

Team "${teams[0].name}" auto-selected (${agentCount} agent${agentCount !== 1 ? 's' : ''}).

${agentCount === 0
      ? `No agents yet. Call get_agent_guide("team-design") to learn how to design a team, then ask the user what they want to automate.`
      : `Use list_agents to see current agents, or ask the user what they want to change.`}`);
  }

  const teamList = teams.map((t: any) => `  - ${t.name} (id: ${t.id}, slug: ${t.slug})`).join('\n');
  return text(`${connInfo} (${mode} mode)
${dashboard}

${teams.length} teams available:
${teamList}

Call select_team with a team ID to start working with a team.`);
});

// ─── Team Management ────────────────────────────────────────────────────────────

server.tool('list_teams', 'List all teams', {}, async () => {
  const { data, ok } = await api('/api/teams');
  if (!ok) return text('Failed to list teams');
  return json(data);
});

server.tool('create_team', 'Create a new team and auto-select it', {
  name: z.string().describe('Team display name'),
  slug: z.string().optional().describe('URL-friendly slug (auto-generated from name if omitted)'),
}, async ({ name, slug }) => {
  const teamSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const { data, ok } = await api('/api/teams', {
    method: 'POST',
    body: JSON.stringify({ name, slug: teamSlug }),
  });
  if (!ok) return text((data as any)?.error || 'Failed to create team');
  currentTeamId = (data as any).id;
  return text(`Team "${name}" created (id: ${(data as any).id}, slug: ${teamSlug}). Auto-selected.

Next: Call get_agent_guide("team-design") to learn how to design an agent team.`);
});

server.tool('select_team', 'Select a team to work with. All subsequent operations will be scoped to this team.', {
  teamId: z.string().describe('Team ID'),
}, async ({ teamId }) => {
  const { data, ok } = await api(`/api/teams/${teamId}`);
  if (!ok) return text('Team not found. Call list_teams to see available teams.');
  currentTeamId = teamId;
  return text(`Team "${(data as any).name}" selected. All operations now scoped to this team.`);
});

// ─── Agent Guide ────────────────────────────────────────────────────────────────

server.tool('get_agent_guide', 'Load design methodology and reference docs. Topics: team-design (Jobs-Roles-Flows), agent-patterns (boilerplate examples), code-generation (blessed deps, SDK API, import examples), skill-writing, debugging, platform-rules. Omit topic to read all. Call before designing agents.', {
  topic: z.string().optional().describe('Specific topic, or omit for all'),
}, async ({ topic }) => {
  if (topic) {
    const { data, ok } = await api(`/api/system-skills/system/${topic}.md`);
    if (!ok) return text(`Topic "${topic}" not found. Available: team-design, agent-patterns, code-generation, debugging, skill-writing, platform-rules`);
    return text((data as any).content);
  }
  const { data: skillsList } = await api<any[]>('/api/system-skills');
  if (!Array.isArray(skillsList)) return text('Failed to load guide');
  const contents: string[] = [];
  for (const s of skillsList) {
    const { data: full } = await api(`/api/system-skills/${s.path}`);
    if ((full as any)?.content) contents.push((full as any).content);
  }
  return text(contents.join('\n\n---\n\n'));
});

// ─── Agent Management ───────────────────────────────────────────────────────────

server.tool('list_agents', 'List all agents in the selected team with status, last run, monthly cost, and bundle readiness', {}, async () => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath('/agents'));
  if (!ok) return text('Failed to list agents');
  return json(data);
});

server.tool('get_agent', 'Get agent details including runs, skills, and bundle status', {
  id: z.string().describe('Agent ID'),
}, async ({ id }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath(`/agents/${encodeURIComponent(id)}`));
  if (!ok) return text((data as any)?.error || 'Agent not found');
  return json(data);
});

server.tool('create_agent',
  'Register a new agent. Default runtime is "typescript": provide `source` with TS code (zoogent bundles and stores it; the agent is ready to run). Omit source to register the agent and upload code later via write_agent_code. For binaries or non-TS scripts use runtime="exec" with `command` and `args`. After create: assign_skill, then trigger_agent to test.',
  {
    id: z.string().describe('Unique agent ID (alphanumeric, dashes, underscores)'),
    name: z.string().describe('Display name'),
    runtime: z.enum(['typescript', 'exec']).optional().describe('Default "typescript"'),
    source: z.string().optional().describe('TypeScript source (typescript runtime). Bundled on create.'),
    command: z.string().optional().describe('Executable (exec runtime)'),
    args: z.array(z.string()).optional().describe('Command args (exec runtime)'),
    cwd: z.string().optional().describe('Working directory (exec runtime)'),
    type: z.enum(['cron', 'long-running', 'manual']).optional().describe('Default "manual"'),
    cronSchedule: z.string().optional().describe('Cron expression, e.g. "0 */2 * * *"'),
    goal: z.string().optional().describe('Permanent mission/objective for the agent'),
    model: z.string().optional().describe('AI model (e.g. "claude-sonnet-4-6")'),
    description: z.string().optional(),
    budgetMonthlyCents: z.number().optional(),
    wakeOnAssignment: z.boolean().optional(),
    timeoutSec: z.number().optional().describe('0 = no timeout'),
    graceSec: z.number().optional(),
  },
  async (params) => {
    const err = await requireTeam(); if (err) return err;
    const { data, ok } = await api(teamPath('/agents'), {
      method: 'POST',
      body: JSON.stringify(params),
    });
    if (!ok) {
      const details = (data as any)?.details;
      return text(`Failed to create agent: ${(data as any)?.error || 'unknown'}${details ? '\n' + details : ''}`);
    }
    return text(`Agent "${params.id}" created (${(data as any).runtime})`);
  }
);

server.tool('update_agent', 'Update agent configuration (not code — use write_agent_code for source).', {
  id: z.string(),
  name: z.string().optional(), description: z.string().optional(),
  goal: z.string().optional(), model: z.string().optional(),
  type: z.enum(['cron', 'long-running', 'manual']).optional(),
  cronSchedule: z.string().optional(), enabled: z.boolean().optional(),
  budgetMonthlyCents: z.number().optional(), wakeOnAssignment: z.boolean().optional(),
  timeoutSec: z.number().optional(), graceSec: z.number().optional(),
  // exec runtime only
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
}, async ({ id, ...updates }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath(`/agents/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  if (!ok) return text((data as any)?.error || 'Failed to update agent');
  return text(`Agent "${id}" updated`);
});

server.tool('delete_agent', 'Remove an agent and its code', {
  id: z.string(),
}, async ({ id }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath(`/agents/${encodeURIComponent(id)}`), { method: 'DELETE' });
  if (!ok) return text((data as any)?.error || 'Failed to delete agent');
  return text(`Agent "${id}" deleted`);
});

server.tool('enable_agent', 'Enable an agent and reschedule', {
  id: z.string(),
}, async ({ id }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath(`/agents/${encodeURIComponent(id)}/enable`), { method: 'POST' });
  if (!ok) return text((data as any)?.error || 'Failed to enable agent');
  return text(`Agent "${id}" enabled`);
});

server.tool('disable_agent', 'Disable an agent and unschedule', {
  id: z.string(),
}, async ({ id }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath(`/agents/${encodeURIComponent(id)}/disable`), { method: 'POST' });
  if (!ok) return text((data as any)?.error || 'Failed to disable agent');
  return text(`Agent "${id}" disabled`);
});

server.tool('trigger_agent', 'Manually trigger an agent run. Requires the agent to have runnable code (typescript: uploaded source; exec: command set).', {
  id: z.string(),
}, async ({ id }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath(`/agents/${encodeURIComponent(id)}/trigger`), { method: 'POST' });
  if (!ok) return text((data as any)?.error || 'Agent not available (disabled, running, over budget, or no code)');
  return text(`Run started: runId=${(data as any).runId}`);
});

server.tool('get_logs', 'Get stdout/stderr for an agent run', {
  agentId: z.string(),
  runId: z.number().optional().describe('Specific run ID. If omitted, returns latest run.'),
}, async ({ agentId, runId }) => {
  const err = await requireTeam(); if (err) return err;
  if (runId) {
    const { data, ok } = await api(teamPath(`/agents/${encodeURIComponent(agentId)}/runs/${runId}`));
    if (!ok) return text((data as any)?.error || 'Run not found');
    return json({
      runId: (data as any).id, status: (data as any).status, trigger: (data as any).trigger,
      startedAt: (data as any).startedAt, durationMs: (data as any).durationMs,
      exitCode: (data as any).exitCode,
      stdout: (data as any).stdout || '(empty)', stderr: (data as any).stderr || '(empty)',
    });
  }
  const { data: runs, ok } = await api(teamPath(`/agents/${encodeURIComponent(agentId)}/runs?limit=1`));
  if (!ok || !Array.isArray(runs) || runs.length === 0) return text('No runs found');
  const run = runs[0] as any;
  return json({
    runId: run.id, status: run.status, trigger: run.trigger,
    startedAt: run.startedAt, durationMs: run.durationMs,
    exitCode: run.exitCode,
    stdout: run.stdout || '(empty)', stderr: run.stderr || '(empty)',
  });
});

// ─── Agent Code (typescript runtime) ────────────────────────────────────────────

server.tool('write_agent_code',
  'Upload TypeScript source for a typescript-runtime agent. Zoogent bundles with esbuild and replaces the stored code atomically. Returns esbuild errors on failure (e.g. unknown import — not in the blessed deps list). Does not apply to exec-runtime agents. Use to iterate after create_agent.',
  {
    id: z.string().describe('Agent ID'),
    source: z.string().describe('Full TypeScript source code'),
  },
  async ({ id, source }) => {
    const err = await requireTeam(); if (err) return err;
    const { data, ok } = await api(teamPath(`/agents/${encodeURIComponent(id)}/code`), {
      method: 'PUT',
      body: JSON.stringify({ source }),
    });
    if (!ok) {
      const details = (data as any)?.details;
      return text(`Bundle failed: ${(data as any)?.error || 'unknown'}${details ? '\n' + details : ''}`);
    }
    const warns = (data as any)?.warnings ?? [];
    const warnText = warns.length > 0 ? `\nWarnings: ${warns.join('; ')}` : '';
    return text(`Code uploaded for "${id}" (hash: ${((data as any).hash as string).slice(0, 12)}).${warnText}`);
  }
);

server.tool('get_agent_code', 'Read the current TypeScript source and bundle status for an agent. Use to inspect before editing.', {
  id: z.string().describe('Agent ID'),
}, async ({ id }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath(`/agents/${encodeURIComponent(id)}/code`));
  if (!ok) return text((data as any)?.error || 'Failed to get code');
  return json(data);
});

// ─── Skills ─────────────────────────────────────────────────────────────────────

server.tool('list_skills', 'List all skills in the selected team', {}, async () => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath('/skills'));
  if (!ok) return text('Failed to list skills');
  return json(data);
});

server.tool('get_skill', 'Get skill content and metadata', {
  path: z.string().describe('Skill path (e.g., "tactics/comment-writing.md")'),
}, async ({ path: skillPath }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath(`/skills/${skillPath}`));
  if (!ok) return text((data as any)?.error || 'Skill not found');
  return json(data);
});

server.tool('create_skill', 'Create a new skill in the selected team', {
  path: z.string().describe('Skill path (e.g., "monitoring/twitter.md")'),
  name: z.string(), description: z.string(),
  content: z.string().describe('Markdown content (without frontmatter)'),
  category: z.string().optional(),
  related: z.array(z.string()).optional(),
}, async (params) => {
  const err = await requireTeam(); if (err) return err;
  const relatedYaml = params.related?.length ? `\nrelated: ${JSON.stringify(params.related)}` : '';
  const fullContent = `---\nname: ${params.name}\ndescription: ${params.description}\ncategory: ${params.category || 'general'}${relatedYaml}\n---\n\n${params.content}\n`;

  const { data, ok } = await api(teamPath('/skills'), {
    method: 'POST',
    body: JSON.stringify({ path: params.path, name: params.name, description: params.description, content: fullContent, category: params.category, related: params.related }),
  });
  if (!ok) return text((data as any)?.error || 'Failed to create skill');
  return text(`Skill created: ${params.path}`);
});

server.tool('update_skill', 'Update skill content', {
  path: z.string(), content: z.string().describe('Full file content including frontmatter'),
}, async ({ path: skillPath, content }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath(`/skills/${skillPath}`), {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
  if (!ok) return text((data as any)?.error || 'Failed to update skill');
  return text(`Skill updated: ${skillPath}`);
});

server.tool('assign_skill', 'Assign a skill to an agent', {
  agentId: z.string(), skillPath: z.string(),
}, async ({ agentId, skillPath }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok, status } = await api(teamPath(`/agents/${encodeURIComponent(agentId)}/assign-skill`), {
    method: 'POST',
    body: JSON.stringify({ skillPath }),
  });
  if (status === 409) return text('Skill already assigned');
  if (!ok) return text((data as any)?.error || 'Failed to assign skill');
  return text(`Skill "${skillPath}" assigned to "${agentId}"`);
});

server.tool('unassign_skill', 'Remove a skill from an agent', {
  agentId: z.string(), skillPath: z.string(),
}, async ({ agentId, skillPath }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath(`/agents/${encodeURIComponent(agentId)}/unassign-skill`), {
    method: 'POST',
    body: JSON.stringify({ skillPath }),
  });
  if (!ok) return text((data as any)?.error || 'Failed to unassign skill');
  return text(`Skill "${skillPath}" removed from "${agentId}"`);
});

// ─── Memory ─────────────────────────────────────────────────────────────────────

server.tool('get_memories', 'Get agent memories, optionally filtered by tags or search', {
  agentId: z.string(), limit: z.number().optional(),
  tags: z.array(z.string()).optional(),
  search: z.string().optional().describe('Full-text search query'),
}, async ({ agentId, limit, search }) => {
  const err = await requireTeam(); if (err) return err;
  const params = new URLSearchParams({ agentId });
  if (limit) params.set('limit', String(limit));
  if (search) params.set('search', search);
  const { data, ok } = await api(teamPath(`/memory?${params}`));
  if (!ok) return text('Failed to get memories');
  return json(data);
});

server.tool('add_memory', 'Add a memory entry for an agent', {
  agentId: z.string(), content: z.string(),
  importance: z.number().min(0).max(10).optional(),
  tags: z.array(z.string()).optional(),
}, async (params) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath('/memory'), {
    method: 'POST',
    body: JSON.stringify(params),
  });
  if (!ok) return text((data as any)?.error || 'Failed to add memory');
  return text(`Memory added: id=${(data as any).id}`);
});

server.tool('update_memory', 'Update an existing memory', {
  id: z.number(), content: z.string().optional(),
  importance: z.number().optional(), active: z.boolean().optional(),
}, async ({ id, ...updates }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath(`/memory/${id}`), {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  if (!ok) return text((data as any)?.error || 'Failed to update memory');
  return text(`Memory ${id} updated`);
});

server.tool('delete_memory', 'Delete a memory entry', {
  id: z.number(),
}, async ({ id }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath(`/memory/${id}`), { method: 'DELETE' });
  if (!ok) return text((data as any)?.error || 'Failed to delete memory');
  return text(`Memory ${id} deleted`);
});

// ─── Tasks ──────────────────────────────────────────────────────────────────────

server.tool('create_task', 'Create a task for an agent', {
  agentId: z.string(), title: z.string(),
  payload: z.any().optional(),
  consensus: z.boolean().optional(),
  consensusAgents: z.array(z.string()).optional(),
  consensusStrategy: z.enum(['majority', 'unanimous', 'average_score']).optional(),
}, async (params) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath('/tasks'), {
    method: 'POST',
    body: JSON.stringify(params),
  });
  if (!ok) return text((data as any)?.error || 'Failed to create task');
  return text(`Task created: id=${(data as any).id}`);
});

server.tool('list_tasks', 'List tasks, optionally filtered', {
  agentId: z.string().optional(), status: z.string().optional(),
}, async ({ agentId, status }) => {
  const err = await requireTeam(); if (err) return err;
  const params = new URLSearchParams();
  if (agentId) params.set('agentId', agentId);
  if (status) params.set('status', status);
  const { data, ok } = await api(teamPath(`/tasks?${params}`));
  if (!ok) return text('Failed to list tasks');
  return json(data);
});

server.tool('get_task', 'Get task details including evaluations', {
  id: z.number(),
}, async ({ id }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath(`/tasks/${id}`));
  if (!ok) return text((data as any)?.error || 'Task not found');
  return json(data);
});

// ─── Costs ──────────────────────────────────────────────────────────────────────

server.tool('get_costs', 'Get cost summary by agent and model', {
  days: z.number().optional().describe('Number of days to look back'),
  agentId: z.string().optional(),
}, async ({ days, agentId }) => {
  const err = await requireTeam(); if (err) return err;
  const params = new URLSearchParams();
  if (days) params.set('days', String(days));
  if (agentId) params.set('agentId', agentId);
  const { data, ok } = await api(teamPath(`/costs?${params}`));
  if (!ok) return text('Failed to get costs');
  return json(data);
});

server.tool('get_budget_status', 'Get spending vs budget for all agents', {}, async () => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath('/budget-status'));
  if (!ok) return text('Failed to get budget status');
  return json(data);
});

// ─── Team Knowledge ─────────────────────────────────────────────────────────────

server.tool('list_team_knowledge', 'List team knowledge entries', {
  status: z.enum(['draft', 'active', 'archived']).optional(),
}, async ({ status }) => {
  const err = await requireTeam(); if (err) return err;
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const { data, ok } = await api(teamPath(`/knowledge?${params}`));
  if (!ok) return text('Failed to list team knowledge');
  return json(data);
});

server.tool('approve_knowledge', 'Approve a draft team knowledge entry', {
  id: z.number(),
}, async ({ id }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath(`/knowledge/${id}/approve`), { method: 'POST' });
  if (!ok) return text((data as any)?.error || 'Failed to approve');
  return text(`Knowledge ${id} approved`);
});

server.tool('archive_knowledge', 'Archive a team knowledge entry', {
  id: z.number(),
}, async ({ id }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath(`/knowledge/${id}/archive`), { method: 'POST' });
  if (!ok) return text((data as any)?.error || 'Failed to archive');
  return text(`Knowledge ${id} archived`);
});

// ─── Agent Integrations ─────────────────────────────────────────────────────────

server.tool('list_integrations', 'List integrations for an agent (credentials masked)', {
  agentId: z.string(),
}, async ({ agentId }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath(`/agents/${agentId}/integrations`));
  if (!ok) return text((data as any)?.error || 'Failed to list integrations');
  return json(data);
});

server.tool('create_integration', 'Add an integration (3rd party API key) to an agent. Env vars are injected on spawn as INTEGRATION_{NAME}_{FIELD}.', {
  agentId: z.string(),
  provider: z.string().describe('Provider type: gmail, google_maps, hunter_io, telegram, tavily, custom'),
  name: z.string().describe('Unique slug for this integration (lowercase alphanumeric + underscore)'),
  credentials: z.record(z.string(), z.string()).describe('Key-value credentials object, e.g. { "apiKey": "sk-..." }'),
}, async ({ agentId, provider, name, credentials }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath(`/agents/${agentId}/integrations`), {
    method: 'POST',
    body: JSON.stringify({ provider, name, credentials }),
  });
  if (!ok) return text((data as any)?.error || 'Failed to create integration');
  return json(data);
});

server.tool('delete_integration', 'Remove an integration from an agent', {
  agentId: z.string(),
  integrationId: z.string(),
}, async ({ agentId, integrationId }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath(`/agents/${agentId}/integrations/${integrationId}`), { method: 'DELETE' });
  if (!ok) return text((data as any)?.error || 'Failed to delete integration');
  return text('Integration deleted');
});

// ─── Start ──────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
