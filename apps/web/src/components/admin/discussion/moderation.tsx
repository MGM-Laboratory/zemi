'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Flag, MessageCircle, Pin, Search, UserX } from 'lucide-react';
import Link from 'next/link';
import type { Blocks } from '@zemi/shared';
import { BlocksRenderer } from '@/components/public/media/blocks-renderer';
import { api } from '@/lib/admin/api';
import { useAbility } from '@/lib/admin/ability';
import { notify } from '@/components/admin/ui/toast';
import { Select } from '@/components/admin/ui/select';
import { useConfirm } from '@/components/admin/ui/confirm-dialog';
import { useDebouncedValue } from '@/lib/admin/hooks';
import { markAdminStale } from '@/lib/admin/query-keys';

type State = 'open' | 'locked' | 'archived' | 'hidden' | 'deleted';
type Thread = { id: string; title: string; authorLabel: string; authorId: string | null; body: Blocks; bodyText: string; tags: string[]; status: State; pinned: boolean; flagged: boolean; score: number; commentCount: number; reportCount: number; createdAt: string; eventId: string | null };
type Comment = { id: string; authorLabel: string; authorId: string | null; body: string; status: 'visible' | 'hidden' | 'deleted'; score: number; reportCount: number; createdAt: string };
type Report = { id: string; targetType: 'thread' | 'comment'; targetId: string; reason: string; note: string | null; status: 'open' | 'resolved' | 'dismissed'; createdAt: string };
type Detail = { thread: Thread; comments: Comment[]; reports: Report[]; speaker?: { id: string; fullName: string; slug: string } | null };
type Page = { items: Thread[]; total: number; page: number; pageSize: number };
type Participant = { id: string; name: string; tag: string; status: 'active' | 'suspended'; createdAt: string };
type PeoplePage = { items: Participant[]; total: number; page: number; pageSize: number };
const date = (value: string) => new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).format(new Date(value));
const states: State[] = ['open', 'locked', 'archived', 'hidden', 'deleted'];

export function Moderation({ id }: { id?: string }) {
  const ability = useAbility();
  const confirm = useConfirm();
  const allowed = ability.has('discussion.view') || ability.has('discussion.manage');
  const canManage = ability.has('discussion.manage');
  const [status, setStatus] = useState('all');
  const [mode, setMode] = useState<'threads' | 'participants'>('threads');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<Page | null>(null);
  const [people, setPeople] = useState<PeoplePage | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);

  const qc = useQueryClient();
  // One request per pause in typing, and only the newest answer may land (no out-of-order lists).
  const query = useDebouncedValue(search, 250);
  const seq = useRef(0);
  const reload = useCallback(async (quiet = false) => {
    if (!allowed) return;
    const n = ++seq.current;
    if (!quiet) setLoading(true);
    try {
      if (id) { const d = await api.get<Detail>(`/admin/discussion/${id}`); if (n === seq.current) setDetail(d); }
      else if (mode === 'participants') { const d = await api.get<PeoplePage>('/admin/discussion/identities', { status, search: query, page, pageSize: 20 }); if (n === seq.current) setPeople(d); }
      else { const d = await api.get<Page>('/admin/discussion', { status, search: query, page, pageSize: 20 }); if (n === seq.current) setList(d); }
    } catch (e) { if (n === seq.current && !quiet) notify.error(e); }
    finally { if (n === seq.current) setLoading(false); }
  }, [allowed, id, status, query, page, mode]);
  useEffect(() => { const timer = setTimeout(() => { void reload(); }, 0); return () => clearTimeout(timer); }, [reload]);
  // New questions and reports show up without a reload: on focus, and every 30s while visible.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void reload(true); };
    const t = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(t); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [reload]);
  const changed = useCallback(() => { void markAdminStale(qc); void reload(true); }, [qc, reload]);

  const changeThread = async (patch: Partial<Pick<Thread, 'status' | 'pinned' | 'flagged' | 'tags'>>) => {
    if (!detail) return;
    try { await api.patch(`/admin/discussion/${detail.thread.id}`, patch); notify.success('Discussion updated'); changed(); }
    catch (e) { notify.error(e); }
  };
  const changeComment = async (commentId: string, value: Comment['status']) => {
    try { await api.patch(`/admin/discussion/comments/${commentId}`, { status: value }); notify.success('Reply updated'); changed(); }
    catch (e) { notify.error(e); }
  };
  const resolve = async (reportId: string, value: 'resolved' | 'dismissed') => {
    try { await api.patch(`/admin/discussion/reports/${reportId}`, { status: value }); notify.success('Report reviewed'); changed(); }
    catch (e) { notify.error(e); }
  };
  const suspend = async (identityId: string, value: 'active' | 'suspended') => {
    const approved = await confirm({
      title: value === 'suspended' ? 'Suspend this participant?' : 'Restore this participant?',
      description: value === 'suspended' ? 'They will lose access to the discussion immediately. Their existing questions and replies remain visible for review.' : 'They will be able to join the discussion again with their current identity.',
      confirmLabel: value === 'suspended' ? 'Suspend participant' : 'Restore access',
      destructive: value === 'suspended',
    });
    if (!approved) return;
    try { await api.patch(`/admin/discussion/identities/${identityId}`, { status: value }); notify.success('Participant updated'); changed(); }
    catch (e) { notify.error(e); }
  };
  const changeState = async (value: State) => {
    if (!detail) return;
    if (value === 'hidden' || value === 'deleted') {
      const approved = await confirm({ title: value === 'hidden' ? 'Hide this discussion?' : 'Remove this discussion?', description: value === 'hidden' ? 'It will disappear from the public room until a moderator restores it.' : 'It will disappear from the public room. Moderators can restore it later.', confirmLabel: value === 'hidden' ? 'Hide discussion' : 'Remove discussion', destructive: true });
      if (!approved) return;
    }
    await changeThread({ status: value });
  };

  if (!allowed) return <div className="rounded-3xl border border-line bg-white p-10"><h1 className="text-3xl font-bold">Discussion is not in your access.</h1><p className="mt-3 text-ink-3">Ask the superadmin for discussion access.</p></div>;
  return <div className="space-y-7">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="label text-green">THE CONVERSATION</p><h1 className="mt-2 font-display text-4xl font-black tracking-tight sm:text-5xl">Discussion</h1><p className="mt-2 text-ink-3">Listen to the room. Help it stay generous and useful.</p></div>
      <a className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-blue hover:text-blue" href="/discussion" target="_blank" rel="noreferrer">Open public discussion <ArrowRight size={16} /></a>
    </header>
    {!id && <div className="flex gap-2 border-b border-line pb-3"><button onClick={() => { setMode('threads'); setStatus('all'); setPage(1); setSearch(''); }} className={`rounded-full px-4 py-2 text-sm font-bold ${mode === 'threads' ? 'bg-ink text-white' : 'bg-surface-muted text-ink-2'}`}>Conversations</button>{canManage && <button onClick={() => { setMode('participants'); setStatus('all'); setPage(1); setSearch(''); }} className={`rounded-full px-4 py-2 text-sm font-bold ${mode === 'participants' ? 'bg-ink text-white' : 'bg-surface-muted text-ink-2'}`}>Participants</button>}</div>}
    {id ? detail ? <>
      <Link href="/admin/discussion" className="inline-flex items-center gap-2 text-sm font-bold text-blue"><ArrowLeft size={16} /> All discussions</Link>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-line bg-white p-5 sm:p-8">
            <div className="flex flex-wrap gap-2 text-xs font-bold uppercase tracking-wider text-ink-3"><span>{detail.thread.status}</span><span>·</span><span>{date(detail.thread.createdAt)}</span><span>·</span><span>{detail.thread.reportCount} reports</span>{detail.thread.flagged && <span className="text-red-600">· Flagged for review</span>}</div>
            <h2 className="mt-4 font-display text-3xl font-black tracking-tight sm:text-4xl">{detail.thread.title}</h2>
            <p className="mt-2 text-sm text-ink-3">by {detail.thread.authorLabel} · {detail.thread.score} votes · {detail.thread.commentCount} replies{detail.speaker ? <> · for <strong className="text-ink">{detail.speaker.fullName}</strong></> : null}</p>
            <div className="mt-7 border-t border-line pt-6"><BlocksRenderer blocks={detail.thread.body} /></div>
            <div className="mt-5 flex flex-wrap gap-2">{detail.thread.tags.map(tag => <span key={tag} className="rounded-full bg-surface-muted px-3 py-1 text-xs font-bold">#{tag}</span>)}</div>
          </section>
          <section className="rounded-3xl border border-line bg-white p-5 sm:p-8"><h3 className="font-display text-2xl font-black"><MessageCircle className="mr-2 inline size-5 text-blue" /> Replies</h3>
            <div className="mt-5 space-y-3">{detail.comments.length ? detail.comments.map(comment => <article key={comment.id} className="rounded-2xl border border-line p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{comment.authorLabel}</strong><span className="text-xs text-ink-3">{date(comment.createdAt)} · {comment.status} · {comment.reportCount} reports</span></div><p className="mt-3 whitespace-pre-wrap break-words text-sm">{comment.body || '(deleted)'}</p>{canManage && <div className="mt-4 flex flex-wrap gap-2">{(['visible', 'hidden', 'deleted'] as const).map(value => <button key={value} disabled={comment.status === value} onClick={() => changeComment(comment.id, value)} className="rounded-full border border-line px-3 py-1 text-xs font-bold capitalize hover:border-blue disabled:opacity-40">{value}</button>)}{comment.authorId && <button onClick={() => suspend(comment.authorId!, 'suspended')} className="rounded-full px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-50">Suspend author</button>}</div>}</article>) : <p className="text-ink-3">No replies yet.</p>}</div>
          </section>
          <section className="rounded-3xl border border-line bg-white p-5 sm:p-8"><h3 className="font-display text-2xl font-black"><Flag className="mr-2 inline size-5 text-red" /> Reports</h3><div className="mt-5 space-y-3">{detail.reports.length ? detail.reports.map(report => <article key={report.id} className="rounded-2xl border border-line p-4"><div className="flex flex-wrap justify-between gap-2"><strong className="capitalize">{report.reason} · {report.targetType}</strong><span className="text-xs text-ink-3">{date(report.createdAt)} · {report.status}</span></div>{report.note && <p className="mt-2 text-sm">{report.note}</p>}{canManage && report.status === 'open' && <div className="mt-3 flex gap-2"><button onClick={() => resolve(report.id, 'resolved')} className="rounded-full bg-green px-3 py-1 text-xs font-bold text-white">Resolve</button><button onClick={() => resolve(report.id, 'dismissed')} className="rounded-full border border-line px-3 py-1 text-xs font-bold">Dismiss</button></div>}</article>) : <p className="text-ink-3">No reports. A quiet room.</p>}</div></section>
        </div>
        <aside className="h-max space-y-4 rounded-3xl border border-line bg-white p-5 xl:sticky xl:top-24"><h3 className="font-display text-xl font-black">Moderator controls</h3>{canManage ? <>
          <button onClick={() => changeThread({ pinned: !detail.thread.pinned })} className="flex w-full items-center gap-2 rounded-xl border border-line p-3 text-left text-sm font-bold hover:bg-surface-muted"><Pin size={16} /> {detail.thread.pinned ? 'Unpin' : 'Pin to top'}</button>
          <button onClick={() => changeThread({ flagged: !detail.thread.flagged })} className="flex w-full items-center gap-2 rounded-xl border border-line p-3 text-left text-sm font-bold hover:bg-surface-muted"><Flag size={16} /> {detail.thread.flagged ? 'Clear review flag' : 'Flag for review'}</button>
          <label className="block text-sm font-bold" htmlFor="moderation-status">Conversation state</label>
          <Select id="moderation-status" value={detail.thread.status} onValueChange={value => { if (value) void changeState(value as State); }} options={states.map(state => ({ value: state, label: state[0].toUpperCase() + state.slice(1) }))} aria-label="Conversation state" />
          <p className="text-xs leading-relaxed text-ink-3">Locked stays readable but stops replies. Archived is read only. Hidden and deleted disappear from the public room.</p>
          <TagEditor key={detail.thread.id + detail.thread.tags.join(',')} tags={detail.thread.tags} onSave={tags => changeThread({ tags })} />
          {detail.thread.authorId && <button onClick={() => suspend(detail.thread.authorId!, 'suspended')} className="flex w-full items-center gap-2 rounded-xl border border-red-200 p-3 text-left text-sm font-bold text-red-600 hover:bg-red-50"><UserX size={16} /> Suspend author</button>}
        </> : <p className="text-sm text-ink-3">You have read access. Moderation requires the manage permission.</p>}</aside>
      </div>
    </> : <div className="rounded-2xl border border-line p-8">{loading ? 'Loading conversation...' : 'Conversation not found.'}</div> : mode === 'participants' ? <>
      <div className="flex flex-wrap gap-3 rounded-2xl border border-line bg-white p-3"><label className="flex min-w-52 flex-1 items-center gap-2 rounded-xl bg-surface-muted px-3"><Search size={17} /><input aria-label="Search participants" className="w-full bg-transparent py-3 outline-none" placeholder="Search participants by name" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></label><Select value={status} onValueChange={value => { setStatus(value ?? 'all'); setPage(1); }} options={[{ value: 'all', label: 'All participants' }, { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }]} aria-label="Filter participants" /></div>
      <p className="text-sm text-ink-3">{people ? `${people.total} participants` : 'Loading participants...'}</p>
      <div className="grid gap-3">{people?.items.map(person => <div key={person.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-5"><div><strong>{person.name} <span className="font-mono text-sm text-ink-3">#{person.tag}</span></strong><p className="mt-1 text-xs text-ink-3">Joined {date(person.createdAt)} · <span className={person.status === 'suspended' ? 'text-red-600' : 'text-green'}>{person.status}</span></p></div><button onClick={() => suspend(person.id, person.status === 'active' ? 'suspended' : 'active')} className={`rounded-full border px-4 py-2 text-sm font-bold ${person.status === 'active' ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green/30 text-green hover:bg-green-50'}`}>{person.status === 'active' ? 'Suspend' : 'Restore access'}</button></div>)}{people && !people.items.length && <div className="rounded-2xl border border-line bg-white p-10 text-center text-ink-3">No participants match.</div>}</div>
      {people && people.total > people.pageSize && <div className="flex items-center justify-center gap-4"><button disabled={page === 1} onClick={() => setPage(page - 1)} className="rounded-full border border-line px-4 py-2 disabled:opacity-40">Previous</button><span className="text-sm">{page} / {Math.ceil(people.total / people.pageSize)}</span><button disabled={page * people.pageSize >= people.total} onClick={() => setPage(page + 1)} className="rounded-full border border-line px-4 py-2 disabled:opacity-40">Next</button></div>}
    </> : <>
      <div className="flex flex-wrap gap-3 rounded-2xl border border-line bg-white p-3"><label className="flex min-w-52 flex-1 items-center gap-2 rounded-xl bg-surface-muted px-3"><Search size={17} /><input aria-label="Search discussions" className="w-full bg-transparent py-3 outline-none" placeholder="Search title or author" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></label><Select value={status} onValueChange={value => { setStatus(value ?? 'all'); setPage(1); }} options={[{ value: 'all', label: 'All states' }, ...states.map(state => ({ value: state, label: state[0].toUpperCase() + state.slice(1) }))]} aria-label="Filter by status" /></div>
      <p className="text-sm text-ink-3">{list ? `${list.total} discussions` : 'Loading discussions...'}</p>
      <div className="grid gap-3">{list?.items.map(thread => <Link key={thread.id} href={`/admin/discussion/${thread.id}`} className="group rounded-2xl border border-line bg-white p-5 transition hover:-translate-y-0.5 hover:border-blue hover:shadow-lg"><div className="flex flex-wrap gap-2 text-xs font-bold uppercase tracking-wider text-ink-3"><span className={thread.reportCount ? 'text-red-600' : ''}>{thread.reportCount} reports</span><span>·</span><span>{thread.status}</span><span>·</span><span>{date(thread.createdAt)}</span>{thread.pinned && <span className="text-blue">· Pinned</span>}{thread.flagged && <span className="text-red-600">· Flagged</span>}</div><div className="mt-2 flex items-start justify-between gap-4"><h2 className="font-display text-xl font-black tracking-tight group-hover:text-blue">{thread.title}</h2><ArrowRight size={18} className="shrink-0 text-blue transition group-hover:translate-x-1" /></div><p className="mt-2 line-clamp-2 text-sm text-ink-3">{thread.bodyText}</p><p className="mt-3 text-xs text-ink-3">by {thread.authorLabel} · {thread.commentCount} replies · {thread.score} votes</p></Link>)}{list && !list.items.length && <div className="rounded-2xl border border-line bg-white p-10 text-center text-ink-3">Nothing needs attention here.</div>}</div>
      {list && list.total > list.pageSize && <div className="flex items-center justify-center gap-4"><button disabled={page === 1} onClick={() => setPage(page - 1)} className="rounded-full border border-line px-4 py-2 disabled:opacity-40">Previous</button><span className="text-sm">{page} / {Math.ceil(list.total / list.pageSize)}</span><button disabled={page * list.pageSize >= list.total} onClick={() => setPage(page + 1)} className="rounded-full border border-line px-4 py-2 disabled:opacity-40">Next</button></div>}
    </>}
  </div>;
}

function TagEditor({ tags, onSave }: { tags: string[]; onSave: (tags: string[]) => void }) {
  const [value, setValue] = useState(tags.join(', '));
  return <form onSubmit={event => {
    event.preventDefault();
    const next = value.split(',').map(tag => tag.trim()).filter(Boolean);
    if (next.length > 5 || next.some(tag => tag.length < 2 || tag.length > 24 || !/^[\p{L}\p{N} -]+$/u.test(tag))) return notify.error('Use up to five short tags, separated by commas.');
    onSave(next);
  }} className="space-y-2"><label htmlFor="moderation-tags" className="block text-sm font-bold">Tags</label><input id="moderation-tags" value={value} onChange={event => setValue(event.target.value)} className="w-full rounded-xl border border-line p-3 text-sm" placeholder="research, methods" /><button type="submit" className="rounded-full border border-line px-4 py-2 text-xs font-bold hover:border-blue hover:text-blue">Save tags</button></form>;
}
