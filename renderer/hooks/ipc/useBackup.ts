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
    queryFn: () => unwrap(window.hyprride.backup.list({})),
  });
}

export function useRunBackup() {
  const qc = useQueryClient();
  return useMutation<RunBackupResponse, Error, RunBackupInput>({
    mutationFn: (input) => unwrap(window.hyprride.backup.runNow(input)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.invalidateQueries({ queryKey: ['appSettings'] });
    },
  });
}

export function useRestoreBackup() {
  return useMutation<{ ok: true }, Error, RestoreBackupInput>({
    mutationFn: (input) => unwrap(window.hyprride.backup.restore(input)),
  });
}
