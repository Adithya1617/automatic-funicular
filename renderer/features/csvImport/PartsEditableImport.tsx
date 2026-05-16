import { useRef, useState } from 'react';
import { Download, Plus, Trash2, Upload } from 'lucide-react';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@renderer/components/ui/table';
import { useCsvImport, useCsvTemplate } from '@renderer/hooks/ipc/useCsvImport';
import { parseCsvTable } from '@shared/utils/csvParser';
import { toCsv } from '@shared/utils/csv';
import { BASE_UNITS, PART_CATEGORIES } from '@shared/constants/enums';
import type { CsvImportResult } from '@shared/schemas/csvImport';

type PartDraft = {
  uid: string;
  name: string;
  category: string;
  baseUnit: string;
  lowStockThreshold: string;
  densityGPerMl: string;
};

let nextUid = 1;
function makeUid(): string {
  return `p-${nextUid++}`;
}

function emptyDraft(): PartDraft {
  return {
    uid: makeUid(),
    name: '',
    category: '',
    baseUnit: '',
    lowStockThreshold: '',
    densityGPerMl: '',
  };
}

function parseUploadedCsv(text: string): PartDraft[] {
  const table = parseCsvTable(text);
  return table.rows.map((row) => ({
    uid: makeUid(),
    name: row.values.name?.trim() ?? '',
    category: row.values.category?.trim() ?? '',
    baseUnit: row.values.base_unit?.trim() ?? '',
    lowStockThreshold: row.values.low_stock_threshold?.trim() ?? '',
    densityGPerMl: row.values.density_g_per_ml?.trim() ?? '',
  }));
}

function draftsToCsv(rows: PartDraft[]): string {
  const out: (string | number)[][] = [
    ['name', 'category', 'base_unit', 'low_stock_threshold', 'density_g_per_ml'],
  ];
  for (const r of rows) {
    out.push([r.name, r.category, r.baseUnit, r.lowStockThreshold, r.densityGPerMl]);
  }
  return toCsv(out);
}

export function PartsEditableImport() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<PartDraft[]>([]);
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const runImport = useCsvImport();
  const template = useCsvTemplate();

  async function downloadTemplate() {
    setServerError(null);
    try {
      const tpl = await template.mutateAsync({ kind: 'parts' });
      const blob = new Blob([tpl.content], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = tpl.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not fetch template');
    }
  }

  async function handleFile(file: File) {
    setServerError(null);
    setResult(null);
    const text = await file.text();
    setRows(parseUploadedCsv(text));
  }

  function patchRow(uid: string, patch: Partial<PartDraft>) {
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
    setResult(null);
  }

  function deleteRow(uid: string) {
    setRows((prev) => prev.filter((r) => r.uid !== uid));
    setResult(null);
  }

  function addRow() {
    setRows((prev) => [...prev, emptyDraft()]);
    setResult(null);
  }

  function reset() {
    setRows([]);
    setResult(null);
    setServerError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleRun(dryRun: boolean) {
    if (rows.length === 0) return;
    setServerError(null);
    try {
      const csv = draftsToCsv(rows);
      const r = await runImport.mutateAsync({ kind: 'parts', content: csv, dryRun });
      setResult(r);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Import failed');
    }
  }

  // Server line numbers: 1 is the header, so data row N → row index N-2.
  const issuesByRowIndex = new Map<number, string[]>();
  if (result) {
    for (const issue of result.issues) {
      const idx = issue.lineNumber - 2;
      if (idx < 0) continue;
      const bucket = issuesByRowIndex.get(idx) ?? [];
      bucket.push(`${issue.field ?? '—'}: ${issue.message}`);
      issuesByRowIndex.set(idx, bucket);
    }
  }
  const headerIssues = result
    ? result.issues.filter((i) => i.lineNumber <= 1).map((i) => i.message)
    : [];

  const committed = result?.committed ?? false;

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-lg border border-border-tertiary bg-background-primary p-4">
        <h2 className="text-[13px] font-medium text-text-primary">Parts</h2>
        <p className="mt-1 max-w-prose text-[11px] text-text-tertiary">
          Upload a CSV (or start blank and add rows manually). Each row becomes editable
          before commit. New parts are created as type=raw with zero stock; existing names
          update other fields. Base unit cannot change once a part has stock movements.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
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
            onClick={downloadTemplate}
            disabled={template.isPending}
          >
            <Download className="h-3 w-3" />
            Download template
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => fileInputRef.current?.click()}
            disabled={committed}
          >
            <Upload className="h-3 w-3" />
            Choose CSV
          </Button>
          <Button type="button" variant="secondary" size="md" onClick={addRow} disabled={committed}>
            <Plus className="h-3 w-3" />
            Add row
          </Button>
          {rows.length > 0 ? (
            <Button type="button" variant="ghost" size="md" onClick={reset}>
              Reset
            </Button>
          ) : null}
          {rows.length > 0 ? (
            <span className="ml-auto text-[11px] text-text-tertiary">
              {rows.length} row{rows.length === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
      </section>

      {rows.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-lg border border-border-tertiary bg-background-primary p-4">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {result ? (
                committed ? (
                  <Badge variant="success">COMMITTED</Badge>
                ) : result.issues.length === 0 ? (
                  <Badge variant="info">DRY RUN OK</Badge>
                ) : (
                  <Badge variant="danger">{result.issues.length} ERROR(S)</Badge>
                )
              ) : (
                <Badge variant="info">Unvalidated</Badge>
              )}
              {result ? (
                <span className="text-[11px] text-text-tertiary">
                  {result.summary.totalRows} rows · {result.summary.toCreate} new ·{' '}
                  {result.summary.toUpdate} update · {result.summary.skipped} skipped
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => handleRun(true)}
                disabled={runImport.isPending || committed}
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
                  committed ||
                  !result ||
                  result.issues.length > 0 ||
                  !result.dryRun
                }
                title={
                  result === null
                    ? 'Run a dry-run first'
                    : result.issues.length > 0
                      ? 'Fix the errors before committing'
                      : committed
                        ? 'Already committed — reset to import again'
                        : undefined
                }
              >
                Commit import
              </Button>
            </div>
          </header>

          {serverError ? (
            <div className="rounded-md bg-background-danger px-2.5 py-1.5 text-[12px] text-text-danger">
              {serverError}
            </div>
          ) : null}
          {headerIssues.length > 0 ? (
            <div className="rounded-md bg-background-danger px-2.5 py-1.5 text-[12px] text-text-danger">
              {headerIssues.map((m, i) => (
                <div key={i}>{m}</div>
              ))}
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-lg border border-border-tertiary">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Name</TableHead>
                  <TableHead className="w-[140px]">Category</TableHead>
                  <TableHead className="w-[110px]">Base unit</TableHead>
                  <TableHead className="w-[140px]">Low-stock threshold</TableHead>
                  <TableHead className="w-[140px]">Density (g/ml)</TableHead>
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => {
                  const issues = issuesByRowIndex.get(idx) ?? [];
                  const hasIssues = issues.length > 0;
                  return (
                    <TableRow
                      key={row.uid}
                      className={hasIssues ? 'bg-background-danger/40' : undefined}
                    >
                      <TableCell>
                        <Input
                          value={row.name}
                          onChange={(e) => patchRow(row.uid, { name: e.target.value })}
                          placeholder="Engine oil"
                          disabled={committed}
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={row.category}
                          onValueChange={(v) => patchRow(row.uid, { category: v })}
                          disabled={committed}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={row.category || 'Pick…'} />
                          </SelectTrigger>
                          <SelectContent>
                            {PART_CATEGORIES.map((c) => (
                              <SelectItem key={c} value={c}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={row.baseUnit}
                          onValueChange={(v) => patchRow(row.uid, { baseUnit: v })}
                          disabled={committed}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={row.baseUnit || 'Pick…'} />
                          </SelectTrigger>
                          <SelectContent>
                            {BASE_UNITS.map((u) => (
                              <SelectItem key={u} value={u}>
                                {u}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          value={row.lowStockThreshold}
                          onChange={(e) =>
                            patchRow(row.uid, { lowStockThreshold: e.target.value })
                          }
                          placeholder="0"
                          disabled={committed}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          value={row.densityGPerMl}
                          onChange={(e) =>
                            patchRow(row.uid, { densityGPerMl: e.target.value })
                          }
                          placeholder="(blank for non-liquids)"
                          disabled={committed}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="md"
                          onClick={() => deleteRow(row.uid)}
                          disabled={committed}
                          className="text-text-danger"
                          title="Remove row"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {result && result.issues.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-border-tertiary">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Row</TableHead>
                    <TableHead className="w-[160px]">Field</TableHead>
                    <TableHead>Issue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.issues.map((issue, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-text-secondary">
                        {issue.lineNumber > 1 ? issue.lineNumber - 1 : 'header'}
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
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
