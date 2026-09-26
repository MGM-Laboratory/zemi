'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useConfirm } from '@/components/admin/ui/confirm-dialog';

/**
 * Warn before leaving with unsaved changes:
 * - closing or reloading the tab (`beforeunload`, the browser's own prompt)
 * - clicking any in-app link (TabNav, sidebar, breadcrumbs): a friendly confirm first
 *
 * Browser back/forward is not intercepted (the App Router has no blocking API); the local
 * draft autosave covers that case.
 */
export function useUnsavedChangesGuard(dirty: boolean, opts: { message?: string } = {}) {
  const confirm = useConfirm();
  const router = useRouter();
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  });

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Some browsers still want a return value.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      if (
        !dirtyRef.current ||
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (
        !a ||
        a.target === '_blank' ||
        a.hasAttribute('download') ||
        a.dataset.skipUnsavedGuard !== undefined
      )
        return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search)
        return;
      e.preventDefault();
      e.stopPropagation();
      void confirm({
        title: 'Leave without saving?',
        description:
          opts.message ??
          'You have changes on this page that are not saved yet. If you leave now, they stay in a local draft on this device, but nobody else sees them.',
        confirmLabel: 'Leave anyway',
        cancelLabel: 'Stay here',
      }).then((ok) => {
        if (ok) {
          dirtyRef.current = false;
          router.push(url.pathname + url.search + url.hash);
        }
      });
    };
    // Capture phase, so we get there before Next's <Link> handler.
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [dirty, confirm, router, opts.message]);
}
