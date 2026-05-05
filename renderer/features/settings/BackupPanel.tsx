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
