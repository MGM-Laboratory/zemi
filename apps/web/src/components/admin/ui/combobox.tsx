'use client';

import { Command } from 'cmdk';
import { Check, ChevronsUpDown, Plus, Search, X } from 'lucide-react';
import { Popover as RPopover } from 'radix-ui';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isAbortError, errorMessage } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { useFieldControlProps } from './field';
import { controlClass, controlSizes, type ControlSize } from './input';
import { popoverSurface } from './popover';
import { Spinner } from './spinner';

export interface ComboOption<T = unknown> {
  value: string;
  label: string;
  description?: ReactNode;
  /** Avatar or icon on the left. */
  icon?: ReactNode;
  disabled?: boolean;
  /** Extra words to match on (client filtering). */
  keywords?: string[];
  /** The original record (SpeakerRef, Venue...). */
  data?: T;
}

type Loader<T> = (query: string, signal: AbortSignal) => Promise<ComboOption<T>[]>;

interface SharedProps<T> {
  /** Static options, filtered in the browser. */
  options?: ComboOption<T>[];
  /** Async options (called with the debounced query, and with '' on open). Filtering is up to the server. */
  loadOptions?: Loader<T>;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Shown when nothing matches. */
  emptyText?: ReactNode;
  /** Offer "Create <query>" at the bottom. */
  onCreate?: (query: string) => void | Promise<void>;
  createLabel?: (query: string) => string;
  /** Custom row rendering. */
  renderOption?: (o: ComboOption<T>, state: { selected: boolean }) => ReactNode;
  size?: ControlSize;
  disabled?: boolean;
  readOnly?: boolean;
  id?: string;
  className?: string;
  /** Minimum characters before calling loadOptions. Default 0. */
  minQueryLength?: number;
  debounceMs?: number;
  'aria-label'?: string;
}

function useOptions<T>(open: boolean, query: string, options: ComboOption<T>[] | undefined, loadOptions: Loader<T> | undefined, minLen: number, debounceMs: number) {
  const [state, setState] = useState<{ items: ComboOption<T>[]; loading: boolean; error: string | null }>({ items: options ?? [], loading: false, error: null });
  const cache = useRef(new Map<string, ComboOption<T>[]>());
  const loaderRef = useRef(loadOptions);
  useEffect(() => {
    loaderRef.current = loadOptions;
  });

  useEffect(() => {
    if (!loadOptions) setState({ items: options ?? [], loading: false, error: null });
  }, [options, loadOptions]);

  useEffect(() => {
    if (!open || !loaderRef.current) return;
    const q = query.trim();
    if (q.length < minLen) {
      setState({ items: [], loading: false, error: null });
      return;
    }
    const hit = cache.current.get(q);
    if (hit) setState({ items: hit, loading: false, error: null });
    const ctrl = new AbortController();
    const t = setTimeout(
      async () => {
        if (!hit) setState((s) => ({ ...s, loading: true, error: null }));
        try {
          const items = await loaderRef.current!(q, ctrl.signal);
          cache.current.set(q, items);
          setState({ items, loading: false, error: null });
        } catch (err) {
          if (isAbortError(err)) return;
          setState({ items: [], loading: false, error: errorMessage(err, 'Search is not available right now.') });
        }
      },
      hit ? 0 : q ? debounceMs : 0,
    );
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [open, query, minLen, debounceMs]);

  return state;
}

function OptionRow<T>({ o, selected, multi, renderOption }: { o: ComboOption<T>; selected: boolean; multi?: boolean; renderOption?: SharedProps<T>['renderOption'] }) {
  if (renderOption) return <>{renderOption(o, { selected })}</>;
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2.5">
      {multi ? (
        <span className={cn('flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px]', selected ? 'border-blue bg-blue text-white' : 'border-line-strong bg-white')}>
          {selected ? <Check className="size-3" strokeWidth={3.2} /> : null}
        </span>
      ) : null}
      {o.icon ? <span className="flex shrink-0 items-center">{o.icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.9375rem] text-ink">{o.label}</span>
        {o.description ? <span className="block truncate text-[0.8125rem] text-ink-3">{o.description}</span> : null}
      </span>
      {!multi && selected ? <Check className="size-4 shrink-0 text-blue" strokeWidth={2.5} /> : null}
    </span>
  );
}

function ListBody<T>({
  items,
  loading,
  error,
  query,
  isSelected,
  onPick,
  multi,
  emptyText,
  onCreate,
  createLabel,
  renderOption,
  async,
}: {
  items: ComboOption<T>[];
  loading: boolean;
  error: string | null;
  query: string;
  isSelected: (v: string) => boolean;
  onPick: (o: ComboOption<T>) => void;
  multi?: boolean;
  emptyText?: ReactNode;
  onCreate?: (q: string) => void | Promise<void>;
  createLabel?: (q: string) => string;
  renderOption?: SharedProps<T>['renderOption'];
  async: boolean;
}) {
  const q = query.trim();
  const exact = items.some((o) => o.label.toLowerCase() === q.toLowerCase());
  return (
    <Command.List className="max-h-72 overflow-y-auto p-1">
      {loading && !items.length ? (
        <Command.Loading>
          <div className="flex items-center gap-2 px-3 py-3 text-sm text-ink-3">
            <Spinner size={16} label={null} /> Looking...
          </div>
        </Command.Loading>
      ) : null}
      {error ? <div className="px-3 py-3 text-sm text-red-600">{error}</div> : null}
      {!loading && !error ? (
        <Command.Empty className="px-3 py-4 text-center text-sm text-ink-3">{emptyText ?? (q ? `Nothing matches "${q}".` : 'Start typing to search.')}</Command.Empty>
      ) : null}
      {items.map((o) => (
        <Command.Item
          key={o.value}
          value={async ? o.value : `${o.label} ${o.keywords?.join(' ') ?? ''} ${o.value}`}
          disabled={o.disabled}
          onSelect={() => onPick(o)}
          className="flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 outline-none select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-40 data-[selected=true]:bg-surface-muted"
        >
          <OptionRow o={o} selected={isSelected(o.value)} multi={multi} renderOption={renderOption} />
        </Command.Item>
      ))}
      {onCreate && q && !exact ? (
        <Command.Item
          value={`__create__${q}`}
          onSelect={() => void onCreate(q)}
          forceMount
          className="mt-1 flex cursor-pointer items-center gap-2 rounded-xl border-t border-line px-2.5 py-2 text-[0.9375rem] font-medium text-blue outline-none data-[selected=true]:bg-blue-50"
        >
          <Plus className="size-4" />
          <span className="truncate">{createLabel ? createLabel(q) : `Create "${q}"`}</span>
        </Command.Item>
      ) : null}
    </Command.List>
  );
}

function SearchBox({ value, onChange, placeholder, loading }: { value: string; onChange: (v: string) => void; placeholder: string; loading: boolean }) {
  return (
    <div className="flex items-center gap-2 border-b border-line px-3">
      <Search className="size-4 shrink-0 text-ink-4" aria-hidden="true" />
      <Command.Input
        value={value}
        onValueChange={onChange}
        placeholder={placeholder}
        className="h-11 min-w-0 flex-1 bg-transparent text-[0.9375rem] outline-none placeholder:text-ink-4"
      />
      {loading ? <Spinner size={14} label={null} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Combobox */

export interface ComboboxProps<T = unknown> extends SharedProps<T> {
  value: string | null | undefined;
  onValueChange: (value: string | null, option: ComboOption<T> | null) => void;
  /** Label source for the current value when options are async. */
  selectedOption?: ComboOption<T> | null;
  clearable?: boolean;
}

/**
 * Searchable single select. Static `options` or async `loadOptions`.
 * @example
 * <Combobox value={venueId} onValueChange={(id) => setVenueId(id)}
 *   loadOptions={async (q, signal) => (await api.get<Venue[]>('/admin/venues', { search: q }, signal)).map(toOption)} />
 */
export function Combobox<T = unknown>({
  value,
  onValueChange,
  selectedOption,
  clearable,
  options,
  loadOptions,
  placeholder = 'Pick one',
  searchPlaceholder = 'Search',
  emptyText,
  onCreate,
  createLabel,
  renderOption,
  size = 'md',
  disabled,
  readOnly,
  id,
  className,
  minQueryLength = 0,
  debounceMs = 200,
  'aria-label': ariaLabel,
}: ComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const aria = useFieldControlProps({ id, disabled, readOnly });
  const { items, loading, error } = useOptions(open, query, options, loadOptions, minQueryLength, debounceMs);
  const known = useRef(new Map<string, ComboOption<T>>());
  items.forEach((o) => known.current.set(o.value, o));
  if (selectedOption) known.current.set(selectedOption.value, selectedOption);
  const current = value ? (known.current.get(value) ?? options?.find((o) => o.value === value) ?? null) : null;
  const locked = aria.disabled || aria.readOnly;

  return (
    <RPopover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery('');
      }}
    >
      <div className={cn('relative', className)}>
        <RPopover.Trigger asChild disabled={locked}>
          <button
            type="button"
            id={aria.id}
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-label={ariaLabel}
            aria-describedby={aria['aria-describedby']}
            aria-invalid={aria['aria-invalid']}
            disabled={aria.disabled}
            className={cn(
              controlClass,
              controlSizes[size],
              'flex cursor-pointer items-center gap-2 text-left',
              open && 'border-blue ring-4 ring-blue/15',
              aria.readOnly && 'pointer-events-none bg-surface-muted',
              clearable && current && !locked && 'pr-16',
            )}
          >
            {current?.icon ? <span className="flex shrink-0 items-center">{current.icon}</span> : null}
            <span className={cn('min-w-0 flex-1 truncate', !current && 'text-ink-4')}>{current ? current.label : value ? 'Selected' : placeholder}</span>
            {locked ? null : <ChevronsUpDown className="size-4 shrink-0 text-ink-4" aria-hidden="true" />}
          </button>
        </RPopover.Trigger>
        {clearable && current && !locked ? (
          <button
            type="button"
            aria-label="Clear"
            onClick={() => onValueChange(null, null)}
            className="absolute top-1/2 right-8 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-4 transition hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
      <RPopover.Portal>
        <RPopover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className={cn(popoverSurface, 'w-[max(var(--radix-popover-trigger-width),18rem)] max-w-[calc(100vw-24px)] overflow-hidden p-0')}
        >
          <Command shouldFilter={!loadOptions} loop>
            <SearchBox value={query} onChange={setQuery} placeholder={searchPlaceholder} loading={loading && items.length > 0} />
            <ListBody
              items={items}
              loading={loading}
              error={error}
              query={query}
              async={Boolean(loadOptions)}
              isSelected={(v) => v === value}
              onPick={(o) => {
                onValueChange(o.value, o);
                setOpen(false);
                setQuery('');
              }}
              emptyText={emptyText}
              onCreate={
                onCreate
                  ? async (q) => {
                      await onCreate(q);
                      setOpen(false);
                      setQuery('');
                    }
                  : undefined
              }
              createLabel={createLabel}
              renderOption={renderOption}
            />
          </Command>
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}

/* ------------------------------------------------------------------ MultiCombobox */

export interface MultiComboboxProps<T = unknown> extends SharedProps<T> {
  values: string[];
  onValuesChange: (values: string[], options: ComboOption<T>[]) => void;
  /** Label source for current values when options are async. */
  selectedOptions?: ComboOption<T>[];
  max?: number;
}

/** Searchable multi select with removable chips. Selection order is kept. */
export function MultiCombobox<T = unknown>({
  values,
  onValuesChange,
  selectedOptions,
  max,
  options,
  loadOptions,
  placeholder = 'Add',
  searchPlaceholder = 'Search',
  emptyText,
  onCreate,
  createLabel,
  renderOption,
  size = 'md',
  disabled,
  readOnly,
  id,
  className,
  minQueryLength = 0,
  debounceMs = 200,
  'aria-label': ariaLabel,
}: MultiComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const aria = useFieldControlProps({ id, disabled, readOnly });
  const { items, loading, error } = useOptions(open, query, options, loadOptions, minQueryLength, debounceMs);
  const known = useRef(new Map<string, ComboOption<T>>());
  items.forEach((o) => known.current.set(o.value, o));
  options?.forEach((o) => known.current.set(o.value, o));
  selectedOptions?.forEach((o) => known.current.set(o.value, o));
  const selected = useMemo(() => values.map((v) => known.current.get(v) ?? { value: v, label: v }), [values, items, selectedOptions]); // eslint-disable-line react-hooks/exhaustive-deps
  const locked = aria.disabled || aria.readOnly;
  const full = max != null && values.length >= max;

  const emit = (next: string[]) => onValuesChange(next, next.map((v) => known.current.get(v) ?? { value: v, label: v }));
  const toggle = (o: ComboOption<T>) => {
    if (values.includes(o.value)) emit(values.filter((v) => v !== o.value));
    else if (!full) emit([...values, o.value]);
  };

  return (
    <RPopover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery('');
      }}
    >
      <RPopover.Anchor asChild>
        <div
          className={cn(
            controlClass,
            'flex min-h-11 flex-wrap items-center gap-1.5 px-1.5 py-1.5',
            size === 'sm' && 'min-h-9 rounded-xl py-1',
            open && 'border-blue ring-4 ring-blue/15',
            locked && 'bg-surface-muted',
            className,
          )}
          aria-invalid={aria['aria-invalid']}
        >
          {selected.map((o) => (
            <span key={o.value} className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-surface-muted pr-1 pl-1.5 text-sm text-ink">
              {o.icon ? <span className="flex shrink-0 items-center [&>*]:!size-5">{o.icon}</span> : <span className="w-1" />}
              <span className="truncate">{o.label}</span>
              {locked ? (
                <span className="w-1" />
              ) : (
                <button
                  type="button"
                  aria-label={`Remove ${o.label}`}
                  onClick={() => emit(values.filter((v) => v !== o.value))}
                  className="flex size-5 shrink-0 items-center justify-center rounded-full text-ink-3 transition hover:bg-white hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <X className="size-3" />
                </button>
              )}
            </span>
          ))}
          {locked ? (
            selected.length ? null : <span className="px-2 text-ink-4">None</span>
          ) : (
            <RPopover.Trigger asChild>
              <button
                type="button"
                id={aria.id}
                role="combobox"
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-label={ariaLabel ?? placeholder}
                aria-describedby={aria['aria-describedby']}
                disabled={full}
                className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-sm font-medium text-ink-3 transition hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-40"
              >
                <Plus className="size-3.5" />
                {full ? `Max ${max}` : placeholder}
              </button>
            </RPopover.Trigger>
          )}
        </div>
      </RPopover.Anchor>
      <RPopover.Portal>
        <RPopover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className={cn(popoverSurface, 'w-[max(var(--radix-popover-trigger-width),20rem)] max-w-[calc(100vw-24px)] overflow-hidden p-0')}
        >
          <Command shouldFilter={!loadOptions} loop>
            <SearchBox value={query} onChange={setQuery} placeholder={searchPlaceholder} loading={loading && items.length > 0} />
            <ListBody
              items={items}
              loading={loading}
              error={error}
              query={query}
              multi
              async={Boolean(loadOptions)}
              isSelected={(v) => values.includes(v)}
              onPick={toggle}
              emptyText={emptyText}
              onCreate={
                onCreate
                  ? async (q) => {
                      await onCreate(q);
                      setQuery('');
                    }
                  : undefined
              }
              createLabel={createLabel}
              renderOption={renderOption}
            />
          </Command>
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}
