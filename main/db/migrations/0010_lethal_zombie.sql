-- Hyprride H7.5: bike_type names drop the "Xcc " prefix (engineCc lives in its
-- own column already), and we backfill the 4 missing 125cc models that turned
-- up in the real fleet (Jupiter, Raider, RayZR, Destiny). Inserts use WHERE
-- NOT EXISTS so a re-run from a fresh DB after the seed picks them up is a
-- no-op rather than a duplicate.
UPDATE `bike_types`
SET `name` = 'Activa', `updated_at` = 1779000000000
WHERE `name` = '110cc Activa' AND `tenant_id` = 1;
--> statement-breakpoint
UPDATE `bike_types`
SET `name` = 'Ntorq', `updated_at` = 1779000000000
WHERE `name` = '125cc Ntorq' AND `tenant_id` = 1;
--> statement-breakpoint
UPDATE `bike_types`
SET `name` = 'Apache', `display_order` = 7, `updated_at` = 1779000000000
WHERE `name` = '160cc Apache RTR' AND `tenant_id` = 1;
--> statement-breakpoint
INSERT INTO `bike_types` (`id`, `tenant_id`, `name`, `engine_cc`, `display_order`, `is_active`, `created_at`, `updated_at`, `created_by`, `updated_by`)
SELECT '019d0500-0001-7000-8000-000000000001', 1, 'Jupiter', 125, 3, 1, 1779000000000, 1779000000000, '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'
WHERE NOT EXISTS (SELECT 1 FROM `bike_types` WHERE `name` = 'Jupiter' AND `tenant_id` = 1);
--> statement-breakpoint
INSERT INTO `bike_types` (`id`, `tenant_id`, `name`, `engine_cc`, `display_order`, `is_active`, `created_at`, `updated_at`, `created_by`, `updated_by`)
SELECT '019d0500-0001-7000-8000-000000000002', 1, 'Raider', 125, 4, 1, 1779000000000, 1779000000000, '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'
WHERE NOT EXISTS (SELECT 1 FROM `bike_types` WHERE `name` = 'Raider' AND `tenant_id` = 1);
--> statement-breakpoint
INSERT INTO `bike_types` (`id`, `tenant_id`, `name`, `engine_cc`, `display_order`, `is_active`, `created_at`, `updated_at`, `created_by`, `updated_by`)
SELECT '019d0500-0001-7000-8000-000000000003', 1, 'RayZR', 125, 5, 1, 1779000000000, 1779000000000, '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'
WHERE NOT EXISTS (SELECT 1 FROM `bike_types` WHERE `name` = 'RayZR' AND `tenant_id` = 1);
--> statement-breakpoint
INSERT INTO `bike_types` (`id`, `tenant_id`, `name`, `engine_cc`, `display_order`, `is_active`, `created_at`, `updated_at`, `created_by`, `updated_by`)
SELECT '019d0500-0001-7000-8000-000000000004', 1, 'Destiny', 125, 6, 1, 1779000000000, 1779000000000, '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'
WHERE NOT EXISTS (SELECT 1 FROM `bike_types` WHERE `name` = 'Destiny' AND `tenant_id` = 1);
