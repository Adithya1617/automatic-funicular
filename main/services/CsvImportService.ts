import type { AppDb } from '../db/client';
import { newId } from '../lib/ids';
import { bikeRepository } from '../repositories/bikeRepository';
import { bikeTypeRepository } from '../repositories/bikeTypeRepository';
import { ingredientRepository } from '../repositories/ingredientRepository';
import { serviceTemplateRepository } from '../repositories/serviceTemplateRepository';
import { supplierRepository } from '../repositories/supplierRepository';
import { stockMovementRepository } from '../repositories/stockMovementRepository';
import { RecipeService } from './RecipeService';
import {
  parseCsvTable,
  type CsvTable,
} from '@shared/utils/csvParser';
import {
  type CsvImportInput,
  type CsvImportIssue,
  type CsvImportResult,
} from '@shared/schemas/csvImport';
import { BASE_UNITS } from '@shared/constants/enums';
import { SYSTEM_USER_ID } from '@shared/constants/system';
import { toBase } from '@shared/utils/unitConverter';
import type {
  BikeRow,
  BikeTypeRow,
  IngredientRow,
  ServiceTemplateRow,
  SupplierRow,
} from '../db/schema';

type Issue = CsvImportIssue;

export const CsvImportService = {
  async run(
    db: AppDb,
    tenantId: number,
    input: CsvImportInput,
    actorId: string = SYSTEM_USER_ID,
  ): Promise<CsvImportResult> {
    const table = parseCsvTable(input.content);
    switch (input.kind) {
      case 'parts':
        return importParts(db, tenantId, table, input.dryRun, actorId);
      case 'suppliers':
        return importSuppliers(db, tenantId, table, input.dryRun, actorId);
      case 'bikes':
        return importBikes(db, tenantId, table, input.dryRun, actorId);
      case 'service_templates':
        return importServiceTemplates(db, tenantId, table, input.dryRun, actorId);
    }
  },
};

/* =============================== Parts =================================== */
// Hyprride: parts live in the `ingredients` table (rename punted to slice H9).
// CSV always sets type='raw' — there are no "prepared" parts for bike rentals,
// so we don't expose that column to the operator.

async function importParts(
  db: AppDb,
  tenantId: number,
  table: CsvTable,
  dryRun: boolean,
  actorId: string,
): Promise<CsvImportResult> {
  const issues: Issue[] = [];
  requireHeaders(table, ['name', 'category', 'base_unit'], 'parts', issues);

  type Plan =
    | { mode: 'create'; row: RowDraftPart; lineNumber: number }
    | {
        mode: 'update';
        existing: IngredientRow;
        row: RowDraftPart;
        lineNumber: number;
      };
  const plans: Plan[] = [];
  const existingByName = new Map<string, IngredientRow>();
  for (const ing of await ingredientRepository.list(db, tenantId, { includeInactive: true })) {
    existingByName.set(ing.name.toLowerCase(), ing);
  }

  for (const row of table.rows) {
    const draft = parsePartRow(row.values, row.lineNumber, issues);
    if (!draft) continue;
    const existing = existingByName.get(draft.name.toLowerCase());
    if (existing) {
      if (existing.baseUnit !== draft.baseUnit) {
        const movements = await stockMovementRepository.list(db, tenantId, {
          ingredientId: existing.id,
          limit: 1,
        });
        if (movements.length > 0) {
          issues.push({
            lineNumber: row.lineNumber,
            field: 'base_unit',
            message: `Cannot change base_unit for "${existing.name}" — it has stock movements`,
          });
          continue;
        }
      }
      plans.push({ mode: 'update', existing, row: draft, lineNumber: row.lineNumber });
    } else {
      plans.push({ mode: 'create', row: draft, lineNumber: row.lineNumber });
    }
  }

  const summary = {
    totalRows: table.rows.length,
    toCreate: plans.filter((p) => p.mode === 'create').length,
    toUpdate: plans.filter((p) => p.mode === 'update').length,
    skipped: table.rows.length - plans.length,
  };
  return finishImport('parts', summary, issues, dryRun, async () => {
    await db.transaction(async (tx) => {
      const now = Date.now();
      for (const plan of plans) {
        if (plan.mode === 'create') {
          await ingredientRepository.insert(tx, {
            id: newId(),
            tenantId,
            name: plan.row.name,
            category: plan.row.category,
            type: 'raw',
            baseUnit: plan.row.baseUnit,
            stockQuantity: 0,
            reservedQuantity: 0,
            lowStockThreshold: plan.row.lowStockThreshold,
            currentAvgCostPerUnit: 0,
            densityGPerMl: plan.row.densityGPerMl,
            isActive: true,
            createdAt: now,
            updatedAt: now,
            createdBy: actorId,
            updatedBy: actorId,
          });
        } else {
          await ingredientRepository.update(tx, tenantId, plan.existing.id, {
            name: plan.row.name,
            category: plan.row.category,
            baseUnit: plan.row.baseUnit,
            lowStockThreshold: plan.row.lowStockThreshold,
            densityGPerMl: plan.row.densityGPerMl,
            updatedAt: now,
            updatedBy: actorId,
          });
        }
      }
    });
  });
}

type RowDraftPart = {
  name: string;
  category: string;
  baseUnit: 'g' | 'ml' | 'each';
  lowStockThreshold: number;
  densityGPerMl: number | null;
};

function parsePartRow(
  v: Record<string, string>,
  lineNumber: number,
  issues: Issue[],
): RowDraftPart | null {
  const name = v.name?.trim();
  const category = v.category?.trim();
  const baseUnit = v.base_unit?.trim() as 'g' | 'ml' | 'each';
  const thresholdStr = v.low_stock_threshold?.trim() ?? '';
  const densityStr = v.density_g_per_ml?.trim() ?? '';

  let ok = true;
  if (!name) {
    issues.push({ lineNumber, field: 'name', message: 'name is required' });
    ok = false;
  }
  if (!category) {
    issues.push({ lineNumber, field: 'category', message: 'category is required' });
    ok = false;
  }
  if (!BASE_UNITS.includes(baseUnit)) {
    issues.push({
      lineNumber,
      field: 'base_unit',
      message: `base_unit must be one of ${BASE_UNITS.join(', ')}`,
    });
    ok = false;
  }
  let lowStockThreshold = 0;
  if (thresholdStr) {
    const n = Number.parseFloat(thresholdStr);
    if (!Number.isFinite(n) || n < 0) {
      issues.push({
        lineNumber,
        field: 'low_stock_threshold',
        message: 'low_stock_threshold must be a non-negative number',
      });
      ok = false;
    } else {
      lowStockThreshold = n;
    }
  }
  let densityGPerMl: number | null = null;
  if (densityStr) {
    const n = Number.parseFloat(densityStr);
    if (!Number.isFinite(n) || n <= 0) {
      issues.push({
        lineNumber,
        field: 'density_g_per_ml',
        message: 'density_g_per_ml must be a positive number when present',
      });
      ok = false;
    } else {
      densityGPerMl = n;
    }
  }
  if (!ok || !name || !category) return null;
  return { name, category, baseUnit, lowStockThreshold, densityGPerMl };
}

/* ============================== Suppliers ================================ */

async function importSuppliers(
  db: AppDb,
  tenantId: number,
  table: CsvTable,
  dryRun: boolean,
  actorId: string,
): Promise<CsvImportResult> {
  const issues: Issue[] = [];
  requireHeaders(table, ['name'], 'suppliers', issues);

  type Plan =
    | { mode: 'create'; row: RowDraftSupplier; lineNumber: number }
    | { mode: 'update'; existing: SupplierRow; row: RowDraftSupplier; lineNumber: number };
  const plans: Plan[] = [];
  const existingByName = new Map<string, SupplierRow>();
  for (const s of await supplierRepository.list(db, tenantId, { includeInactive: true })) {
    existingByName.set(s.name.toLowerCase(), s);
  }

  for (const row of table.rows) {
    const name = row.values.name?.trim();
    if (!name) {
      issues.push({ lineNumber: row.lineNumber, field: 'name', message: 'name is required' });
      continue;
    }
    const draft: RowDraftSupplier = {
      name,
      contactInfo: row.values.contact_info?.trim() || null,
      notes: row.values.notes?.trim() || null,
    };
    const existing = existingByName.get(name.toLowerCase());
    if (existing) plans.push({ mode: 'update', existing, row: draft, lineNumber: row.lineNumber });
    else plans.push({ mode: 'create', row: draft, lineNumber: row.lineNumber });
  }

  const summary = {
    totalRows: table.rows.length,
    toCreate: plans.filter((p) => p.mode === 'create').length,
    toUpdate: plans.filter((p) => p.mode === 'update').length,
    skipped: table.rows.length - plans.length,
  };
  return finishImport('suppliers', summary, issues, dryRun, async () => {
    await db.transaction(async (tx) => {
      const now = Date.now();
      for (const plan of plans) {
        if (plan.mode === 'create') {
          await supplierRepository.insert(tx, {
            id: newId(),
            tenantId,
            name: plan.row.name,
            contactInfo: plan.row.contactInfo,
            notes: plan.row.notes,
            isActive: true,
            createdAt: now,
            updatedAt: now,
            createdBy: actorId,
            updatedBy: actorId,
          });
        } else {
          await supplierRepository.update(tx, tenantId, plan.existing.id, {
            name: plan.row.name,
            contactInfo: plan.row.contactInfo,
            notes: plan.row.notes,
            updatedAt: now,
            updatedBy: actorId,
          });
        }
      }
    });
  });
}

type RowDraftSupplier = {
  name: string;
  contactInfo: string | null;
  notes: string | null;
};

/* =============================== Bikes =================================== */
// bike_number is the natural key. bike_type is resolved by (engine_cc, name)
// against bike_types — unknown combos become row-level errors rather than
// inserting orphan types (CLAUDE.md treats bike_types as a fixed roster
// that's seeded via migration).

async function importBikes(
  db: AppDb,
  tenantId: number,
  table: CsvTable,
  dryRun: boolean,
  actorId: string,
): Promise<CsvImportResult> {
  const issues: Issue[] = [];
  requireHeaders(table, ['bike_number', 'engine_cc', 'bike_type'], 'bikes', issues);

  const allBikeTypes = await bikeTypeRepository.list(db, tenantId, { includeInactive: true });
  const bikeTypeKey = (cc: number, name: string) => `${cc}::${name.toLowerCase()}`;
  const bikeTypeByKey = new Map<string, BikeTypeRow>();
  for (const t of allBikeTypes) {
    bikeTypeByKey.set(bikeTypeKey(t.engineCc, t.name), t);
  }

  type Plan =
    | { mode: 'create'; row: RowDraftBikeResolved; lineNumber: number }
    | { mode: 'update'; existing: BikeRow; row: RowDraftBikeResolved; lineNumber: number };
  const plans: Plan[] = [];
  const existingByNumber = new Map<string, BikeRow>();
  for (const b of await bikeRepository.list(db, tenantId, { includeInactive: true })) {
    existingByNumber.set(b.bikeNumber.toLowerCase(), b);
  }

  for (const row of table.rows) {
    const draft = parseBikeRow(row.values, row.lineNumber, issues);
    if (!draft) continue;

    const bikeType = bikeTypeByKey.get(bikeTypeKey(draft.engineCc, draft.bikeTypeName));
    if (!bikeType) {
      issues.push({
        lineNumber: row.lineNumber,
        field: 'bike_type',
        message: `Bike type "${draft.engineCc}cc ${draft.bikeTypeName}" not found — add it via bike_types seed first`,
      });
      continue;
    }

    const planRow: RowDraftBikeResolved = {
      bikeNumber: draft.bikeNumber,
      bikeTypeId: bikeType.id,
      licensePlate: draft.licensePlate,
      odometerKm: draft.odometerKm,
      notes: draft.notes,
    };
    const existing = existingByNumber.get(draft.bikeNumber.toLowerCase());
    if (existing) {
      plans.push({ mode: 'update', existing, row: planRow, lineNumber: row.lineNumber });
    } else {
      plans.push({ mode: 'create', row: planRow, lineNumber: row.lineNumber });
    }
  }

  const summary = {
    totalRows: table.rows.length,
    toCreate: plans.filter((p) => p.mode === 'create').length,
    toUpdate: plans.filter((p) => p.mode === 'update').length,
    skipped: table.rows.length - plans.length,
  };
  return finishImport('bikes', summary, issues, dryRun, async () => {
    await db.transaction(async (tx) => {
      const now = Date.now();
      for (const plan of plans) {
        if (plan.mode === 'create') {
          await bikeRepository.insert(tx, {
            id: newId(),
            tenantId,
            bikeNumber: plan.row.bikeNumber,
            bikeTypeId: plan.row.bikeTypeId,
            licensePlate: plan.row.licensePlate,
            odometerKm: plan.row.odometerKm,
            notes: plan.row.notes,
            isActive: true,
            createdAt: now,
            updatedAt: now,
            createdBy: actorId,
            updatedBy: actorId,
          });
        } else {
          await bikeRepository.update(tx, tenantId, plan.existing.id, {
            bikeNumber: plan.row.bikeNumber,
            bikeTypeId: plan.row.bikeTypeId,
            licensePlate: plan.row.licensePlate,
            odometerKm: plan.row.odometerKm,
            notes: plan.row.notes,
            updatedAt: now,
            updatedBy: actorId,
          });
        }
      }
    });
  });
}

type RowDraftBike = {
  bikeNumber: string;
  engineCc: number;
  bikeTypeName: string;
  licensePlate: string | null;
  odometerKm: number | null;
  notes: string | null;
};

type RowDraftBikeResolved = {
  bikeNumber: string;
  bikeTypeId: string;
  licensePlate: string | null;
  odometerKm: number | null;
  notes: string | null;
};

function parseBikeRow(
  v: Record<string, string>,
  lineNumber: number,
  issues: Issue[],
): RowDraftBike | null {
  const bikeNumber = v.bike_number?.trim();
  const engineCcStr = v.engine_cc?.trim() ?? '';
  const bikeTypeName = v.bike_type?.trim();
  const odoStr = v.odometer_km?.trim() ?? '';

  let ok = true;
  if (!bikeNumber) {
    issues.push({ lineNumber, field: 'bike_number', message: 'bike_number is required' });
    ok = false;
  }
  let engineCc = 0;
  const ccN = Number.parseInt(engineCcStr, 10);
  if (!Number.isFinite(ccN) || ccN <= 0) {
    issues.push({
      lineNumber,
      field: 'engine_cc',
      message: 'engine_cc must be a positive integer',
    });
    ok = false;
  } else {
    engineCc = ccN;
  }
  if (!bikeTypeName) {
    issues.push({ lineNumber, field: 'bike_type', message: 'bike_type is required' });
    ok = false;
  }
  let odometerKm: number | null = null;
  if (odoStr) {
    const n = Number.parseFloat(odoStr);
    if (!Number.isFinite(n) || n < 0) {
      issues.push({
        lineNumber,
        field: 'odometer_km',
        message: 'odometer_km must be a non-negative number',
      });
      ok = false;
    } else {
      odometerKm = n;
    }
  }
  if (!ok || !bikeNumber || !bikeTypeName) return null;
  return {
    bikeNumber,
    engineCc,
    bikeTypeName,
    licensePlate: v.license_plate?.trim() || null,
    odometerKm,
    notes: v.notes?.trim() || null,
  };
}

/* ========================== Service templates ============================ */
// Each row is one part line. Rows sharing (template_name, engine_cc, bike_type)
// belong to the same template — multiple rows per template define the recipe.
// On commit we find-or-create the template, then save a new recipe version
// with the captured rows (Path A: editing a template creates a new version,
// past events keep their snapshot).

type ServiceTemplateRowDraft = {
  templateName: string;
  engineCc: number;
  bikeTypeName: string;
  partName: string;
  quantity: number;
  unit: string;
  displayOrder: number | null;
  notes: string | null;
  lineNumber: number;
};

async function importServiceTemplates(
  db: AppDb,
  tenantId: number,
  table: CsvTable,
  dryRun: boolean,
  actorId: string,
): Promise<CsvImportResult> {
  const issues: Issue[] = [];
  requireHeaders(
    table,
    ['template_name', 'engine_cc', 'bike_type', 'part_name', 'quantity', 'unit'],
    'service_templates',
    issues,
  );

  const allBikeTypes = await bikeTypeRepository.list(db, tenantId, { includeInactive: true });
  const bikeTypeKey = (cc: number, name: string) => `${cc}::${name.toLowerCase()}`;
  const bikeTypeByKey = new Map<string, BikeTypeRow>();
  for (const t of allBikeTypes) {
    bikeTypeByKey.set(bikeTypeKey(t.engineCc, t.name), t);
  }
  const ingredientsByName = new Map<string, IngredientRow>();
  for (const i of await ingredientRepository.list(db, tenantId, { includeInactive: true })) {
    ingredientsByName.set(i.name.toLowerCase(), i);
  }

  type Group = {
    templateName: string;
    bikeTypeId: string;
    rows: Array<{
      childIngredientId: string;
      quantity: number;
      unit: string;
      notes: string | null;
      displayOrder: number;
    }>;
    firstLine: number;
  };
  const groups = new Map<string, Group>();

  for (const row of table.rows) {
    const draft = parseServiceTemplateRow(row.values, row.lineNumber, issues);
    if (!draft) continue;

    const bikeType = bikeTypeByKey.get(bikeTypeKey(draft.engineCc, draft.bikeTypeName));
    if (!bikeType) {
      issues.push({
        lineNumber: row.lineNumber,
        field: 'bike_type',
        message: `Bike type "${draft.engineCc}cc ${draft.bikeTypeName}" not found`,
      });
      continue;
    }
    const part = ingredientsByName.get(draft.partName.toLowerCase());
    if (!part) {
      issues.push({
        lineNumber: row.lineNumber,
        field: 'part_name',
        message: `Part "${draft.partName}" not found — import parts first`,
      });
      continue;
    }
    try {
      toBase(draft.quantity, draft.unit, part.baseUnit, {
        densityGPerMl: part.densityGPerMl ?? undefined,
      });
    } catch (err) {
      issues.push({
        lineNumber: row.lineNumber,
        field: 'unit',
        message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    const key = `${draft.templateName.toLowerCase()}::${bikeType.id}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        templateName: draft.templateName,
        bikeTypeId: bikeType.id,
        rows: [],
        firstLine: row.lineNumber,
      };
      groups.set(key, group);
    }
    group.rows.push({
      childIngredientId: part.id,
      quantity: draft.quantity,
      unit: draft.unit,
      notes: draft.notes,
      displayOrder: draft.displayOrder ?? group.rows.length,
    });
  }

  const existingTemplatesByKey = new Map<string, ServiceTemplateRow>();
  for (const t of await serviceTemplateRepository.list(db, tenantId, { includeInactive: true })) {
    existingTemplatesByKey.set(
      `${t.name.toLowerCase()}::${t.bikeTypeId}`,
      t,
    );
  }

  const planGroups = [...groups.values()];
  const totalGroupedRows = planGroups.reduce((acc, g) => acc + g.rows.length, 0);
  const toCreate = planGroups.filter(
    (g) => !existingTemplatesByKey.has(`${g.templateName.toLowerCase()}::${g.bikeTypeId}`),
  ).length;
  const toUpdate = planGroups.length - toCreate;
  const summary = {
    totalRows: table.rows.length,
    toCreate,
    toUpdate,
    skipped: table.rows.length - totalGroupedRows,
  };
  return finishImport('service_templates', summary, issues, dryRun, async () => {
    await db.transaction(async (tx) => {
      const now = Date.now();
      for (const group of planGroups) {
        const lookupKey = `${group.templateName.toLowerCase()}::${group.bikeTypeId}`;
        let template = existingTemplatesByKey.get(lookupKey);
        if (!template) {
          template = await serviceTemplateRepository.insert(tx, {
            id: newId(),
            tenantId,
            name: group.templateName,
            bikeTypeId: group.bikeTypeId,
            displayOrder: 0,
            isActive: true,
            createdAt: now,
            updatedAt: now,
            createdBy: actorId,
            updatedBy: actorId,
          });
        }
        await RecipeService.saveVersion(
          tx,
          tenantId,
          {
            parentId: template.id,
            parentType: 'service_template',
            targetYield: 1,
            notes: null,
            rows: group.rows,
          },
          actorId,
        );
      }
    });
  });
}

function parseServiceTemplateRow(
  v: Record<string, string>,
  lineNumber: number,
  issues: Issue[],
): ServiceTemplateRowDraft | null {
  const templateName = v.template_name?.trim();
  const engineCcStr = v.engine_cc?.trim() ?? '';
  const bikeTypeName = v.bike_type?.trim();
  const partName = v.part_name?.trim();
  const quantityStr = v.quantity?.trim() ?? '';
  const unit = v.unit?.trim();
  const displayStr = v.display_order?.trim() ?? '';
  const notes = v.notes?.trim() || null;

  let ok = true;
  if (!templateName) {
    issues.push({ lineNumber, field: 'template_name', message: 'template_name is required' });
    ok = false;
  }
  let engineCc = 0;
  const ccN = Number.parseInt(engineCcStr, 10);
  if (!Number.isFinite(ccN) || ccN <= 0) {
    issues.push({
      lineNumber,
      field: 'engine_cc',
      message: 'engine_cc must be a positive integer',
    });
    ok = false;
  } else {
    engineCc = ccN;
  }
  if (!bikeTypeName) {
    issues.push({ lineNumber, field: 'bike_type', message: 'bike_type is required' });
    ok = false;
  }
  if (!partName) {
    issues.push({ lineNumber, field: 'part_name', message: 'part_name is required' });
    ok = false;
  }
  let quantity = 0;
  const qn = Number.parseFloat(quantityStr);
  if (!Number.isFinite(qn) || qn <= 0) {
    issues.push({ lineNumber, field: 'quantity', message: 'quantity must be a positive number' });
    ok = false;
  } else {
    quantity = qn;
  }
  if (!unit) {
    issues.push({ lineNumber, field: 'unit', message: 'unit is required' });
    ok = false;
  }
  let displayOrder: number | null = null;
  if (displayStr) {
    const n = Number.parseInt(displayStr, 10);
    if (!Number.isFinite(n)) {
      issues.push({
        lineNumber,
        field: 'display_order',
        message: 'display_order must be an integer',
      });
      ok = false;
    } else {
      displayOrder = n;
    }
  }
  if (!ok || !templateName || !bikeTypeName || !partName || !unit) return null;
  return {
    templateName,
    engineCc,
    bikeTypeName,
    partName,
    quantity,
    unit,
    displayOrder,
    notes,
    lineNumber,
  };
}

/* ============================ Shared finishers ============================ */

function requireHeaders(table: CsvTable, required: string[], kind: string, issues: Issue[]): void {
  const missing = required.filter((h) => !table.headers.includes(h));
  if (missing.length > 0) {
    issues.push({
      lineNumber: 1,
      field: null,
      message: `${kind} CSV missing required header(s): ${missing.join(', ')}`,
    });
  }
}

async function finishImport(
  kind: import('@shared/schemas/csvImport').CsvImportKind,
  summary: import('@shared/schemas/csvImport').CsvImportSummary,
  issues: Issue[],
  dryRun: boolean,
  commit: () => Promise<void>,
): Promise<CsvImportResult> {
  const blocked = issues.length > 0;
  const committed = !dryRun && !blocked;
  if (committed) await commit();
  return {
    kind,
    dryRun,
    committed,
    summary,
    issues,
  };
}
