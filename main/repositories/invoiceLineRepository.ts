import { asc, eq, inArray } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { invoiceLines, type InvoiceLineRow, type InvoiceLineInsert } from '../db/schema';

export const invoiceLineRepository = {
  async listForInvoice(db: AppDb, invoiceId: string): Promise<InvoiceLineRow[]> {
    return db
      .select()
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, invoiceId))
      .orderBy(asc(invoiceLines.displayOrder), asc(invoiceLines.id));
  },

  /** All lines belonging to any of the given invoice ids. Used by Dashboard
   *  to build the by-ingredient and by-category spending breakdowns. */
  async listForInvoices(db: AppDb, invoiceIds: string[]): Promise<InvoiceLineRow[]> {
    if (invoiceIds.length === 0) return [];
    return db
      .select()
      .from(invoiceLines)
      .where(inArray(invoiceLines.invoiceId, invoiceIds));
  },

  async insertMany(db: AppDb, rows: InvoiceLineInsert[]): Promise<InvoiceLineRow[]> {
    if (rows.length === 0) return [];
    return db.insert(invoiceLines).values(rows).returning();
  },

  async deleteForInvoice(db: AppDb, invoiceId: string): Promise<void> {
    await db.delete(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));
  },
};
