import { Check } from 'lucide-react';
import type { Ingredient } from '@shared/schemas/ingredient';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs';
import { formatINR } from '@shared/utils/currency';
import { formatStock } from '@renderer/lib/format';
import { MovementLedgerTab } from './MovementLedgerTab';

export function IngredientDetailPanel({ ingredient }: { ingredient: Ingredient }) {
  const stockValue = ingredient.stockQuantity * ingredient.currentAvgCostPerUnit;

  return (
    <div className="rounded-lg border border-border-tertiary bg-background-primary p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-background-success text-text-success">
            <Check className="h-3 w-3" />
          </span>
          <h2 className="text-[14px] font-medium text-text-primary">
            {ingredient.name}
            <span className="ml-1.5 text-text-tertiary">· stock movements</span>
          </h2>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-text-secondary">
          <Stat label="Stock" value={formatStock(ingredient.stockQuantity, ingredient.baseUnit)} />
          <Stat
            label="Avg cost"
            value={ingredient.currentAvgCostPerUnit > 0
              ? `${formatINR(ingredient.currentAvgCostPerUnit)}/${ingredient.baseUnit}`
              : '—'}
          />
          <Stat label="Value" value={stockValue > 0 ? formatINR(stockValue) : '—'} />
        </div>
      </div>

      <Tabs defaultValue="movements">
        <TabsList>
          <TabsTrigger value="movements">Movements</TabsTrigger>
          <TabsTrigger value="suppliers" disabled>Suppliers</TabsTrigger>
          <TabsTrigger value="edit" disabled>Edit</TabsTrigger>
        </TabsList>
        <TabsContent value="movements">
          <MovementLedgerTab ingredient={ingredient} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-end">
      <span className="text-[10px] uppercase tracking-wider text-text-tertiary">{label}</span>
      <span className="font-medium text-text-primary">{value}</span>
    </div>
  );
}
