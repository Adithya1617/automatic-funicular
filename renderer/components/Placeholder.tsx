type Props = {
  name: string;
  description?: string;
};

export function Placeholder({ name, description }: Props) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <div className="rounded-md border border-dashed border-border-primary bg-background-secondary px-6 py-8">
        <div className="text-[11px] uppercase tracking-wider text-text-tertiary">
          Placeholder
        </div>
        <div className="mt-1 text-[20px] font-medium text-text-primary">{name}</div>
        {description ? (
          <div className="mt-2 max-w-md text-[12px] text-text-secondary">{description}</div>
        ) : null}
      </div>
    </div>
  );
}
