CREATE TABLE IF NOT EXISTS "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bike_types" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" text NOT NULL,
	"engine_cc" integer NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bikes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"bike_number" text NOT NULL,
	"bike_type_id" text NOT NULL,
	"license_plate" text,
	"odometer_km" double precision,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ingredients" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"type" text NOT NULL,
	"base_unit" text NOT NULL,
	"stock_quantity" double precision DEFAULT 0 NOT NULL,
	"reserved_quantity" double precision DEFAULT 0 NOT NULL,
	"low_stock_threshold" double precision DEFAULT 0 NOT NULL,
	"current_avg_cost_per_unit" double precision DEFAULT 0 NOT NULL,
	"density_g_per_ml" double precision,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"raw_description" text NOT NULL,
	"ingredient_id" text,
	"quantity" double precision NOT NULL,
	"unit" text NOT NULL,
	"unit_cost" double precision NOT NULL,
	"total_cost" double precision NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"supplier_id" text NOT NULL,
	"invoice_number" text NOT NULL,
	"invoice_date" bigint NOT NULL,
	"total_amount" double precision DEFAULT 0 NOT NULL,
	"file_path" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"notes" text,
	"committed_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "menu_item_availability" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"menu_item_id" text NOT NULL,
	"max_servings_available" double precision DEFAULT 0 NOT NULL,
	"bottleneck_ingredient_id" text,
	"last_computed_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "menu_items" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"selling_price" double precision DEFAULT 0 NOT NULL,
	"variant_group_id" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"menu_item_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" double precision DEFAULT 0 NOT NULL,
	"recipe_version_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ordering_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"key" text NOT NULL,
	"display_name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"polling_interval_seconds" integer DEFAULT 30 NOT NULL,
	"is_mock" boolean DEFAULT false NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"external_order_id" text,
	"source" text NOT NULL,
	"placed_at" bigint NOT NULL,
	"delivered_at" bigint,
	"cancelled_at" bigint,
	"cancelled_prepared" boolean,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_amount" double precision DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "production_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"prepared_ingredient_id" text NOT NULL,
	"recipe_version_id" text NOT NULL,
	"expected_yield" double precision NOT NULL,
	"actual_yield" double precision NOT NULL,
	"produced_at" bigint NOT NULL,
	"notes" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recipe_ingredients" (
	"id" text PRIMARY KEY NOT NULL,
	"recipe_version_id" text NOT NULL,
	"child_ingredient_id" text NOT NULL,
	"quantity" double precision NOT NULL,
	"unit" text NOT NULL,
	"notes" text,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recipe_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"parent_id" text NOT NULL,
	"parent_type" text NOT NULL,
	"version_number" integer NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"target_yield" double precision DEFAULT 1 NOT NULL,
	"notes" text,
	"created_at" bigint NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_event_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"service_event_id" text NOT NULL,
	"ingredient_id" text NOT NULL,
	"quantity" double precision NOT NULL,
	"unit" text NOT NULL,
	"notes" text,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"bike_id" text NOT NULL,
	"kind" text DEFAULT 'service' NOT NULL,
	"service_template_id" text,
	"service_template_version_id" text,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"started_at" bigint NOT NULL,
	"completed_at" bigint,
	"cancelled_at" bigint,
	"cancelled_parts_used" boolean,
	"odometer_km" double precision,
	"notes" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" text NOT NULL,
	"bike_type_id" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"ingredient_id" text NOT NULL,
	"change_quantity" double precision NOT NULL,
	"cost_per_unit_at_time" double precision,
	"reason" text NOT NULL,
	"reference_type" text NOT NULL,
	"reference_id" text,
	"notes" text,
	"occurred_at" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_take_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"stock_take_id" text NOT NULL,
	"ingredient_id" text NOT NULL,
	"book_quantity" double precision NOT NULL,
	"counted_quantity" double precision,
	"difference" double precision
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_takes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"started_at" bigint NOT NULL,
	"completed_at" bigint,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"notes" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supplier_item_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"supplier_id" text NOT NULL,
	"raw_description" text NOT NULL,
	"ingredient_id" text NOT NULL,
	"default_quantity" double precision NOT NULL,
	"default_unit" text NOT NULL,
	"last_unit_cost" double precision NOT NULL,
	"last_used_at" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" text NOT NULL,
	"contact_info" text,
	"gstin" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenants" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bikes" ADD CONSTRAINT "bikes_bike_type_id_bike_types_id_fk" FOREIGN KEY ("bike_type_id") REFERENCES "public"."bike_types"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_item_availability" ADD CONSTRAINT "menu_item_availability_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_recipe_version_id_recipe_versions_id_fk" FOREIGN KEY ("recipe_version_id") REFERENCES "public"."recipe_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_prepared_ingredient_id_ingredients_id_fk" FOREIGN KEY ("prepared_ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_recipe_version_id_recipe_versions_id_fk" FOREIGN KEY ("recipe_version_id") REFERENCES "public"."recipe_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_version_id_recipe_versions_id_fk" FOREIGN KEY ("recipe_version_id") REFERENCES "public"."recipe_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_child_ingredient_id_ingredients_id_fk" FOREIGN KEY ("child_ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_event_lines" ADD CONSTRAINT "service_event_lines_service_event_id_service_events_id_fk" FOREIGN KEY ("service_event_id") REFERENCES "public"."service_events"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_event_lines" ADD CONSTRAINT "service_event_lines_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_events" ADD CONSTRAINT "service_events_bike_id_bikes_id_fk" FOREIGN KEY ("bike_id") REFERENCES "public"."bikes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_events" ADD CONSTRAINT "service_events_service_template_id_service_templates_id_fk" FOREIGN KEY ("service_template_id") REFERENCES "public"."service_templates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_events" ADD CONSTRAINT "service_events_service_template_version_id_recipe_versions_id_fk" FOREIGN KEY ("service_template_version_id") REFERENCES "public"."recipe_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_templates" ADD CONSTRAINT "service_templates_bike_type_id_bike_types_id_fk" FOREIGN KEY ("bike_type_id") REFERENCES "public"."bike_types"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_take_lines" ADD CONSTRAINT "stock_take_lines_stock_take_id_stock_takes_id_fk" FOREIGN KEY ("stock_take_id") REFERENCES "public"."stock_takes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_take_lines" ADD CONSTRAINT "stock_take_lines_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supplier_item_mappings" ADD CONSTRAINT "supplier_item_mappings_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supplier_item_mappings" ADD CONSTRAINT "supplier_item_mappings_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bike_types_tenant_name" ON "bike_types" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bikes_tenant_number" ON "bikes" USING btree ("tenant_id","bike_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bikes_tenant_type" ON "bikes" USING btree ("tenant_id","bike_type_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bikes_tenant_active" ON "bikes" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ingredients_tenant_name" ON "ingredients" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ingredients_tenant_active" ON "ingredients" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_invoice_lines_invoice" ON "invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_invoices_tenant_supplier" ON "invoices" USING btree ("tenant_id","supplier_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_invoices_tenant_status_date" ON "invoices" USING btree ("tenant_id","status","invoice_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_availability_tenant_menu_item" ON "menu_item_availability" USING btree ("tenant_id","menu_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_menu_items_tenant_name" ON "menu_items" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_menu_items_tenant_category" ON "menu_items" USING btree ("tenant_id","category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_menu_items_tenant_variant" ON "menu_items" USING btree ("tenant_id","variant_group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_order_lines_order" ON "order_lines" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ordering_channels_tenant_key" ON "ordering_channels" USING btree ("tenant_id","key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_tenant_status_placed_at" ON "orders" USING btree ("tenant_id","status","placed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_tenant_source_placed_at" ON "orders" USING btree ("tenant_id","source","placed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_batches_ingredient_produced_at" ON "production_batches" USING btree ("tenant_id","prepared_ingredient_id","produced_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_recipe_ingredients_version" ON "recipe_ingredients" USING btree ("recipe_version_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_recipe_versions_parent_current" ON "recipe_versions" USING btree ("tenant_id","parent_id","parent_type","is_current");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_service_event_lines_event" ON "service_event_lines" USING btree ("service_event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_service_events_tenant_status_started" ON "service_events" USING btree ("tenant_id","status","started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_service_events_tenant_kind_started" ON "service_events" USING btree ("tenant_id","kind","started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_service_events_tenant_bike_started" ON "service_events" USING btree ("tenant_id","bike_id","started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_service_events_tenant_template_started" ON "service_events" USING btree ("tenant_id","service_template_id","started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_service_templates_tenant_bike_type" ON "service_templates" USING btree ("tenant_id","bike_type_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_service_templates_tenant_name" ON "service_templates" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_service_templates_tenant_active" ON "service_templates" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_movements_ingredient_occurred_at" ON "stock_movements" USING btree ("ingredient_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_movements_reason_occurred_at" ON "stock_movements" USING btree ("reason","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_movements_reference" ON "stock_movements" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_take_lines_take" ON "stock_take_lines" USING btree ("stock_take_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_takes_tenant_status" ON "stock_takes" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_takes_tenant_started" ON "stock_takes" USING btree ("tenant_id","started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_mappings_tenant_supplier_desc" ON "supplier_item_mappings" USING btree ("tenant_id","supplier_id","raw_description");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_suppliers_tenant_name" ON "suppliers" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_suppliers_tenant_gstin" ON "suppliers" USING btree ("tenant_id","gstin");