CREATE TABLE `service_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` integer NOT NULL,
	`name` text NOT NULL,
	`bike_type_id` text NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`bike_type_id`) REFERENCES `bike_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_service_templates_tenant_bike_type` ON `service_templates` (`tenant_id`,`bike_type_id`);--> statement-breakpoint
CREATE INDEX `idx_service_templates_tenant_name` ON `service_templates` (`tenant_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_service_templates_tenant_active` ON `service_templates` (`tenant_id`,`is_active`);