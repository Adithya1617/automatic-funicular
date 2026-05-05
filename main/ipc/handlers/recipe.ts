import { ipcMain } from 'electron';
import { getDb } from '../../db/client';
import { RecipeService } from '../../services/RecipeService';
import { DEFAULT_TENANT_ID } from '@shared/constants/system';
import { IPC } from '@shared/schemas/ipc';
import {
  getActiveRecipeInputSchema,
  listRecipeVersionsInputSchema,
  saveRecipeVersionInputSchema,
} from '@shared/schemas/recipe';
import { makeHandler } from './wrap';

export function registerRecipeHandlers(): void {
  ipcMain.handle(
    IPC.recipe.getActive,
    makeHandler(getActiveRecipeInputSchema, (input) =>
      RecipeService.getActive(getDb().db, DEFAULT_TENANT_ID, input.parentId, input.parentType),
    ),
  );

  ipcMain.handle(
    IPC.recipe.listVersions,
    makeHandler(listRecipeVersionsInputSchema, (input) =>
      RecipeService.listVersions(
        getDb().db,
        DEFAULT_TENANT_ID,
        input.parentId,
        input.parentType,
      ),
    ),
  );

  ipcMain.handle(
    IPC.recipe.saveVersion,
    makeHandler(saveRecipeVersionInputSchema, (input) =>
      RecipeService.saveVersion(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );
}
