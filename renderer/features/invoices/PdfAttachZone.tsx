import { useRef, useState } from 'react';
import { FileUp, Paperclip, X } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import { useAttachInvoicePdf, useParseInvoice } from '@renderer/hooks/ipc/useInvoices';
import type { ParseResult } from '@shared/schemas/invoiceParser';

type Props = {
  invoiceId: string | null;
  filePath: string | null;
  disabled?: boolean;
  onParsed?: (result: ParseResult, bytes: Uint8Array) => void;
};

const MB = 1024 * 1024;

export function PdfAttachZone({ invoiceId, filePath, disabled, onParsed }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const attach = useAttachInvoicePdf();
  const parse = useParseInvoice();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [size, setSize] = useState<number | null>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only .pdf files are accepted.');
      return;
    }
    if (file.size > 10 * MB) {
      setError(`PDF exceeds 10 MB cap (${(file.size / MB).toFixed(1)} MB).`);
      return;
    }
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Parse first.
    let parseResult: ParseResult;
    try {
      parseResult = await parse.mutateAsync(bytes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse PDF');
      return;
    }
    if (onParsed) onParsed(parseResult, bytes);

    // Attach only if we have an invoice draft and the parse didn't say "duplicate".
    if (invoiceId && !(parseResult.ok === false && parseResult.reason === 'duplicate')) {
      try {
        await attach.mutateAsync({
          id: invoiceId,
          fileName: file.name,
          bytes,
        });
        setName(file.name);
        setSize(file.size);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not attach PDF');
      }
    }
  }

  const attached = invoiceId !== null && filePath !== null;

  return (
    <div
      className={`rounded-md border-2 border-dashed bg-background-primary px-3 py-3 transition-colors ${
        disabled
          ? 'border-border-tertiary opacity-60'
          : attached
            ? 'border-text-success bg-background-success/40'
            : 'border-border-primary hover:border-text-info'
      }`}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
      }}
      onDrop={(e) => {
        if (disabled) return;
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file) void handleFile(file);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      {attached ? (
        <div className="flex items-center gap-2">
          <Paperclip className="h-3.5 w-3.5 text-text-success" />
          <div className="flex flex-col">
            <span className="text-[12px] font-medium text-text-primary">
              {name ?? 'PDF attached'}
            </span>
            {size != null ? (
              <span className="text-[10px] text-text-tertiary">
                {(size / MB).toFixed(2)} MB · uploaded
              </span>
            ) : (
              <span className="text-[10px] text-text-tertiary">{filePath}</span>
            )}
          </div>
          {!disabled ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => inputRef.current?.click()}
            >
              Replace
            </Button>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || attach.isPending || parse.isPending}
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center gap-2 text-left text-text-secondary"
        >
          <FileUp className="h-4 w-4" />
          <div className="flex flex-col">
            <span className="text-[12px] font-medium">
              {attach.isPending || parse.isPending
                ? 'Working…'
                : 'Drop a PDF here, or click to browse'}
            </span>
            <span className="text-[10px] text-text-tertiary">PDF only · max 10 MB</span>
          </div>
        </button>
      )}
      {error ? (
        <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-background-danger px-2 py-1 text-[11px] text-text-danger">
          <X className="h-3 w-3" /> {error}
        </div>
      ) : null}
    </div>
  );
}
