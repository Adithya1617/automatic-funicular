CREATE TABLE `bike_types` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` integer NOT NULL,
	`name` text NOT NULL,
	`engine_cc` integer NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_bike_types_tenant_name` ON `bike_types` (`tenant_id`,`name`);--> statement-breakpoint
CREATE TABLE `bikes` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` integer NOT NULL,
	`bike_number` text NOT NULL,
	`bike_type_id` text NOT NULL,
	`license_plate` text,
	`odometer_km` real,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`bike_type_id`) REFERENCES `bike_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_bikes_tenant_number` ON `bikes` (`tenant_id`,`bike_number`);--> statement-breakpoint
CREATE INDEX `idx_bikes_tenant_type` ON `bikes` (`tenant_id`,`bike_type_id`);--> statement-breakpoint
CREATE INDEX `idx_bikes_tenant_active` ON `bikes` (`tenant_id`,`is_active`);