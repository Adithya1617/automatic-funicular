import { Bell } from 'lucide-react';

type Props = {
  title: string;
  rightSlot?: React.ReactNode;
};

export function TopBar({ title, rightSlot }: Props) {
  return (
    <header className="flex items-center justify-between border-b border-border-tertiary px-5 py-3">
      <h1 className="text-[17px] font-medium text-text-primary">{title}</h1>
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
