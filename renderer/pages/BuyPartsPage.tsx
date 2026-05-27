import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { flexRender, getCoreRowModel, useReactTable, createColumnHelper } from '@tanstack/react-table';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table';
import { BASE_UNITS, type BaseUnit } from '@shared/constants/enums';
import { formatINR } from '@shared/utils/currency';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BuyPart = {
  id: string;
  partName: string;
  stock: number;
  price: number;
  units: BaseUnit;
};

type FormValues = {
  partName: string;
  stock: string;
  price: string;
  units: BaseUnit;
};

// ---------------------------------------------------------------------------
// Persistence (localStorage)
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'hyprride:buy-parts';

function loadEntries(): BuyPart[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BuyPart[]) : [];
  } catch {
    return [];
  }
}

function saveEntries(entries: BuyPart[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Table column helper
// ---------------------------------------------------------------------------

const columnHelper = createColumnHelper<BuyPart>();

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function BuyPartsPage() {
  const [entries, setEntries] = useState<BuyPart[]>(loadEntries);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BuyPart | null>(null);

  function persist(next: BuyPart[]) {
    setEntries(next);
    saveEntries(next);
  }

  function handleSave(values: FormValues) {
    const entry: BuyPart = {
      id: editing?.id ?? newId(),
      partName: values.partName.trim(),
      stock: Number(values.stock) || 0,
      price: Number(values.price) || 0,
      units: values.units,
    };
    if (editing) {
      persist(entries.map((e) => (e.id === editing.id ? entry : e)));
    } else {
      persist([...entries, entry]);
    }
    setDialogOpen(false);
    setEditing(null);
  }

  function handleEdit(row: BuyPart) {
    setEditing(row);
    setDialogOpen(true);
  }

  function handleDelete(id: string) {
    persist(entries.filter((e) => e.id !== id));
  }

  function handleNew() {
    setEditing(null);
    setDialogOpen(true);
  }

  const columns = [
    columnHelper.accessor('partName', {
      header: 'Part name',
      cell: (cell) => (
        <span className="font-medium text-text-primary">{cell.getValue()}</span>
      ),
    }),
    columnHelper.accessor('stock', {
      header: 'Stock',
      cell: (cell) => (
        <span className="tabular-nums text-text-primary">{cell.getValue()}</span>
      ),
    }),
    columnHelper.accessor('price', {
      header: 'Price',
      cell: (cell) => (
        <span className="tabular-nums text-text-primary">
          {cell.getValue() > 0 ? formatINR(cell.getValue()) : '—'}
        </span>
      ),
    }),
    columnHelper.accessor('units', {
      header: 'Units',
      cell: (cell) => (
        <span className="text-text-secondary">{cell.getValue()}</span>
      ),
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      cell: (cell) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleEdit(cell.row.original)}
            aria-label="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleDelete(cell.row.original.id)}
            aria-label="Delete"
            className="text-text-danger hover:text-text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    }),
  ];

  const table = useReactTable({
    data: entries,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-medium text-text-primary">Buy Parts</h2>
        <Button type="button" variant="primary" size="md" onClick={handleNew}>
          <Plus className="h-3.5 w-3.5" /> New buy part
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border-tertiary bg-background-primary">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-text-tertiary">
                  No entries yet — click <span className="font-medium">+ New buy part</span> to add one.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <BuyPartDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) setEditing(null);
        }}
        initial={editing ?? undefined}
        onSave={handleSave}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

type DialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: BuyPart;
  onSave: (values: FormValues) => void;
};

function BuyPartDialog({ open, onOpenChange, initial, onSave }: DialogProps) {
  const { register, handleSubmit, reset, watch, setValue, formState } = useForm<FormValues>({
    defaultValues: {
      partName: '',
      stock: '',
      price: '',
      units: 'each',
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        partName: initial?.partName ?? '',
        stock: initial != null ? String(initial.stock) : '',
        price: initial != null ? String(initial.price) : '',
        units: initial?.units ?? 'each',
      });
    }
  }, [open, initial, reset]);

  const units = watch('units');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit buy part' : 'New buy part'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSave)} className="grid gap-3">
          <div className="grid gap-1">
            <Label htmlFor="bp-name">Part name</Label>
            <Input
              id="bp-name"
              autoFocus
              placeholder="e.g. Castrol 10W30 1L"
              {...register('partName', { required: true, maxLength: 120 })}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label htmlFor="bp-stock">Stock (qty)</Label>
              <Input
                id="bp-stock"
                type="number"
                min={0}
                step="any"
                placeholder="0"
                {...register('stock', { required: true, min: 0 })}
              />
            </div>
            <div className="grid gap-1">
              <Label>Units</Label>
              <Select value={units} onValueChange={(v) => setValue('units', v as BaseUnit)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BASE_UNITS.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1">
            <Label htmlFor="bp-price">Price (₹)</Label>
            <Input
              id="bp-price"
              type="number"
              min={0}
              step="any"
              placeholder="0.00"
              {...register('price', { required: true, min: 0 })}
            />
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="md">Cancel</Button>
            </DialogClose>
            <Button type="submit" variant="primary" size="md" disabled={formState.isSubmitting}>
              {initial ? 'Save changes' : 'Add part'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
