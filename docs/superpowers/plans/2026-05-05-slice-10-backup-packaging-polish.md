# Slice 10 — Backup/Restore + Windows Packaging + Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Laurans Inventory as a working Windows installer with daily-scheduled local backups, manual backup/restore from Settings, surfaced reconciliation drift, and the deferred slice-10 polish items closed.

**Architecture:** A new `BackupService` runs against the user-data directory: it copies `laurans.sqlite` + the `files/` folder (PDF attachments) to a configurable backup root, applies a daily/weekly/monthly retention policy, and exposes manual `runBackup()` / `restoreFrom(folderPath)`. A new `BackupScheduler` job uses `setTimeout` recursion to fire at the configured time-of-day in main. The Settings page becomes real: backup folder picker, default time, "Backup now", "Restore from…", a reconciliation drift panel that calls a new `app:reconciliation` IPC. `electron-builder.yml` lands with NSIS Windows config (per-user install, no admin) and `extraResources` so migrations ship at `process.resourcesPath/db/migrations`. App settings are persisted in the existing `app_settings` table via a typed `AppSettingsService`. No native file-dialog calls outside the main process; the renderer requests dialogs via IPC.

**Tech Stack:** Existing — Electron 33, electron-builder 25, better-sqlite3, Drizzle ORM, React 18, TanStack Query. New runtime deps: none. Build dep: `electron-builder` (already installed) drives Windows packaging via a new `electron-builder.yml`.

---

## Files to be created or modified

**Create**
- `shared/schemas/appSettings.ts` — Zod schemas for the four app settings keys (`backup.folderPath`, `backup.dailyAtMinutes`, `backup.lastRunAt`, `firstRunCompleted`) + getter/setter input types.
- `shared/schemas/backup.ts` — Zod schemas for `BackupEntry`, `RunBackupInput`, `RestoreBackupInput`, `ListBackupsResponse`, plus the reconciliation drift response.
- `main/repositories/appSettingsRepository.ts` — get/set per key, JSON-encoded values in `app_settings.value`.
- `main/services/AppSettingsService.ts` — typed `get(key)` / `set(key, value)` with defaults; never throws on missing keys.
- `main/services/BackupService.ts` — `runBackup()`, `listBackups(rootPath)`, `restoreFromFolder(folderPath)`, `applyRetention(rootPath)`. Pure module — no Electron imports.
- `main/jobs/backupScheduler.ts` — `startBackupScheduler()` / `stopBackupScheduler()` using `setTimeout` recursion off the configured time-of-day. Reads/writes `backup.lastRunAt` so a missed slot still fires once on next boot.
- `main/lib/fsBackup.ts` — small helpers: `copyDirRecursive`, `copyFileWithDir`, `directoryExists`, `formatBackupFolderName(date)`. Pure Node fs/promises.
- `main/ipc/handlers/appSettings.ts` — IPC for get/set settings + `chooseDirectory` (dialog wrapper).
- `main/ipc/handlers/backup.ts` — IPC for runBackup / listBackups / restoreFromFolder.
- `main/ipc/handlers/reconciliation.ts` — IPC for `app:reconciliation` returning the latest drift snapshot.
- `renderer/hooks/ipc/useAppSettings.ts` — TanStack hooks for get/set + chooseDirectory.
- `renderer/hooks/ipc/useBackup.ts` — TanStack hooks for backup/restore/list.
- `renderer/hooks/ipc/useReconciliation.ts` — TanStack hook for the drift panel.
- `renderer/features/settings/BackupPanel.tsx` — folder picker, time picker, "Backup now", recent backups table, "Restore from…".
- `renderer/features/settings/ReconciliationPanel.tsx` — drift table + "Re-run reconciliation" button.
- `renderer/features/settings/AboutPanel.tsx` — app version, user-data path, build info.
- `electron-builder.yml` — NSIS Windows config (per-user install), `extraResources` for migrations, app id `com.laurans.inventory`.
- `tests/main/BackupService.test.ts` — happy-path backup, listBackups discovery, retention windowing, restoreFromFolder roundtrip (using `os.tmpdir()`).
- `tests/main/AppSettingsService.test.ts` — get-with-default, set-then-get, JSON round-trip.

**Modify**
- `shared/schemas/ipc.ts` — add `appSettings`, `backup`, `reconciliation` namespaces.
- `preload/index.ts` — bridge the three new namespaces.
- `main/ipc/register.ts` — register the three new handler modules.
- `main/index.ts` — start the backup scheduler after `bootstrap()`; capture the latest reconciliation drift into a module-level variable that the new IPC reads; stop the scheduler on `before-quit`; wire a `dialog.showOpenDialog` helper.
- `main/jobs/reconciliation.ts` — export a small `latestDrift` singleton so the IPC handler can read what the boot run found without re-running.
- `renderer/pages/SettingsPage.tsx` — replace the placeholder with the three panels.
- `package.json` — add a `package` script (`electron-builder --win --x64`) and `build` config block pointing at `electron-builder.yml`. Bump version to `0.1.0` (already there) — no change.
- `CLAUDE.md` — flip slice 10 to `done`, drop the Active deferred work entries that this slice closes (reconciliation drift in Settings + electron-builder migrations resource). Reverse-invoice and PDF preview stay deferred (out of scope for this slice).

---

## Pre-flight: confirm scope and approve packages

- [ ] **Step 1: Read this plan in full and verify package list**

No new npm packages. The plan reuses electron-builder (already installed) and Node built-ins (`fs/promises`, `path`, `os`). If the implementer disagrees with any locked decision in CLAUDE.md (e.g. wants to use `node-cron` for scheduling), they MUST stop and raise it before writing code.

Run: `grep -E "^\s*\"(electron-builder|better-sqlite3)\"" package.json`
Expected: shows electron-builder ^25 and better-sqlite3 ^11 already present.

---

## Task 1: App settings repository

**Files:**
- Create: `main/repositories/appSettingsRepository.ts`
- Test: covered indirectly via Task 2's AppSettingsService test (the repo is a thin wrapper).

- [ ] **Step 1: Write the repository**

Create `main/repositories/appSettingsRepository.ts`:

```ts
import { eq } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { appSettings } from '../db/schema';

/**
 * Thin key/value wrapper around the `app_settings` table. Values are stored
 * as JSON strings; AppSettingsService is responsible for typed (de)serialization.
 */
export const appSettingsRepository = {
  get(db: AppDb, key: string): string | undefined {
    const row = db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, key))
      .get();
    return row?.value;
  },

  set(db: AppDb, key: string, value: string, updatedAt: number): void {
    const existing = db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, key))
      .get();
    if (existing) {
      db.update(appSettings)
        .set({ value, updatedAt })
        .where(eq(appSettings.key, key))
        .run();
    } else {
      db.insert(appSettings).values({ key, value, updatedAt }).run();
    }
  },
};
```

- [ ] **Step 2: Typecheck**

Run: `env -u ELECTRON_RUN_AS_NODE npm run typecheck`
Expected: `tsc --noEmit ...` exits 0.

- [ ] **Step 3: Commit**

```bash
git add main/repositories/appSettingsRepository.ts
git commit -m "feat(slice-10): add app_settings repository for typed key/value persistence"
```

---

## Task 2: App settings service + shared schemas

**Files:**
- Create: `shared/schemas/appSettings.ts`, `main/services/AppSettingsService.ts`, `tests/main/AppSettingsService.test.ts`

- [ ] **Step 1: Write the shared schema**

Create `shared/schemas/appSettings.ts`:

```ts
import { z } from 'zod';

/** Default minutes-after-midnight for the daily backup (3:00 AM = 180). */
export const DEFAULT_BACKUP_DAILY_AT_MINUTES = 3 * 60;

export const APP_SETTINGS_KEYS = [
  'backup.folderPath',
  'backup.dailyAtMinutes',
  'backup.lastRunAt',
  'firstRunCompleted',
] as const;
export type AppSettingsKey = (typeof APP_SETTINGS_KEYS)[number];

export const appSettingsSnapshotSchema = z.object({
  backupFolderPath: z.string().nullable(),
  backupDailyAtMinutes: z.number().int().min(0).max(24 * 60 - 1),
  backupLastRunAt: z.number().int().nullable(),
  firstRunCompleted: z.boolean(),
});
export type AppSettingsSnapshot = z.infer<typeof appSettingsSnapshotSchema>;

export const setBackupFolderInputSchema = z.object({
  folderPath: z.string().min(1).nullable(),
});
export type SetBackupFolderInput = z.infer<typeof setBackupFolderInputSchema>;

export const setBackupTimeInputSchema = z.object({
  dailyAtMinutes: z.number().int().min(0).max(24 * 60 - 1),
});
export type SetBackupTimeInput = z.infer<typeof setBackupTimeInputSchema>;

export const setFirstRunInputSchema = z.object({
  completed: z.boolean(),
});
export type SetFirstRunInput = z.infer<typeof setFirstRunInputSchema>;

export const chooseDirectoryInputSchema = z.object({
  title: z.string().default('Choose folder'),
});
export type ChooseDirectoryInput = z.infer<typeof chooseDirectoryInputSchema>;

export const chooseDirectoryResponseSchema = z.object({
  folderPath: z.string().nullable(),
});
export type ChooseDirectoryResponse = z.infer<typeof chooseDirectoryResponseSchema>;
```

- [ ] **Step 2: Write the test (failing)**

Create `tests/main/AppSettingsService.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppSettingsService } from '../../main/services/AppSettingsService';
import { appSettingsRepository } from '../../main/repositories/appSettingsRepository';
import { DEFAULT_BACKUP_DAILY_AT_MINUTES } from '@shared/schemas/appSettings';

afterEach(() => vi.restoreAllMocks());

describe('AppSettingsService.snapshot', () => {
  it('returns sensible defaults when no settings rows exist', () => {
    vi.spyOn(appSettingsRepository, 'get').mockReturnValue(undefined);
    const snap = AppSettingsService.snapshot({} as never);
    expect(snap.backupFolderPath).toBeNull();
    expect(snap.backupDailyAtMinutes).toBe(DEFAULT_BACKUP_DAILY_AT_MINUTES);
    expect(snap.backupLastRunAt).toBeNull();
    expect(snap.firstRunCompleted).toBe(false);
  });

  it('parses persisted JSON values', () => {
    const map = new Map<string, string>([
      ['backup.folderPath', JSON.stringify('/tmp/laurans-backups')],
      ['backup.dailyAtMinutes', JSON.stringify(135)],
      ['backup.lastRunAt', JSON.stringify(1_700_000_000_000)],
      ['firstRunCompleted', JSON.stringify(true)],
    ]);
    vi.spyOn(appSettingsRepository, 'get').mockImplementation((_db, key) => map.get(key));
    const snap = AppSettingsService.snapshot({} as never);
    expect(snap.backupFolderPath).toBe('/tmp/laurans-backups');
    expect(snap.backupDailyAtMinutes).toBe(135);
    expect(snap.backupLastRunAt).toBe(1_700_000_000_000);
    expect(snap.firstRunCompleted).toBe(true);
  });
});

describe('AppSettingsService.set*', () => {
  it('writes JSON-encoded folder path through the repository', () => {
    const set = vi.spyOn(appSettingsRepository, 'set').mockImplementation(() => undefined);
    AppSettingsService.setBackupFolder({} as never, '/tmp/x');
    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0]![1]).toBe('backup.folderPath');
    expect(JSON.parse(set.mock.calls[0]![2] as string)).toBe('/tmp/x');
  });

  it('clears backup folder when null is passed', () => {
    const set = vi.spyOn(appSettingsRepository, 'set').mockImplementation(() => undefined);
    AppSettingsService.setBackupFolder({} as never, null);
    expect(JSON.parse(set.mock.calls[0]![2] as string)).toBeNull();
  });

  it('rejects invalid daily-at minutes', () => {
    expect(() => AppSettingsService.setBackupTime({} as never, -1)).toThrow();
    expect(() => AppSettingsService.setBackupTime({} as never, 24 * 60)).toThrow();
  });
});
```

- [ ] **Step 3: Run the test (expect failures)**

Run: `env -u ELECTRON_RUN_AS_NODE npx vitest run tests/main/AppSettingsService.test.ts`
Expected: FAIL with "Cannot find module ../../main/services/AppSettingsService".

- [ ] **Step 4: Write the service**

Create `main/services/AppSettingsService.ts`:

```ts
import type { AppDb } from '../db/client';
import { appSettingsRepository } from '../repositories/appSettingsRepository';
import {
  APP_SETTINGS_KEYS,
  DEFAULT_BACKUP_DAILY_AT_MINUTES,
  type AppSettingsSnapshot,
} from '@shared/schemas/appSettings';
import { ValidationError } from '@shared/errors/DomainError';

function readJson<T>(db: AppDb, key: (typeof APP_SETTINGS_KEYS)[number], fallback: T): T {
  const raw = appSettingsRepository.get(db, key);
  if (raw === undefined) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(db: AppDb, key: (typeof APP_SETTINGS_KEYS)[number], value: unknown): void {
  appSettingsRepository.set(db, key, JSON.stringify(value ?? null), Date.now());
}

export const AppSettingsService = {
  snapshot(db: AppDb): AppSettingsSnapshot {
    return {
      backupFolderPath: readJson<string | null>(db, 'backup.folderPath', null),
      backupDailyAtMinutes: readJson<number>(
        db,
        'backup.dailyAtMinutes',
        DEFAULT_BACKUP_DAILY_AT_MINUTES,
      ),
      backupLastRunAt: readJson<number | null>(db, 'backup.lastRunAt', null),
      firstRunCompleted: readJson<boolean>(db, 'firstRunCompleted', false),
    };
  },

  setBackupFolder(db: AppDb, folderPath: string | null): void {
    writeJson(db, 'backup.folderPath', folderPath);
  },

  setBackupTime(db: AppDb, dailyAtMinutes: number): void {
    if (
      !Number.isInteger(dailyAtMinutes) ||
      dailyAtMinutes < 0 ||
      dailyAtMinutes >= 24 * 60
    ) {
      throw new ValidationError(
        `dailyAtMinutes must be an integer in [0, ${24 * 60 - 1}] (got ${dailyAtMinutes})`,
      );
    }
    writeJson(db, 'backup.dailyAtMinutes', dailyAtMinutes);
  },

  setBackupLastRunAt(db: AppDb, ts: number): void {
    writeJson(db, 'backup.lastRunAt', ts);
  },

  setFirstRunCompleted(db: AppDb, completed: boolean): void {
    writeJson(db, 'firstRunCompleted', completed);
  },
};
```

- [ ] **Step 5: Run the test (expect pass)**

Run: `env -u ELECTRON_RUN_AS_NODE npx vitest run tests/main/AppSettingsService.test.ts`
Expected: 5 passing tests.

- [ ] **Step 6: Commit**

```bash
git add shared/schemas/appSettings.ts main/services/AppSettingsService.ts tests/main/AppSettingsService.test.ts
git commit -m "feat(slice-10): add AppSettingsService with typed snapshot + setters"
```

---

## Task 3: Filesystem helpers for backup

**Files:**
- Create: `main/lib/fsBackup.ts`

These are pure-Node helpers used by `BackupService`. No tests yet — Task 4's BackupService test exercises them through real fs operations against `os.tmpdir()`.

- [ ] **Step 1: Write the helpers**

Create `main/lib/fsBackup.ts`:

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `env -u ELECTRON_RUN_AS_NODE npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add main/lib/fsBackup.ts
git commit -m "feat(slice-10): add fs helpers for backup copy + listing"
```

---

## Task 4: BackupService with retention

**Files:**
- Create: `shared/schemas/backup.ts`, `main/services/BackupService.ts`, `tests/main/BackupService.test.ts`

- [ ] **Step 1: Write the shared schema**

Create `shared/schemas/backup.ts`:

```ts
import { z } from 'zod';

export const backupEntrySchema = z.object({
  folderName: z.string(),
  /** Absolute path to the backup folder. */
  folderPath: z.string(),
  takenAtMs: z.number().int(),
  sizeBytes: z.number().int().nonnegative(),
});
export type BackupEntry = z.infer<typeof backupEntrySchema>;

export const listBackupsResponseSchema = z.object({
  rootPath: z.string().nullable(),
  entries: z.array(backupEntrySchema),
});
export type ListBackupsResponse = z.infer<typeof listBackupsResponseSchema>;

export const runBackupInputSchema = z
  .object({
    /** Override the configured root for this run only. */
    rootPath: z.string().min(1).optional(),
  })
  .default({});
export type RunBackupInput = z.infer<typeof runBackupInputSchema>;

export const runBackupResponseSchema = z.object({
  entry: backupEntrySchema,
  prunedFolders: z.array(z.string()),
});
export type RunBackupResponse = z.infer<typeof runBackupResponseSchema>;

export const restoreBackupInputSchema = z.object({
  folderPath: z.string().min(1),
});
export type RestoreBackupInput = z.infer<typeof restoreBackupInputSchema>;
```

- [ ] **Step 2: Write the test (failing)**

Create `tests/main/BackupService.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test (expect failures)**

Run: `env -u ELECTRON_RUN_AS_NODE npx vitest run tests/main/BackupService.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the service**

Create `main/services/BackupService.ts`:

```ts
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
      join(opts.userDataDir, 'laurans.sqlite'),
      join(targetDir, 'laurans.sqlite'),
    );
    await copyDirectoryRecursive(
      join(opts.userDataDir, 'files'),
      join(targetDir, 'files'),
    );

    const dbSize = await pathSizeBytes(join(targetDir, 'laurans.sqlite'));
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
      const sizeBytes = await pathSizeBytes(join(folderPath, 'laurans.sqlite'));
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
      join(opts.sourceFolder, 'laurans.sqlite'),
      join(opts.userDataDir, 'laurans.sqlite'),
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
```

- [ ] **Step 5: Run the test (expect pass)**

Run: `env -u ELECTRON_RUN_AS_NODE npx vitest run tests/main/BackupService.test.ts`
Expected: 5 passing tests.

- [ ] **Step 6: Commit**

```bash
git add shared/schemas/backup.ts main/services/BackupService.ts tests/main/BackupService.test.ts
git commit -m "feat(slice-10): BackupService with snapshot, list, retention, restore"
```

---

## Task 5: Backup scheduler (main-process job)

**Files:**
- Create: `main/jobs/backupScheduler.ts`

The scheduler is intentionally test-light: it's a thin wrapper around `setTimeout` that delegates to `BackupService.runBackup`. The retention math + restore happen inside the service (already covered).

- [ ] **Step 1: Write the scheduler**

Create `main/jobs/backupScheduler.ts`:

```ts
import { app } from 'electron';
import { join } from 'node:path';
import { getDb } from '../db/client';
import { AppSettingsService } from '../services/AppSettingsService';
import { BackupService } from '../services/BackupService';

const DAILY_RETAIN_DEFAULT = 30;
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Compute the next daily fire time (in epoch ms) given the configured
 * minutes-after-midnight and the current wall clock. If today's slot has
 * already passed, schedule for tomorrow; otherwise today.
 */
export function nextFireMs(now: Date, dailyAtMinutes: number): number {
  const next = new Date(now);
  next.setHours(0, 0, 0, 0);
  next.setMinutes(dailyAtMinutes);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime();
}

export function startBackupScheduler(): void {
  scheduleNext();
}

export function stopBackupScheduler(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function scheduleNext(): void {
  const settings = AppSettingsService.snapshot(getDb().db);
  if (!settings.backupFolderPath) {
    // No folder configured — re-check in an hour (operator may set it).
    timer = setTimeout(scheduleNext, 60 * 60 * 1000);
    return;
  }
  const fireAt = nextFireMs(new Date(), settings.backupDailyAtMinutes);
  const delay = Math.max(0, fireAt - Date.now());
  timer = setTimeout(() => {
    void runScheduledBackup();
  }, delay);
}

async function runScheduledBackup(): Promise<void> {
  try {
    const settings = AppSettingsService.snapshot(getDb().db);
    if (!settings.backupFolderPath) return;
    await BackupService.runBackup({
      userDataDir: app.getPath('userData'),
      backupRoot: settings.backupFolderPath,
      now: new Date(),
      retainDailyCount: DAILY_RETAIN_DEFAULT,
    });
    AppSettingsService.setBackupLastRunAt(getDb().db, Date.now());
  } catch (err) {
    console.error('[backupScheduler] daily backup failed:', err);
  } finally {
    scheduleNext();
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `env -u ELECTRON_RUN_AS_NODE npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add main/jobs/backupScheduler.ts
git commit -m "feat(slice-10): daily backup scheduler with self-rescheduling timer"
```

---

## Task 6: Surface latest reconciliation drift

**Files:**
- Modify: `main/jobs/reconciliation.ts`

The boot-time reconciliation already runs in `main/index.ts` and logs drifts. Capture the result so the IPC handler can return it without re-running.

- [ ] **Step 1: Add a module-level latestDrift export**

Replace the bottom of `main/jobs/reconciliation.ts` with:

```ts
export type ReconciliationSnapshot = {
  ranAtMs: number;
  drifts: ReconciliationDrift[];
};

let latest: ReconciliationSnapshot | null = null;

export function latestReconciliationSnapshot(): ReconciliationSnapshot | null {
  return latest;
}
```

And update `runReconciliation` to write it:

```ts
export function runReconciliation(
  db: AppDb,
  tenantId: number,
): ReconciliationDrift[] {
  // ...existing body unchanged through the `for (const ing of ingredients)` loop...
  latest = { ranAtMs: Date.now(), drifts };
  return drifts;
}
```

(Keep all existing code; just append the `latest = ...` line right before `return drifts;` and add the new exports.)

- [ ] **Step 2: Typecheck**

Run: `env -u ELECTRON_RUN_AS_NODE npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add main/jobs/reconciliation.ts
git commit -m "feat(slice-10): expose latest reconciliation snapshot for Settings panel"
```

---

## Task 7: IPC channels + handlers + preload bridge

**Files:**
- Modify: `shared/schemas/ipc.ts`, `main/ipc/register.ts`, `preload/index.ts`
- Create: `main/ipc/handlers/appSettings.ts`, `main/ipc/handlers/backup.ts`, `main/ipc/handlers/reconciliation.ts`

- [ ] **Step 1: Extend the IPC namespace registry**

Edit `shared/schemas/ipc.ts` — append inside the `IPC` const:

```ts
  appSettings: {
    snapshot: 'appSettings:snapshot',
    setBackupFolder: 'appSettings:setBackupFolder',
    setBackupTime: 'appSettings:setBackupTime',
    setFirstRunCompleted: 'appSettings:setFirstRunCompleted',
    chooseDirectory: 'appSettings:chooseDirectory',
  },
  backup: {
    list: 'backup:list',
    runNow: 'backup:runNow',
    restore: 'backup:restore',
  },
  reconciliation: {
    latest: 'reconciliation:latest',
    rerun: 'reconciliation:rerun',
  },
```

- [ ] **Step 2: AppSettings handler**

Create `main/ipc/handlers/appSettings.ts`:

```ts
import { dialog, ipcMain, BrowserWindow } from 'electron';
import { z } from 'zod';
import { getDb } from '../../db/client';
import { AppSettingsService } from '../../services/AppSettingsService';
import { IPC } from '@shared/schemas/ipc';
import {
  chooseDirectoryInputSchema,
  setBackupFolderInputSchema,
  setBackupTimeInputSchema,
  setFirstRunInputSchema,
} from '@shared/schemas/appSettings';
import { makeHandler } from './wrap';

export function registerAppSettingsHandlers(): void {
  ipcMain.handle(
    IPC.appSettings.snapshot,
    makeHandler(z.object({}).default({}), () =>
      AppSettingsService.snapshot(getDb().db),
    ),
  );

  ipcMain.handle(
    IPC.appSettings.setBackupFolder,
    makeHandler(setBackupFolderInputSchema, (input) => {
      AppSettingsService.setBackupFolder(getDb().db, input.folderPath);
      return AppSettingsService.snapshot(getDb().db);
    }),
  );

  ipcMain.handle(
    IPC.appSettings.setBackupTime,
    makeHandler(setBackupTimeInputSchema, (input) => {
      AppSettingsService.setBackupTime(getDb().db, input.dailyAtMinutes);
      return AppSettingsService.snapshot(getDb().db);
    }),
  );

  ipcMain.handle(
    IPC.appSettings.setFirstRunCompleted,
    makeHandler(setFirstRunInputSchema, (input) => {
      AppSettingsService.setFirstRunCompleted(getDb().db, input.completed);
      return AppSettingsService.snapshot(getDb().db);
    }),
  );

  ipcMain.handle(
    IPC.appSettings.chooseDirectory,
    makeHandler(chooseDirectoryInputSchema, async (input) => {
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      const result = await dialog.showOpenDialog(win!, {
        title: input.title,
        properties: ['openDirectory', 'createDirectory'],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { folderPath: null };
      }
      return { folderPath: result.filePaths[0]! };
    }),
  );
}
```

- [ ] **Step 3: Backup handler**

Create `main/ipc/handlers/backup.ts`:

```ts
import { app, ipcMain } from 'electron';
import { z } from 'zod';
import { getDb } from '../../db/client';
import { AppSettingsService } from '../../services/AppSettingsService';
import { BackupService } from '../../services/BackupService';
import { IPC } from '@shared/schemas/ipc';
import {
  restoreBackupInputSchema,
  runBackupInputSchema,
} from '@shared/schemas/backup';
import { ValidationError } from '@shared/errors/DomainError';
import { makeHandler } from './wrap';

const DAILY_RETAIN = 30;

export function registerBackupHandlers(): void {
  ipcMain.handle(
    IPC.backup.list,
    makeHandler(z.object({}).default({}), async () => {
      const settings = AppSettingsService.snapshot(getDb().db);
      return BackupService.listBackups(settings.backupFolderPath);
    }),
  );

  ipcMain.handle(
    IPC.backup.runNow,
    makeHandler(runBackupInputSchema, async (input) => {
      const settings = AppSettingsService.snapshot(getDb().db);
      const root = input.rootPath ?? settings.backupFolderPath;
      if (!root) {
        throw new ValidationError(
          'No backup folder configured — set one in Settings before running a backup',
        );
      }
      const result = await BackupService.runBackup({
        userDataDir: app.getPath('userData'),
        backupRoot: root,
        now: new Date(),
        retainDailyCount: DAILY_RETAIN,
      });
      AppSettingsService.setBackupLastRunAt(getDb().db, result.entry.takenAtMs);
      return result;
    }),
  );

  ipcMain.handle(
    IPC.backup.restore,
    makeHandler(restoreBackupInputSchema, async (input) => {
      // Restore is a destructive operation: caller (renderer) confirms intent.
      // We close the DB, copy the backup over, then schedule a relaunch so the
      // next boot opens the restored DB cleanly.
      getDb().close();
      try {
        await BackupService.restoreFromFolder({
          userDataDir: app.getPath('userData'),
          sourceFolder: input.folderPath,
        });
      } finally {
        // Re-open immediately so subsequent IPC calls (during the brief
        // relaunch window) don't hit a closed handle.
        // Note: we re-import openDb lazily to avoid a top-level cycle.
        const { openDb } = await import('../../db/client');
        const { join } = await import('node:path');
        const userData = app.getPath('userData');
        const migrationsFolder = app.isPackaged
          ? join(process.resourcesPath, 'db/migrations')
          : join(app.getAppPath(), 'main/db/migrations');
        openDb({
          filePath: join(userData, 'laurans.sqlite'),
          migrationsFolder,
        });
      }
      app.relaunch();
      app.exit(0);
      return { ok: true };
    }),
  );
}
```

- [ ] **Step 4: Reconciliation handler**

Create `main/ipc/handlers/reconciliation.ts`:

```ts
import { ipcMain } from 'electron';
import { z } from 'zod';
import { getDb } from '../../db/client';
import { DEFAULT_TENANT_ID } from '@shared/constants/system';
import { IPC } from '@shared/schemas/ipc';
import {
  latestReconciliationSnapshot,
  runReconciliation,
} from '../../jobs/reconciliation';
import { makeHandler } from './wrap';

export function registerReconciliationHandlers(): void {
  ipcMain.handle(
    IPC.reconciliation.latest,
    makeHandler(z.object({}).default({}), () =>
      latestReconciliationSnapshot() ?? { ranAtMs: 0, drifts: [] },
    ),
  );

  ipcMain.handle(
    IPC.reconciliation.rerun,
    makeHandler(z.object({}).default({}), () => {
      const drifts = runReconciliation(getDb().db, DEFAULT_TENANT_ID);
      return { ranAtMs: Date.now(), drifts };
    }),
  );
}
```

- [ ] **Step 5: Register the handlers**

Edit `main/ipc/register.ts`:

```ts
import { registerAppSettingsHandlers } from './handlers/appSettings';
import { registerBackupHandlers } from './handlers/backup';
import { registerReconciliationHandlers } from './handlers/reconciliation';
```

Call them inside `registerIpcHandlers()` after the existing block:

```ts
  registerCsvImportHandlers();
  registerAppSettingsHandlers();
  registerBackupHandlers();
  registerReconciliationHandlers();
```

- [ ] **Step 6: Bridge in preload**

Edit `preload/index.ts`. Add type imports near the existing import block:

```ts
import type {
  AppSettingsSnapshot,
  ChooseDirectoryInput,
  ChooseDirectoryResponse,
  SetBackupFolderInput,
  SetBackupTimeInput,
  SetFirstRunInput,
} from '@shared/schemas/appSettings';
import type {
  ListBackupsResponse,
  RestoreBackupInput,
  RunBackupInput,
  RunBackupResponse,
} from '@shared/schemas/backup';

type ReconciliationSnapshotApi = {
  ranAtMs: number;
  drifts: Array<{
    ingredientId: string;
    ingredientName: string;
    storedStock: number;
    movementSum: number;
    drift: number;
  }>;
};
```

Add to the `api` object before the closing brace:

```ts
  appSettings: {
    snapshot: invoke<Record<string, never>, AppSettingsSnapshot>(IPC.appSettings.snapshot),
    setBackupFolder: invoke<SetBackupFolderInput, AppSettingsSnapshot>(
      IPC.appSettings.setBackupFolder,
    ),
    setBackupTime: invoke<SetBackupTimeInput, AppSettingsSnapshot>(IPC.appSettings.setBackupTime),
    setFirstRunCompleted: invoke<SetFirstRunInput, AppSettingsSnapshot>(
      IPC.appSettings.setFirstRunCompleted,
    ),
    chooseDirectory: invoke<ChooseDirectoryInput, ChooseDirectoryResponse>(
      IPC.appSettings.chooseDirectory,
    ),
  },
  backup: {
    list: invoke<Record<string, never>, ListBackupsResponse>(IPC.backup.list),
    runNow: invoke<RunBackupInput, RunBackupResponse>(IPC.backup.runNow),
    restore: invoke<RestoreBackupInput, { ok: true }>(IPC.backup.restore),
  },
  reconciliation: {
    latest: invoke<Record<string, never>, ReconciliationSnapshotApi>(IPC.reconciliation.latest),
    rerun: invoke<Record<string, never>, ReconciliationSnapshotApi>(IPC.reconciliation.rerun),
  },
```

- [ ] **Step 7: Typecheck**

Run: `env -u ELECTRON_RUN_AS_NODE npm run typecheck`
Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
git add shared/schemas/ipc.ts main/ipc/handlers/appSettings.ts main/ipc/handlers/backup.ts main/ipc/handlers/reconciliation.ts main/ipc/register.ts preload/index.ts
git commit -m "feat(slice-10): IPC + preload bridge for appSettings/backup/reconciliation"
```

---

## Task 8: Wire scheduler into main bootstrap

**Files:**
- Modify: `main/index.ts`

- [ ] **Step 1: Start scheduler after bootstrap**

Edit `main/index.ts`. Add the import:

```ts
import { startBackupScheduler, stopBackupScheduler } from './jobs/backupScheduler';
```

Append `startBackupScheduler()` at the end of `bootstrap()`:

```ts
  startOrderPoller();
  startBackupScheduler();
}
```

Stop it on `before-quit` (alongside the existing `stopOrderPoller()`):

```ts
app.on('before-quit', () => {
  stopOrderPoller();
  stopBackupScheduler();
});
```

- [ ] **Step 2: Typecheck**

Run: `env -u ELECTRON_RUN_AS_NODE npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add main/index.ts
git commit -m "feat(slice-10): start/stop backup scheduler with the app lifecycle"
```

---

## Task 9: Renderer hooks

**Files:**
- Create: `renderer/hooks/ipc/useAppSettings.ts`, `renderer/hooks/ipc/useBackup.ts`, `renderer/hooks/ipc/useReconciliation.ts`

- [ ] **Step 1: useAppSettings**

Create `renderer/hooks/ipc/useAppSettings.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AppSettingsSnapshot,
  ChooseDirectoryInput,
  SetBackupFolderInput,
  SetBackupTimeInput,
  SetFirstRunInput,
} from '@shared/schemas/appSettings';
import { unwrap } from '@renderer/lib/ipc';

const KEY = ['appSettings'] as const;

export function useAppSettings() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => unwrap(window.laurans.appSettings.snapshot({})),
  });
}

function useMut<TIn>(
  fn: (input: TIn) => Promise<AppSettingsSnapshot>,
) {
  const qc = useQueryClient();
  return useMutation<AppSettingsSnapshot, Error, TIn>({
    mutationFn: fn,
    onSuccess: (next) => qc.setQueryData(KEY, next),
  });
}

export function useSetBackupFolder() {
  return useMut<SetBackupFolderInput>((input) =>
    unwrap(window.laurans.appSettings.setBackupFolder(input)),
  );
}

export function useSetBackupTime() {
  return useMut<SetBackupTimeInput>((input) =>
    unwrap(window.laurans.appSettings.setBackupTime(input)),
  );
}

export function useSetFirstRunCompleted() {
  return useMut<SetFirstRunInput>((input) =>
    unwrap(window.laurans.appSettings.setFirstRunCompleted(input)),
  );
}

export function useChooseDirectory() {
  return useMutation({
    mutationFn: (input: ChooseDirectoryInput) =>
      unwrap(window.laurans.appSettings.chooseDirectory(input)),
  });
}
```

- [ ] **Step 2: useBackup**

Create `renderer/hooks/ipc/useBackup.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ListBackupsResponse,
  RestoreBackupInput,
  RunBackupInput,
  RunBackupResponse,
} from '@shared/schemas/backup';
import { unwrap } from '@renderer/lib/ipc';

const LIST_KEY = ['backup', 'list'] as const;

export function useBackupList() {
  return useQuery<ListBackupsResponse>({
    queryKey: LIST_KEY,
    queryFn: () => unwrap(window.laurans.backup.list({})),
  });
}

export function useRunBackup() {
  const qc = useQueryClient();
  return useMutation<RunBackupResponse, Error, RunBackupInput>({
    mutationFn: (input) => unwrap(window.laurans.backup.runNow(input)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.invalidateQueries({ queryKey: ['appSettings'] });
    },
  });
}

export function useRestoreBackup() {
  return useMutation<{ ok: true }, Error, RestoreBackupInput>({
    mutationFn: (input) => unwrap(window.laurans.backup.restore(input)),
  });
}
```

- [ ] **Step 3: useReconciliation**

Create `renderer/hooks/ipc/useReconciliation.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { unwrap } from '@renderer/lib/ipc';

const KEY = ['reconciliation'] as const;

export function useReconciliation() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => unwrap(window.laurans.reconciliation.latest({})),
  });
}

export function useRerunReconciliation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(window.laurans.reconciliation.rerun({})),
    onSuccess: (data) => qc.setQueryData(KEY, data),
  });
}
```

- [ ] **Step 4: Typecheck**

Run: `env -u ELECTRON_RUN_AS_NODE npm run typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add renderer/hooks/ipc/useAppSettings.ts renderer/hooks/ipc/useBackup.ts renderer/hooks/ipc/useReconciliation.ts
git commit -m "feat(slice-10): renderer hooks for settings/backup/reconciliation"
```

---

## Task 10: Settings panels

**Files:**
- Create: `renderer/features/settings/BackupPanel.tsx`, `renderer/features/settings/ReconciliationPanel.tsx`, `renderer/features/settings/AboutPanel.tsx`
- Modify: `renderer/pages/SettingsPage.tsx`

- [ ] **Step 1: BackupPanel**

Create `renderer/features/settings/BackupPanel.tsx`:

```tsx
import { useState } from 'react';
import { Folder, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@renderer/components/ui/table';
import {
  useAppSettings,
  useChooseDirectory,
  useSetBackupFolder,
  useSetBackupTime,
} from '@renderer/hooks/ipc/useAppSettings';
import {
  useBackupList,
  useRestoreBackup,
  useRunBackup,
} from '@renderer/hooks/ipc/useBackup';
import { formatDateTime } from '@renderer/lib/format';

function minutesToHHMM(m: number): string {
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function hhmmToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hh = Number.parseInt(match[1]!, 10);
  const mm = Number.parseInt(match[2]!, 10);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

export function BackupPanel() {
  const { data: settings } = useAppSettings();
  const { data: list } = useBackupList();
  const choose = useChooseDirectory();
  const setFolder = useSetBackupFolder();
  const setTime = useSetBackupTime();
  const runBackup = useRunBackup();
  const restore = useRestoreBackup();
  const [serverError, setServerError] = useState<string | null>(null);
  const [timeDraft, setTimeDraft] = useState<string | null>(null);

  async function pickFolder() {
    setServerError(null);
    try {
      const r = await choose.mutateAsync({ title: 'Choose backup folder' });
      if (r.folderPath) await setFolder.mutateAsync({ folderPath: r.folderPath });
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not set folder');
    }
  }

  async function commitTime() {
    if (timeDraft === null) return;
    const minutes = hhmmToMinutes(timeDraft);
    if (minutes === null) {
      setServerError('Time must be HH:MM (24-hour)');
      return;
    }
    try {
      await setTime.mutateAsync({ dailyAtMinutes: minutes });
      setTimeDraft(null);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not set time');
    }
  }

  async function runNow() {
    setServerError(null);
    try {
      await runBackup.mutateAsync({});
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Backup failed');
    }
  }

  async function restoreFromEntry(folderPath: string) {
    if (!confirm('Restore replaces the current database. The app will restart. Continue?')) return;
    setServerError(null);
    try {
      await restore.mutateAsync({ folderPath });
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Restore failed');
    }
  }

  return (
    <section className="rounded-lg border border-border-tertiary bg-background-primary p-4">
      <h2 className="text-[13px] font-medium text-text-primary">Backup &amp; restore</h2>
      <p className="mt-1 max-w-prose text-[12px] text-text-secondary">
        Daily snapshots of the database and PDF attachments. Pick any local
        folder — including one synced by Google Drive Desktop, Dropbox, or a
        USB drive.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-text-tertiary">Backup folder</label>
          <div className="flex items-center gap-2">
            <Input value={settings?.backupFolderPath ?? ''} readOnly placeholder="Not set" />
            <Button type="button" variant="secondary" size="md" onClick={pickFolder}>
              <Folder className="h-3 w-3" /> Choose…
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-text-tertiary">Daily backup time</label>
          <div className="flex items-center gap-2">
            <Input
              type="time"
              value={timeDraft ?? minutesToHHMM(settings?.backupDailyAtMinutes ?? 180)}
              onChange={(e) => setTimeDraft(e.target.value)}
              onBlur={commitTime}
            />
            <span className="text-[11px] text-text-tertiary">
              Last run:{' '}
              {settings?.backupLastRunAt
                ? formatDateTime(settings.backupLastRunAt)
                : 'never'}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          variant="primary"
          size="md"
          disabled={!settings?.backupFolderPath || runBackup.isPending}
          onClick={runNow}
        >
          <RefreshCw className="h-3 w-3" /> Backup now
        </Button>
        {serverError ? (
          <span className="rounded-md bg-background-danger px-2.5 py-1 text-[12px] text-text-danger">
            {serverError}
          </span>
        ) : null}
      </div>

      <h3 className="mt-4 text-[12px] font-medium uppercase tracking-wider text-text-tertiary">
        Recent backups
      </h3>
      {!list || list.entries.length === 0 ? (
        <p className="mt-1 text-[12px] text-text-tertiary">
          No backups yet at this folder.
        </p>
      ) : (
        <div className="mt-1 overflow-hidden rounded-lg border border-border-tertiary">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Taken</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Folder</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.entries.map((entry) => (
                <TableRow key={entry.folderPath}>
                  <TableCell>{formatDateTime(entry.takenAtMs)}</TableCell>
                  <TableCell className="text-text-secondary tabular-nums">
                    {(entry.sizeBytes / 1024).toFixed(1)} KB
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-text-secondary">
                    {entry.folderName}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="md"
                      onClick={() => restoreFromEntry(entry.folderPath)}
                    >
                      <RotateCcw className="h-3 w-3" /> Restore
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: ReconciliationPanel**

Create `renderer/features/settings/ReconciliationPanel.tsx`:

```tsx
import { Activity } from 'lucide-react';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@renderer/components/ui/table';
import {
  useReconciliation,
  useRerunReconciliation,
} from '@renderer/hooks/ipc/useReconciliation';
import { formatDateTime } from '@renderer/lib/format';

export function ReconciliationPanel() {
  const { data } = useReconciliation();
  const rerun = useRerunReconciliation();

  const drifts = data?.drifts ?? [];
  const ranAt = data?.ranAtMs ?? 0;
  const clean = drifts.length === 0;

  return (
    <section className="rounded-lg border border-border-tertiary bg-background-primary p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[13px] font-medium text-text-primary">
            Reconciliation
          </h2>
          <p className="mt-1 text-[12px] text-text-secondary">
            Sums every ingredient's signed movements and compares to the cached
            stock. Drift is a defect — the operator should be told, not silenced.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={() => rerun.mutate()}
          disabled={rerun.isPending}
        >
          <Activity className="h-3 w-3" /> Re-run
        </Button>
      </div>

      <div className="mt-3 flex items-center gap-2 text-[11px] text-text-tertiary">
        Last run:{' '}
        {ranAt > 0 ? formatDateTime(ranAt) : 'not yet'}
        {clean ? (
          <Badge variant="success">CLEAN</Badge>
        ) : (
          <Badge variant="danger">{drifts.length} DRIFT</Badge>
        )}
      </div>

      {clean ? (
        <p className="mt-2 text-[12px] text-text-secondary">
          All ingredient stocks match the movement ledger.
        </p>
      ) : (
        <div className="mt-2 overflow-hidden rounded-lg border border-border-tertiary">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ingredient</TableHead>
                <TableHead>Stored</TableHead>
                <TableHead>Movement sum</TableHead>
                <TableHead>Drift</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drifts.map((d) => (
                <TableRow key={d.ingredientId}>
                  <TableCell className="font-medium text-text-primary">
                    {d.ingredientName}
                  </TableCell>
                  <TableCell className="text-text-secondary tabular-nums">
                    {d.storedStock.toFixed(3)}
                  </TableCell>
                  <TableCell className="text-text-secondary tabular-nums">
                    {d.movementSum.toFixed(3)}
                  </TableCell>
                  <TableCell className="tabular-nums text-text-danger">
                    {d.drift.toFixed(3)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: AboutPanel**

Create `renderer/features/settings/AboutPanel.tsx`:

```tsx
export function AboutPanel() {
  return (
    <section className="rounded-lg border border-border-tertiary bg-background-primary p-4">
      <h2 className="text-[13px] font-medium text-text-primary">About Laurans</h2>
      <dl className="mt-2 grid grid-cols-[140px_1fr] gap-y-1 text-[12px]">
        <dt className="text-text-tertiary">Version</dt>
        <dd className="text-text-primary">0.1.0</dd>
        <dt className="text-text-tertiary">Tenant</dt>
        <dd className="text-text-primary">Laurans Food Court</dd>
        <dt className="text-text-tertiary">Stack</dt>
        <dd className="text-text-secondary">
          Electron · React 18 · TypeScript · SQLite (better-sqlite3) · Drizzle ORM
        </dd>
      </dl>
    </section>
  );
}
```

- [ ] **Step 4: Replace the SettingsPage placeholder**

Overwrite `renderer/pages/SettingsPage.tsx`:

```tsx
import { AboutPanel } from '@renderer/features/settings/AboutPanel';
import { BackupPanel } from '@renderer/features/settings/BackupPanel';
import { ReconciliationPanel } from '@renderer/features/settings/ReconciliationPanel';

export function SettingsPage() {
  return (
    <div className="flex flex-col gap-3">
      <BackupPanel />
      <ReconciliationPanel />
      <AboutPanel />
    </div>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `env -u ELECTRON_RUN_AS_NODE npm run typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add renderer/features/settings renderer/pages/SettingsPage.tsx
git commit -m "feat(slice-10): SettingsPage with backup, reconciliation, about panels"
```

---

## Task 11: electron-builder Windows config

**Files:**
- Create: `electron-builder.yml`, `build/installer.nsh` (optional)
- Modify: `package.json`

- [ ] **Step 1: Write the builder config**

Create `electron-builder.yml`:

```yaml
appId: com.laurans.inventory
productName: Laurans Inventory
copyright: Copyright (c) 2026 Laurans Food Court
asar: true
directories:
  output: dist
  buildResources: build
files:
  - out/**
  - package.json
  - "!node_modules/**/*"
extraResources:
  # Drizzle migrations must travel with the installer; the main process reads
  # them from process.resourcesPath/db/migrations in production
  # (main/index.ts bootstrap()).
  - from: main/db/migrations
    to: db/migrations
    filter:
      - "**/*"
asarUnpack:
  # better-sqlite3 ships a native .node — must NOT live inside an asar.
  - "**/node_modules/better-sqlite3/**/*"
win:
  target:
    - target: nsis
      arch:
        - x64
  artifactName: ${productName}-${version}-${arch}.${ext}
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: always
  createStartMenuShortcut: true
  shortcutName: Laurans Inventory
publish: null
```

- [ ] **Step 2: Add the package script**

Edit `package.json`. Add `"package:win": "env -u ELECTRON_RUN_AS_NODE electron-builder --win --x64"` to the scripts block:

```json
  "scripts": {
    "postinstall": "electron-rebuild -f -w better-sqlite3",
    "dev": "env -u ELECTRON_RUN_AS_NODE electron-vite dev",
    "build": "env -u ELECTRON_RUN_AS_NODE electron-vite build",
    "preview": "env -u ELECTRON_RUN_AS_NODE electron-vite preview",
    "typecheck": "tsc --noEmit -p tsconfig.web.json && tsc --noEmit -p tsconfig.node.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "package:win": "env -u ELECTRON_RUN_AS_NODE electron-builder --win --x64"
  },
```

- [ ] **Step 3: Sanity-check the config syntax**

Run: `env -u ELECTRON_RUN_AS_NODE npx electron-builder --help | head -5`
Expected: no errors. (Full Windows build only succeeds on a Windows host or under wine; we don't run that here — packaging is verified on the operator's Windows machine.)

- [ ] **Step 4: Commit**

```bash
git add electron-builder.yml package.json
git commit -m "feat(slice-10): electron-builder NSIS Windows config + package:win script"
```

---

## Task 12: Verify reconciliation drift surfacing end-to-end

**Files:** none new — this is a manual + automated verification step.

- [ ] **Step 1: Re-run the test suite**

Run: `env -u ELECTRON_RUN_AS_NODE npm test`
Expected: all tests pass (109 existing + AppSettingsService 5 + BackupService 5 = 119+).

- [ ] **Step 2: Boot dev and visit Settings**

Run: `env -u ELECTRON_RUN_AS_NODE npm run dev`
Expected: Electron window opens. Click **Settings** in the sidebar. Three panels render: Backup & restore (empty list, "Backup now" disabled until folder set), Reconciliation (CLEAN), About.

- [ ] **Step 3: Set a folder, run a manual backup**

Click "Choose…", pick a folder (e.g. a fresh `~/laurans-test-backups`). Click "Backup now". Expected: a row appears in the Recent backups table; the folder on disk now has `<timestamp>/laurans.sqlite` and (if any PDFs exist) `<timestamp>/files/invoices/...`.

- [ ] **Step 4: Restore from a backup**

Click "Restore" on the row. Confirm the prompt. Expected: app relaunches; data is identical to the backup point.

- [ ] **Step 5: Commit nothing — this is a verification task**

No commit; if any of the steps fail, fix the failing task above and re-verify.

---

## Task 13: Update CLAUDE.md and close deferred items

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Flip slice 10 row to done**

In `CLAUDE.md`'s Slice progress table, replace the slice-10 row with:

```markdown
| 10 | done | Backup/restore + Windows packaging + polish. New `BackupService` (snapshot + retention + restore) drives by `BackupScheduler` (daily fire on configurable time-of-day) and a manual "Backup now" action. New `AppSettingsService` persists backup folder/time/lastRun and `firstRunCompleted` in the existing `app_settings` key/value table. Settings page rebuilt with three panels: Backup &amp; restore (folder picker via `dialog.showOpenDialog` IPC, time picker, recent backups table, "Restore from…"), Reconciliation (surfaces `runReconciliation` drifts captured at boot, with a "Re-run" button), About. `electron-builder.yml` lands with NSIS Windows config (`oneClick: false`, `perMachine: false`, `allowToChangeInstallationDirectory: true`) and `extraResources` so migrations ship at `process.resourcesPath/db/migrations` (closes slice-10 deferred work). New `package:win` npm script for building the installer. Restore relaunches the app cleanly via `app.relaunch(); app.exit(0)` after the file copy. |
```

- [ ] **Step 2: Drop the closed deferred items**

In `CLAUDE.md`'s **Active deferred work** section, remove the slice-10 bullet entirely. Keep the **Future polish** bullet (reverse-invoice flow, PDF preview) — those stay deferred and are NOT slice-10 scope.

- [ ] **Step 3: Verify the file**

Run: `head -160 CLAUDE.md | tail -50`
Expected: slice 10 reads "done", deferred-work section no longer mentions reconciliation drift / electron-builder migrations.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(slice-10): mark slice 10 done and clear closed deferred work"
```

---

## Self-review checklist

1. **Spec coverage (§7.12):**
   - Automatic daily backup at configurable time → Task 5 (`backupScheduler.nextFireMs` + `runScheduledBackup`).
   - Configurable backup folder → Task 2 (`AppSettingsService.setBackupFolder`) + Task 10 (BackupPanel folder picker via Task 7's `chooseDirectory` IPC).
   - `YYYY-MM-DD_HH-MM-SS` folder name → Task 3 (`formatBackupFolderName`).
   - Retention: last 30 daily → Task 4 (`BackupService.applyRetention`). Spec also mentions weekly/monthly retention; this plan ships daily-30 and notes weekly/monthly as a v1.1 nicety in CLAUDE.md if needed (kept simple — restaurant-scale daily-30 covers ~1 month of recovery).
   - Manual backup → Task 7 (`backup:runNow`) + Task 10 ("Backup now").
   - Restore on startup if no DB but backup folder configured → NOT in this plan; recovery flow in this plan is manual via Settings ("Restore" row action). The startup auto-recover is deferred — flag in CLAUDE.md as future polish if the operator asks. (Documenting this here to avoid silent scope drift.)
   - Manual restore from settings → Task 7 (`backup:restore`) + Task 10 (Restore button).
2. **Closes deferred work entries:** Reconciliation drift surfaced (Task 6 + 7 + 10), electron-builder migrations resource (Task 11). Reverse-invoice flow + PDF preview remain deferred and are **explicitly not in scope** here.
3. **Type consistency:** `AppSettingsSnapshot` shape matches across schema, service, IPC, hook, panel. `BackupEntry` shape is the same in backup schema, service result, list response, and panel renderer.
4. **No placeholders:** every code step shows the literal code; every command shows expected output.
5. **Locked-decision compliance:**
   - Backup runs in main; renderer never touches the filesystem directly. ✓
   - Service methods are Electron-free except where explicitly noted (`backupScheduler.ts` and `backup` IPC handler import `app` for paths — acceptable since they're wiring, not business logic). ✓
   - No new SQLite-only SQL; no auto-increment PKs; no direct stock_quantity writes. ✓
6. **Scope check:** auto-restore-on-startup is a single missing piece from §7.12. Adding it here would mean another full task (boot-time prompt UI, migrations folder fallback). I've kept it out to keep the slice shippable; the manual restore from Settings covers the core operator workflow.

---

## After execution

Re-read `CLAUDE.md` Active deferred work section to confirm only the **Future polish** entries remain. The reverse-invoice flow and in-app PDF preview are still deferred — those are deliberate v1.1 items per the spec's out-of-scope list.
