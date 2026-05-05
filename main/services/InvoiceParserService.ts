import type { AppDb } from '../db/client';
import { extractPdfText } from '@shared/utils/pdfText';
import { detectTemplate } from '@shared/invoiceTemplates';
import type { ParseInvoiceInput, ParseResult } from '@shared/schemas/invoiceParser';
import { supplierRepository } from '../repositories/supplierRepository';
import { supplierItemMappingRepository } from '../repositories/supplierItemMappingRepository';
import { invoiceRepository } from '../repositories/invoiceRepository';

export const InvoiceParserService = {
  async parse(db: AppDb, tenantId: number, input: ParseInvoiceInput): Promise<ParseResult> {
    let text;
    try {
      text = await extractPdfText(input.bytes);
    } catch {
      return { ok: false, reason: 'pdf_extraction_failed' };
    }
    if (text.pages.length === 0) {
      return { ok: false, reason: 'unknown_supplier_format' };
    }

    const template = detectTemplate(text);
    if (!template) {
      return { ok: false, reason: 'unknown_supplier_format' };
    }

    const tplResult = template.parse(text);

    // Resolve supplier by GSTIN (active only).
    let supplierId: string | null = null;
    if (tplResult.header.supplierGstin) {
      const sup = supplierRepository.findByGstin(db, tenantId, tplResult.header.supplierGstin);
      if (sup && sup.isActive) supplierId = sup.id;
    }

    // Duplicate check.
    if (supplierId && tplResult.header.invoiceNumber) {
      const existing = invoiceRepository.findByNumber(
        db,
        tenantId,
        supplierId,
        tplResult.header.invoiceNumber,
      );
      if (existing) {
        return { ok: false, reason: 'duplicate', existingInvoiceId: existing.id };
      }
    }

    // Per-line mapping resolve.
    const lines = tplResult.lines.map((line) => {
      let ingredientId: string | null = null;
      if (supplierId) {
        const mapping = supplierItemMappingRepository.findByDescription(
          db,
          tenantId,
          supplierId,
          line.rawDescription,
        );
        if (mapping) ingredientId = mapping.ingredientId;
      }
      return { ...line, ingredientId };
    });

    return {
      ok: true,
      templateId: template.id,
      header: {
        supplierId,
        invoiceNumber: tplResult.header.invoiceNumber,
        invoiceDate: tplResult.header.invoiceDate,
      },
      lines,
      issues: [
        ...tplResult.issues,
        ...(tplResult.header.supplierGstin && !supplierId
          ? [{ kind: 'unknown_supplier' as const, gstin: tplResult.header.supplierGstin }]
          : []),
      ],
    };
  },
};
