import {
  cp,
  mkdir,
  readdir,
  rm,
  stat,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * `YYYY-MM-DD_HH-MM-SS` folder name in local time. Used so backups are
 * sortable by name and human-readable. Spec §7.12 calls this format out.
 */
export function formatBackupFolderName(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return [
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    '_',
    `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`,
  ].join('');
}

export function directoryExists(path: string): boolean {
  return existsSync(path);
}

export async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function copyFileWithDir(src: string, dest: string): Promise<void> {
  await mkdir(dirname(dest), { recursive: true });
  await cp(src, dest, { force: true });
}

export async function copyDirectoryRecursive(src: string, dest: string): Promise<void> {
  // Node 16.7+ supports cp with recursive. We tolerate a missing source so
  // backups still succeed when, e.g., no PDFs have been attached yet.
  if (!existsSync(src)) return;
  await mkdir(dest, { recursive: true });
  await cp(src, dest, { recursive: true, force: true });
}

export async function listSubdirectories(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

export async function removeDirectory(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

export async function pathSizeBytes(path: string): Promise<number> {
  if (!existsSync(path)) return 0;
  const s = await stat(path);
  return s.size;
}

export { join };
