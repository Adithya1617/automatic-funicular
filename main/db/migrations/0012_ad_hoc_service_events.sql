-- Hyprride: allow ad-hoc service events that have no service template. The
-- operator's primary workflow is "pick a bike, tick the parts you used, deduct
-- stock" — templates are now optional. SQLite can't drop NOT NULL on existing
-- columns, so we recreate the table.
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_service_events` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` integer NOT NULL,
	`bike_id` text NOT NULL,
	`service_template_id` text,
	`service_template_version_id` text,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`cancelled_at` integer,
	`cancelled_parts_used` integer,
	`odometer_km` real,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`bike_id`) REFERENCES `bikes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`service_template_id`) REFERENCES `service_templates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`service_template_version_id`) REFERENCES `recipe_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_service_events`
  (`id`, `tenant_id`, `bike_id`, `service_template_id`, `service_template_version_id`,
   `status`, `started_at`, `completed_at`, `cancelled_at`, `cancelled_parts_used`,
   `odometer_km`, `notes`, `created_at`, `updated_at`, `created_by`, `updated_by`)
SELECT
  `id`, `tenant_id`, `bike_id`, `service_template_id`, `service_template_version_id`,
  `status`, `started_at`, `completed_at`, `cancelled_at`, `cancelled_parts_used`,
  `odometer_km`, `notes`, `created_at`, `updated_at`, `created_by`, `updated_by`
FROM `service_events`;
--> statement-breakpoint
DROP TABLE `service_events`;
--> statement-breakpoint
ALTER TABLE `__new_service_events` RENAME TO `service_events`;
--> statement-breakpoint
CREATE INDEX `idx_service_events_tenant_status_started` ON `service_events` (`tenant_id`,`status`,`started_at`);
--> statement-breakpoint
CREATE INDEX `idx_service_events_tenant_bike_started` ON `service_events` (`tenant_id`,`bike_id`,`started_at`);
--> statement-breakpoint
CREATE INDEX `idx_service_events_tenant_template_started` ON `service_events` (`tenant_id`,`service_template_id`,`started_at`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
