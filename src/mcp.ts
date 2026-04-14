import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

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
  { name: 'zoogent', version: '0.3.0' },
  {
    instructions: `You are connected to ZooGent — an AI agent team orchestrator.

FIRST: Call list_teams to see available teams, then select_team to pick one.
If no teams exist, call create_team to create one.

Before designing agents, call get_agent_guide() to load the design methodology.

YOUR ROLE: Design and manage agent teams. Create agents, write skills, generate code, test, and deploy.

Each team is isolated — its own agents, skills, memory, knowledge, and API keys.

WORKFLOW:
1. select_team (or create_team)
2. get_agent_guide("team-design") — learn the Jobs-Roles-Flows methodology
3. Design the team with the user
4. create_skill — write instructions for each role
5. create_agent / scaffold_agent — register agents
6. trigger_agent + get_logs — test
7. Iterate until the team works`,
  },
);

// ─── Get Started ────────────────────────────────────────────────────────────────

server.tool('get_started', 'Check ZooGent status, list teams, and guide the user through setup. Call this first.', {}, async () => {
  const mode = IS_REMOTE ? 'remote' : 'local';

  // For local mode, check if init was done
  if (!IS_REMOTE) {
    const dbPath = process.env.DATABASE_URL || './data/zoogent.db';
    if (!existsSync(dbPath)) {
      return text(`ZooGent is not initialized yet.

Run these commands to set it up:

  npx zoogent init
  npx zoogent start

After that, I can help you build your agent team.`);
    }
  }

  // Check if server is reachable
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
    return text(`ZooGent is installed but the server is not running.

Run: npx zoogent start

Keep it running in a separate terminal. Once started, I can help you build your agent team.`);
  }

  // List teams
  const { data: teamsList } = await api<any[]>('/api/teams');
  const teams = Array.isArray(teamsList) ? teamsList : [];

  const connInfo = IS_REMOTE ? `Connected to REMOTE server: ${BASE}` : `Connected to LOCAL server: ${BASE}`;
  const dashboard = IS_REMOTE ? `Dashboard: ${BASE}` : `Dashboard: http://localhost:${process.env.PORT || '3200'}`;

  if (teams.length === 0) {
    return text(`${connInfo} (${mode} mode)
${dashboard}

No teams yet. Create one with create_team to get started.
Then call get_agent_guide() to learn how to design agent teams.`);
  }

  // Auto-select if only one team
  if (teams.length === 1) {
    currentTeamId = teams[0].id;
    const { data: agentsList } = await api<any[]>(teamPath('/agents'));
    const agentCount = Array.isArray(agentsList) ? agentsList.length : 0;

    return text(`${connInfo} (${mode} mode)
${dashboard}

Team "${teams[0].name}" auto-selected (${agentCount} agent${agentCount !== 1 ? 's' : ''}).

${agentCount === 0 ? `No agents yet. Call get_agent_guide("team-design") to learn how to design a team, then ask the user what they want to automate.` : `Use list_agents to see current agents, or ask the user what they want to change.`}`);
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
  if (!ok) return text(data?.error || 'Failed to create team');
  currentTeamId = data.id;
  return text(`Team "${name}" created (id: ${data.id}, slug: ${teamSlug}). Auto-selected.

Next: Call get_agent_guide("team-design") to learn how to design an agent team.`);
});

server.tool('select_team', 'Select a team to work with. All subsequent operations will be scoped to this team.', {
  teamId: z.string().describe('Team ID'),
}, async ({ teamId }) => {
  const { data, ok } = await api(`/api/teams/${teamId}`);
  if (!ok) return text('Team not found. Call list_teams to see available teams.');
  currentTeamId = teamId;
  return text(`Team "${data.name}" selected. All operations now scoped to this team.`);
});

// ─── Agent Guide ────────────────────────────────────────────────────────────────

server.tool('get_agent_guide', 'Load design methodology and best practices for building agent teams. Call before designing agents.', {
  topic: z.string().optional().describe('Specific topic: team-design, agent-patterns, code-generation, debugging, skill-writing, platform-rules. Omit for all.'),
}, async ({ topic }) => {
  if (topic) {
    const { data, ok } = await api(`/api/system-skills/system/${topic}.md`);
    if (!ok) return text(`Topic "${topic}" not found. Available: team-design, agent-patterns, code-generation, debugging, skill-writing, platform-rules`);
    return text(data.content);
  }
  const { data: skillsList } = await api<any[]>('/api/system-skills');
  if (!Array.isArray(skillsList)) return text('Failed to load guide');
  const contents: string[] = [];
  for (const s of skillsList) {
    const { data: full } = await api(`/api/system-skills/${s.path}`);
    if (full?.content) contents.push(full.content);
  }
  return text(contents.join('\n\n---\n\n'));
});

// ─── Agent Management ───────────────────────────────────────────────────────────

server.tool('list_agents', 'List all agents in the selected team with status, last run, and monthly cost', {}, async () => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath('/agents'));
  if (!ok) return text('Failed to list agents');
  return json(data);
});

server.tool('get_agent', 'Get agent details including runs, skills, and memories', {
  id: z.string().describe('Agent ID'),
}, async ({ id }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath(`/agents/${encodeURIComponent(id)}`));
  if (!ok) return text(data?.error || 'Agent not found');
  return json(data);
});

server.tool('create_agent', 'Register a new agent in the selected team', {
  id: z.string().describe('Unique agent ID (e.g., "scout", "writer")'),
  name: z.string().describe('Display name'),
  command: z.string().describe('Command to run (e.g., "npx")'),
  args: z.array(z.string()).optional().describe('Command arguments (e.g., ["tsx", "agent.ts"])'),
  cwd: z.string().optional().describe('Working directory'),
  type: z.enum(['cron', 'long-running', 'manual']).optional(),
  cronSchedule: z.string().optional().describe('Cron expression (e.g., "0 */2 * * *")'),
  env: z.record(z.string(), z.string()).optional().describe('Environment variables'),
  budgetMonthlyCents: z.number().optional(),
  wakeOnAssignment: z.boolean().optional(),
  description: z.string().optional(),
  goal: z.string().optional().describe('Permanent mission/objective for the agent'),
  model: z.string().optional().describe('AI model the agent uses (e.g., "claude-sonnet-4-6")'),
  timeoutSec: z.number().optional().describe('Timeout in seconds (0 = no timeout, default 600)'),
  graceSec: z.number().optional().describe('Grace period before SIGKILL after timeout (default 30)'),
}, async (params) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath('/agents'), {
    method: 'POST',
    body: JSON.stringify(params),
  });
  if (!ok) return text(data?.error || 'Failed to create agent');
  return text(`Agent "${params.id}" created successfully`);
});

server.tool('update_agent', 'Update agent configuration', {
  id: z.string(),
  name: z.string().optional(), description: z.string().optional(),
  command: z.string().optional(), args: z.array(z.string()).optional(),
  cwd: z.string().optional(), type: z.enum(['cron', 'long-running', 'manual']).optional(),
  cronSchedule: z.string().optional(), enabled: z.boolean().optional(),
  budgetMonthlyCents: z.number().optional(), wakeOnAssignment: z.boolean().optional(),
  env: z.record(z.string(), z.string()).optional(),
  goal: z.string().optional(), model: z.string().optional(),
  timeoutSec: z.number().optional(), graceSec: z.number().optional(),
}, async ({ id, ...updates }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath(`/agents/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  if (!ok) return text(data?.error || 'Failed to update agent');
  return text(`Agent "${id}" updated`);
});

server.tool('delete_agent', 'Remove an agent', {
  id: z.string(),
}, async ({ id }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath(`/agents/${encodeURIComponent(id)}`), { method: 'DELETE' });
  if (!ok) return text(data?.error || 'Failed to delete agent');
  return text(`Agent "${id}" deleted`);
});

server.tool('enable_agent', 'Enable an agent and reschedule', {
  id: z.string(),
}, async ({ id }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath(`/agents/${encodeURIComponent(id)}/enable`), { method: 'POST' });
  if (!ok) return text(data?.error || 'Failed to enable agent');
  return text(`Agent "${id}" enabled`);
});

server.tool('disable_agent', 'Disable an agent and unschedule', {
  id: z.string(),
}, async ({ id }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath(`/agents/${encodeURIComponent(id)}/disable`), { method: 'POST' });
  if (!ok) return text(data?.error || 'Failed to disable agent');
  return text(`Agent "${id}" disabled`);
});

server.tool('trigger_agent', 'Manually trigger an agent run', {
  id: z.string(),
}, async ({ id }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath(`/agents/${encodeURIComponent(id)}/trigger`), { method: 'POST' });
  if (!ok) return text(data?.error || 'Agent not available (disabled, running, or over budget)');
  return text(`Run started: runId=${data.runId}`);
});

server.tool('get_logs', 'Get stdout/stderr for an agent run', {
  agentId: z.string(),
  runId: z.number().optional().describe('Specific run ID. If omitted, returns latest run.'),
}, async ({ agentId, runId }) => {
  const err = await requireTeam(); if (err) return err;
  if (runId) {
    const { data, ok } = await api(teamPath(`/agents/${encodeURIComponent(agentId)}/runs/${runId}`));
    if (!ok) return text(data?.error || 'Run not found');
    return json({
      runId: data.id, status: data.status, trigger: data.trigger,
      startedAt: data.startedAt, durationMs: data.durationMs,
      exitCode: data.exitCode,
      stdout: data.stdout || '(empty)', stderr: data.stderr || '(empty)',
    });
  }
  const { data: runs, ok } = await api(teamPath(`/agents/${encodeURIComponent(agentId)}/runs?limit=1`));
  if (!ok || !Array.isArray(runs) || runs.length === 0) return text('No runs found');
  const run = runs[0];
  return json({
    runId: run.id, status: run.status, trigger: run.trigger,
    startedAt: run.startedAt, durationMs: run.durationMs,
    exitCode: run.exitCode,
    stdout: run.stdout || '(empty)', stderr: run.stderr || '(empty)',
  });
});

// ─── Scaffolding ────────────────────────────────────────────────────────────────

server.tool('scaffold_agent', 'Generate a boilerplate agent script, register it in ZooGent, and assign skills', {
  id: z.string().describe('Agent ID'),
  name: z.string().describe('Display name'),
  description: z.string().optional(),
  skills: z.array(z.string()).optional().describe('Skill paths to assign'),
  outputDir: z.string().optional().describe('Directory for the generated script (default: ./agents)'),
}, async (params) => {
  const err = await requireTeam(); if (err) return err;

  // Register agent via HTTP
  const { data: existingAgent } = await api(teamPath(`/agents/${encodeURIComponent(params.id)}`));
  if (!existingAgent || existingAgent.error) {
    await api(teamPath('/agents'), {
      method: 'POST',
      body: JSON.stringify({
        id: params.id, name: params.name, command: 'node',
        args: ['--experimental-strip-types', `agents/${params.id}.ts`],
        type: 'manual', description: params.description ?? null,
      }),
    });
  }

  // Assign skills via HTTP
  if (params.skills) {
    for (const skillPath of params.skills) {
      await api(teamPath(`/agents/${encodeURIComponent(params.id)}/assign-skill`), {
        method: 'POST',
        body: JSON.stringify({ skillPath }),
      });
    }
  }

  // Generate script (local filesystem)
  const skillImports = (params.skills || [])
    .map(s => `  const ${s.replace(/[^a-zA-Z0-9]/g, '_')} = loadSkill('${s}');`)
    .join('\n');

  const script = `import { getMyTasks, checkoutTask, completeTask, reportCost, reportMemory, getMemories, getSkills, getGoal, getTeamKnowledge, loadSkill, reportTeamKnowledge } from 'zoogent/client';

// Agent context (auto-injected by ZooGent)
const goal = getGoal();                    // Your mission
const skills = getSkills();                // Required skills content
const memories = getMemories();            // Past learnings
const teamKnowledge = getTeamKnowledge();  // Shared team insights

// Additional skills (loaded on-demand)
${skillImports || '// const extraSkill = loadSkill("path/to/skill.md");'};

async function main() {
  const tasks = await getMyTasks();

  for (const task of tasks) {
    const locked = await checkoutTask(task.id);
    if (!locked) continue;

    try {
      // TODO: Implement ${params.name} logic here
      const payload = task.payload ? JSON.parse(task.payload) : {};

      console.log(\`Processing task \${task.id}: \${task.title}\`);

      // Report cost after AI calls
      // await reportCost({ model: 'claude-sonnet-4-6', inputTokens: 0, outputTokens: 0, costCents: 0 });

      // Report learnings
      // await reportMemory({ content: 'what I learned', importance: 5, tags: ['tag'] });

      await completeTask(task.id, JSON.stringify({ status: 'done' }));
    } catch (err) {
      console.error(\`Task \${task.id} failed:\`, err);
      await completeTask(task.id, JSON.stringify({ error: String(err) }));
    }
  }
}

main().catch(console.error);
`;

  const outDir = params.outputDir || './agents';
  const outPath = resolve(outDir, `${params.id}.ts`);

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  if (existsSync(outPath)) {
    return text(`Agent "${params.id}" registered. Script already exists at ${outPath}, not overwritten.`);
  }

  writeFileSync(outPath, script);

  return text(`Agent "${params.id}" scaffolded:\n- Registered in ZooGent\n- Script: ${outPath}\n- Skills: ${(params.skills || []).join(', ') || 'none'}\n\nEdit the script, then run: trigger_agent("${params.id}")`);
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
  if (!ok) return text(data?.error || 'Skill not found');
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
  if (!ok) return text(data?.error || 'Failed to create skill');
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
  if (!ok) return text(data?.error || 'Failed to update skill');
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
  if (!ok) return text(data?.error || 'Failed to assign skill');
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
  if (!ok) return text(data?.error || 'Failed to unassign skill');
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
  if (!ok) return text(data?.error || 'Failed to add memory');
  return text(`Memory added: id=${data.id}`);
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
  if (!ok) return text(data?.error || 'Failed to update memory');
  return text(`Memory ${id} updated`);
});

server.tool('delete_memory', 'Delete a memory entry', {
  id: z.number(),
}, async ({ id }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath(`/memory/${id}`), { method: 'DELETE' });
  if (!ok) return text(data?.error || 'Failed to delete memory');
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
  if (!ok) return text(data?.error || 'Failed to create task');
  return text(`Task created: id=${data.id}`);
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
  if (!ok) return text(data?.error || 'Task not found');
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
  if (!ok) return text(data?.error || 'Failed to approve');
  return text(`Knowledge ${id} approved`);
});

server.tool('archive_knowledge', 'Archive a team knowledge entry', {
  id: z.number(),
}, async ({ id }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath(`/knowledge/${id}/archive`), { method: 'POST' });
  if (!ok) return text(data?.error || 'Failed to archive');
  return text(`Knowledge ${id} archived`);
});

// ─── Agent Integrations ─────────────────────────────────────────────────────────

server.tool('list_integrations', 'List integrations for an agent (credentials masked)', {
  agentId: z.string(),
}, async ({ agentId }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath(`/agents/${agentId}/integrations`));
  if (!ok) return text(data?.error || 'Failed to list integrations');
  return json(data);
});

server.tool('create_integration', 'Add an integration (3rd party API key) to an agent', {
  agentId: z.string(),
  provider: z.string().describe('Provider type: gmail, google_maps, hunter_io, telegram, tavily, custom'),
  name: z.string().describe('Unique slug for this integration (e.g. gmail_support). Used as env var prefix: INTEGRATION_{NAME}_{FIELD}'),
  credentials: z.record(z.string(), z.string()).describe('Key-value credentials object, e.g. { "apiKey": "sk-..." }'),
}, async ({ agentId, provider, name, credentials }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath(`/agents/${agentId}/integrations`), {
    method: 'POST',
    body: JSON.stringify({ provider, name, credentials }),
  });
  if (!ok) return text(data?.error || 'Failed to create integration');
  return json(data);
});

server.tool('delete_integration', 'Remove an integration from an agent', {
  agentId: z.string(),
  integrationId: z.string(),
}, async ({ agentId, integrationId }) => {
  const err = await requireTeam(); if (err) return err;
  const { data, ok } = await api(teamPath(`/agents/${agentId}/integrations/${integrationId}`), { method: 'DELETE' });
  if (!ok) return text(data?.error || 'Failed to delete integration');
  return text('Integration deleted');
});

// ─── Start ──────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
