import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { Bike, BikeType } from '@shared/schemas/bike';
import { Button } from '@renderer/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import {
  useCreateBike,
  useDeactivateBike,
  useUpdateBike,
} from '@renderer/hooks/ipc/useBikes';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bikeTypes: BikeType[];
  /** When provided, dialog edits this bike instead of creating one. */
  bike?: Bike | null;
};

type FormValues = {
  bikeNumber: string;
  bikeTypeId: string;
  licensePlate: string;
  odometerKm: string;
  notes: string;
};

function defaults(bike: Bike | null | undefined, fallbackTypeId: string): FormValues {
  return {
    bikeNumber: bike?.bikeNumber ?? '',
    bikeTypeId: bike?.bikeTypeId ?? fallbackTypeId,
    licensePlate: bike?.licensePlate ?? '',
    odometerKm: bike?.odometerKm != null ? String(bike.odometerKm) : '',
    notes: bike?.notes ?? '',
  };
}

export function BikeFormDialog({ open, onOpenChange, bikeTypes, bike }: Props) {
  const isEdit = Boolean(bike);
  const create = useCreateBike();
  const update = useUpdateBike();
  const deactivate = useDeactivateBike();
  const [serverError, setServerError] = useState<string | null>(null);

  const firstTypeId = bikeTypes[0]?.id ?? '';
  const { register, handleSubmit, reset, watch, setValue, formState } = useForm<FormValues>({
    defaultValues: defaults(bike, firstTypeId),
  });

  useEffect(() => {
    if (open) {
      reset(defaults(bike, firstTypeId));
      setServerError(null);
    }
  }, [open, bike?.id, firstTypeId, reset]);

  const bikeTypeId = watch('bikeTypeId');

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const odometerNum = values.odometerKm.trim() === '' ? null : Number(values.odometerKm);
      const odometer =
        odometerNum != null && Number.isFinite(odometerNum) && odometerNum >= 0
          ? odometerNum
          : null;
      const plate = values.licensePlate.trim() === '' ? null : values.licensePlate.trim();
      const notes = values.notes.trim() === '' ? null : values.notes.trim();

      if (isEdit && bike) {
        await update.mutateAsync({
          id: bike.id,
          bikeNumber: values.bikeNumber.trim(),
          bikeTypeId: values.bikeTypeId,
          licensePlate: plate,
          odometerKm: odometer,
          notes,
        });
      } else {
        await create.mutateAsync({
          bikeNumber: values.bikeNumber.trim(),
          bikeTypeId: values.bikeTypeId,
          licensePlate: plate,
          odometerKm: odometer,
          notes,
        });
      }
      reset();
      onOpenChange(false);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not save bike');
    }
  });

  async function onDeactivate() {
    if (!bike) return;
    setServerError(null);
    try {
      await deactivate.mutateAsync(bike.id);
      onOpenChange(false);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not deactivate bike');
    }
  }

  const submitting =
    formState.isSubmitting || create.isPending || update.isPending || deactivate.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit bike' : 'New bike'}</DialogTitle>
          <DialogDescription>
            Bike numbers must be unique. Model is required so service templates know which
            parts to consume.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label htmlFor="bike-number">Bike number</Label>
              <Input
                id="bike-number"
                {...register('bikeNumber', { required: true, maxLength: 40 })}
                autoFocus={!isEdit}
                placeholder="e.g. HYP-001"
              />
            </div>
            <div className="grid gap-1">
              <Label>Model</Label>
              <Select
                value={bikeTypeId}
                onValueChange={(v) => setValue('bikeTypeId', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {bikeTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label htmlFor="bike-plate">License plate</Label>
              <Input
                id="bike-plate"
                {...register('licensePlate', { maxLength: 40 })}
                placeholder="optional"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="bike-odo">Odometer (km)</Label>
              <Input
                id="bike-odo"
                type="number"
                min={0}
                step="any"
                {...register('odometerKm')}
                placeholder="optional"
              />
            </div>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="bike-notes">Notes</Label>
            <Input
              id="bike-notes"
              {...register('notes', { maxLength: 2000 })}
              placeholder="optional"
            />
          </div>

          {serverError ? (
            <div className="rounded-md bg-background-danger px-2.5 py-1.5 text-[12px] text-text-danger">
              {serverError}
            </div>
          ) : null}

          <DialogFooter>
            {isEdit && bike?.isActive ? (
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={onDeactivate}
                disabled={submitting}
                className="mr-auto text-text-danger"
              >
                Deactivate
              </Button>
            ) : null}
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="md">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="primary" size="md" disabled={submitting}>
              {isEdit ? 'Save bike' : 'Create bike'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
