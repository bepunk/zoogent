CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `agent_connections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`from_agent_id` text NOT NULL,
	`to_agent_id` text NOT NULL,
	`connection_type` text NOT NULL,
	`description` text,
	FOREIGN KEY (`from_agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `agent_evaluations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`agent_id` text NOT NULL,
	`verdict` text NOT NULL,
	`score` integer,
	`reasoning` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `agent_tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `agent_memories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_id` text NOT NULL,
	`content` text NOT NULL,
	`source` text NOT NULL,
	`importance` integer DEFAULT 5 NOT NULL,
	`run_id` integer,
	`task_id` integer,
	`tags` text,
	`active` integer DEFAULT true NOT NULL,
	`access_count` integer DEFAULT 0 NOT NULL,
	`last_accessed` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `agent_tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_memories_agent_id` ON `agent_memories` (`agent_id`);--> statement-breakpoint
CREATE TABLE `agent_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`exit_code` integer,
	`stdout` text,
	`stderr` text,
	`summary` text,
	`trigger` text NOT NULL,
	`duration_ms` integer,
	`pid` integer,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_runs_agent_id` ON `agent_runs` (`agent_id`);--> statement-breakpoint
CREATE INDEX `idx_runs_started_at` ON `agent_runs` (`started_at`);--> statement-breakpoint
CREATE TABLE `agent_skills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_id` text NOT NULL,
	`skill_path` text NOT NULL,
	`required` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `agent_store` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_store_agent_key` ON `agent_store` (`agent_id`,`key`);--> statement-breakpoint
CREATE INDEX `idx_agent_store_expires` ON `agent_store` (`expires_at`);--> statement-breakpoint
CREATE TABLE `agent_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_id` text NOT NULL,
	`created_by_agent_id` text,
	`run_id` integer,
	`title` text NOT NULL,
	`payload` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`result` text,
	`consensus` integer DEFAULT false NOT NULL,
	`consensus_agents` text,
	`consensus_strategy` text,
	`consensus_result` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_agent_status` ON `agent_tasks` (`agent_id`,`status`);--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`goal` text,
	`model` text,
	`type` text DEFAULT 'manual' NOT NULL,
	`command` text NOT NULL,
	`args` text,
	`cwd` text,
	`cron_schedule` text,
	`env` text,
	`enabled` integer DEFAULT true NOT NULL,
	`budget_monthly_cents` integer,
	`parent_agent_id` text,
	`timeout_sec` integer DEFAULT 600 NOT NULL,
	`grace_sec` integer DEFAULT 30 NOT NULL,
	`wake_on_assignment` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_agents_enabled` ON `agents` (`enabled`);--> statement-breakpoint
CREATE INDEX `idx_agents_team_id` ON `agents` (`team_id`);--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`tool_calls` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_chat_messages_team_id` ON `chat_messages` (`team_id`);--> statement-breakpoint
CREATE TABLE `cost_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_id` text NOT NULL,
	`run_id` integer,
	`provider` text DEFAULT 'anthropic' NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cost_cents` integer DEFAULT 0 NOT NULL,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_cost_events_agent_id` ON `cost_events` (`agent_id`);--> statement-breakpoint
CREATE INDEX `idx_cost_events_occurred_at` ON `cost_events` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`encrypted` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `skills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_id` text NOT NULL,
	`path` text NOT NULL,
	`name` text,
	`description` text,
	`category` text,
	`related` text,
	`content` text,
	`content_hash` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_skills_team_path` ON `skills` (`team_id`,`path`);--> statement-breakpoint
CREATE INDEX `idx_skills_team_id` ON `skills` (`team_id`);--> statement-breakpoint
CREATE TABLE `system_skills` (
	`path` text PRIMARY KEY NOT NULL,
	`name` text,
	`description` text,
	`category` text,
	`content` text,
	`content_hash` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `team_knowledge` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`proposed_by_agent_id` text,
	`approved_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`proposed_by_agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_team_knowledge_team_id` ON `team_knowledge` (`team_id`);--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_team_members_unique` ON `team_members` (`team_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `team_settings` (
	`team_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`encrypted` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_team_settings_pk` ON `team_settings` (`team_id`,`key`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teams_slug_unique` ON `teams` (`slug`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
