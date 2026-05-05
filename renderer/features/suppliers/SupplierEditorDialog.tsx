import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { Supplier } from '@shared/schemas/supplier';
import { Button } from '@renderer/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import { useCreateSupplier, useUpdateSupplier } from '@renderer/hooks/ipc/useSuppliers';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier | null;
  /** Pre-fill values for create mode. Ignored when `supplier` is non-null (edit). */
  initialName?: string;
  initialGstin?: string;
  /** Called after a new supplier is successfully created. Not called on updates. */
  onCreated?: (supplier: Supplier) => void;
};

type FormValues = {
  name: string;
  contactInfo: string;
  gstin: string;
  notes: string;
};

export function SupplierEditorDialog({ open, onOpenChange, supplier, initialName, initialGstin, onCreated }: Props) {
  const create = useCreateSupplier();
  const update = useUpdateSupplier();
  const [serverError, setServerError] = useState<string | null>(null);
  const isEdit = !!supplier;

  const { register, handleSubmit, reset, formState } = useForm<FormValues>({
    defaultValues: {
      name: supplier?.name ?? initialName ?? '',
      contactInfo: supplier?.contactInfo ?? '',
      gstin: supplier?.gstin ?? initialGstin ?? '',
      notes: supplier?.notes ?? '',
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: supplier?.name ?? initialName ?? '',
        contactInfo: supplier?.contactInfo ?? '',
        gstin: supplier?.gstin ?? initialGstin ?? '',
        notes: supplier?.notes ?? '',
      });
      setServerError(null);
    }
  }, [open, supplier, initialName, initialGstin, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      if (supplier) {
        await update.mutateAsync({
          id: supplier.id,
          name: values.name.trim(),
          contactInfo: values.contactInfo.trim() || null,
          gstin: values.gstin.trim() || null,
          notes: values.notes.trim() || null,
        });
      } else {
        const created = await create.mutateAsync({
          name: values.name.trim(),
          contactInfo: values.contactInfo.trim() || null,
          gstin: values.gstin.trim() || null,
          notes: values.notes.trim() || null,
        });
        if (onCreated) onCreated(created);
      }
      reset();
      onOpenChange(false);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not save supplier');
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit supplier' : 'New supplier'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-3">
          <div className="grid gap-1">
            <Label htmlFor="sup-name">Name</Label>
            <Input id="sup-name" autoFocus {...register('name', { required: true, maxLength: 120 })} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="sup-contact">Contact info</Label>
            <Input id="sup-contact" placeholder="Phone, email, address…" {...register('contactInfo', { maxLength: 500 })} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="sup-gstin">GSTIN</Label>
            <Input
              id="sup-gstin"
              placeholder="36AAACZ8867B1Z1"
              {...register('gstin', { maxLength: 15 })}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="sup-notes">Notes</Label>
            <Input id="sup-notes" {...register('notes', { maxLength: 2000 })} />
          </div>

          {serverError ? (
            <div className="rounded-md bg-background-danger px-2.5 py-1.5 text-[12px] text-text-danger">
              {serverError}
            </div>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="md">Cancel</Button>
            </DialogClose>
            <Button type="submit" variant="primary" size="md" disabled={formState.isSubmitting || create.isPending || update.isPending}>
              {isEdit ? 'Save changes' : 'Create supplier'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
