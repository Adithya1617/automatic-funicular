CREATE TABLE `service_event_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`service_event_id` text NOT NULL,
	`ingredient_id` text NOT NULL,
	`quantity` real NOT NULL,
	`unit` text NOT NULL,
	`notes` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`service_event_id`) REFERENCES `service_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_service_event_lines_event` ON `service_event_lines` (`service_event_id`);--> statement-breakpoint
CREATE TABLE `service_events` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` integer NOT NULL,
	`bike_id` text NOT NULL,
	`service_template_id` text NOT NULL,
	`service_template_version_id` text NOT NULL,
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
CREATE INDEX `idx_service_events_tenant_status_started` ON `service_events` (`tenant_id`,`status`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_service_events_tenant_bike_started` ON `service_events` (`tenant_id`,`bike_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_service_events_tenant_template_started` ON `service_events` (`tenant_id`,`service_template_id`,`started_at`);