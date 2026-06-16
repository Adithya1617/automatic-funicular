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

function toIngredient(
  row: Awaited<ReturnType<typeof ingredientRepository.findById>>,
): Ingredient {
  if (!row) throw new Error('toIngredient called with empty row');
  return row as unknown as Ingredient;
}

export const IngredientService = {
  async list(
    db: AppDb,
    tenantId: number,
    filter: ListIngredientsInput,
  ): Promise<Ingredient[]> {
    const rows = await ingredientRepository.list(db, tenantId, filter);
    return rows.map((row) => row as unknown as Ingredient);
  },

  async get(db: AppDb, tenantId: number, id: string): Promise<Ingredient> {
    const row = await ingredientRepository.findById(db, tenantId, id);
    if (!row) throw new NotFoundError('Ingredient', id);
    return toIngredient(row);
  },

  async create(
    db: AppDb,
    tenantId: number,
    input: CreateIngredientInput,
    actorId: string = SYSTEM_USER_ID,
  ): Promise<Ingredient> {
    const existing = await ingredientRepository.findByName(db, tenantId, input.name);
    if (existing) {
      throw new ConflictError(`An ingredient named "${input.name}" already exists`, {
        name: 'duplicate',
      });
    }
    const now = Date.now();
    const row = await ingredientRepository.insert(db, {
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

  async update(
    db: AppDb,
    tenantId: number,
    input: UpdateIngredientInput,
    actorId: string = SYSTEM_USER_ID,
  ): Promise<Ingredient> {
    const existing = await ingredientRepository.findById(db, tenantId, input.id);
    if (!existing) throw new NotFoundError('Ingredient', input.id);

    if (input.name && input.name !== existing.name) {
      const dup = await ingredientRepository.findByName(db, tenantId, input.name);
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

    const row = await ingredientRepository.update(db, tenantId, input.id, patch);
    if (!row) throw new NotFoundError('Ingredient', input.id);
    return toIngredient(row);
  },

  /**
   * Deactivation is the v1 substitute for delete. We refuse to deactivate
   * an ingredient that has movements only as a sanity check — actually
   * we permit deactivation always, but we forbid actual deletion here
   * because the spec calls it out.
   */
  async deactivate(
    db: AppDb,
    tenantId: number,
    id: string,
    actorId: string = SYSTEM_USER_ID,
  ): Promise<Ingredient> {
    const existing = await ingredientRepository.findById(db, tenantId, id);
    if (!existing) throw new NotFoundError('Ingredient', id);
    const row = await ingredientRepository.update(db, tenantId, id, {
      isActive: false,
      updatedAt: Date.now(),
      updatedBy: actorId,
    });
    if (!row) throw new NotFoundError('Ingredient', id);
    return toIngredient(row);
  },

  async hasMovements(db: AppDb, tenantId: number, id: string): Promise<boolean> {
    const rows = await stockMovementRepository.list(db, tenantId, {
      ingredientId: id,
      limit: 1,
    });
    return rows.length > 0;
  },
};
