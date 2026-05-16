import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AttachPdfInput,
  CommitInvoiceInput,
  CreateInvoiceDraftInput,
  ListInvoicesInput,
  ReplaceInvoiceLinesInput,
  UpdateInvoiceInput,
} from '@shared/schemas/invoice';
import type { ParseResult } from '@shared/schemas/invoiceParser';
import { unwrap } from '@renderer/lib/ipc';

const invoicesKey = (filter: ListInvoicesInput | undefined = undefined) =>
  ['invoices', filter ?? {}] as const;
const invoiceKey = (id: string) => ['invoice', id] as const;

export function useInvoices(filter: ListInvoicesInput = { limit: 200 }) {
  return useQuery({
    queryKey: invoicesKey(filter),
    queryFn: () => unwrap(window.hyprride.invoice.list(filter)),
  });
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: id ? invoiceKey(id) : ['invoice', 'none'],
    queryFn: () => unwrap(window.hyprride.invoice.get({ id: id! })),
    enabled: !!id,
  });
}

function useInvoiceMutation<TIn, TOut>(fn: (input: TIn) => Promise<TOut>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['invoice'] });
      qc.invalidateQueries({ queryKey: ['ingredients'] });
      qc.invalidateQueries({ queryKey: ['stockMovements'] });
      qc.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}

export function useCreateInvoiceDraft() {
  return useInvoiceMutation((input: CreateInvoiceDraftInput) =>
    unwrap(window.hyprride.invoice.createDraft(input)),
  );
}

export function useUpdateInvoice() {
  return useInvoiceMutation((input: UpdateInvoiceInput) =>
    unwrap(window.hyprride.invoice.update(input)),
  );
}

export function useReplaceInvoiceLines() {
  return useInvoiceMutation((input: ReplaceInvoiceLinesInput) =>
    unwrap(window.hyprride.invoice.replaceLines(input)),
  );
}

export function useCommitInvoice() {
  return useInvoiceMutation((input: CommitInvoiceInput) =>
    unwrap(window.hyprride.invoice.commit(input)),
  );
}

export function useAttachInvoicePdf() {
  return useInvoiceMutation((input: AttachPdfInput) =>
    unwrap(window.hyprride.invoice.attachPdf(input)),
  );
}

export function useParseInvoice() {
  return useMutation<ParseResult, Error, Uint8Array>({
    mutationFn: (bytes) =>
      unwrap(window.hyprride.invoice.parse({ bytes: bytes as Uint8Array<ArrayBuffer> })),
  });
}
