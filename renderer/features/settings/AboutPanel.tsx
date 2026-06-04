export function AboutPanel() {
  return (
    <section className="rounded-lg border border-border-tertiary bg-background-primary p-4">
      <h2 className="text-[13px] font-medium text-text-primary">About Laurans</h2>
      <dl className="mt-2 grid grid-cols-[140px_1fr] gap-y-1 text-[12px]">
        <dt className="text-text-tertiary">Version</dt>
        <dd className="text-text-primary">0.1.0</dd>
        <dt className="text-text-tertiary">Tenant</dt>
        <dd className="text-text-primary">Hyprride</dd>
        <dt className="text-text-tertiary">Stack</dt>
        <dd className="text-text-secondary">
          Electron · React 18 · TypeScript · SQLite (better-sqlite3) · Drizzle ORM
        </dd>
      </dl>
    </section>
  );
}
