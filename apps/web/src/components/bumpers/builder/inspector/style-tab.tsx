'use client';

import { ACCENTS, SHAPE_ORDER, type Accent, type BumperBackground, type BumperMascot, type BumperSlide } from '@zemi/shared';
import { Ban, ImageIcon, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { AccentPicker } from '@/components/admin/fields/simple-fields';
import { Callout } from '@/components/admin/ui/feedback';
import { AdminImage } from '@/components/admin/ui/media';
import { Slider } from '@/components/admin/ui/slider';
import { cn } from '@/lib/admin/cn';
import { ACCENT_HEX, ACCENT_SHAPE, GRAPH, INK, slideAccent, slideBackground } from '../../engine/palette';
import { SlideView } from '../../engine/slide-view';
import { BumperStage } from '../../engine/stage';
import { BumperCharacter } from '../../parts/character';
import { BrandShape } from '../../parts/shapes';
import { ImageField } from '../pickers/image-picker';
import { useBuilder } from '../store';
import type { InspectorCtx } from './context';
import { ChoiceCards, InspectorSection } from './ui';

const BG_LABEL: Record<BumperBackground, string> = { auto: 'Auto', paper: 'Paper', ink: 'Ink', accent: 'Accent', graph: 'Graph', image: 'Photo', transparent: 'Clear' };
const BG_HINT: Record<BumperBackground, string> = {
  auto: 'What the template and the theme pick',
  paper: 'White paper',
  ink: 'Dark ink',
  accent: 'The accent color, full bleed',
  graph: 'Graph paper, for work in progress',
  image: 'A photo, darkened so text reads',
  transparent: 'Nothing: the camera shows through in OBS',
};
const MASCOT_LABEL: Record<BumperMascot, string> = { auto: 'Auto', none: 'None', circle: 'Q', triangle: 'Hunch', square: 'Block', arch: 'Bridge', all: 'All four' };

function BackgroundArt({ kind, accent, image }: { kind: BumperBackground; accent: Accent; image?: ReactNode }) {
  const base = 'h-full w-full rounded-lg border border-black/10';
  switch (kind) {
    case 'paper':
      return <span className={cn(base, 'bg-white')} />;
    case 'ink':
      return <span className={base} style={{ background: `radial-gradient(circle at 30% 30%, ${ACCENT_HEX[accent]}55, transparent 70%), ${INK}` }} />;
    case 'accent':
      return <span className={base} style={{ background: ACCENT_HEX[accent] }} />;
    case 'graph':
      // One shorthand for every swatch kind: React warns when a re-render swaps shorthand and longhand.
      return <span className={base} style={{ background: `linear-gradient(to right, ${GRAPH} 1px, transparent 1px) 0 0 / 8px 8px, linear-gradient(to bottom, ${GRAPH} 1px, transparent 1px) 0 0 / 8px 8px, #fff` }} />;
    case 'image':
      return image ? <span className={cn(base, 'overflow-hidden')}>{image}</span> : <span className={cn(base, 'flex items-center justify-center bg-[#3b4150] text-white/80')}><ImageIcon className="size-4" /></span>;
    case 'transparent':
      return <span className={base} style={{ background: 'repeating-conic-gradient(#e5e5e0 0 25%, #ffffff 0 50%) 0 0 / 10px 10px' }} />;
    default:
      return (
        <span className={cn(base, 'flex items-center justify-center bg-surface-muted text-ink-3')}>
          <Sparkles className="size-4" />
        </span>
      );
  }
}

function MascotArt({ m }: { m: BumperMascot }) {
  if (m === 'none') return <Ban className="size-5 text-ink-4" />;
  if (m === 'auto') return <Sparkles className="size-5 text-ink-3" />;
  if (m === 'all')
    return (
      <span className="flex items-end gap-px">
        {SHAPE_ORDER.map((s) => (
          <span key={s} className="block size-3.5">
            <BumperCharacter shape={s} mood="happy" />
          </span>
        ))}
      </span>
    );
  return (
    <span className="block size-8">
      <BumperCharacter shape={m} mood="happy" />
    </span>
  );
}

/** A small static render of the slide in another variant. */
function VariantThumb({ slide, variant, ic }: { slide: BumperSlide; variant: string; ic: InspectorCtx }) {
  const s: BumperSlide = { ...slide, style: { ...slide.style, variant } };
  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg bg-surface-muted ring-1 ring-black/5">
      <BumperStage className="size-full" letterbox="transparent">
        <SlideView slide={s} theme={ic.theme} data={ic.data} showEventId={ic.showEventId} mode="thumb" />
      </BumperStage>
    </div>
  );
}

/** Style: layout variant, accent, background (including a photo), characters and text size. */
export function StyleTab({ ic }: { ic: InspectorCtx }) {
  const b = useBuilder();
  const { slide, template, theme, canEdit, data } = ic;
  const st = slide.style;
  const set = (patch: Partial<BumperSlide['style']>) => b.setStyle(slide.id, patch);
  const variants = template.variants ?? [];
  const currentVariant = st.variant && variants.some((v) => v.key === st.variant) ? st.variant : (variants[0]?.key ?? null);
  const themeAccent = slideAccent({ style: { ...st, accent: 'auto' } }, theme, ic.ctx.event);
  // What 'auto' turns into for this template and theme.
  const autoBg = slideBackground({ style: { ...st, background: 'auto' } }, theme, template.background);
  const bgImage = st.backgroundAssetId ? (data.images[st.backgroundAssetId] ?? null) : null;
  const overlayTemplate = !!template.overlay;

  return (
    <div>
      {variants.length > 1 ? (
        <InspectorSection title="Layout" description="Same content, a different arrangement.">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Layout">
            {variants.map((v) => {
              const on = v.key === currentVariant;
              return (
                <button
                  key={v.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!canEdit}
                  onClick={() => set({ variant: v.key === variants[0]?.key ? null : v.key })}
                  className={cn(
                    'group min-w-0 rounded-2xl border bg-white p-1.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:scale-[0.98] disabled:active:scale-100',
                    on ? 'border-blue shadow-[0_0_0_1px_var(--color-blue)]' : 'border-line hover:border-ink-4',
                  )}
                >
                  <VariantThumb slide={slide} variant={v.key} ic={ic} />
                  <span className="mt-1.5 block truncate px-1 text-[0.8125rem] font-medium text-ink">{v.label}</span>
                  {v.hint ? <span className="block truncate px-1 text-xs text-ink-3">{v.hint}</span> : null}
                </button>
              );
            })}
          </div>
        </InspectorSection>
      ) : null}

      <InspectorSection title="Accent" description={st.accent === 'auto' ? `Following the show (${themeAccent}).` : 'Only this bumper.'}>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            aria-pressed={st.accent === 'auto'}
            disabled={!canEdit}
            onClick={() => set({ accent: 'auto' })}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong bg-white pr-3.5 pl-2 text-sm font-medium text-ink-2 transition hover:border-ink-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-white"
          >
            <span className="block size-6">
              <BrandShape shape={ACCENT_SHAPE[themeAccent]} color={ACCENT_HEX[themeAccent]} />
            </span>
            Auto
          </button>
          <AccentPicker size="sm" value={(ACCENTS as readonly string[]).includes(st.accent) ? (st.accent as Accent) : null} onChange={(a) => set({ accent: a })} readOnly={!canEdit} aria-label="Accent for this bumper" />
        </div>
      </InspectorSection>

      {overlayTemplate ? null : (
        <InspectorSection title="Background" description={st.background === 'auto' ? `Auto: ${BG_LABEL[autoBg].toLowerCase()}, what the template and the theme pick.` : BG_HINT[st.background]}>
          <ChoiceCards<BumperBackground>
            label="Background"
            value={st.background}
            onChange={(v) => set({ background: v })}
            readOnly={!canEdit}
            columns={4}
            options={(['auto', 'paper', 'ink', 'accent', 'graph', 'image', 'transparent'] as BumperBackground[]).map((k) => ({
              value: k,
              label: BG_LABEL[k],
              description: k === 'auto' ? `Auto: ${BG_LABEL[autoBg].toLowerCase()} for this template` : BG_HINT[k],
              art:
                k === 'auto' ? (
                  <span className="relative block h-full w-full">
                    <BackgroundArt kind={autoBg} accent={ic.ctx.accent} />
                    <span className="absolute right-1 bottom-1 flex size-4 items-center justify-center rounded-full bg-white text-ink-2 shadow-[var(--shadow-1)]">
                      <Sparkles className="size-2.5" />
                    </span>
                  </span>
                ) : (
                  <BackgroundArt kind={k} accent={ic.ctx.accent} image={k === 'image' && bgImage ? <AdminImage image={bgImage} sizes="80px" alt="" className="size-full" /> : undefined} />
                ),
            }))}
          />
          {st.background === 'image' ? (
            <div className="space-y-3 pt-1">
              <ImageField label="Background photo" focusKey="style:background" value={st.backgroundAssetId} image={bgImage} eventId={ic.eventId} readOnly={!canEdit} emptyLabel="Pick a background photo" onChange={(id) => set({ backgroundAssetId: id })} />
              {!st.backgroundAssetId ? <p className="text-xs text-ink-3">Until you pick one, the show&apos;s background stays.</p> : null}
              <Slider label="Darken" value={st.dim} onChange={(v) => set({ dim: v })} min={0} max={0.9} step={0.05} defaultValue={0.4} display={`${Math.round(st.dim * 100)}%`} disabled={!canEdit} />
            </div>
          ) : null}
        </InspectorSection>
      )}

      <InspectorSection title="Characters" description={st.mascot === 'auto' ? 'The cast this template likes.' : undefined}>
        {theme.mascots ? null : (
          <Callout tone="neutral" className="mb-1">
            Characters are off for the whole show. Turn them on in Theme.
          </Callout>
        )}
        <ChoiceCards<BumperMascot>
          label="Characters"
          value={st.mascot}
          onChange={(v) => set({ mascot: v })}
          readOnly={!canEdit}
          columns={4}
          size="sm"
          options={(['auto', 'none', 'circle', 'triangle', 'square', 'arch', 'all'] as BumperMascot[]).map((m) => ({ value: m, label: MASCOT_LABEL[m], art: <MascotArt m={m} /> }))}
        />
      </InspectorSection>

      <InspectorSection title="Text size" description="Scales every text on this bumper. Long names shrink to fit anyway.">
        <Slider label="Scale" value={st.textScale} onChange={(v) => set({ textScale: Math.round(v * 100) / 100 })} min={0.6} max={1.6} step={0.05} defaultValue={1} display={`${Math.round(st.textScale * 100)}%`} disabled={!canEdit} />
      </InspectorSection>
    </div>
  );
}
