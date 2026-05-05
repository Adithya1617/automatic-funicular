import type { AppDb } from '../db/client';
import { newId } from '../lib/ids';
import { ingredientRepository } from '../repositories/ingredientRepository';
import { invoiceLineRepository } from '../repositories/invoiceLineRepository';
import { invoiceRepository } from '../repositories/invoiceRepository';
import { supplierRepository } from '../repositories/supplierRepository';
import { fileStorageRegistry } from '../adapters/storage/registry';
import { invoicePdfRelativePath } from '../lib/filePaths';
import { AvailabilityService } from './AvailabilityService';
import { InventoryService } from './InventoryService';
import { SupplierItemMappingService } from './SupplierItemMappingService';
import type {
  AttachPdfInput,
  CommitInvoiceInput,
  CreateInvoiceDraftInput,
  Invoice,
  InvoiceLine,
  InvoiceWithLines,
  ListInvoicesInput,
  ReplaceInvoiceLinesInput,
  UpdateInvoiceInput,
} from '@shared/schemas/invoice';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@shared/errors/DomainError';
import { SYSTEM_USER_ID } from '@shared/constants/system';
import { toBase } from '@shared/utils/unitConverter';

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB soft cap

function withLines(
  invoice: ReturnType<typeof invoiceRepository.findById>,
  lines: ReturnType<typeof invoiceLineRepository.listForInvoice>,
): InvoiceWithLines {
  if (!invoice) throw new Error('withLines called with empty invoice');
  return {
    ...(invoice as unknown as Invoice),
    lines: lines as unknown as InvoiceLine[],
  };
}

export const InvoiceService = {
  list(db: AppDb, tenantId: number, filter: ListInvoicesInput): Invoice[] {
    return invoiceRepository
      .list(db, tenantId, filter)
      .map((row) => row as unknown as Invoice);
  },

  get(db: AppDb, tenantId: number, id: string): InvoiceWithLines {
    const row = invoiceRepository.findById(db, tenantId, id);
    if (!row) throw new NotFoundError('Invoice', id);
    const lines = invoiceLineRepository.listForInvoice(db, id);
    return withLines(row, lines);
  },

  createDraft(
    db: AppDb,
    tenantId: number,
    input: CreateInvoiceDraftInput,
    actorId: string = SYSTEM_USER_ID,
  ): InvoiceWithLines {
    const supplier = supplierRepository.findById(db, tenantId, input.supplierId);
    if (!supplier) throw new NotFoundError('Supplier', input.supplierId);

    return db.transaction((tx) => {
      const now = Date.now();
      const id = newId();
      const inserted = invoiceRepository.insert(tx, {
        id,
        tenantId,
        supplierId: input.supplierId,
        invoiceNumber: input.invoiceNumber,
        invoiceDate: input.invoiceDate,
        totalAmount: 0,
        filePath: null,
        status: 'draft',
        notes: input.notes,
        committedAt: null,
        createdAt: now,
        updatedAt: now,
        createdBy: actorId,
        updatedBy: actorId,
      });
      const lineRows = invoiceLineRepository.insertMany(
        tx,
        input.lines.map((line, idx) => ({
          id: newId(),
          invoiceId: id,
          rawDescription: line.rawDescription,
          ingredientId: line.ingredientId,
          quantity: line.quantity,
          unit: line.unit,
          unitCost: line.unitCost,
          totalCost: line.quantity * line.unitCost,
          displayOrder: line.displayOrder || idx,
        })),
      );
      // Patch the invoice with the line-derived total.
      const total = lineRows.reduce((acc, l) => acc + l.totalCost, 0);
      const finalRow = invoiceRepository.update(tx, tenantId, id, {
        totalAmount: total,
      });
      return withLines(finalRow, lineRows);
    });
  },

  update(
    db: AppDb,
    tenantId: number,
    input: UpdateInvoiceInput,
    actorId: string = SYSTEM_USER_ID,
  ): InvoiceWithLines {
    const existing = invoiceRepository.findById(db, tenantId, input.id);
    if (!existing) throw new NotFoundError('Invoice', input.id);
    if (existing.status !== 'draft') {
      throw new ConflictError('Only draft invoices can be edited');
    }
    const patch: Record<string, unknown> = { updatedAt: Date.now(), updatedBy: actorId };
    if (input.supplierId !== undefined) {
      const supplier = supplierRepository.findById(db, tenantId, input.supplierId);
      if (!supplier) throw new NotFoundError('Supplier', input.supplierId);
      patch['supplierId'] = input.supplierId;
    }
    if (input.invoiceNumber !== undefined) patch['invoiceNumber'] = input.invoiceNumber;
    if (input.invoiceDate !== undefined) patch['invoiceDate'] = input.invoiceDate;
    if (input.notes !== undefined) patch['notes'] = input.notes;
    invoiceRepository.update(db, tenantId, input.id, patch);
    return InvoiceService.get(db, tenantId, input.id);
  },

  /**
   * Replaces all lines on a draft invoice. Slice 6 doesn't try to be clever
   * about diffing — the renderer always sends the full draft set on save.
   */
  replaceLines(
    db: AppDb,
    tenantId: number,
    input: ReplaceInvoiceLinesInput,
    actorId: string = SYSTEM_USER_ID,
  ): InvoiceWithLines {
    const existing = invoiceRepository.findById(db, tenantId, input.id);
    if (!existing) throw new NotFoundError('Invoice', input.id);
    if (existing.status !== 'draft') {
      throw new ConflictError('Only draft invoices can have their lines edited');
    }
    return db.transaction((tx) => {
      invoiceLineRepository.deleteForInvoice(tx, input.id);
      const lineRows = invoiceLineRepository.insertMany(
        tx,
        input.lines.map((line, idx) => ({
          id: newId(),
          invoiceId: input.id,
          rawDescription: line.rawDescription,
          ingredientId: line.ingredientId,
          quantity: line.quantity,
          unit: line.unit,
          unitCost: line.unitCost,
          totalCost: line.quantity * line.unitCost,
          displayOrder: line.displayOrder || idx,
        })),
      );
      const total = lineRows.reduce((acc, l) => acc + l.totalCost, 0);
      const updated = invoiceRepository.update(tx, tenantId, input.id, {
        totalAmount: total,
        updatedAt: Date.now(),
        updatedBy: actorId,
      });
      return withLines(updated, lineRows);
    });
  },

  /**
   * Commit a draft invoice. In one transaction:
   *   - validate every line is mapped + has compatible units
   *   - applyMovement(reason='purchase') per line — recomputes weighted-avg cost
   *   - upsert SupplierItemMapping per (supplier_id, raw_description)
   *   - flip invoice to committed
   * After commit, recompute availability for the union of mapped ingredients.
   */
  commit(
    db: AppDb,
    tenantId: number,
    input: CommitInvoiceInput,
    actorId: string = SYSTEM_USER_ID,
  ): InvoiceWithLines {
    const existing = invoiceRepository.findById(db, tenantId, input.id);
    if (!existing) throw new NotFoundError('Invoice', input.id);
    if (existing.status === 'committed') return InvoiceService.get(db, tenantId, input.id);
    if (existing.status !== 'draft') {
      throw new ConflictError(`Cannot commit an invoice in status ${existing.status}`);
    }

    const lines = invoiceLineRepository.listForInvoice(db, input.id);
    if (lines.length === 0) {
      throw new ValidationError('Invoice has no lines to commit');
    }

    // Pre-flight: every line mapped + units compatible with ingredient base unit.
    const resolved = lines.map((line) => {
      if (!line.ingredientId) {
        throw new ValidationError(
          `Line "${line.rawDescription}" is unmapped — assign an ingredient before committing`,
        );
      }
      const ingredient = ingredientRepository.findById(db, tenantId, line.ingredientId);
      if (!ingredient) throw new NotFoundError('Ingredient', line.ingredientId);
      // Throws ValidationError on unit incompatibility.
      toBase(line.quantity, line.unit, ingredient.baseUnit, {
        densityGPerMl: ingredient.densityGPerMl ?? undefined,
      });
      return { line, ingredient };
    });

    const touchedIngredients = new Set<string>();

    db.transaction((tx) => {
      for (const { line, ingredient } of resolved) {
        touchedIngredients.add(ingredient.id);
        InventoryService.applyMovement(
          tx,
          tenantId,
          {
            ingredientId: ingredient.id,
            quantity: line.quantity,
            unit: line.unit,
            reason: 'purchase',
            referenceType: 'invoice_line',
            referenceId: line.id,
            direction: 1,
            costPerUnitAtTime: line.unitCost,
          },
          actorId,
          { skipAvailabilityRecompute: true },
        );
        SupplierItemMappingService.upsert(
          tx,
          tenantId,
          {
            supplierId: existing.supplierId,
            rawDescription: line.rawDescription,
            ingredientId: ingredient.id,
            defaultQuantity: line.quantity,
            defaultUnit: line.unit,
            lastUnitCost: line.unitCost,
          },
          actorId,
        );
      }

      const now = Date.now();
      invoiceRepository.update(tx, tenantId, input.id, {
        status: 'committed',
        committedAt: now,
        updatedAt: now,
        updatedBy: actorId,
      });
    });

    AvailabilityService.recomputeForIngredients(db, tenantId, [...touchedIngredients]);
    return InvoiceService.get(db, tenantId, input.id);
  },

  async attachPdf(
    db: AppDb,
    tenantId: number,
    input: AttachPdfInput,
    actorId: string = SYSTEM_USER_ID,
  ): Promise<Invoice> {
    const existing = invoiceRepository.findById(db, tenantId, input.id);
    if (!existing) throw new NotFoundError('Invoice', input.id);
    if (existing.status !== 'draft') {
      throw new ConflictError('Cannot replace the PDF on a committed invoice');
    }
    if (input.bytes.byteLength > MAX_PDF_BYTES) {
      throw new ValidationError(`PDF exceeds ${MAX_PDF_BYTES / 1024 / 1024} MB cap`);
    }
    const relativePath = invoicePdfRelativePath(existing.id);
    await fileStorageRegistry.get().write(relativePath, input.bytes);

    const updated = invoiceRepository.update(db, tenantId, input.id, {
      filePath: relativePath,
      updatedAt: Date.now(),
      updatedBy: actorId,
    });
    if (!updated) throw new NotFoundError('Invoice', input.id);
    return updated as unknown as Invoice;
  },
};
