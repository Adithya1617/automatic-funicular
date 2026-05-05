import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@renderer/lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-info focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'bg-text-primary text-background-primary hover:bg-text-primary/90',
        success:
          'bg-text-success text-background-primary hover:bg-text-success/90',
        secondary:
          'border border-border-tertiary bg-background-primary text-text-primary hover:bg-background-tertiary',
        ghost:
          'text-text-secondary hover:bg-background-tertiary hover:text-text-primary',
        danger:
          'border border-border-tertiary bg-background-primary text-text-danger hover:bg-background-danger',
      },
      size: {
        sm: 'h-[28px] px-2.5',
        md: 'h-[32px] px-3',
        lg: 'h-[40px] px-4 text-[13px]',
        icon: 'h-[30px] w-[30px]',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
