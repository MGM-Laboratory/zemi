'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { useConfirm } from '@/components/admin/ui';

/**
 * Warn before leaving a form with unsaved changes.
 * - Tab close / reload / typed URL: the browser's own "Leave site?" prompt (beforeunload).
 * - In-app links (sidebar, breadcrumbs, back links): a friendly confirm, then the navigation.
 *   The App Router has no navigation blocker, so a capture-phase click listener intercepts
 *   same-origin anchors before Next's <Link> sees them.
 * Returns `release()` to call right before a programmatic navigation you want to allow
 * (like going to the new record after a create).
 */
export function useDirtyGuard(dirty: boolean) {
  const confirm = useConfirm();
  const router = useRouter();
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      // Older browsers need returnValue set to show the prompt.
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as Element | null;
      const a = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download') || a.dataset.skipDirtyGuard !== undefined) return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      void confirm({
        title: 'Leave without saving?',
        description: 'Your changes on this page are not saved yet. If you go now, they are gone.',
        confirmLabel: 'Leave anyway',
        cancelLabel: 'Keep editing',
        destructive: true,
      }).then((ok) => {
        if (!ok) return;
        dirtyRef.current = false;
        router.push(`${url.pathname}${url.search}${url.hash}`);
      });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [confirm, router]);

  return {
    release: useCallback(() => {
      dirtyRef.current = false;
    }, []),
  };
}
