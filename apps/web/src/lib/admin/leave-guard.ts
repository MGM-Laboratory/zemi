'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { useConfirm, type ConfirmOptions } from '@/components/admin/ui/confirm-dialog';

/**
 * Leave guards for the admin: "you are about to lose something, sure?".
 *
 * The App Router has no navigation blocker, so a guard covers each way out by hand:
 * - tab close, reload, typed URL: the browser's own prompt (`beforeunload`)
 * - in-app links (sidebar, breadcrumbs, back links): a capture-phase click listener that
 *   runs before Next's <Link>, asks, then navigates
 * - keyboard jumps (`g e`) and the command palette: they call `confirmLeave()` first
 * - the browser Back button (`backButton: true`): a same-URL history entry on top, so Back
 *   lands on this page again and we can ask; staying puts the entry back
 */

type Guard = { active: () => boolean; ask: () => Promise<boolean>; release: () => void };
const guards = new Set<Guard>();

/**
 * Ask every active guard before a programmatic navigation (shortcuts, palette).
 * Resolves true when nothing is at stake or the person said "leave".
 */
export async function confirmLeave(): Promise<boolean> {
  for (const g of [...guards]) {
    if (!g.active()) continue;
    if (!(await g.ask())) return false;
    g.release();
  }
  return true;
}

/** Register a guard with the shared registry (used by the page-level dirty guards). */
export function useRegisterLeaveGuard(active: () => boolean, ask: () => Promise<boolean>, release: () => void) {
  const ref = useRef({ active, ask, release });
  useEffect(() => {
    ref.current = { active, ask, release };
  });
  useEffect(() => {
    const g: Guard = {
      active: () => ref.current.active(),
      ask: () => ref.current.ask(),
      release: () => ref.current.release(),
    };
    guards.add(g);
    return () => void guards.delete(g);
  }, []);
}

export interface LeaveGuardOptions {
  /** The confirm dialog copy. */
  confirm: ConfirmOptions;
  /** Also catch the browser Back button (see above). Default false. */
  backButton?: boolean;
}

/**
 * Warn before leaving the page while `active`. Returns `release()` for a programmatic
 * navigation you want to let through (it switches the guard off until `active` flips again).
 *
 * @example
 * const guard = useLeaveGuard(Boolean(created) && !copied, { backButton: true, confirm: { title: 'Leave without copying?' } });
 */
export function useLeaveGuard(active: boolean, { confirm: copy, backButton = false }: LeaveGuardOptions) {
  const confirm = useConfirm();
  const router = useRouter();
  const activeRef = useRef(active);
  const copyRef = useRef(copy);
  const asking = useRef<Promise<boolean> | null>(null);
  useEffect(() => {
    activeRef.current = active;
    copyRef.current = copy;
  });

  const ask = useCallback(() => {
    // One dialog at a time, even if Back and a click race.
    asking.current ??= confirm({ destructive: true, ...copyRef.current }).finally(() => {
      asking.current = null;
    });
    return asking.current;
  }, [confirm]);
  // Set when someone chose to leave (or a caller let a navigation through): the page is on its
  // way out, so the Back-button entry must not be popped under the navigation.
  const released = useRef(false);
  const release = useCallback(() => {
    activeRef.current = false;
    released.current = true;
  }, []);

  useRegisterLeaveGuard(() => activeRef.current, ask, release);

  // Tab close, reload, typed URL, and in-app links.
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!activeRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      if (!activeRef.current || e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
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
      void ask().then((ok) => {
        if (!ok) return;
        release();
        router.push(`${url.pathname}${url.search}${url.hash}`);
      });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [active, ask, release, router]);

  // The browser Back button.
  const unmounted = useRef(false);
  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
    };
  }, []);
  useEffect(() => {
    if (!active || !backButton) return;
    const href = window.location.href;
    // Same URL, same Next router state: Back pops to this very page instead of leaving it.
    const arm = () => window.history.pushState(window.history.state, '', href);
    released.current = false;
    arm();
    let armed = true;
    let leaving = false;
    const onPop = () => {
      if (leaving || !armed || window.location.href !== href) return;
      armed = false;
      if (!activeRef.current) return;
      void ask().then((ok) => {
        if (ok) {
          leaving = true;
          activeRef.current = false;
          window.history.back();
        } else {
          arm();
          armed = true;
        }
      });
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Switched off while still here (the passphrase got copied): drop our extra entry, so the
      // next Back is not a press that seems to do nothing. Not on unmount: we already left.
      if (armed && !leaving && !released.current && !unmounted.current && window.location.href === href) {
        leaving = true;
        window.history.back();
      }
    };
  }, [active, backButton, ask]);

  return { release };
}
