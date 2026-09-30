'use client';

import { BUMPER_TONES, type BumperElement, type BumperQrStyle, type ShapeName } from '@zemi/shared';
import { useRef } from 'react';
import { Field } from '@/components/admin/ui/field';
import { Input, Textarea } from '@/components/admin/ui/input';
import { Select } from '@/components/admin/ui/select';
import { Slider } from '@/components/admin/ui/slider';
import { SegmentedControl, Switch } from '@/components/admin/ui/toggles';
import { cn } from '@/lib/admin/cn';
import { QR_TONES } from '../../parts/qr';
import { Sticker, STICKER_KEYS, STICKERS } from '../../parts/stickers';
import { ImageField } from '../pickers/image-picker';
import { QrCheck } from '../qr-check';
import { useBuilder } from '../store';
import type { InspectorCtx } from './context';
import { DraftNumberInput, insertAt, TimeFieldInput, TokenMenu } from './inputs';
import { ShapePicker, ToneSwatches } from './ui';

type Props = BumperElement['props'];
type Value = Props[string];

const str = (v: Value | undefined, d = '') => (typeof v === 'string' ? v : v == null ? d : String(v));
const num = (v: Value | undefined, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : d);
const bool = (v: Value | undefined, d: boolean) => (typeof v === 'boolean' ? v : d);
const SHAPES: ReadonlySet<string> = new Set(['circle', 'triangle', 'square', 'arch']);
const shapeOf = (v: Value | undefined): ShapeName => (SHAPES.has(str(v)) ? (str(v) as ShapeName) : 'circle');

const MOODS = [
  { value: 'happy', label: 'Happy' },
  { value: 'idle', label: 'Curious' },
  { value: 'wink', label: 'Wink' },
  { value: 'surprised', label: 'Surprised' },
  { value: 'determined', label: 'Determined' },
  { value: 'sleepy', label: 'Sleepy' },
  { value: 'closed', label: 'Eyes closed' },
];

/** The free element's own settings: text and font, image, QR, shape, character, sticker, clock, countdown, logo, line. */
export function ExtraProps({ el, ic }: { el: BumperElement; ic: InspectorCtx }) {
  const b = useBuilder();
  const { slide, ctx, canEdit } = ic;
  const ro = !canEdit;
  const p = el.props;
  const set = (key: string, value: Value) => b.updateExtra(slide.id, el.id, (e) => ({ ...e, props: { ...e.props, [key]: value } }), `extra:${slide.id}:${el.id}:${key}`);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const tone = (label: string, key = 'tone', d = 'ink', tones: readonly string[] = BUMPER_TONES) => (
    <Field label={label}>
      <ToneSwatches label={label} value={str(p[key], d)} onChange={(v) => set(key, v ?? d)} tones={tones} colors={ctx.colors} readOnly={ro} />
    </Field>
  );

  switch (el.type) {
    case 'text': {
      const font = str(p.font, 'display');
      const text = str(p.text);
      return (
        <div className="space-y-4">
          <div data-focus="extra:main">
            <Field label="Text" count={{ value: text.length, max: 600 }} action={ro ? null : <TokenMenu onInsert={(t) => {
              const { value, caret } = insertAt(textRef.current, text, t);
              set('text', value);
              requestAnimationFrame(() => {
                textRef.current?.focus();
                textRef.current?.setSelectionRange(caret, caret);
              });
            }} />}>
              <Textarea ref={textRef} value={text} maxLength={600} minRows={2} maxRows={8} readOnly={ro} onChange={(e) => set('text', e.target.value)} placeholder="Say something" />
            </Field>
          </div>
          <Field label="Font">
            <SegmentedControl aria-label="Font" size="sm" fullWidth value={font} onValueChange={(v) => !ro && set('font', v)} options={[{ value: 'display', label: 'Display' }, { value: 'body', label: 'Body' }, { value: 'mono', label: 'Mono' }]} />
          </Field>
          <Field label="Size">
            <DraftNumberInput value={num(p.size, 96)} onCommit={(v) => set('size', v)} min={12} max={400} step={4} unit="px" readOnly={ro} />
          </Field>
          <Switch checked={bool(p.uppercase, false)} onCheckedChange={(v) => set('uppercase', v)} label="All capitals" disabled={ro} />
          <Slider label="Weight" value={num(p.weight, font === 'body' ? 500 : 900)} onChange={(v) => set('weight', v)} min={300} max={1000} step={50} defaultValue={font === 'body' ? 500 : 900} display={num(p.weight, font === 'body' ? 500 : 900)} disabled={ro} />
          {font === 'display' ? <Slider label="Casual" value={num(p.casl, 0.3)} onChange={(v) => set('casl', Math.round(v * 100) / 100)} min={0} max={1} step={0.05} defaultValue={0.3} display={num(p.casl, 0.3).toFixed(2)} disabled={ro} /> : null}
          {tone('Color')}
          <Field label="Highlighter">
            <ToneSwatches label="Highlighter" value={str(p.highlight) || null} onChange={(v) => set('highlight', v ?? '')} tones={['yellow', 'blue', 'red', 'green', 'accent']} colors={ctx.colors} readOnly={ro} allowAuto autoLabel="None" />
          </Field>
        </div>
      );
    }
    case 'image':
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-ink">Image</p>
            <ImageField label="Image" focusKey="extra:main" value={str(p.assetId) || null} image={p.assetId ? (ic.data.images[str(p.assetId)] ?? null) : null} eventId={ic.eventId} readOnly={ro} onChange={(id) => set('assetId', id)} />
          </div>
          <Field label="Fit">
            <SegmentedControl aria-label="Fit" size="sm" fullWidth value={str(p.fit, 'cover')} onValueChange={(v) => !ro && set('fit', v)} options={[{ value: 'cover', label: 'Fill the box' }, { value: 'contain', label: 'Show it all' }]} />
          </Field>
          <Slider label="Corners" value={num(p.radius, 24)} onChange={(v) => set('radius', v)} min={0} max={200} step={2} defaultValue={24} display={`${num(p.radius, 24)} px`} disabled={ro} />
        </div>
      );
    case 'qr': {
      const url = str(p.url);
      const style = (str(p.style) || ic.theme.qrStyle) as BumperQrStyle;
      const logo = bool(p.logo, true);
      const toneKey = str(p.tone, 'ink');
      return (
        <div className="space-y-4">
          <div data-focus="extra:main" className="space-y-2">
            <Field label="Link" hint={url ? undefined : `Empty uses ${ctx.site.qnaShort}.`}>
              <Input type="url" inputMode="url" spellCheck={false} autoComplete="off" value={url} maxLength={500} placeholder={ctx.site.qnaUrl} readOnly={ro} onChange={(e) => set('url', e.target.value)} />
            </Field>
            <QrCheck value={ctx.fill(url) || ctx.site.qnaUrl} style={style} logo={logo} color={QR_TONES[toneKey] ?? QR_TONES.ink} size={Math.min(el.box.w, el.box.h - (str(p.label) ? 38 : 0))} />
          </div>
          <Field label="Label under it" count={{ value: str(p.label).length, max: 60 }}>
            <Input value={str(p.label)} maxLength={60} placeholder="Scan to ask" readOnly={ro} onChange={(e) => set('label', e.target.value)} />
          </Field>
          <Field label="Style">
            <SegmentedControl
              aria-label="QR style"
              size="sm"
              fullWidth
              value={str(p.style) || 'theme'}
              onValueChange={(v) => !ro && set('style', v === 'theme' ? null : v)}
              options={[{ value: 'theme', label: 'Theme' }, { value: 'rounded', label: 'Rounded' }, { value: 'dots', label: 'Dots' }, { value: 'square', label: 'Square' }]}
            />
          </Field>
          {tone('Color', 'tone', 'ink', Object.keys(QR_TONES))}
          <Switch checked={logo} onCheckedChange={(v) => set('logo', v)} label="Zemi mark in the middle" description="Looks lovely, costs a little scan margin." disabled={ro} />
        </div>
      );
    }
    case 'shape':
      return (
        <div className="space-y-4" data-focus="extra:main">
          <Field label="Shape">
            <ShapePicker label="Shape" value={shapeOf(p.shape)} onChange={(v) => set('shape', v)} readOnly={ro} />
          </Field>
          {tone('Color', 'tone', 'blue')}
          <Switch checked={bool(p.eyes, false)} onCheckedChange={(v) => set('eyes', v)} label="Give it eyes" description="Two eyes, no mouth. It becomes a character." disabled={ro} />
        </div>
      );
    case 'character':
      return (
        <div className="space-y-4" data-focus="extra:main">
          <Field label="Who">
            <ShapePicker label="Character" value={shapeOf(p.shape)} onChange={(v) => set('shape', v)} readOnly={ro} />
          </Field>
          <Field label="Mood">
            <Select value={str(p.mood, 'happy')} onValueChange={(v) => v && set('mood', v)} options={MOODS} readOnly={ro} />
          </Field>
          <Slider label="Looks left or right" value={num(p.lookX, 0)} onChange={(v) => set('lookX', v)} min={-1} max={1} step={0.1} centered defaultValue={0} display={num(p.lookX, 0).toFixed(1)} disabled={ro} />
          <Slider label="Looks up or down" value={num(p.lookY, 0)} onChange={(v) => set('lookY', v)} min={-1} max={1} step={0.1} centered defaultValue={0} display={num(p.lookY, 0).toFixed(1)} disabled={ro} />
        </div>
      );
    case 'sticker': {
      const cur = str(p.sticker, 'spark');
      return (
        <div data-focus="extra:main">
          <Field label="Sticker">
            <div role="radiogroup" aria-label="Sticker" className="grid grid-cols-6 gap-1">
              {STICKER_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={cur === k}
                  aria-label={STICKERS[k]!.label}
                  title={STICKERS[k]!.label}
                  disabled={ro}
                  onClick={() => set('sticker', k)}
                  className={cn('flex aspect-square items-center justify-center rounded-xl p-1.5 transition hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus', cur === k && 'bg-blue-50 ring-1 ring-blue')}
                >
                  <Sticker name={k} />
                </button>
              ))}
            </div>
          </Field>
        </div>
      );
    }
    case 'clock':
      return (
        <div className="space-y-4" data-focus="extra:main">
          <p className="text-sm text-ink-3">The time in WIB, ticking live.</p>
          <Field label="Size">
            <DraftNumberInput value={num(p.size, 96)} onCommit={(v) => set('size', v)} min={16} max={400} step={4} unit="px" readOnly={ro} />
          </Field>
          {tone('Color')}
        </div>
      );
    case 'countdown':
      return (
        <div className="space-y-4">
          <div data-focus="extra:main">
            <Field label="Counts down to" hint="HH:mm in WIB, on the event's day.">
              <TimeFieldInput value={str(p.to)} onCommit={(v) => set('to', v)} readOnly={ro} aria-label="Counts down to" />
            </Field>
          </div>
          <Field label="When it hits zero">
            <Input value={str(p.done, 'Now')} maxLength={40} readOnly={ro} onChange={(e) => set('done', e.target.value)} />
          </Field>
          <Field label="Look">
            <SegmentedControl aria-label="Countdown look" size="sm" fullWidth value={str(p.variant, 'big')} onValueChange={(v) => !ro && set('variant', v)} options={[{ value: 'big', label: 'Big' }, { value: 'cells', label: 'Cells' }, { value: 'inline', label: 'Small' }]} />
          </Field>
          <Field label="Size">
            <DraftNumberInput value={num(p.size, 160)} onCommit={(v) => set('size', v)} min={16} max={400} step={4} unit="px" readOnly={ro} />
          </Field>
          {tone('Color')}
        </div>
      );
    case 'logo':
      return (
        <div className="space-y-4" data-focus="extra:main">
          <Field label="Colors">
            <SegmentedControl aria-label="Logo colors" size="sm" fullWidth value={str(p.tone, 'color')} onValueChange={(v) => !ro && set('tone', v)} options={[{ value: 'color', label: 'Color' }, { value: 'ink', label: 'Ink' }, { value: 'paper', label: 'Paper' }]} />
          </Field>
          <Switch checked={bool(p.wordmark, true)} onCheckedChange={(v) => set('wordmark', v)} label="Show the wordmark" description="The mark plus the word zemı." disabled={ro} />
        </div>
      );
    case 'line':
      return (
        <div className="space-y-4" data-focus="extra:main">
          <Field label="Style">
            <SegmentedControl aria-label="Line style" size="sm" fullWidth value={str(p.style, 'solid')} onValueChange={(v) => !ro && set('style', v)} options={[{ value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }, { value: 'squiggle', label: 'Squiggle' }]} />
          </Field>
          <Slider label="Thickness" value={num(p.thickness, 8)} onChange={(v) => set('thickness', v)} min={2} max={40} step={1} defaultValue={8} display={`${num(p.thickness, 8)} px`} disabled={ro} />
          {tone('Color', 'tone', 'accent')}
        </div>
      );
    default:
      return null;
  }
}
