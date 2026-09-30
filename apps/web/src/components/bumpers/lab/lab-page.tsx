'use client';

import {
  ACCENTS,
  BUMPER_BACKGROUNDS,
  BUMPER_CATEGORIES,
  BUMPER_CATEGORY_META,
  BUMPER_KIND_META,
  BUMPER_KINDS,
  BUMPER_MASCOTS,
  BUMPER_TRANSITION_META,
  BUMPER_TRANSITIONS,
  planBumperTransitions,
  type BumperData,
  type BumperKind,
  type BumperMotionLevel,
  type BumperSlide,
  type BumperSlideInput,
  type BumperTheme,
  type BumperTransitionKey,
} from '@zemi/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { bumperKeys, bumpersApi } from '../api';
import { gsap } from '../engine/gsap';
import { SlideView } from '../engine/slide-view';
import { BumperStage } from '../engine/stage';
import { getTemplate } from '../templates';
import { BumperDirector } from '../transitions/director';
import { SAMPLE_DATA, SAMPLE_EVENT_ID, SAMPLE_PHOTO_ID, SAMPLE_THEME, sampleShow, sampleSlide } from './fixtures';

type Tab = 'templates' | 'transitions' | 'show';

declare global {
  interface Window {
    __bumperLab?: { next(): void; prev(): void; play(dir?: 1 | -1): void; replay?(): void; ready: boolean };
  }
}

function useParam(key: string, fallback: string): [string, (v: string) => void] {
  const sp = useSearchParams();
  const router = useRouter();
  const value = sp.get(key) ?? fallback;
  const set = useCallback(
    (v: string) => {
      const next = new URLSearchParams(sp.toString());
      next.set(key, v);
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [sp, router, key],
  );
  return [value, set];
}

const btn = 'rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10 aria-pressed:bg-white aria-pressed:text-ink';

interface LabSource {
  data: BumperData;
  eventId: string | null;
  /** Real slides by kind (when a real show is loaded). */
  byKind: Map<BumperKind, BumperSlide>;
  showSlides: BumperSlide[] | null;
  label: string;
}

/** Sample data, or a real show's data with real photos (?show=<id>). */
function useLabSource(): LabSource & { loading: boolean; error: string | null } {
  const sp = useSearchParams();
  const showId = sp.get('show');
  const q = useQuery({ queryKey: bumperKeys.detail(showId ?? 'none'), queryFn: ({ signal }) => bumpersApi.get(showId!, signal), enabled: !!showId });
  return useMemo(() => {
    if (showId && q.data) {
      const byKind = new Map<BumperKind, BumperSlide>();
      for (const s of q.data.slides) if (!byKind.has(s.kind)) byKind.set(s.kind, s);
      return { data: q.data.data, eventId: q.data.eventId, byKind, showSlides: q.data.slides, label: q.data.title, loading: false, error: null };
    }
    return {
      data: SAMPLE_DATA,
      eventId: SAMPLE_EVENT_ID,
      byKind: new Map(),
      showSlides: null,
      label: 'Sample data',
      loading: !!showId && q.isLoading,
      error: showId && q.error ? String((q.error as Error).message) : null,
    };
  }, [showId, q.data, q.isLoading, q.error]);
}

/** A slide of `kind` for the lab: the real show's first one of that kind, else the sample. */
function labSlide(src: LabSource, kind: BumperKind, id: string, style: Partial<BumperSlideInput['style']> = {}, preset?: Partial<BumperSlideInput>): BumperSlide {
  const real = src.byKind.get(kind);
  const photo = src.showSlides ? Object.keys(src.data.images)[0] : SAMPLE_PHOTO_ID;
  const withPhoto = style.background === 'image' ? { backgroundAssetId: photo ?? null } : {};
  if (real) return { ...real, id, style: { ...real.style, ...(preset?.style ?? {}), ...style, ...withPhoto } as BumperSlide['style'], fields: { ...real.fields, ...(preset?.fields ?? {}) } };
  return sampleSlide(kind, { ...(preset ?? {}), style: { ...(preset?.style ?? {}), ...style, ...withPhoto } }, id);
}

/**
 * /admin/stage/bumpers/lab: every template and transition with sample data (or a real show's
 * data with ?show=<id>). Operators browse it for ideas; builders use it for visual checks. URL
 * params drive everything so screenshots are reproducible:
 *   ?tab=templates&kind=speaker&bg=ink&accent=red&variant=right&mascot=all&preset=x&chrome=0
 *   ?tab=transitions&t=q-iris&from=speaker&to=qna&bga=ink&bgb=accent&accent=green&slow=0.35
 *   ?tab=show&motion=calm      (arrows or space to step, r replays)
 */
export function BumperLab() {
  const sp = useSearchParams();
  const [tab, setTab] = useParam('tab', 'templates');
  const chrome = sp.get('chrome') !== '0';
  const motion = (sp.get('motion') ?? 'full') as BumperMotionLevel;
  const slow = Number(sp.get('slow') ?? '1') || 1;
  const src = useLabSource();
  const theme = useMemo<BumperTheme>(() => ({ ...SAMPLE_THEME, motion, safeArea: sp.get('safe') === '1' }), [motion, sp]);

  useEffect(() => {
    gsap.globalTimeline.timeScale(slow);
    return () => {
      gsap.globalTimeline.timeScale(1);
    };
  }, [slow]);

  return (
    <div className="flex min-h-dvh flex-col bg-[#0e1116] text-white" data-bumper-lab="">
      {chrome ? (
        <header className="flex flex-wrap items-center gap-3 border-b border-white/10 px-5 py-3">
          <h1 className="font-display text-xl font-extrabold tracking-tight">Bumper lab</h1>
          <p className="mr-auto text-sm text-white/55">
            Every template and transition. Data: {src.loading ? 'loading...' : src.error ? `sample (${src.error})` : src.label}.
          </p>
          {(['templates', 'transitions', 'show'] as Tab[]).map((t) => (
            <button key={t} type="button" className={btn} aria-pressed={tab === t} onClick={() => setTab(t)}>
              {t === 'templates' ? 'Templates' : t === 'transitions' ? 'Transitions' : 'Full show'}
            </button>
          ))}
        </header>
      ) : null}
      {tab === 'transitions' ? <TransitionsTab chrome={chrome} theme={theme} src={src} /> : tab === 'show' ? <ShowTab chrome={chrome} theme={theme} src={src} /> : <TemplatesTab chrome={chrome} theme={theme} src={src} />}
    </div>
  );
}

function TemplatesTab({ chrome, theme, src }: { chrome: boolean; theme: BumperTheme; src: LabSource }) {
  const sp = useSearchParams();
  const [kind, setKind] = useParam('kind', 'welcome');
  const [variant, setVariant] = useParam('variant', '');
  const [bg, setBg] = useParam('bg', 'auto');
  const [accent, setAccent] = useParam('accent', 'auto');
  const [mascot, setMascot] = useParam('mascot', 'auto');
  const [presetKey, setPresetKey] = useParam('preset', '');
  const [replay, setReplay] = useState(0);
  const k = (BUMPER_KINDS as readonly string[]).includes(kind) ? (kind as BumperKind) : 'welcome';
  const template = getTemplate(k);
  const slide = useMemo(() => {
    const preset = getTemplate(k).presets?.find((p) => p.key === presetKey)?.slide;
    return labSlide(src, k, `lab-${k}`, { variant: variant || preset?.style?.variant || null, background: bg as never, accent: accent as never, mascot: mascot as never }, preset);
  }, [src, k, variant, bg, accent, mascot, presetKey]);
  const thumbs = useMemo(() => BUMPER_KINDS.map((kk) => labSlide(src, kk, `thumb-${kk}`)), [src]);

  useEffect(() => {
    window.__bumperLab = { next: () => setReplay((n) => n + 1), prev: () => setReplay((n) => n + 1), play: () => setReplay((n) => n + 1), replay: () => setReplay((n) => n + 1), ready: true };
  }, []);

  const stage = (
    <BumperStage className={chrome ? 'aspect-video w-full rounded-2xl' : 'h-dvh w-full'} letterbox="#000">
      <SlideView key={`${slide.kind}-${variant}-${bg}-${accent}-${mascot}-${replay}-${presetKey}`} slide={slide} theme={theme} data={src.data} showEventId={src.eventId} mode="live" autoplay />
    </BumperStage>
  );
  if (!chrome) return stage;
  const row = (label: string, options: string[], value: string, set: (v: string) => void) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-white/50">{label}</span>
      {options.map((o) => (
        <button key={o || 'default'} type="button" className={btn} aria-pressed={value === o} onClick={() => set(o)}>
          {o || 'default'}
        </button>
      ))}
    </div>
  );
  return (
    <div className="grid flex-1 gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-4">
        {stage}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn} onClick={() => setReplay((n) => n + 1)}>
            Replay entrance
          </button>
          <span className="ml-2 text-xs text-white/50">Variant</span>
          {[{ key: '', label: 'Default' }, ...(template.variants ?? [])].map((v) => (
            <button key={v.key || 'default'} type="button" className={btn} aria-pressed={variant === v.key} onClick={() => setVariant(v.key)}>
              {v.label}
            </button>
          ))}
        </div>
        {row('Background', [...BUMPER_BACKGROUNDS], bg, setBg)}
        {row('Accent', ['auto', ...ACCENTS], accent, setAccent)}
        {row('Characters', [...BUMPER_MASCOTS], mascot, setMascot)}
        {template.presets?.length ? row('Preset', ['', ...template.presets.map((p) => p.key)], presetKey, setPresetKey) : null}
        {sp.get('safe') === '1' ? <p className="text-xs text-white/50">Overscan safe area on.</p> : null}
        <p className="text-sm text-white/60">
          <strong className="text-white">{BUMPER_KIND_META[k].label}.</strong> {BUMPER_KIND_META[k].description}
        </p>
      </div>
      <aside className="max-h-[calc(100dvh-110px)] space-y-5 overflow-y-auto pr-1">
        {BUMPER_CATEGORIES.map((cat) => (
          <section key={cat}>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-white/50">{BUMPER_CATEGORY_META[cat].label}</h2>
            <div className="grid grid-cols-2 gap-2">
              {thumbs
                .filter((s) => BUMPER_KIND_META[s.kind].category === cat)
                .map((s) => (
                  <button key={s.id} type="button" onClick={() => setKind(s.kind)} className="group text-left" aria-pressed={s.kind === k}>
                    <BumperStage className="aspect-video w-full rounded-lg ring-1 ring-white/10 group-aria-pressed:ring-2 group-aria-pressed:ring-white" letterbox="#111">
                      <SlideView slide={s} theme={theme} data={src.data} showEventId={src.eventId} mode="thumb" />
                    </BumperStage>
                    <span className="mt-1 block text-xs text-white/70">{BUMPER_KIND_META[s.kind].label}</span>
                  </button>
                ))}
            </div>
          </section>
        ))}
      </aside>
    </div>
  );
}

function TransitionsTab({ chrome, theme, src }: { chrome: boolean; theme: BumperTheme; src: LabSource }) {
  const sp = useSearchParams();
  const [t, setT] = useParam('t', 'curtain-call');
  const [from, setFrom] = useParam('from', 'speaker');
  const [to, setTo] = useParam('to', 'qna');
  const accent = sp.get('accent') ?? 'auto';
  const bga = sp.get('bga') ?? 'auto';
  const bgb = sp.get('bgb') ?? 'auto';
  const key = (BUMPER_TRANSITIONS as readonly string[]).includes(t) ? (t as BumperTransitionKey) : 'crossfade';
  // Ids follow the pair, so each pair gets its own seeded layout (like a real show).
  const aId = `lab-a-${from}`;
  const bId = `lab-b-${to}`;
  const slides = useMemo<BumperSlide[]>(
    () => [labSlide(src, from as BumperKind, aId, { accent: accent as never, background: bga as never }), labSlide(src, to as BumperKind, bId, { accent: accent as never, background: bgb as never })],
    [src, from, to, aId, bId, accent, bga, bgb],
  );
  const [target, setTarget] = useState({ slideId: aId, seq: 0, transition: key as BumperTransitionKey | null, dir: 1 as 1 | -1 });
  const play = useCallback(
    (dir: 1 | -1 = 1) => setTarget((cur) => ({ slideId: cur.slideId === aId ? bId : aId, seq: cur.seq + 1, transition: key, dir: cur.slideId === aId ? dir : (-dir as 1 | -1) })),
    [key, aId, bId],
  );
  const [loop, setLoop] = useState(false);
  useEffect(() => {
    if (!loop) return;
    const id = setInterval(() => play(1), 3200);
    return () => clearInterval(id);
  }, [loop, play]);
  useEffect(() => {
    window.__bumperLab = { next: () => play(1), prev: () => play(-1), play: (d) => play(d ?? 1), ready: true };
  }, [play]);
  const stage = (
    <BumperStage className={chrome ? 'aspect-video w-full rounded-2xl' : 'h-dvh w-full'} letterbox="#000">
      <BumperDirector key={`${from}-${to}-${accent}-${bga}-${bgb}`} slides={slides} theme={theme} data={src.data} showEventId={src.eventId} target={target.slideId === aId || target.slideId === bId ? target : { ...target, slideId: aId }} initial="static" />
    </BumperStage>
  );
  if (!chrome) return stage;
  const select = (label: string, value: string, set: (v: string) => void) => (
    <label className="flex items-center gap-2 text-xs text-white/60">
      {label}
      <select className="rounded bg-white/10 px-2 py-1" value={value} onChange={(e) => set(e.target.value)}>
        {BUMPER_KINDS.map((kk) => (
          <option key={kk} value={kk} className="text-ink">
            {BUMPER_KIND_META[kk].label}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="grid flex-1 gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        {stage}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn} onClick={() => play(1)}>
            Play next
          </button>
          <button type="button" className={btn} onClick={() => play(-1)}>
            Play backwards
          </button>
          <button type="button" className={btn} aria-pressed={loop} onClick={() => setLoop((v) => !v)}>
            Loop
          </button>
          {select('From', from, setFrom)}
          {select('To', to, setTo)}
        </div>
        <p className="text-sm text-white/60">
          <strong className="text-white">{BUMPER_TRANSITION_META[key].label}.</strong> {BUMPER_TRANSITION_META[key].description}
        </p>
        <p className="text-xs text-white/40">Tip: add &amp;accent=green&amp;bga=ink&amp;bgb=accent to the address to try other colors.</p>
      </div>
      <aside className="grid max-h-[calc(100dvh-110px)] content-start gap-2 overflow-y-auto">
        {BUMPER_TRANSITIONS.map((tk) => (
          <button key={tk} type="button" className="rounded-xl border border-white/10 px-3 py-2 text-left text-sm hover:bg-white/5 aria-pressed:border-white" aria-pressed={tk === key} onClick={() => setT(tk)}>
            <span className="font-semibold">{BUMPER_TRANSITION_META[tk].label}</span>
            <span className="block text-xs text-white/55">{BUMPER_TRANSITION_META[tk].description}</span>
          </button>
        ))}
      </aside>
    </div>
  );
}

function ShowTab({ chrome, theme, src }: { chrome: boolean; theme: BumperTheme; src: LabSource }) {
  const slides = useMemo(() => (src.showSlides ? src.showSlides.filter((s) => !s.hidden) : sampleShow()), [src.showSlides]);
  const plan = useMemo(() => planBumperTransitions(slides, theme.motion), [slides, theme.motion]);
  const [i, setI] = useState(0);
  const [replay, setReplay] = useState(0);
  const [target, setTarget] = useState({ slideId: slides[0]?.id ?? null, seq: 0, dir: 1 as 1 | -1 });
  const go = useCallback(
    (d: 1 | -1) => {
      setI((cur) => {
        const n = Math.max(0, Math.min(slides.length - 1, cur + d));
        if (n !== cur) setTarget((t) => ({ slideId: slides[n]!.id, seq: t.seq + 1, dir: d }));
        return n;
      });
    },
    [slides],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') go(1);
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1);
      if (e.key === 'r') setReplay((n) => n + 1);
    };
    window.addEventListener('keydown', onKey);
    window.__bumperLab = { next: () => go(1), prev: () => go(-1), play: (d) => go(d ?? 1), replay: () => setReplay((n) => n + 1), ready: true };
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);
  const stage = (
    <BumperStage className={chrome ? 'aspect-video w-full rounded-2xl' : 'h-dvh w-full'} letterbox="#000">
      <BumperDirector slides={slides} theme={theme} data={src.data} showEventId={src.eventId} target={target} replay={replay} />
    </BumperStage>
  );
  if (!chrome) return stage;
  return (
    <div className="grid flex-1 gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-3">
        {stage}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn} onClick={() => go(-1)}>
            Previous
          </button>
          <button type="button" className={btn} onClick={() => go(1)}>
            Next
          </button>
          <button type="button" className={btn} onClick={() => setReplay((n) => n + 1)}>
            Replay in place
          </button>
          <span className="text-sm text-white/60">
            {i + 1} of {slides.length}. Arrow keys or space to step, r replays.
          </span>
        </div>
      </div>
      <ol className="space-y-1 text-sm">
        {slides.map((s, n) => (
          <li key={s.id} className={n === i ? 'font-bold text-white' : 'text-white/55'}>
            {n + 1}. {BUMPER_KIND_META[s.kind].label} <span className="text-xs text-white/40">via {BUMPER_TRANSITION_META[plan[s.id] ?? 'crossfade'].label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
