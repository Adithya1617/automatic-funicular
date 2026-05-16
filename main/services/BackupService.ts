import {
  copyDirectoryRecursive,
  copyFileWithDir,
  ensureDirectory,
  formatBackupFolderName,
  listSubdirectories,
  pathSizeBytes,
  removeDirectory,
} from '../lib/fsBackup';
import { join } from 'node:path';
import type {
  BackupEntry,
  ListBackupsResponse,
  RunBackupResponse,
} from '@shared/schemas/backup';

const FOLDER_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/;

export type RetentionConfig = {
  /** Number of recent daily backups to keep (newest first). Spec §7.12 = 30. */
  retainDailyCount: number;
};

export const BackupService = {
  /**
   * Snapshot the user-data dir (SQLite + files/) into
   * `<backupRoot>/<YYYY-MM-DD_HH-MM-SS>/`. Applies retention after copy.
   * Pure async — does not touch any global Electron state.
   */
  async runBackup(opts: {
    userDataDir: string;
    backupRoot: string;
    now: Date;
    retainDailyCount: number;
  }): Promise<RunBackupResponse> {
    const folderName = formatBackupFolderName(opts.now);
    const targetDir = join(opts.backupRoot, folderName);
    await ensureDirectory(opts.backupRoot);
    await ensureDirectory(targetDir);

    await copyFileWithDir(
      join(opts.userDataDir, 'hyprride.sqlite'),
      join(targetDir, 'hyprride.sqlite'),
    );
    await copyDirectoryRecursive(
      join(opts.userDataDir, 'files'),
      join(targetDir, 'files'),
    );

    const dbSize = await pathSizeBytes(join(targetDir, 'hyprride.sqlite'));
    const entry: BackupEntry = {
      folderName,
      folderPath: targetDir,
      takenAtMs: opts.now.getTime(),
      sizeBytes: dbSize,
    };

    const prunedFolders = await BackupService.applyRetention(opts.backupRoot, {
      retainDailyCount: opts.retainDailyCount,
    });

    return { entry, prunedFolders };
  },

  async listBackups(rootPath: string | null): Promise<ListBackupsResponse> {
    if (!rootPath) return { rootPath: null, entries: [] };
    const subdirs = await listSubdirectories(rootPath);
    const entries: BackupEntry[] = [];
    for (const name of subdirs) {
      if (!FOLDER_PATTERN.test(name)) continue;
      const folderPath = join(rootPath, name);
      const sizeBytes = await pathSizeBytes(join(folderPath, 'hyprride.sqlite'));
      entries.push({
        folderName: name,
        folderPath,
        takenAtMs: parseFolderName(name),
        sizeBytes,
      });
    }
    entries.sort((a, b) => b.takenAtMs - a.takenAtMs);
    return { rootPath, entries };
  },

  async applyRetention(
    rootPath: string,
    config: RetentionConfig,
  ): Promise<string[]> {
    const list = await BackupService.listBackups(rootPath);
    const toKeep = new Set(list.entries.slice(0, config.retainDailyCount).map((e) => e.folderName));
    const pruned: string[] = [];
    for (const entry of list.entries) {
      if (toKeep.has(entry.folderName)) continue;
      await removeDirectory(entry.folderPath);
      pruned.push(entry.folderName);
    }
    return pruned;
  },

  /**
   * Copy a backup folder back over user-data. Caller is responsible for
   * shutting the DB down BEFORE invoking — this function just copies bytes.
   */
  async restoreFromFolder(opts: {
    userDataDir: string;
    sourceFolder: string;
  }): Promise<void> {
    await copyFileWithDir(
      join(opts.sourceFolder, 'hyprride.sqlite'),
      join(opts.userDataDir, 'hyprride.sqlite'),
    );
    await copyDirectoryRecursive(
      join(opts.sourceFolder, 'files'),
      join(opts.userDataDir, 'files'),
    );
  },
};

function parseFolderName(name: string): number {
  // YYYY-MM-DD_HH-MM-SS — local time when the backup was taken.
  const [datePart, timePart] = name.split('_');
  const [y, m, d] = datePart!.split('-').map((s) => Number.parseInt(s, 10));
  const [hh, mm, ss] = timePart!.split('-').map((s) => Number.parseInt(s, 10));
  return new Date(y!, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, ss ?? 0).getTime();
}
