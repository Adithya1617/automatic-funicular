CREATE TABLE `stock_take_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`stock_take_id` text NOT NULL,
	`ingredient_id` text NOT NULL,
	`book_quantity` real NOT NULL,
	`counted_quantity` real,
	`difference` real,
	FOREIGN KEY (`stock_take_id`) REFERENCES `stock_takes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_stock_take_lines_take` ON `stock_take_lines` (`stock_take_id`);--> statement-breakpoint
CREATE TABLE `stock_takes` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` integer NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_stock_takes_tenant_status` ON `stock_takes` (`tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_stock_takes_tenant_started` ON `stock_takes` (`tenant_id`,`started_at`);