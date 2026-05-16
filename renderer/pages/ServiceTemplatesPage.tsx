import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@renderer/components/ui/table';
import { useBikeTypes } from '@renderer/hooks/ipc/useBikes';
import { useServiceTemplates } from '@renderer/hooks/ipc/useServiceTemplates';

export function ServiceTemplatesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [bikeTypeId, setBikeTypeId] = useState<string>('all');

  const filter = useMemo(() => {
    const f: Parameters<typeof useServiceTemplates>[0] = { includeInactive: false };
    if (search.trim()) f.search = search.trim();
    if (bikeTypeId !== 'all') f.bikeTypeId = bikeTypeId;
    return f;
  }, [search, bikeTypeId]);

  const { data: templates = [], isLoading } = useServiceTemplates(filter);
  const { data: bikeTypes = [] } = useBikeTypes();
  const typeNameById = useMemo(
    () => new Map(bikeTypes.map((t) => [t.id, t.name])),
    [bikeTypes],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          <Input
            placeholder="Search templates…"
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
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={() => navigate('/services/templates/new')}
          disabled={bikeTypes.length === 0}
        >
          <Plus className="h-3.5 w-3.5" /> New template
        </Button>
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-border-tertiary bg-background-primary px-4 py-6 text-text-tertiary">
          Loading templates…
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border-tertiary bg-background-primary">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Display order</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-text-tertiary">
                    No service templates yet — click <span className="font-medium">+ New template</span> to create one (e.g. "Standard service" for the 110cc Activa).
                  </TableCell>
                </TableRow>
              ) : (
                templates.map((t) => (
                  <TableRow
                    key={t.id}
                    onClick={() => navigate(`/services/templates/${t.id}/edit`)}
                    className="cursor-pointer"
                  >
                    <TableCell>
                      <span className="font-medium text-text-primary">{t.name}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-text-secondary">
                        {typeNameById.get(t.bikeTypeId) ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-text-secondary">
                      {t.displayOrder}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
