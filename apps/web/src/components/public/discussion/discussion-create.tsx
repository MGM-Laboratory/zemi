'use client';

import type { Blocks } from '@zemi/shared';
import { ArrowLeft, ArrowRight, Check, ImagePlus, Send, Sparkles } from 'lucide-react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/public/ui/avatar';
import { coverThumb, discussionRequest, type DiscussionSpeaker, type EventOption, type Identity, type ThreadDetail } from './api';
import { IdentityGate } from './discussion-space';
import { EventPicker } from './event-picker';
import { SpeakerPicker } from './speaker-picker';
import { Turnstile } from './turnstile';
import styles from './discussion.module.css';

const Editor = dynamic(() => import('./discussion-editor'), { ssr: false, loading: () => <div className={styles.editorLoading}>Preparing your writing space...</div> });
const date = (value: string) => new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(value));

export function DiscussionCreatePage({ editId, eventId, speakerId }: { editId?: string; eventId?: string; speakerId?: string }) {
  const [me, setMe] = useState<Identity | null | undefined>(undefined);
  const [initial, setInitial] = useState<ThreadDetail | null>(null);
  const [error, setError] = useState('');
  // A link that names the event (and maybe the speaker) opens the form already addressed.
  const [preset, setPreset] = useState<{ event: EventOption; speaker: DiscussionSpeaker | null } | null | undefined>(eventId && !editId ? undefined : null);
  useEffect(() => {
    if (!me || !eventId || editId) return;
    let active = true;
    discussionRequest<EventOption>('GET', `/events/${eventId}`)
      .then(event => { if (active) setPreset({ event, speaker: event.lineup?.find(s => s.id === speakerId) ?? null }); })
      .catch(() => { if (active) setPreset(null); });
    return () => { active = false; };
  }, [me, eventId, speakerId, editId]);

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
  if (preset === undefined) return <div className={styles.centerState}>Opening your writing space<span className={styles.waitDots}>...</span></div>;
  return <ComposerForm key={initial?.id ?? 'new'} me={me} initial={initial ?? undefined} preset={preset ?? undefined} />;
}

function ComposerForm({ me, initial, preset }: { me: Identity; initial?: ThreadDetail; preset?: { event: EventOption; speaker: DiscussionSpeaker | null } }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [selectedEvent, setSelectedEventState] = useState<EventOption | null>(initial?.event ?? preset?.event ?? null);
  const [selectedSpeaker, setSelectedSpeaker] = useState<DiscussionSpeaker | null>(initial?.speaker ?? preset?.speaker ?? null);
  const lineup = selectedEvent?.lineup ?? [];
  // A new event means a new lineup: keep the speaker only when they are on it too.
  const setSelectedEvent = useCallback((event: EventOption | null) => {
    setSelectedEventState(event);
    setSelectedSpeaker(current => (current && event?.lineup?.some(s => s.id === current.id) ? current : null));
  }, []);
  const n = (i: number) => String(i + (lineup.length ? 1 : 0)).padStart(2, '0');
  // Events that arrive without their lineup (an edited question) fetch it once.
  const needsLineup = selectedEvent && !selectedEvent.lineup ? selectedEvent.id : null;
  useEffect(() => {
    if (!needsLineup) return;
    let active = true;
    discussionRequest<EventOption>('GET', `/events/${needsLineup}`)
      .then(full => { if (active) setSelectedEventState(current => (current?.id === full.id ? { ...current, lineup: full.lineup ?? [] } : current)); })
      .catch(() => { if (active) setSelectedEventState(current => (current?.id === needsLineup ? { ...current, lineup: [] } : current)); });
    return () => { active = false; };
  }, [needsLineup]);
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
        title: title.trim(), eventId: selectedEvent?.id ?? null, speakerId: selectedEvent ? selectedSpeaker?.id ?? null : null, tags: tagList, body, challenge: postToken,
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
        <section className={styles.composeField}><div className={styles.composeFieldHead}><span>02 / THE ROOM</span><span>Questions can belong to one event or everyone.</span></div><label>Which event this is for?</label><EventPicker selected={selectedEvent} onSelect={setSelectedEvent} general />{selectedEvent && <div className={styles.selectedEventPreview}>{selectedEvent.cover ? <Image src={coverThumb(selectedEvent.cover, 88)} alt="" width={88} height={88} unoptimized /> : <span>#{selectedEvent.number ?? '•'}</span>}<div><small>{selectedEvent.current ? 'HAPPENING NOW' : selectedEvent.featured ? 'UP NEXT' : `ZEMI #${selectedEvent.number ?? '•'}`}</small><strong>{selectedEvent.title}</strong><p>{date(selectedEvent.startsAt)}</p>{lineup.length ? <div className={`${styles.selectedLineup} ${styles.pickerLineup}`}><span aria-hidden="true">{lineup.slice(0, 5).map(sp => <Avatar key={sp.id} name={sp.fullName} image={sp.avatar} size={26} ring="#f7faff" />)}</span><span>{lineup.length === 1 ? `With ${lineup[0]!.fullName}` : `${lineup.length} speakers: ${lineup.map(sp => sp.fullName).join(', ')}`}</span></div> : null}</div><Link href={`/events/${selectedEvent.slug}`} target="_blank" rel="noreferrer" aria-label={`View ${selectedEvent.title} in a new tab`}><ArrowRight size={18} /></Link></div>}</section>
        {selectedEvent && lineup.length ? <section className={styles.composeField}><div className={styles.composeFieldHead}><span>03 / THE SPEAKER</span><span>Ask one person on the lineup, or the whole room.</span></div><label id="speaker-label">Who is your question for?</label><SpeakerPicker event={selectedEvent} selected={selectedSpeaker} onSelect={setSelectedSpeaker} /></section> : null}
        <section className={styles.composeField}><div className={styles.composeFieldHead}><span>{n(3)} / THE STORY</span><span>Add context so others can join in.</span></div><label htmlFor="thread-body">Your question, in your words</label><p className={styles.hint}>Use <kbd>/</kbd> for headings, lists, images and more.</p><div className={styles.editor}><Editor value={initial?.body} onChange={setBody} imageToken={imageToken} onImageUsed={onImageUsed} /></div><div className={styles.imageCheck}><ImagePlus size={18} /><span>To add an image, complete this check first.</span><Turnstile action="discussion_image" onToken={onImageToken} resetKey={imageCheckVersion} /></div></section>
        <section className={styles.composeField}><div className={styles.composeFieldHead}><span>{n(4)} / THE THREAD</span><span>Help people find your question.</span></div><label htmlFor="thread-tags">Tags <small>up to 5, separated by commas</small></label><input id="thread-tags" className={styles.composeTagsInput} value={tags} onChange={event => setTags(event.target.value)} placeholder="research, methods, ideas" />{tagList.length > 0 && <div className={styles.cardTags}>{tagList.slice(0, 5).map((tag, index) => <span key={`${tag}-${index}`}>#{tag}</span>)}</div>}</section>
        <div className={styles.composeSubmit}><div><p className={styles.eyebrow}>READY TO JOIN THE CONVERSATION?</p><Turnstile action="discussion_post" onToken={onPostToken} resetKey={postCheckVersion} /></div><button className={styles.primaryButton} disabled={busy || !postToken}><Send size={17} /> {busy ? 'Posting...' : initial ? 'Save changes' : 'Post your question'} <ArrowRight size={17} /></button></div>
      </form>
      <aside className={styles.composeAside}><div className={styles.composeAsideCard}><span className={styles.composeAsideIcon}><Sparkles size={23} /></span><p className={styles.eyebrow}>A NOTE FROM THE ROOM</p><h2>Curiosity is contagious.</h2><p>You do not need a perfect question. You just need a place to begin.</p>{selectedEvent && selectedSpeaker ? <div className={styles.composeAsideFoot}><Avatar name={selectedSpeaker.fullName} image={selectedSpeaker.avatar} size={26} /> Asking <strong>{selectedSpeaker.fullName}</strong></div> : null}<div className={styles.composeAsideFoot}><Check size={17} /> Posting as <strong>{me.name} <span>#{me.tag}</span></strong></div></div><p className={styles.composeAsideTip}>Be specific. Be kind. Leave space for another perspective.</p></aside>
    </div>
  </div>;
}
