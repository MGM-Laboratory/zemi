'use client';

import { X } from 'lucide-react';
import { Dialog as D, Tooltip as T } from 'radix-ui';
import type { ReactNode } from 'react';
import { useScrollLock } from '@/components/motion/smooth-scroll';
import { cn } from '@/lib/utils';
import styles from './ui.module.css';

export interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Element that opens it (wrapped with asChild). */
  trigger?: ReactNode;
  title: ReactNode;
  /** Short line under the title (read by screen readers). */
  description?: ReactNode;
  children?: ReactNode;
  /** Footer actions. */
  footer?: ReactNode;
  className?: string;
  /** Hide the title visually (still announced). */
  hideTitle?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = { sm: 'max-w-[26rem]', md: 'max-w-[36rem]', lg: 'max-w-[52rem]' };

function CloseButton({ className }: { className?: string }) {
  return (
    <D.Close
      className={cn(
        'grid size-10 place-items-center rounded-full bg-surface-muted text-ink transition-[transform,background-color] hover:bg-line active:scale-95',
        className,
      )}
      aria-label="Close"
    >
      <X className="size-5" aria-hidden="true" />
    </D.Close>
  );
}

function ScrollLock({ open }: { open: boolean }) {
  useScrollLock(open);
  return null;
}

/**
 * Centered public dialog (radix): focus trap, Esc to close, scroll lock, soft pop.
 * @example <Dialog trigger={<Button>Add to calendar</Button>} title="Pick a calendar">...</Dialog>
 */
export function Dialog({ open, onOpenChange, trigger, title, description, children, footer, className, hideTitle, size = 'md' }: DialogProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <D.Trigger asChild>{trigger}</D.Trigger> : null}
      <D.Portal>
        <D.Overlay className={cn(styles.overlay, 'fixed inset-0 z-[120] bg-ink/40 backdrop-blur-[3px]')} />
        <D.Content
          className={cn(
            styles.dialog,
            'fixed left-1/2 top-1/2 z-[121] flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[28px] bg-white shadow-3 outline-none',
            SIZES[size],
            className,
          )}
          data-lenis-prevent=""
        >
          <ScrollLock open={open ?? true} />
          <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-6 sm:px-8 sm:pt-8">
            <div className={cn('flex flex-col gap-1.5', hideTitle && 'sr-only')}>
              <D.Title className="display text-title text-ink" style={{ fontVariationSettings: "'CASL' 0.3, 'MONO' 0" }}>
                {title}
              </D.Title>
              {description ? <D.Description className="text-ink-2">{description}</D.Description> : null}
            </div>
            {!description ? <D.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</D.Description> : null}
            <CloseButton className="-mr-1 -mt-1" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 sm:px-8 sm:pb-8">{children}</div>
          {footer ? <div className="flex flex-wrap justify-end gap-3 border-t border-line px-6 py-4 sm:px-8">{footer}</div> : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export interface SheetProps extends Omit<DialogProps, 'size'> {
  /** bottom on phones is the friendliest. Default 'bottom'. */
  side?: 'bottom' | 'right';
}

/**
 * Sheet: slides up from the bottom (or in from the right). Same API as Dialog.
 * @example <Sheet side="right" title="Filters" trigger={<Button variant="secondary">Filter</Button>}>...</Sheet>
 */
export function Sheet({ open, onOpenChange, trigger, title, description, children, footer, className, hideTitle, side = 'bottom' }: SheetProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <D.Trigger asChild>{trigger}</D.Trigger> : null}
      <D.Portal>
        <D.Overlay className={cn(styles.overlay, 'fixed inset-0 z-[120] bg-ink/40 backdrop-blur-[3px]')} />
        <D.Content
          className={cn(
            'fixed z-[121] flex flex-col overflow-hidden bg-white shadow-3 outline-none',
            side === 'bottom'
              ? cn(styles.sheetBottom, 'inset-x-0 bottom-0 max-h-[88dvh] rounded-t-[28px] pb-[env(safe-area-inset-bottom)]')
              : cn(styles.sheetRight, 'inset-y-0 right-0 w-[min(28rem,100vw)] sm:rounded-l-[28px]'),
            className,
          )}
          data-lenis-prevent=""
        >
          <ScrollLock open={open ?? true} />
          {side === 'bottom' ? <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-line-strong" aria-hidden="true" /> : null}
          <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-5 sm:px-8">
            <div className={cn('flex flex-col gap-1.5', hideTitle && 'sr-only')}>
              <D.Title className="display text-title text-ink" style={{ fontVariationSettings: "'CASL' 0.3, 'MONO' 0" }}>
                {title}
              </D.Title>
              {description ? <D.Description className="text-ink-2">{description}</D.Description> : null}
            </div>
            {!description ? <D.Description className="sr-only">{typeof title === 'string' ? title : 'Panel'}</D.Description> : null}
            <CloseButton />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 sm:px-8">{children}</div>
          {footer ? <div className="flex flex-wrap justify-end gap-3 border-t border-line px-6 py-4 sm:px-8">{footer}</div> : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export const DialogClose = D.Close;

/* ------------------------------------------------------------------ tooltip */

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

/**
 * Small ink tooltip. The trigger must be focusable (a button or link). Wraps its own provider.
 * @example <Tooltip content="Copy ticket code"><IconButton label="Copy">...</IconButton></Tooltip>
 */
export function Tooltip({ content, children, side = 'top', delay = 250 }: TooltipProps) {
  return (
    <T.Provider delayDuration={delay} skipDelayDuration={300}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content
            side={side}
            sideOffset={8}
            collisionPadding={12}
            className={cn(styles.tooltip, 'z-[130] max-w-64 rounded-xl bg-ink px-3 py-2 text-[0.8125rem] font-semibold leading-snug text-white shadow-2')}
          >
            {content}
            <T.Arrow className="fill-ink" width={12} height={6} />
          </T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  );
}
