import type { FileStorage } from '@shared/adapters/FileStorage';

let instance: FileStorage | undefined;

export const fileStorageRegistry = {
  set(storage: FileStorage): void {
    instance = storage;
  },
  get(): FileStorage {
    if (!instance) {
      throw new Error('FileStorage not initialised — call fileStorageRegistry.set() during bootstrap');
    }
    return instance;
  },
  __reset(): void {
    instance = undefined;
  },
};
