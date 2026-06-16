import { Bell, Menu } from 'lucide-react';

type Props = {
  title: string;
  rightSlot?: React.ReactNode;
  /** Shows a hamburger button (mobile only) that opens the nav drawer. */
  onMenuClick?: () => void;
};

export function TopBar({ title, rightSlot, onMenuClick }: Props) {
  return (
    <header className="flex items-center justify-between border-b border-border-tertiary px-3 py-3 md:px-5">
      <div className="flex min-w-0 items-center gap-2">
        {onMenuClick ? (
          <button
            type="button"
            aria-label="Open menu"
            onClick={onMenuClick}
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[6px] border border-border-tertiary bg-background-primary text-text-secondary hover:bg-background-tertiary md:hidden"
          >
            <Menu className="h-[15px] w-[15px]" strokeWidth={1.5} />
          </button>
        ) : null}
        <h1 className="truncate text-[17px] font-medium text-text-primary">{title}</h1>
      </div>
      <div className="flex items-center gap-1.5">
        {rightSlot}
        <button
          type="button"
          aria-label="Notifications"
          className="relative flex h-[30px] w-[30px] items-center justify-center rounded-[6px] border border-border-tertiary bg-background-primary text-text-secondary hover:bg-background-tertiary"
        >
          <Bell className="h-[14px] w-[14px]" strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
}
