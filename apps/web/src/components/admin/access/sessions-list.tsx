'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SessionSummary } from '@zemi/shared';
import { ChevronDown, LogOut, Monitor, Smartphone } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { Badge, Button, DateText, EmptyState, ErrorState, Skeleton, notify, useConfirm } from '@/components/admin/ui';
import { api, errorMessage, markSigningOut } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { adminKeys, invalidateKeys } from '@/lib/admin/query-keys';
import { describeUserAgent, isMobileAgent } from './access-ui';

const FOLD_AFTER = 6;

export function sessionsKey(owner: string) {
  return adminKeys.sessions.list({ owner });
}

export function useSessions(owner: string, enabled = true) {
  return useQuery({
    queryKey: sessionsKey(owner),
    queryFn: ({ signal }) => api.get<SessionSummary[]>(`/admin/admins/${encodeURIComponent(owner)}/sessions`, undefined, signal),
    enabled,
    staleTime: 15_000,
  });
}

/**
 * Live sessions of an admin (or of the superadmin with owner "superadmin"), each with a
 * "Sign out" button. Signing out your own current session ends up on the login page.
 */
export function SessionsList({ owner, name, className }: { owner: string; name: string; className?: string }) {
  const q = useSessions(owner);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const reduce = useReducedMotion();
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const revoke = async (s: SessionSummary) => {
    if (s.current) {
      const ok = await confirm({
        title: 'Sign out this device?',
        description: 'That is the browser you are using right now, so you will land on the login page.',
        confirmLabel: 'Sign me out',
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(s.id);
    try {
      if (s.current) markSigningOut();
      await api.delete(`/admin/sessions/${s.id}`);
      if (s.current) {
        // A full page load on purpose: it drops every cached admin query along with the session.
        window.location.replace('/admin/login?reason=signed-out');
        return;
      }
      notify.success(`Signed out. ${describeUserAgent(s.userAgent)} needs the passphrase again.`);
      await invalidateKeys(qc, [sessionsKey(owner), adminKeys.admins.all]);
    } catch (err) {
      notify.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const revokeAll = async () => {
    const list = (q.data ?? []).filter((s) => !s.current);
    if (!list.length) return;
    const ok = await confirm({
      title: owner === 'superadmin' ? 'Sign out your other devices?' : `Sign ${name} out everywhere?`,
      description:
        owner === 'superadmin'
          ? `Ends ${list.length} other ${list.length === 1 ? 'session' : 'sessions'}. This browser stays signed in.`
          : `Ends ${list.length} ${list.length === 1 ? 'session' : 'sessions'}. Their passphrase still works, so they can sign in again. Rotate it or switch them off to lock them out.`,
      confirmLabel: 'Sign out',
      destructive: true,
    });
    if (!ok) return;
    setBusy('all');
    // A few at a time, so a long list does not flood the API.
    let failed = 0;
    for (let i = 0; i < list.length; i += 6) {
      const results = await Promise.allSettled(list.slice(i, i + 6).map((s) => api.delete(`/admin/sessions/${s.id}`)));
      failed += results.filter((r) => r.status === 'rejected').length;
    }
    setBusy(null);
    if (failed) notify.error(`${failed} ${failed === 1 ? 'session' : 'sessions'} did not sign out. Try again?`);
    else notify.success('Signed out everywhere.');
    await invalidateKeys(qc, [sessionsKey(owner), adminKeys.admins.all]);
  };

  if (q.isPending) {
    return (
      <div className={cn('space-y-2', className)}>
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-[4.25rem] w-full" rounded="lg" />
        ))}
      </div>
    );
  }
  if (q.isError) return <ErrorState size="sm" error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} className={className} />;

  // This device first, then the most recently active. Long lists fold after a few rows.
  const sessions = [...q.data].sort((a, b) => Number(b.current) - Number(a.current) || b.lastSeenAt.localeCompare(a.lastSeenAt));
  const others = sessions.filter((s) => !s.current).length;
  const hidden = showAll ? 0 : Math.max(0, sessions.length - FOLD_AFTER);
  const shown = hidden ? sessions.slice(0, FOLD_AFTER) : sessions;

  return (
    <div className={cn('space-y-3', className)}>
      {sessions.length ? (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          <AnimatePresence initial={false}>
            {shown.map((s) => {
              const Icon = isMobileAgent(s.userAgent) ? Smartphone : Monitor;
              return (
                <motion.li
                  key={s.id}
                  layout={!reduce}
                  initial={false}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, x: 24, transition: { duration: 0.16 } }}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-ink-2" aria-hidden="true">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 basis-[12rem]">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                      {describeUserAgent(s.userAgent)}
                      {s.current ? (
                        <Badge size="sm" tone="green">
                          This device
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-[0.8125rem] text-ink-3">
                      {s.ip ? <span className="mono mr-2">{s.ip}</span> : null}
                      Signed in <DateText value={s.createdAt} format="relative" />, last seen <DateText value={s.lastSeenAt} format="relative" />
                    </p>
                  </div>
                  <p className="text-[0.8125rem] text-ink-3 max-sm:w-full">
                    Ends by <DateText value={s.expiresAt} format="datetime" />
                  </p>
                  <Button size="sm" variant="ghost" icon={<LogOut />} loading={busy === s.id} disabled={busy === 'all'} onClick={() => void revoke(s)}>
                    Sign out
                  </Button>
                </motion.li>
              );
            })}
          </AnimatePresence>
          {hidden || (showAll && sessions.length > FOLD_AFTER) ? (
            <li>
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                aria-expanded={showAll}
                className="flex w-full items-center justify-center gap-1.5 px-4 py-2.5 text-[0.8125rem] font-medium text-ink-2 transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
              >
                {showAll ? 'Show fewer' : `Show ${hidden} more ${hidden === 1 ? 'session' : 'sessions'}`}
                <ChevronDown className={cn('size-3.5 transition-transform', showAll && 'rotate-180')} aria-hidden="true" />
              </button>
            </li>
          ) : null}
        </ul>
      ) : (
        <EmptyState
          size="sm"
          title="No live sessions"
          description={owner === 'superadmin' ? 'Odd, since you are here. Refresh?' : `${name} is not signed in anywhere right now.`}
          cast={[{ shape: 'arch', mood: 'sleep', size: 40 }]}
        />
      )}
      {others > 0 ? (
        <div className="flex justify-end">
          <Button size="sm" variant="danger-soft" icon={<LogOut />} loading={busy === 'all'} onClick={() => void revokeAll()}>
            {owner === 'superadmin' ? 'Sign out other devices' : 'Sign out everywhere'}
          </Button>
        </div>
      ) : null}
      <p className="text-[0.8125rem] text-ink-3">Sessions end after 12 hours without activity, and after 7 days no matter what.</p>
    </div>
  );
}
