'use client';

import { SHAPE_PATHS_46 } from '@zemi/shared';
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/admin/cn';
import { isActivePath, type AdminNavGroup, type AdminNavItem } from '@/lib/admin/nav';
import { AdminMark } from '../brand/admin-mark';
import { AdminWordmark } from '../brand/admin-wordmark';
import { CountBadge } from '../ui/badge';
import { Kbd } from '../ui/media';
import { Tooltip } from '../ui/tooltip';
import { NAV_ACCENT, NavIcon } from './nav-icons';

export interface SidebarProps {
  groups: AdminNavGroup[];
  pathname: string;
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
  inboxUnread?: number | null;
  /** Rendered in the drawer on phones (no collapse control). */
  variant?: 'rail' | 'drawer';
  extraFooter?: React.ReactNode;
}

function isItemActive(pathname: string, item: AdminNavItem): boolean {
  if (isActivePath(pathname, item)) return true;
  return (item.children ?? []).some((c) => isActivePath(pathname, c));
}

export function Sidebar({ groups, pathname, collapsed, onToggleCollapsed, onNavigate, inboxUnread, variant = 'rail', extraFooter }: SidebarProps) {
  const reduce = useReducedMotion();
  const rail = variant === 'rail' && collapsed;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn('flex h-[var(--admin-topbar-h)] shrink-0 items-center gap-2.5', rail ? 'justify-center px-2' : 'px-5')}>
        <Link href="/admin" onClick={onNavigate} className="group flex items-center gap-2.5 rounded-xl p-1 -m-1" aria-label="Zemi admin, overview">
          <HoverMark />
          {rail ? null : (
            <span className="flex items-baseline gap-2">
              <AdminWordmark className="text-[1.45rem]" />
              <span className="label rounded-full bg-surface-muted px-1.5 py-0.5 text-[0.625rem] text-ink-3">Studio</span>
            </span>
          )}
        </Link>
      </div>

      <nav aria-label="Admin" className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4', rail ? 'px-2.5' : 'px-3')}>
        <LayoutGroup id={`nav-${variant}`}>
        {groups.map((g, gi) => (
          <div key={g.key} className={cn(gi > 0 && 'mt-5')}>
            {g.label ? (
              rail ? (
                <div className="mx-auto mb-2 h-px w-6 bg-line" aria-hidden="true" />
              ) : (
                <div className="label mb-1.5 px-3 text-[0.6875rem] text-ink-4">{g.label}</div>
              )
            ) : null}
            <ul className="space-y-0.5">
              {g.items.map((item) => (
                <NavRow
                  key={item.key}
                  item={item}
                  pathname={pathname}
                  rail={rail}
                  reduce={Boolean(reduce)}
                  onNavigate={onNavigate}
                  badge={item.badge === 'inbox' ? (inboxUnread ?? 0) : 0}
                />
              ))}
            </ul>
          </div>
        ))}
        </LayoutGroup>
      </nav>

      <div className={cn('shrink-0 border-t border-line py-3', rail ? 'px-2.5' : 'px-3')}>
        {extraFooter}
        {variant === 'rail' && onToggleCollapsed ? (
          <Tooltip content={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} side="right" shortcut="[">
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
              className={cn(
                'flex h-9 w-full items-center gap-3 rounded-xl text-sm text-ink-3 transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus',
                rail ? 'justify-center' : 'px-3',
              )}
            >
              {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
              {rail ? null : (
                <>
                  <span className="flex-1 text-left">Collapse</span>
                  <Kbd>[</Kbd>
                </>
              )}
            </button>
          </Tooltip>
        ) : null}
      </div>
    </div>
  );
}

function HoverMark() {
  const [variant, setVariant] = useState<'idle' | 'cheer'>('idle');
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (t.current) clearTimeout(t.current);
  }, []);
  return (
    <span
      onPointerEnter={() => {
        setVariant('cheer');
        if (t.current) clearTimeout(t.current);
        t.current = setTimeout(() => setVariant('idle'), 950);
      }}
    >
      <AdminMark size={28} variant={variant} />
    </span>
  );
}

function NavRow({
  item,
  pathname,
  rail,
  reduce,
  onNavigate,
  badge,
}: {
  item: AdminNavItem;
  pathname: string;
  rail: boolean;
  reduce: boolean;
  onNavigate?: () => void;
  badge: number;
}) {
  const active = isItemActive(pathname, item);
  const selfActive = isActivePath(pathname, item) && (item.exact || !(item.children ?? []).some((c) => isActivePath(pathname, c)));
  const hasChildren = Boolean(item.children?.length);
  const [openManual, setOpenManual] = useState<boolean | null>(null);
  const open = hasChildren && (openManual ?? active);
  const accent = item.icon ? NAV_ACCENT[item.icon] : undefined;

  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={selfActive ? 'page' : undefined}
      className={cn(
        'group relative flex h-10 items-center gap-3 rounded-xl text-[0.9375rem] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus',
        rail ? 'w-full justify-center' : 'min-w-0 flex-1 pr-2.5 pl-3',
        active ? 'bg-surface-muted text-ink' : 'text-ink-2 hover:bg-surface-muted/70 hover:text-ink',
      )}
    >
      {/* Always rendered (the server cannot know about reduced motion, so a conditional span broke
          hydration); reduced motion only drops the shared-layout slide. */}
      {active ? (
        <motion.span layoutId={reduce ? undefined : 'zemi-nav-active'} className="absolute inset-0 rounded-xl bg-surface-muted" transition={{ type: 'spring', stiffness: 460, damping: 38 }} />
      ) : null}
      <span className="relative flex size-6 shrink-0 items-center justify-center">
        {item.icon ? (
          <NavIcon name={item.icon} size={20} className={cn('transition-transform duration-300 group-hover:rotate-[-6deg]', active ? 'text-ink' : 'text-ink-3 group-hover:text-ink')} />
        ) : null}
        {active && accent ? (
          <svg viewBox="0 0 46 46" className="absolute -top-0.5 -right-1 size-2.5" aria-hidden="true">
            <path d={SHAPE_PATHS_46[accent.shape]} fill={accent.color} />
          </svg>
        ) : null}
      </span>
      {rail ? (
        badge ? <CountBadge count={badge} className="absolute top-1 right-1 h-4 min-w-4 text-[0.625rem]" /> : null
      ) : (
        <>
          <span className="relative min-w-0 flex-1 truncate">{item.label}</span>
          {badge ? <CountBadge count={badge} className="relative" /> : null}
        </>
      )}
    </Link>
  );

  return (
    <li>
      <div className="flex items-center gap-0.5">
        {rail ? (
          <Tooltip content={item.label} side="right" shortcut={item.shortcut?.toUpperCase()}>
            {link}
          </Tooltip>
        ) : (
          link
        )}
        {hasChildren && !rail ? (
          <button
            type="button"
            onClick={() => setOpenManual(!open)}
            aria-label={open ? `Hide ${item.label} pages` : `Show ${item.label} pages`}
            aria-expanded={open}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-4 transition hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
          >
            <ChevronDown className={cn('size-4 transition-transform duration-200', open && 'rotate-180')} />
          </button>
        ) : null}
      </div>
      <AnimatePresence initial={false}>
        {open && !rail ? (
          <motion.ul
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="relative ml-[1.45rem] overflow-hidden border-l border-line pl-3"
          >
            {item.children!.map((c) => {
              const on = isActivePath(pathname, c);
              return (
                <li key={c.key} className="py-px first:pt-1 last:pb-1">
                  <Link
                    href={c.href}
                    onClick={onNavigate}
                    aria-current={on ? 'page' : undefined}
                    className={cn(
                      'relative flex h-8 items-center rounded-lg px-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-focus',
                      on ? 'font-semibold text-ink' : 'text-ink-3 hover:bg-surface-muted/70 hover:text-ink',
                    )}
                  >
                    {on ? <span className="absolute top-1/2 -left-[13px] h-4 w-0.5 -translate-y-1/2 rounded-full bg-ink" aria-hidden="true" /> : null}
                    {c.label}
                  </Link>
                </li>
              );
            })}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </li>
  );
}
