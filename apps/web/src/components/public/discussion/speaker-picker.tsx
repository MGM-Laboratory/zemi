'use client';

import { ArrowUpRight, Check, Clock3, Mic, Users } from 'lucide-react';
import Link from 'next/link';
import { Avatar } from '@/components/public/ui/avatar';
import { useNow } from '@/lib/hooks/use-now';
import {
  ROLE_LABEL,
  slotLabel,
  speakerTiming,
  type DiscussionSpeaker,
  type EventOption,
} from './api';
import styles from './discussion.module.css';

const TIMING: Record<'now' | 'next' | 'done', string> = {
  now: 'On stage now',
  next: 'Up next',
  done: 'Already spoke',
};

/** "Researcher · Universitas Indonesia" */
export function speakerAffiliation(
  s: Pick<DiscussionSpeaker, 'position' | 'organization'>,
): string | null {
  return [s.position, s.organization].filter(Boolean).join(' · ') || null;
}

/**
 * Pick who a question is for, inside one event: the whole room, or one person on the lineup.
 * Every option shows the face, name, role, affiliation, the talk and its time slot, plus whether
 * they are on stage right now. The chosen speaker gets a detailed preview underneath.
 */
export function SpeakerPicker({
  event,
  selected,
  onSelect,
  compact = false,
}: {
  event: EventOption;
  selected: DiscussionSpeaker | null;
  onSelect: (speaker: DiscussionSpeaker | null) => void;
  /** Smaller cards for the live questions window. */
  compact?: boolean;
}) {
  const now = useNow(30_000);
  const lineup = event.lineup ?? [];
  if (!lineup.length) return null;
  return (
    <div className={`${styles.speakerPicker} ${compact ? styles.speakerPickerCompact : ''}`}>
      <div
        className={styles.speakerOptions}
        role="radiogroup"
        aria-label={`Who is your question for at ${event.title}?`}
      >
        <button
          type="button"
          role="radio"
          aria-checked={!selected}
          className={`${styles.speakerOption} ${!selected ? styles.speakerOptionActive : ''}`}
          onClick={() => onSelect(null)}
        >
          <span className={styles.speakerEveryone} aria-hidden="true">
            <Users size={compact ? 18 : 22} />
          </span>
          <span className={styles.speakerOptionCopy}>
            <small>THE WHOLE ROOM</small>
            <strong>Everyone at Zemi #{event.number ?? '•'}</strong>
            <em>Any speaker, or anyone in the room, can pick it up.</em>
          </span>
          {!selected ? (
            <Check size={18} className={styles.speakerCheck} aria-hidden="true" />
          ) : null}
        </button>
        {lineup.map((speaker) => {
          const active = selected?.id === speaker.id;
          const timing = speakerTiming(speaker, event, now);
          const slot = slotLabel(speaker.slot);
          return (
            <button
              key={speaker.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`${styles.speakerOption} ${active ? styles.speakerOptionActive : ''}`}
              onClick={() => onSelect(speaker)}
            >
              <span className={styles.speakerFace}>
                <Avatar name={speaker.fullName} image={speaker.avatar} size={compact ? 44 : 56} />
                {timing === 'now' ? (
                  <span className={styles.speakerLiveDot} aria-hidden="true" />
                ) : null}
              </span>
              <span className={styles.speakerOptionCopy}>
                <small>
                  {ROLE_LABEL[speaker.role] ?? 'Speaker'}
                  {timing ? <b data-timing={timing}> · {TIMING[timing]}</b> : null}
                </small>
                <strong>{speaker.fullName}</strong>
                {speakerAffiliation(speaker) ? <em>{speakerAffiliation(speaker)}</em> : null}
                {speaker.talkTitle || speaker.slot?.agenda ? (
                  <span className={styles.speakerTalk}>
                    <Mic size={12} aria-hidden="true" /> {speaker.talkTitle || speaker.slot?.agenda}
                  </span>
                ) : null}
                {slot ? (
                  <span className={styles.speakerSlot}>
                    <Clock3 size={12} aria-hidden="true" /> {slot} WIB
                  </span>
                ) : null}
              </span>
              {active ? (
                <Check size={18} className={styles.speakerCheck} aria-hidden="true" />
              ) : null}
            </button>
          );
        })}
      </div>
      {selected && !compact ? <SpeakerPreview speaker={selected} event={event} /> : null}
    </div>
  );
}

/** The chosen speaker in full: who they are, what they talk about, when. */
export function SpeakerPreview({
  speaker,
  event,
}: {
  speaker: DiscussionSpeaker;
  event: Pick<EventOption, 'number' | 'title' | 'startsAt' | 'endsAt'>;
}) {
  const now = useNow(30_000);
  const timing = speakerTiming(speaker, event, now);
  const slot = slotLabel(speaker.slot);
  return (
    <div className={styles.speakerPreview} aria-live="polite">
      <Avatar name={speaker.fullName} image={speaker.avatar} size={88} />
      <div className={styles.speakerPreviewCopy}>
        <small>
          YOUR QUESTION GOES TO{timing ? <b data-timing={timing}> · {TIMING[timing]}</b> : null}
        </small>
        <strong>
          {speaker.fullName}
          {speaker.nickname ? <span> ({speaker.nickname})</span> : null}
        </strong>
        {speaker.headline ? <p className={styles.speakerHeadline}>{speaker.headline}</p> : null}
        {speakerAffiliation(speaker) ? (
          <p className={styles.speakerMeta}>
            {ROLE_LABEL[speaker.role] ?? 'Speaker'} · {speakerAffiliation(speaker)}
          </p>
        ) : (
          <p className={styles.speakerMeta}>
            {ROLE_LABEL[speaker.role] ?? 'Speaker'} at Zemi #{event.number ?? '•'}
          </p>
        )}
        {speaker.talkTitle ? (
          <p className={styles.speakerPreviewTalk}>
            <Mic size={14} aria-hidden="true" /> <span>&ldquo;{speaker.talkTitle}&rdquo;</span>
          </p>
        ) : null}
        {slot ? (
          <p className={styles.speakerMeta}>
            <Clock3 size={13} aria-hidden="true" />{' '}
            {speaker.slot?.agenda ? `${speaker.slot.agenda}, ` : ''}
            {slot} WIB
          </p>
        ) : null}
      </div>
      <Link
        href={`/speakers/${speaker.slug}`}
        target="_blank"
        rel="noreferrer"
        className={styles.speakerProfileLink}
        aria-label={`${speaker.fullName}'s profile (opens in a new tab)`}
        data-cursor="open"
      >
        Profile <ArrowUpRight size={15} />
      </Link>
    </div>
  );
}

/** Small "For Name" chip on cards and in the live list. */
export function SpeakerChip({
  speaker,
  size = 22,
  label = 'For',
}: {
  speaker: DiscussionSpeaker;
  size?: number;
  label?: string;
}) {
  return (
    <span
      className={styles.speakerChip}
      title={speaker.talkTitle ? `${speaker.fullName}: ${speaker.talkTitle}` : speaker.fullName}
    >
      <Avatar name={speaker.fullName} image={speaker.avatar} size={size} />
      <span>
        {label} <strong>{speaker.fullName}</strong>
        {speaker.talkTitle ? <em> · {speaker.talkTitle}</em> : null}
      </span>
    </span>
  );
}
