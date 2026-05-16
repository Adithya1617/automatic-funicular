import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { useBikes } from '@renderer/hooks/ipc/useBikes';
import { useServiceTemplates } from '@renderer/hooks/ipc/useServiceTemplates';
import { useCreateServiceEvent } from '@renderer/hooks/ipc/useServiceEvents';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NewServiceEventDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { data: bikes = [] } = useBikes({ includeInactive: false });
  const { data: allTemplates = [] } = useServiceTemplates({ includeInactive: false });
  const create = useCreateServiceEvent();

  const [bikeId, setBikeId] = useState<string>('');
  const [templateId, setTemplateId] = useState<string>('');
  const [odometer, setOdometer] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [serverError, setServerError] = useState<string | null>(null);

  const selectedBike = useMemo(
    () => bikes.find((b) => b.id === bikeId) ?? null,
    [bikes, bikeId],
  );

  // Filter templates to those matching the selected bike's type — picking a
  // mismatched template would just throw on submit, so hide them.
  const availableTemplates = useMemo(
    () =>
      selectedBike
        ? allTemplates.filter((t) => t.bikeTypeId === selectedBike.bikeTypeId)
        : [],
    [allTemplates, selectedBike],
  );

  useEffect(() => {
    if (open) {
      setBikeId('');
      setTemplateId('');
      setOdometer('');
      setNotes('');
      setServerError(null);
    }
  }, [open]);

  // Reset template selection whenever bike changes, since the valid set changes.
  useEffect(() => {
    setTemplateId('');
  }, [bikeId]);

  async function onSubmit() {
    setServerError(null);
    try {
      if (!bikeId) {
        setServerError('Pick a bike');
        return;
      }
      if (!templateId) {
        setServerError('Pick a service template');
        return;
      }
      const odo = odometer.trim() === '' ? null : Number(odometer);
      const odoFinal = odo != null && Number.isFinite(odo) && odo >= 0 ? odo : null;
      const trimmedNotes = notes.trim();
      const created = await create.mutateAsync({
        bikeId,
        serviceTemplateId: templateId,
        odometerKm: odoFinal,
        notes: trimmedNotes === '' ? null : trimmedNotes,
      });
      onOpenChange(false);
      navigate(`/services/${created.id}/edit`);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not start service');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a service</DialogTitle>
          <DialogDescription>
            The active recipe for the chosen template will be captured. You can edit
            the parts list before completing.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label>Bike</Label>
            <Select value={bikeId} onValueChange={setBikeId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a bike…" />
              </SelectTrigger>
              <SelectContent>
                {bikes.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.bikeNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label>Service template</Label>
            <Select
              value={templateId}
              onValueChange={setTemplateId}
              disabled={!bikeId}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !bikeId
                      ? 'Pick a bike first…'
                      : availableTemplates.length === 0
                        ? 'No templates for this model'
                        : 'Pick a template…'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {availableTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label htmlFor="svc-odo">Odometer (km)</Label>
              <Input
                id="svc-odo"
                type="number"
                min={0}
                step="any"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
                placeholder="optional"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="svc-notes">Notes</Label>
              <Input
                id="svc-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="optional"
              />
            </div>
          </div>
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
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={onSubmit}
            disabled={create.isPending}
          >
            Start service
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
