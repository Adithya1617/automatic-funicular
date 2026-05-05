CREATE TABLE `order_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`menu_item_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price` real DEFAULT 0 NOT NULL,
	`recipe_version_id` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_version_id`) REFERENCES `recipe_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_order_lines_order` ON `order_lines` (`order_id`);--> statement-breakpoint
CREATE TABLE `ordering_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` integer NOT NULL,
	`key` text NOT NULL,
	`display_name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`polling_interval_seconds` integer DEFAULT 30 NOT NULL,
	`is_mock` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ordering_channels_tenant_key` ON `ordering_channels` (`tenant_id`,`key`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` integer NOT NULL,
	`external_order_id` text,
	`source` text NOT NULL,
	`placed_at` integer NOT NULL,
	`delivered_at` integer,
	`cancelled_at` integer,
	`cancelled_prepared` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`total_amount` real DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_orders_tenant_status_placed_at` ON `orders` (`tenant_id`,`status`,`placed_at`);--> statement-breakpoint
CREATE INDEX `idx_orders_tenant_source_placed_at` ON `orders` (`tenant_id`,`source`,`placed_at`);