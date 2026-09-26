'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { formatJakarta, fromJakartaInput, jakartaDateInput, type AdminSummary, type AuditEntry, type Paginated } from '@zemi/shared';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { useId, useMemo, useState } from 'react';
import {
  Avatar,
  Badge,
  Combobox,
  DateText,
  EmptyState,
  ErrorState,
  FilterBar,
  Input,
  KeyValue,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  ShapeGlyph,
  Skeleton,
  type ComboOption,
} from '@/components/admin/ui';
import { useAbility } from '@/lib/admin/ability';
import { api } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { useNow } from '@/lib/admin/hooks';
import { adminKeys } from '@/lib/admin/query-keys';
import { ACTION_FAMILIES, RESOURCE_TYPE_LABELS, actorLabel, auditResourceHref, auditTone, type AuditTone } from './audit-meta';
import { JsonView } from './json-view';

const PAGE_SIZE = 50;

const TONE: Record<AuditTone, { shape: 'circle' | 'triangle' | 'square' | 'arch' | 'dot'; cls: string }> = {
  blue: { shape: 'circle', cls: 'text-blue' },
  red: { shape: 'triangle', cls: 'text-red' },
  yellow: { shape: 'square', cls: 'text-yellow' },
  green: { shape: 'arch', cls: 'text-green' },
  neutral: { shape: 'dot', cls: 'text-ink-4' },
};

function nextDay(date: string): string {
  return jakartaDateInput(new Date(fromJakartaInput(date, '12:00').getTime() + 86_400_000));
}

/** /admin/audit: who changed what, and when. Filters live in the URL. */
export function AuditLog() {
  const ability = useAbility();
  const now = useNow(60_000);
  const [params, setParams] = useQueryStates(
    {
      actor: parseAsString.withDefault(''),
      action: parseAsString.withDefault(''),
      type: parseAsString.withDefault(''),
      from: parseAsString.withDefault(''),
      to: parseAsString.withDefault(''),
      page: parseAsInteger.withDefault(1),
    },
    { history: 'replace' },
  );
  const set = (patch: Partial<typeof params>) => void setParams({ page: 1, ...patch });

  const query = useMemo(
    () => ({
      actor: params.actor || undefined,
      action: params.action || undefined,
      resourceType: params.type || undefined,
      from: params.from ? fromJakartaInput(params.from, '00:00').toISOString() : undefined,
      to: params.to ? fromJakartaInput(nextDay(params.to), '00:00').toISOString() : undefined,
      page: params.page,
      pageSize: PAGE_SIZE,
    }),
    [params],
  );
  const q = useQuery({
    queryKey: adminKeys.audit.list(query),
    queryFn: ({ signal }) => api.get<Paginated<AuditEntry>>('/admin/audit', query, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  const admins = useQuery({
    queryKey: adminKeys.admins.list({ pageSize: 100 }),
    queryFn: ({ signal }) => api.get<Paginated<AdminSummary>>('/admin/admins', { pageSize: 100 }, signal),
    enabled: ability.isSuperadmin,
    staleTime: 60_000,
  });
  const actorOptions = useMemo<ComboOption[]>(
    () => [
      { value: 'superadmin', label: 'Superadmin', description: 'The master key' },
      ...(admins.data?.items ?? []).map((a) => ({ value: a.id, label: a.name, description: a.status === 'active' ? undefined : a.status, icon: <Avatar name={a.name} size={22} /> })),
      { value: 'System', label: 'System', description: 'Jobs, hooks and the seeder' },
    ],
    [admins.data],
  );
  const actorName = actorOptions.find((o) => o.value === params.actor)?.label ?? params.actor;

  const invalidRange = params.from && params.to && params.from > params.to;
  const chips = [
    params.actor ? { key: 'actor', label: `Who: ${actorName}`, onRemove: () => set({ actor: '' }) } : null,
    params.action ? { key: 'action', label: `What: ${ACTION_FAMILIES.find((a) => a.value === params.action)?.label ?? params.action}`, onRemove: () => set({ action: '' }) } : null,
    params.type ? { key: 'type', label: `About: ${RESOURCE_TYPE_LABELS[params.type] ?? params.type}`, onRemove: () => set({ type: '' }) } : null,
    params.from || params.to
      ? {
          key: 'dates',
          label: `When: ${params.from ? formatJakarta(fromJakartaInput(params.from, '12:00'), 'date-short') : 'start'} to ${params.to ? formatJakarta(fromJakartaInput(params.to, '12:00'), 'date-short') : 'now'}`,
          onRemove: () => set({ from: '', to: '' }),
        }
      : null,
  ].filter((c): c is NonNullable<typeof c> => !!c);

  const today = jakartaDateInput(now);
  const quick = [
    { label: 'Today', from: today },
    { label: '7 days', from: jakartaDateInput(new Date(now.getTime() - 6 * 86_400_000)) },
    { label: '30 days', from: jakartaDateInput(new Date(now.getTime() - 29 * 86_400_000)) },
  ];

  const groups = useMemo(() => {
    const out: Array<{ day: string; items: AuditEntry[] }> = [];
    for (const e of q.data?.items ?? []) {
      const day = jakartaDateInput(e.createdAt);
      const last = out[out.length - 1];
      if (last?.day === day) last.items.push(e);
      else out.push({ day, items: [e] });
    }
    return out;
  }, [q.data]);

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Every change in the studio, who made it and when. It only ever grows."
        meta={q.data ? <Badge tone="outline">{q.data.total.toLocaleString('en-US')} entries</Badge> : null}
      />

      <FilterBar
        className="mb-3"
        search={
          ability.isSuperadmin ? (
            <Combobox
              aria-label="Who"
              value={params.actor || null}
              onValueChange={(v) => set({ actor: v ?? '' })}
              options={actorOptions}
              placeholder="Anyone"
              searchPlaceholder="Find an admin"
              clearable
              selectedOption={params.actor ? (actorOptions.find((o) => o.value === params.actor) ?? { value: params.actor, label: params.actor }) : null}
            />
          ) : (
            <SearchInput value={params.actor} onValueChange={(v) => set({ actor: v })} placeholder="Who (name)" debounceMs={300} />
          )
        }
        filters={
          <>
            <Select
              aria-label="Kind of action"
              className="w-[11rem]"
              placeholder="Any action"
              clearable="Any action"
              value={params.action || null}
              onValueChange={(v) => set({ action: v ?? '' })}
              options={ACTION_FAMILIES}
            />
            <Select
              aria-label="About"
              className="w-[11rem]"
              placeholder="Anything"
              clearable="Anything"
              value={params.type || null}
              onValueChange={(v) => set({ type: v ?? '' })}
              options={Object.entries(RESOURCE_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </>
        }
        chips={chips}
        onClearAll={chips.length > 1 ? () => set({ actor: '', action: '', type: '', from: '', to: '' }) : undefined}
      />
      <DateRange
        from={params.from}
        to={params.to}
        onChange={(from, to) => set({ from, to })}
        quick={quick}
        today={today}
        invalid={!!invalidRange}
      />

      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : q.isPending ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" rounded="lg" />
          ))}
        </div>
      ) : q.data.items.length ? (
        <div className={cn('space-y-6 transition-opacity', q.isFetching && q.isPlaceholderData && 'opacity-60')}>
          {groups.map((g) => (
            <section key={g.day} aria-label={formatJakarta(fromJakartaInput(g.day, '12:00'), 'date-long')}>
              <h2 className="label sticky top-[calc(var(--admin-topbar-h,60px)+4.25rem)] z-[1] mb-2 inline-block rounded-full bg-white/90 py-1 pr-3 text-ink-3 backdrop-blur">
                {g.day === today ? 'Today' : formatJakarta(fromJakartaInput(g.day, '12:00'), 'date-long')}
              </h2>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
                {g.items.map((e) => (
                  <AuditRow key={e.id} entry={e} />
                ))}
              </ul>
            </section>
          ))}
          <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPageChange={(page) => void setParams({ page })} noun="entries" />
        </div>
      ) : (
        <EmptyState
          title={chips.length ? 'Nothing matches those filters' : 'Nothing logged yet'}
          description={chips.length ? 'Loosen a filter or widen the dates.' : 'Every change anyone makes shows up here.'}
          cast={[{ shape: 'square', mood: 'look', size: 48 }]}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ date range */

function DateRange({
  from,
  to,
  onChange,
  quick,
  today,
  invalid,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  quick: Array<{ label: string; from: string }>;
  today: string;
  invalid: boolean;
}) {
  const fromId = useId();
  const toId = useId();
  return (
    <div className="mb-6 flex flex-wrap items-end gap-x-3 gap-y-2">
      <div>
        <label htmlFor={fromId} className="mb-1 block text-[0.8125rem] font-medium text-ink-2">
          From
        </label>
        <Input id={fromId} type="date" size="sm" value={from} max={today} onChange={(e) => onChange(e.target.value, to)} className="w-[10.5rem]" aria-invalid={invalid || undefined} />
      </div>
      <div>
        <label htmlFor={toId} className="mb-1 block text-[0.8125rem] font-medium text-ink-2">
          To <span className="text-ink-4">(WIB, inclusive)</span>
        </label>
        <Input id={toId} type="date" size="sm" value={to} max={today} onChange={(e) => onChange(from, e.target.value)} className="w-[10.5rem]" aria-invalid={invalid || undefined} />
      </div>
      <div className="flex flex-wrap gap-1.5 pb-0.5" role="group" aria-label="Quick ranges">
        {quick.map((r) => {
          const on = from === r.from && (to === '' || to === today);
          return (
            <button
              key={r.label}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(r.from, '')}
              className={cn(
                'inline-flex h-8 items-center rounded-full border px-3 text-[0.8125rem] font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                on ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white text-ink-2 hover:border-ink-4 hover:text-ink',
              )}
            >
              {r.label}
            </button>
          );
        })}
      </div>
      {invalid ? (
        <p className="w-full text-[0.8125rem] font-medium text-red-600" role="alert">
          The start is after the end. Swap them?
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ row */

function AuditRow({ entry: e }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const panelId = useId();
  const tone = TONE[auditTone(e.action)];
  const href = auditResourceHref(e);
  const who = actorLabel(e);
  const hasMeta = !!e.meta && Object.keys(e.meta).length > 0;

  return (
    <li>
      <div className="flex items-start gap-3 px-3 py-3 sm:px-4">
        <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full border border-line bg-white" aria-hidden="true">
          <ShapeGlyph shape={tone.shape} className={cn('size-2.5', tone.cls)} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] leading-snug text-ink">{e.summary}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-ink-3">
            <span className="inline-flex items-center gap-1.5">
              {e.actorType === 'system' || e.actorType === 'public' ? null : <Avatar name={who} size={16} />}
              <span className={cn('font-medium', e.actorType === 'superadmin' ? 'text-ink' : 'text-ink-2')}>{who}</span>
            </span>
            <span aria-hidden="true">·</span>
            <DateText value={e.createdAt} format="time" />
            <span aria-hidden="true">·</span>
            <span className="mono text-xs">{e.action}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {href ? (
            <Link
              href={href}
              className="hidden h-7 items-center gap-1 rounded-full px-2.5 text-[0.8125rem] font-medium text-blue-600 transition hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-focus sm:inline-flex"
            >
              {RESOURCE_TYPE_LABELS[e.resourceType ?? ''] ?? 'Open'}
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={open ? 'Hide details' : 'Show details'}
            className="flex size-8 items-center justify-center rounded-full text-ink-3 transition hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
          >
            <ChevronDown className={cn('size-4 transition-transform duration-200', open && 'rotate-180')} aria-hidden="true" />
          </button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={panelId}
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t border-line bg-surface-muted/30 px-3 py-4 sm:px-4 sm:pl-13">
              <KeyValue
                dense
                columns={2}
                items={[
                  { label: 'Exact time', value: <DateText value={e.createdAt} format="datetime" tooltip={false} />, hint: e.createdAt },
                  { label: 'Who', value: `${who} (${e.actorType})`, hint: e.actorId ?? undefined },
                  { label: 'About', value: e.resourceType ? (RESOURCE_TYPE_LABELS[e.resourceType] ?? e.resourceType) : 'Nothing specific', hint: e.resourceId ?? undefined },
                  { label: 'From IP', value: e.ip ?? 'Unknown', mono: !!e.ip },
                ]}
              />
              {href ? (
                <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline sm:hidden">
                  Open {RESOURCE_TYPE_LABELS[e.resourceType ?? '']?.toLowerCase() ?? 'it'}
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </Link>
              ) : null}
              {hasMeta ? <JsonView value={e.meta} label="Details" /> : <p className="text-[0.8125rem] text-ink-3">No extra details on this one.</p>}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}
