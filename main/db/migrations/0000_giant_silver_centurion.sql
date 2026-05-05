CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` integer NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`type` text NOT NULL,
	`base_unit` text NOT NULL,
	`stock_quantity` real DEFAULT 0 NOT NULL,
	`reserved_quantity` real DEFAULT 0 NOT NULL,
	`low_stock_threshold` real DEFAULT 0 NOT NULL,
	`current_avg_cost_per_unit` real DEFAULT 0 NOT NULL,
	`density_g_per_ml` real,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ingredients_tenant_name` ON `ingredients` (`tenant_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_ingredients_tenant_active` ON `ingredients` (`tenant_id`,`is_active`);--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` integer NOT NULL,
	`ingredient_id` text NOT NULL,
	`change_quantity` real NOT NULL,
	`cost_per_unit_at_time` real,
	`reason` text NOT NULL,
	`reference_type` text NOT NULL,
	`reference_id` text,
	`notes` text,
	`occurred_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_movements_ingredient_occurred_at` ON `stock_movements` (`ingredient_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_movements_reason_occurred_at` ON `stock_movements` (`reason`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_movements_reference` ON `stock_movements` (`reference_type`,`reference_id`);--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` integer NOT NULL,
	`name` text NOT NULL,
	`contact_info` text,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_suppliers_tenant_name` ON `suppliers` (`tenant_id`,`name`);--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
