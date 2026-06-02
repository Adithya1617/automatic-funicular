-- Hyprride: split servicing into service / repair / wash. Add a `kind`
-- discriminator to service_events. Existing rows backfill to 'service' via the
-- column default. A plain ADD COLUMN is correct here (and avoids the
-- table-recreate SELECT referencing a column the old table lacks).
ALTER TABLE `service_events` ADD `kind` text DEFAULT 'service' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_service_events_tenant_kind_started` ON `service_events` (`tenant_id`,`kind`,`started_at`);
