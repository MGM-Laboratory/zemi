'use client';

import { ArrowRight, Check, ChevronDown, Search, Sparkles, X } from 'lucide-react';
import Image from 'next/image';
import { Dialog, Popover } from 'radix-ui';
import { useEffect, useRef, useState } from 'react';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { coverThumb, discussionRequest, type EventOption } from './api';
import styles from './discussion.module.css';

const date = (value: string) => new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(value));

export function EventPicker({ selected, onSelect, general = false, filter = false }: {
  selected: EventOption | null;
  onSelect: (event: EventOption | null) => void;
  general?: boolean;
  filter?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<EventOption[]>([]);
  const [featured, setFeatured] = useState<EventOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const mobile = useMediaQuery('(max-width: 600px)');

  useEffect(() => {
    if (!open) return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError('');
      discussionRequest<EventOption[]>('GET', `/events?search=${encodeURIComponent(query.trim())}`)
        .then(rows => {
          if (!active) return;
          setItems(rows);
          if (!query.trim()) setFeatured(rows.find(row => row.featured) ?? null);
        })
        .catch(() => { if (active) setError('Events could not load. Please try again.'); })
        .finally(() => { if (active) setLoading(false); });
    }, query ? 220 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [open, query]);

  const choose = (event: EventOption | null) => { onSelect(event); setOpen(false); setQuery(''); };
  const shown = items.filter(event => event.id !== featured?.id);
  const changeOpen = (value: boolean) => { setOpen(value); if (value) setLoading(true); else setQuery(''); };
  const trigger = <button type="button" className={`${styles.eventPickerTrigger} ${filter ? styles.eventFilterTrigger : ''} ${selected ? styles.eventPickerSelected : ''}`} aria-label={filter ? selected ? `Filter questions for ${selected.title}` : 'Filter questions by Zemi event' : 'Choose an event or a general question'}>
        <span className={styles.pickerIcon}>{selected ? `#${selected.number ?? '•'}` : filter ? <Search size={17} /> : <Sparkles size={18} />}</span>
        <span className={styles.pickerTriggerText}><small>{filter ? 'FILTER BY EVENT' : 'WHICH EVENT?'}</small><strong>{selected ? selected.title : filter ? 'Search Zemi events' : 'General question or event'}</strong></span>
        <ChevronDown size={18} className={styles.pickerChevron} aria-hidden="true" />
      </button>;
  const panel = <>
        <div className={styles.pickerPanelHead}><div><span className={styles.eyebrow}>{filter ? 'A ROOM FOR EVERY FRIDAY' : 'GIVE YOUR QUESTION A HOME'}</span>{mobile ? <Dialog.Title className={styles.pickerPanelTitle}>{filter ? 'Find a Zemi' : 'Choose an event'}</Dialog.Title> : <h3>{filter ? 'Find a Zemi' : 'Choose an event'}</h3>}</div><div className={styles.pickerPanelSide}><span className={styles.pickerCount}>#{items.length}</span>{mobile && <Dialog.Close asChild><button type="button" className={styles.pickerClose} aria-label="Close event search"><X size={17} /></button></Dialog.Close>}</div></div>
        <label className={styles.pickerSearch}><Search size={18} /><input ref={input} value={query} onChange={event => { setQuery(event.target.value); setItems([]); setLoading(true); }} placeholder="Search title, speaker or number" aria-label="Search Zemi events" /></label>
        <div className={styles.pickerList} role="group" aria-label="Event choices">
          {general && <button type="button" className={`${styles.pickerGeneral} ${!selected ? styles.pickerActive : ''}`} onClick={() => choose(null)}><span className={styles.pickerGeneralMark}>✳</span><span><strong>General question</strong><small>For ideas beyond one Friday</small></span>{!selected ? <Check size={18} /> : <ArrowRight size={17} />}</button>}
          {featured && <><p className={styles.pickerSectionLabel}>{featured.current ? 'HAPPENING NOW' : 'UP NEXT · PINNED'}</p><EventChoice event={featured} active={selected?.id === featured.id} onClick={() => choose(featured)} featured /></>}
          {shown.length > 0 && <p className={styles.pickerSectionLabel}>{query ? 'SEARCH RESULTS' : 'OTHER FRIDAYS'}</p>}
          {shown.map(event => <EventChoice key={event.id} event={event} active={selected?.id === event.id} onClick={() => choose(event)} />)}
          {loading && <p className={styles.pickerFeedback}>Finding the right Friday<span className={styles.waitDots}>...</span></p>}
          {!loading && error && <p className={styles.pickerFeedback}>{error}</p>}
          {!loading && !error && !items.length && !featured && <p className={styles.pickerFeedback}>No event found. Try a title, speaker or Zemi number.</p>}
        </div>
        <p className={styles.pickerFoot}>Each event opens a different conversation.</p>
      </>;
  const focusSearch = (event: Event) => { event.preventDefault(); input.current?.focus(); };
  if (mobile) return <Dialog.Root open={open} onOpenChange={changeOpen}><Dialog.Trigger asChild>{trigger}</Dialog.Trigger><Dialog.Portal><Dialog.Overlay className={styles.pickerMobileOverlay} /><Dialog.Content className={`${styles.eventPickerPanel} ${styles.eventPickerMobile}`} aria-describedby={undefined} onOpenAutoFocus={focusSearch} data-lenis-prevent="">{panel}</Dialog.Content></Dialog.Portal></Dialog.Root>;
  return <Popover.Root open={open} onOpenChange={changeOpen}><Popover.Trigger asChild>{trigger}</Popover.Trigger><Popover.Portal><Popover.Content className={styles.eventPickerPanel} side="bottom" align={filter ? 'start' : 'center'} sideOffset={8} collisionPadding={12} onOpenAutoFocus={focusSearch} data-lenis-prevent="">{panel}</Popover.Content></Popover.Portal></Popover.Root>;
}

function EventChoice({ event, active, onClick, featured = false }: { event: EventOption; active: boolean; onClick: () => void; featured?: boolean }) {
  return <button type="button" className={`${styles.pickerEvent} ${featured ? styles.pickerFeatured : ''} ${active ? styles.pickerActive : ''}`} onClick={onClick} aria-pressed={active}>
    {event.cover ? <Image className={styles.pickerCover} src={coverThumb(event.cover, 72)} alt="" width={72} height={72} unoptimized /> : <span className={styles.pickerCoverFallback}>#{event.number ?? '•'}</span>}
    <span className={styles.pickerEventCopy}><small>ZEMI #{event.number ?? '•'} · {date(event.startsAt)}</small><strong>{event.title}</strong><em>{event.speakers?.length ? `With ${event.speakers.join(' & ')}` : event.summary || 'A Friday seminar'}</em></span>
    {active ? <Check size={18} className={styles.pickerEventArrow} /> : <ArrowRight size={17} className={styles.pickerEventArrow} />}
  </button>;
}
