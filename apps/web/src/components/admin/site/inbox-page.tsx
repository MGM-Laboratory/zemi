'use client';

import { keepPreviousData, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContactMessage, ContactStatus, Paginated } from '@zemi/shared';
import { Archive, ArchiveRestore, Check, Copy, Mail, MailOpen, Reply, Trash2 } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Character } from '@/components/admin/characters/character';
import {
  Avatar,
  Badge,
  Button,
  DateText,
  EmptyState,
  ErrorState,
  Kbd,
  PageHeader,
  Pagination,
  SearchInput,
  Sheet,
  Skeleton,
  Tabs,
  notify,
  useConfirm,
  useCopy,
} from '@/components/admin/ui';
import { api, errorMessage } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { useHotkeys, useMediaQuery } from '@/lib/admin/hooks';
import { adminKeys } from '@/lib/admin/query-keys';

const VIEWS = ['open', 'new', 'read', 'replied', 'archived', 'all'] as const;
type View = (typeof VIEWS)[number];
const PAGE_SIZE = 25;

const VIEW_LABEL: Record<View, string> = { open: 'Open', new: 'New', read: 'Read', replied: 'Replied', archived: 'Archived', all: 'All' };

const STATUS_STYLE: Record<ContactStatus, { label: string; cls: string }> = {
  new: { label: 'New', cls: 'bg-blue text-white' },
  read: { label: 'Read', cls: 'bg-surface-muted text-ink-2' },
  replied: { label: 'Replied', cls: 'bg-green-50 text-green-600' },
  archived: { label: 'Archived', cls: 'border border-dashed border-line-strong text-ink-3' },
};

function snippet(text: string, n = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > n ? `${flat.slice(0, n - 3)}...` : flat;
}

/** mailto with "Re: <topic>", a greeting and the original message quoted (kept short for mail clients). */
export function replyHref(m: Pick<ContactMessage, 'name' | 'email' | 'topic' | 'message' | 'createdAt'>): string {
  const first = m.name.trim().split(/\s+/)[0] || 'there';
  const quoted = (m.message.length > 1200 ? `${m.message.slice(0, 1200)}...` : m.message)
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');
  const body = `Hi ${first},\n\n\n\nThe Zemi crew\n\n---\nYou wrote on the Zemi contact page:\n${quoted}`;
  return `mailto:${encodeURIComponent(m.email).replace('%40', '@')}?subject=${encodeURIComponent(`Re: ${m.topic || 'your message to Zemi'}`)}&body=${encodeURIComponent(body)}`;
}

/** /admin/inbox: messages from the contact page. Two panes on wide screens, a sheet on phones. */
export function InboxPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const wide = useMediaQuery('(min-width: 1024px)', true);
  const [params, setParams] = useQueryStates(
    {
      view: parseAsStringLiteral(VIEWS).withDefault('open'),
      q: parseAsString.withDefault(''),
      id: parseAsString.withDefault(''),
      page: parseAsInteger.withDefault(1),
    },
    { history: 'replace' },
  );

  const listQuery = { status: params.view, search: params.q || undefined, page: params.page, pageSize: PAGE_SIZE };
  const list = useQuery({
    queryKey: adminKeys.inbox.list(listQuery),
    queryFn: ({ signal }) => api.get<Paginated<ContactMessage>>('/admin/inbox', listQuery, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

  const countViews = ['new', 'open', 'archived'] as const;
  const counts = useQueries({
    queries: countViews.map((v) => ({
      queryKey: adminKeys.inbox.list({ count: v }),
      queryFn: ({ signal }: { signal: AbortSignal }) => api.get<Paginated<ContactMessage>>('/admin/inbox', { status: v, pageSize: 1 }, signal),
      staleTime: 30_000,
    })),
  });
  const count = (v: (typeof countViews)[number]) => counts[countViews.indexOf(v)]?.data?.total;

  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const selectedFromList = items.find((m) => m.id === params.id) ?? null;
  const detail = useQuery({
    queryKey: adminKeys.inbox.detail(params.id || 'none'),
    queryFn: ({ signal }) => api.get<ContactMessage>(`/admin/inbox/${params.id}`, undefined, signal),
    enabled: !!params.id && !selectedFromList,
    retry: false,
  });
  const selected = selectedFromList ?? detail.data ?? null;

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: adminKeys.inbox.all }),
      qc.invalidateQueries({ queryKey: adminKeys.inboxUnread() }),
      qc.invalidateQueries({ queryKey: adminKeys.overview() }),
    ]);

  const patchLocal = (id: string, status: ContactStatus) => {
    qc.setQueriesData<Paginated<ContactMessage>>({ queryKey: adminKeys.inbox.lists() }, (old) =>
      old && Array.isArray(old.items) ? { ...old, items: old.items.map((m) => (m.id === id ? { ...m, status } : m)) } : old,
    );
    qc.setQueryData<ContactMessage>(adminKeys.inbox.detail(id), (old) => (old ? { ...old, status } : old));
  };

  const setStatus = async (m: ContactMessage, status: ContactStatus, opts: { quiet?: boolean } = {}) => {
    if (m.status === status) return;
    const prev = m.status;
    patchLocal(m.id, status);
    try {
      await api.patch<ContactMessage>(`/admin/inbox/${m.id}`, { status });
      if (!opts.quiet) {
        const msg = { new: 'Marked as unread.', read: 'Marked as read.', replied: 'Marked as replied. Nice.', archived: 'Archived. Out of sight, still searchable.' }[status];
        notify.success(msg, { celebrate: status === 'replied' });
      }
    } catch (err) {
      patchLocal(m.id, prev);
      notify.error(errorMessage(err));
    } finally {
      void refresh();
    }
  };

  const remove = async (m: ContactMessage) => {
    const ok = await confirm({
      title: `Delete the message from ${m.name}?`,
      description: 'It is gone for good, including from search. Archive it instead if you might want it later.',
      confirmLabel: 'Delete message',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/admin/inbox/${m.id}`);
      notify.success('Deleted.');
      void setParams({ id: null });
      qc.removeQueries({ queryKey: adminKeys.inbox.detail(m.id) });
    } catch (err) {
      notify.error(errorMessage(err));
    } finally {
      void refresh();
    }
  };

  // Opening a new message marks it read (quietly). "Mark unread" is right there if that was too eager.
  const autoRead = useRef<string | null>(null);
  useEffect(() => {
    if (!selected || selected.status !== 'new' || autoRead.current === selected.id) return;
    autoRead.current = selected.id;
    const t = setTimeout(() => void setStatus(selected, 'read', { quiet: true }), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.status]);

  const open = (id: string | null) => void setParams({ id: id || null });
  const idx = items.findIndex((m) => m.id === params.id);
  // Keys belong to the confirm dialog while one is open: Escape there cancels the delete, it does not
  // also close the message, and `e` does not archive the message behind it.
  const unlessConfirming = (fn: () => unknown) => () => {
    if (document.querySelector('[role="alertdialog"]')) return;
    fn();
  };
  useHotkeys({
    j: unlessConfirming(() => items.length && open(items[Math.min(items.length - 1, idx + 1)]!.id)),
    k: unlessConfirming(() => items.length && open(items[Math.max(0, idx - 1)]!.id)),
    e: unlessConfirming(() => selected && void setStatus(selected, selected.status === 'archived' ? 'read' : 'archived')),
    u: unlessConfirming(() => selected && void setStatus(selected, 'new')),
    r: unlessConfirming(() => selected && window.location.assign(replyHref(selected))),
    escape: unlessConfirming(() => params.id && open(null)),
  });

  const unread = count('new');
  const tabs = VIEWS.map((v) => ({
    value: v,
    label: VIEW_LABEL[v],
    count: v === 'new' ? unread : v === 'open' ? count('open') : v === 'archived' ? count('archived') : undefined,
  }));

  const listPane = (
    <div className="min-w-0">
      <SearchInput
        className="mb-3"
        value={params.q}
        onValueChange={(q) => void setParams({ q, page: 1 })}
        placeholder="Search names, emails, messages"
        slashToFocus
        debounceMs={250}
      />
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} retrying={list.isFetching} size="sm" />
      ) : list.isPending ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[5.25rem] w-full" rounded="lg" />
          ))}
        </div>
      ) : items.length ? (
        <>
          <ul className={cn('space-y-1.5 transition-opacity', list.isPlaceholderData && 'opacity-60')} aria-label="Messages">
            <AnimatePresence initial={false}>
              {items.map((m) => (
                <MessageRow key={m.id} m={m} active={m.id === params.id} onOpen={() => open(m.id)} />
              ))}
            </AnimatePresence>
          </ul>
          {list.data.total > PAGE_SIZE ? (
            <Pagination className="mt-4" page={list.data.page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={(page) => void setParams({ page })} noun="messages" />
          ) : null}
        </>
      ) : (
        <EmptyState
          size="sm"
          title={params.q ? 'Nothing matches that' : params.view === 'new' || params.view === 'open' ? 'Inbox zero. Look at you.' : `No ${VIEW_LABEL[params.view].toLowerCase()} messages`}
          description={params.q ? 'Try a name, an email or a word from the message.' : 'New messages from the contact page land here.'}
          cast={[
            { shape: 'circle', mood: 'happy', size: 44 },
            { shape: 'square', mood: 'sleep', size: 36 },
          ]}
        />
      )}
    </div>
  );

  const detailPane = selected ? (
    <MessageDetail m={selected} onStatus={(s) => void setStatus(selected, s)} onDelete={() => void remove(selected)} />
  ) : params.id && detail.isError ? (
    <ErrorState error={detail.error} size="sm" action={<Button variant="secondary" onClick={() => open(null)}>Back to the list</Button>} />
  ) : params.id ? (
    <Skeleton className="h-96 w-full" rounded="lg" />
  ) : (
    <div className="flex h-full min-h-[24rem] flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line-strong p-8 text-center">
      <Character shape="circle" mood="look" size={48} follow />
      <p className="font-display text-lg font-extrabold [font-variation-settings:'CASL'_0.3]">Pick a message</p>
      <p className="max-w-xs text-sm text-ink-3">
        Or use <Kbd>j</Kbd> and <Kbd>k</Kbd> to walk through them, <Kbd>e</Kbd> to archive and <Kbd>r</Kbd> to reply.
      </p>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Inbox"
        description="Messages from the contact page. A real human reads every one, that is you."
        meta={unread ? <Badge tone="blue">{unread} new</Badge> : null}
      >
        <Tabs<View> aria-label="Filter by status" value={params.view} onValueChange={(v) => void setParams({ view: v, page: 1 })} items={tabs} className="mt-4" />
      </PageHeader>

      {wide ? (
        <div className="grid grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)] gap-6 2xl:grid-cols-[minmax(22rem,30rem)_minmax(0,1fr)]">
          {listPane}
          <div className="min-w-0">
            <div className="sticky top-[calc(var(--admin-topbar-h,60px)+1rem)]">{detailPane}</div>
          </div>
        </div>
      ) : (
        <>
          {listPane}
          <Sheet open={!!params.id} onOpenChange={(o) => !o && open(null)} title={selected ? selected.name : 'Message'} width="lg">
            {detailPane}
          </Sheet>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ row */

function MessageRow({ m, active, onOpen }: { m: ContactMessage; active: boolean; onOpen: () => void }) {
  const reduce = useReducedMotion();
  const isNew = m.status === 'new';
  return (
    <motion.li layout={!reduce} initial={false} exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}>
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'group relative flex w-full gap-3 rounded-2xl border p-3.5 text-left transition-[background-color,border-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
          active ? 'border-ink bg-white shadow-[0_0_0_1px_var(--color-ink)]' : 'border-line bg-white hover:border-line-strong hover:shadow-[var(--shadow-1)]',
          m.status === 'archived' && !active && 'bg-surface-muted/50',
        )}
      >
        <Avatar name={m.name} size={36} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn('truncate', isNew ? 'font-bold text-ink' : 'font-medium text-ink-2')}>{m.name}</span>
            <DateText value={m.createdAt} format="relative" className="shrink-0 text-xs text-ink-4" />
          </span>
          <span className="mt-0.5 flex items-center gap-1.5">
            {isNew ? <span className="size-2 shrink-0 rounded-full bg-blue" aria-label="Unread" role="img" /> : null}
            <span className={cn('truncate text-[0.8125rem]', isNew ? 'font-semibold text-ink-2' : 'text-ink-3')}>{m.topic}</span>
            {m.status === 'replied' ? <Check className="size-3.5 shrink-0 text-green-600" aria-label="Replied" /> : null}
          </span>
          <span className="mt-1 line-clamp-2 text-[0.8125rem] leading-snug text-ink-3">{snippet(m.message, 160)}</span>
        </span>
      </button>
    </motion.li>
  );
}

/* ------------------------------------------------------------------ detail */

function MessageDetail({ m, onStatus, onDelete }: { m: ContactMessage; onStatus: (s: ContactStatus) => void; onDelete: () => void }) {
  const [copy, copied] = useCopy();
  // Which message the "mark it replied?" nudge belongs to, so it goes away when you pick another one.
  const [nudgeFor, setNudgeFor] = useState<string | null>(null);
  const nudge = nudgeFor === m.id;
  const reduce = useReducedMotion();
  const s = STATUS_STYLE[m.status];

  return (
    <motion.article
      key={m.id}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      className="overflow-hidden rounded-[20px] border border-line bg-white sm:rounded-[var(--radius-card)]"
      aria-labelledby={`msg-${m.id}`}
    >
      <header className="border-b border-line p-4 sm:p-6">
        <div className="flex flex-wrap items-start gap-3">
          <Avatar name={m.name} size={44} />
          <div className="min-w-0 flex-1">
            <h2 id={`msg-${m.id}`} className="font-display text-xl leading-tight font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.3]">
              {m.name}
            </h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-ink-3">
              <a href={`mailto:${m.email}`} className="truncate text-blue-600 hover:underline">
                {m.email}
              </a>
              <button
                type="button"
                onClick={() => void copy(m.email).then((ok) => ok && notify.success('Email copied.'))}
                className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs text-ink-3 transition hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
              >
                {copied ? <Check className="size-3" aria-hidden="true" /> : <Copy className="size-3" aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </p>
          </div>
          <span className={cn('inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold', s.cls)}>{s.label}</span>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="label text-ink-4">Topic</dt>
            <dd className="mt-0.5 font-medium text-ink">{m.topic}</dd>
          </div>
          <div>
            <dt className="label text-ink-4">Sent</dt>
            <dd className="mt-0.5 text-ink">
              <DateText value={m.createdAt} format="datetime" />{' '}
              <span className="text-ink-3">
                (<DateText value={m.createdAt} format="relative" tooltip={false} />)
              </span>
            </dd>
          </div>
        </dl>
      </header>

      <div className="p-4 sm:p-6">
        <p className="max-w-[68ch] text-[1rem] leading-relaxed whitespace-pre-wrap break-words text-ink">{m.message}</p>
      </div>

      <AnimatePresence>
        {nudge && m.status !== 'replied' ? (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-green-50 px-4 py-3 sm:mx-6">
              <p className="text-sm text-ink-2">Sent it? Mark it as replied so nobody answers twice.</p>
              <Button size="sm" variant="primary" icon={<Check />} onClick={() => onStatus('replied')}>
                Mark replied
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <footer className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-muted/40 p-3 sm:px-6">
        <Button asChild size="sm" variant="primary" icon={<Reply />}>
          <a href={replyHref(m)} onClick={() => setNudgeFor(m.id)}>
            Reply by email
          </a>
        </Button>
        {m.status === 'new' ? (
          <Button size="sm" variant="secondary" icon={<MailOpen />} onClick={() => onStatus('read')}>
            Mark read
          </Button>
        ) : (
          <Button size="sm" variant="ghost" icon={<Mail />} onClick={() => onStatus('new')}>
            Mark unread
          </Button>
        )}
        {m.status !== 'replied' ? (
          <Button size="sm" variant="ghost" icon={<Check />} onClick={() => onStatus('replied')}>
            Mark replied
          </Button>
        ) : null}
        {m.status === 'archived' ? (
          <Button size="sm" variant="ghost" icon={<ArchiveRestore />} onClick={() => onStatus('read')}>
            Unarchive
          </Button>
        ) : (
          <Button size="sm" variant="ghost" icon={<Archive />} onClick={() => onStatus('archived')}>
            Archive
          </Button>
        )}
        <Button size="sm" variant="danger-soft" icon={<Trash2 />} onClick={onDelete} className="ml-auto">
          Delete
        </Button>
      </footer>
    </motion.article>
  );
}
