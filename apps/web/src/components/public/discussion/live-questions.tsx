'use client';

import type { Blocks, EventDetail } from '@zemi/shared';
import {
  ArrowRight,
  ChevronDown,
  CornerDownRight,
  ExternalLink,
  MessageCircle,
  Plus,
  Send,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { BlocksRenderer } from '@/components/public/media/blocks-renderer';
import { Avatar } from '@/components/public/ui/avatar';
import { useNow } from '@/lib/hooks/use-now';
import {
  discussionRequest,
  speakerTiming,
  type DiscussionSpeaker,
  type EventOption,
  type Identity,
  type Page,
  type Reply,
  type Thread,
  type ThreadDetail,
} from './api';
import { ago, ReplyForm, VoteControl } from './discussion-space';
import { SpeakerChip, SpeakerPicker } from './speaker-picker';
import { Turnstile } from './turnstile';
import d from './discussion.module.css';
import styles from './live-questions.module.css';

/** How often the open window refreshes while the tab is visible. */
const POLL_MS = 10_000;
type VoteValue = -1 | 0 | 1;
type Sort = 'top' | 'new';

let blockSeq = 0;
/** Plain text to a BlockNote document: one paragraph per line, like the editor produces. */
function textToBlocks(text: string): Blocks {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      id: `live-${Date.now().toString(36)}-${(++blockSeq).toString(36)}`,
      type: 'paragraph',
      props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
      content: [{ type: 'text', text: line, styles: {} }],
      children: [],
    })) as unknown as Blocks;
}

/** The event's lineup in the discussion's shape, from the page data (no extra request). */
export function lineupFromEvent(event: EventDetail): EventOption {
  const slots = new Map<string, DiscussionSpeaker['slot']>();
  for (const r of event.rundown)
    if (r.speaker && !slots.has(r.speaker.id))
      slots.set(r.speaker.id, { time: r.time, endTime: r.endTime, agenda: r.agenda });
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    number: event.number,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    summary: event.summary,
    current: true,
    lineup: event.speakersFull.map((s) => ({
      id: s.id,
      slug: s.slug,
      fullName: s.fullName,
      nickname: s.nickname,
      headline: s.headline,
      avatar: s.avatar,
      role: s.role,
      organization: s.organization,
      position: s.position,
      talkTitle: s.talkTitle,
      slot: slots.get(s.id) ?? null,
    })),
  };
}

const useVisible = () => {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const on = () => setVisible(document.visibilityState === 'visible');
    on();
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return visible;
};

/**
 * Live questions, under the livestream. Not a chat: the event's discussion questions, sorted by
 * votes or time, refreshed every few seconds. Viewers vote, open a question to read it in full and
 * reply, and ask their own (to one speaker or the whole room) without leaving the stream.
 * Questions land in the regular discussion for this event, so the conversation outlives the stream.
 */
export function LiveQuestions({ event }: { event: EventDetail }) {
  const room = useMemo(() => lineupFromEvent(event), [event]);
  const lineup = useMemo(() => room.lineup ?? [], [room]);
  const [me, setMe] = useState<Identity | null | undefined>(undefined);
  const [sort, setSort] = useState<Sort>('top');
  const [speakerFilter, setSpeakerFilter] = useState<string | null>(null);
  const scope = `${event.id}:${sort}:${speakerFilter ?? ''}`;
  const [storedList, setStoredList] = useState<{ scope: string; data: Page<Thread> } | null>(null);
  const list = storedList?.scope === scope ? storedList.data : null;
  const setList = useCallback((update: (previous: Page<Thread> | null) => Page<Thread> | null) => {
    setStoredList((previous) => {
      const next = update(previous?.scope === scope ? previous.data : null);
      return next ? { scope, data: next } : null;
    });
  }, [scope]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [asking, setAsking] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const visible = useVisible();
  const now = useNow(30_000);
  const onStage = useMemo(
    () => lineup.find((s) => speakerTiming(s, room, now) === 'now') ?? null,
    [lineup, room, now],
  );

  useEffect(() => {
    discussionRequest<Identity | null>('GET', '/me')
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  const seq = useRef(0);
  const loadFailed = useRef(false);
  const loadedPage = useRef(1);
  const listScope = useRef(scope);
  useEffect(() => {
    // A different speaker or sort is a different result set. Never mix their pages.
    seq.current += 1;
    loadedPage.current = 1;
    listScope.current = scope;
  }, [scope]);
  const loadList = useCallback(async () => {
    const n = ++seq.current;
    const params = new URLSearchParams({
      eventId: event.id,
      sort: sort === 'top' ? 'top' : 'new',
      page: '1',
      pageSize: '30',
    });
    if (speakerFilter) params.set('speakerId', speakerFilter);
    try {
      const page = await discussionRequest<Page<Thread>>('GET', `/threads?${params}`);
      loadFailed.current = false;
      if (n === seq.current && listScope.current === scope)
        setList((previous) => {
          // Poll the first page only. Preserve older pages the viewer explicitly opened.
          const firstIds = new Set(page.items.map((item) => item.id));
          const older = loadedPage.current > 1
            ? previous?.items.slice(30).filter((item) => !firstIds.has(item.id)) ?? []
            : [];
          return { ...page, items: [...page.items, ...older] };
        });
    } catch (e) {
      if (n === seq.current) {
        if ((e as { status?: number }).status === 401) setMe(null);
        else if (!loadFailed.current) {
          loadFailed.current = true;
          toast.error('Questions could not refresh. Trying again shortly.');
        }
      }
    }
  }, [event.id, sort, speakerFilter, scope, setList]);
  const loadMore = useCallback(async () => {
    if (loadingMore || !list || list.items.length >= list.total) return;
    const nextPage = loadedPage.current + 1;
    const params = new URLSearchParams({ eventId: event.id, sort, page: String(nextPage), pageSize: '30' });
    if (speakerFilter) params.set('speakerId', speakerFilter);
    setLoadingMore(true);
    try {
      const page = await discussionRequest<Page<Thread>>('GET', `/threads?${params}`);
      if (listScope.current !== scope) return;
      loadedPage.current = nextPage;
      setList((previous) => {
        if (!previous) return page;
        const seen = new Set(previous.items.map((item) => item.id));
        return { ...previous, total: page.total, items: [...previous.items, ...page.items.filter((item) => !seen.has(item.id))] };
      });
      setShowAll(true);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }, [event.id, list, loadingMore, scope, sort, speakerFilter, setList]);
  const detailSeq = useRef(0);
  const loadDetail = useCallback(async (id: string) => {
    const n = ++detailSeq.current;
    try {
      const data = await discussionRequest<ThreadDetail>('GET', `/threads/${id}`);
      if (n === detailSeq.current) setDetail(data);
    } catch (e) {
      if (n === detailSeq.current) toast.error((e as Error).message);
    }
  }, []);

  // Load when joined and whenever the view changes; then keep it fresh while the tab is visible.
  useEffect(() => {
    if (!me) return;
    const t = setTimeout(() => {
      void loadList();
    }, 0);
    return () => clearTimeout(t);
  }, [me, loadList]);
  useEffect(() => {
    if (!me || !visible) return;
    const t = window.setInterval(() => {
      void loadList();
      if (openId) void loadDetail(openId);
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [me, visible, loadList, loadDetail, openId]);

  const openRef = useRef<string | null>(null);
  const toggle = useCallback(
    (id: string) => {
      const next = openRef.current === id ? null : id;
      openRef.current = next;
      setOpenId(next);
      setDetail(null);
      if (next) void loadDetail(next);
    },
    [loadDetail],
  );

  const vote = useCallback(
    async (targetId: string, value: VoteValue, type: 'thread' | 'comment' = 'thread') => {
      const bump = <T extends { score: number; myVote: number }>(t: T): T => ({
        ...t,
        score: t.score + (value - t.myVote),
        myVote: value,
      });
      if (type === 'thread') {
        setList((p) => p && { ...p, items: p.items.map((t) => (t.id === targetId ? bump(t) : t)) });
        setDetail((x) => (x && x.id === targetId ? bump(x) : x));
      } else
        setDetail(
          (x) => x && { ...x, comments: x.comments.map((c) => (c.id === targetId ? bump(c) : c)) },
        );
      try {
        await discussionRequest('POST', '/vote', { type, id: targetId, value });
      } catch (e) {
        toast.error((e as Error).message);
        void loadList();
      }
    },
    [loadList, setList],
  );

  const replied = useCallback(
    (id: string) => {
      void loadDetail(id);
      void loadList();
    },
    [loadDetail, loadList],
  );

  const items = list?.items ?? [];
  const shown = showAll ? items : items.slice(0, 8);
  const total = list?.total ?? 0;

  return (
    <section className={styles.root} aria-labelledby="live-questions-title">
      <header className={styles.head}>
        <div>
          <p className={styles.eyebrow}>
            <span className={styles.liveDot} aria-hidden="true" /> LIVE Q&amp;A · ZEMI #
            {event.number ?? '•'}
          </p>
          <h2 id="live-questions-title" className={styles.title}>
            Questions for the room
          </h2>
          <p className={styles.sub}>
            Ask without leaving the stream. Vote up the ones you want answered
            {lineup.length > 1 ? ', or ask one speaker directly' : ''}.
          </p>
        </div>
        <div className={styles.headActions}>
          {me ? (
            <span className={styles.me}>
              Here as <strong>{me.name}</strong> <small>#{me.tag}</small>
            </span>
          ) : null}
          {me ? (
            <button
              type="button"
              className={d.primaryButton}
              onClick={() => setAsking((a) => !a)}
              aria-expanded={asking}
              aria-controls="live-ask"
            >
              {asking ? (
                <>
                  <X size={17} /> Close
                </>
              ) : (
                <>
                  <Plus size={17} /> Ask a question
                </>
              )}
            </button>
          ) : null}
        </div>
      </header>

      {me === undefined ? (
        <p className={styles.state}>
          Opening the questions<span className={d.waitDots}>...</span>
        </p>
      ) : null}
      {me === null ? <InlineJoin onJoined={setMe} /> : null}

      {me ? (
        <>
          {asking ? (
            <AskForm
              room={room}
              defaultSpeaker={
                speakerFilter ? (lineup.find((s) => s.id === speakerFilter) ?? onStage) : onStage
              }
              onCancel={() => setAsking(false)}
              onPosted={(id) => {
                setAsking(false);
                setSort('new');
                // The author may choose a different speaker inside the form. Show their new
                // question even if the previous list filter was for someone else.
                setSpeakerFilter(null);
                openRef.current = id;
                setOpenId(id);
                setDetail(null);
                void loadDetail(id);
                void loadList();
              }}
            />
          ) : null}

          <div className={styles.toolbar}>
            <div className={styles.segment} role="tablist" aria-label="Sort questions">
              <button
                type="button"
                role="tab"
                aria-selected={sort === 'top'}
                onClick={() => setSort('top')}
              >
                Most voted
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sort === 'new'}
                onClick={() => setSort('new')}
              >
                Newest
              </button>
            </div>
            {lineup.length > 1 ? (
              <div className={styles.filters} role="group" aria-label="Questions for">
                <button
                  type="button"
                  aria-pressed={!speakerFilter}
                  onClick={() => setSpeakerFilter(null)}
                >
                  Everyone
                </button>
                {lineup.map((sp) => (
                  <button
                    key={sp.id}
                    type="button"
                    aria-pressed={speakerFilter === sp.id}
                    onClick={() => setSpeakerFilter(speakerFilter === sp.id ? null : sp.id)}
                    title={sp.talkTitle ?? sp.fullName}
                  >
                    <Avatar name={sp.fullName} image={sp.avatar} size={22} />
                    {sp.nickname || sp.fullName.split(' ')[0]}
                    {onStage?.id === sp.id ? (
                      <span className={styles.onStage}>on stage</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
            <span className={styles.count} aria-live="polite">
              {list ? `${total} ${total === 1 ? 'question' : 'questions'}` : ''}
            </span>
          </div>

          {!list ? (
            <p className={styles.state}>
              Listening for questions<span className={d.waitDots}>...</span>
            </p>
          ) : items.length ? (
            <ol className={styles.list}>
              {shown.map((t, i) => (
                <LiveQuestion
                  key={t.id}
                  thread={t}
                  rank={sort === 'top' ? i + 1 : null}
                  open={openId === t.id}
                  detail={openId === t.id ? detail : null}
                  onToggle={toggle}
                  onVote={vote}
                  onReplied={replied}
                />
              ))}
            </ol>
          ) : (
            <div className={styles.empty}>
              <span aria-hidden="true">?</span>
              <p>
                <strong>No questions yet{speakerFilter ? ' for this speaker' : ''}.</strong> Be the
                first one, the speaker will see it.
              </p>
              <button type="button" className={d.primaryButton} onClick={() => setAsking(true)}>
                <Plus size={17} /> Ask a question
              </button>
            </div>
          )}

          <footer className={styles.foot}>
            {items.length > 8 ? (
              <button
                type="button"
                className={styles.more}
                onClick={() => setShowAll((v) => !v)}
                aria-expanded={showAll}
              >
                {showAll ? 'Show fewer' : items.length < total ? `Show ${items.length} questions` : `Show all ${items.length}`}{' '}
                <ChevronDown
                  size={15}
                  style={{ transform: showAll ? 'rotate(180deg)' : undefined }}
                />
              </button>
            ) : (
              <span />
            )}
            {items.length < total ? (
              <button type="button" className={styles.more} onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? 'Loading more...' : `Load more questions (${items.length} of ${total})`}
              </button>
            ) : null}
            <Link
              href={`/discussion?event=${event.id}`}
              target="_blank"
              rel="noreferrer"
              className={styles.footLink}
            >
              Open the full discussion <ExternalLink size={14} />
            </Link>
          </footer>
        </>
      ) : null}
    </section>
  );
}

const LiveQuestion = memo(function LiveQuestion({
  thread,
  rank,
  open,
  detail,
  onToggle,
  onVote,
  onReplied,
}: {
  thread: Thread;
  rank: number | null;
  open: boolean;
  detail: ThreadDetail | null;
  onToggle: (id: string) => void;
  onVote: (id: string, value: VoteValue, type?: 'thread' | 'comment') => void;
  onReplied: (id: string) => void;
}) {
  const [replyTo, setReplyTo] = useState<Reply | null>(null);
  return (
    <li className={`${styles.item} ${open ? styles.itemOpen : ''}`}>
      <div className={styles.row}>
        <VoteControl
          score={thread.score}
          mine={thread.myVote}
          onVote={(value) => onVote(thread.id, value)}
        />
        <button
          type="button"
          className={styles.rowMain}
          onClick={() => onToggle(thread.id)}
          aria-expanded={open}
          aria-controls={`live-q-${thread.id}`}
          data-cursor={open ? undefined : 'question'}
        >
          <span className={styles.rowMeta}>
            {rank && rank <= 3 ? <b className={styles.rank}>#{rank}</b> : null}
            <span>{thread.author}</span>
            <span aria-hidden="true">·</span>
            <span>{ago(thread.createdAt)}</span>
            <span aria-hidden="true">·</span>
            <span>
              <MessageCircle size={12} aria-hidden="true" /> {thread.commentCount}
            </span>
            {thread.acceptedCommentId ? <span className={styles.answered}>Answered</span> : null}
          </span>
          <strong className={styles.rowTitle}>{thread.title}</strong>
          {!open && thread.excerpt && thread.excerpt.trim() !== thread.title.trim() ? (
            <span className={styles.rowExcerpt}>{thread.excerpt}</span>
          ) : null}
          {thread.speaker ? <SpeakerChip speaker={thread.speaker} size={20} /> : null}
        </button>
        <ChevronDown size={18} className={styles.chevron} aria-hidden="true" />
      </div>
      {open ? (
        <div id={`live-q-${thread.id}`} className={styles.detail}>
          {!detail ? (
            <p className={styles.state}>
              Opening the question<span className={d.waitDots}>...</span>
            </p>
          ) : (
            <>
              <div className={styles.detailBody}>
                <BlocksRenderer blocks={detail.body} size="sm" />
              </div>
              {detail.tags.length ? (
                <div className={d.cardTags}>
                  {detail.tags.map((tag) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                </div>
              ) : null}
              <div className={styles.replies}>
                <p className={styles.repliesHead}>
                  {detail.commentCount} {detail.commentCount === 1 ? 'reply' : 'replies'}
                </p>
                {detail.comments.map((c) => (
                  <div
                    key={c.id}
                    className={`${styles.reply} ${c.parentId ? styles.replyNested : ''} ${detail.acceptedCommentId === c.id ? styles.replyAccepted : ''}`}
                  >
                    <VoteControl
                      score={c.score}
                      mine={c.myVote}
                      onVote={(value) => onVote(c.id, value, 'comment')}
                    />
                    <div className={styles.replyCopy}>
                      <p className={styles.replyBy}>
                        <strong>{c.author}</strong>
                        <span>{ago(c.createdAt)}</span>
                        {detail.acceptedCommentId === c.id ? (
                          <span className={styles.answered}>Helpful</span>
                        ) : null}
                      </p>
                      <p className={styles.replyText}>
                        {c.status === 'deleted' ? 'This reply was deleted.' : c.body}
                      </p>
                      {c.status !== 'deleted' && detail.status === 'open' ? (
                        <button
                          type="button"
                          className={styles.replyBtn}
                          onClick={() => {
                            setReplyTo(c);
                            document.getElementById('reply-box')?.focus();
                          }}
                        >
                          <CornerDownRight size={13} /> Reply
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
                {detail.status === 'open' ? (
                  <div className={styles.replyForm}>
                    <ReplyForm
                      threadId={detail.id}
                      replyTo={replyTo}
                      onCancelReplyTo={() => setReplyTo(null)}
                      onPosted={() => {
                        setReplyTo(null);
                        onReplied(detail.id);
                      }}
                    />
                  </div>
                ) : (
                  <p className={styles.state}>This question is {detail.status}.</p>
                )}
              </div>
              <Link
                href={`/discussion/${detail.id}`}
                target="_blank"
                rel="noreferrer"
                className={styles.footLink}
              >
                Open on its own page <ExternalLink size={14} />
              </Link>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
});

/** Ask from the stream: a short title, optional details, and who it is for. */
function AskForm({
  room,
  defaultSpeaker,
  onCancel,
  onPosted,
}: {
  room: EventOption;
  defaultSpeaker: DiscussionSpeaker | null;
  onCancel: () => void;
  onPosted: (id: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [speaker, setSpeaker] = useState<DiscussionSpeaker | null>(defaultSpeaker);
  const [token, setToken] = useState('');
  const [check, setCheck] = useState(0);
  const [busy, setBusy] = useState(false);
  const onToken = useCallback((v: string) => setToken(v), []);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);
  const text = details.trim() || title.trim();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 8)
      return toast.error('Give your question a title of at least 8 characters.');
    if (text.length < 10) return toast.error('Add a few more words so people know what you mean.');
    if (!token) return toast.error('Complete the human check first.');
    setBusy(true);
    try {
      const res = await discussionRequest<{ id: string }>('POST', '/threads', {
        title: title.trim(),
        body: textToBlocks(text),
        tags: [],
        eventId: room.id,
        speakerId: speaker?.id ?? null,
        challenge: token,
      });
      toast.success(speaker ? `Asked ${speaker.fullName}` : 'Your question is in the room');
      onPosted(res.id);
    } catch (err) {
      toast.error((err as Error).message);
      setToken('');
      setCheck((v) => v + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form id="live-ask" className={styles.ask} onSubmit={submit}>
      {room.lineup?.length ? (
        <div className={styles.askField}>
          <span className={styles.askLabel}>Who is it for?</span>
          <SpeakerPicker event={room} selected={speaker} onSelect={setSpeaker} compact />
        </div>
      ) : null}
      <label className={styles.askField}>
        <span className={styles.askLabel}>Your question</span>
        <textarea
          ref={titleRef}
          className={styles.askTitle}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          rows={2}
          minLength={8}
          maxLength={180}
          required
          placeholder={
            speaker
              ? `What would you like to ask ${speaker.fullName.split(' ')[0]}?`
              : 'What would you like to ask?'
          }
        />
        <small>{title.length}/180</small>
      </label>
      <label className={styles.askField}>
        <span className={styles.askLabel}>
          Details <small>(optional)</small>
        </span>
        <textarea
          className={styles.askDetails}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={3}
          maxLength={5000}
          placeholder="Context, the slide you mean, a link..."
        />
      </label>
      <div className={styles.askFoot}>
        <Turnstile action="discussion_post" onToken={onToken} resetKey={check} />
        <div className={styles.askButtons}>
          <button type="button" className={styles.ghost} onClick={onCancel}>
            Cancel
          </button>
          <Link
            href={`/discussion/create?event=${room.id}${speaker ? `&speaker=${speaker.id}` : ''}`}
            target="_blank"
            rel="noreferrer"
            className={styles.ghost}
          >
            Longer question <ExternalLink size={13} />
          </Link>
          <button className={d.primaryButton} disabled={busy || !token}>
            <Send size={16} />{' '}
            {busy
              ? 'Asking...'
              : speaker
                ? `Ask ${speaker.fullName.split(' ')[0]}`
                : 'Ask the room'}{' '}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </form>
  );
}

/** Name only, right here: joining the discussion without leaving the stream. */
function InlineJoin({ onJoined }: { onJoined: (me: Identity) => void }) {
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState(0);
  const onToken = useCallback((v: string) => setToken(v), []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return toast.error('Complete the human check first.');
    setBusy(true);
    try {
      onJoined(await discussionRequest<Identity>('POST', '/identity', { name, challenge: token }));
      toast.success('Welcome to the Q&A');
    } catch (err) {
      toast.error((err as Error).message);
      setToken('');
      setCheck((v) => v + 1);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className={styles.join} onSubmit={submit}>
      <span className={styles.joinMark} aria-hidden="true">
        ?
      </span>
      <div className={styles.joinCopy}>
        <strong>See the questions and ask your own</strong>
        <p>
          No account, just a name for the room. Others may share it, so you get a small number after
          yours.
        </p>
      </div>
      <div className={styles.joinFields}>
        <label htmlFor="live-join-name" className="sr-only">
          Your name
        </label>
        <input
          id="live-join-name"
          autoComplete="nickname"
          value={name}
          onChange={(e) => setName(e.target.value)}
          minLength={2}
          maxLength={40}
          required
          placeholder="Your name, e.g. Ren"
        />
        <button className={d.primaryButton} disabled={busy || !token}>
          Join <ArrowRight size={16} />
        </button>
      </div>
      <Turnstile action="discussion_join" onToken={onToken} resetKey={check} />
    </form>
  );
}
