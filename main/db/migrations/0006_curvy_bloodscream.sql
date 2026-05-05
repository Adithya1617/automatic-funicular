ALTER TABLE `suppliers` ADD `gstin` text;--> statement-breakpoint
CREATE INDEX `idx_suppliers_tenant_gstin` ON `suppliers` (`tenant_id`,`gstin`);