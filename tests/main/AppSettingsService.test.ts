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
