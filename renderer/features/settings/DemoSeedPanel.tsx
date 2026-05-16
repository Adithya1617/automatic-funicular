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
            One-click seed for prototyping/demo. Adds three suppliers, the 34-bike
            fleet, stock-up purchase movements for every seeded part, and ~30
            completed service events spread across the last 60 days so every
            dashboard tile lights up. Idempotent — skipped if the app already has
            three suppliers and ten service events.
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
            <span>
              Skipped — the app already has demo-level data. Reset the DB if you want
              a fresh seed.
            </span>
          ) : (
            <span>
              Added: {result.suppliersCreated} suppliers · {result.bikesCreated} bikes
              · {result.purchasesAdded} purchase movements · {result.serviceEventsAdded}{' '}
              completed service events.
            </span>
          )}
        </div>
      ) : null}
    </section>
  );
}
