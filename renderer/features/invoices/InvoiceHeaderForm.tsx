import type { Supplier } from '@shared/schemas/supplier';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';

export type InvoiceHeaderValues = {
  supplierId: string;
  invoiceNumber: string;
  invoiceDateInput: string; // YYYY-MM-DD per <input type=date>
  notes: string;
};

type Props = {
  values: InvoiceHeaderValues;
  onChange: (next: InvoiceHeaderValues) => void;
  suppliers: Supplier[];
  disabled?: boolean;
};

export function InvoiceHeaderForm({ values, onChange, suppliers, disabled }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="grid gap-1">
        <Label>Supplier</Label>
        <Select
          value={values.supplierId || undefined}
          onValueChange={(v) => onChange({ ...values, supplierId: v })}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Pick supplier" />
          </SelectTrigger>
          <SelectContent>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="inv-num">Invoice number</Label>
        <Input
          id="inv-num"
          value={values.invoiceNumber}
          onChange={(e) => onChange({ ...values, invoiceNumber: e.target.value })}
          maxLength={120}
          disabled={disabled}
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="inv-date">Date</Label>
        <Input
          id="inv-date"
          type="date"
          value={values.invoiceDateInput}
          onChange={(e) => onChange({ ...values, invoiceDateInput: e.target.value })}
          disabled={disabled}
        />
      </div>
      <div className="col-span-3 grid gap-1">
        <Label htmlFor="inv-notes">Notes</Label>
        <Input
          id="inv-notes"
          value={values.notes}
          onChange={(e) => onChange({ ...values, notes: e.target.value })}
          maxLength={500}
          disabled={disabled}
          placeholder="optional"
        />
      </div>
    </div>
  );
}
