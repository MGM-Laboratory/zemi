'use client';

import { CITATION_FORMATS, formatCitation, type CitationFormat, type CitationSource } from '@zemi/shared';
import { Check, ChevronDown, Copy, Quote } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useDeferredValue, useMemo, useState } from 'react';
import { Button, Card, IconButton, notify, useCopy } from '@/components/admin/ui';
import { cn } from '@/lib/admin/cn';
import { useStoredState } from '../shared/content-ui';

function render(fmt: CitationFormat, src: CitationSource): string {
  try {
    return formatCitation(fmt, src);
  } catch {
    return '';
  }
}

const MONO: CitationFormat[] = ['bibtex', 'ris'];

/** Live "Cite this" preview. Every format from the shared formatter, updating as you type. */
export function CitePreview({ source, className, id = 'cite' }: { source: CitationSource; className?: string; id?: string }) {
  const deferred = useDeferredValue(source);
  const [fmt, setFmt] = useStoredState<CitationFormat>('pub.cite', 'apa', CITATION_FORMATS.map((f) => f.key));
  const [all, setAll] = useState(false);
  const [copy, copied] = useCopy();
  const reduce = useReducedMotion();
  const text = useMemo(() => render(fmt, deferred), [fmt, deferred]);
  const missing = [!deferred.authors.length && 'authors', !deferred.year && 'a year', !deferred.containerTitle && 'where it appeared'].filter(Boolean) as string[];

  const doCopy = async (value: string, label: string) => {
    if (await copy(value)) notify.success(`${label} copied.`);
    else notify.error("Couldn't copy. Your browser said no.");
  };

  return (
    <Card as="section" id={id} aria-labelledby={`${id}-title`} className={cn('scroll-mt-36 space-y-4 overflow-hidden', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-yellow-50 text-[#7a5600]" aria-hidden="true">
            <Quote className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 id={`${id}-title`} tabIndex={-1} className="font-display text-lg leading-tight font-extrabold tracking-[-0.02em] outline-none [font-variation-settings:'CASL'_0.2]">
              Cite this
            </h2>
            <p className="mt-0.5 text-sm text-ink-3">Exactly what the public page offers. Updates as you type.</p>
          </div>
        </div>
      </div>

      <div role="group" aria-label="Citation format" className="flex flex-wrap gap-1.5">
        {CITATION_FORMATS.map((f) => {
          const on = f.key === fmt;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={on}
              onClick={() => setFmt(f.key)}
              className={cn(
                'relative h-7 rounded-full px-3 text-[0.8125rem] font-medium transition-[background-color,color,transform] duration-150 active:scale-95',
                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
                on ? 'text-white' : 'bg-surface-muted text-ink-3 hover:bg-line hover:text-ink',
              )}
            >
              {on ? (
                <motion.span
                  layoutId={`${id}-fmt`}
                  className="absolute inset-0 rounded-full bg-ink"
                  transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
                  aria-hidden="true"
                />
              ) : null}
              <span className="relative">{f.label}</span>
            </button>
          );
        })}
      </div>

      <div className="relative">
        <AnimatePresence mode="wait" initial={false}>
          <motion.pre
            key={fmt}
            initial={reduce ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            aria-live="polite"
            className={cn(
              'max-h-72 min-h-[5.5rem] overflow-auto rounded-2xl border border-line bg-surface-muted p-4 pr-12 text-[0.875rem] leading-relaxed break-words whitespace-pre-wrap text-ink',
              MONO.includes(fmt) ? 'mono text-[0.8125rem]' : 'font-body',
            )}
          >
            {text || <span className="text-ink-4">Add a title and it starts to take shape.</span>}
          </motion.pre>
        </AnimatePresence>
        <IconButton
          label={copied ? 'Copied' : 'Copy citation'}
          size="sm"
          variant="secondary"
          className="absolute top-2.5 right-2.5 shadow-[var(--shadow-1)]"
          onClick={() => void doCopy(text, CITATION_FORMATS.find((f) => f.key === fmt)?.label ?? 'Citation')}
          disabled={!text}
        >
          {copied ? <Check className="text-green" /> : <Copy />}
        </IconButton>
      </div>

      {missing.length ? <p className="text-[0.8125rem] text-ink-3">For a complete citation, add {missing.join(', ').replace(/, ([^,]*)$/, ' and $1')}.</p> : null}

      <div>
        <Button type="button" variant="ghost" size="sm" iconRight={<ChevronDown className={cn('transition-transform', all && 'rotate-180')} />} onClick={() => setAll((a) => !a)} aria-expanded={all}>
          {all ? 'Hide the other formats' : 'See every format at once'}
        </Button>
        <AnimatePresence initial={false}>
          {all ? (
            <motion.ul
              initial={reduce ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={reduce ? undefined : { height: 0, opacity: 0 }}
              className="mt-2 space-y-2 overflow-hidden"
            >
              {CITATION_FORMATS.map((f) => {
                const out = render(f.key, deferred);
                return (
                  <li key={f.key} className="rounded-2xl border border-line p-3">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="label text-ink-4">{f.label}</span>
                      <button type="button" onClick={() => void doCopy(out, f.label)} className="rounded-md px-1.5 text-[0.8125rem] font-medium text-blue hover:underline focus-visible:outline-2 focus-visible:outline-focus">
                        Copy
                      </button>
                    </div>
                    <p className={cn('text-[0.8125rem] leading-relaxed break-words whitespace-pre-wrap text-ink-2', MONO.includes(f.key) && 'mono')}>{out}</p>
                  </li>
                );
              })}
            </motion.ul>
          ) : null}
        </AnimatePresence>
      </div>
    </Card>
  );
}
