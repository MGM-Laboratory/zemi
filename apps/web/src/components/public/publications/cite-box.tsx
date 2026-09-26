'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { CITATION_FILE_TYPES, CITATION_FORMATS, type CitationFormat } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { shapeConfetti } from '@/components/motion/shape-confetti';
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import { DownloadIcon } from './pub-link-icon';
import styles from './publications.module.css';

export interface CiteBoxProps {
  /** Every CITATION_FORMATS entry, already formatted on the server. */
  citations: Record<CitationFormat, string>;
  /** Download file names per format (from citationFileName). */
  fileNames: Record<CitationFormat, string>;
  /** Default tab. */
  initial?: CitationFormat;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Old browsers or a blocked clipboard: fall back to a hidden textarea.
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function download(text: string, fileName: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * "Cite this": a tab per citation style (APA, IEEE, MLA, Chicago, Harvard, Vancouver, BibTeX,
 * RIS, plain text), a copy button that celebrates, and .bib / .ris downloads. Tabs follow the
 * WAI-ARIA pattern (arrow keys, Home, End).
 */
export function CiteBox({ citations, fileNames, initial = 'apa' }: CiteBoxProps) {
  const id = useId();
  const reduced = useReducedMotion();
  const [format, setFormat] = useState<CitationFormat>(initial);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const text = citations[format] ?? '';
  const formats = CITATION_FORMATS.filter((f) => citations[f.key]);

  // One row of tabs everywhere; fade whichever side has more tabs hidden behind it.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const start = el.scrollLeft > 2;
      const end = el.scrollLeft < max - 2;
      el.dataset.fade = max <= 2 ? 'none' : start && end ? 'both' : start ? 'start' : 'end';
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, []);

  const select = (i: number) => {
    const f = formats[(i + formats.length) % formats.length]!;
    setFormat(f.key);
    setCopied('idle');
    const el = tabRefs.current[(i + formats.length) % formats.length];
    el?.focus();
    el?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: reduced ? 'auto' : 'smooth',
    });
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = formats.findIndex((f) => f.key === format);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') select(i + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') select(i - 1);
    else if (e.key === 'Home') select(0);
    else if (e.key === 'End') select(formats.length - 1);
    else return;
    e.preventDefault();
  };

  const copy = async () => {
    const ok = await copyText(text);
    setCopied(ok ? 'ok' : 'fail');
    if (ok) shapeConfetti({ from: copyRef.current, count: 18, spread: 70 });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied('idle'), 2200);
  };

  const label = formats.find((f) => f.key === format)?.label ?? format;

  return (
    <div className="flex flex-col gap-4 rounded-[28px] border border-line bg-white p-4 shadow-1 sm:p-6">
      <div
        ref={listRef}
        role="tablist"
        aria-label="Citation style"
        className={cn(styles.tabs, 'isolate')}
        onKeyDown={onKey}
        data-lenis-prevent=""
      >
        {formats.map((f, i) => {
          const selected = f.key === format;
          return (
            <button
              key={f.key}
              ref={(el) => void (tabRefs.current[i] = el)}
              type="button"
              role="tab"
              id={`${id}-tab-${f.key}`}
              aria-selected={selected}
              aria-controls={`${id}-panel`}
              tabIndex={selected ? 0 : -1}
              className={styles.tab}
              onClick={() => select(i)}
              data-transition="off"
            >
              {selected ? (
                <motion.span
                  layoutId={`${id}-pill`}
                  className={styles.tabPill}
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              ) : null}
              {f.label}
            </button>
          );
        })}
      </div>

      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${format}`}
        tabIndex={0}
        className="relative max-h-[22rem] overflow-y-auto rounded-[18px] border border-line bg-surface-muted p-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:p-5"
        data-lenis-prevent=""
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.pre
            key={format}
            className={cn(styles.citation, 'mono m-0 text-ink')}
            initial={{ opacity: 0, y: reduced ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : -4 }}
            transition={{ duration: 0.18 }}
          >
            <code className="mono">{text}</code>
          </motion.pre>
        </AnimatePresence>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          ref={copyRef}
          type="button"
          onClick={copy}
          className={cn(
            'relative inline-flex h-12 items-center gap-2 overflow-hidden rounded-full px-5 font-bold transition-[background-color,transform] duration-200 active:scale-[0.96]',
            copied === 'ok'
              ? 'bg-green-600 text-white'
              : copied === 'fail'
                ? 'bg-red-600 text-white'
                : 'bg-ink text-white hover:bg-[#1c2230]',
          )}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={copied}
              className="inline-flex items-center gap-2"
              initial={{ y: reduced ? 0 : 18, opacity: 0, rotate: reduced ? 0 : -8 }}
              animate={{ y: 0, opacity: 1, rotate: 0 }}
              exit={{ y: reduced ? 0 : -18, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 520, damping: 28 }}
            >
              {copied === 'ok' ? (
                <>
                  <CheckDraw reduced={reduced} />
                  Copied. Go cite.
                </>
              ) : copied === 'fail' ? (
                <>Copy didn&apos;t work. Select the text?</>
              ) : (
                <>
                  <ShapeIcon shape="square" size="0.85em" color="current" />
                  Copy {label}
                </>
              )}
            </motion.span>
          </AnimatePresence>
        </button>
        {(['bibtex', 'ris'] as const)
          .filter((f) => citations[f])
          .map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => download(citations[f], fileNames[f], CITATION_FILE_TYPES[f].mime)}
              className="inline-flex h-12 items-center gap-2 rounded-full border border-line-strong bg-white px-4 font-bold text-ink transition-[border-color,background-color,transform] duration-200 hover:border-ink hover:bg-surface-muted active:scale-[0.96]"
            >
              <DownloadIcon size={18} />.{CITATION_FILE_TYPES[f].extension}
            </button>
          ))}
        {format !== 'bibtex' && format !== 'ris' ? (
          <button
            type="button"
            onClick={() => download(text, fileNames[format], CITATION_FILE_TYPES[format].mime)}
            className="inline-flex h-12 items-center gap-2 rounded-full px-4 font-bold text-ink-2 transition-[background-color,transform] duration-200 hover:bg-surface-muted hover:text-ink active:scale-[0.96]"
          >
            <DownloadIcon size={18} />
            .txt
          </button>
        ) : null}
        <span className="sr-only" aria-live="polite">
          {copied === 'ok'
            ? `${label} citation copied to the clipboard.`
            : copied === 'fail'
              ? 'Copy failed. Select the citation text instead.'
              : ''}
        </span>
      </div>
    </div>
  );
}

function CheckDraw({ reduced }: { reduced: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <motion.path
        d="M5 12.5l4.2 4.2L19 7"
        initial={{ pathLength: reduced ? 1 : 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut', delay: 0.05 }}
      />
    </svg>
  );
}
