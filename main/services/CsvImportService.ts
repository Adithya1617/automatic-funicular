import type { AppDb } from '../db/client';
import { newId } from '../lib/ids';
import { ingredientRepository } from '../repositories/ingredientRepository';
import { menuItemRepository } from '../repositories/menuItemRepository';
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
import { BASE_UNITS, INGREDIENT_TYPES } from '@shared/constants/enums';
import { SYSTEM_USER_ID } from '@shared/constants/system';
import { toBase } from '@shared/utils/unitConverter';
import type { IngredientRow, MenuItemRow, SupplierRow } from '../db/schema';

type Issue = CsvImportIssue;

type RecipeRow = {
  parentName: string;
  parentType: 'menu_item' | 'ingredient';
  childName: string;
  quantity: number;
  unit: string;
  notes: string | null;
  lineNumber: number;
};

export const CsvImportService = {
  run(
    db: AppDb,
    tenantId: number,
    input: CsvImportInput,
    actorId: string = SYSTEM_USER_ID,
  ): CsvImportResult {
    const table = parseCsvTable(input.content);
    switch (input.kind) {
      case 'ingredients':
        return importIngredients(db, tenantId, table, input.dryRun, actorId);
      case 'suppliers':
        return importSuppliers(db, tenantId, table, input.dryRun, actorId);
      case 'menu_items':
        return importMenuItems(db, tenantId, table, input.dryRun, actorId);
      case 'recipes':
        return importRecipes(db, tenantId, table, input.dryRun, actorId);
    }
  },
};

/* ============================ Ingredients =============================== */

function importIngredients(
  db: AppDb,
  tenantId: number,
  table: CsvTable,
  dryRun: boolean,
  actorId: string,
): CsvImportResult {
  const issues: Issue[] = [];
  requireHeaders(table, ['name', 'category', 'type', 'base_unit'], 'ingredients', issues);

  type Plan =
    | { mode: 'create'; row: RowDraftIngredient; lineNumber: number }
    | {
        mode: 'update';
        existing: IngredientRow;
        row: RowDraftIngredient;
        lineNumber: number;
      };
  const plans: Plan[] = [];
  const existingByName = new Map<string, IngredientRow>();
  for (const ing of ingredientRepository.list(db, tenantId, { includeInactive: true })) {
    existingByName.set(ing.name.toLowerCase(), ing);
  }

  for (const row of table.rows) {
    const draft = parseIngredientRow(row.values, row.lineNumber, issues);
    if (!draft) continue;
    const existing = existingByName.get(draft.name.toLowerCase());
    if (existing) {
      if (existing.baseUnit !== draft.baseUnit) {
        const movements = stockMovementRepository.list(db, tenantId, {
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
  return finishImport('ingredients', summary, issues, dryRun, () => {
    db.transaction((tx) => {
      const now = Date.now();
      for (const plan of plans) {
        if (plan.mode === 'create') {
          ingredientRepository.insert(tx, {
            id: newId(),
            tenantId,
            name: plan.row.name,
            category: plan.row.category,
            type: plan.row.type,
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
          ingredientRepository.update(tx, tenantId, plan.existing.id, {
            name: plan.row.name,
            category: plan.row.category,
            type: plan.row.type,
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

type RowDraftIngredient = {
  name: string;
  category: string;
  type: 'raw' | 'prepared';
  baseUnit: 'g' | 'ml' | 'each';
  lowStockThreshold: number;
  densityGPerMl: number | null;
};

function parseIngredientRow(
  v: Record<string, string>,
  lineNumber: number,
  issues: Issue[],
): RowDraftIngredient | null {
  const name = v.name?.trim();
  const category = v.category?.trim();
  const type = v.type?.trim() as 'raw' | 'prepared';
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
  if (!INGREDIENT_TYPES.includes(type)) {
    issues.push({
      lineNumber,
      field: 'type',
      message: `type must be one of ${INGREDIENT_TYPES.join(', ')}`,
    });
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
  return { name, category, type, baseUnit, lowStockThreshold, densityGPerMl };
}

/* ============================== Suppliers ================================ */

function importSuppliers(
  db: AppDb,
  tenantId: number,
  table: CsvTable,
  dryRun: boolean,
  actorId: string,
): CsvImportResult {
  const issues: Issue[] = [];
  requireHeaders(table, ['name'], 'suppliers', issues);

  type Plan =
    | { mode: 'create'; row: RowDraftSupplier; lineNumber: number }
    | { mode: 'update'; existing: SupplierRow; row: RowDraftSupplier; lineNumber: number };
  const plans: Plan[] = [];
  const existingByName = new Map<string, SupplierRow>();
  for (const s of supplierRepository.list(db, tenantId, { includeInactive: true })) {
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
  return finishImport('suppliers', summary, issues, dryRun, () => {
    db.transaction((tx) => {
      const now = Date.now();
      for (const plan of plans) {
        if (plan.mode === 'create') {
          supplierRepository.insert(tx, {
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
          supplierRepository.update(tx, tenantId, plan.existing.id, {
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

/* ============================== Menu items =============================== */

function importMenuItems(
  db: AppDb,
  tenantId: number,
  table: CsvTable,
  dryRun: boolean,
  actorId: string,
): CsvImportResult {
  const issues: Issue[] = [];
  requireHeaders(table, ['name', 'category', 'selling_price'], 'menu_items', issues);

  type Plan =
    | { mode: 'create'; row: RowDraftMenuItem; lineNumber: number }
    | { mode: 'update'; existing: MenuItemRow; row: RowDraftMenuItem; lineNumber: number };
  const plans: Plan[] = [];
  const existingByName = new Map<string, MenuItemRow>();
  for (const m of menuItemRepository.list(db, tenantId, { includeInactive: true })) {
    existingByName.set(m.name.toLowerCase(), m);
  }
  // Cache variant_group label → groupId, so multiple rows in the same import
  // sharing a variant_group share the same UUID.
  const groupLabelToId = new Map<string, string>();

  for (const row of table.rows) {
    const draft = parseMenuItemRow(row.values, row.lineNumber, issues, groupLabelToId);
    if (!draft) continue;
    const existing = existingByName.get(draft.name.toLowerCase());
    if (existing) plans.push({ mode: 'update', existing, row: draft, lineNumber: row.lineNumber });
    else plans.push({ mode: 'create', row: draft, lineNumber: row.lineNumber });
  }

  const summary = {
    totalRows: table.rows.length,
    toCreate: plans.filter((p) => p.mode === 'create').length,
    toUpdate: plans.filter((p) => p.mode === 'update').length,
    skipped: table.rows.length - plans.length,
  };
  return finishImport('menu_items', summary, issues, dryRun, () => {
    db.transaction((tx) => {
      const now = Date.now();
      for (const plan of plans) {
        if (plan.mode === 'create') {
          menuItemRepository.insert(tx, {
            id: newId(),
            tenantId,
            name: plan.row.name,
            category: plan.row.category,
            sellingPrice: plan.row.sellingPrice,
            variantGroupId: plan.row.variantGroupId,
            displayOrder: plan.row.displayOrder,
            isActive: true,
            createdAt: now,
            updatedAt: now,
            createdBy: actorId,
            updatedBy: actorId,
          });
        } else {
          menuItemRepository.update(tx, tenantId, plan.existing.id, {
            name: plan.row.name,
            category: plan.row.category,
            sellingPrice: plan.row.sellingPrice,
            variantGroupId: plan.row.variantGroupId ?? plan.existing.variantGroupId,
            displayOrder: plan.row.displayOrder,
            updatedAt: now,
            updatedBy: actorId,
          });
        }
      }
    });
  });
}

type RowDraftMenuItem = {
  name: string;
  category: string;
  sellingPrice: number;
  variantGroupId: string | null;
  displayOrder: number;
};

function parseMenuItemRow(
  v: Record<string, string>,
  lineNumber: number,
  issues: Issue[],
  groupLabelToId: Map<string, string>,
): RowDraftMenuItem | null {
  const name = v.name?.trim();
  const category = v.category?.trim();
  const priceStr = v.selling_price?.trim() ?? '';
  const groupLabel = v.variant_group?.trim() ?? '';
  const displayStr = v.display_order?.trim() ?? '';

  let ok = true;
  if (!name) {
    issues.push({ lineNumber, field: 'name', message: 'name is required' });
    ok = false;
  }
  if (!category) {
    issues.push({ lineNumber, field: 'category', message: 'category is required' });
    ok = false;
  }
  let sellingPrice = 0;
  if (priceStr) {
    const n = Number.parseFloat(priceStr);
    if (!Number.isFinite(n) || n < 0) {
      issues.push({
        lineNumber,
        field: 'selling_price',
        message: 'selling_price must be a non-negative number',
      });
      ok = false;
    } else {
      sellingPrice = n;
    }
  }
  let displayOrder = 0;
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
  let variantGroupId: string | null = null;
  if (groupLabel) {
    const cached = groupLabelToId.get(groupLabel);
    if (cached) {
      variantGroupId = cached;
    } else {
      const fresh = newId();
      groupLabelToId.set(groupLabel, fresh);
      variantGroupId = fresh;
    }
  }
  if (!ok || !name || !category) return null;
  return { name, category, sellingPrice, variantGroupId, displayOrder };
}

/* =============================== Recipes ================================= */

function importRecipes(
  db: AppDb,
  tenantId: number,
  table: CsvTable,
  dryRun: boolean,
  actorId: string,
): CsvImportResult {
  const issues: Issue[] = [];
  requireHeaders(
    table,
    ['parent_name', 'parent_type', 'child_ingredient_name', 'quantity', 'unit'],
    'recipes',
    issues,
  );

  const ingredientsByName = new Map<string, IngredientRow>();
  for (const i of ingredientRepository.list(db, tenantId, { includeInactive: true })) {
    ingredientsByName.set(i.name.toLowerCase(), i);
  }
  const menuItemsByName = new Map<string, MenuItemRow>();
  for (const m of menuItemRepository.list(db, tenantId, { includeInactive: true })) {
    menuItemsByName.set(m.name.toLowerCase(), m);
  }

  // Group rows by (parentType, parentName).
  type Group = {
    parentId: string;
    parentType: 'menu_item' | 'ingredient';
    parentName: string;
    rows: RecipeRow[];
    firstLine: number;
  };
  const groups = new Map<string, Group>();

  for (const row of table.rows) {
    const draft = parseRecipeRow(row.values, row.lineNumber, issues);
    if (!draft) continue;

    let parentId: string | null = null;
    if (draft.parentType === 'menu_item') {
      parentId = menuItemsByName.get(draft.parentName.toLowerCase())?.id ?? null;
      if (!parentId) {
        issues.push({
          lineNumber: row.lineNumber,
          field: 'parent_name',
          message: `Menu item "${draft.parentName}" not found — import menu items first`,
        });
        continue;
      }
    } else {
      const ing = ingredientsByName.get(draft.parentName.toLowerCase());
      if (!ing) {
        issues.push({
          lineNumber: row.lineNumber,
          field: 'parent_name',
          message: `Ingredient "${draft.parentName}" not found`,
        });
        continue;
      }
      if (ing.type !== 'prepared') {
        issues.push({
          lineNumber: row.lineNumber,
          field: 'parent_type',
          message: `Ingredient "${draft.parentName}" is type=raw — recipes require type=prepared`,
        });
        continue;
      }
      parentId = ing.id;
    }
    const child = ingredientsByName.get(draft.childName.toLowerCase());
    if (!child) {
      issues.push({
        lineNumber: row.lineNumber,
        field: 'child_ingredient_name',
        message: `Ingredient "${draft.childName}" not found`,
      });
      continue;
    }
    // Unit compatibility check.
    try {
      toBase(draft.quantity, draft.unit, child.baseUnit, {
        densityGPerMl: child.densityGPerMl ?? undefined,
      });
    } catch (err) {
      issues.push({
        lineNumber: row.lineNumber,
        field: 'unit',
        message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    const key = `${draft.parentType}:${parentId}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        parentId,
        parentType: draft.parentType,
        parentName: draft.parentName,
        rows: [],
        firstLine: row.lineNumber,
      };
      groups.set(key, group);
    }
    group.rows.push({ ...draft, lineNumber: row.lineNumber });
    // Annotate the child id on the row for the writer.
    (group.rows[group.rows.length - 1] as RecipeRow & { childId?: string }).childId = child.id;
  }

  // Plans: one per parent group → saveVersion call.
  const planGroups = [...groups.values()];
  const totalGroupedRows = planGroups.reduce((acc, g) => acc + g.rows.length, 0);
  const summary = {
    totalRows: table.rows.length,
    toCreate: 0,
    toUpdate: planGroups.length, // one new RecipeVersion per parent
    skipped: table.rows.length - totalGroupedRows,
  };
  return finishImport('recipes', summary, issues, dryRun, () => {
    for (const group of planGroups) {
      RecipeService.saveVersion(
        db,
        tenantId,
        {
          parentId: group.parentId,
          parentType: group.parentType,
          targetYield: 1,
          notes: null,
          rows: group.rows.map((r, idx) => ({
            childIngredientId: (r as RecipeRow & { childId: string }).childId,
            quantity: r.quantity,
            unit: r.unit,
            notes: r.notes,
            displayOrder: idx,
          })),
        },
        actorId,
      );
    }
  });
}

function parseRecipeRow(
  v: Record<string, string>,
  lineNumber: number,
  issues: Issue[],
): Omit<RecipeRow, 'lineNumber'> | null {
  const parentName = v.parent_name?.trim();
  const parentType = v.parent_type?.trim() as 'menu_item' | 'ingredient';
  const childName = v.child_ingredient_name?.trim();
  const quantityStr = v.quantity?.trim() ?? '';
  const unit = v.unit?.trim();
  const notes = v.notes?.trim() || null;

  let ok = true;
  if (!parentName) {
    issues.push({ lineNumber, field: 'parent_name', message: 'parent_name is required' });
    ok = false;
  }
  if (parentType !== 'menu_item' && parentType !== 'ingredient') {
    issues.push({
      lineNumber,
      field: 'parent_type',
      message: 'parent_type must be menu_item or ingredient',
    });
    ok = false;
  }
  if (!childName) {
    issues.push({
      lineNumber,
      field: 'child_ingredient_name',
      message: 'child_ingredient_name is required',
    });
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
  if (!ok || !parentName || !childName || !unit) return null;
  return { parentName, parentType, childName, quantity, unit, notes };
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

function finishImport(
  kind: import('@shared/schemas/csvImport').CsvImportKind,
  summary: import('@shared/schemas/csvImport').CsvImportSummary,
  issues: Issue[],
  dryRun: boolean,
  commit: () => void,
): CsvImportResult {
  const blocked = issues.length > 0;
  const committed = !dryRun && !blocked;
  if (committed) commit();
  return {
    kind,
    dryRun,
    committed,
    summary,
    issues,
  };
}
