'use client';

import { X } from 'lucide-react';
import { Dialog as RDialog } from 'radix-ui';
import { type ReactNode } from 'react';
import { cn } from '@/lib/admin/cn';
import { IconButton } from './button';

export const DialogRoot = RDialog.Root;
export const DialogTrigger = RDialog.Trigger;
export const DialogClose = RDialog.Close;

/*
 * Overlays and contents of every modal layer (Dialog, Sheet, ConfirmDialog, palette, drawer,
 * lightbox) share one z-index on purpose. Radix portals each layer to the end of <body> when it
 * opens, so with equal z-index the DOM order stacks them: a Dialog opened over a Sheet puts its
 * overlay above the Sheet and dims it, and its content above that.
 */
const overlayClass =
  'fixed inset-0 z-[60] bg-[rgba(14,17,22,0.32)] backdrop-blur-[2px] data-[state=open]:animate-[zemi-fade-in_180ms_var(--ease-out)] data-[state=closed]:animate-[zemi-fade-out_140ms_ease-in]';

export interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Element that opens the dialog (optional when controlled). */
  trigger?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Buttons row at the bottom. */
  footer?: ReactNode;
  children?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** Hide the close (X) button. */
  hideClose?: boolean;
  /** Prevent closing on outside click (long forms). */
  dismissible?: boolean;
  className?: string;
  bodyClassName?: string;
  /** Visual accent on top of the dialog: one of the brand shapes. */
  accent?: 'blue' | 'yellow' | 'red' | 'green';
}

const SIZES = {
  sm: 'max-w-[26rem]',
  md: 'max-w-[34rem]',
  lg: 'max-w-[46rem]',
  xl: 'max-w-[64rem]',
  full: 'max-w-[min(96rem,calc(100vw-2rem))]',
} as const;

/**
 * Centered modal dialog. Focus is trapped, Escape closes, the title is announced.
 * On phones it becomes a bottom sheet.
 *
 * @example
 * <Dialog open={open} onOpenChange={setOpen} title="New room" footer={<Button variant="primary">Add room</Button>}>...</Dialog>
 */
export function Dialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  footer,
  children,
  size = 'md',
  hideClose,
  dismissible = true,
  className,
  bodyClassName,
  accent,
}: DialogProps) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <RDialog.Trigger asChild>{trigger}</RDialog.Trigger> : null}
      <RDialog.Portal>
        <RDialog.Overlay className={overlayClass} />
        <RDialog.Content
          onPointerDownOutside={dismissible ? undefined : (e) => e.preventDefault()}
          onInteractOutside={dismissible ? undefined : (e) => e.preventDefault()}
          className={cn(
            'fixed z-[60] flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden bg-white shadow-[var(--shadow-3)] outline-none',
            'inset-x-0 bottom-0 rounded-t-[24px] data-[state=open]:animate-[zemi-sheet-up_260ms_var(--ease-out)]',
            'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[calc(100dvh-4rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[24px] sm:data-[state=open]:animate-[zemi-dialog-in_220ms_var(--ease-out)]',
            SIZES[size],
            className,
          )}
        >
          {accent ? <AccentBar accent={accent} /> : null}
          <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 sm:px-6 sm:pt-6">
            <div className="min-w-0">
              <RDialog.Title className="font-display text-xl leading-tight font-extrabold tracking-[-0.02em] text-ink [font-variation-settings:'CASL'_0.2]">
                {title}
              </RDialog.Title>
              {description ? (
                <RDialog.Description className="mt-1.5 text-[0.9375rem] text-ink-3">{description}</RDialog.Description>
              ) : (
                <RDialog.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</RDialog.Description>
              )}
            </div>
            {hideClose ? null : (
              <RDialog.Close asChild>
                <IconButton label="Close" size="sm" tooltip={false} className="-mt-1 -mr-2">
                  <X />
                </IconButton>
              </RDialog.Close>
            )}
          </div>
          {children ? <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6', bodyClassName)}>{children}</div> : null}
          {footer ? (
            <div className="flex flex-col-reverse gap-2 border-t border-line bg-white px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-end sm:px-6">
              {footer}
            </div>
          ) : null}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

function AccentBar({ accent }: { accent: 'blue' | 'yellow' | 'red' | 'green' }) {
  const bg = { blue: 'bg-blue', yellow: 'bg-yellow', red: 'bg-red', green: 'bg-green' }[accent];
  return <div className={cn('h-1.5 w-full shrink-0', bg)} aria-hidden="true" />;
}

export interface SheetProps extends Omit<DialogProps, 'size' | 'accent'> {
  side?: 'right' | 'left';
  /** Width on desktop. Default 'md' (32rem). */
  width?: 'sm' | 'md' | 'lg' | 'xl';
}

const SHEET_W = { sm: 'sm:max-w-[24rem]', md: 'sm:max-w-[32rem]', lg: 'sm:max-w-[42rem]', xl: 'sm:max-w-[56rem]' } as const;

/**
 * Side panel (drawer) for detail views and secondary forms. Full screen on phones.
 * @example <Sheet open={!!row} onOpenChange={(o) => !o && setRow(null)} title={row?.fullName}>...</Sheet>
 */
export function Sheet({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  footer,
  children,
  hideClose,
  dismissible = true,
  side = 'right',
  width = 'md',
  className,
  bodyClassName,
}: SheetProps) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <RDialog.Trigger asChild>{trigger}</RDialog.Trigger> : null}
      <RDialog.Portal>
        <RDialog.Overlay className={overlayClass} />
        <RDialog.Content
          onPointerDownOutside={dismissible ? undefined : (e) => e.preventDefault()}
          onInteractOutside={dismissible ? undefined : (e) => e.preventDefault()}
          className={cn(
            'fixed inset-y-0 z-[60] flex w-full flex-col bg-white shadow-[var(--shadow-3)] outline-none',
            side === 'right'
              ? 'right-0 border-l border-line data-[state=open]:animate-[zemi-slide-in-right_280ms_var(--ease-out)]'
              : 'left-0 border-r border-line data-[state=open]:animate-[zemi-slide-in-left_280ms_var(--ease-out)]',
            SHEET_W[width],
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-4 sm:px-6">
            <div className="min-w-0">
              <RDialog.Title className="truncate font-display text-xl leading-tight font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.2]">
                {title}
              </RDialog.Title>
              {description ? (
                <RDialog.Description className="mt-1 text-sm text-ink-3">{description}</RDialog.Description>
              ) : (
                <RDialog.Description className="sr-only">{typeof title === 'string' ? title : 'Panel'}</RDialog.Description>
              )}
            </div>
            {hideClose ? null : (
              <RDialog.Close asChild>
                <IconButton label="Close" size="sm" tooltip={false} className="-mr-2">
                  <X />
                </IconButton>
              </RDialog.Close>
            )}
          </div>
          <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6', bodyClassName)}>{children}</div>
          {footer ? (
            <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6">
              {footer}
            </div>
          ) : null}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
