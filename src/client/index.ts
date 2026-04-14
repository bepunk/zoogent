/**
 * ZooGent Agent SDK — drop-in replacement for paperclip.ts
 *
 * All functions read ZOOGENT_* env vars automatically.
 * All reporting calls are fail-open (catch errors silently).
 */

const getBaseUrl = () => process.env.ZOOGENT_API_URL || 'http://127.0.0.1:3200';
const getAgentId = () => process.env.ZOOGENT_AGENT_ID || '';
const getRunId = () => process.env.ZOOGENT_RUN_ID || '';
const getApiKey = () => process.env.ZOOGENT_API_KEY || '';
const getAgentGoal = () => process.env.ZOOGENT_AGENT_GOAL || '';

async function apiCall(path: string, options: RequestInit = {}): Promise<any> {
  const url = `${getBaseUrl()}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getApiKey()}`,
    ...((options.headers as Record<string, string>) || {}),
  };

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ZooGent API error ${res.status}: ${text}`);
  }

  return res.json();
}

function safeCall<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  return fn().catch((err) => {
    console.warn(`[zoogent/client] ${err.message}`);
    return fallback;
  });
}

// ─── Tasks ──────────────────────────────────────────────────────────────────────

export interface Task {
  id: number;
  agentId: string;
  createdByAgentId: string | null;
  title: string;
  payload: string | null;
  status: string;
  result: string | null;
}

export async function createTask(params: {
  agentId: string;
  title: string;
  payload?: any;
  createdByAgentId?: string;
  consensus?: boolean;
  consensusAgents?: string[];
  consensusStrategy?: 'majority' | 'unanimous' | 'average_score';
}): Promise<Task | null> {
  return safeCall(
    () => apiCall('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        ...params,
        createdByAgentId: params.createdByAgentId || getAgentId(),
      }),
    }),
    null,
  );
}

export async function getMyTasks(status = 'pending'): Promise<Task[]> {
  return safeCall(
    () => apiCall(`/api/tasks?agentId=${getAgentId()}&status=${status}`),
    [],
  );
}

export async function checkoutTask(taskId: number): Promise<boolean> {
  return safeCall(
    async () => {
      await apiCall(`/api/tasks/${taskId}/checkout`, { method: 'POST' });
      return true;
    },
    false,
  );
}

export async function completeTask(taskId: number, result?: string): Promise<void> {
  await safeCall(
    () => apiCall(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'done', result }),
    }),
    undefined,
  );
}

export async function failTask(taskId: number, result?: string): Promise<void> {
  await safeCall(
    () => apiCall(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'failed', result }),
    }),
    undefined,
  );
}

// ─── Cost Reporting ─────────────────────────────────────────────────────────────

export async function reportCost(params: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  provider?: string;
}): Promise<void> {
  await safeCall(
    () => apiCall('/api/report/cost', {
      method: 'POST',
      body: JSON.stringify({
        agentId: getAgentId(),
        runId: getRunId() ? parseInt(getRunId()) : undefined,
        ...params,
      }),
    }),
    undefined,
  );
}

// ─── Memory ─────────────────────────────────────────────────────────────────────

export async function reportMemory(params: {
  content: string;
  importance?: number;
  tags?: string[];
}): Promise<void> {
  await safeCall(
    () => apiCall('/api/report/memory', {
      method: 'POST',
      body: JSON.stringify({
        agentId: getAgentId(),
        runId: getRunId() ? parseInt(getRunId()) : undefined,
        ...params,
      }),
    }),
    undefined,
  );
}

export function getGoal(): string {
  return getAgentGoal();
}

export function getMemories(): any[] {
  const raw = process.env.ZOOGENT_MEMORIES;
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// ─── Consensus ──────────────────────────────────────────────────────────────────

export async function submitEvaluation(params: {
  taskId: number;
  verdict: 'approve' | 'reject' | 'revise';
  score?: number;
  reasoning?: string;
}): Promise<any> {
  return safeCall(
    () => apiCall(`/api/tasks/${params.taskId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({
        agentId: getAgentId(),
        ...params,
      }),
    }),
    null,
  );
}

// ─── Skills ─────────────────────────────────────────────────────────────────

function stripFrontmatter(content: string): string {
  if (!content.startsWith('---')) return content;
  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) return content;
  return content.slice(endIndex + 3).trim();
}

/** Get auto-injected skills content (from ZOOGENT_AGENT_SKILLS env var). */
export function getSkills(): string {
  return process.env.ZOOGENT_AGENT_SKILLS || '';
}

/** Load a skill via HTTP API by path. */
export async function loadSkill(skillPath: string): Promise<string> {
  return safeCall(
    async () => {
      const res = await fetch(`${getBaseUrl()}/api/report/skill/${skillPath}`, {
        headers: { 'Authorization': `Bearer ${getApiKey()}` },
      });
      if (!res.ok) return '';
      return res.text();
    },
    '',
  );
}

/** Load multiple skills via HTTP API, concatenated with separators. */
export async function loadSkills(paths: string[]): Promise<string> {
  const results = await Promise.all(paths.map(p => loadSkill(p)));
  return results.filter(Boolean).join('\n\n---\n\n');
}

// ─── Team Knowledge ─────────────────────────────────────────────────────────

/** Get auto-injected team knowledge (from ZOOGENT_TEAM_KNOWLEDGE env var). */
export function getTeamKnowledge(): { title: string; content: string }[] {
  const raw = process.env.ZOOGENT_TEAM_KNOWLEDGE;
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

/** Propose team knowledge (will be draft or auto-approved based on settings). */
export async function reportTeamKnowledge(params: {
  title: string;
  content: string;
}): Promise<void> {
  await safeCall(
    () => apiCall('/api/report/knowledge', {
      method: 'POST',
      body: JSON.stringify({
        agentId: getAgentId(),
        ...params,
      }),
    }),
    undefined,
  );
}

// ─── Store (persistent working data) ─────────────────────────────────────────

/** Get a value from agent's persistent store. Returns null if key doesn't exist or is expired. */
export async function storeGet(key: string): Promise<any | null> {
  return safeCall(
    async () => {
      const data = await apiCall(`/api/report/store?agentId=${getAgentId()}&key=${encodeURIComponent(key)}`);
      return data.value ?? null;
    },
    null,
  );
}

/** Set a key-value pair in agent's persistent store. Value can be any JSON-serializable data. */
export async function storeSet(key: string, value: any, ttlSeconds?: number): Promise<void> {
  await safeCall(
    () => apiCall('/api/report/store', {
      method: 'PUT',
      body: JSON.stringify({
        agentId: getAgentId(),
        key,
        value,
        ttlSeconds,
      }),
    }),
    undefined,
  );
}

/** Delete a key from agent's persistent store. */
export async function storeDelete(key: string): Promise<boolean> {
  return safeCall(
    async () => {
      const data = await apiCall(`/api/report/store?agentId=${getAgentId()}&key=${encodeURIComponent(key)}`, { method: 'DELETE' });
      return data.ok ?? false;
    },
    false,
  );
}

/** List keys in agent's persistent store, optionally filtered by prefix. */
export async function storeKeys(prefix?: string): Promise<string[]> {
  return safeCall(
    async () => {
      const params = new URLSearchParams({ agentId: getAgentId() });
      if (prefix) params.set('prefix', prefix);
      const data = await apiCall(`/api/report/store/keys?${params}`);
      return Array.isArray(data) ? data.map((e: any) => e.key) : [];
    },
    [],
  );
}

// ─── Heartbeat ──────────────────────────────────────────────────────────────────

export async function heartbeat(): Promise<void> {
  await safeCall(
    () => apiCall('/api/report/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ agentId: getAgentId() }),
    }),
    undefined,
  );
}
