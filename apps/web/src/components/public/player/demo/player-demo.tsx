'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { REACTION_KINDS, type Accent, type ReactionKind } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { ChipButton } from '@/components/public/ui/chip';
import { cn } from '@/lib/utils';
import { ZemiPlayerLazy } from '../lazy';
import type { CaptionTrack, ZemiPlayerHandle } from '../types';
import {
  BROKEN_MP4,
  DEMO_CHAPTERS,
  FLOWER_MP4,
  FLOWER_VTT,
  FLOWER_WEBM,
  MUX_DURATION,
  MUX_HLS,
  fakeLqip,
  fakePoster,
  fakeStoryboard,
} from './fixtures';

const ACCENTS: Accent[] = ['blue', 'red', 'yellow', 'green'];
const ACCENT_SHAPE = { blue: 'circle', red: 'triangle', yellow: 'square', green: 'arch' } as const;

function Block({ id, eyebrow, title, description, children, dark }: { id: string; eyebrow: string; title: string; description?: ReactNode; children: ReactNode; dark?: boolean }) {
  return (
    <section
      id={id}
      data-nav-theme={dark ? 'dark' : undefined}
      className={cn('scroll-mt-28 py-[clamp(56px,9vh,112px)]', dark ? 'bg-surface-inverse text-ink-inverse' : 'border-t border-line')}
    >
      <div className="container-page flex flex-col gap-8">
        <header className="flex max-w-[52rem] flex-col gap-3">
          <p className={cn('label inline-flex items-center gap-2', dark ? 'text-ink-4' : 'text-ink-3')}>{eyebrow}</p>
          <h2 className="display text-display-m">{title}</h2>
          {description ? <p className={cn('text-body-l', dark ? 'text-ink-4' : 'text-ink-2')}>{description}</p> : null}
        </header>
        {children}
      </div>
    </section>
  );
}

function Toggle({ label, checked, onChange, dark }: { label: string; checked: boolean; onChange(v: boolean): void; dark?: boolean }) {
  return (
    <label className={cn('inline-flex cursor-pointer select-none items-center gap-3 rounded-full px-4 py-2 text-[0.9375rem] font-semibold', dark ? 'bg-white/10' : 'bg-surface-muted')}>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden="true"
        className={cn(
          'relative h-6 w-10 rounded-full transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue',
          checked ? 'bg-green' : dark ? 'bg-white/25' : 'bg-line-strong',
        )}
      >
        <span className={cn('absolute top-1 size-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-1')} />
      </span>
      {label}
    </label>
  );
}

export function PlayerDemo() {
  const storyboard = useMemo(() => fakeStoryboard(MUX_DURATION), []);
  const [accent, setAccent] = useState<Accent>('blue');
  const [theater, setTheater] = useState(false);

  // Captions from a same-origin blob URL, so the cross-origin MP4 needs no CORS mode.
  const [captions, setCaptions] = useState<CaptionTrack[] | undefined>(undefined);
  useEffect(() => {
    const url = URL.createObjectURL(new Blob([FLOWER_VTT], { type: 'text/vtt' }));
    setCaptions([{ src: url, srclang: 'en', label: 'English', kind: 'subtitles' }]);
    return () => URL.revokeObjectURL(url);
  }, []);

  /* live mock */
  const liveRef = useRef<ZemiPlayerHandle>(null);
  const [ingest, setIngest] = useState(true);
  const [viewers, setViewers] = useState(42);
  const [crowd, setCrowd] = useState(false);
  const [pasted, setPasted] = useState('');
  const [eventId, setEventId] = useState('');
  const [startedAt] = useState(() => new Date(Date.now() - 42 * 60_000 - 17_000).toISOString());
  const liveSrc = pasted.trim() || MUX_HLS;

  useEffect(() => {
    if (!crowd) return;
    const id = setInterval(() => {
      const kind = REACTION_KINDS[Math.floor(Math.random() * REACTION_KINDS.length)] as ReactionKind;
      liveRef.current?.burst(kind, 1 + Math.floor(Math.random() * 3));
      if (Math.random() < 0.3) setViewers((v) => Math.max(0, v + (Math.random() < 0.7 ? 1 : -1)));
    }, 450);
    return () => clearInterval(id);
  }, [crowd]);

  return (
    <>
      <Block
        id="hls"
        eyebrow="VOD · HLS with quality levels"
        title="A Friday, recorded."
        description="Hover the timeline for the storyboard preview and chapter names. Try the keyboard: space, j, l, numbers, ? for the list. Your spot is remembered."
      >
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Accent">
          <span className="label mr-1 text-ink-3">Accent</span>
          {ACCENTS.map((a) => (
            <ChipButton key={a} selected={accent === a} onClick={() => setAccent(a)} shape={ACCENT_SHAPE[a]}>
              {a}
            </ChipButton>
          ))}
          <span className="label ml-3 text-ink-3">Theater: {theater ? 'on' : 'off'}</span>
        </div>
        <div className={cn('transition-[margin] duration-500 ease-[var(--ease-out)]', theater && 'lg:-mx-[calc(var(--page-margin)-8px)]')}>
          <ZemiPlayerLazy
            mode="vod"
            title="Zemi #12: Traffic lights that learn"
            subtitle="Recorded Friday 13:15 to 15:15 WIB · Theater 2"
            sources={{ hls: MUX_HLS }}
            poster={fakePoster('Zemi #12', accent)}
            posterLqip={fakeLqip(accent)}
            accent={accent}
            storyboard={storyboard}
            chapters={DEMO_CHAPTERS}
            durationSec={MUX_DURATION}
            theater={theater}
            onTheaterChange={setTheater}
          />
        </div>
      </Block>

      <Block
        id="mp4"
        eyebrow="VOD · MP4 + WebM · captions"
        title="Short and sweet."
        description="Plain files: the player picks WebM (VP9) when the browser is sure about it, MP4 otherwise. Captions come from a VTT track, press c."
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
          <ZemiPlayerLazy
            mode="vod"
            title="A flower, five seconds"
            subtitle="MDN sample clip, CC0"
            sources={{ mp4: FLOWER_MP4, webm: FLOWER_WEBM }}
            poster={fakePoster('Flower', 'green')}
            posterLqip={fakeLqip('green')}
            accent="green"
            captions={captions}
          />
          <div className="flex flex-col gap-3 rounded-[28px] border border-line p-6">
            <p className="label text-ink-3">In a phone-sized box</p>
            <div className="mx-auto w-full max-w-[340px]">
              <ZemiPlayerLazy
                mode="vod"
                title="Same clip, tiny player"
                sources={{ mp4: FLOWER_MP4 }}
                accent="yellow"
                rememberPosition={false}
              />
            </div>
            <p className="text-[0.875rem] text-ink-3">Container queries size everything from the player width, not the screen.</p>
          </div>
        </div>
      </Block>

      <Block
        id="live"
        dark
        eyebrow="Live · mock controls"
        title="Happening now."
        description="Flip the signal off to see the slate, crank the viewers, or let the crowd react. Paste an HLS url and event id from the API to try the real thing."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Toggle dark label="Signal online" checked={ingest} onChange={setIngest} />
          <Toggle dark label="Crowd reacting" checked={crowd} onChange={setCrowd} />
          <label className="inline-flex items-center gap-3 rounded-full bg-white/10 px-4 py-2 text-[0.9375rem] font-semibold">
            Viewers
            <input
              type="range"
              min={0}
              max={500}
              value={viewers}
              onChange={(e) => setViewers(Number(e.target.value))}
              className="w-32 accent-[#f94141]"
              aria-valuetext={`${viewers} viewers`}
            />
            <span className="mono w-10 text-right">{viewers}</span>
          </label>
          <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-1.5" role="group" aria-label="Send a fake incoming burst">
            {REACTION_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className="rounded-full px-2.5 py-1 text-[0.8125rem] font-semibold hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                onClick={() => liveRef.current?.burst(k, 5)}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-[0.875rem] font-semibold text-ink-4">
            HLS url (optional)
            <input
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={MUX_HLS}
              className="h-12 rounded-[14px] border border-white/15 bg-white/5 px-4 text-[0.9375rem] text-white placeholder:text-white/35 focus:border-white/60 focus:outline-none"
              spellCheck={false}
              inputMode="url"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[0.875rem] font-semibold text-ink-4">
            Event id (optional, turns on SSE, heartbeats and real reactions)
            <input
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              placeholder="uuid of a live event"
              className="h-12 rounded-[14px] border border-white/15 bg-white/5 px-4 text-[0.9375rem] text-white placeholder:text-white/35 focus:border-white/60 focus:outline-none"
              spellCheck={false}
            />
          </label>
        </div>
        <ZemiPlayerLazy
          ref={liveRef}
          key={`${liveSrc}|${eventId.trim()}`}
          mode="live"
          title="Zemi #13: Robots that ask for help"
          subtitle="Theater 2 and online"
          sources={{ hls: liveSrc }}
          poster={fakePoster('Zemi #13', 'red')}
          posterLqip={fakeLqip('red')}
          accent="red"
          eventId={/^[0-9a-f-]{36}$/i.test(eventId.trim()) ? eventId.trim() : undefined}
          live={{ ingestOnline: ingest, viewers, startedAt }}
        />
        <p className="text-[0.875rem] text-ink-4">
          The default source is a recorded test stream pretending to be live, so the edge logic stays calm. Paste a real live url to see the
          jump to live button when you fall behind.
        </p>
      </Block>

      <Block id="states" eyebrow="States" title="When things go sideways." description="Waiting for the first frame of a live session, and a file that refuses to decode.">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <p className="label inline-flex items-center gap-2 text-ink-3">
              <ShapeIcon shape="circle" size={10} /> Live, not on air yet
            </p>
            <ZemiPlayerLazy
              mode="live"
              title="Zemi #14: Coming up"
              sources={{ hls: MUX_HLS }}
              accent="blue"
              live={{ ingestOnline: false, viewers: 3, startedAt: null }}
              reactions={false}
            />
          </div>
          <div className="flex flex-col gap-3">
            <p className="label inline-flex items-center gap-2 text-ink-3">
              <ShapeIcon shape="triangle" size={10} /> Error with retry
            </p>
            <ZemiPlayerLazy mode="vod" title="A broken file" sources={{ mp4: BROKEN_MP4 }} accent="red" rememberPosition={false} />
          </div>
        </div>
      </Block>
    </>
  );
}
