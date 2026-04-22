CREATE TABLE `team_code_library` (
  `id` text NOT NULL PRIMARY KEY,
  `team_id` text NOT NULL REFERENCES `teams`(`id`) ON DELETE CASCADE,
  `path` text NOT NULL,
  `content` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_team_code_library_path` ON `team_code_library`(`team_id`, `path`);
--> statement-breakpoint
CREATE INDEX `idx_team_code_library_team` ON `team_code_library`(`team_id`);
