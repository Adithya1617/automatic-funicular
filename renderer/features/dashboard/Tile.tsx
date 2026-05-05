import type { ReactNode } from 'react';
import { cn } from '@renderer/lib/cn';

export type TileProps = {
  title: string;
  subtitle?: string;
  className?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function Tile({ title, subtitle, className, actions, children }: TileProps) {
  return (
    <section
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-border-tertiary bg-background-primary p-4',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[12px] font-medium uppercase tracking-wider text-text-tertiary">
            {title}
          </h3>
          {subtitle ? (
            <p className="text-[11px] text-text-tertiary">{subtitle}</p>
          ) : null}
        </div>
        {actions}
      </header>
      <div className="min-h-0">{children}</div>
    </section>
  );
}

export function TileNumber({
  value,
  helpText,
}: {
  value: ReactNode;
  helpText?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[24px] font-semibold tabular-nums text-text-primary">{value}</div>
      {helpText ? <div className="text-[11px] text-text-tertiary">{helpText}</div> : null}
    </div>
  );
}
