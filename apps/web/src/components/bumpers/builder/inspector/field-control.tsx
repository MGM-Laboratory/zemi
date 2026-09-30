'use client';

import { BUMPER_TONES, type ShapeName } from '@zemi/shared';
import { RotateCcw } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { Field } from '@/components/admin/ui/field';
import { Input, NumberInput, Textarea } from '@/components/admin/ui/input';
import { Select } from '@/components/admin/ui/select';
import { Switch } from '@/components/admin/ui/toggles';
import { isDefaultField } from '../../engine/resolve';
import type { FieldDef, FieldValue } from '../../engine/types';
import { QrCheck } from '../qr-check';
import { useBuilder } from '../store';
import { SOURCE_LABEL, type InspectorCtx } from './context';
import { DateTimeFieldInput, insertAt, TimeFieldInput, TokenMenu } from './inputs';
import { ShapePicker, SourceNote, ToneSwatches } from './ui';

const SHAPES: ReadonlySet<string> = new Set(['circle', 'triangle', 'square', 'arch']);
const MINUTE_PRESETS = [2, 5, 10, 15, 30];

function asText(v: FieldValue | undefined): string {
  if (v === null || v === undefined || typeof v === 'boolean') return '';
  return String(v);
}

/** Link fields that end up in a QR code get the scan check. */
function isQrField(def: FieldDef): boolean {
  return def.type === 'url' && (/qr/i.test(def.label) || /qr|url|link/i.test(def.key));
}

/**
 * One template field, generated from its FieldDef: the right control for the type, the resolved
 * default as the placeholder, where that default comes from, a Reset when overridden, a length
 * counter and a {token} menu for text.
 */
export function FieldControl({ def, ic }: { def: FieldDef; ic: InspectorCtx }) {
  const b = useBuilder();
  const { slide, ctx, canEdit } = ic;
  const raw = slide.fields[def.key];
  const overridden = !isDefaultField(slide, def.key);
  const dflt = ic.defaults[def.key] ?? { value: null, source: null };
  const readOnly = !canEdit;
  const set = (v: FieldValue) => b.setField(slide.id, def.key, v);
  const inputRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [timeBad, setTimeBad] = useState(false);
  const isText = def.type === 'text' || def.type === 'longtext' || def.type === 'url';
  const tokens = isText && def.type !== 'url' && def.tokens !== false;
  const text = asText(raw);
  const placeholderText = (() => {
    const d = asText(dflt.value);
    if (!d) return def.placeholder ?? '';
    const filled = def.tokens === false ? d : ctx.fill(d);
    return filled.length > 140 ? `${filled.slice(0, 140)}...` : filled;
  })();

  const insertToken = (token: string) => {
    const el = def.type === 'longtext' ? areaRef.current : inputRef.current;
    const { value, caret } = insertAt(el, text, token);
    set(value);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  };

  const action = (
    <span className="flex items-center gap-1">
      {overridden ? (
        <button
          type="button"
          onClick={() => set(null)}
          disabled={readOnly}
          className="inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium text-blue transition hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-40"
          aria-label={`Reset ${def.label} to the default`}
        >
          <RotateCcw className="size-3" /> Reset
        </button>
      ) : dflt.source ? (
        <SourceNote>{SOURCE_LABEL[dflt.source]}</SourceNote>
      ) : null}
      {tokens && def.type === 'longtext' ? <TokenMenu onInsert={insertToken} disabled={readOnly} /> : null}
    </span>
  );

  const counted = isText && def.max && text.length ? { value: text.length, max: def.max } : undefined;

  let control: ReactNode;
  switch (def.type) {
    case 'longtext':
      control = <Textarea ref={areaRef} value={text} placeholder={placeholderText} maxLength={def.max} minRows={2} maxRows={8} readOnly={readOnly} onChange={(e) => set(e.target.value)} />;
      break;
    case 'url':
      control = (
        <Input
          ref={inputRef}
         
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={text}
          placeholder={placeholderText || 'https://'}
          maxLength={def.max}
          readOnly={readOnly}
          onChange={(e) => set(e.target.value.trim() ? e.target.value : null)}
        />
      );
      break;
    case 'time':
      control = <TimeFieldInput ref={inputRef} value={text} placeholder={placeholderText || 'HH:mm'} readOnly={readOnly} onInvalid={setTimeBad} onCommit={(v) => set(v || null)} />;
      break;
    case 'datetime':
      control = <DateTimeFieldInput label={def.label} value={text || asText(dflt.value)} readOnly={readOnly} onCommit={(v) => set(v || null)} />;
      break;
    case 'number':
    case 'minutes': {
      const n = typeof raw === 'number' ? raw : raw != null && raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : null;
      const d = typeof dflt.value === 'number' ? dflt.value : null;
      control = (
        <div className="space-y-2">
          <NumberInput
            ref={inputRef}
           
            value={n}
            onChange={(v) => set(v)}
            min={def.min}
            max={def.max}
            step={def.step ?? 1}
            unit={def.type === 'minutes' ? 'min' : undefined}
            placeholder={d != null ? String(d) : def.placeholder}
            readOnly={readOnly}
          />
          {def.type === 'minutes' && !readOnly ? (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${def.label} presets`}>
              {MINUTE_PRESETS.filter((m) => (def.min ?? 1) <= m && m <= (def.max ?? 240)).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={(n ?? d) === m}
                  onClick={() => set(m === d ? null : m)}
                  className="mono h-7 rounded-full border border-line-strong bg-white px-2.5 text-xs text-ink-2 tabular-nums transition hover:border-ink-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-white"
                >
                  {m} min
                </button>
              ))}
            </div>
          ) : null}
        </div>
      );
      break;
    }
    case 'toggle': {
      const on = typeof raw === 'boolean' ? raw : dflt.value === true;
      return (
        <div className="flex items-start justify-between gap-3" data-focus={`field:${def.key}`}>
          <Switch checked={on} onCheckedChange={(v) => set(v === dflt.value ? null : v)} label={def.label} description={def.hint} disabled={readOnly} />
          {overridden ? action : null}
        </div>
      );
    }
    case 'select': {
      const current = asText(raw) || asText(dflt.value);
      control = (
        <Select
          value={current || null}
          onValueChange={(v) => set(v === asText(dflt.value) ? null : v)}
          options={(def.options ?? []).map((o) => ({ ...o, description: o.value === asText(dflt.value) ? 'Default' : undefined }))}
          placeholder={def.placeholder ?? 'Pick one'}
          readOnly={readOnly}
        />
      );
      break;
    }
    case 'tone':
      control = <ToneSwatches label={def.label} value={asText(raw) || asText(dflt.value) || null} onChange={(v) => set(v && v !== asText(dflt.value) ? v : null)} tones={BUMPER_TONES} colors={ctx.colors} readOnly={readOnly} />;
      break;
    case 'shape': {
      const v = asText(raw) || asText(dflt.value);
      control = <ShapePicker label={def.label} value={(SHAPES.has(v) ? v : 'circle') as ShapeName} onChange={(s) => set(s === asText(dflt.value) ? null : s)} readOnly={readOnly} />;
      break;
    }
    default:
      control = (
        <Input
          ref={inputRef}
         
          value={text}
          placeholder={placeholderText}
          maxLength={def.max}
          readOnly={readOnly}
          onChange={(e) => set(e.target.value)}
          trailing={tokens && !readOnly ? <TokenMenu onInsert={insertToken} /> : undefined}
        />
      );
  }

  const qr = def.type === 'url' && isQrField(def);
  return (
    <div className="space-y-2" data-focus={`field:${def.key}`}>
      <Field label={def.label} hint={def.hint} action={action} count={counted} error={def.type === 'time' && timeBad ? 'Use HH:mm, like 14:50.' : undefined}>
        {control}
      </Field>
      {qr ? <QrCheck value={ctx.text(def.key)} style={ic.theme.qrStyle} logo /> : null}
    </div>
  );
}
