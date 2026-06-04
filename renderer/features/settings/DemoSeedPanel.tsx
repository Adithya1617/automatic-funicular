import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bike, RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import { unwrap } from '@renderer/lib/ipc';
import type {
  DemoResetResult,
  DemoSeedBikesResult,
  DemoSeedResult,
} from '@shared/schemas/demo';

export function DemoSeedPanel() {
  const qc = useQueryClient();
  const [seedResult, setSeedResult] = useState<DemoSeedResult | null>(null);
  const [bikesResult, setBikesResult] = useState<DemoSeedBikesResult | null>(null);
  const [resetResult, setResetResult] = useState<DemoResetResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const seed = useMutation({
    mutationFn: () => unwrap(window.hyprride.demo.seed({})),
    onSuccess: (data: DemoSeedResult) => {
      setSeedResult(data);
      setBikesResult(null);
      setResetResult(null);
      setError(null);
      qc.invalidateQueries();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Demo seed failed');
    },
  });

  const seedBikes = useMutation({
    mutationFn: () => unwrap(window.hyprride.demo.seedBikes({})),
    onSuccess: (data: DemoSeedBikesResult) => {
      setBikesResult(data);
      setSeedResult(null);
      setResetResult(null);
      setError(null);
      qc.invalidateQueries();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Loading fleet failed');
    },
  });

  const reset = useMutation({
    mutationFn: () => unwrap(window.hyprride.demo.reset({})),
    onSuccess: (data: DemoResetResult) => {
      setResetResult(data);
      setSeedResult(null);
      setBikesResult(null);
      setError(null);
      setConfirmingReset(false);
      qc.invalidateQueries();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Demo reset failed');
    },
  });

  return (
    <section className="rounded-lg border border-border-tertiary bg-background-primary p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-medium text-text-primary">Demo data</h2>
          <p className="mt-1 max-w-prose text-[11px] text-text-tertiary">
            Re-runnable seed for prototyping/demo. Click <span className="font-medium">Load
            demo data</span> anytime — suppliers and bikes only fill in what&apos;s
            missing, historic purchases run once, service events back-fill up to 30
            across the last 60 days, and every part is topped up to a guaranteed
            non-zero floor (Brake pad 60 · Brake shoe 40 · Cables 40 · Engine oil
            20 L · Gear oil 8 L · Air filter 25 · Mobile holder 15).
          </p>
          <p className="mt-2 max-w-prose text-[11px] text-text-tertiary">
            <span className="font-medium text-text-secondary">Load fleet</span> adds
            only the 34 fleet bikes (idempotent by bike number) — no suppliers,
            purchases, or service events — so you can populate the Bikes section
            without losing a clean slate.
          </p>
          <p className="mt-2 max-w-prose text-[11px] text-text-tertiary">
            <span className="font-medium text-text-secondary">Reset</span> wipes
            every supplier, bike, invoice, service template, recipe, stock movement,
            service event, and stock take in the current tenant, then zeroes out
            the seeded parts so the next <span className="font-medium">Load demo
            data</span> rebuilds from scratch. Bike types and the parts catalog stay.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2">
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => seed.mutate()}
            disabled={seed.isPending || seedBikes.isPending || reset.isPending}
          >
            <Sparkles className="h-3 w-3" />
            {seed.isPending ? 'Seeding…' : 'Load demo data'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => seedBikes.mutate()}
            disabled={seed.isPending || seedBikes.isPending || reset.isPending}
          >
            <Bike className="h-3 w-3" />
            {seedBikes.isPending ? 'Loading…' : 'Load fleet (34 bikes)'}
          </Button>
          {confirmingReset ? (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={() => setConfirmingReset(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => reset.mutate()}
                disabled={reset.isPending}
                className="bg-text-danger hover:bg-text-danger/80"
              >
                {reset.isPending ? 'Resetting…' : 'Confirm reset'}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => setConfirmingReset(true)}
              disabled={seed.isPending || seedBikes.isPending || reset.isPending}
              className="text-text-danger"
            >
              <RotateCcw className="h-3 w-3" />
              Reset demo data
            </Button>
          )}
        </div>
      </header>

      {error ? (
        <div className="mt-3 rounded-md bg-background-danger px-2.5 py-1.5 text-[12px] text-text-danger">
          {error}
        </div>
      ) : null}

      {seedResult ? (
        <div className="mt-3 rounded-md border border-border-tertiary bg-background-secondary px-3 py-2 text-[11px] text-text-secondary">
          {seedResult.alreadyPopulated ? (
            <span>Everything was already at target — nothing to add.</span>
          ) : (
            <span>
              Added: {seedResult.suppliersCreated} supplier(s) ·{' '}
              {seedResult.bikesCreated} bike(s) · {seedResult.purchasesAdded} historic
              purchase(s) · {seedResult.topUpsAdded} stock top-up(s) ·{' '}
              {seedResult.serviceEventsAdded} completed service event(s).
            </span>
          )}
        </div>
      ) : null}

      {bikesResult ? (
        <div className="mt-3 rounded-md border border-border-tertiary bg-background-secondary px-3 py-2 text-[11px] text-text-secondary">
          {bikesResult.bikesCreated === 0 ? (
            <span>All 34 fleet bikes are already present — nothing to add.</span>
          ) : (
            <span>
              Added {bikesResult.bikesCreated} bike(s) to the fleet.
              {bikesResult.skippedNoType > 0
                ? ` Skipped ${bikesResult.skippedNoType} (no matching bike type).`
                : ''}
            </span>
          )}
        </div>
      ) : null}

      {resetResult ? (
        <div className="mt-3 rounded-md border border-border-tertiary bg-background-secondary px-3 py-2 text-[11px] text-text-secondary">
          Cleared {resetResult.tablesCleared} table(s). Click{' '}
          <span className="font-medium">Load demo data</span> to repopulate.
        </div>
      ) : null}
    </section>
  );
}
