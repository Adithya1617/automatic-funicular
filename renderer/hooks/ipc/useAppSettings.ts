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
    queryFn: () => unwrap(window.hyprride.appSettings.snapshot({})),
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
    unwrap(window.hyprride.appSettings.setBackupFolder(input)),
  );
}

export function useSetBackupTime() {
  return useMut<SetBackupTimeInput>((input) =>
    unwrap(window.hyprride.appSettings.setBackupTime(input)),
  );
}

export function useSetFirstRunCompleted() {
  return useMut<SetFirstRunInput>((input) =>
    unwrap(window.hyprride.appSettings.setFirstRunCompleted(input)),
  );
}

export function useChooseDirectory() {
  return useMutation({
    mutationFn: (input: ChooseDirectoryInput) =>
      unwrap(window.hyprride.appSettings.chooseDirectory(input)),
  });
}
