CREATE TABLE `agent_integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`provider` text NOT NULL,
	`name` text NOT NULL,
	`credentials` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_integration_agent_name` ON `agent_integrations` (`agent_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_agent_integration_agent` ON `agent_integrations` (`agent_id`);