'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { formatJakarta, type AudienceRow, type Paginated } from '@zemi/shared';
import { Download, ExternalLink, Mail, MessageCircle, X } from 'lucide-react';
import Link from 'next/link';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { useMemo, useRef, useState } from 'react';
import { Avatar } from '@/components/admin/ui/media';
import { Badge } from '@/components/admin/ui/badge';
import { Button } from '@/components/admin/ui/button';
import { Sheet } from '@/components/admin/ui/dialog';
import { DataTable, type ColumnDef } from '@/components/admin/ui/data-table';
import { DateText, KeyValue } from '@/components/admin/ui/display';
import { EmptyState, ErrorState } from '@/components/admin/ui/feedback';
import { FilterBar, SearchInput } from '@/components/admin/ui/filters';
import { PageHeader } from '@/components/admin/ui/page-header';
import { Progress } from '@/components/admin/ui/progress';
import { notify } from '@/components/admin/ui/toast';
import { Tooltip } from '@/components/admin/ui/tooltip';
import { api, errorMessage, isAbortError } from '@/lib/admin/api';
import { adminRoutes } from '@/lib/admin/nav';
import { cn } from '@/lib/admin/cn';
import { downloadBlob, formatPhone, peopleKeys, toCsv, whatsappUrl } from '../lib';

const PAGE_SIZES = [20, 50, 100];
const DOTS = 10;

function useAudienceParams() {
  return useQueryStates(
    {
      q: parseAsString.withDefault(''),
      page: parseAsInteger.withDefault(1),
      size: parseAsInteger.withDefault(50),
      p: parseAsString, // open person (email)
    },
    { history: 'replace', scroll: false },
  );
}

/** Fridays that already happened (or that they already came to): the fair base for a show-up rate. */
function pastCount(r: AudienceRow, now = Date.now()) {
  return r.events.filter((e) => e.checkedIn || new Date(e.startsAt).getTime() < now).length;
}
function rate(r: AudienceRow): number | null {
  const past = pastCount(r);
  return past ? Math.min(1, r.attended / past) : null;
}

/**
 * /admin/audience (audience.view): everyone who ever held a seat, across every Friday, with how
 * often they came. Search and paging live in the URL. The CSV is built in the browser from every
 * page of the current search (the API caps pages at 100).
 */
export function AudiencePage() {
  const [f, setF] = useAudienceParams();
  const pageSize = PAGE_SIZES.includes(f.size) ? f.size : 50;
  const page = Math.max(1, f.page);
  const params = { search: f.q || undefined, page, pageSize };
  const list = useQuery({
    queryKey: peopleKeys.audience(params),
    queryFn: ({ signal }) => api.get<Paginated<AudienceRow>>('/admin/audience', params, signal),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.items;
  const open = f.p ? (rows?.find((r) => r.email === f.p) ?? null) : null;

  const columns = useMemo<ColumnDef<AudienceRow>[]>(
    () => [
      {
        id: 'fullName',
        accessorKey: 'fullName',
        header: 'Name',
        enableSorting: false,
        meta: { hideable: false },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex items-center gap-2.5">
              <Avatar name={r.fullName} size={30} className="shrink-0" />
              {/* The name stays on one line; on a tight table the badge drops under it. */}
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-medium whitespace-nowrap text-ink">{r.fullName}</span>
                {r.attended >= 3 ? (
                  <Badge tone="green" size="sm" shape="arch">
                    Regular
                  </Badge>
                ) : r.registrations === 1 ? (
                  <Badge tone="neutral" size="sm">
                    New
                  </Badge>
                ) : null}
              </div>
            </div>
          );
        },
      },
      {
        id: 'email',
        accessorKey: 'email',
        header: 'Email',
        enableSorting: false,
        cell: ({ getValue }) => <span className="text-ink-2">{getValue<string>()}</span>,
      },
      {
        id: 'phone',
        accessorKey: 'phone',
        header: 'Phone',
        enableSorting: false,
        cell: ({ getValue }) => <span className="mono text-sm whitespace-nowrap text-ink-2">{formatPhone(getValue<string | null>()) || <span className="text-ink-4">None</span>}</span>,
      },
      {
        id: 'history',
        header: 'Fridays',
        enableSorting: false,
        cell: ({ row }) => <AttendanceDots row={row.original} />,
      },
      {
        id: 'attended',
        accessorKey: 'attended',
        header: 'Came',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const r = row.original;
          const past = pastCount(r);
          const pr = rate(r);
          if (pr == null)
            return (
              <span className="text-sm whitespace-nowrap text-ink-3" title="Their first Friday is still ahead">
                Coming up
              </span>
            );
          return (
            <span className="mono text-sm whitespace-nowrap text-ink tabular-nums" title={`Came to ${r.attended} of ${past} Fridays that already happened`}>
              {r.attended}
              <span className="text-ink-4">/{past}</span>
              <span className="ml-2 text-ink-3">{Math.round(pr * 100)}%</span>
            </span>
          );
        },
      },
      {
        id: 'lastSeen',
        accessorKey: 'lastSeen',
        header: 'Last signed up',
        enableSorting: false,
        cell: ({ getValue }) => <DateText value={getValue<string>()} format="date" className="text-sm whitespace-nowrap text-ink-2" />,
      },
      {
        id: 'firstSeen',
        accessorKey: 'firstSeen',
        header: 'First time',
        enableSorting: false,
        cell: ({ getValue }) => <DateText value={getValue<string>()} format="date" className="text-sm whitespace-nowrap text-ink-3" />,
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Audience"
        description={
          list.data ? (
            <>
              <span className="font-semibold text-ink">{list.data.total.toLocaleString('en-US')}</span> {list.data.total === 1 ? 'person has' : 'people have'} saved a seat{f.q ? ' matching that search' : ' at a Zemi Friday'}. Newest first.
            </>
          ) : (
            'Everyone who ever saved a seat, across every Friday.'
          )
        }
        actions={<ExportButton search={f.q} total={list.data?.total ?? 0} />}
      />

      {list.isError && !list.data ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} retrying={list.isFetching} />
      ) : (
        <>
          <FilterBar
            search={
              <SearchInput
                value={f.q}
                onValueChange={(q) => void setF({ q, page: 1 })}
                placeholder="Search name, email or phone"
                aria-label="Search the audience"
                loading={list.isFetching && Boolean(f.q)}
                slashToFocus
              />
            }
            chips={f.q ? [{ key: 'q', label: `"${f.q}"`, onRemove: () => void setF({ q: '', page: 1 }) }] : []}
            onClearAll={() => void setF({ q: '', page: 1 })}
          />
          <DataTable<AudienceRow>
            className="mt-3"
            aria-label="Audience"
            columns={columns}
            data={rows}
            getRowId={(r) => r.email}
            loading={list.isPending}
            fetching={list.isFetching}
            total={list.data?.total}
            pagination={{ page, pageSize }}
            onPaginationChange={(p) => void setF({ page: p.page, size: p.pageSize })}
            pageSizes={PAGE_SIZES}
            noun="people"
            onRowClick={(r) => void setF({ p: r.email })}
            activeRowId={f.p}
            storageKey="audience"
            initialColumnVisibility={{ firstSeen: false }}
            maxHeight={null}
            empty={
              f.q ? (
                <EmptyState framed={false} size="sm" title="Nobody by that name." description="Try part of the email, or the last digits of a phone number." cast={[{ shape: 'circle', mood: 'look', size: 44, lookAt: { x: 0.8, y: 0.2 } }]} />
              ) : (
                <EmptyState framed={false} size="sm" title="No audience yet." description="Once people sign up for a Friday, they gather here." cast={[{ shape: 'arch', mood: 'idle', size: 48 }, { shape: 'square', mood: 'sleep', size: 36 }]} />
              )
            }
          />
        </>
      )}

      <PersonSheet row={open} email={f.p} onClose={() => void setF({ p: null })} />
    </div>
  );
}

/* ------------------------------------------------------------------ history dots */

/** Newest Friday on the left. Filled green = came, hollow ring = signed up but didn't make it. */
function AttendanceDots({ row }: { row: AudienceRow }) {
  const shown = row.events.slice(0, DOTS);
  const more = row.events.length - shown.length;
  return (
    <span className="flex items-center gap-1" aria-label={`Came to ${row.attended} of ${row.registrations} Fridays`} role="img">
      {shown.map((e) => (
        <Tooltip key={e.id} content={`${e.title}, ${formatJakarta(e.startsAt, 'date-short')}: ${e.checkedIn ? 'came' : new Date(e.startsAt) > new Date() ? 'coming up' : 'missed it'}`}>
          <span
            className={cn(
              'size-2.5 shrink-0 rounded-full transition-transform duration-150 hover:scale-150',
              e.checkedIn ? 'bg-green' : new Date(e.startsAt) > new Date() ? 'border-2 border-blue' : 'border-2 border-line-strong',
            )}
          />
        </Tooltip>
      ))}
      {more > 0 ? <span className="mono ml-0.5 text-[0.75rem] text-ink-4">+{more}</span> : null}
    </span>
  );
}

/* ------------------------------------------------------------------ person sheet */

function PersonSheet({ row, email, onClose }: { row: AudienceRow | null; email: string | null; onClose: () => void }) {
  const wa = whatsappUrl(row?.phone);
  return (
    <Sheet open={Boolean(email)} onOpenChange={(o) => !o && onClose()} width="md" title={row?.fullName ?? 'Person'} description={row ? `Signed up for ${row.registrations} ${row.registrations === 1 ? 'Friday' : 'Fridays'}, came to ${row.attended}` : undefined}>
      {row ? (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar name={row.fullName} size={56} />
            <div className="min-w-0">
              <p className="font-display text-[2rem] leading-none font-extrabold tracking-[-0.04em]">
                {rate(row) == null ? 'New' : `${Math.round((rate(row) ?? 0) * 100)}%`}
              </p>
              <p className="text-sm text-ink-3">{rate(row) == null ? 'first Friday coming up' : `show-up rate, ${row.attended} of ${pastCount(row)} Fridays`}</p>
            </div>
          </div>
          <KeyValue
            dense
            items={[
              {
                label: 'Email',
                value: (
                  <a href={`mailto:${row.email}`} className="inline-flex items-center gap-1.5 text-blue-600 underline-offset-4 hover:underline">
                    <Mail className="size-3.5" aria-hidden="true" />
                    {row.email}
                  </a>
                ),
              },
              {
                label: 'Phone',
                value: row.phone ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="mono text-sm">{formatPhone(row.phone)}</span>
                    {wa ? (
                      <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[0.8125rem] text-green-600 hover:underline">
                        <MessageCircle className="size-3.5" aria-hidden="true" />
                        WhatsApp
                      </a>
                    ) : null}
                  </span>
                ) : null,
              },
              { label: 'First time', value: <DateText value={row.firstSeen} format="date" /> },
              { label: 'Last signed up', value: <DateText value={row.lastSeen} format="date" /> },
            ]}
          />
          <section aria-labelledby="person-fridays" className="space-y-2">
            <h3 id="person-fridays" className="font-display text-base font-extrabold tracking-[-0.01em]">
              Their Fridays
            </h3>
            <ol className="space-y-1.5">
              {row.events.map((e) => {
                const upcoming = new Date(e.startsAt) > new Date();
                return (
                  <li key={e.id}>
                    <Link
                      href={`${adminRoutes.event(e.id, 'registrations')}?q=${encodeURIComponent(row.email)}&status=all`}
                      className="group flex items-center gap-3 rounded-2xl border border-line px-3.5 py-2.5 transition-colors hover:border-ink-4 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-focus"
                    >
                      <span
                        className={cn('size-3 shrink-0 rounded-full', e.checkedIn ? 'bg-green' : upcoming ? 'border-2 border-blue' : 'border-2 border-line-strong')}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink">{e.title}</span>
                        <span className="block text-[0.8125rem] text-ink-3">
                          {formatJakarta(e.startsAt, 'date')} · {e.checkedIn ? 'Came' : upcoming ? 'Coming up' : 'Missed it'}
                        </span>
                      </span>
                      <ExternalLink className="size-4 shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                      <span className="sr-only">Open their registration</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      ) : (
        <p className="text-sm text-ink-3">This person is not on the current page. Search for their email to open them.</p>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ CSV export */

function ExportButton({ search, total }: { search: string; total: number }) {
  const [progress, setProgress] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);

  const run = async () => {
    const ctrl = new AbortController();
    abort.current = ctrl;
    setProgress(0);
    const all: AudienceRow[] = [];
    try {
      let page = 1;
      let expected = total;
      for (;;) {
        const res = await api.get<Paginated<AudienceRow>>('/admin/audience', { search: search || undefined, page, pageSize: 100 }, ctrl.signal);
        all.push(...res.items);
        expected = res.total;
        setProgress(expected ? Math.min(1, all.length / expected) : 1);
        if (!res.items.length || all.length >= res.total) break;
        page += 1;
      }
      const header = ['Name', 'Email', 'Phone', 'Fridays signed up', 'Fridays attended', 'Show-up rate', 'First time (WIB)', 'Last signed up (WIB)', 'Fridays (newest first)'];
      const lines = all.map((r) => [
        r.fullName,
        r.email,
        r.phone ?? '',
        r.registrations,
        r.attended,
        rate(r) == null ? '' : `${Math.round((rate(r) ?? 0) * 100)}%`,
        formatJakarta(r.firstSeen, 'datetime'),
        formatJakarta(r.lastSeen, 'datetime'),
        r.events.map((e) => `${e.title} (${formatJakarta(e.startsAt, 'iso-date')}, ${e.checkedIn ? 'came' : 'no'})`).join('; '),
      ]);
      const stamp = formatJakarta(new Date(), 'iso-date');
      downloadBlob(`zemi-audience${search ? '-search' : ''}-${stamp}.csv`, new Blob([toCsv(header, lines)], { type: 'text/csv;charset=utf-8' }));
      notify.success(`Exported ${all.length.toLocaleString('en-US')} ${all.length === 1 ? 'person' : 'people'}.`);
    } catch (err) {
      if (isAbortError(err)) notify.info('Export stopped. Nothing was saved.');
      else notify.error(`The export stopped halfway: ${errorMessage(err)}`);
    } finally {
      abort.current = null;
      setProgress(null);
    }
  };

  if (progress != null) {
    return (
      <div className="flex items-center gap-3 rounded-full border border-line bg-white py-1 pr-1 pl-4" role="status">
        <span className="text-sm text-ink-2">Gathering everyone</span>
        <Progress value={progress} size="sm" className="w-24" label="Export progress" />
        <Button size="sm" variant="ghost" icon={<X />} onClick={() => abort.current?.abort()}>
          Stop
        </Button>
      </div>
    );
  }
  return (
    <Button variant="secondary" icon={<Download />} onClick={() => void run()} disabled={!total}>
      Export CSV{search ? ' (this search)' : ''}
    </Button>
  );
}
