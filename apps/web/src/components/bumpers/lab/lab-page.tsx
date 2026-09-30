'use client';

import {
  ACCENTS,
  BUMPER_BACKGROUNDS,
  BUMPER_CATEGORIES,
  BUMPER_CATEGORY_META,
  BUMPER_KIND_META,
  BUMPER_KINDS,
  BUMPER_TRANSITION_META,
  BUMPER_TRANSITIONS,
  planBumperTransitions,
  type BumperKind,
  type BumperMotionLevel,
  type BumperSlide,
  type BumperTransitionKey,
} from '@zemi/shared';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { gsap } from '../engine/gsap';
import { SlideView } from '../engine/slide-view';
import { BumperStage } from '../engine/stage';
import { getTemplate } from '../templates';
import { BumperDirector } from '../transitions/director';
import { SAMPLE_DATA, SAMPLE_EVENT_ID, SAMPLE_THEME, sampleShow, sampleSlide } from './fixtures';

type Tab = 'templates' | 'transitions' | 'show';

declare global {
  interface Window {
    __bumperLab?: { next(): void; prev(): void; play(dir?: 1 | -1): void; ready: boolean };
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

/**
 * /admin/stage/bumpers/lab: every template and transition with sample data. Operators browse
 * it for ideas; builders use it for visual checks. URL params drive everything so screenshots
 * are reproducible (?tab=templates&kind=speaker&bg=ink&accent=red&variant=right&chrome=0).
 */
export function BumperLab() {
  const sp = useSearchParams();
  const [tab, setTab] = useParam('tab', 'templates');
  const chrome = sp.get('chrome') !== '0';
  const motion = (sp.get('motion') ?? 'full') as BumperMotionLevel;
  const slow = Number(sp.get('slow') ?? '1') || 1;
  const theme = useMemo(() => ({ ...SAMPLE_THEME, motion }), [motion]);

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
          <p className="mr-auto text-sm text-white/55">Every template and transition, with sample data.</p>
          {(['templates', 'transitions', 'show'] as Tab[]).map((t) => (
            <button key={t} type="button" className={btn} aria-pressed={tab === t} onClick={() => setTab(t)}>
              {t === 'templates' ? 'Templates' : t === 'transitions' ? 'Transitions' : 'Full show'}
            </button>
          ))}
        </header>
      ) : null}
      {tab === 'transitions' ? <TransitionsTab chrome={chrome} theme={theme} /> : tab === 'show' ? <ShowTab chrome={chrome} theme={theme} /> : <TemplatesTab chrome={chrome} theme={theme} />}
    </div>
  );
}

function TemplatesTab({ chrome, theme }: { chrome: boolean; theme: typeof SAMPLE_THEME }) {
  const sp = useSearchParams();
  const [kind, setKind] = useParam('kind', 'welcome');
  const [variant, setVariant] = useParam('variant', '');
  const [bg, setBg] = useParam('bg', 'auto');
  const [accent, setAccent] = useParam('accent', 'auto');
  const [replay, setReplay] = useState(0);
  const k = (BUMPER_KINDS as readonly string[]).includes(kind) ? (kind as BumperKind) : 'welcome';
  const template = getTemplate(k);
  const presetKey = sp.get('preset');
  const preset = template.presets?.find((p) => p.key === presetKey);
  const slide = useMemo(
    () =>
      sampleSlide(k, {
        ...(preset?.slide ?? {}),
        style: { ...(preset?.slide.style ?? {}), variant: variant || preset?.slide.style?.variant || null, background: bg as never, accent: accent as never },
      }),
    [k, variant, bg, accent, preset],
  );
  const thumbs = useMemo(() => BUMPER_KINDS.map((kk) => sampleSlide(kk)), []);

  useEffect(() => {
    window.__bumperLab = { next: () => setReplay((n) => n + 1), prev: () => setReplay((n) => n + 1), play: () => setReplay((n) => n + 1), ready: true };
  }, []);

  const stage = (
    <BumperStage className={chrome ? 'aspect-video w-full rounded-2xl' : 'h-dvh w-full'} letterbox="#000">
      <SlideView key={`${slide.kind}-${variant}-${bg}-${accent}-${replay}-${presetKey}`} slide={slide} theme={theme} data={SAMPLE_DATA} showEventId={SAMPLE_EVENT_ID} mode="live" autoplay />
    </BumperStage>
  );
  if (!chrome) return stage;
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-white/50">Background</span>
          {BUMPER_BACKGROUNDS.filter((b) => b !== 'image').map((b) => (
            <button key={b} type="button" className={btn} aria-pressed={bg === b} onClick={() => setBg(b)}>
              {b}
            </button>
          ))}
          <span className="ml-2 text-xs text-white/50">Accent</span>
          {['auto', ...ACCENTS].map((a) => (
            <button key={a} type="button" className={btn} aria-pressed={accent === a} onClick={() => setAccent(a)}>
              {a}
            </button>
          ))}
        </div>
        {template.presets?.length ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-white/50">Presets</span>
            {template.presets.map((p) => (
              <a key={p.key} className={btn} aria-pressed={presetKey === p.key} href={`?tab=templates&kind=${k}&preset=${p.key}`}>
                {p.label}
              </a>
            ))}
          </div>
        ) : null}
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
                      <SlideView slide={s} theme={theme} data={SAMPLE_DATA} showEventId={SAMPLE_EVENT_ID} mode="thumb" />
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

function TransitionsTab({ chrome, theme }: { chrome: boolean; theme: typeof SAMPLE_THEME }) {
  const [t, setT] = useParam('t', 'curtain-call');
  const [from, setFrom] = useParam('from', 'speaker');
  const [to, setTo] = useParam('to', 'qna');
  const key = (BUMPER_TRANSITIONS as readonly string[]).includes(t) ? (t as BumperTransitionKey) : 'crossfade';
  const slides = useMemo<BumperSlide[]>(() => [sampleSlide(from as BumperKind, {}, 'lab-a'), sampleSlide(to as BumperKind, {}, 'lab-b')], [from, to]);
  const [target, setTarget] = useState({ slideId: 'lab-a', seq: 0, transition: key as BumperTransitionKey | null, dir: 1 as 1 | -1 });
  const play = useCallback(
    (dir: 1 | -1 = 1) => setTarget((cur) => ({ slideId: cur.slideId === 'lab-a' ? 'lab-b' : 'lab-a', seq: cur.seq + 1, transition: key, dir: cur.slideId === 'lab-a' ? dir : (-dir as 1 | -1) })),
    [key],
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
      <BumperDirector key={`${from}-${to}`} slides={slides} theme={theme} data={SAMPLE_DATA} showEventId={SAMPLE_EVENT_ID} target={target} initial="static" />
    </BumperStage>
  );
  if (!chrome) return stage;
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
          <label className="ml-3 flex items-center gap-2 text-xs text-white/60">
            From
            <select className="rounded bg-white/10 px-2 py-1" value={from} onChange={(e) => setFrom(e.target.value)}>
              {BUMPER_KINDS.map((kk) => (
                <option key={kk} value={kk} className="text-ink">
                  {BUMPER_KIND_META[kk].label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-white/60">
            To
            <select className="rounded bg-white/10 px-2 py-1" value={to} onChange={(e) => setTo(e.target.value)}>
              {BUMPER_KINDS.map((kk) => (
                <option key={kk} value={kk} className="text-ink">
                  {BUMPER_KIND_META[kk].label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-sm text-white/60">
          <strong className="text-white">{BUMPER_TRANSITION_META[key].label}.</strong> {BUMPER_TRANSITION_META[key].description}
        </p>
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

function ShowTab({ chrome, theme }: { chrome: boolean; theme: typeof SAMPLE_THEME }) {
  const slides = useMemo(() => sampleShow(), []);
  const plan = useMemo(() => planBumperTransitions(slides, theme.motion), [slides, theme.motion]);
  const [i, setI] = useState(0);
  const [target, setTarget] = useState({ slideId: slides[0]!.id, seq: 0, dir: 1 as 1 | -1 });
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
    };
    window.addEventListener('keydown', onKey);
    window.__bumperLab = { next: () => go(1), prev: () => go(-1), play: (d) => go(d ?? 1), ready: true };
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);
  const stage = (
    <BumperStage className={chrome ? 'aspect-video w-full rounded-2xl' : 'h-dvh w-full'} letterbox="#000">
      <BumperDirector slides={slides} theme={theme} data={SAMPLE_DATA} showEventId={SAMPLE_EVENT_ID} target={target} />
    </BumperStage>
  );
  if (!chrome) return stage;
  return (
    <div className="grid flex-1 gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-3">
        {stage}
        <p className="text-sm text-white/60">Arrow keys or space to step through. {i + 1} of {slides.length}.</p>
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
