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
  async list(db: AppDb, tenantId: number, filter: InvoiceFilter = {}): Promise<InvoiceRow[]> {
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
      .limit(Math.max(1, Math.min(500, filter.limit ?? 200)));
  },

  async findById(db: AppDb, tenantId: number, id: string): Promise<InvoiceRow | undefined> {
    const rows = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, id)));
    return rows[0];
  },

  async findByNumber(
    db: AppDb,
    tenantId: number,
    supplierId: string,
    invoiceNumber: string,
  ): Promise<InvoiceRow | undefined> {
    const rows = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.supplierId, supplierId),
          eq(invoices.invoiceNumber, invoiceNumber),
        ),
      );
    return rows[0];
  },

  async insert(db: AppDb, row: InvoiceInsert): Promise<InvoiceRow> {
    const [inserted] = await db.insert(invoices).values(row).returning();
    if (!inserted) throw new Error('invoice insert returned no row');
    return inserted;
  },

  async update(
    db: AppDb,
    tenantId: number,
    id: string,
    patch: Partial<InvoiceInsert>,
  ): Promise<InvoiceRow | undefined> {
    const [updated] = await db
      .update(invoices)
      .set(patch)
      .where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, id)))
      .returning();
    return updated;
  },

  /**
   * Committed invoices whose `committed_at` falls inside [start, end). Drives
   * the spending tile and supplier breakdown.
   */
  async listCommittedInRange(
    db: AppDb,
    tenantId: number,
    range: InvoiceDateRange,
  ): Promise<InvoiceRow[]> {
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
      .orderBy(asc(invoices.committedAt));
  },
};
