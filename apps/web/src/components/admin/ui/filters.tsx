'use client';

import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/admin/cn';
import { Spinner } from './spinner';
import { Input, type ControlSize } from './input';
import { Select } from './select';

/* ------------------------------------------------------------------ SearchInput */

export interface SearchInputProps {
  /** Committed value (after debounce). */
  value: string;
  /** Called after `debounceMs` of no typing, on Enter, and when cleared. */
  onValueChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  /** Shows a small spinner (while the list refetches). */
  loading?: boolean;
  size?: ControlSize;
  className?: string;
  autoFocus?: boolean;
  'aria-label'?: string;
  /** Focus with "/" from anywhere on the page. Default false. */
  slashToFocus?: boolean;
}

/**
 * Debounced search box. Escape clears it.
 * @example const [search, setSearch] = useQueryState('q', { defaultValue: '' }); <SearchInput value={search} onValueChange={setSearch} />
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onValueChange, placeholder = 'Search', debounceMs = 250, loading, size = 'md', className, autoFocus, 'aria-label': ariaLabel, slashToFocus },
  ref,
) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inner = useRef<HTMLInputElement | null>(null);
  const cb = useRef(onValueChange);
  useEffect(() => {
    cb.current = onValueChange;
  });

  // Follow external resets (like "Clear filters").
  useEffect(() => {
    setDraft(value);
  }, [value]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  useEffect(() => {
    if (!slashToFocus) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      inner.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slashToFocus]);

  const commit = (v: string, now = false) => {
    if (timer.current) clearTimeout(timer.current);
    if (now) cb.current(v.trim());
    else timer.current = setTimeout(() => cb.current(v.trim()), debounceMs);
  };

  return (
    <Input
      ref={(el) => {
        inner.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      type="search"
      size={size}
      role="searchbox"
      aria-label={ariaLabel ?? placeholder}
      placeholder={placeholder}
      value={draft}
      autoFocus={autoFocus}
      autoComplete="off"
      spellCheck={false}
      wrapperClassName={className}
      className="[&::-webkit-search-cancel-button]:appearance-none"
      leading={<Search />}
      onChange={(e) => {
        setDraft(e.target.value);
        commit(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit(draft, true);
        if (e.key === 'Escape' && draft) {
          e.preventDefault();
          e.stopPropagation();
          setDraft('');
          commit('', true);
        }
      }}
      trailing={
        loading ? (
          <span className="mr-2 flex">
            <Spinner size={16} label={null} />
          </span>
        ) : draft ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setDraft('');
              commit('', true);
              inner.current?.focus();
            }}
            className="flex size-8 items-center justify-center rounded-full text-ink-3 transition hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
          >
            <X className="size-4" />
          </button>
        ) : slashToFocus ? (
          <kbd className="mono mr-2 hidden h-5 items-center rounded-md border border-line-strong px-1.5 text-[0.6875rem] text-ink-3 sm:inline-flex">/</kbd>
        ) : null
      }
    />
  );
});

/* ------------------------------------------------------------------ FilterBar */

export interface FilterChip {
  key: string;
  /** "Status: Draft" */
  label: ReactNode;
  onRemove: () => void;
}

export interface FilterBarProps {
  /** Search box (usually <SearchInput>). */
  search?: ReactNode;
  /** Filter controls (Selects, SegmentedControl, a Popover). */
  filters?: ReactNode;
  /** Active filter chips, removable. */
  chips?: FilterChip[];
  onClearAll?: () => void;
  /** Right side (column menu, density toggle, export). */
  actions?: ReactNode;
  className?: string;
}

/** Toolbar above lists: search, filters, active chips and "Clear all". */
export function FilterBar({ search, filters, chips = [], onClearAll, actions, className }: FilterBarProps) {
  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {search ? <div className="min-w-[12rem] flex-1 sm:max-w-sm">{search}</div> : null}
        {filters ? <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">{filters}</div> : null}
        {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
      </div>
      <AnimatePresence initial={false}>
        {chips.length ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-wrap items-center gap-1.5 overflow-hidden"
          >
            {chips.map((c) => (
              <motion.span
                layout
                key={c.key}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="inline-flex h-7 items-center gap-1 rounded-full bg-blue-50 pr-1 pl-3 text-[0.8125rem] font-medium text-blue-600"
              >
                {c.label}
                <button
                  type="button"
                  onClick={c.onRemove}
                  aria-label={`Remove filter ${typeof c.label === 'string' ? c.label : c.key}`}
                  className="flex size-5 items-center justify-center rounded-full transition hover:bg-blue/15 focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <X className="size-3.5" />
                </button>
              </motion.span>
            ))}
            {onClearAll && chips.length > 1 ? (
              <button type="button" onClick={onClearAll} className="ml-1 rounded-md px-1.5 text-[0.8125rem] font-medium text-ink-3 underline-offset-4 hover:text-ink hover:underline">
                Clear all
              </button>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ Pagination */

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizes?: number[];
  /** Noun for the summary: "events" gives "1 to 20 of 132 events". */
  noun?: string;
  className?: string;
}

function pageList(page: number, pages: number): Array<number | 'gap'> {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: Array<number | 'gap'> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pages - 1, page + 1);
  if (start > 2) out.push('gap');
  for (let i = start; i <= end; i++) out.push(i);
  if (end < pages - 1) out.push('gap');
  out.push(pages);
  return out;
}

/** Page controls with a range summary. 1-based pages (matches the API). */
export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange, pageSizes = [20, 50, 100], noun = 'items', className }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn =
    'flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-medium tabular-nums transition hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-35';
  return (
    <nav aria-label="Pagination" className={cn('flex flex-wrap items-center justify-between gap-3 text-sm', className)}>
      <p className="text-ink-3" aria-live="polite">
        {total === 0 ? (
          `No ${noun}`
        ) : (
          <>
            <span className="font-medium text-ink tabular-nums">
              {from.toLocaleString('en-US')} to {to.toLocaleString('en-US')}
            </span>{' '}
            of <span className="tabular-nums">{total.toLocaleString('en-US')}</span> {noun}
          </>
        )}
      </p>
      <div className="flex items-center gap-3">
        {onPageSizeChange ? (
          <div className="flex items-center gap-2 text-ink-3">
            <span className="hidden sm:inline">Per page</span>
            <Select
              size="sm"
              aria-label="Rows per page"
              className="w-[4.75rem]"
              value={String(pageSize)}
              onValueChange={(v) => v && onPageSizeChange(Number(v))}
              options={pageSizes.map((n) => ({ value: String(n), label: String(n) }))}
            />
          </div>
        ) : null}
        {pages > 1 ? (
          <div className="flex items-center gap-0.5">
            <button type="button" className={btn} onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
              <ChevronLeft className="size-4" />
            </button>
            {pageList(page, pages).map((p, i) =>
              p === 'gap' ? (
                <span key={`gap${i}`} className="px-1 text-ink-3" aria-hidden="true">
                  ...
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  className={cn(btn, 'hidden sm:flex', p === page && 'flex bg-ink text-white hover:bg-ink')}
                  onClick={() => onPageChange(p)}
                  aria-current={p === page ? 'page' : undefined}
                  aria-label={`Page ${p}`}
                >
                  {p}
                </button>
              ),
            )}
            <button type="button" className={btn} onClick={() => onPageChange(page + 1)} disabled={page >= pages} aria-label="Next page">
              <ChevronRight className="size-4" />
            </button>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
