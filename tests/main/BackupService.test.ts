import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BackupService } from '../../main/services/BackupService';

let work: string;
let userData: string;
let backupRoot: string;

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'laurans-backup-'));
  userData = join(work, 'user');
  backupRoot = join(work, 'backups');
  await mkdir(userData, { recursive: true });
  await writeFile(join(userData, 'laurans.sqlite'), 'PRETEND-DB');
  await mkdir(join(userData, 'files', 'invoices'), { recursive: true });
  await writeFile(join(userData, 'files', 'invoices', 'a.pdf'), 'PDF-A');
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

describe('BackupService.runBackup', () => {
  it('copies the SQLite file and the files folder into a timestamped subfolder', async () => {
    const result = await BackupService.runBackup({
      userDataDir: userData,
      backupRoot,
      now: new Date('2026-05-05T03:00:00Z'),
      retainDailyCount: 30,
    });
    expect(existsSync(result.entry.folderPath)).toBe(true);
    expect(existsSync(join(result.entry.folderPath, 'laurans.sqlite'))).toBe(true);
    expect(
      existsSync(join(result.entry.folderPath, 'files', 'invoices', 'a.pdf')),
    ).toBe(true);
    expect(result.entry.folderName).toMatch(/^2026-05-05_/);
  });

  it('survives a missing files/ folder (no PDFs yet)', async () => {
    await rm(join(userData, 'files'), { recursive: true });
    const result = await BackupService.runBackup({
      userDataDir: userData,
      backupRoot,
      now: new Date('2026-05-05T03:00:00Z'),
      retainDailyCount: 30,
    });
    expect(existsSync(join(result.entry.folderPath, 'laurans.sqlite'))).toBe(true);
    expect(existsSync(join(result.entry.folderPath, 'files'))).toBe(false);
  });
});

describe('BackupService.listBackups', () => {
  it('returns folders sorted newest-first with parsed timestamps', async () => {
    await mkdir(join(backupRoot, '2026-05-01_03-00-00'), { recursive: true });
    await writeFile(join(backupRoot, '2026-05-01_03-00-00', 'laurans.sqlite'), 'x');
    await mkdir(join(backupRoot, '2026-05-03_03-00-00'), { recursive: true });
    await writeFile(join(backupRoot, '2026-05-03_03-00-00', 'laurans.sqlite'), 'x');
    await mkdir(join(backupRoot, 'not-a-backup'), { recursive: true });
    const list = await BackupService.listBackups(backupRoot);
    expect(list.entries).toHaveLength(2);
    expect(list.entries[0]!.folderName).toBe('2026-05-03_03-00-00');
    expect(list.entries[1]!.folderName).toBe('2026-05-01_03-00-00');
  });
});

describe('BackupService.applyRetention', () => {
  it('keeps the N most recent daily backups and deletes the rest', async () => {
    for (const day of ['01', '02', '03', '04', '05']) {
      const folder = join(backupRoot, `2026-05-${day}_03-00-00`);
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, 'laurans.sqlite'), 'x');
    }
    await BackupService.applyRetention(backupRoot, { retainDailyCount: 2 });
    const remaining = (await readdir(backupRoot)).sort();
    expect(remaining).toEqual(['2026-05-04_03-00-00', '2026-05-05_03-00-00']);
  });
});

describe('BackupService.restoreFromFolder', () => {
  it('copies the backup back over user-data atomically (writes a sentinel last)', async () => {
    // Take a backup, mutate live data, then restore.
    const result = await BackupService.runBackup({
      userDataDir: userData,
      backupRoot,
      now: new Date('2026-05-05T03:00:00Z'),
      retainDailyCount: 30,
    });
    await writeFile(join(userData, 'laurans.sqlite'), 'MUTATED');
    await BackupService.restoreFromFolder({
      userDataDir: userData,
      sourceFolder: result.entry.folderPath,
    });
    const restored = (await stat(join(userData, 'laurans.sqlite'))).size;
    expect(restored).toBe('PRETEND-DB'.length);
  });
});
