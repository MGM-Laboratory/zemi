'use client';

import { ChevronRight, Copy } from 'lucide-react';
import { useState } from 'react';
import { IconButton, notify, useCopy } from '@/components/admin/ui';
import { cn } from '@/lib/admin/cn';

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function Scalar({ value }: { value: Exclude<Json, Json[] | { [k: string]: Json }> }) {
  if (value === null) return <span className="text-ink-3">null</span>;
  if (typeof value === 'boolean') return <span className="text-blue-600">{String(value)}</span>;
  if (typeof value === 'number') return <span className="text-green-600 tabular-nums">{value}</span>;
  return (
    <span className={cn('break-all', ISO.test(value) ? 'text-[#8a5a00]' : 'text-red-600')} title={ISO.test(value) ? 'UTC instant' : undefined}>
      &quot;{value}&quot;
    </span>
  );
}

function Node({ name, value, depth }: { name?: string; value: Json; depth: number }) {
  const isArr = Array.isArray(value);
  const isObj = value !== null && typeof value === 'object';
  const entries = isObj ? (isArr ? (value as Json[]).map((v, i) => [String(i), v] as const) : Object.entries(value as Record<string, Json>)) : [];
  const [open, setOpen] = useState(depth < 2 && entries.length <= 30);
  const label = name !== undefined ? <span className="text-ink-2">{isArr && /^\d+$/.test(name) ? name : `${name}`}: </span> : null;

  if (!isObj) {
    return (
      <div className="pl-5">
        {label}
        <Scalar value={value as Exclude<Json, Json[] | { [k: string]: Json }>} />
      </div>
    );
  }
  const brackets = isArr ? ['[', ']'] : ['{', '}'];
  if (!entries.length) {
    return (
      <div className="pl-5">
        {label}
        <span className="text-ink-3">{brackets.join('')}</span>
      </div>
    );
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group flex items-center gap-0.5 rounded text-left hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-focus"
      >
        <ChevronRight className={cn('size-4 shrink-0 text-ink-4 transition-transform duration-150', open && 'rotate-90')} aria-hidden="true" />
        {label}
        <span className="text-ink-3">
          {brackets[0]}
          {open ? null : <span className="px-1 text-xs">{isArr ? `${entries.length} items` : `${entries.length} keys`}</span>}
          {open ? null : brackets[1]}
        </span>
      </button>
      {open ? (
        <div className="ml-2 border-l border-line pl-1">
          {entries.map(([k, v]) => (
            <Node key={k} name={k} value={v} depth={depth + 1} />
          ))}
          <div className="pl-5 text-ink-3">{brackets[1]}</div>
        </div>
      ) : null}
    </div>
  );
}

/** Collapsible, colored JSON with a copy button. Big objects start folded. */
export function JsonView({ value, className, label = 'Details' }: { value: unknown; className?: string; label?: string }) {
  const [copy] = useCopy();
  const text = JSON.stringify(value, null, 2);
  return (
    <div className={cn('relative rounded-xl border border-line bg-surface-muted/50 p-3 pr-10', className)}>
      <IconButton
        label="Copy JSON"
        size="xs"
        variant="ghost"
        className="absolute top-2 right-2"
        onClick={() => void copy(text).then((ok) => (ok ? notify.success('Copied the JSON.') : notify.error("Couldn't copy.")))}
      >
        <Copy />
      </IconButton>
      <div className="mono overflow-x-auto text-[0.8125rem] leading-relaxed" role="group" aria-label={label}>
        <Node value={(value ?? null) as Json} depth={0} />
      </div>
    </div>
  );
}
