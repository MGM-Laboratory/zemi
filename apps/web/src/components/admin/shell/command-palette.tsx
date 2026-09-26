'use client';

import { useQuery } from '@tanstack/react-query';
import { EVENT_STATUS_LABEL, formatJakarta, type EventAdminRow, type Paginated, type SpeakerRef } from '@zemi/shared';
import { Command } from 'cmdk';
import { ArrowRight, BookOpen, CalendarPlus, ExternalLink, Keyboard, LogOut, PanelLeft, Search, UserPlus } from 'lucide-react';
import { Dialog as RDialog } from 'radix-ui';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAbility } from '@/lib/admin/ability';
import { adminFetch, isApiError } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { useDebouncedValue } from '@/lib/admin/hooks';
import { adminRoutes, flattenNav, visibleNav } from '@/lib/admin/nav';
import { adminKeys } from '@/lib/admin/query-keys';
import { confirmLeave } from '@/lib/admin/leave-guard';
import { Avatar } from '../ui/media';
import { Kbd } from '../ui/media';
import { Spinner } from '../ui/spinner';
import { NavIcon } from './nav-icons';

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleSidebar?: () => void;
  onShowShortcuts?: () => void;
  onLogout?: () => void;
}

interface PubLookup {
  id: string;
  title: string;
  type?: string | null;
  publishedYear?: number | null;
}

/** Lookups may return an array or a Paginated page; 403/404 mean "not available" (empty). */
async function lookup<T>(path: string, query: Record<string, string | number>, signal: AbortSignal): Promise<T[]> {
  try {
    const res = await adminFetch<T[] | Paginated<T> | { items: T[] }>(path, { query, signal });
    if (Array.isArray(res)) return res;
    return res?.items ?? [];
  } catch (err) {
    if (isApiError(err) && (err.isForbidden || err.isNotFound || err.isValidation)) return [];
    throw err;
  }
}

const itemCls =
  'group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[0.9375rem] text-ink outline-none select-none data-[selected=true]:bg-surface-muted data-[disabled=true]:opacity-40';

function Item({ onSelect, icon, children, hint, value, keywords }: { onSelect: () => void; icon?: ReactNode; children: ReactNode; hint?: ReactNode; value: string; keywords?: string[] }) {
  return (
    <Command.Item value={value} keywords={keywords} onSelect={onSelect} className={itemCls}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-ink-3 group-data-[selected=true]:border-line-strong group-data-[selected=true]:text-ink [&_svg]:size-[18px]">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint ? <span className="shrink-0 text-xs text-ink-3">{hint}</span> : null}
      <ArrowRight className="size-4 shrink-0 text-ink-4 opacity-0 transition-opacity group-data-[selected=true]:opacity-100" aria-hidden="true" />
    </Command.Item>
  );
}

const groupCls =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[0.6875rem] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-ink-3';

/** Every word of the query appears in the label or keywords (order free). Empty query matches all. */
function matches(query: string, label: string, keywords: string[] = []) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${label} ${keywords.join(' ')}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

/**
 * Cmd/Ctrl+K palette: jump anywhere, quick actions, and search events, speakers and
 * publications (whatever the principal can see). Endpoints that are not there yet are ignored.
 */
export function CommandPalette({ open, onOpenChange, onToggleSidebar, onShowShortcuts, onLogout }: CommandPaletteProps) {
  const router = useRouter();
  const ability = useAbility();
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim(), 200);
  const searching = q.length >= 2;

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const allNav = useMemo(() => flattenNav(visibleNav(ability)), [ability]);
  const nav = allNav.filter((n) => matches(query, `${n.parent?.label ?? ''} ${n.label}`, n.keywords));
  const actions = [
    ability.has('events.create') && { key: 'new-event', label: 'New event', keywords: ['create', 'add', 'friday'] },
    ability.has('speakers.create') && { key: 'new-speaker', label: 'New speaker', keywords: ['create', 'add', 'person'] },
    ability.has('publications.create') && { key: 'new-publication', label: 'New publication', keywords: ['create', 'add', 'paper'] },
    { key: 'view-site', label: 'View the public site', keywords: ['public', 'open'] },
    onToggleSidebar && { key: 'toggle-sidebar', label: 'Toggle sidebar', keywords: ['collapse', 'expand'] },
    onShowShortcuts && { key: 'shortcuts', label: 'Keyboard shortcuts', keywords: ['help', 'keys', 'hotkeys'] },
    onLogout && { key: 'logout', label: 'Log out', keywords: ['sign out', 'exit'] },
  ].filter((a): a is { key: string; label: string; keywords: string[] } => Boolean(a) && matches(query, (a as { label: string }).label, (a as { keywords: string[] }).keywords));
  const show = (key: string) => actions.some((a) => a.key === key);

  const canEvents = ability.canAny('event', 'view');
  const canSpeakers = ability.canAny('speaker', 'view');
  const canPubs = ability.canAny('publication', 'view');

  const events = useQuery({
    queryKey: [...adminKeys.search(q), 'events'],
    queryFn: ({ signal }) => lookup<EventAdminRow>('/admin/events', { search: q, pageSize: 5 }, signal),
    enabled: open && searching && canEvents,
    retry: false,
    staleTime: 30_000,
  });
  const speakers = useQuery({
    queryKey: [...adminKeys.search(q), 'speakers'],
    queryFn: ({ signal }) => lookup<SpeakerRef>('/admin/speakers/lookup', { q }, signal),
    enabled: open && searching && canSpeakers,
    retry: false,
    staleTime: 30_000,
  });
  const pubs = useQuery({
    queryKey: [...adminKeys.search(q), 'publications'],
    queryFn: ({ signal }) => lookup<PubLookup>('/admin/publications/lookup', { q }, signal),
    enabled: open && searching && canPubs,
    retry: false,
    staleTime: 30_000,
  });
  const loading = searching && (events.isFetching || speakers.isFetching || pubs.isFetching);
  const failed = searching && (events.isError || speakers.isError || pubs.isError);

  // Keep the highlight on the first row as results arrive (cmdk only does this when it filters).
  const [selected, setSelected] = useState('');
  // Typing a page name ("speak", "Venues") should land on the page, not on a search hit that
  // happens to contain the word: then "Go to" moves above the search results.
  const typed = query.trim().toLowerCase();
  const navHit = typed.length >= 2 ? nav.find((n) => n.label.toLowerCase().startsWith(typed)) : undefined;
  const navFirst = Boolean(navHit);
  const firstValue =
    (navHit && `go ${navHit.parent ? `${navHit.parent.label} ` : ''}${navHit.label}`) ||
    (searching && events.data?.[0] && `event ${events.data[0].id} ${events.data[0].title}`) ||
    (searching && speakers.data?.[0] && `speaker ${speakers.data[0].id} ${speakers.data[0].fullName}`) ||
    (searching && pubs.data?.[0] && `publication ${pubs.data[0].id} ${pubs.data[0].title}`) ||
    (nav[0] && `go ${nav[0].parent ? `${nav[0].parent.label} ` : ''}${nav[0].label}`) ||
    '';
  useEffect(() => {
    // cmdk 1.x compares values as they are (no lowercasing), so keep the case or nothing is
    // highlighted and Enter does nothing.
    setSelected(firstValue);
  }, [firstValue]);

  const go = (href: string) => {
    onOpenChange(false);
    void confirmLeave().then((ok) => ok && router.push(href));
  };
  const run = (fn?: () => void) => {
    onOpenChange(false);
    fn?.();
  };

  const navGroup = nav.length ? (
              <Command.Group heading="Go to" className={groupCls}>
                {nav.map((n) => (
                  <Item
                    key={n.key}
                    value={`go ${n.parent ? `${n.parent.label} ` : ''}${n.label}`}
                    keywords={n.keywords}
                    icon={<NavIcon name={n.icon ?? n.parent?.icon ?? 'overview'} />}
                    hint={n.shortcut ? <Kbd>{n.shortcut.toUpperCase()}</Kbd> : n.parent ? n.parent.label : undefined}
                    onSelect={() => go(n.href)}
                  >
                    {n.parent ? `${n.parent.label}: ${n.label}` : n.label}
                  </Item>
                ))}
              </Command.Group>
              ) : null;

  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-[60] bg-[rgba(14,17,22,0.28)] backdrop-blur-[2px] data-[state=open]:animate-[zemi-fade-in_160ms_var(--ease-out)]" />
        <RDialog.Content
          className="fixed top-[max(1rem,10vh)] left-1/2 z-[60] w-[min(40rem,calc(100vw-1.5rem))] -translate-x-1/2 overflow-hidden rounded-[22px] border border-line bg-white shadow-[var(--shadow-3)] outline-none data-[state=open]:animate-[zemi-dialog-in_200ms_var(--ease-out)]"
          aria-describedby={undefined}
        >
          <RDialog.Title className="sr-only">Command palette</RDialog.Title>
          {/* Filtering is ours (shouldFilter false) so server results stay on top, in API order. */}
          <Command label="Command palette" loop shouldFilter={false} value={selected} onValueChange={setSelected} className="flex max-h-[min(34rem,75dvh)] flex-col">
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="size-5 shrink-0 text-ink-4" aria-hidden="true" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Jump to a page, or search events, speakers, papers"
                className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-4"
              />
              {loading ? <Spinner size={16} label="Searching" /> : <Kbd>esc</Kbd>}
            </div>
            <Command.List className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
              <Command.Empty className="px-4 py-10 text-center text-sm text-ink-3">
                {loading ? 'Looking...' : searching ? `Nothing for "${q}". Try a different word?` : 'Nothing matches that.'}
              </Command.Empty>

              {navFirst ? navGroup : null}
              {searching && (events.data?.length ?? 0) > 0 ? (
                <Command.Group heading="Events" className={groupCls}>
                  {events.data!.map((e) => (
                    <Item
                      key={e.id}
                      value={`event ${e.id} ${e.title}`}
                      keywords={[q]}
                      icon={<NavIcon name="events" />}
                      hint={`${e.number != null ? `#${e.number} · ` : ''}${formatJakarta(e.startsAt, 'date')} · ${EVENT_STATUS_LABEL[e.status]}`}
                      onSelect={() => go(adminRoutes.event(e.id))}
                    >
                      {e.title}
                    </Item>
                  ))}
                </Command.Group>
              ) : null}
              {searching && (speakers.data?.length ?? 0) > 0 ? (
                <Command.Group heading="Speakers" className={groupCls}>
                  {speakers.data!.map((s) => (
                    <Command.Item key={s.id} value={`speaker ${s.id} ${s.fullName}`} keywords={[q]} onSelect={() => go(adminRoutes.speaker(s.id))} className={itemCls}>
                      <Avatar name={s.fullName} image={s.avatar} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{s.fullName}</span>
                        {s.headline || s.defaultOrganization ? (
                          <span className="block truncate text-xs text-ink-3">{s.headline ?? s.defaultOrganization}</span>
                        ) : null}
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-ink-4 opacity-0 group-data-[selected=true]:opacity-100" aria-hidden="true" />
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              {searching && (pubs.data?.length ?? 0) > 0 ? (
                <Command.Group heading="Publications" className={groupCls}>
                  {pubs.data!.map((p) => (
                    <Item key={p.id} value={`publication ${p.id} ${p.title}`} keywords={[q]} icon={<NavIcon name="publications" />} hint={p.publishedYear ?? undefined} onSelect={() => go(adminRoutes.publication(p.id))}>
                      {p.title}
                    </Item>
                  ))}
                </Command.Group>
              ) : null}
              {failed ? <div className="px-4 py-2 text-xs text-ink-3">Search is having a moment. Pages still work.</div> : null}

              {navFirst ? null : navGroup}

              {actions.length ? (
              <Command.Group heading="Do something" className={groupCls}>
                {show('new-event') ? (
                  <Item value="new event" keywords={['create', 'add', 'friday']} icon={<CalendarPlus />} onSelect={() => go(adminRoutes.newEvent)}>
                    New event
                  </Item>
                ) : null}
                {show('new-speaker') ? (
                  <Item value="new speaker" keywords={['create', 'add', 'person']} icon={<UserPlus />} onSelect={() => go(adminRoutes.newSpeaker)}>
                    New speaker
                  </Item>
                ) : null}
                {show('new-publication') ? (
                  <Item value="new publication" keywords={['create', 'add', 'paper']} icon={<BookOpen />} onSelect={() => go(adminRoutes.newPublication)}>
                    New publication
                  </Item>
                ) : null}
                {show('view-site') ? (
                  <Item value="view site" keywords={['public', 'open']} icon={<ExternalLink />} onSelect={() => run(() => window.open('/', '_blank', 'noopener'))}>
                    View the public site
                  </Item>
                ) : null}
                {show('toggle-sidebar') ? (
                  <Item value="toggle sidebar" keywords={['collapse', 'expand']} icon={<PanelLeft />} hint={<Kbd>[</Kbd>} onSelect={() => run(onToggleSidebar)}>
                    Toggle sidebar
                  </Item>
                ) : null}
                {show('shortcuts') ? (
                  <Item value="keyboard shortcuts" keywords={['help', 'keys', 'hotkeys']} icon={<Keyboard />} hint={<Kbd>?</Kbd>} onSelect={() => run(onShowShortcuts)}>
                    Keyboard shortcuts
                  </Item>
                ) : null}
                {show('logout') ? (
                  <Item value="log out" keywords={['sign out', 'exit']} icon={<LogOut />} onSelect={() => run(onLogout)}>
                    Log out
                  </Item>
                ) : null}
              </Command.Group>
              ) : null}
            </Command.List>
            <div className={cn('flex items-center gap-4 border-t border-line bg-surface-muted/60 px-4 py-2 text-xs text-ink-3')}>
              <span className="flex items-center gap-1.5">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> move
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd>↵</Kbd> open
              </span>
              <span className="ml-auto hidden sm:inline">Type two letters to search content</span>
            </div>
          </Command>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
