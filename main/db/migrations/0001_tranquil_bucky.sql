CREATE TABLE `production_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` integer NOT NULL,
	`prepared_ingredient_id` text NOT NULL,
	`recipe_version_id` text NOT NULL,
	`expected_yield` real NOT NULL,
	`actual_yield` real NOT NULL,
	`produced_at` integer NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`prepared_ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_version_id`) REFERENCES `recipe_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_batches_ingredient_produced_at` ON `production_batches` (`tenant_id`,`prepared_ingredient_id`,`produced_at`);--> statement-breakpoint
CREATE TABLE `recipe_ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_version_id` text NOT NULL,
	`child_ingredient_id` text NOT NULL,
	`quantity` real NOT NULL,
	`unit` text NOT NULL,
	`notes` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`recipe_version_id`) REFERENCES `recipe_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`child_ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_recipe_ingredients_version` ON `recipe_ingredients` (`recipe_version_id`);--> statement-breakpoint
CREATE TABLE `recipe_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` integer NOT NULL,
	`parent_id` text NOT NULL,
	`parent_type` text NOT NULL,
	`version_number` integer NOT NULL,
	`is_current` integer DEFAULT false NOT NULL,
	`target_yield` real DEFAULT 1 NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_recipe_versions_parent_current` ON `recipe_versions` (`tenant_id`,`parent_id`,`parent_type`,`is_current`);