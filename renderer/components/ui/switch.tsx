import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@renderer/lib/cn';

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-[20px] w-[34px] shrink-0 cursor-pointer items-center rounded-full border-0 transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-info focus-visible:ring-offset-1',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:bg-text-success data-[state=unchecked]:bg-border-primary',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        'pointer-events-none block h-[16px] w-[16px] rounded-full bg-background-primary shadow-sm transition-transform',
        'data-[state=checked]:translate-x-[16px] data-[state=unchecked]:translate-x-[2px]',
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;
