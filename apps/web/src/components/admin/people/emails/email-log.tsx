'use client';

import { maskEmail, type EmailLogRow } from '@zemi/shared';
import { AlertTriangle, Check, FileText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/admin/ui/badge';
import { DataTable, type ColumnDef } from '@/components/admin/ui/data-table';
import { DateText } from '@/components/admin/ui/display';
import { EmptyState, ErrorState } from '@/components/admin/ui/feedback';
import { Select } from '@/components/admin/ui/select';
import { SegmentedControl } from '@/components/admin/ui/toggles';
import { Tooltip } from '@/components/admin/ui/tooltip';
import { useEmailLog } from '../queries';

type Status = 'all' | 'sent' | 'logged' | 'failed';

export const TEMPLATE_LABEL: Record<string, string> = {
  'registration-confirmed': 'Ticket',
  'registration-cancelled': 'Seat released',
  'event-reminder': 'Reminder',
  'event-starting': 'Starting now',
  'event-thanks': 'Thank you',
  'event-update': 'Broadcast',
  'event-cancelled': 'Event cancelled',
};
const TEMPLATE_TONE: Record<string, 'blue' | 'green' | 'yellow' | 'red' | 'neutral'> = {
  'registration-confirmed': 'blue',
  'registration-cancelled': 'neutral',
  'event-reminder': 'yellow',
  'event-starting': 'red',
  'event-thanks': 'green',
  'event-update': 'blue',
  'event-cancelled': 'red',
};

/** Masks every address in a To line (the log keeps them whole for people with registrations.view). */
function maskTo(to: string): string {
  return to
    .split(/,\s*/)
    .map((a) => (a.includes('*') ? a : maskEmail(a)))
    .join(', ');
}

/** Everything Zemi emailed about this event: tickets, reminders, broadcasts, tests. Addresses stay masked. */
export function EmailLog({ eventId }: { eventId: string }) {
  const [status, setStatus] = useState<Status>('all');
  const [template, setTemplate] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const log = useEmailLog(eventId, { page, pageSize, status, template: template === 'all' ? undefined : template });

  const columns = useMemo<ColumnDef<EmailLogRow>[]>(
    () => [
      {
        id: 'createdAt',
        accessorKey: 'createdAt',
        header: 'When',
        enableSorting: false,
        cell: ({ getValue }) => <DateText value={getValue<string>()} format="datetime" className="text-sm whitespace-nowrap text-ink-2" />,
      },
      {
        id: 'template',
        accessorKey: 'template',
        header: 'Email',
        enableSorting: false,
        cell: ({ row }) => {
          const t = row.original.template;
          const test = row.original.subject.startsWith('[Test]');
          return (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <Badge tone={TEMPLATE_TONE[t] ?? 'neutral'} size="sm">
                {TEMPLATE_LABEL[t] ?? t}
              </Badge>
              {test ? (
                <Badge tone="neutral" size="sm">
                  Test
                </Badge>
              ) : null}
            </span>
          );
        },
      },
      {
        id: 'subject',
        accessorKey: 'subject',
        header: 'Subject',
        enableSorting: false,
        cell: ({ getValue }) => <span className="line-clamp-1 min-w-[12rem] text-ink">{getValue<string>()}</span>,
      },
      {
        id: 'to',
        accessorKey: 'to',
        header: 'To',
        enableSorting: false,
        cell: ({ getValue }) => <span className="mono text-[0.8125rem] whitespace-nowrap text-ink-2">{maskTo(getValue<string>())}</span>,
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: 'Status',
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          if (r.status === 'failed') {
            return (
              <Tooltip content={r.error ?? 'The mail service said no.'}>
                <span className="inline-flex items-center gap-1.5 text-sm font-medium whitespace-nowrap text-red-600">
                  <AlertTriangle className="size-3.5" aria-hidden="true" />
                  Failed
                  <span className="sr-only">: {r.error ?? 'no reason given'}</span>
                </span>
              </Tooltip>
            );
          }
          if (r.status === 'logged') {
            return (
              <Tooltip content="No mail key in this environment, so it went to the dev outbox instead.">
                <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap text-ink-3">
                  <FileText className="size-3.5" aria-hidden="true" />
                  Outbox
                </span>
              </Tooltip>
            );
          }
          return (
            <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap text-green-600">
              <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
              Sent
            </span>
          );
        },
      },
    ],
    [],
  );

  if (log.isError && !log.data) return <ErrorState error={log.error} onRetry={() => void log.refetch()} retrying={log.isFetching} />;

  return (
    <section aria-labelledby="email-log-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="email-log-title" className="font-display text-xl font-extrabold tracking-[-0.02em]">
            What went out
          </h2>
          <p className="text-sm text-ink-3">Every email about this Friday: tickets, reminders, broadcasts and tests. Addresses stay masked.</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Select
            size="md"
            aria-label="Email type"
            className="w-full sm:w-[11rem]"
            value={template}
            onValueChange={(v) => {
              setTemplate(v ?? 'all');
              setPage(1);
            }}
            options={[{ value: 'all', label: 'Every kind' }, ...Object.entries(TEMPLATE_LABEL).map(([value, label]) => ({ value, label }))]}
          />
          <SegmentedControl<Status>
            aria-label="Status"
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={[
              { value: 'all', label: 'All' },
              { value: 'sent', label: 'Sent' },
              { value: 'logged', label: 'Outbox' },
              { value: 'failed', label: 'Failed' },
            ]}
          />
        </div>
      </div>
      <DataTable<EmailLogRow>
        aria-label="Email log"
        columns={columns}
        data={log.data?.items}
        getRowId={(r) => r.id}
        loading={log.isPending}
        fetching={log.isFetching}
        total={log.data?.total}
        pagination={{ page, pageSize }}
        onPaginationChange={(p) => {
          setPage(p.page);
          setPageSize(p.pageSize);
        }}
        pageSizes={[20, 50, 100]}
        noun="emails"
        storageKey="event-emails"
        maxHeight={null}
        empty={
          status !== 'all' || template !== 'all' ? (
            <EmptyState framed={false} size="sm" title="Nothing like that." description="Try another kind or status." />
          ) : (
            <EmptyState
              framed={false}
              size="sm"
              title="No emails yet."
              description="Tickets, reminders and your broadcasts show up here as they go out."
              cast={[
                { shape: 'circle', mood: 'look', size: 44, lookAt: { x: 0.7, y: -0.3 } },
                { shape: 'square', mood: 'sleep', size: 36 },
              ]}
            />
          )
        }
      />
    </section>
  );
}
