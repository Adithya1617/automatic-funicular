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
import { useMenuItems } from '@renderer/hooks/ipc/useMenuItems';
import { useAvailability } from '@renderer/hooks/ipc/useAvailability';
import { MenuItemsTable } from '@renderer/features/menu/MenuItemsTable';

export function MenuPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');

  const filter = useMemo(() => {
    const f: Parameters<typeof useMenuItems>[0] = { includeInactive: false };
    if (search.trim()) f.search = search.trim();
    if (category !== 'all') f.category = category;
    return f;
  }, [search, category]);

  const { data: items = [], isLoading } = useMenuItems(filter);
  const { data: availabilityList = [] } = useAvailability();
  const availability = useMemo(
    () => new Map(availabilityList.map((a) => [a.menuItemId, a])),
    [availabilityList],
  );

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const item of items) seen.add(item.category);
    return [...seen].sort();
  }, [items]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          <Input
            placeholder="Search dishes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-[320px]"
          />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={() => navigate('/menu/new')}
        >
          <Plus className="h-3.5 w-3.5" /> New menu item
        </Button>
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-border-tertiary bg-background-primary px-4 py-6 text-text-tertiary">
          Loading menu…
        </div>
      ) : (
        <MenuItemsTable
          rows={items}
          availability={availability}
          onSelect={(id) => navigate(`/menu/${id}/edit`)}
        />
      )}
    </div>
  );
}
