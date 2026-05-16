import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { useBikes, useBikeTypes } from '@renderer/hooks/ipc/useBikes';
import { BikesTable } from '@renderer/features/bikes/BikesTable';
import { BikeFormDialog } from '@renderer/features/bikes/BikeFormDialog';
import { formatBikeTypeLabel } from '@shared/utils/bikeType';

export function BikesPage() {
  const [search, setSearch] = useState('');
  const [bikeTypeId, setBikeTypeId] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const filter = useMemo(() => {
    const f: Parameters<typeof useBikes>[0] = { includeInactive: false };
    if (search.trim()) f.search = search.trim();
    if (bikeTypeId !== 'all') f.bikeTypeId = bikeTypeId;
    return f;
  }, [search, bikeTypeId]);

  const { data: bikes = [], isLoading } = useBikes(filter);
  const { data: bikeTypes = [] } = useBikeTypes();

  const editingBike = useMemo(
    () => bikes.find((b) => b.id === editingId) ?? null,
    [bikes, editingId],
  );

  function openNew() {
    setEditingId(null);
    setDialogOpen(true);
  }

  function openEdit(id: string) {
    setEditingId(id);
    setDialogOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          <Input
            placeholder="Search by bike number or plate…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-[320px]"
          />
          <Select value={bikeTypeId} onValueChange={setBikeTypeId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All models</SelectItem>
              {bikeTypes.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {formatBikeTypeLabel(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={openNew}
          disabled={bikeTypes.length === 0}
        >
          <Plus className="h-3.5 w-3.5" /> New bike
        </Button>
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-border-tertiary bg-background-primary px-4 py-6 text-text-tertiary">
          Loading bikes…
        </div>
      ) : (
        <BikesTable rows={bikes} bikeTypes={bikeTypes} onSelect={openEdit} />
      )}

      <BikeFormDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) setEditingId(null);
        }}
        bikeTypes={bikeTypes}
        bike={editingBike}
      />
    </div>
  );
}
