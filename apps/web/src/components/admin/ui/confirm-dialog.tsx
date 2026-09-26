'use client';

import { AlertDialog } from 'radix-ui';
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/admin/cn';
import { Character } from '../characters/character';
import { Button } from './button';
import { Input } from './input';

export interface ConfirmOptions {
  title: ReactNode;
  /** Say exactly what will happen: "This removes 42 registrations and their tickets stop working." */
  description?: ReactNode;
  /** Button text that says what happens: "Delete event". Default "Confirm". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red button + Hunch looking worried. */
  destructive?: boolean;
  /** Require typing this exact text (like the event title) to enable the button. */
  typeToConfirm?: string;
  /** Extra content (a checkbox like "Email registrants"). */
  children?: ReactNode;
}

export interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called on confirm. Return a promise to show a loading state; the dialog closes when it resolves. */
  onConfirm: () => void | Promise<unknown>;
  loading?: boolean;
}

/**
 * Confirmation for anything irreversible. Uses the alert dialog pattern (focus lands on Cancel).
 *
 * @example
 * <ConfirmDialog open={open} onOpenChange={setOpen} destructive title="Delete this event?"
 *   description="Registrations, tickets and the recording go with it. This cannot be undone."
 *   confirmLabel="Delete event" typeToConfirm={event.title} onConfirm={() => del.mutateAsync()} />
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  loading: loadingProp,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  typeToConfirm,
  children,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const [pending, setPending] = useState(false);
  const inputId = useId();
  useEffect(() => {
    if (!open) {
      setTyped('');
      setPending(false);
    }
  }, [open]);
  const matches = !typeToConfirm || typed.trim() === typeToConfirm.trim();
  const loading = loadingProp ?? pending;

  const run = async () => {
    if (!matches || loading) return;
    const res = onConfirm();
    if (res && typeof (res as Promise<unknown>).then === 'function') {
      setPending(true);
      try {
        await res;
        onOpenChange(false);
      } catch {
        // The caller shows the error (toast). Keep the dialog open so they can retry.
      } finally {
        setPending(false);
      }
    } else {
      onOpenChange(false);
    }
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[60] bg-[rgba(14,17,22,0.32)] backdrop-blur-[2px] data-[state=open]:animate-[zemi-fade-in_180ms_var(--ease-out)]" />
        <AlertDialog.Content
          className={cn(
            'fixed z-[60] w-full bg-white shadow-[var(--shadow-3)] outline-none',
            'inset-x-0 bottom-0 rounded-t-[24px] data-[state=open]:animate-[zemi-sheet-up_260ms_var(--ease-out)]',
            'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-w-[28rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[24px] sm:data-[state=open]:animate-[zemi-dialog-in_220ms_var(--ease-out)]',
          )}
        >
          <div className="px-5 pt-6 pb-5 sm:px-6">
            <div className="mb-4 flex items-end gap-1">
              <Character shape={destructive ? 'triangle' : 'circle'} mood={destructive ? 'oops' : 'idle'} size={44} />
              {destructive ? <Character shape="square" mood="look" lookAt={{ x: -0.8, y: 0.1 }} size={30} /> : null}
            </div>
            <AlertDialog.Title className="font-display text-xl leading-tight font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.2]">
              {title}
            </AlertDialog.Title>
            {description ? (
              <AlertDialog.Description className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">{description}</AlertDialog.Description>
            ) : (
              <AlertDialog.Description className="sr-only">Please confirm.</AlertDialog.Description>
            )}
            {children ? <div className="mt-4">{children}</div> : null}
            {typeToConfirm ? (
              <div className="mt-5 space-y-1.5">
                <label htmlFor={inputId} className="block text-sm text-ink-2">
                  Type <strong className="font-semibold break-all text-ink">{typeToConfirm}</strong> to confirm.
                </label>
                <Input
                  id={inputId}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void run();
                    }
                  }}
                />
              </div>
            ) : null}
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6">
            <AlertDialog.Cancel asChild>
              <Button variant="ghost" disabled={loading}>
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>
            <Button variant={destructive ? 'danger' : 'primary'} disabled={!matches} loading={loading} onClick={() => void run()}>
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/* ------------------------------------------------------------------ imperative confirm */

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Mounted once by the admin shell. Enables `useConfirm()`. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ opts: ConfirmOptions; open: boolean } | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const confirm = useCallback<ConfirmFn>((opts) => {
    resolver.current?.(false);
    setState({ opts, open: true });
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state ? (
        <ConfirmDialog
          {...state.opts}
          open={state.open}
          onOpenChange={(o) => {
            if (!o) {
              resolver.current?.(false);
              resolver.current = null;
              setState((s) => (s ? { ...s, open: false } : s));
            }
          }}
          onConfirm={() => {
            resolver.current?.(true);
            resolver.current = null;
          }}
        />
      ) : null}
    </ConfirmContext.Provider>
  );
}

/**
 * Promise-based confirm. Resolves true when confirmed.
 * @example if (await confirm({ title: 'Remove this speaker?', destructive: true, confirmLabel: 'Remove' })) remove();
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm needs <ConfirmProvider> (mounted by the admin shell).');
  return ctx;
}
