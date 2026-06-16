import type { AppDb } from '../db/client';
import { ingredientRepository } from '../repositories/ingredientRepository';
import { invoiceLineRepository } from '../repositories/invoiceLineRepository';
import { invoiceRepository } from '../repositories/invoiceRepository';
import { stockMovementRepository } from '../repositories/stockMovementRepository';
import { supplierRepository } from '../repositories/supplierRepository';
import { toCsv } from '@shared/utils/csv';
import type { ExportReportInput, ExportReportResponse } from '@shared/schemas/report';

export const ReportService = {
  async export(
    db: AppDb,
    tenantId: number,
    input: ExportReportInput,
  ): Promise<ExportReportResponse> {
    switch (input.kind) {
      case 'movements':
        return exportMovements(db, tenantId, input);
      case 'spending':
        return exportSpending(db, tenantId, input);
    }
  },
};

async function exportMovements(
  db: AppDb,
  tenantId: number,
  input: ExportReportInput,
): Promise<ExportReportResponse> {
  const movements = await stockMovementRepository.listInRange(db, tenantId, input.range);
  const ingredients = await ingredientRepository.list(db, tenantId, { includeInactive: true });
  const ingById = new Map(ingredients.map((i) => [i.id, i]));

  const header = [
    'occurred_at',
    'ingredient',
    'reason',
    'change_quantity',
    'base_unit',
    'cost_per_unit_at_time',
    'reference_type',
    'reference_id',
    'notes',
  ];
  const rows = movements.map((m) => {
    const ing = ingById.get(m.ingredientId);
    return [
      new Date(m.occurredAt).toISOString(),
      ing?.name ?? m.ingredientId,
      m.reason,
      m.changeQuantity,
      ing?.baseUnit ?? '',
      m.costPerUnitAtTime ?? '',
      m.referenceType,
      m.referenceId ?? '',
      m.notes ?? '',
    ];
  });

  return {
    filename: filenameFor('movements', input.range),
    content: toCsv([header, ...rows]),
  };
}

async function exportSpending(
  db: AppDb,
  tenantId: number,
  input: ExportReportInput,
): Promise<ExportReportResponse> {
  const invoices = await invoiceRepository.listCommittedInRange(db, tenantId, input.range);
  const lines = await invoiceLineRepository.listForInvoices(db, invoices.map((i) => i.id));
  const suppliers = await supplierRepository.list(db, tenantId, { includeInactive: true });
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  const ingredients = await ingredientRepository.list(db, tenantId, { includeInactive: true });
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));
  const invoiceById = new Map(invoices.map((i) => [i.id, i]));

  const header = [
    'invoice_date',
    'invoice_number',
    'supplier',
    'raw_description',
    'ingredient',
    'category',
    'quantity',
    'unit',
    'unit_cost',
    'total_cost',
  ];
  const rows = lines.map((line) => {
    const inv = invoiceById.get(line.invoiceId);
    const supplier = inv ? supplierById.get(inv.supplierId) : undefined;
    const ing = line.ingredientId ? ingredientById.get(line.ingredientId) : undefined;
    return [
      inv ? new Date(inv.invoiceDate).toISOString().slice(0, 10) : '',
      inv?.invoiceNumber ?? '',
      supplier?.name ?? '',
      line.rawDescription,
      ing?.name ?? '',
      ing?.category ?? '',
      line.quantity,
      line.unit,
      line.unitCost,
      line.totalCost,
    ];
  });

  return {
    filename: filenameFor('spending', input.range),
    content: toCsv([header, ...rows]),
  };
}

function filenameFor(kind: string, range: { startMs: number; endMs: number }): string {
  const start = new Date(range.startMs).toISOString().slice(0, 10);
  const end = new Date(range.endMs).toISOString().slice(0, 10);
  return `hyprride_${kind}_${start}_${end}.csv`;
}
