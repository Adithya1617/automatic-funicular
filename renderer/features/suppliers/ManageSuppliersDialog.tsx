import { useState } from 'react';
import { Pencil, Plus, Power } from 'lucide-react';
import type { Supplier } from '@shared/schemas/supplier';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table';
import {
  useDeactivateSupplier,
  useSuppliers,
} from '@renderer/hooks/ipc/useSuppliers';
import { SupplierEditorDialog } from './SupplierEditorDialog';

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

export function ManageSuppliersDialog({ open, onOpenChange }: Props) {
  const { data: suppliers = [], isLoading } = useSuppliers({ includeInactive: true });
  const deactivate = useDeactivateSupplier();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Manage suppliers</DialogTitle>
            <DialogDescription>
              Suppliers are referenced by invoices in slice 6. Deactivated suppliers stay in history but aren't shown in pickers.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" /> New supplier
            </Button>
          </div>

          <div className="overflow-hidden rounded-lg border border-border-tertiary">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[120px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-text-tertiary">Loading…</TableCell>
                  </TableRow>
                ) : suppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-text-tertiary">
                      No suppliers yet — create one to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  suppliers.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-text-secondary">{s.contactInfo ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={s.isActive ? 'success' : 'neutral'}>
                          {s.isActive ? 'active' : 'inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditing(s);
                              setEditorOpen(true);
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          {s.isActive ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              title="Deactivate"
                              onClick={() => deactivate.mutate(s.id)}
                              disabled={deactivate.isPending}
                            >
                              <Power className="h-3 w-3" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <SupplierEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        supplier={editing}
      />
    </>
  );
}
