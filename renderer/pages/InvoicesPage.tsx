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
import { useInvoices } from '@renderer/hooks/ipc/useInvoices';
import { useSuppliers } from '@renderer/hooks/ipc/useSuppliers';
import { InvoicesTable } from '@renderer/features/invoices/InvoicesTable';

export function InvoicesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'draft' | 'committed'>('all');

  const filter = useMemo(() => {
    const f: Parameters<typeof useInvoices>[0] = { limit: 200 };
    if (search.trim()) f.search = search.trim();
    if (status !== 'all') f.status = status;
    return f;
  }, [search, status]);

  const { data: invoices = [], isLoading } = useInvoices(filter);
  const { data: suppliers = [] } = useSuppliers({ includeInactive: true });
  const suppliersById = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s])),
    [suppliers],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          <Input
            placeholder="Search invoice number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-[320px]"
          />
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="committed">Committed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={() => navigate('/invoices/new')}
        >
          <Plus className="h-3.5 w-3.5" /> New invoice
        </Button>
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-border-tertiary bg-background-primary px-4 py-6 text-text-tertiary">
          Loading invoices…
        </div>
      ) : (
        <InvoicesTable
          rows={invoices}
          suppliersById={suppliersById}
          onSelect={(id) => navigate(`/invoices/${id}/edit`)}
        />
      )}
    </div>
  );
}
