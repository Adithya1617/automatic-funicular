CREATE TABLE `invoice_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`raw_description` text NOT NULL,
	`ingredient_id` text,
	`quantity` real NOT NULL,
	`unit` text NOT NULL,
	`unit_cost` real NOT NULL,
	`total_cost` real NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_invoice_lines_invoice` ON `invoice_lines` (`invoice_id`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` integer NOT NULL,
	`supplier_id` text NOT NULL,
	`invoice_number` text NOT NULL,
	`invoice_date` integer NOT NULL,
	`total_amount` real DEFAULT 0 NOT NULL,
	`file_path` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`notes` text,
	`committed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_invoices_tenant_supplier` ON `invoices` (`tenant_id`,`supplier_id`);--> statement-breakpoint
CREATE INDEX `idx_invoices_tenant_status_date` ON `invoices` (`tenant_id`,`status`,`invoice_date`);--> statement-breakpoint
CREATE TABLE `supplier_item_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` integer NOT NULL,
	`supplier_id` text NOT NULL,
	`raw_description` text NOT NULL,
	`ingredient_id` text NOT NULL,
	`default_quantity` real NOT NULL,
	`default_unit` text NOT NULL,
	`last_unit_cost` real NOT NULL,
	`last_used_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_mappings_tenant_supplier_desc` ON `supplier_item_mappings` (`tenant_id`,`supplier_id`,`raw_description`);