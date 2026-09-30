'use client';

import { SHAPE_ORDER, type ShapeName } from '@zemi/shared';
import { Ban } from 'lucide-react';
import { useState } from 'react';
import { PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/admin/ui/popover';
import { cn } from '@/lib/admin/cn';
import { BrandShape } from '../../parts/shapes';
import { Sticker, STICKER_KEYS, STICKERS } from '../../parts/stickers';

const SHAPES: ReadonlySet<string> = new Set(SHAPE_ORDER);

export function iconLabel(key: string | null | undefined): string {
  if (!key) return 'No icon';
  if (SHAPES.has(key)) return key[0]!.toUpperCase() + key.slice(1);
  return STICKERS[key]?.label ?? key;
}

/** The icon itself (a sticker or a brand shape), filling a box sized by `className`. */
export function IconGlyph({ name, className }: { name: string | null | undefined; className?: string }) {
  return (
    <span className={cn('block', className)} aria-hidden="true">
      {!name ? <Ban className="size-full text-ink-4" /> : SHAPES.has(name) ? <BrandShape shape={name as ShapeName} /> : <Sticker name={name} />}
    </span>
  );
}

/** Pick a sticker or a shape for a row or an element. */
export function IconPicker({ value, onChange, label, readOnly, allowNone = true, stickersOnly }: { value: string | null | undefined; onChange: (v: string | null) => void; label: string; readOnly?: boolean; allowNone?: boolean; stickersOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const pick = (v: string | null) => {
    onChange(v);
    setOpen(false);
  };
  const cell = 'flex size-10 items-center justify-center rounded-xl p-1.5 transition hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus aria-pressed:bg-blue-50 aria-pressed:ring-1 aria-pressed:ring-blue';
  return (
    <PopoverRoot open={open} onOpenChange={(o) => !readOnly && setOpen(o)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${iconLabel(value)}`}
          disabled={readOnly}
          className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-line-strong bg-white p-1.5 transition hover:border-ink-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60"
        >
          <IconGlyph name={value} className="size-full" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[19.5rem] p-3">
        <p className="label mb-2 text-ink-3">Stickers</p>
        <div className="grid grid-cols-7 gap-0.5" role="group" aria-label="Stickers">
          {STICKER_KEYS.map((k) => (
            <button key={k} type="button" className={cell} aria-pressed={value === k} aria-label={STICKERS[k]!.label} title={STICKERS[k]!.label} onClick={() => pick(k)}>
              <Sticker name={k} />
            </button>
          ))}
        </div>
        {stickersOnly ? null : (
          <>
            <p className="label mt-3 mb-2 text-ink-3">Shapes</p>
            <div className="flex gap-0.5" role="group" aria-label="Shapes">
              {SHAPE_ORDER.map((s) => (
                <button key={s} type="button" className={cell} aria-pressed={value === s} aria-label={iconLabel(s)} title={iconLabel(s)} onClick={() => pick(s)}>
                  <BrandShape shape={s} />
                </button>
              ))}
              {allowNone ? (
                <button type="button" className={cn(cell, 'ml-auto w-auto px-2.5 text-xs font-medium text-ink-3')} aria-pressed={!value} onClick={() => pick(null)}>
                  No icon
                </button>
              ) : null}
            </div>
          </>
        )}
      </PopoverContent>
    </PopoverRoot>
  );
}
