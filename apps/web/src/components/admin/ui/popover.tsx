'use client';

import { Popover as RPopover } from 'radix-ui';
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '@/lib/admin/cn';

export const PopoverRoot = RPopover.Root;
export const PopoverTrigger = RPopover.Trigger;
export const PopoverAnchor = RPopover.Anchor;
export const PopoverClose = RPopover.Close;

export const popoverSurface =
  'z-[70] rounded-2xl border border-line bg-white shadow-[var(--shadow-3)] outline-none origin-[var(--radix-popover-content-transform-origin)] data-[state=open]:animate-[zemi-pop_160ms_var(--ease-out)]';

export const PopoverContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof RPopover.Content> & { padded?: boolean }>(
  function PopoverContent({ className, sideOffset = 8, collisionPadding = 12, padded = true, ...props }, ref) {
    return (
      <RPopover.Portal>
        <RPopover.Content
          ref={ref}
          sideOffset={sideOffset}
          collisionPadding={collisionPadding}
          className={cn(popoverSurface, padded && 'p-4', 'max-w-[calc(100vw-24px)]', className)}
          {...props}
        />
      </RPopover.Portal>
    );
  },
);

export interface PopoverProps {
  trigger: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  className?: string;
  modal?: boolean;
}

/**
 * Simple popover. For custom composition use PopoverRoot/PopoverTrigger/PopoverContent.
 * @example <Popover trigger={<Button>Filters</Button>}>...</Popover>
 */
export function Popover({ trigger, children, open, onOpenChange, side = 'bottom', align = 'start', className, modal }: PopoverProps) {
  return (
    <RPopover.Root open={open} onOpenChange={onOpenChange} modal={modal}>
      <RPopover.Trigger asChild>{trigger}</RPopover.Trigger>
      <PopoverContent side={side} align={align} className={className}>
        {children}
      </PopoverContent>
    </RPopover.Root>
  );
}
