'use client';

import { Tooltip as RTooltip } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/admin/cn';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  /** Keyboard shortcut shown next to the text, like "⌘K". */
  shortcut?: string;
  delayDuration?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * Small ink tooltip. The admin layout mounts `Tooltip.Provider`; outside it, this still works
 * (a local provider is created).
 */
export function Tooltip({ content, children, side = 'top', align = 'center', shortcut, delayDuration, disabled, className }: TooltipProps) {
  if (disabled || content == null || content === '') return <>{children}</>;
  return (
    <RTooltip.Provider delayDuration={delayDuration ?? 350} skipDelayDuration={150}>
      <RTooltip.Root>
        <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
        <RTooltip.Portal>
          <RTooltip.Content
            side={side}
            align={align}
            sideOffset={6}
            collisionPadding={8}
            className={cn(
              'z-[80] flex max-w-72 items-center gap-2 rounded-lg bg-ink px-2.5 py-1.5 text-[0.8125rem] leading-snug text-white shadow-[var(--shadow-2)]',
              'origin-[var(--radix-tooltip-content-transform-origin)] data-[state=delayed-open]:animate-[zemi-pop_140ms_var(--ease-out)]',
              className,
            )}
          >
            <span>{content}</span>
            {shortcut ? (
              <kbd className="mono rounded border border-white/20 px-1 text-[0.6875rem] text-white/80">{shortcut}</kbd>
            ) : null}
          </RTooltip.Content>
        </RTooltip.Portal>
      </RTooltip.Root>
    </RTooltip.Provider>
  );
}
