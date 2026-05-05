import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Ingredient } from '@shared/schemas/ingredient';
import { Button } from '@renderer/components/ui/button';
import { useProductionBatches } from '@renderer/hooks/ipc/useProductionBatches';
import { BatchesTable } from './BatchesTable';
import { MakeBatchDialog } from './MakeBatchDialog';

export function BatchesTab({ parent }: { parent: Ingredient }) {
  const [makeOpen, setMakeOpen] = useState(false);
  const { data: batches = [], isLoading } = useProductionBatches({
    preparedIngredientId: parent.id,
    limit: 50,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button type="button" variant="primary" size="md" onClick={() => setMakeOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Make batch
        </Button>
      </div>
      {isLoading ? (
        <div className="px-1 py-4 text-text-tertiary">Loading batches…</div>
      ) : (
        <BatchesTable batches={batches} baseUnit={parent.baseUnit} />
      )}
      <MakeBatchDialog parent={parent} open={makeOpen} onOpenChange={setMakeOpen} />
    </div>
  );
}
