'use client';

import type { AdminSummary, Capability } from '@zemi/shared';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button, EmptyState } from '@/components/admin/ui';
import { useAbility } from '@/lib/admin/ability';
import { cn } from '@/lib/admin/cn';
import { formatCountdown, formatRelative } from '@/lib/admin/format';
import { useNow } from '@/lib/admin/hooks';
import { adminRoutes } from '@/lib/admin/nav';

/* ------------------------------------------------------------------ gate */

/**
 * Client gate for pages the nav hides. The server enforces everything anyway; this only keeps a
 * typed URL from landing on a page full of 403s.
 */
export function AccessGate({
  cap,
  title,
  description = 'You are signed in, this part of the studio just is not yours. If you think it should be, ask the superadmin.',
  children,
}: {
  /** Without `cap` the page is superadmin only. The superadmin passes every capability check. */
  cap?: Capability;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  const ability = useAbility();
  const ok = cap ? ability.has(cap) : ability.isSuperadmin;
  if (ok) return <>{children}</>;
  return <NoAccess title={title ?? (cap ? 'This part is not in your access.' : 'This room is superadmin only.')} description={description} />;
}

export function NoAccess({ title, description }: { title: ReactNode; description?: ReactNode }) {
  return (
    <div className="py-6 sm:py-12">
      <EmptyState
        size="lg"
        title={title}
        description={description}
        cast={[
          { shape: 'triangle', mood: 'oops', size: 52 },
          { shape: 'square', mood: 'closed', size: 44 },
        ]}
        action={
          <Button asChild variant="secondary">
            <Link href={adminRoutes.overview}>Back to the overview</Link>
          </Button>
        }
      />
    </div>
  );
}

/* ------------------------------------------------------------------ admin status */

const STATUS_STYLE: Record<AdminSummary['status'], { label: string; cls: string; dot: string }> = {
  active: { label: 'Active', cls: 'bg-green-50 text-green-600', dot: 'bg-green' },
  expired: { label: 'Expired', cls: 'bg-surface-muted text-ink-3', dot: 'bg-ink-4' },
  disabled: { label: 'Switched off', cls: 'bg-red-50 text-[#b42525]', dot: 'bg-red' },
};

export function AdminStatusChip({ status, className }: { status: AdminSummary['status']; className?: string }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap', s.cls, className)}>
      <span className={cn('size-1.5 rounded-full', s.dot)} aria-hidden="true" />
      {s.label}
    </span>
  );
}

/** "Ends in 3 days" / "Ended 2 days ago" / "No end date", ticking every minute. Red under 3 days. */
export function ExpiryHint({ expiresAt, className }: { expiresAt: string | null; className?: string }) {
  const now = useNow(60_000);
  if (!expiresAt) return <span className={cn('text-ink-3', className)}>No end date</span>;
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (ms <= 0) return <span className={cn('text-ink-3', className)}>Ended {formatRelative(expiresAt, now)}</span>;
  const soon = ms < 3 * 86_400_000;
  return (
    <span className={cn(soon ? 'font-medium text-red-600' : 'text-ink-3', className)}>
      Ends {ms < 86_400_000 ? `in ${formatCountdown(expiresAt, now)}` : formatRelative(expiresAt, now)}
    </span>
  );
}

/* ------------------------------------------------------------------ user agents */

/** "Chrome on macOS". Good enough to tell your laptop from your phone. */
export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /HeadlessChrome/.test(ua)
          ? 'Headless Chrome'
          : /Chrome\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : /curl\//i.test(ua)
                ? 'curl'
                : 'A browser';
  const os = /iPhone|iPad|iPod/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X|Macintosh/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  return os ? `${browser} on ${os}` : browser;
}

export function isMobileAgent(ua: string | null | undefined): boolean {
  return !!ua && /iPhone|iPad|iPod|Android|Mobile/.test(ua);
}
