import { asc, eq, inArray } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { invoiceLines, type InvoiceLineRow, type InvoiceLineInsert } from '../db/schema';

export const invoiceLineRepository = {
  listForInvoice(db: AppDb, invoiceId: string): InvoiceLineRow[] {
    return db
      .select()
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, invoiceId))
      .orderBy(asc(invoiceLines.displayOrder), asc(invoiceLines.id))
      .all();
  },

  /** All lines belonging to any of the given invoice ids. Used by Dashboard
   *  to build the by-ingredient and by-category spending breakdowns. */
  listForInvoices(db: AppDb, invoiceIds: string[]): InvoiceLineRow[] {
    if (invoiceIds.length === 0) return [];
    return db
      .select()
      .from(invoiceLines)
      .where(inArray(invoiceLines.invoiceId, invoiceIds))
      .all();
  },

  insertMany(db: AppDb, rows: InvoiceLineInsert[]): InvoiceLineRow[] {
    if (rows.length === 0) return [];
    return db.insert(invoiceLines).values(rows).returning().all();
  },

  deleteForInvoice(db: AppDb, invoiceId: string): void {
    db.delete(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId)).run();
  },
};
