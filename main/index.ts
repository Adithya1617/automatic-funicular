import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { getDb, openDb } from './db/client';
import { DEFAULT_TENANT_ID } from '@shared/constants/system';
import { registerIpcHandlers } from './ipc/register';
import { runReconciliation } from './jobs/reconciliation';
import { startBackupScheduler, stopBackupScheduler } from './jobs/backupScheduler';
import { LocalDiskStorage } from './adapters/storage/LocalDiskStorage';
import { fileStorageRegistry } from './adapters/storage/registry';

const isDev = !app.isPackaged;

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#f8f7f2',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (isDev && devServerUrl) {
    void win.loadURL(devServerUrl);
    // DevTools is opt-in: it slows interactions noticeably in dev. Set
    // HYPRRIDE_DEVTOOLS=1 to auto-open, or hit F12 / Ctrl+Shift+I in the
    // window when you actually need it.
    if (process.env['HYPRRIDE_DEVTOOLS'] === '1') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

function bootstrap(): void {
  const userData = app.getPath('userData');
  const dbPath = join(userData, 'hyprride.sqlite');
  const migrationsFolder = isDev
    ? join(app.getAppPath(), 'main/db/migrations')
    : join(process.resourcesPath, 'db/migrations');

  openDb({ filePath: dbPath, migrationsFolder });
  fileStorageRegistry.set(new LocalDiskStorage(userData));
  registerIpcHandlers();

  const drifts = runReconciliation(getDb().db, DEFAULT_TENANT_ID);
  if (drifts.length > 0) {
    console.error(
      `[reconciliation] ${drifts.length} ingredient(s) have stock drift:`,
      drifts,
    );
  }

  startBackupScheduler();
}

void app.whenReady().then(() => {
  bootstrap();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('before-quit', () => {
  stopBackupScheduler();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
