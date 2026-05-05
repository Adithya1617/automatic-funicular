import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@renderer/lib/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium',
  {
    variants: {
      variant: {
        neutral: 'bg-background-tertiary text-text-secondary',
        info: 'bg-background-info text-text-info',
        success: 'bg-background-success text-text-success',
        warning: 'bg-background-warning text-text-warning',
        danger: 'bg-background-danger text-text-danger',
        prepared: 'bg-[#f1ebfa] text-[#5b3aa3]',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
