import { formatINR } from '@shared/utils/currency';

type Props = {
  itemCount: number;
  subtotal: number;
};

export function InvoiceTotalsCard({ itemCount, subtotal }: Props) {
  return (
    <div className="ml-auto w-[260px] rounded-md border border-border-tertiary bg-background-primary p-3">
      <div className="flex items-center justify-between text-[12px] text-text-secondary">
        <span>Subtotal</span>
        <span className="tabular-nums">{formatINR(subtotal)}</span>
      </div>
      <div className="text-[10px] text-text-tertiary">
        {itemCount} {itemCount === 1 ? 'item' : 'items'}
      </div>
      <div className="mt-1 text-[10px] text-text-tertiary">
        GST (tracked total only) — included
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-border-tertiary pt-2 text-[13px] font-medium">
        <span>Grand total</span>
        <span className="tabular-nums">{formatINR(subtotal)}</span>
      </div>
    </div>
  );
}
