import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// ─── Better Auth tables (4) ────────────────────────────────────────────────────

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
});

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const verifications = sqliteTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// ─── Teams (3) ─────────────────────────────────────────────────────────────────

export const teams = sqliteTable('teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  budgetMonthlyCents: integer('budget_monthly_cents'), // null = no limit
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const teamMembers = sqliteTable('team_members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['owner', 'member'] }).notNull().default('member'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('idx_team_members_unique').on(table.teamId, table.userId),
]);

export const teamSettings = sqliteTable('team_settings', {
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: text('value').notNull(),
  encrypted: integer('encrypted', { mode: 'boolean' }).notNull().default(false),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('idx_team_settings_pk').on(table.teamId, table.key),
]);

// ─── System Skills ─────────────────────────────────────────────────────────────

export const systemSkills = sqliteTable('system_skills', {
  path: text('path').primaryKey(),
  name: text('name'),
  description: text('description'),
  category: text('category'),
  content: text('content'),
  contentHash: text('content_hash'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// ─── Application tables ────────────────────────────────────────────────────────

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  goal: text('goal'),
  model: text('model'),
  type: text('type', { enum: ['cron', 'long-running', 'manual'] }).notNull().default('manual'),
  runtime: text('runtime', { enum: ['typescript', 'exec'] }).notNull().default('typescript'),
  source: text('source'),           // typescript runtime: TS source code
  bundle: text('bundle'),           // typescript runtime: esbuild output (.mjs)
  bundleHash: text('bundle_hash'),  // sha256 of bundle for materialize skip
  bundleError: text('bundle_error'),// last esbuild error if any
  command: text('command'),         // exec runtime: executable path
  args: text('args'),               // exec runtime: JSON array of args
  cwd: text('cwd'),                 // exec runtime: working directory
  cronSchedule: text('cron_schedule'),
  env: text('env'),                 // JSON object, encrypted at rest
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  budgetMonthlyCents: integer('budget_monthly_cents'),
  parentAgentId: text('parent_agent_id').references((): any => agents.id),
  timeoutSec: integer('timeout_sec').notNull().default(600),
  graceSec: integer('grace_sec').notNull().default(30),
  wakeOnAssignment: integer('wake_on_assignment', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index('idx_agents_enabled').on(table.enabled),
  index('idx_agents_team_id').on(table.teamId),
  index('idx_agents_runtime').on(table.runtime),
]);

export const agentRuns = sqliteTable('agent_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['queued', 'running', 'success', 'error', 'timeout', 'cancelled'] }).notNull().default('queued'),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
  exitCode: integer('exit_code'),
  stdout: text('stdout'),
  stderr: text('stderr'),
  summary: text('summary'),
  trigger: text('trigger', { enum: ['cron', 'manual', 'assignment', 'api'] }).notNull(),
  durationMs: integer('duration_ms'),
  pid: integer('pid'),
}, (table) => [
  index('idx_runs_agent_id').on(table.agentId),
  index('idx_runs_started_at').on(table.startedAt),
]);

export const costEvents = sqliteTable('cost_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  runId: integer('run_id').references(() => agentRuns.id),
  provider: text('provider').notNull().default('anthropic'),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  costCents: integer('cost_cents').notNull().default(0),
  occurredAt: integer('occurred_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index('idx_cost_events_agent_id').on(table.agentId),
  index('idx_cost_events_occurred_at').on(table.occurredAt),
]);

export const agentTasks = sqliteTable('agent_tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  createdByAgentId: text('created_by_agent_id').references(() => agents.id),
  runId: integer('run_id').references(() => agentRuns.id),
  title: text('title').notNull(),
  payload: text('payload'), // JSON
  status: text('status', { enum: ['pending', 'in_progress', 'done', 'failed'] }).notNull().default('pending'),
  result: text('result'),
  consensus: integer('consensus', { mode: 'boolean' }).notNull().default(false),
  consensusAgents: text('consensus_agents'), // JSON array of agent IDs
  consensusStrategy: text('consensus_strategy', { enum: ['majority', 'unanimous', 'average_score'] }),
  consensusResult: text('consensus_result'), // JSON
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
}, (table) => [
  index('idx_tasks_agent_status').on(table.agentId, table.status),
]);

export const agentSkills = sqliteTable('agent_skills', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  skillPath: text('skill_path').notNull(),
  required: integer('required', { mode: 'boolean' }).notNull().default(true),
});

export const skills = sqliteTable('skills', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  name: text('name'),
  description: text('description'),
  category: text('category'),
  related: text('related'), // JSON array
  content: text('content'),
  contentHash: text('content_hash'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('idx_skills_team_path').on(table.teamId, table.path),
  index('idx_skills_team_id').on(table.teamId),
]);

export const agentMemories = sqliteTable('agent_memories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  source: text('source', { enum: ['feedback', 'auto', 'manual'] }).notNull(),
  importance: integer('importance').notNull().default(5), // 0-10
  runId: integer('run_id').references(() => agentRuns.id),
  taskId: integer('task_id').references(() => agentTasks.id),
  tags: text('tags'), // JSON array
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  accessCount: integer('access_count').notNull().default(0),
  lastAccessed: integer('last_accessed', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index('idx_memories_agent_id').on(table.agentId),
]);

export const teamKnowledge = sqliteTable('team_knowledge', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  status: text('status', { enum: ['draft', 'active', 'archived'] }).notNull().default('draft'),
  proposedByAgentId: text('proposed_by_agent_id').references(() => agents.id),
  approvedAt: integer('approved_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index('idx_team_knowledge_team_id').on(table.teamId),
]);

export const agentStore = sqliteTable('agent_store', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: text('value').notNull(), // JSON
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
}, (table) => [
  uniqueIndex('idx_agent_store_agent_key').on(table.agentId, table.key),
  index('idx_agent_store_expires').on(table.expiresAt),
]);

export const agentIntegrations = sqliteTable('agent_integrations', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(), // gmail, google_maps, hunter_io, telegram, tavily, custom
  name: text('name').notNull(), // slug, used as env var namespace
  credentials: text('credentials').notNull(), // encrypted JSON
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('idx_agent_integration_agent_name').on(table.agentId, table.name),
  index('idx_agent_integration_agent').on(table.agentId),
]);

export const chatMessages = sqliteTable('chat_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  toolCalls: text('tool_calls'), // JSON array of tool use blocks
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index('idx_chat_messages_team_id').on(table.teamId),
]);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  encrypted: integer('encrypted', { mode: 'boolean' }).notNull().default(false),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  key: text('key').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const agentEvaluations = sqliteTable('agent_evaluations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').notNull().references(() => agentTasks.id, { onDelete: 'cascade' }),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  verdict: text('verdict', { enum: ['approve', 'reject', 'revise'] }).notNull(),
  score: integer('score'), // 0-100
  reasoning: text('reasoning'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// ─── Relations ──────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  teamMemberships: many(teamMembers),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const teamsRelations = relations(teams, ({ many }) => ({
  members: many(teamMembers),
  agents: many(agents),
  skills: many(skills),
  knowledge: many(teamKnowledge),
  chatMessages: many(chatMessages),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
  user: one(users, { fields: [teamMembers.userId], references: [users.id] }),
}));

export const agentsRelations = relations(agents, ({ many, one }) => ({
  team: one(teams, { fields: [agents.teamId], references: [teams.id] }),
  runs: many(agentRuns),
  costEvents: many(costEvents),
  tasks: many(agentTasks, { relationName: 'assignedTasks' }),
  createdTasks: many(agentTasks, { relationName: 'createdTasks' }),
  skills: many(agentSkills),
  memories: many(agentMemories),
  store: many(agentStore),
  integrations: many(agentIntegrations),
  evaluations: many(agentEvaluations),
  parent: one(agents, { fields: [agents.parentAgentId], references: [agents.id] }),
}));

export const agentRunsRelations = relations(agentRuns, ({ one }) => ({
  agent: one(agents, { fields: [agentRuns.agentId], references: [agents.id] }),
}));

export const costEventsRelations = relations(costEvents, ({ one }) => ({
  agent: one(agents, { fields: [costEvents.agentId], references: [agents.id] }),
  run: one(agentRuns, { fields: [costEvents.runId], references: [agentRuns.id] }),
}));

export const agentTasksRelations = relations(agentTasks, ({ one, many }) => ({
  agent: one(agents, { fields: [agentTasks.agentId], references: [agents.id], relationName: 'assignedTasks' }),
  createdBy: one(agents, { fields: [agentTasks.createdByAgentId], references: [agents.id], relationName: 'createdTasks' }),
  run: one(agentRuns, { fields: [agentTasks.runId], references: [agentRuns.id] }),
  evaluations: many(agentEvaluations),
}));

export const agentSkillsRelations = relations(agentSkills, ({ one }) => ({
  agent: one(agents, { fields: [agentSkills.agentId], references: [agents.id] }),
}));

export const skillsRelations = relations(skills, ({ one }) => ({
  team: one(teams, { fields: [skills.teamId], references: [teams.id] }),
}));

export const agentMemoriesRelations = relations(agentMemories, ({ one }) => ({
  agent: one(agents, { fields: [agentMemories.agentId], references: [agents.id] }),
  run: one(agentRuns, { fields: [agentMemories.runId], references: [agentRuns.id] }),
  task: one(agentTasks, { fields: [agentMemories.taskId], references: [agentTasks.id] }),
}));

export const agentEvaluationsRelations = relations(agentEvaluations, ({ one }) => ({
  task: one(agentTasks, { fields: [agentEvaluations.taskId], references: [agentTasks.id] }),
  agent: one(agents, { fields: [agentEvaluations.agentId], references: [agents.id] }),
}));

export const agentStoreRelations = relations(agentStore, ({ one }) => ({
  agent: one(agents, { fields: [agentStore.agentId], references: [agents.id] }),
}));

export const agentIntegrationsRelations = relations(agentIntegrations, ({ one }) => ({
  agent: one(agents, { fields: [agentIntegrations.agentId], references: [agents.id] }),
}));

export const teamKnowledgeRelations = relations(teamKnowledge, ({ one }) => ({
  team: one(teams, { fields: [teamKnowledge.teamId], references: [teams.id] }),
  proposedBy: one(agents, { fields: [teamKnowledge.proposedByAgentId], references: [agents.id] }),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  team: one(teams, { fields: [chatMessages.teamId], references: [teams.id] }),
}));
