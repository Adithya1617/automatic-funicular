-- Hyprride: the fleet calls these models by their brand prefix ("Yamaha
-- RayZR", "Hero Destiny") to disambiguate from other 125cc scooters. Update
-- the seed rows that landed in 0010 to match.
UPDATE `bike_types`
SET `name` = 'Yamaha RayZR', `updated_at` = 1779100000000
WHERE `name` = 'RayZR' AND `tenant_id` = 1;
--> statement-breakpoint
UPDATE `bike_types`
SET `name` = 'Hero Destiny', `updated_at` = 1779100000000
WHERE `name` = 'Destiny' AND `tenant_id` = 1;
