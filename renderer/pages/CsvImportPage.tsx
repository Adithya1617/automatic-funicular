import { useRef, useState } from 'react';
import { CheckCircle2, Download, FileWarning, Upload } from 'lucide-react';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@renderer/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@renderer/components/ui/table';
import { useCsvImport, useCsvTemplate } from '@renderer/hooks/ipc/useCsvImport';
import {
  CSV_IMPORT_KINDS,
  type CsvImportKind,
  type CsvImportResult,
} from '@shared/schemas/csvImport';

const TAB_LABELS: Record<CsvImportKind, string> = {
  ingredients: 'Ingredients',
  suppliers: 'Suppliers',
  menu_items: 'Menu items',
  recipes: 'Recipes',
};

const TAB_HELP: Record<CsvImportKind, string> = {
  ingredients:
    'Columns: name, category, type (raw|prepared), base_unit (g|ml|each), low_stock_threshold, density_g_per_ml. Existing names are updated; base_unit cannot change once movements exist.',
  suppliers: 'Columns: name, contact_info, notes.',
  menu_items:
    'Columns: name, category, selling_price, variant_group (label shared by sibling variants), display_order. Recipes import separately.',
  recipes:
    'Columns: parent_name, parent_type (menu_item|ingredient), child_ingredient_name, quantity, unit, notes. Each save creates a new recipe version (locked decision §3.3).',
};

export function CsvImportPage() {
  const [active, setActive] = useState<CsvImportKind>('ingredients');
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="text-[14px] font-medium text-text-primary">CSV import</h1>
        <p className="text-[12px] text-text-secondary">
          Upload a CSV per kind. Imports run in two passes — validation first, then a
          single transactional commit. Existing rows are matched by name.
        </p>
      </div>
      <Tabs value={active} onValueChange={(v) => setActive(v as CsvImportKind)}>
        <TabsList>
          {CSV_IMPORT_KINDS.map((kind) => (
            <TabsTrigger key={kind} value={kind}>
              {TAB_LABELS[kind]}
            </TabsTrigger>
          ))}
        </TabsList>
        {CSV_IMPORT_KINDS.map((kind) => (
          <TabsContent key={kind} value={kind}>
            <ImportPanel kind={kind} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function ImportPanel({ kind }: { kind: CsvImportKind }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const template = useCsvTemplate();
  const runImport = useCsvImport();

  function reset() {
    setContent(null);
    setFilename(null);
    setResult(null);
    setServerError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function downloadTemplate() {
    setServerError(null);
    try {
      const tpl = await template.mutateAsync({ kind });
      triggerDownload(tpl.filename, tpl.content);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not fetch template');
    }
  }

  async function handleFile(file: File) {
    setServerError(null);
    setResult(null);
    const text = await file.text();
    setContent(text);
    setFilename(file.name);
  }

  async function handleRun(dryRun: boolean) {
    if (!content) return;
    setServerError(null);
    try {
      const r = await runImport.mutateAsync({ kind, content, dryRun });
      setResult(r);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Import failed');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-lg border border-border-tertiary bg-background-primary p-4">
        <h2 className="text-[13px] font-medium text-text-primary">{TAB_LABELS[kind]}</h2>
        <p className="mt-1 max-w-prose text-[11px] text-text-tertiary">{TAB_HELP[kind]}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={downloadTemplate}
            disabled={template.isPending}
          >
            <Download className="h-3 w-3" />
            Download template
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3 w-3" />
            Choose CSV
          </Button>
          {filename ? (
            <span className="text-[11px] text-text-tertiary">
              {filename} ({content?.length ?? 0} bytes)
            </span>
          ) : null}
        </div>
      </section>

      {content ? (
        <section className="flex flex-col gap-2 rounded-lg border border-border-tertiary bg-background-primary p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-medium text-text-primary">Run import</h2>
            <Button type="button" variant="ghost" size="md" onClick={reset}>
              Reset
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => handleRun(true)}
              disabled={runImport.isPending}
            >
              Validate (dry-run)
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={() => handleRun(false)}
              disabled={
                runImport.isPending ||
                !result ||
                result.issues.length > 0 ||
                !result.dryRun
              }
              title={
                result === null
                  ? 'Run a dry-run first'
                  : result.issues.length > 0
                    ? 'Fix the errors below before committing'
                    : !result.dryRun
                      ? 'Already committed — reset and re-upload to import again'
                      : undefined
              }
            >
              Commit import
            </Button>
          </div>

          {serverError ? (
            <div className="rounded-md bg-background-danger px-2.5 py-1.5 text-[12px] text-text-danger">
              {serverError}
            </div>
          ) : null}
        </section>
      ) : null}

      {result ? <ResultPanel result={result} /> : null}
    </div>
  );
}

function ResultPanel({ result }: { result: CsvImportResult }) {
  const ok = result.issues.length === 0;
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border-tertiary bg-background-primary p-4">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {result.committed ? (
            <Badge variant="success">COMMITTED</Badge>
          ) : ok ? (
            <Badge variant="info">DRY RUN OK</Badge>
          ) : (
            <Badge variant="danger">{result.issues.length} ERROR(S)</Badge>
          )}
          {result.committed ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-text-success" />
          ) : !ok ? (
            <FileWarning className="h-3.5 w-3.5 text-text-danger" />
          ) : null}
        </div>
        <span className="text-[11px] text-text-tertiary">
          {result.summary.totalRows} rows · {result.summary.toCreate} new ·{' '}
          {result.summary.toUpdate} update · {result.summary.skipped} skipped
        </span>
      </header>

      {result.issues.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border-tertiary">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Line</TableHead>
                <TableHead className="w-[160px]">Field</TableHead>
                <TableHead>Issue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.issues.map((issue, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-mono text-text-secondary">
                    {issue.lineNumber}
                  </TableCell>
                  <TableCell className="text-text-secondary">
                    {issue.field ?? '—'}
                  </TableCell>
                  <TableCell className="text-text-primary">{issue.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-[12px] text-text-secondary">
          {result.committed
            ? 'Import committed successfully.'
            : 'No issues found. Click "Commit import" to write changes.'}
        </p>
      )}
    </section>
  );
}

function triggerDownload(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
