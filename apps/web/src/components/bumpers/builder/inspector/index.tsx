'use client';

import { BUMPER_KIND_META, type BumperSlide } from '@zemi/shared';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMediaQuery } from '@/lib/admin/hooks';
import { ReadOnlyScope } from '@/components/admin/fields/read-only';
import { Callout, EmptyState } from '@/components/admin/ui/feedback';
import { Button } from '@/components/admin/ui/button';
import { Tabs } from '@/components/admin/ui/tabs';
import { elementLabel, slideName } from '../canvas/labels';
import { useCanvasSnapshot, useInspectorFocusRequests } from '../canvas/registry';
import { useBuilder, type InspectorTab } from '../store';
import { ContentTab, isOptionField } from './content-tab';
import { useInspectorCtx, type InspectorCtx } from './context';
import { ElementTab } from './element-tab';
import { NotesTab } from './notes-tab';
import { StyleTab } from './style-tab';
import { TimingTab } from './timing-tab';

type Tab = InspectorTab;

const TAB_LABEL: Record<Tab, string> = { content: 'Content', style: 'Style', timing: 'Timing', element: 'Element', notes: 'Notes' };

interface FocusTarget {
  tab: Tab;
  /** `data-focus` value of the control to focus, if any. */
  selector: string | null;
  more?: boolean;
}

/** Canvas element ids that mean a field with another name. */
const ALIAS: Record<string, string[]> = {
  meta: ['role', 'org', 'position'],
  role: ['role', 'position'],
  qr: ['url'],
  scan: ['url', 'qrLabel'],
  timer: ['minutes', 'to', 'until'],
  countdown: ['to', 'minutes', 'until'],
  clock: ['until', 'time', 'to'],
  face: ['until', 'time'],
  until: ['until', 'minutes'],
  when: ['date', 'time'],
  where: ['room', 'venue'],
  who: ['name'],
  lead: ['body', 'subtitle'],
  kicker: ['eyebrow'],
  quote: ['quote', 'title'],
  word: ['word', 'title'],
};
const PERSON_ELS = new Set(['photo', 'portrait', 'avatar', 'who', 'speaker', 'name', 'person']);
const LIST_ELS = new Set(['rows', 'rules', 'list', 'items', 'socials', 'links', 'roll', 'table', 'logos', 'chips', 'cards', 'stack']);

function targetFor(ic: InspectorCtx, key: string): FocusTarget {
  if (key.startsWith('x:')) return { tab: 'element', selector: 'extra:main' };
  const fields = ic.template.fields;
  const has = (k: string) => fields.some((f) => f.key === k);
  const field = has(key) ? key : ALIAS[key]?.find(has);
  if (field) return { tab: 'content', selector: `field:${field}`, more: isOptionField(ic, field) };
  const refs = BUMPER_KIND_META[ic.slide.kind].refs;
  if (PERSON_ELS.has(key)) {
    if (refs.includes('person')) return { tab: 'content', selector: 'ref:person' };
    if (refs.includes('speaker')) return { tab: 'content', selector: 'ref:speaker' };
    if (refs.includes('speakers')) return { tab: 'content', selector: 'ref:speakers' };
  }
  if (refs.includes('images') && (key === 'logos' || key === 'sponsors')) return { tab: 'content', selector: 'ref:images' };
  if (refs.includes('image') && (key === 'image' || key === 'photo' || key === 'polaroid')) return { tab: 'content', selector: 'ref:image' };
  if (ic.template.items && LIST_ELS.has(key)) return { tab: 'content', selector: 'items' };
  if (refs.includes('threads') && (key === 'card' || key === 'cards' || key === 'bubble' || key === 'question')) return { tab: 'content', selector: 'ref:threads' };
  if (refs.includes('publication') && (key === 'title' || key === 'authors' || key === 'venue' || key === 'type' || key === 'cover')) return { tab: 'content', selector: 'ref:publication' };
  if (refs.includes('rundown') && (key === 'title' || key === 'time')) return { tab: 'content', selector: 'ref:rundown' };
  if (refs.includes('event') && (key === 'title' || key === 'poster')) return { tab: 'content', selector: 'ref:event' };
  return { tab: 'element', selector: null };
}

/** What to focus in a requested control, best first: something to type in, then a picker, then any button. */
const FOCUS_ORDER = ['textarea:not([disabled])', 'input:not([type=hidden]):not([disabled])', '[role=combobox]', '[role=radio][data-state=checked]', '[role=radio]', 'button:not([disabled])', '[tabindex]:not([tabindex="-1"])'];

function focusTarget(box: HTMLElement): HTMLElement | null {
  for (const sel of FOCUS_ORDER) {
    if (box.matches(sel)) return box;
    const hit = box.querySelector<HTMLElement>(sel);
    if (hit) return hit;
  }
  return null;
}

/**
 * The inspector: Content, Style, Timing, Element (while one is selected on the canvas) and
 * Notes for the current bumper. Fills its container and scrolls on its own.
 */
export function BuilderInspector() {
  const { slide, state } = useBuilder();
  if (!slide) {
    return (
      <div className="flex h-full items-center justify-center p-5">
        <EmptyState size="sm" framed={false} title={state.doc.slides.length ? 'Pick a bumper' : 'Nothing to inspect yet'} description={state.doc.slides.length ? 'Its fields, style and timing show up here.' : 'Add a bumper and its settings show up here.'} cast={[{ shape: 'arch', mood: 'look', size: 44, lookAt: { x: -0.7, y: 0.2 } }]} />
      </div>
    );
  }
  return <InspectorBody slide={slide} />;
}

function InspectorBody({ slide }: { slide: BumperSlide }) {
  const b = useBuilder();
  const ic = useInspectorCtx(slide);
  const snapshot = useCanvasSnapshot();
  const wide = useMediaQuery('(min-width: 1280px)', true);
  const rootRef = useRef<HTMLDivElement>(null);
  const back = useRef<Tab>('content');
  const seenEl = useRef<string | null>(b.state.element);
  const [moreOpen, setMoreOpen] = useState(false);
  const [focus, setFocus] = useState<{ selector: string; n: number } | null>(null);
  const tab = b.state.inspectorTab;
  const elementKey = b.state.element;
  const el = elementKey && snapshot.slideId === slide.id ? (snapshot.elements.find((e) => e.key === elementKey) ?? null) : null;
  const activeTab: Tab = tab === 'element' && !el ? 'content' : tab;
  const { setInspectorTab } = b;

  // Selecting an element on the canvas opens its tab; deselecting goes back where you were.
  useEffect(() => {
    if (seenEl.current === elementKey) return;
    seenEl.current = elementKey;
    if (elementKey && tab !== 'element') {
      back.current = tab;
      setInspectorTab('element');
    } else if (!elementKey && tab === 'element') setInspectorTab(back.current);
  }, [elementKey, tab, setInspectorTab]);

  // A different bumper starts at the top of the inspector.
  useEffect(() => {
    rootRef.current?.scrollTo({ top: 0 });
  }, [slide.id]);

  const pickTab = (v: Tab, open?: boolean) => {
    if (v !== 'element') back.current = v;
    setInspectorTab(v, open);
  };

  useInspectorFocusRequests((r) => {
    if (r.slideId !== slide.id) return;
    const t = targetFor(ic, r.elementKey);
    pickTab(t.tab, true);
    if (t.more) setMoreOpen(true);
    if (t.selector) setFocus((f) => ({ selector: t.selector!, n: (f?.n ?? 0) + 1 }));
  });

  // Focus (and briefly highlight) the control a canvas double-click asked for.
  useEffect(() => {
    if (!focus) return;
    const raf = requestAnimationFrame(() => {
      const box = rootRef.current?.querySelector<HTMLElement>(`[data-focus="${focus.selector}"]`);
      if (!box) return;
      const target = focusTarget(box);
      box.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target?.focus({ preventScroll: true });
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) target.select();
      box.animate?.([{ boxShadow: '0 0 0 4px rgba(58,109,197,0.28)', borderRadius: '16px' }, { boxShadow: '0 0 0 0 rgba(58,109,197,0)', borderRadius: '16px' }], { duration: 1100, easing: 'ease-out' });
    });
    return () => cancelAnimationFrame(raf);
  }, [focus, activeTab]);

  const index = b.state.doc.slides.findIndex((s) => s.id === slide.id);
  const total = b.state.doc.slides.length;
  const archived = b.state.status === 'archived';
  const panels: Record<Tab, ReactNode> = {
    content: <ContentTab ic={ic} moreOpen={moreOpen} onMoreOpen={setMoreOpen} />,
    style: <StyleTab ic={ic} />,
    timing: <TimingTab ic={ic} />,
    element: el ? <ElementTab ic={ic} el={el} /> : null,
    notes: <NotesTab ic={ic} />,
  };

  return (
    <div ref={rootRef} className="h-full overflow-y-auto overscroll-contain bg-white" data-bumper-inspector="">
      <div className="px-4 pt-4 pb-3 sm:px-5">
        <p className="label text-ink-3">
          {BUMPER_KIND_META[slide.kind].label} · {index + 1} of {total}
          {slide.hidden ? ' · hidden' : ''}
        </p>
        <h2 className="mt-1 truncate font-display text-lg leading-tight font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.2]">{slideName(slide, ic.theme, ic.data, ic.showEventId)}</h2>
      </div>
      {!ic.canEdit ? (
        <div className="px-4 pb-3 sm:px-5">
          <Callout tone="neutral">{archived ? 'This show is archived, so everything here is view only until it is restored.' : 'You can look around. Changes need Build bumpers access for this Friday.'}</Callout>
        </div>
      ) : null}
      <ReadOnlyScope readOnly={!ic.canEdit}>
        {wide ? (
          <Tabs<Tab>
            aria-label="Bumper settings"
            value={activeTab}
            onValueChange={(v) => pickTab(v)}
            listClassName="sticky top-0 z-10 gap-3.5 bg-white px-4 sm:px-5"
            items={(Object.keys(TAB_LABEL) as Tab[]).map((t) => ({ value: t, label: TAB_LABEL[t], hidden: t === 'element' && !el, content: panels[t] }))}
          />
        ) : (
          <>
            {el ? (
              <div className="sticky top-0 z-10 flex items-center gap-2 border-y border-line bg-white px-4 py-2 sm:px-5">
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className="text-ink-3">{activeTab === 'element' ? 'Element: ' : 'Selected: '}</span>
                  <span className="font-semibold text-ink">{elementLabel(slide, el)}</span>
                </span>
                {activeTab === 'element' ? (
                  <Button size="xs" variant="ghost" onClick={() => b.selectElement(null)}>
                    Done
                  </Button>
                ) : (
                  <Button size="xs" variant="secondary" onClick={() => pickTab('element')}>
                    Edit element
                  </Button>
                )}
              </div>
            ) : null}
            <div role="region" aria-label={TAB_LABEL[activeTab]}>
              {panels[activeTab]}
            </div>
          </>
        )}
      </ReadOnlyScope>
    </div>
  );
}
