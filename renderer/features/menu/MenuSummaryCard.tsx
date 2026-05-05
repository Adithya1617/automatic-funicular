import type { Ingredient } from '@shared/schemas/ingredient';
import type { MenuItemAvailability } from '@shared/schemas/availability';
import type { RecipeVersion } from '@shared/schemas/recipe';
import { formatINR } from '@shared/utils/currency';
import { computeFoodCostPercent, computeRecipeCost } from '@renderer/lib/recipeCost';

type DraftRow = {
  childIngredientId: string;
  quantity: number;
  unit: string;
};

type Props = {
  rows: DraftRow[];
  ingredients: Ingredient[];
  sellingPrice: number;
  activeVersion: RecipeVersion | null;
  /** Server-computed availability for the saved version. */
  savedAvailability: MenuItemAvailability | null;
};

export function MenuSummaryCard({
  rows,
  ingredients,
  sellingPrice,
  activeVersion,
  savedAvailability,
}: Props) {
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));
  const recipeCost = computeRecipeCost(rows, ingredients);
  const foodCostPct = computeFoodCostPercent(recipeCost, sellingPrice);
  const ingredientCount = rows.filter((r) => r.childIngredientId).length;

  let foodCostBarColor = 'bg-text-success';
  if (foodCostPct != null && foodCostPct >= 35) foodCostBarColor = 'bg-text-warning';
  if (foodCostPct != null && foodCostPct >= 50) foodCostBarColor = 'bg-text-danger';

  const bottleneck = savedAvailability?.bottleneckIngredientId
    ? ingredientById.get(savedAvailability.bottleneckIngredientId)
    : null;
  const servings = savedAvailability?.maxServingsAvailable ?? null;

  return (
    <aside className="flex flex-col gap-3 rounded-lg border border-border-tertiary bg-background-primary p-3">
      <Block label="Theoretical food cost">
        {foodCostPct != null ? (
          <>
            <div className="text-[20px] font-medium text-text-success">
              {foodCostPct.toFixed(1)}%
            </div>
            <div className="mt-1 h-[4px] w-full overflow-hidden rounded-full bg-background-tertiary">
              <div
                className={`h-full ${foodCostBarColor}`}
                style={{ width: `${Math.min(100, foodCostPct)}%` }}
              />
            </div>
            <div className="mt-1 text-[10px] text-text-tertiary">
              {formatINR(recipeCost)} of {formatINR(sellingPrice)}
            </div>
          </>
        ) : (
          <div className="text-[12px] text-text-tertiary">Set selling price to see food cost.</div>
        )}
      </Block>

      <Divider />

      <Block label="Recipe cost">
        <div className="text-[15px] font-medium text-text-primary">{formatINR(recipeCost)}</div>
        <div className="text-[10px] text-text-tertiary">
          {ingredientCount} {ingredientCount === 1 ? 'ingredient' : 'ingredients'}
        </div>
      </Block>

      <Divider />

      <Block label="Availability">
        {servings != null ? (
          <>
            <div
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                servings === 0
                  ? 'bg-background-danger text-text-danger'
                  : servings < 5
                    ? 'bg-background-warning text-text-warning'
                    : 'bg-background-success text-text-success'
              }`}
            >
              {servings === 0 ? 'Out of stock' : `${servings} servings`}
            </div>
            {bottleneck ? (
              <div className="mt-1 text-[10px] text-text-tertiary">
                Limited by {bottleneck.name}
              </div>
            ) : null}
          </>
        ) : (
          <div className="text-[11px] text-text-tertiary">
            Save the recipe to see availability.
          </div>
        )}
      </Block>

      <Divider />

      <Block label="Version">
        {activeVersion ? (
          <>
            <div className="text-[13px] font-medium text-text-primary">v{activeVersion.versionNumber}</div>
            <div className="text-[10px] text-text-tertiary">
              Active since {new Date(activeVersion.createdAt).toLocaleDateString('en-GB')}
            </div>
          </>
        ) : (
          <div className="text-[11px] text-text-tertiary">Editing v1 (draft) — no active version yet.</div>
        )}
      </Block>
    </aside>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-tertiary">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Divider() {
  return <div className="h-px w-full bg-border-tertiary" />;
}
