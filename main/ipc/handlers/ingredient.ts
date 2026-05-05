import { ipcMain } from 'electron';
import { getDb } from '../../db/client';
import { IngredientService } from '../../services/IngredientService';
import { DEFAULT_TENANT_ID } from '@shared/constants/system';
import { IPC } from '@shared/schemas/ipc';
import {
  createIngredientInputSchema,
  deactivateIngredientInputSchema,
  getIngredientInputSchema,
  listIngredientsInputSchema,
  updateIngredientInputSchema,
} from '@shared/schemas/ingredient';
import { makeHandler } from './wrap';

export function registerIngredientHandlers(): void {
  ipcMain.handle(
    IPC.ingredient.list,
    makeHandler(listIngredientsInputSchema, (input) =>
      IngredientService.list(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.ingredient.get,
    makeHandler(getIngredientInputSchema, (input) =>
      IngredientService.get(getDb().db, DEFAULT_TENANT_ID, input.id),
    ),
  );

  ipcMain.handle(
    IPC.ingredient.create,
    makeHandler(createIngredientInputSchema, (input) =>
      IngredientService.create(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.ingredient.update,
    makeHandler(updateIngredientInputSchema, (input) =>
      IngredientService.update(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.ingredient.deactivate,
    makeHandler(deactivateIngredientInputSchema, (input) =>
      IngredientService.deactivate(getDb().db, DEFAULT_TENANT_ID, input.id),
    ),
  );
}
