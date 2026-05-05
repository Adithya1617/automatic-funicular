import type { AppDb } from '../db/client';
import { newId } from '../lib/ids';
import { ingredientRepository } from '../repositories/ingredientRepository';
import { stockMovementRepository } from '../repositories/stockMovementRepository';
import type {
  CreateIngredientInput,
  Ingredient,
  ListIngredientsInput,
  UpdateIngredientInput,
} from '@shared/schemas/ingredient';
import { ConflictError, NotFoundError } from '@shared/errors/DomainError';
import { SYSTEM_USER_ID } from '@shared/constants/system';

function toIngredient(row: ReturnType<typeof ingredientRepository.findById>): Ingredient {
  if (!row) throw new Error('toIngredient called with empty row');
  return row as unknown as Ingredient;
}

export const IngredientService = {
  list(db: AppDb, tenantId: number, filter: ListIngredientsInput): Ingredient[] {
    return ingredientRepository
      .list(db, tenantId, filter)
      .map((row) => row as unknown as Ingredient);
  },

  get(db: AppDb, tenantId: number, id: string): Ingredient {
    const row = ingredientRepository.findById(db, tenantId, id);
    if (!row) throw new NotFoundError('Ingredient', id);
    return toIngredient(row);
  },

  create(
    db: AppDb,
    tenantId: number,
    input: CreateIngredientInput,
    actorId: string = SYSTEM_USER_ID,
  ): Ingredient {
    const existing = ingredientRepository.findByName(db, tenantId, input.name);
    if (existing) {
      throw new ConflictError(`An ingredient named "${input.name}" already exists`, {
        name: 'duplicate',
      });
    }
    const now = Date.now();
    const row = ingredientRepository.insert(db, {
      id: newId(),
      tenantId,
      name: input.name,
      category: input.category,
      type: input.type,
      baseUnit: input.baseUnit,
      stockQuantity: 0,
      reservedQuantity: 0,
      lowStockThreshold: input.lowStockThreshold,
      currentAvgCostPerUnit: 0,
      densityGPerMl: input.densityGPerMl,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: actorId,
      updatedBy: actorId,
    });
    return toIngredient(row);
  },

  update(
    db: AppDb,
    tenantId: number,
    input: UpdateIngredientInput,
    actorId: string = SYSTEM_USER_ID,
  ): Ingredient {
    const existing = ingredientRepository.findById(db, tenantId, input.id);
    if (!existing) throw new NotFoundError('Ingredient', input.id);

    if (input.name && input.name !== existing.name) {
      const dup = ingredientRepository.findByName(db, tenantId, input.name);
      if (dup && dup.id !== existing.id) {
        throw new ConflictError(`An ingredient named "${input.name}" already exists`, {
          name: 'duplicate',
        });
      }
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now(), updatedBy: actorId };
    if (input.name !== undefined) patch['name'] = input.name;
    if (input.category !== undefined) patch['category'] = input.category;
    if (input.type !== undefined) patch['type'] = input.type;
    if (input.lowStockThreshold !== undefined)
      patch['lowStockThreshold'] = input.lowStockThreshold;
    if (input.densityGPerMl !== undefined) patch['densityGPerMl'] = input.densityGPerMl;
    if (input.isActive !== undefined) patch['isActive'] = input.isActive;

    const row = ingredientRepository.update(db, tenantId, input.id, patch);
    if (!row) throw new NotFoundError('Ingredient', input.id);
    return toIngredient(row);
  },

  /**
   * Deactivation is the v1 substitute for delete. We refuse to deactivate
   * an ingredient that has movements only as a sanity check — actually
   * we permit deactivation always, but we forbid actual deletion here
   * because the spec calls it out.
   */
  deactivate(
    db: AppDb,
    tenantId: number,
    id: string,
    actorId: string = SYSTEM_USER_ID,
  ): Ingredient {
    const existing = ingredientRepository.findById(db, tenantId, id);
    if (!existing) throw new NotFoundError('Ingredient', id);
    const row = ingredientRepository.update(db, tenantId, id, {
      isActive: false,
      updatedAt: Date.now(),
      updatedBy: actorId,
    });
    if (!row) throw new NotFoundError('Ingredient', id);
    return toIngredient(row);
  },

  hasMovements(db: AppDb, tenantId: number, id: string): boolean {
    return (
      stockMovementRepository.list(db, tenantId, { ingredientId: id, limit: 1 }).length > 0
    );
  },
};
