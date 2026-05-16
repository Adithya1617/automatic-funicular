import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import { unwrap } from '@renderer/lib/ipc';
import type { DemoSeedResult } from '@shared/schemas/demo';

export function DemoSeedPanel() {
  const qc = useQueryClient();
  const [result, setResult] = useState<DemoSeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const seed = useMutation({
    mutationFn: () => unwrap(window.hyprride.demo.seed({})),
    onSuccess: (data: DemoSeedResult) => {
      setResult(data);
      setError(null);
      // Everything touched — refresh every IPC cache so the populated app shows
      // the new bikes, parts, services, dashboard tiles, etc., immediately.
      qc.invalidateQueries();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Demo seed failed');
    },
  });

  return (
    <section className="rounded-lg border border-border-tertiary bg-background-primary p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-medium text-text-primary">Demo data</h2>
          <p className="mt-1 max-w-prose text-[11px] text-text-tertiary">
            Re-runnable seed for prototyping/demo. Click anytime — suppliers and
            bikes only fill in what&apos;s missing, historic purchases run once
            (so weighted-avg cost is meaningful), service events back-fill up
            to 30 across the last 60 days, and every part is topped up to a
            guaranteed non-zero floor (Brake pad 60 · Brake shoe 40 · Cables 40
            · Engine oil 20 L · Gear oil 8 L · Air filter 25 · Mobile holder 15).
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={() => seed.mutate()}
          disabled={seed.isPending}
        >
          <Sparkles className="h-3 w-3" />
          {seed.isPending ? 'Seeding…' : 'Load demo data'}
        </Button>
      </header>

      {error ? (
        <div className="mt-3 rounded-md bg-background-danger px-2.5 py-1.5 text-[12px] text-text-danger">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="mt-3 rounded-md border border-border-tertiary bg-background-secondary px-3 py-2 text-[11px] text-text-secondary">
          {result.alreadyPopulated ? (
            <span>Everything was already at target — nothing to add.</span>
          ) : (
            <span>
              Added: {result.suppliersCreated} supplier(s) · {result.bikesCreated} bike(s)
              · {result.purchasesAdded} historic purchase(s) · {result.topUpsAdded}{' '}
              stock top-up(s) · {result.serviceEventsAdded} completed service event(s).
            </span>
          )}
        </div>
      ) : null}
    </section>
  );
}
