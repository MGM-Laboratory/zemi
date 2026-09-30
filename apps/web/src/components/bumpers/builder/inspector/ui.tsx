'use client';

import { SHAPE_ORDER, type ShapeName } from '@zemi/shared';
import { RadioGroup as RRadio } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/admin/cn';
import { toneHex, type SlideColors } from '../../engine/palette';
import { BrandShape } from '../../parts/shapes';

/** A titled group inside an inspector tab. */
export function InspectorSection({ title, description, action, children, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-3 border-b border-line px-4 py-5 last:border-b-0 sm:px-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-[0.9375rem] leading-tight font-extrabold tracking-[-0.01em] text-ink [font-variation-settings:'CASL'_0.2]">{title}</h3>
          {description ? <p className="mt-1 text-[0.8125rem] leading-snug text-ink-3">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export interface ChoiceOption<V extends string> {
  value: V;
  label: string;
  /** Visual inside the card. */
  art?: ReactNode;
  description?: string;
  disabled?: boolean;
}

/**
 * A grid of small radio cards (backgrounds, mascots, variants). Arrow keys move between them.
 */
export function ChoiceCards<V extends string>({ value, onChange, options, columns = 4, label, readOnly, size = 'md' }: { value: V | null; onChange: (v: V) => void; options: ChoiceOption<V>[]; columns?: 2 | 3 | 4 | 5; label: string; readOnly?: boolean; size?: 'sm' | 'md' }) {
  const cols = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5' }[columns];
  return (
    <RRadio.Root value={value ?? ''} onValueChange={(v) => onChange(v as V)} aria-label={label} disabled={readOnly} loop className={cn('grid gap-2', cols)}>
      {options.map((o) => (
        <RRadio.Item
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          title={o.description ?? o.label}
          className={cn(
            'group flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border border-line bg-white p-1.5 text-center transition-[border-color,box-shadow,transform] duration-150',
            'hover:border-ink-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:scale-[0.97]',
            'data-[state=checked]:border-blue data-[state=checked]:shadow-[0_0_0_1px_var(--color-blue)] disabled:cursor-default disabled:opacity-45 disabled:active:scale-100',
          )}
        >
          {o.art ? <span className={cn('flex w-full items-center justify-center overflow-hidden rounded-xl', size === 'sm' ? 'h-9' : 'h-12')}>{o.art}</span> : null}
          <span className="w-full truncate px-0.5 text-[0.75rem] leading-tight font-medium text-ink-2 group-data-[state=checked]:text-ink">{o.label}</span>
        </RRadio.Item>
      ))}
    </RRadio.Root>
  );
}

const TONE_LABEL: Record<string, string> = { ink: 'Ink', paper: 'Paper', blue: 'Blue', red: 'Red', green: 'Green', yellow: 'Yellow', accent: 'Accent', muted: 'Muted', color: 'Color' };

/** Tone swatches (ink, paper, the brand colors, the slide's accent, muted), as a radio group. */
export function ToneSwatches({ value, onChange, tones, colors, label, readOnly, allowAuto, autoLabel = 'Auto' }: { value: string | null; onChange: (v: string | null) => void; tones: readonly string[]; colors: SlideColors; label: string; readOnly?: boolean; allowAuto?: boolean; autoLabel?: string }) {
  return (
    <RRadio.Root value={value ?? '__auto'} onValueChange={(v) => onChange(v === '__auto' ? null : v)} aria-label={label} disabled={readOnly} loop orientation="horizontal" className="flex flex-wrap items-center gap-1.5">
      {allowAuto ? (
        <RRadio.Item
          value="__auto"
          className="h-8 rounded-full border border-line-strong bg-white px-3 text-xs font-medium text-ink-2 transition hover:border-ink-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus data-[state=checked]:border-ink data-[state=checked]:bg-ink data-[state=checked]:text-white"
        >
          {autoLabel}
        </RRadio.Item>
      ) : null}
      {tones.map((t) => {
        const hex = t === 'color' ? null : toneHex(t, colors);
        return (
          <RRadio.Item
            key={t}
            value={t}
            aria-label={TONE_LABEL[t] ?? t}
            title={TONE_LABEL[t] ?? t}
            className="relative flex size-8 items-center justify-center rounded-full ring-offset-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus data-[state=checked]:ring-2 data-[state=checked]:ring-ink"
          >
            <span
              className="block size-6 rounded-full border border-black/10"
              style={hex ? { background: hex } : { background: 'conic-gradient(#3a6dc5 0 25%, #f94141 0 50%, #f7bf33 0 75%, #0f8657 0)' }}
            />
          </RRadio.Item>
        );
      })}
    </RRadio.Root>
  );
}

/** The four brand shapes as a radio group. */
export function ShapePicker({ value, onChange, label, readOnly }: { value: ShapeName; onChange: (v: ShapeName) => void; label: string; readOnly?: boolean }) {
  return (
    <RRadio.Root value={value} onValueChange={(v) => onChange(v as ShapeName)} aria-label={label} disabled={readOnly} loop orientation="horizontal" className="flex items-center gap-1.5">
      {SHAPE_ORDER.map((s) => (
        <RRadio.Item
          key={s}
          value={s}
          aria-label={s[0]!.toUpperCase() + s.slice(1)}
          title={s[0]!.toUpperCase() + s.slice(1)}
          className="flex size-10 items-center justify-center rounded-xl border border-line bg-white p-2 transition hover:border-ink-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus data-[state=checked]:border-blue data-[state=checked]:shadow-[0_0_0_1px_var(--color-blue)]"
        >
          <BrandShape shape={s} />
        </RRadio.Item>
      ))}
    </RRadio.Root>
  );
}

/** Small muted text on the right of a field label ("From the profile"). */
export function SourceNote({ children }: { children: ReactNode }) {
  return <span className="text-xs font-normal text-ink-3">{children}</span>;
}
