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
