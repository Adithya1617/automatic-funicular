/**
 * Shown when the renderer is loaded outside Electron (e.g. operator opened
 * http://localhost:5173 in a regular browser instead of the spawned Electron
 * window). Without `window.hyprride` every IPC call fails with a cryptic
 * `Cannot read properties of undefined (reading '<namespace>')`; this page
 * names the cause directly.
 */
export function NotInElectron() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background-secondary p-6 text-text-primary">
      <div className="max-w-md rounded-lg border border-border-tertiary bg-background-primary p-6">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
          Hyprride Inventory
        </div>
        <h1 className="mb-2 text-[16px] font-medium">Open in the desktop app</h1>
        <p className="mb-3 text-[12px] text-text-secondary">
          You're viewing the renderer at{' '}
          <span className="font-mono text-text-primary">localhost</span> in a
          regular browser. The app needs the Electron preload bridge to talk to
          the database, so IPC calls fail here.
        </p>
        <p className="text-[12px] text-text-secondary">
          The Electron window opens automatically when you run{' '}
          <span className="font-mono text-text-primary">npm run dev</span>. Use
          that window — leave this tab closed.
        </p>
      </div>
    </div>
  );
}
