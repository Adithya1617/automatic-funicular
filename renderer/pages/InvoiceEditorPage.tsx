import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import type { LineDraft } from '@shared/schemas/invoice';
import type { ParseResult } from '@shared/schemas/invoiceParser';
import type { IngredientSuggestion } from '@shared/invoiceTemplates/types';
import type { Ingredient } from '@shared/schemas/ingredient';
import { getTemplateById } from '@shared/invoiceTemplates';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table';
import { useIngredients } from '@renderer/hooks/ipc/useIngredients';
import { useSuppliers } from '@renderer/hooks/ipc/useSuppliers';
import {
  useCommitInvoice,
  useCreateInvoiceDraft,
  useInvoice,
  useParseInvoice,
  useReplaceInvoiceLines,
  useUpdateInvoice,
} from '@renderer/hooks/ipc/useInvoices';
import { InvoiceHeaderForm, type InvoiceHeaderValues } from '@renderer/features/invoices/InvoiceHeaderForm';
import { PdfAttachZone } from '@renderer/features/invoices/PdfAttachZone';
import { InvoiceLineRow, type LineDraftRow } from '@renderer/features/invoices/InvoiceLineRow';
import { InvoiceTotalsCard } from '@renderer/features/invoices/InvoiceTotalsCard';
import { SupplierEditorDialog } from '@renderer/features/suppliers/SupplierEditorDialog';
import { NewIngredientDialog } from '@renderer/features/ingredients/NewIngredientDialog';

let lineKeyCounter = 0;
const nextLineKey = () => `l-${++lineKeyCounter}`;

function emptyLine(): LineDraftRow {
  return {
    key: nextLineKey(),
    rawDescription: '',
    ingredientId: null,
    quantity: 0,
    unit: '',
    unitCost: 0,
  };
}

function dateToInputValue(unixMs: number): string {
  const d = new Date(unixMs);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function inputValueToUnixMs(value: string): number {
  if (!value) return Date.now();
  const [y, m, d] = value.split('-').map((s) => Number.parseInt(s, 10));
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 12, 0, 0).getTime();
}

export function InvoiceEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const { data: existing } = useInvoice(id);
  const { data: suppliers = [] } = useSuppliers({ includeInactive: false });
  const { data: ingredients = [] } = useIngredients({ includeInactive: false });

  const createDraft = useCreateInvoiceDraft();
  const updateInvoice = useUpdateInvoice();
  const replaceLines = useReplaceInvoiceLines();
  const commit = useCommitInvoice();

  const isCommitted = existing?.status === 'committed';

  const [header, setHeader] = useState<InvoiceHeaderValues>({
    supplierId: '',
    invoiceNumber: '',
    invoiceDateInput: dateToInputValue(Date.now()),
    notes: '',
  });
  const [rows, setRows] = useState<LineDraftRow[]>([emptyLine()]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [parseInfo, setParseInfo] = useState<string | null>(null);
  const [duplicateInvoiceId, setDuplicateInvoiceId] = useState<string | null>(null);
  const [lastDroppedBytes, setLastDroppedBytes] = useState<Uint8Array | null>(null);
  const [unknownSupplier, setUnknownSupplier] = useState<{ gstin: string; templateId: string } | null>(null);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [createIngredientFor, setCreateIngredientFor] = useState<{
    rowKey: string;
    initial: { name: string; baseUnit: 'g' | 'ml' | 'each'; category: string };
  } | null>(null);
  const [perRowSuggestions, setPerRowSuggestions] = useState<Record<string, IngredientSuggestion>>({});

  const parseInvoice = useParseInvoice();

  function handleParsed(result: ParseResult, bytes?: Uint8Array) {
    setDuplicateInvoiceId(null);
    setParseInfo(null);
    if (bytes) setLastDroppedBytes(bytes);
    setUnknownSupplier(null);

    if (!result.ok) {
      if (result.reason === 'duplicate') {
        setDuplicateInvoiceId(result.existingInvoiceId ?? null);
        return;
      }
      if (result.reason === 'unknown_supplier_format') {
        setParseInfo('PDF format not recognised — fill the invoice manually.');
        return;
      }
      setParseInfo('Could not extract data from this PDF.');
      return;
    }

    // Pre-fill header.
    setHeader({
      supplierId: result.header.supplierId ?? '',
      invoiceNumber: result.header.invoiceNumber,
      invoiceDateInput: dateToInputValue(result.header.invoiceDate),
      notes: '',
    });

    // Compute per-row suggestions from the matched template.
    const tpl = getTemplateById(result.templateId);
    const rowKeys = result.lines.map(() => nextLineKey());
    const suggestionsByKey: Record<string, IngredientSuggestion> = {};
    const newRows: LineDraftRow[] =
      result.lines.length === 0
        ? [emptyLine()]
        : result.lines.map((l, i) => {
            const key = rowKeys[i]!;
            if (tpl) {
              suggestionsByKey[key] = tpl.suggestIngredient({
                rawDescription: l.rawDescription,
                quantity: l.quantity,
                unit: (l.unit === 'g' || l.unit === 'ml' || l.unit === 'each' ? l.unit : '') as
                  | ''
                  | 'g'
                  | 'ml'
                  | 'each',
                unitCost: l.unitCost,
                categoryHint: l.categoryHint,
              });
            }
            return {
              key,
              rawDescription: l.rawDescription,
              ingredientId: l.ingredientId,
              quantity: l.quantity,
              unit: l.unit,
              unitCost: l.unitCost,
            };
          });
    setRows(newRows);
    setPerRowSuggestions(suggestionsByKey);

    // Detect unknown_supplier issue from the parser.
    const unknownIssue = result.issues.find(
      (i) => i.kind === 'unknown_supplier',
    ) as { kind: 'unknown_supplier'; gstin: string | null } | undefined;
    if (unknownIssue && unknownIssue.gstin) {
      setUnknownSupplier({ gstin: unknownIssue.gstin, templateId: result.templateId });
    }

    // Build a one-line summary of issues.
    const skipped = result.issues
      .filter((i) => i.kind === 'skipped_charge')
      .reduce((sum, i) => sum + (i as { total: number }).total, 0);
    const unmapped = result.lines.filter((l) => l.ingredientId === null).length;
    const parts: string[] = [];
    if (unmapped > 0) parts.push(`${unmapped} line${unmapped === 1 ? '' : 's'} need an ingredient mapping`);
    if (skipped > 0) parts.push(`₹${skipped.toFixed(2)} in fees not added to stock`);
    if (parts.length > 0) setParseInfo(parts.join(' · '));
  }

  async function reParseLastBytes() {
    if (!lastDroppedBytes) return;
    try {
      const result = await parseInvoice.mutateAsync(lastDroppedBytes);
      handleParsed(result);
    } catch (err) {
      setParseInfo(err instanceof Error ? err.message : 'Could not re-parse PDF');
    }
  }

  function handleIngredientCreated(rowKey: string, ingredient: Ingredient) {
    setCreateIngredientFor(null);
    setRows((prev) =>
      prev.map((r) =>
        r.key === rowKey
          ? { ...r, ingredientId: ingredient.id, unit: r.unit || ingredient.baseUnit }
          : r,
      ),
    );
  }

  useEffect(() => {
    if (existing) {
      setHeader({
        supplierId: existing.supplierId,
        invoiceNumber: existing.invoiceNumber,
        invoiceDateInput: dateToInputValue(existing.invoiceDate),
        notes: existing.notes ?? '',
      });
      setRows(
        existing.lines.length === 0
          ? [emptyLine()]
          : existing.lines.map((line) => ({
              key: nextLineKey(),
              rawDescription: line.rawDescription,
              ingredientId: line.ingredientId,
              quantity: line.quantity,
              unit: line.unit,
              unitCost: line.unitCost,
            })),
      );
    }
  }, [existing?.id, existing?.lines.length]);

  const subtotal = useMemo(
    () => rows.reduce((acc, r) => acc + r.quantity * r.unitCost, 0),
    [rows],
  );

  const allRowsValid = rows.every(
    (r) =>
      r.rawDescription.trim().length > 0 &&
      r.ingredientId !== null &&
      r.quantity > 0 &&
      r.unit.length > 0 &&
      r.unitCost >= 0,
  );
  const headerValid =
    header.supplierId.length > 0 &&
    header.invoiceNumber.trim().length > 0 &&
    header.invoiceDateInput.length > 0;

  function rowsToDraft(): LineDraft[] {
    return rows.map((r, idx) => ({
      rawDescription: r.rawDescription.trim(),
      ingredientId: r.ingredientId,
      quantity: r.quantity,
      unit: r.unit,
      unitCost: r.unitCost,
      displayOrder: idx,
    }));
  }

  async function handleSaveDraft() {
    setServerError(null);
    if (!headerValid) {
      setServerError('Supplier, invoice number, and date are required.');
      return;
    }
    try {
      if (isNew) {
        const created = await createDraft.mutateAsync({
          supplierId: header.supplierId,
          invoiceNumber: header.invoiceNumber.trim(),
          invoiceDate: inputValueToUnixMs(header.invoiceDateInput),
          notes: header.notes.trim() || null,
          lines: rowsToDraft(),
        });
        navigate(`/invoices/${created.id}/edit`, { replace: true });
      } else if (existing) {
        await updateInvoice.mutateAsync({
          id: existing.id,
          supplierId: header.supplierId,
          invoiceNumber: header.invoiceNumber.trim(),
          invoiceDate: inputValueToUnixMs(header.invoiceDateInput),
          notes: header.notes.trim() || null,
        });
        await replaceLines.mutateAsync({
          id: existing.id,
          lines: rowsToDraft(),
        });
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not save draft');
    }
  }

  async function handleCommit() {
    if (!existing) return;
    setServerError(null);
    try {
      // Persist current state first, then commit.
      await updateInvoice.mutateAsync({
        id: existing.id,
        supplierId: header.supplierId,
        invoiceNumber: header.invoiceNumber.trim(),
        invoiceDate: inputValueToUnixMs(header.invoiceDateInput),
        notes: header.notes.trim() || null,
      });
      await replaceLines.mutateAsync({
        id: existing.id,
        lines: rowsToDraft(),
      });
      await commit.mutateAsync({ id: existing.id });
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not commit invoice');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[12px] text-text-secondary">
          <Link to="/invoices" className="inline-flex items-center gap-1 hover:text-text-primary">
            <ArrowLeft className="h-3 w-3" /> Invoices
          </Link>
          <span className="text-text-tertiary">/</span>
          <span className="text-text-primary">
            {isNew ? 'New invoice' : existing?.invoiceNumber ?? '…'}
          </span>
          {existing ? (
            <Badge variant={isCommitted ? 'success' : 'warning'} className="ml-1">
              {isCommitted ? 'COMMITTED' : 'DRAFT'}
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="md" onClick={() => navigate('/invoices')}>
            {isCommitted ? 'Back' : 'Cancel'}
          </Button>
          {!isCommitted ? (
            <>
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={handleSaveDraft}
                disabled={
                  !headerValid ||
                  createDraft.isPending ||
                  updateInvoice.isPending ||
                  replaceLines.isPending
                }
              >
                Save draft
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={handleCommit}
                disabled={
                  isNew ||
                  !headerValid ||
                  !allRowsValid ||
                  rows.length === 0 ||
                  commit.isPending
                }
                title={
                  !allRowsValid
                    ? 'Map every row to an ingredient before committing'
                    : isNew
                      ? 'Save the draft first'
                      : undefined
                }
              >
                Map &amp; commit
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <section className="rounded-lg border border-border-tertiary bg-background-primary p-4">
        <h2 className="mb-3 text-[13px] font-medium text-text-primary">Header</h2>
        <InvoiceHeaderForm
          values={header}
          onChange={setHeader}
          suppliers={suppliers}
          disabled={isCommitted}
        />
        {!isCommitted ? (
          <div className="mt-3">
            <PdfAttachZone
              invoiceId={existing?.id ?? null}
              filePath={existing?.filePath ?? null}
              disabled={isCommitted}
              onParsed={(result, bytes) => handleParsed(result, bytes)}
            />
            {unknownSupplier ? (
              <div className="mt-2 rounded-md border border-border-tertiary bg-background-secondary px-3 py-2 text-[12px] text-text-secondary">
                <div className="mb-1 font-medium text-text-primary">
                  This PDF is from a supplier we don't recognise yet.
                </div>
                <div className="mb-2">
                  Detected GSTIN: <span className="font-mono">{unknownSupplier.gstin}</span>
                  {(() => {
                    const tpl = getTemplateById(unknownSupplier.templateId);
                    return tpl ? (
                      <>
                        {' · '}Suggested name: <span className="font-medium">{tpl.defaultSupplierName}</span>
                      </>
                    ) : null;
                  })()}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => setSupplierDialogOpen(true)}
                  >
                    Create supplier and re-parse
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setUnknownSupplier(null)}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            ) : null}
            {parseInfo ? (
              <div className="mt-2 rounded-md border border-border-tertiary bg-background-secondary px-3 py-2 text-[12px] text-text-secondary">
                {parseInfo}
              </div>
            ) : null}
            {duplicateInvoiceId ? (
              <div className="mt-2 rounded-md border border-border-tertiary bg-background-warning/30 px-3 py-2 text-[12px] text-text-warning">
                This invoice was already imported.{' '}
                <Link to={`/invoices/${duplicateInvoiceId}/edit`} className="underline">
                  Open existing invoice
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-border-tertiary bg-background-primary p-4">
        <h2 className="mb-2 text-[13px] font-medium text-text-primary">Line items</h2>
        <div className="overflow-hidden rounded-lg border border-border-tertiary">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Unit cost</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, idx) => (
                <InvoiceLineRow
                  key={row.key}
                  draft={row}
                  ingredients={ingredients}
                  supplierId={header.supplierId || null}
                  suggestion={perRowSuggestions[row.key] ?? null}
                  disabled={isCommitted}
                  onChange={(next) =>
                    setRows((prev) => prev.map((r, i) => (i === idx ? next : r)))
                  }
                  onRemove={() =>
                    setRows((prev) =>
                      prev.length === 1 ? [emptyLine()] : prev.filter((_, i) => i !== idx),
                    )
                  }
                  onCreateNew={(s) =>
                    setCreateIngredientFor({
                      rowKey: row.key,
                      initial: { name: s.name, baseUnit: s.baseUnit, category: s.category },
                    })
                  }
                />
              ))}
            </TableBody>
          </Table>
          {!isCommitted ? (
            <button
              type="button"
              onClick={() => setRows((prev) => [...prev, emptyLine()])}
              className="flex w-full items-center justify-center gap-1 border-t border-border-tertiary py-2 text-[11px] italic text-text-info hover:bg-background-tertiary"
            >
              <Plus className="h-3 w-3" /> Add line item
            </button>
          ) : null}
        </div>

        <div className="mt-3 flex">
          <InvoiceTotalsCard itemCount={rows.length} subtotal={subtotal} />
        </div>
      </section>

      {serverError ? (
        <div className="rounded-md bg-background-danger px-2.5 py-1.5 text-[12px] text-text-danger">
          {serverError}
        </div>
      ) : null}

      <SupplierEditorDialog
        open={supplierDialogOpen}
        onOpenChange={setSupplierDialogOpen}
        supplier={null}
        initialName={unknownSupplier ? (getTemplateById(unknownSupplier.templateId)?.defaultSupplierName ?? '') : ''}
        initialGstin={unknownSupplier?.gstin ?? ''}
        onCreated={() => {
          void reParseLastBytes();
        }}
      />

      <NewIngredientDialog
        open={createIngredientFor !== null}
        onOpenChange={(o) => {
          if (!o) setCreateIngredientFor(null);
        }}
        initial={
          createIngredientFor
            ? {
                name: createIngredientFor.initial.name,
                baseUnit: createIngredientFor.initial.baseUnit,
                category: createIngredientFor.initial.category,
              }
            : undefined
        }
        onCreated={(ing) => {
          if (createIngredientFor) handleIngredientCreated(createIngredientFor.rowKey, ing);
        }}
      />
    </div>
  );
}
