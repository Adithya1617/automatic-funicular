import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize } from 'node:path';
import type { FileStorage } from '@shared/adapters/FileStorage';

export class LocalDiskStorage implements FileStorage {
  constructor(private readonly root: string) {}

  private resolve(relativePath: string): string {
    if (isAbsolute(relativePath)) {
      throw new Error('LocalDiskStorage rejects absolute paths');
    }
    const normalized = normalize(relativePath);
    if (normalized.startsWith('..')) {
      throw new Error('LocalDiskStorage rejects paths that escape the root');
    }
    return join(this.root, normalized);
  }

  async write(relativePath: string, bytes: Uint8Array): Promise<void> {
    const fullPath = this.resolve(relativePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, bytes);
  }

  async read(relativePath: string): Promise<Uint8Array> {
    const buf = await readFile(this.resolve(relativePath));
    return new Uint8Array(buf);
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await stat(this.resolve(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  async delete(relativePath: string): Promise<void> {
    try {
      await unlink(this.resolve(relativePath));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}
