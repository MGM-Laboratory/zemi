'use client';

import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tabs as RTabs } from 'radix-ui';
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/admin/cn';
import { CountBadge } from './badge';

export interface TabItem<V extends string = string> {
  value: V;
  label: ReactNode;
  icon?: ReactNode;
  count?: number;
  disabled?: boolean;
  /** Hidden tabs are not rendered at all (use for permissions). */
  hidden?: boolean;
  content?: ReactNode;
}

export interface TabsProps<V extends string = string> {
  value?: V;
  defaultValue?: V;
  onValueChange?: (value: V) => void;
  items: TabItem<V>[];
  className?: string;
  listClassName?: string;
  'aria-label'?: string;
}

const tabTrigger =
  'relative flex h-10 shrink-0 items-center gap-2 px-1 text-[0.9375rem] font-medium whitespace-nowrap text-ink-3 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4';

/**
 * In-page tabs (Radix). Content is rendered from `items[].content`.
 * For workspaces where each tab is a route, use `<TabNav>`.
 */
export function Tabs<V extends string = string>({ value, defaultValue, onValueChange, items, className, listClassName, 'aria-label': ariaLabel }: TabsProps<V>) {
  const visible = items.filter((i) => !i.hidden);
  const layoutId = useId();
  const reduce = useReducedMotion();
  const [inner, setInner] = useState<V | undefined>(defaultValue ?? visible[0]?.value);
  const current = value ?? inner;
  return (
    <RTabs.Root
      value={current}
      onValueChange={(v) => {
        setInner(v as V);
        onValueChange?.(v as V);
      }}
      className={className}
    >
      <RTabs.List aria-label={ariaLabel} className={cn('flex gap-6 overflow-x-auto border-b border-line no-scrollbar', listClassName)}>
        {visible.map((t) => (
          <RTabs.Trigger key={t.value} value={t.value} disabled={t.disabled} className={cn(tabTrigger, 'data-[state=active]:text-ink')}>
            {t.icon}
            {t.label}
            {t.count != null ? <CountBadge count={t.count} tone="neutral" /> : null}
            {current === t.value ? (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-ink"
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 36 }}
                aria-hidden="true"
              />
            ) : null}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
      {visible.map((t) =>
        t.content !== undefined ? (
          <RTabs.Content key={t.value} value={t.value} className="pt-5 outline-none focus-visible:outline-2 focus-visible:outline-focus">
            {t.content}
          </RTabs.Content>
        ) : null,
      )}
    </RTabs.Root>
  );
}

/* ------------------------------------------------------------------ TabNav (route based) */

export interface TabNavItem {
  /** Absolute href, like `/admin/events/123/registrations`. */
  href: string;
  label: ReactNode;
  icon?: ReactNode;
  count?: number;
  /** Hidden items are not rendered (use for permissions: `hidden: !ability.can(...)`). */
  hidden?: boolean;
  /** Only active on an exact match (the workspace root tab). */
  exact?: boolean;
  /** Pulsing red dot (stream is live). */
  live?: boolean;
}

/**
 * Route-based tabs for workspaces (event: Details, Registrations, Attendance, Stream, Media...).
 * Links are real links (middle-click, prefetch). Arrow keys move focus between tabs.
 *
 * @example
 * <TabNav aria-label="Event sections" items={[
 *   { href: adminRoutes.event(id), label: 'Details', exact: true },
 *   { href: adminRoutes.event(id, 'registrations'), label: 'Registrations', hidden: !ability.can('event', id, 'registrations.view') },
 * ]} />
 */
export function TabNav({ items, className, 'aria-label': ariaLabel }: { items: TabNavItem[]; className?: string; 'aria-label': string }) {
  const pathname = usePathname() ?? '';
  const visible = items.filter((i) => !i.hidden);
  const layoutId = useId();
  const reduce = useReducedMotion();
  const listRef = useRef<HTMLDivElement>(null);
  // The most specific match wins, so /events/1/registrations does not also light up /events/1.
  const activeHref =
    visible
      .filter((i) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`)))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    const links = Array.from(listRef.current?.querySelectorAll<HTMLAnchorElement>('a[data-tabnav]') ?? []);
    const idx = links.findIndex((l) => l === document.activeElement);
    if (idx < 0) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? links.length - 1 : (idx + (e.key === 'ArrowRight' ? 1 : -1) + links.length) % links.length;
    links[next]?.focus();
  };

  return (
    <nav aria-label={ariaLabel} className={className}>
      <div ref={listRef} onKeyDown={onKeyDown} className="flex gap-6 overflow-x-auto border-b border-line no-scrollbar">
        {visible.map((t) => {
          const active = t.href === activeHref;
          return (
            <Link
              key={t.href}
              href={t.href}
              data-tabnav=""
              aria-current={active ? 'page' : undefined}
              className={cn(tabTrigger, active && 'text-ink')}
              scroll={false}
            >
              {t.icon}
              {t.label}
              {t.live ? (
                <span className="relative flex size-2" aria-label="Live">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-red/70" />
                  <span className="relative inline-flex size-2 rounded-full bg-red" />
                </span>
              ) : null}
              {t.count != null ? <CountBadge count={t.count} tone="neutral" /> : null}
              {active ? (
                <motion.span
                  layoutId={layoutId}
                  className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-ink"
                  transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 36 }}
                  aria-hidden="true"
                />
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
