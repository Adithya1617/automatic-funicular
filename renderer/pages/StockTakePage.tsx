import { useMemo, useState } from 'react';
import { AlertTriangle, ClipboardCheck, History } from 'lucide-react';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@renderer/components/ui/table';
import { useIngredients } from '@renderer/hooks/ipc/useIngredients';
import {
  useCommitStockTake,
  useDiscardStockTake,
  useSaveStockTakeCount,
  useStartStockTake,
  useStockTake,
  useStockTakeInProgress,
  useStockTakes,
} from '@renderer/hooks/ipc/useStockTakes';
import { formatDateTime, formatStock } from '@renderer/lib/format';
import type { StockTakeLine } from '@shared/schemas/stockTake';
import type { Ingredient } from '@shared/schemas/ingredient';

export function StockTakePage() {
  const inProgress = useStockTakeInProgress();
  const past = useStockTakes({ limit: 50 });
  const [reviewMode, setReviewMode] = useState(false);

  if (inProgress.isLoading) {
    return (
      <div className="rounded-lg border border-border-tertiary bg-background-primary px-4 py-6 text-text-tertiary">
        Loading…
      </div>
    );
  }

  if (inProgress.data) {
    return reviewMode ? (
      <ReviewScreen
        takeId={inProgress.data.id}
        onBack={() => setReviewMode(false)}
        onDone={() => setReviewMode(false)}
      />
    ) : (
      <CountScreen takeId={inProgress.data.id} onReview={() => setReviewMode(true)} />
    );
  }

  return <StartScreen recentTakes={past.data ?? []} />;
}

function StartScreen({
  recentTakes,
}: {
  recentTakes: ReturnType<typeof useStockTakes>['data'] extends infer T ? NonNullable<T> : never;
}) {
  const start = useStartStockTake();
  const [notes, setNotes] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);

  async function handleStart() {
    setServerError(null);
    try {
      await start.mutateAsync({ notes: notes.trim() || null });
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not start stock take');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border border-border-tertiary bg-background-primary p-4">
        <h1 className="text-[14px] font-medium text-text-primary">Start a stock take</h1>
        <p className="mt-1 max-w-prose text-[12px] text-text-secondary">
          Snapshots current stock for every active ingredient. The order poller
          pauses until you commit or discard. Operator counts override book
          quantities at commit time.
        </p>
        <div className="mt-3 flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-[11px] text-text-tertiary">Notes (optional)</label>
            <Input
              placeholder="e.g. Monthly count, end of April"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={handleStart}
            disabled={start.isPending}
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
            Start stock take
          </Button>
        </div>
        {serverError ? (
          <div className="mt-2 rounded-md bg-background-danger px-2.5 py-1.5 text-[12px] text-text-danger">
            {serverError}
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-border-tertiary bg-background-primary p-4">
        <div className="mb-2 flex items-center gap-2">
          <History className="h-3.5 w-3.5 text-text-tertiary" />
          <h2 className="text-[13px] font-medium text-text-primary">Past takes</h2>
        </div>
        {recentTakes.length === 0 ? (
          <div className="text-[12px] text-text-tertiary">No stock takes yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentTakes.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{formatDateTime(t.startedAt)}</TableCell>
                  <TableCell>{t.completedAt ? formatDateTime(t.completedAt) : '—'}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        t.status === 'committed'
                          ? 'success'
                          : t.status === 'discarded'
                            ? 'neutral'
                            : 'warning'
                      }
                    >
                      {t.status.toUpperCase().replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-text-secondary">{t.notes || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

function CountScreen({ takeId, onReview }: { takeId: string; onReview: () => void }) {
  const { data: take } = useStockTake(takeId);
  const { data: ingredients = [] } = useIngredients({ includeInactive: false });
  const ingredientsById = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const save = useSaveStockTakeCount();
  const discard = useDiscardStockTake();

  if (!take) {
    return (
      <div className="rounded-lg border border-border-tertiary bg-background-primary px-4 py-6 text-text-tertiary">
        Loading take…
      </div>
    );
  }

  const counted = take.lines.filter((l) => l.countedQuantity !== null).length;
  const total = take.lines.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border-tertiary bg-background-warning px-3 py-2 text-[12px] text-text-warning">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>
            Stock take in progress. Order polling is paused until you commit or
            discard. Started {formatDateTime(take.startedAt)}.
          </span>
        </div>
        <span className="font-medium">
          {counted}/{total} counted
        </span>
      </div>

      <section className="rounded-lg border border-border-tertiary bg-background-primary p-4">
        <h2 className="mb-2 text-[13px] font-medium text-text-primary">Count</h2>
        <div className="overflow-hidden rounded-lg border border-border-tertiary">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[36%]">Ingredient</TableHead>
                <TableHead>Book qty</TableHead>
                <TableHead>Counted qty</TableHead>
                <TableHead>Difference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {take.lines.map((line) => {
                const ing = ingredientsById.get(line.ingredientId);
                return (
                  <CountRow
                    key={line.id}
                    line={line}
                    ingredient={ing}
                    onSave={(value) =>
                      save.mutate({ lineId: line.id, countedQuantity: value })
                    }
                  />
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="md"
          onClick={() => {
            if (confirm('Discard this stock take? Counts will be lost; stock is unchanged.')) {
              discard.mutate({ id: takeId });
            }
          }}
          disabled={discard.isPending}
        >
          Discard
        </Button>
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={onReview}
          disabled={counted === 0}
          title={counted === 0 ? 'Count at least one ingredient first' : undefined}
        >
          Review &amp; commit
        </Button>
      </div>
    </div>
  );
}

function CountRow({
  line,
  ingredient,
  onSave,
}: {
  line: StockTakeLine;
  ingredient: Ingredient | undefined;
  onSave: (value: number | null) => void;
}) {
  const [value, setValue] = useState<string>(
    line.countedQuantity === null ? '' : String(line.countedQuantity),
  );
  const baseUnit = ingredient?.baseUnit ?? 'each';
  const parsed = value.trim() === '' ? null : Number.parseFloat(value);
  const valid = parsed === null || (Number.isFinite(parsed) && parsed >= 0);
  const diff = parsed !== null && valid ? parsed - line.bookQuantity : null;

  function commit() {
    if (!valid) return;
    if (parsed === line.countedQuantity) return;
    onSave(parsed);
  }

  return (
    <TableRow>
      <TableCell className="font-medium text-text-primary">
        {ingredient?.name ?? '(unknown)'}
        <span className="ml-2 text-[10px] text-text-tertiary">{ingredient?.category}</span>
      </TableCell>
      <TableCell className="text-text-secondary">
        {formatStock(line.bookQuantity, baseUnit)}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className={`w-[120px] ${!valid ? 'ring-1 ring-text-danger' : ''}`}
          />
          <span className="text-[11px] text-text-tertiary">{baseUnit}</span>
        </div>
      </TableCell>
      <TableCell>
        {diff === null ? (
          <span className="text-text-tertiary">—</span>
        ) : diff === 0 ? (
          <span className="text-text-tertiary">0</span>
        ) : (
          <span className={diff > 0 ? 'text-text-success' : 'text-text-danger'}>
            {diff > 0 ? '+' : ''}
            {formatStock(diff, baseUnit)}
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}

function ReviewScreen({
  takeId,
  onBack,
  onDone,
}: {
  takeId: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const { data: take } = useStockTake(takeId);
  const { data: ingredients = [] } = useIngredients({ includeInactive: false });
  const ingredientsById = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const commit = useCommitStockTake();
  const [notes, setNotes] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);

  if (!take) {
    return (
      <div className="rounded-lg border border-border-tertiary bg-background-primary px-4 py-6 text-text-tertiary">
        Loading…
      </div>
    );
  }

  const linesWithCounts = take.lines.filter((l) => l.countedQuantity !== null);
  const variances = linesWithCounts
    .map((l) => ({ line: l, diff: (l.countedQuantity ?? 0) - l.bookQuantity }))
    .filter((x) => x.diff !== 0);

  async function handleCommit() {
    setServerError(null);
    try {
      await commit.mutateAsync({ id: takeId, notes: notes.trim() || null });
      onDone();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not commit stock take');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[14px] font-medium text-text-primary">Review &amp; commit</h1>
        <Button type="button" variant="ghost" size="md" onClick={onBack}>
          Back to count
        </Button>
      </div>

      <section className="rounded-lg border border-border-tertiary bg-background-primary p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[13px] font-medium text-text-primary">
            Variances ({variances.length})
          </h2>
          <span className="text-[11px] text-text-tertiary">
            {linesWithCounts.length} of {take.lines.length} lines counted —
            uncounted lines are skipped.
          </span>
        </div>
        {variances.length === 0 ? (
          <div className="rounded-md bg-background-success px-2.5 py-1.5 text-[12px] text-text-success">
            No variances. Commit will close the take without writing any
            adjustments.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border-tertiary">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ingredient</TableHead>
                  <TableHead>Book</TableHead>
                  <TableHead>Counted</TableHead>
                  <TableHead>Adjustment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variances.map(({ line, diff }) => {
                  const ing = ingredientsById.get(line.ingredientId);
                  const baseUnit = ing?.baseUnit ?? 'each';
                  return (
                    <TableRow key={line.id}>
                      <TableCell className="font-medium text-text-primary">
                        {ing?.name ?? '(unknown)'}
                      </TableCell>
                      <TableCell className="text-text-secondary">
                        {formatStock(line.bookQuantity, baseUnit)}
                      </TableCell>
                      <TableCell className="text-text-secondary">
                        {formatStock(line.countedQuantity ?? 0, baseUnit)}
                      </TableCell>
                      <TableCell>
                        <span className={diff > 0 ? 'text-text-success' : 'text-text-danger'}>
                          {diff > 0 ? '+' : ''}
                          {formatStock(diff, baseUnit)}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border-tertiary bg-background-primary p-4">
        <label className="text-[11px] text-text-tertiary">Notes (optional)</label>
        <Input
          placeholder="What did you find?"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1"
        />
      </section>

      {serverError ? (
        <div className="rounded-md bg-background-danger px-2.5 py-1.5 text-[12px] text-text-danger">
          {serverError}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="md" onClick={onBack}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={handleCommit}
          disabled={commit.isPending}
        >
          Commit stock take
        </Button>
      </div>
    </div>
  );
}
