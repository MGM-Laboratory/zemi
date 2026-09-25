'use client';

import type { ShapeName } from '@zemi/shared';
import { useEffect, type ReactNode } from 'react';
import { toast, Toaster } from 'sonner';
import { errorMessage } from '@/lib/admin/api';
import { registerAdminNotifier } from '@/lib/admin/hooks';
import { Character } from '../characters/character';
import { ShapeGlyph } from './badge';

/**
 * Admin toasts (sonner). Call `notify.*` from anywhere in client code.
 *
 * @example notify.success('Saved.')
 * @example notify.success('Event published.', { celebrate: true })   // tiny cheering character
 * @example notify.error(err)                                          // ApiError or string
 * @example notify.promise(save(), { loading: 'Saving...', success: 'Saved.' })
 */
export interface NotifyOptions {
  description?: ReactNode;
  /** Swap the icon for a character doing a little cheer. */
  celebrate?: boolean | ShapeName;
  action?: { label: string; onClick: () => void };
  duration?: number;
  id?: string | number;
}

function celebrateIcon(c: NotifyOptions['celebrate']) {
  const shape: ShapeName = typeof c === 'string' ? c : 'arch';
  return <Character shape={shape} mood="cheer" size={26} />;
}

export const notify = {
  success(message: ReactNode, opts: NotifyOptions = {}) {
    return toast.success(message, {
      description: opts.description,
      icon: opts.celebrate ? celebrateIcon(opts.celebrate) : <ShapeGlyph shape="arch" className="size-3.5 text-green" />,
      action: opts.action,
      duration: opts.duration,
      id: opts.id,
    });
  },
  error(err: unknown, opts: Omit<NotifyOptions, 'celebrate'> = {}) {
    const message = typeof err === 'string' ? err : errorMessage(err);
    return toast.error(message, {
      description: opts.description,
      icon: <ShapeGlyph shape="triangle" className="size-3.5 text-red" />,
      action: opts.action,
      duration: opts.duration ?? 6000,
      id: opts.id,
    });
  },
  info(message: ReactNode, opts: Omit<NotifyOptions, 'celebrate'> = {}) {
    return toast(message, {
      description: opts.description,
      icon: <ShapeGlyph shape="circle" className="size-3.5 text-blue" />,
      action: opts.action,
      duration: opts.duration,
      id: opts.id,
    });
  },
  warning(message: ReactNode, opts: Omit<NotifyOptions, 'celebrate'> = {}) {
    return toast.warning(message, {
      description: opts.description,
      icon: <ShapeGlyph shape="square" className="size-3.5 text-yellow" />,
      action: opts.action,
      duration: opts.duration,
      id: opts.id,
    });
  },
  promise<T>(p: Promise<T>, msgs: { loading: ReactNode; success: ReactNode | ((v: T) => ReactNode); error?: ReactNode | ((e: unknown) => ReactNode) }) {
    return toast.promise(p, {
      loading: msgs.loading,
      success: msgs.success,
      error: msgs.error ?? ((e: unknown) => errorMessage(e)),
    });
  },
  dismiss(id?: string | number) {
    toast.dismiss(id);
  },
};

/**
 * Themed toaster. Mounted once by the dashboard layout (admin pages outside it mount their own).
 * Also wires `useAdminMutation` success/error toasts.
 */
export function AdminToaster() {
  useEffect(() => {
    registerAdminNotifier({
      success: (m, o) => void notify.success(m, { celebrate: o?.celebrate }),
      error: (m) => void notify.error(m),
    });
    return () => registerAdminNotifier(null);
  }, []);
  return (
    <Toaster
      position="bottom-right"
      gap={8}
      offset={16}
      mobileOffset={12}
      visibleToasts={4}
      closeButton
      toastOptions={{
        classNames: {
          toast:
            'group !rounded-2xl !border !border-line !bg-white !px-4 !py-3 !font-[family-name:var(--font-body)] !text-[0.9375rem] !text-ink !shadow-[var(--shadow-3)] !gap-3',
          title: '!font-semibold !text-ink',
          description: '!text-ink-3 !text-[0.8125rem]',
          icon: '!m-0 !size-auto !flex !items-center !justify-center !min-w-4',
          actionButton: '!rounded-full !bg-ink !text-white !font-medium !px-3 !h-7',
          cancelButton: '!rounded-full !bg-surface-muted !text-ink-2',
          closeButton: '!border-line !bg-white !text-ink-3 hover:!text-ink',
        },
      }}
    />
  );
}
