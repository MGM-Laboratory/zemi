'use client';

import type { Blocks } from '@zemi/shared';
import { ArrowLeft, ArrowRight, Check, ImagePlus, Send, Sparkles } from 'lucide-react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { discussionRequest, type EventOption, type Identity, type ThreadDetail } from './api';
import { IdentityGate } from './discussion-space';
import { EventPicker } from './event-picker';
import { Turnstile } from './turnstile';
import styles from './discussion.module.css';

const Editor = dynamic(() => import('./discussion-editor'), { ssr: false, loading: () => <div className={styles.editorLoading}>Preparing your writing space...</div> });
const date = (value: string) => new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(value));

export function DiscussionCreatePage({ editId }: { editId?: string }) {
  const [me, setMe] = useState<Identity | null | undefined>(undefined);
  const [initial, setInitial] = useState<ThreadDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    discussionRequest<Identity | null>('GET', '/me').then(setMe).catch(() => setMe(null));
  }, []);
  useEffect(() => {
    if (!me || !editId) return;
    let active = true;
    discussionRequest<ThreadDetail>('GET', `/threads/${editId}`)
      .then(thread => {
        if (!active) return;
        if (!thread.mine || thread.status !== 'open') setError('Only the author can edit an open question.');
        else setInitial(thread);
      })
      .catch(() => { if (active) setError('This question is unavailable.'); });
    return () => { active = false; };
  }, [editId, me]);

  if (me === undefined) return <div className={styles.centerState}>Opening your writing space<span className={styles.waitDots}>...</span></div>;
  if (!me) return <IdentityGate onJoined={setMe} />;
  if (editId && error) return <div className={styles.composePage}><Link href="/discussion" className={styles.backLink}><ArrowLeft size={16} /> Back to discussion</Link><div className={styles.empty}><h1>{error}</h1></div></div>;
  if (editId && !initial) return <div className={styles.centerState}>Finding your question<span className={styles.waitDots}>...</span></div>;
  return <ComposerForm key={initial?.id ?? 'new'} me={me} initial={initial ?? undefined} />;
}

function ComposerForm({ me, initial }: { me: Identity; initial?: ThreadDetail }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [selectedEvent, setSelectedEvent] = useState<EventOption | null>(initial?.event ?? null);
  const [tags, setTags] = useState(initial?.tags.join(', ') ?? '');
  const [body, setBody] = useState<Blocks>(initial?.body ?? []);
  const [postToken, setPostToken] = useState('');
  const [imageToken, setImageToken] = useState('');
  const [postCheckVersion, setPostCheckVersion] = useState(0);
  const [imageCheckVersion, setImageCheckVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const onPostToken = useCallback((value: string) => setPostToken(value), []);
  const onImageToken = useCallback((value: string) => setImageToken(value), []);
  const onImageUsed = useCallback(() => { setImageToken(''); setImageCheckVersion(version => version + 1); }, []);
  const tagList = useMemo(() => tags.split(',').map(tag => tag.trim()).filter(Boolean), [tags]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!postToken) return toast.error('Complete the human check first.');
    if (tagList.length > 5) return toast.error('Choose up to five tags.');
    setBusy(true);
    try {
      const result = await discussionRequest<{ id?: string }>(initial ? 'PATCH' : 'POST', initial ? `/threads/${initial.id}` : '/threads', {
        title: title.trim(), eventId: selectedEvent?.id ?? null, tags: tagList, body, challenge: postToken,
      });
      toast.success(initial ? 'Question updated' : 'Your question is in the room');
      router.push(`/discussion/${result.id ?? initial?.id}`);
    } catch (error) {
      toast.error((error as Error).message);
      setPostToken(''); setPostCheckVersion(version => version + 1);
    } finally { setBusy(false); }
  };

  return <div className={styles.composePage}>
    <div className={styles.composeTopline}><Link href={initial ? `/discussion/${initial.id}` : '/discussion'} className={styles.composeBack}><ArrowLeft size={17} /> Back to discussion</Link><span>DISCUSSION / {initial ? 'EDIT' : 'CREATE'}</span></div>
    <header className={styles.composePageHeader}><div><p className={styles.eyebrow}><span className={styles.liveDot} /> A question begins here</p><h1>{initial ? <>Make it <em>clearer.</em></> : <>Ask what <em>matters.</em></>}</h1><p>A good question gives everyone another way into the conversation.</p></div><div className={styles.composeHeaderMark} aria-hidden="true">?</div></header>
    <div className={styles.composeLayout}>
      <form id="discussion-compose-form" className={styles.composeForm} onSubmit={submit}>
        <section className={styles.composeField}><div className={styles.composeFieldHead}><span>01 / THE QUESTION</span><span>Start with the thing you are curious about.</span></div><label htmlFor="thread-title">Title</label><textarea id="thread-title" className={styles.composeTitleInput} value={title} onChange={event => setTitle(event.target.value)} minLength={8} maxLength={180} rows={2} required placeholder="What would you like to ask?" /><small className={styles.composeFieldHelp}>{title.length}/180 characters · Make it easy to recognize at a glance.</small></section>
        <section className={styles.composeField}><div className={styles.composeFieldHead}><span>02 / THE ROOM</span><span>Questions can belong to one event or everyone.</span></div><label>Which event this is for?</label><EventPicker selected={selectedEvent} onSelect={setSelectedEvent} general />{selectedEvent && <div className={styles.selectedEventPreview}>{selectedEvent.cover ? <Image src={selectedEvent.cover.src} alt="" width={88} height={88} unoptimized /> : <span>#{selectedEvent.number ?? '•'}</span>}<div><small>{selectedEvent.current ? 'HAPPENING NOW' : selectedEvent.featured ? 'UP NEXT' : `ZEMI #${selectedEvent.number ?? '•'}`}</small><strong>{selectedEvent.title}</strong><p>{date(selectedEvent.startsAt)}{selectedEvent.speakers?.length ? ` · ${selectedEvent.speakers.join(' & ')}` : ''}</p></div><Link href={`/events/${selectedEvent.slug}`} target="_blank" rel="noreferrer" aria-label={`View ${selectedEvent.title} in a new tab`}><ArrowRight size={18} /></Link></div>}</section>
        <section className={styles.composeField}><div className={styles.composeFieldHead}><span>03 / THE STORY</span><span>Add context so others can join in.</span></div><label htmlFor="thread-body">Your question, in your words</label><p className={styles.hint}>Use <kbd>/</kbd> for headings, lists, images and more.</p><div className={styles.editor}><Editor value={initial?.body} onChange={setBody} imageToken={imageToken} onImageUsed={onImageUsed} /></div><div className={styles.imageCheck}><ImagePlus size={18} /><span>To add an image, complete this check first.</span><Turnstile action="discussion_image" onToken={onImageToken} resetKey={imageCheckVersion} /></div></section>
        <section className={styles.composeField}><div className={styles.composeFieldHead}><span>04 / THE THREAD</span><span>Help people find your question.</span></div><label htmlFor="thread-tags">Tags <small>up to 5, separated by commas</small></label><input id="thread-tags" className={styles.composeTagsInput} value={tags} onChange={event => setTags(event.target.value)} placeholder="research, methods, ideas" />{tagList.length > 0 && <div className={styles.cardTags}>{tagList.slice(0, 5).map((tag, index) => <span key={`${tag}-${index}`}>#{tag}</span>)}</div>}</section>
        <div className={styles.composeSubmit}><div><p className={styles.eyebrow}>READY TO JOIN THE CONVERSATION?</p><Turnstile action="discussion_post" onToken={onPostToken} resetKey={postCheckVersion} /></div><button className={styles.primaryButton} disabled={busy || !postToken}><Send size={17} /> {busy ? 'Posting...' : initial ? 'Save changes' : 'Post your question'} <ArrowRight size={17} /></button></div>
      </form>
      <aside className={styles.composeAside}><div className={styles.composeAsideCard}><span className={styles.composeAsideIcon}><Sparkles size={23} /></span><p className={styles.eyebrow}>A NOTE FROM THE ROOM</p><h2>Curiosity is contagious.</h2><p>You do not need a perfect question. You just need a place to begin.</p><div className={styles.composeAsideFoot}><Check size={17} /> Posting as <strong>{me.name} <span>#{me.tag}</span></strong></div></div><p className={styles.composeAsideTip}>Be specific. Be kind. Leave space for another perspective.</p></aside>
    </div>
  </div>;
}
