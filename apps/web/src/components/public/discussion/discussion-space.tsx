'use client';

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bookmark, Check, ChevronDown, CornerDownRight, Flag, MessageCircle, Pencil, Plus, Search, Send, Share2, Sparkles, Trash2, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { BlocksRenderer } from '@/components/public/media/blocks-renderer';
import { discussionRequest, type EventOption, type Identity, type Page, type Reply, type Thread, type ThreadDetail } from './api';
import { DiscussionConfirm } from './discussion-confirm';
import { DiscussionSelect } from './discussion-select';
import { EventPicker } from './event-picker';
import { Turnstile } from './turnstile';
import styles from './discussion.module.css';

const fmt = (date: string) => new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(date));
const ago = (date: string) => {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return fmt(date);
};
const localBookmarkKey = 'zemi:discussion:bookmarks';

export function DiscussionSpace({ id }: { id?: string }) {
  const router = useRouter();
  const [me, setMe] = useState<Identity | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [threads, setThreads] = useState<Page<Thread> | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('all');
  const [selectedFilterEvent, setSelectedFilterEvent] = useState<EventOption | null>(null);
  const [sort, setSort] = useState<'hot' | 'new' | 'top'>('hot');
  const [page, setPage] = useState(1);
  const [settings, setSettings] = useState(false);
  const [bookmarks, setBookmarks] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem(localBookmarkKey) || '[]') as string[]; }
    catch { return []; }
  });

  useEffect(() => {
    discussionRequest<Identity | null>('GET', '/me').then(setMe).catch(() => { setMe(null); toast.error('Could not check your discussion identity.'); });
  }, []);

  const reload = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    try {
      if (id) setDetail(await discussionRequest<ThreadDetail>('GET', `/threads/${id}`));
      else {
        const query = new URLSearchParams({ page: String(page), pageSize: '15', sort });
        if (search.trim()) query.set('search', search.trim());
        if (eventFilter !== 'all') query.set('eventId', eventFilter);
        setThreads(await discussionRequest<Page<Thread>>('GET', `/threads?${query}`));
      }
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, [me, id, page, sort, search, eventFilter]);
  useEffect(() => { if (me) { const timer = setTimeout(() => { void reload(); }, 0); return () => clearTimeout(timer); } }, [me, reload]);

  const bookmark = (threadId: string) => {
    const next = bookmarks.includes(threadId) ? bookmarks.filter(x => x !== threadId) : [...bookmarks, threadId];
    setBookmarks(next);
    localStorage.setItem(localBookmarkKey, JSON.stringify(next));
    toast.success(next.includes(threadId) ? 'Saved for later' : 'Removed from saved');
  };
  const vote = async (threadId: string, value: -1 | 0 | 1, type: 'thread' | 'comment' = 'thread') => {
    try {
      await discussionRequest('POST', '/vote', { type, id: threadId, value });
      void reload();
    } catch (e) { toast.error((e as Error).message); }
  };
  const react = async (threadId: string, kind: string) => {
    try { await discussionRequest('POST', '/react', { type: 'thread', id: threadId, kind }); void reload(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const share = async (threadId: string) => {
    const url = `${window.location.origin}/discussion/${threadId}`;
    try { await navigator.clipboard.writeText(url); toast.success('Discussion link copied'); }
    catch { toast.error('Could not copy the link.'); }
  };

  if (me === undefined) return <div className={styles.centerState}>Opening the conversation<span className={styles.waitDots}>...</span></div>;
  if (!me) return <IdentityGate onJoined={setMe} />;

  return <div className={styles.page}>
    <div className={`${styles.content} ${styles.discussionContent}`}>
      <header className={styles.discussionHeader}>
        <div>
          <p className={styles.eyebrow}><span className={styles.liveDot} /> The room is open</p>
          <h1>{id ? 'Discussion' : 'Questions in the room'}</h1>
          <p className={styles.discussionHeaderDescription}>{id ? 'Follow the question, then add your voice.' : 'Every question gives the next idea somewhere to begin.'}</p>
        </div>
        <div className={styles.discussionHeaderActions}>
          <Link className={styles.primaryButton} href="/discussion/create"><Plus size={18} /> Ask a question <ArrowRight size={17} /></Link>
          <button className={styles.identityButton} onClick={() => setSettings(true)}>Here as <strong>{me.name}</strong><small>#{me.tag}</small><ChevronDown size={14} /></button>
        </div>
      </header>
      {id ? <>
        <Link className={styles.backLink} href="/discussion"><ArrowLeft size={16} /> Back to all discussions</Link>
        {loading && !detail ? <div className={styles.centerState}>Finding this conversation...</div> : detail ? <>
          <ThreadView thread={detail} bookmark={() => bookmark(detail.id)} saved={bookmarks.includes(detail.id)} onVote={vote} onReact={react} onShare={share} onRefresh={reload} />
        </> : <div className={styles.empty}>This conversation is unavailable.</div>}
      </> : <>
        <div className={`${styles.board} ${styles.discussionBoard}`}>
          <aside className={styles.filters} aria-label="Discussion filters">
            <p className={styles.filterLabel}>FIND YOUR ROOM</p>
            <div className={styles.filterControls}>
              <button className={eventFilter === 'all' ? styles.activeFilter : ''} onClick={() => { setEventFilter('all'); setSelectedFilterEvent(null); setPage(1); }}>All conversations <span>↗</span></button>
              <button className={eventFilter === 'general' ? styles.activeFilter : ''} onClick={() => { setEventFilter('general'); setSelectedFilterEvent(null); setPage(1); }}>General questions <span>↗</span></button>
              <div className={styles.filterPicker}><EventPicker selected={selectedFilterEvent} filter onSelect={event => { if (event) { setSelectedFilterEvent(event); setEventFilter(event.id); setPage(1); } }} />{selectedFilterEvent && <button className={styles.clearEventFilter} onClick={() => { setSelectedFilterEvent(null); setEventFilter('all'); setPage(1); }}>Clear event filter <X size={14} /></button>}</div>
            </div>
            <div className={styles.filterNote}><Sparkles size={17} /><p>Wondering about a paper, a talk, or something in between? There is room for it here.</p></div>
          </aside>
          <div className={styles.feed}>
            <div className={styles.feedTools}>
              <label className={styles.search}><Search size={18} /><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search discussions" aria-label="Search discussions" /></label>
              <div className={styles.sort}><span>Sort</span><DiscussionSelect value={sort} onChange={value => { setSort(value); setPage(1); }} label="Sort discussions" options={[{ value: 'hot', label: 'Most active', description: 'Conversation and votes' }, { value: 'new', label: 'Newest', description: 'Fresh questions first' }, { value: 'top', label: 'Top voted', description: 'Community favorites' }]} /></div>
            </div>
            {loading && !threads ? <div className={styles.centerState}>Listening for questions...</div> : threads?.items.length ? <>
              <div className={styles.threadList}>{threads.items.map((thread, index) => <ThreadCard key={thread.id} thread={thread} index={index} saved={bookmarks.includes(thread.id)} onVote={vote} onBookmark={() => bookmark(thread.id)} onShare={() => share(thread.id)} />)}</div>
              {threads.total > threads.pageSize && <div className={styles.pagination}><button disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {Math.ceil(threads.total / threads.pageSize)}</span><button disabled={page * threads.pageSize >= threads.total} onClick={() => setPage(page + 1)}>Next</button></div>}
            </> : <div className={styles.empty}><div className={styles.emptyMark}>?</div><h3>No questions here yet.</h3><p>Be the first to start a conversation.</p><Link className={styles.primaryButton} href="/discussion/create"><Plus size={17} /> Ask a question</Link></div>}
          </div>
        </div>
      </>}
    </div>
    {settings && <IdentitySettings me={me} onClose={() => setSettings(false)} onChanged={setMe} onDeleted={() => { setMe(null); setSettings(false); router.push('/discussion'); }} />}
  </div>;
}

export function IdentityGate({ onJoined }: { onJoined: (value: Identity) => void }) {
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [challengeVersion, setChallengeVersion] = useState(0);
  const onToken = useCallback((value: string) => setToken(value), []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return toast.error('Complete the human check first.');
    setBusy(true);
    try { onJoined(await discussionRequest<Identity>('POST', '/identity', { name, challenge: token })); toast.success('Welcome to the conversation'); }
    catch (error) { toast.error((error as Error).message); setToken(''); setChallengeVersion(v => v + 1); }
    finally { setBusy(false); }
  };
  return <div className={styles.gate}><div className={styles.gateArt}><span>?</span><i>Curiosity looks good on you.</i></div><div className={styles.gateForm}><p className={styles.eyebrow}>Before we begin</p><h1>What should<br />we call you?</h1><p>No account. No password. Just a name for the conversation. Others may use the same name, so you&apos;ll get a small number after yours.</p><form onSubmit={submit}><label htmlFor="discussion-name">Your name</label><input id="discussion-name" autoComplete="nickname" value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={40} required placeholder="e.g. Ren" /><Turnstile action="discussion_join" onToken={onToken} resetKey={challengeVersion} /><button className={styles.primaryButton} disabled={busy || !token}>Enter the discussion <ArrowRight size={18} /></button></form><small>Your identity stays on this browser for up to a year. You can change or delete it anytime.</small></div></div>;
}

function IdentitySettings({ me, onClose, onChanged, onDeleted }: { me: Identity; onClose: () => void; onChanged: (value: Identity) => void; onDeleted: () => void }) {
  const [name, setName] = useState(me.name);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [challengeVersion, setChallengeVersion] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const onToken = useCallback((value: string) => setToken(value), []);
  const save = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { onChanged(await discussionRequest<Identity>('PATCH', '/identity', { name, challenge: token })); toast.success('Your name is updated'); onClose(); }
    catch (error) { toast.error((error as Error).message); setToken(''); setChallengeVersion(v => v + 1); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    try { await discussionRequest('DELETE', '/identity'); onDeleted(); toast.success('Identity deleted'); }
    catch (error) { toast.error((error as Error).message); throw error; }
  };
  return <><div className={styles.modalBackdrop} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section className={styles.settings} role="dialog" aria-modal="true" aria-label="Your discussion identity"><button className={styles.close} onClick={onClose} aria-label="Close"><X /></button><p className={styles.eyebrow}>YOUR SPACE</p><h2>Your identity</h2><p>Showing up as <strong>{me.label}</strong>. Change the name for future posts, or leave the conversation.</p><form onSubmit={save}><label htmlFor="new-name">Display name</label><input id="new-name" value={name} minLength={2} maxLength={40} required onChange={e => setName(e.target.value)} /><Turnstile action="discussion_rename" onToken={onToken} resetKey={challengeVersion} /><button className={styles.primaryButton} disabled={busy || !token || name.trim() === me.name}>Save name</button></form><button className={styles.dangerLink} onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> Delete my identity</button></section></div><DiscussionConfirm open={confirmDelete} onOpenChange={setConfirmDelete} title="Leave the conversation?" description="Your identity will be removed. Your questions and replies stay visible as Former participant, and your votes disappear." action="Delete identity" onConfirm={remove} /></>;
}

function VoteControl({ score, mine, onVote }: { score: number; mine: number; onVote: (value: -1 | 0 | 1) => void }) {
  return <div className={styles.votes} aria-label="Votes"><button aria-label="Upvote" aria-pressed={mine === 1} onClick={e => { e.preventDefault(); onVote(mine === 1 ? 0 : 1); }}><ArrowUp size={17} fill={mine === 1 ? 'currentColor' : 'none'} /></button><strong>{score}</strong><button aria-label="Downvote" aria-pressed={mine === -1} onClick={e => { e.preventDefault(); onVote(mine === -1 ? 0 : -1); }}><ArrowDown size={17} fill={mine === -1 ? 'currentColor' : 'none'} /></button></div>;
}

function ThreadCard({ thread, index, saved, onVote, onBookmark, onShare }: { thread: Thread; index: number; saved: boolean; onVote: (id: string, value: -1 | 0 | 1) => void; onBookmark: () => void; onShare: () => void }) {
  return <article className={`${styles.threadCard} ${thread.featured ? styles.featured : ''}`} style={{ animationDelay: `${Math.min(index * 45, 360)}ms` }}>
    <VoteControl score={thread.score} mine={thread.myVote} onVote={value => onVote(thread.id, value)} />
    <div className={styles.cardBody}>
      <div className={styles.cardMeta}>{thread.featured && <span className={styles.featuredLabel}><span className={styles.liveDot} /> Next Friday</span>}{thread.pinned && <span className={styles.pinLabel}>Pinned by Zemi</span>}<span>{thread.event ? `Zemi #${thread.event.number ?? '•'}` : 'General'}</span><span className={styles.dotSep}>·</span><span>{ago(thread.createdAt)}</span></div>
      <Link href={`/discussion/${thread.id}`} className={styles.cardTitle}>{thread.title}<ArrowRight size={19} /></Link>
      <p className={styles.excerpt}>{thread.excerpt}</p>
      {thread.event && <Link href={`/events/${thread.event.slug}`} className={styles.eventMini} onClick={e => e.stopPropagation()}>{thread.event.cover ? <Image className={styles.eventCover} src={thread.event.cover.src} alt={thread.event.cover.alt || thread.event.title} width={80} height={80} unoptimized /> : <span className={styles.eventSymbol}>✳</span>}<span><small>THE EVENT</small><strong>{thread.event.title}</strong><em>{fmt(thread.event.startsAt)}</em></span><ArrowRight size={17} /></Link>}
      <div className={styles.cardTags}>{thread.tags.map(tag => <span key={tag}>#{tag}</span>)}</div>
      <div className={styles.cardBottom}><Link href={`/discussion/${thread.id}`}><MessageCircle size={16} /> {thread.commentCount} replies</Link><span>by {thread.author}</span><div className={styles.cardUtilities}><button onClick={onBookmark} aria-label={saved ? 'Remove bookmark' : 'Save discussion'} aria-pressed={saved}><Bookmark size={16} fill={saved ? 'currentColor' : 'none'} /></button><button onClick={onShare} aria-label="Copy discussion link"><Share2 size={16} /></button></div></div>
    </div>
  </article>;
}

function ThreadView({ thread, saved, bookmark, onVote, onReact, onShare, onRefresh }: { thread: ThreadDetail; saved: boolean; bookmark: () => void; onVote: (id: string, value: -1 | 0 | 1, type?: 'thread' | 'comment') => void; onReact: (id: string, kind: string) => void; onShare: (id: string) => void; onRefresh: () => Promise<void> }) {
  const router = useRouter();
  const [reply, setReply] = useState('');
  const [replyTo, setReplyTo] = useState<Reply | null>(null);
  const [token, setToken] = useState('');
  const [reporting, setReporting] = useState<{ type: 'thread' | 'comment'; id: string } | null>(null);
  const [confirmDeleteThread, setConfirmDeleteThread] = useState(false);
  const [confirmDeleteReply, setConfirmDeleteReply] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [challengeVersion, setChallengeVersion] = useState(0);
  const onToken = useCallback((value: string) => setToken(value), []);
  const post = async (e: FormEvent) => {
    e.preventDefault(); if (!token) return toast.error('Complete the human check first.');
    setBusy(true);
    try { await discussionRequest('POST', `/threads/${thread.id}/comments`, { body: reply, parentId: replyTo?.id, challenge: token }); setReply(''); setReplyTo(null); setToken(''); setChallengeVersion(v => v + 1); toast.success('Your reply is in the conversation'); void onRefresh(); }
    catch (error) { toast.error((error as Error).message); setToken(''); setChallengeVersion(v => v + 1); }
    finally { setBusy(false); }
  };
  const removeThread = async () => {
    try { await discussionRequest('DELETE', `/threads/${thread.id}`); router.push('/discussion'); toast.success('Discussion deleted'); }
    catch (e) { toast.error((e as Error).message); throw e; }
  };
  const removeReply = async (id: string) => {
    try { await discussionRequest('DELETE', `/comments/${id}`); void onRefresh(); }
    catch (e) { toast.error((e as Error).message); throw e; }
  };
  const accept = async (id: string | null) => {
    try { await discussionRequest('POST', `/threads/${thread.id}/answer`, { commentId: id }); toast.success(id ? 'Marked as helpful' : 'Helpful mark removed'); void onRefresh(); }
    catch (e) { toast.error((e as Error).message); }
  };
  return <div className={styles.detailLayout}><article className={styles.detail}>
    <div className={styles.detailMeta}>{thread.featured && <span className={styles.featuredLabel}>NEXT FRIDAY</span>}<span>{thread.event ? `Zemi #${thread.event.number ?? '•'}` : 'GENERAL QUESTION'}</span><span>·</span><span>{ago(thread.createdAt)}</span></div>
    <h2>{thread.title}</h2><p className={styles.byline}>Asked by <strong>{thread.author}</strong></p>
    {thread.event && <Link href={`/events/${thread.event.slug}`} className={styles.detailEvent}>{thread.event.cover ? <Image className={styles.eventCover} src={thread.event.cover.src} alt={thread.event.cover.alt || thread.event.title} width={80} height={80} unoptimized /> : <span className={styles.eventSymbol}>✳</span>}<span><small>PART OF THIS FRIDAY</small><strong>{thread.event.title}</strong><em>{fmt(thread.event.startsAt)} · Explore the event</em></span><ArrowRight size={21} /></Link>}
    <div className={styles.richBody}><BlocksRenderer blocks={thread.body} /></div>
    <div className={styles.cardTags}>{thread.tags.map(tag => <span key={tag}>#{tag}</span>)}</div>
    <div className={styles.detailActions}><VoteControl score={thread.score} mine={thread.myVote} onVote={value => onVote(thread.id, value)} /><button onClick={bookmark} aria-pressed={saved}><Bookmark size={17} fill={saved ? 'currentColor' : 'none'} />{saved ? 'Saved' : 'Save'}</button><button onClick={() => onShare(thread.id)}><Share2 size={17} />Share</button><button onClick={() => setReporting({ type: 'thread', id: thread.id })}><Flag size={16} />Report</button>{thread.mine && thread.status === 'open' && <Link href={`/discussion/create?edit=${thread.id}`}><Pencil size={16} />Edit</Link>}{thread.mine && <button className={styles.dangerLink} onClick={() => setConfirmDeleteThread(true)}><Trash2 size={16} />Delete</button>}</div>
    <div className={styles.reactions}><span>How did this land?</span>{(['curious', 'insightful', 'thanks'] as const).map(kind => <button key={kind} aria-pressed={thread.myReactions.includes(kind)} onClick={() => onReact(thread.id, kind)}>{kind === 'curious' ? '✳' : kind === 'insightful' ? '✦' : '♡'} {kind}</button>)}</div>
    <section className={styles.replies}><div className={styles.repliesHead}><h3>{thread.commentCount} {thread.commentCount === 1 ? 'reply' : 'replies'}</h3><span>Keep the conversation generous.</span></div>
      {thread.comments.length ? <div className={styles.replyList}>{thread.comments.map(comment => <div key={comment.id} className={`${styles.reply} ${comment.parentId ? styles.nestedReply : ''} ${thread.acceptedCommentId === comment.id ? styles.accepted : ''}`}><div className={styles.replyVote}><VoteControl score={comment.score} mine={comment.myVote} onVote={value => onVote(comment.id, value, 'comment')} /></div><div className={styles.replyContent}>{thread.acceptedCommentId === comment.id && <span className={styles.acceptedMark}><Check size={15} /> Helpful answer</span>}<p className={styles.replyByline}><strong>{comment.author}</strong><span>{ago(comment.createdAt)}</span></p><p className={styles.replyBody}>{comment.status === 'deleted' ? 'This reply was deleted.' : comment.body}</p>{comment.status !== 'deleted' && <div className={styles.replyActions}><button onClick={() => { setReplyTo(comment); document.getElementById('reply-box')?.focus(); }}><CornerDownRight size={15} /> Reply</button>{thread.mine && <button onClick={() => accept(thread.acceptedCommentId === comment.id ? null : comment.id)}><Check size={15} />{thread.acceptedCommentId === comment.id ? 'Unmark' : 'Mark helpful'}</button>}{comment.mine && <button onClick={() => setConfirmDeleteReply(comment.id)}>Delete</button>}<button onClick={() => setReporting({ type: 'comment', id: comment.id })}>Report</button></div>}</div></div>)}</div> : <p className={styles.noReplies}>No replies yet. Yours could open the conversation.</p>}
      {thread.status === 'open' ? <form className={styles.replyForm} onSubmit={post}><label htmlFor="reply-box">Add to the conversation</label>{replyTo && <p className={styles.replyingTo}>Replying to {replyTo.author}<button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply"><X size={15} /></button></p>}<textarea id="reply-box" minLength={2} maxLength={5000} required rows={5} value={reply} onChange={e => setReply(e.target.value)} placeholder="A thought, a follow-up, a useful link..." /><div className={styles.replySubmit}><Turnstile action="discussion_comment" onToken={onToken} resetKey={challengeVersion} /><button className={styles.primaryButton} disabled={!token || busy}><Send size={17} /> Post reply</button></div></form> : <p className={styles.closedNotice}>This conversation is {thread.status}. You can still read it.</p>}
    </section>
  </article><aside className={styles.detailAside}><p className={styles.filterLabel}>A GOOD CONVERSATION</p><p>Ask with curiosity. Disagree with care. Keep it useful for the people who come after you.</p><Link href="/discussion">Discover more questions <ArrowRight size={16} /></Link></aside>
  {reporting && <ReportDialog target={reporting} onClose={() => setReporting(null)} />}
  <DiscussionConfirm open={confirmDeleteThread} onOpenChange={setConfirmDeleteThread} title="Delete this question?" description="This question will leave the public discussion. A moderator can still review it." action="Delete question" onConfirm={removeThread} />
  <DiscussionConfirm open={!!confirmDeleteReply} onOpenChange={open => { if (!open) setConfirmDeleteReply(null); }} title="Delete your reply?" description="Your reply will be removed from the conversation." action="Delete reply" onConfirm={() => removeReply(confirmDeleteReply!)} />
  </div>;
}

function ReportDialog({ target, onClose }: { target: { type: 'thread' | 'comment'; id: string }; onClose: () => void }) {
  const [reason, setReason] = useState('spam');
  const [note, setNote] = useState('');
  const [token, setToken] = useState('');
  const [challengeVersion, setChallengeVersion] = useState(0);
  const onToken = useCallback((value: string) => setToken(value), []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try { await discussionRequest('POST', '/report', { ...target, reason, note, challenge: token }); toast.success('Thanks. A moderator will review this.'); onClose(); }
    catch (error) { toast.error((error as Error).message); setToken(''); setChallengeVersion(value => value + 1); }
  };
  return <div className={styles.modalBackdrop} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><form className={styles.settings} role="dialog" aria-modal="true" aria-label="Report content" onSubmit={submit}><button type="button" className={styles.close} onClick={onClose} aria-label="Close"><X /></button><p className={styles.eyebrow}>HELP KEEP THE ROOM KIND</p><h2>Report this {target.type}</h2><label>What happened?</label><DiscussionSelect value={reason} onChange={setReason} label="Reason for report" options={[{ value: 'spam', label: 'Spam', description: 'Repeated or promotional content' }, { value: 'harassment', label: 'Harassment', description: 'Targeted or abusive behavior' }, { value: 'unsafe', label: 'Unsafe content', description: 'Something that could cause harm' }, { value: 'off-topic', label: 'Off topic', description: 'Not relevant to this conversation' }, { value: 'other', label: 'Something else' }]} /><label htmlFor="report-note">A note for the moderators (optional)</label><textarea id="report-note" maxLength={500} rows={3} value={note} onChange={e => setNote(e.target.value)} /><Turnstile action="discussion_report" onToken={onToken} resetKey={challengeVersion} /><button className={styles.primaryButton} disabled={!token}>Send report</button></form></div>;
}
