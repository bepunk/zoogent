import Anthropic from '@anthropic-ai/sdk';
import { eq, desc, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { agents, agentRuns, agentSkills, skills, chatMessages, systemSkills, teamSettings } from '../db/schema.js';
import { decrypt, loadMasterKey } from '../lib/crypto.js';
import { startAgent } from './process-manager.js';
import { refreshAgent } from './scheduler.js';
import cron from 'node-cron';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';

const MODEL = 'claude-sonnet-4-6';

// ─── Tools for Claude ────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_agents',
    description: 'List all registered agents with their config',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'create_agent',
    description: 'Register a new agent',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Unique agent ID (e.g., "scout")' },
        name: { type: 'string', description: 'Display name' },
        command: { type: 'string', description: 'Command to run (e.g., "node")' },
        args: { type: 'array', items: { type: 'string' }, description: 'Command arguments' },
        type: { type: 'string', enum: ['cron', 'long-running', 'manual'] },
        cronSchedule: { type: 'string', description: 'Cron expression' },
        goal: { type: 'string', description: 'Agent mission' },
        model: { type: 'string', description: 'AI model (e.g., "claude-sonnet-4-6")' },
        description: { type: 'string' },
        budgetMonthlyCents: { type: 'number' },
        wakeOnAssignment: { type: 'boolean' },
        timeoutSec: { type: 'number' },
      },
      required: ['id', 'name', 'command'],
    },
  },
  {
    name: 'update_agent',
    description: 'Update agent configuration',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string' },
        name: { type: 'string' }, description: { type: 'string' },
        goal: { type: 'string' }, model: { type: 'string' },
        type: { type: 'string', enum: ['cron', 'long-running', 'manual'] },
        cronSchedule: { type: 'string' }, enabled: { type: 'boolean' },
        budgetMonthlyCents: { type: 'number' }, timeoutSec: { type: 'number' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_skill',
    description: 'Create a new skill (markdown document with instructions for agents)',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Skill path (e.g., "tactics/writing.md")' },
        name: { type: 'string' },
        description: { type: 'string' },
        content: { type: 'string', description: 'Full markdown content including frontmatter' },
        category: { type: 'string' },
      },
      required: ['path', 'name', 'description', 'content'],
    },
  },
  {
    name: 'assign_skill',
    description: 'Assign a skill to an agent',
    input_schema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string' },
        skillPath: { type: 'string' },
      },
      required: ['agentId', 'skillPath'],
    },
  },
  {
    name: 'list_skills',
    description: 'List all available skills for this team',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'trigger_agent',
    description: 'Manually trigger an agent run',
    input_schema: {
      type: 'object' as const,
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'get_logs',
    description: 'Get stdout/stderr for an agent\'s latest run',
    input_schema: {
      type: 'object' as const,
      properties: { agentId: { type: 'string' } },
      required: ['agentId'],
    },
  },
  {
    name: 'write_agent_code',
    description: 'Write or update the TypeScript code for an agent script file',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Agent ID (file will be agents/{id}.ts)' },
        code: { type: 'string', description: 'Full TypeScript source code' },
      },
      required: ['id', 'code'],
    },
  },
];

// ─── Tool Execution ──────────────────────────────────────────────────────────

async function executeTool(name: string, input: any, teamId: string): Promise<string> {
  const db = getDb();

  switch (name) {
    case 'list_agents': {
      const all = db.select().from(agents).where(eq(agents.teamId, teamId)).all();
      return JSON.stringify(all.map(a => ({ ...a, env: undefined })), null, 2);
    }

    case 'create_agent': {
      const existing = db.select().from(agents).where(eq(agents.id, input.id)).get();
      if (existing) return `Agent "${input.id}" already exists`;

      if (input.cronSchedule && !cron.validate(input.cronSchedule)) {
        return `Invalid cron expression: ${input.cronSchedule}`;
      }

      db.insert(agents).values({
        id: input.id,
        teamId,
        name: input.name,
        command: input.command,
        args: input.args ? JSON.stringify(input.args) : null,
        type: input.type || 'manual',
        cronSchedule: input.cronSchedule ?? null,
        goal: input.goal ?? null,
        model: input.model ?? null,
        description: input.description ?? null,
        budgetMonthlyCents: input.budgetMonthlyCents ?? null,
        wakeOnAssignment: input.wakeOnAssignment ?? false,
        timeoutSec: input.timeoutSec ?? 600,
      }).run();

      if (input.type === 'cron' && input.cronSchedule) refreshAgent(input.id);
      return `Agent "${input.id}" created`;
    }

    case 'update_agent': {
      const { id, ...updates } = input;
      // Verify agent belongs to this team
      const agent = db.select().from(agents).where(and(eq(agents.id, id), eq(agents.teamId, teamId))).get();
      if (!agent) return `Agent "${id}" not found`;

      const UPDATABLE_FIELDS = ['name', 'description', 'goal', 'model', 'type', 'command', 'args', 'cwd', 'cronSchedule', 'enabled', 'budgetMonthlyCents', 'wakeOnAssignment', 'timeoutSec', 'graceSec'];
      const data: any = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(updates)) {
        if (v === undefined || !UPDATABLE_FIELDS.includes(k)) continue;
        if (k === 'args') { data.args = JSON.stringify(v); continue; }
        data[k] = v;
      }
      db.update(agents).set(data).where(eq(agents.id, id)).run();
      refreshAgent(id);
      return `Agent "${id}" updated`;
    }

    case 'create_skill': {
      const contentHash = createHash('sha256').update(input.content).digest('hex').slice(0, 16);
      db.insert(skills).values({
        teamId,
        path: input.path,
        name: input.name,
        description: input.description,
        content: input.content,
        category: input.category ?? null,
        contentHash,
      }).onConflictDoUpdate({
        target: [skills.teamId, skills.path],
        set: {
          name: input.name,
          description: input.description,
          content: input.content,
          category: input.category ?? null,
          contentHash,
          updatedAt: new Date(),
        },
      }).run();
      return `Skill created: ${input.path}`;
    }

    case 'assign_skill': {
      const exists = db.select().from(agentSkills)
        .where(and(eq(agentSkills.agentId, input.agentId), eq(agentSkills.skillPath, input.skillPath))).get();
      if (exists) return 'Skill already assigned';
      db.insert(agentSkills).values({ agentId: input.agentId, skillPath: input.skillPath, required: true }).run();
      return `Skill "${input.skillPath}" assigned to "${input.agentId}"`;
    }

    case 'list_skills': {
      const all = db.select({ path: skills.path, name: skills.name, description: skills.description, category: skills.category })
        .from(skills).where(eq(skills.teamId, teamId)).all();
      return JSON.stringify(all, null, 2);
    }

    case 'trigger_agent': {
      // Verify agent belongs to this team
      const agent = db.select().from(agents).where(and(eq(agents.id, input.id), eq(agents.teamId, teamId))).get();
      if (!agent) return `Agent "${input.id}" not found`;
      const runId = await startAgent(input.id, 'manual');
      if (runId === null) return 'Agent not available (disabled, running, or over budget)';
      return `Run started: runId=${runId}`;
    }

    case 'get_logs': {
      const run = db.select().from(agentRuns)
        .where(eq(agentRuns.agentId, input.agentId))
        .orderBy(desc(agentRuns.startedAt)).limit(1).get();
      if (!run) return 'No runs found';
      return JSON.stringify({
        runId: run.id, status: run.status, trigger: run.trigger,
        exitCode: run.exitCode, durationMs: run.durationMs,
        stdout: run.stdout || '(empty)', stderr: run.stderr || '(empty)',
      }, null, 2);
    }

    case 'write_agent_code': {
      const outDir = resolve(process.cwd(), 'agents');
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
      const outPath = resolve(outDir, `${input.id}.ts`);
      writeFileSync(outPath, input.code);
      return `Agent code written to ${outPath}`;
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

// ─── System Prompt Builder ───────────────────────────────────────────────────

function buildSystemPrompt(teamId: string): string {
  const db = getDb();

  // Load system skills (global, from system_skills table)
  const sysSkills = db.select().from(systemSkills).all();
  const skillsContent = sysSkills
    .map(s => s.content ? `## ${s.name}\n\n${s.content}` : '')
    .filter(Boolean)
    .join('\n\n---\n\n');

  // Current agents for this team
  const allAgents = db.select().from(agents).where(eq(agents.teamId, teamId)).all();
  const agentSummary = allAgents.length > 0
    ? JSON.stringify(allAgents.map(a => ({
        id: a.id, type: a.type, enabled: a.enabled, goal: a.goal || a.description
      })), null, 2)
    : 'No agents registered yet.';

  return `You are the ZooGent Architect — an AI assistant that helps users build and manage teams of AI agents.

You have tools to create agents, write skills, generate code, and manage the system.
Use them proactively — don't just describe what to do, actually do it.

## Current State

Agents:
${agentSummary}

## Knowledge Base

${skillsContent}

## Rules

- When creating agents, always: set a clear goal, choose the right model for the task, assign relevant skills
- When writing agent code, use the ZooGent SDK (zoogent/client) — see code-generation skill for patterns
- Start simple: 1-2 agents first, add complexity only when needed
- For agent scripts: command = "node", args = ["--experimental-strip-types", "agents/{id}.ts"]
- Report what you did after each action (e.g., "Created agent 'scout' with goal: ...")
- If an agent fails, read the logs (get_logs) and fix the code`;
}

// ─── Chat API ────────────────────────────────────────────────────────────────

export interface ChatStreamEvent {
  type: 'text' | 'tool_use' | 'tool_result' | 'done' | 'error';
  content?: string;
  toolName?: string;
  toolInput?: any;
}

function getTeamApiKey(teamId: string): string | null {
  const db = getDb();
  const setting = db.select().from(teamSettings)
    .where(and(eq(teamSettings.teamId, teamId), eq(teamSettings.key, 'anthropic_api_key')))
    .get();
  if (!setting) return null;
  if (setting.encrypted) {
    const dataDir = process.env.DATA_DIR || './data';
    const masterKey = loadMasterKey(dataDir);
    return decrypt(setting.value, masterKey);
  }
  return setting.value;
}

export async function* chat(userMessage: string, teamId: string): AsyncGenerator<ChatStreamEvent> {
  const apiKey = getTeamApiKey(teamId);
  if (!apiKey) {
    yield { type: 'error', content: 'Anthropic API key not configured for this team. Go to team settings to add it.' };
    return;
  }

  const db = getDb();
  const client = new Anthropic({ apiKey });

  // Save user message (team-scoped)
  db.insert(chatMessages).values({ teamId, role: 'user', content: userMessage }).run();

  // Load recent chat history for this team (last 20 messages)
  const history = db.select().from(chatMessages)
    .where(eq(chatMessages.teamId, teamId))
    .orderBy(desc(chatMessages.createdAt)).limit(20).all()
    .reverse();

  // Build messages for Claude
  const messages: Anthropic.MessageParam[] = history.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  const systemPrompt = buildSystemPrompt(teamId);

  // Agentic loop — keep calling until no more tool_use
  let continueLoop = true;
  while (continueLoop) {
    continueLoop = false;

    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });

    let fullText = '';
    const toolCalls: { name: string; input: any; result: string }[] = [];

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          fullText += event.delta.text;
          yield { type: 'text', content: event.delta.text };
        }
      }
    }

    const finalMessage = await stream.finalMessage();

    // Collect all tool_use blocks and execute them
    const toolUseBlocks = finalMessage.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of toolUseBlocks) {
      yield { type: 'tool_use', toolName: block.name, toolInput: block.input };

      const result = await executeTool(block.name, block.input, teamId);
      toolCalls.push({ name: block.name, input: block.input, result });
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });

      yield { type: 'tool_result', toolName: block.name, content: result };
    }

    // If there were tool calls, add assistant + all results as one pair
    if (toolUseBlocks.length > 0) {
      messages.push({ role: 'assistant', content: finalMessage.content });
      messages.push({ role: 'user', content: toolResults });
      continueLoop = true;
    }

    // Save assistant response (team-scoped)
    if (fullText || toolCalls.length > 0) {
      db.insert(chatMessages).values({
        teamId,
        role: 'assistant',
        content: fullText || '(tool calls only)',
        toolCalls: toolCalls.length > 0 ? JSON.stringify(toolCalls) : null,
      }).run();
    }

    // If stop_reason is end_turn, we're done
    if (finalMessage.stop_reason === 'end_turn') {
      continueLoop = false;
    }
  }

  yield { type: 'done' };
}

// ─── Chat History ────────────────────────────────────────────────────────────

export function getChatHistory(limit = 50, teamId: string): any[] {
  const db = getDb();
  return db.select().from(chatMessages)
    .where(eq(chatMessages.teamId, teamId))
    .orderBy(desc(chatMessages.createdAt)).limit(limit).all()
    .reverse();
}

export function clearChatHistory(teamId: string): void {
  const db = getDb();
  db.delete(chatMessages).where(eq(chatMessages.teamId, teamId)).run();
}
