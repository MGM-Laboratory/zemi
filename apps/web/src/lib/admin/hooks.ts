'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
} from '@tanstack/react-query';
import type { Asset } from '@zemi/shared';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { adminFetch, errorMessage, isAbortError, type ApiError } from './api';
import { adminKeys, invalidateKeys } from './query-keys';

/* ------------------------------------------------------------------ timing */

/** A value that only updates after `delay` ms without changes. */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** A debounced callback. The latest callback is always used. */
export function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, delay = 250) {
  const fnRef = useRef(fn);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    fnRef.current = fn;
  });
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return useCallback(
    (...args: A) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => fnRef.current(...args), delay);
    },
    [delay],
  );
}

/** A ticking clock. Default ticks every second; pass a larger interval for minute-level UIs. */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/* ------------------------------------------------------------------ environment */

export function useMediaQuery(query: string, serverFallback = false): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => serverFallback,
  );
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/** true after hydration. Use to avoid SSR mismatches for client-only values. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function isMac(): boolean {
  if (typeof navigator === 'undefined') return true;
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform;
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/* ------------------------------------------------------------------ hotkeys */

export interface HotkeyOptions {
  /** Fire even when focus is in an input, textarea, select or contenteditable. Default: only for combos with mod. */
  allowInInputs?: boolean;
  enabled?: boolean;
  preventDefault?: boolean;
}

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function matchCombo(e: KeyboardEvent, combo: string): boolean {
  const parts = combo.toLowerCase().split('+');
  const key = parts.pop()!;
  const want = {
    mod: parts.includes('mod'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    ctrl: parts.includes('ctrl'),
  };
  const mod = isMac() ? e.metaKey : e.ctrlKey;
  if (want.mod !== mod) return false;
  if (!want.mod && !want.ctrl && (e.metaKey || e.ctrlKey)) return false;
  if (want.ctrl && !e.ctrlKey) return false;
  if (want.alt !== e.altKey) return false;
  const pressed = e.key.toLowerCase();
  // Shift changes e.key for symbols ('/' becomes '?'), so only check shift for letters and named keys.
  if (key.length === 1 && !/[a-z0-9]/.test(key)) return pressed === key;
  if (want.shift !== e.shiftKey) return false;
  return pressed === key || e.code.toLowerCase() === `key${key}` || (key === 'esc' && pressed === 'escape');
}

/**
 * Keyboard shortcuts. Keys are combos ('mod+k', 'shift+n', '?', '[') or two-key
 * sequences separated by a space ('g e'). `mod` is Cmd on macOS and Ctrl elsewhere.
 *
 * @example useHotkeys({ 'mod+k': openPalette, 'g e': () => router.push('/admin/events') });
 */
export function useHotkeys(bindings: Record<string, (e: KeyboardEvent) => void>, opts: HotkeyOptions = {}) {
  const ref = useRef(bindings);
  useEffect(() => {
    ref.current = bindings;
  });
  const enabled = opts.enabled ?? true;
  const allowInInputs = opts.allowInInputs ?? false;
  const preventDefault = opts.preventDefault ?? true;
  useEffect(() => {
    if (!enabled) return;
    let pending: string | null = null;
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const editable = isEditable(e.target);
      for (const [combo, handler] of Object.entries(ref.current)) {
        const seq = combo.split(' ');
        const usesMod = combo.includes('mod+');
        if (editable && !allowInInputs && !usesMod) continue;
        if (seq.length === 2) {
          if (pending === seq[0] && matchCombo(e, seq[1]!)) {
            pending = null;
            if (preventDefault) e.preventDefault();
            handler(e);
            return;
          }
          continue;
        }
        if (matchCombo(e, combo)) {
          if (preventDefault) e.preventDefault();
          handler(e);
          return;
        }
      }
      // Remember a sequence leader ('g') for 900ms.
      const leaders = Object.keys(ref.current)
        .filter((c) => c.includes(' '))
        .map((c) => c.split(' ')[0]!);
      if (!editable && !e.metaKey && !e.ctrlKey && !e.altKey && leaders.includes(e.key.toLowerCase())) {
        pending = e.key.toLowerCase();
        if (pendingTimer) clearTimeout(pendingTimer);
        pendingTimer = setTimeout(() => (pending = null), 900);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (pendingTimer) clearTimeout(pendingTimer);
    };
  }, [enabled, allowInInputs, preventDefault]);
}

/* ------------------------------------------------------------------ assets */

/**
 * Poll an asset while it is processing. Stops when it is ready or failed.
 * Pass `null` to disable.
 */
export function useAssetPoll(assetId: string | null | undefined, opts: { intervalMs?: number; initial?: Asset | null } = {}) {
  return useQuery({
    queryKey: adminKeys.assets.detail(assetId ?? 'none'),
    queryFn: ({ signal }) => adminFetch<Asset>(`/admin/assets/${assetId}`, { signal }),
    enabled: Boolean(assetId),
    initialData: opts.initial && opts.initial.id === assetId ? opts.initial : undefined,
    // Stop on errors (403/404 mean the asset is gone or off limits), and once it is ready or failed.
    refetchInterval: (q) =>
      q.state.status === 'error' ? false : q.state.data?.status === 'processing' || !q.state.data ? (opts.intervalMs ?? 1500) : false,
    retry: false,
    staleTime: (q) => (q.state.data?.status === 'ready' ? 5 * 60_000 : 0),
  });
}

/* ------------------------------------------------------------------ mutations */

export interface AdminMutationOptions<TData, TVars, TContext = unknown>
  extends Omit<UseMutationOptions<TData, ApiError, TVars, TContext>, 'mutationFn'> {
  mutationFn: (vars: TVars) => Promise<TData>;
  /** Query keys to invalidate after success (prefix match). */
  invalidate?: readonly QueryKey[] | ((data: TData, vars: TVars) => readonly QueryKey[]);
  /** Toast on success. A string, a function, or false. */
  successMessage?: string | ((data: TData, vars: TVars) => string) | false;
  /** Cheering character on the success toast. */
  celebrate?: boolean;
  /** Toast on error. Default true (uses the API message). Field errors are usually shown inline instead. */
  errorToast?: boolean | ((err: ApiError) => string | false);
}

type Notifier = {
  success: (message: string, opts?: { celebrate?: boolean }) => void;
  error: (message: string) => void;
};
let notifier: Notifier | null = null;
/** Wired by the admin shell so lib code can toast without importing UI. */
export function registerAdminNotifier(n: Notifier | null) {
  notifier = n;
}

/**
 * `useMutation` with admin conventions: typed ApiError, invalidation, success/error toasts.
 *
 * @example
 * const save = useAdminMutation({
 *   mutationFn: (patch: EventUpdateInput) => api.patch<EventAdmin>(`/admin/events/${id}`, patch),
 *   invalidate: [adminKeys.events.detail(id)],
 *   successMessage: 'Saved.',
 * });
 */
export function useAdminMutation<TData = unknown, TVars = void, TContext = unknown>(
  options: AdminMutationOptions<TData, TVars, TContext>,
) {
  const qc = useQueryClient();
  const { invalidate, successMessage, celebrate, errorToast = true, onSuccess, onError, ...rest } = options;
  return useMutation<TData, ApiError, TVars, TContext>({
    ...rest,
    onSuccess: async (data, vars, onMutateResult, ctx) => {
      const keys = typeof invalidate === 'function' ? invalidate(data, vars) : invalidate;
      if (keys?.length) void invalidateKeys(qc, keys);
      if (successMessage) {
        const msg = typeof successMessage === 'function' ? successMessage(data, vars) : successMessage;
        notifier?.success(msg, { celebrate });
      }
      await onSuccess?.(data, vars, onMutateResult, ctx);
    },
    onError: async (err, vars, onMutateResult, ctx) => {
      if (!isAbortError(err) && errorToast) {
        const msg = typeof errorToast === 'function' ? errorToast(err) : errorMessage(err);
        if (msg) notifier?.error(msg);
      }
      await onError?.(err, vars, onMutateResult, ctx);
    },
  });
}
