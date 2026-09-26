'use client';

import { Search, X } from 'lucide-react';
import { useId, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
}

/**
 * Plain, fast search input with a visible label for screen readers, a clear button and Esc to clear.
 * Shared by the speakers and publications indexes.
 */
export function SearchBox({ value, onChange, label, placeholder, className }: SearchBoxProps) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className={cn('relative', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-3"
        aria-hidden="true"
      />
      <input
        ref={ref}
        id={id}
        type="search"
        inputMode="search"
        autoComplete="off"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault();
            onChange('');
          }
        }}
        className="h-12 w-full appearance-none rounded-full border border-line-strong bg-white pl-12 pr-12 text-[1rem] text-ink shadow-1 transition-[border-color,box-shadow] duration-200 placeholder:text-ink-4 hover:border-ink-4 focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange('');
            ref.current?.focus();
          }}
          className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-ink-2 transition-[background-color,transform] hover:bg-surface-muted active:scale-90"
          aria-label="Clear search"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
