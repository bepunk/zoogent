PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agents` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`goal` text,
	`model` text,
	`type` text DEFAULT 'manual' NOT NULL,
	`runtime` text DEFAULT 'typescript' NOT NULL,
	`source` text,
	`bundle` text,
	`bundle_hash` text,
	`bundle_error` text,
	`command` text,
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
INSERT INTO `__new_agents`(
	"id", "team_id", "name", "description", "goal", "model", "type",
	"runtime", "source", "bundle", "bundle_hash", "bundle_error",
	"command", "args", "cwd",
	"cron_schedule", "env", "enabled", "budget_monthly_cents", "parent_agent_id",
	"timeout_sec", "grace_sec", "wake_on_assignment",
	"created_at", "updated_at"
) SELECT
	"id", "team_id", "name", "description", "goal", "model", "type",
	'exec', NULL, NULL, NULL, NULL,
	"command", "args", "cwd",
	"cron_schedule", "env", "enabled", "budget_monthly_cents", "parent_agent_id",
	"timeout_sec", "grace_sec", "wake_on_assignment",
	"created_at", "updated_at"
FROM `agents`;--> statement-breakpoint
DROP TABLE `agents`;--> statement-breakpoint
ALTER TABLE `__new_agents` RENAME TO `agents`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_agents_enabled` ON `agents` (`enabled`);--> statement-breakpoint
CREATE INDEX `idx_agents_team_id` ON `agents` (`team_id`);--> statement-breakpoint
CREATE INDEX `idx_agents_runtime` ON `agents` (`runtime`);