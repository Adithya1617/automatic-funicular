import { and, asc, desc, eq, gte, like, lt, type SQL } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { invoices, type InvoiceRow, type InvoiceInsert } from '../db/schema';
import type { InvoiceStatus } from '@shared/schemas/invoice';

export type InvoiceDateRange = { startMs: number; endMs: number };

export type InvoiceFilter = {
  status?: InvoiceStatus;
  supplierId?: string;
  search?: string;
  limit?: number;
};

export const invoiceRepository = {
  list(db: AppDb, tenantId: number, filter: InvoiceFilter = {}): InvoiceRow[] {
    const conditions: SQL[] = [eq(invoices.tenantId, tenantId)];
    if (filter.status) conditions.push(eq(invoices.status, filter.status));
    if (filter.supplierId) conditions.push(eq(invoices.supplierId, filter.supplierId));
    if (filter.search) {
      conditions.push(like(invoices.invoiceNumber, `%${filter.search.toLowerCase()}%`));
    }
    return db
      .select()
      .from(invoices)
      .where(and(...conditions))
      .orderBy(desc(invoices.invoiceDate))
      .limit(Math.max(1, Math.min(500, filter.limit ?? 200)))
      .all();
  },

  findById(db: AppDb, tenantId: number, id: string): InvoiceRow | undefined {
    return db
      .select()
      .from(invoices)
      .where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, id)))
      .get();
  },

  findByNumber(
    db: AppDb,
    tenantId: number,
    supplierId: string,
    invoiceNumber: string,
  ): InvoiceRow | undefined {
    return db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.supplierId, supplierId),
          eq(invoices.invoiceNumber, invoiceNumber),
        ),
      )
      .get();
  },

  insert(db: AppDb, row: InvoiceInsert): InvoiceRow {
    return db.insert(invoices).values(row).returning().get();
  },

  update(
    db: AppDb,
    tenantId: number,
    id: string,
    patch: Partial<InvoiceInsert>,
  ): InvoiceRow | undefined {
    return db
      .update(invoices)
      .set(patch)
      .where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, id)))
      .returning()
      .get();
  },

  /**
   * Committed invoices whose `committed_at` falls inside [start, end). Drives
   * the spending tile and supplier breakdown.
   */
  listCommittedInRange(
    db: AppDb,
    tenantId: number,
    range: InvoiceDateRange,
  ): InvoiceRow[] {
    return db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.status, 'committed'),
          gte(invoices.committedAt, range.startMs),
          lt(invoices.committedAt, range.endMs),
        ),
      )
      .orderBy(asc(invoices.committedAt))
      .all();
  },
};
