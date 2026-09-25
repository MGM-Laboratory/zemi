'use client';

import { formatJakarta } from '@zemi/shared';
import { ExternalLink, Keyboard, LogOut, ShieldCheck, Sparkles } from 'lucide-react';
import { useMe } from '@/lib/admin/ability';
import { cn } from '@/lib/admin/cn';
import { principalRole } from '@/lib/admin/describe';
import { formatCountdown } from '@/lib/admin/format';
import { useNow } from '@/lib/admin/hooks';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Avatar } from '../ui/media';

export interface PrincipalMenuProps {
  onLogout: () => void;
  loggingOut?: boolean;
  onShowShortcuts?: () => void;
}

/** Avatar button with who you are, when your access and session end, and log out. */
export function PrincipalMenu({ onLogout, loggingOut, onShowShortcuts }: PrincipalMenuProps) {
  const me = useMe();
  const now = useNow(30_000);
  const p = me.principal;
  const adminExpires = p.kind === 'admin' ? p.expiresAt : null;
  const adminLeft = adminExpires ? formatCountdown(adminExpires, now) : '';
  const soon = adminExpires ? new Date(adminExpires).getTime() - now.getTime() < 3 * 86_400_000 : false;
  const sessionLeft = formatCountdown(me.session.expiresAt, now);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group relative flex items-center gap-2 rounded-full p-0.5 transition hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-focus sm:pr-3"
          aria-label={`Account: ${p.name}`}
        >
          <Avatar name={p.name} size={34} variant="shape" shape={p.kind === 'superadmin' ? 'triangle' : undefined} />
          <span className="hidden min-w-0 text-left leading-tight sm:block">
            <span className="block max-w-[10rem] truncate text-sm font-semibold text-ink">{p.name}</span>
            <span className={cn('block text-xs', soon ? 'font-medium text-red-600' : 'text-ink-3')}>
              {p.kind === 'superadmin' ? 'Every key' : `Admin${adminLeft ? ` · ${adminLeft} left` : ''}`}
            </span>
          </span>
          {soon ? <span className="absolute top-0 right-0 size-2.5 rounded-full bg-red ring-2 ring-white sm:hidden" aria-hidden="true" /> : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72" align="end">
        <div className="flex items-center gap-3 px-2.5 pt-2 pb-3">
          <Avatar name={p.name} size={40} variant="shape" shape={p.kind === 'superadmin' ? 'triangle' : undefined} />
          <div className="min-w-0">
            <div className="truncate font-semibold text-ink">{p.name}</div>
            <div className="flex items-center gap-1 text-xs text-ink-3">
              {p.kind === 'superadmin' ? <ShieldCheck className="size-3.5 text-red" aria-hidden="true" /> : null}
              {principalRole(me)}
            </div>
          </div>
        </div>
        <div className="mx-1 mb-1 rounded-xl bg-surface-muted px-3 py-2.5 text-[0.8125rem]">
          <dl className="space-y-1.5">
            {adminExpires ? (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-3">Access ends</dt>
                <dd className={cn('text-right font-medium tabular-nums', soon ? 'text-red-600' : 'text-ink')} title={`${formatJakarta(adminExpires, 'datetime')} WIB`}>
                  {adminLeft ? `in ${adminLeft}` : 'Expired'}
                </dd>
              </div>
            ) : p.kind === 'admin' ? (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-3">Access ends</dt>
                <dd className="font-medium text-ink">Never</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3">
              <dt className="text-ink-3">Session ends</dt>
              <dd className="text-right font-medium text-ink tabular-nums" title={`${formatJakarta(me.session.expiresAt, 'datetime')} WIB`}>
                {sessionLeft ? `in ${sessionLeft}` : 'Now'}
              </dd>
            </div>
          </dl>
          {/* me.session.expiresAt is the 7 day cap. The API also ends a session after 12 hours without activity. */}
          <p className="mt-1.5 text-xs text-ink-4">Sooner if you step away for 12 hours.</p>
        </div>
        <DropdownMenuItem href="/admin" icon={<Sparkles />}>
          What can I do here?
        </DropdownMenuItem>
        <DropdownMenuItem href="/" external icon={<ExternalLink />}>
          View the public site
        </DropdownMenuItem>
        {onShowShortcuts ? (
          <DropdownMenuItem icon={<Keyboard />} shortcut="?" onSelect={onShowShortcuts}>
            Keyboard shortcuts
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          icon={<LogOut />}
          destructive
          disabled={loggingOut}
          onSelect={(e) => {
            e.preventDefault();
            onLogout();
          }}
        >
          {loggingOut ? 'Logging out...' : 'Log out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
