CREATE TABLE `menu_item_availability` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` integer NOT NULL,
	`menu_item_id` text NOT NULL,
	`max_servings_available` real DEFAULT 0 NOT NULL,
	`bottleneck_ingredient_id` text,
	`last_computed_at` integer NOT NULL,
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_availability_tenant_menu_item` ON `menu_item_availability` (`tenant_id`,`menu_item_id`);--> statement-breakpoint
CREATE TABLE `menu_items` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` integer NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`selling_price` real DEFAULT 0 NOT NULL,
	`variant_group_id` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_menu_items_tenant_name` ON `menu_items` (`tenant_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_menu_items_tenant_category` ON `menu_items` (`tenant_id`,`category`);--> statement-breakpoint
CREATE INDEX `idx_menu_items_tenant_variant` ON `menu_items` (`tenant_id`,`variant_group_id`);