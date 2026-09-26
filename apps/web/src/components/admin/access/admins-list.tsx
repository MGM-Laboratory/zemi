'use client';

import { useQuery } from '@tanstack/react-query';
import type { AdminSummary, Paginated } from '@zemi/shared';
import { ChevronRight, KeyRound, Plus, ShieldAlert } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  DataTable,
  DateText,
  EmptyState,
  ErrorState,
  FilterBar,
  PageHeader,
  SearchInput,
  Section,
  SegmentedControl,
  Skeleton,
  Tooltip,
  type ColumnDef,
} from '@/components/admin/ui';
import { api } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { useMediaQuery } from '@/lib/admin/hooks';
import { adminRoutes } from '@/lib/admin/nav';
import { adminKeys } from '@/lib/admin/query-keys';
import { AdminStatusChip, ExpiryHint } from './access-ui';
import { matchingPreset } from './policy-model';
import { compactAccess, touchesPersonalData } from './policy-summary';
import { SessionsList } from './sessions-list';

type StatusFilter = 'all' | AdminSummary['status'];

export function useAdminsList() {
  return useQuery({
    queryKey: adminKeys.admins.list({ pageSize: 100 }),
    queryFn: ({ signal }) => api.get<Paginated<AdminSummary>>('/admin/admins', { pageSize: 100 }, signal),
    staleTime: 15_000,
  });
}

function AccessCell({ admin }: { admin: AdminSummary }) {
  const preset = matchingPreset(admin.policy);
  const c = compactAccess(admin.policy, preset?.label ?? null);
  const pii = touchesPersonalData(admin.policy);
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 font-medium text-ink-2">
        <span className={cn(c.empty && 'text-ink-4')}>{c.label}</span>
        {pii ? (
          <Tooltip content="Can see emails and phone numbers of registrants.">
            <span className="inline-flex text-red-600" tabIndex={0} aria-label="Sees personal data">
              <ShieldAlert className="size-3.5" aria-hidden="true" />
            </span>
          </Tooltip>
        ) : null}
      </p>
      <p className="line-clamp-2 max-w-[19rem] text-[0.8125rem] leading-snug text-ink-3" title={c.detail}>
        {c.detail}
      </p>
    </div>
  );
}

/** /admin/admins: every normal admin with status, expiry, access and sessions. Superadmin only. */
export function AdminsList() {
  const q = useAdminsList();
  const router = useRouter();
  const reduce = useReducedMotion();
  // The table needs a laptop; below that the cards read better than a sideways scroll.
  const wide = useMediaQuery('(min-width: 1280px)', true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const all = useMemo(() => q.data?.items ?? [], [q.data]);
  const counts = useMemo(() => {
    const c = { all: all.length, active: 0, expired: 0, disabled: 0 };
    for (const a of all) c[a.status] += 1;
    return c;
  }, [all]);
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return all.filter((a) => (status === 'all' || a.status === status) && (!s || a.name.toLowerCase().includes(s) || (a.note ?? '').toLowerCase().includes(s)));
  }, [all, search, status]);

  const columns = useMemo<ColumnDef<AdminSummary>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Admin',
        meta: { hideable: false },
        cell: ({ row: { original: a } }) => (
          <div className="min-w-0">
            <p className="max-w-[15rem] truncate font-semibold text-ink" title={a.name}>
              {a.name}
            </p>
            {a.note ? (
              <p className="max-w-[15rem] truncate text-[0.8125rem] text-ink-3" title={a.note}>
                {a.note}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        meta: { width: '7.5rem' },
        cell: ({ row: { original: a } }) => <AdminStatusChip status={a.status} />,
      },
      {
        id: 'access',
        header: 'Access',
        enableSorting: false,
        cell: ({ row: { original: a } }) => <AccessCell admin={a} />,
      },
      {
        accessorKey: 'expiresAt',
        header: 'Ends',
        sortUndefined: 'last',
        meta: { width: '10rem' },
        cell: ({ row: { original: a } }) => (
          <div className="text-[0.8125rem] whitespace-nowrap">
            {a.expiresAt ? <DateText value={a.expiresAt} format="date" className="block text-ink-2" /> : null}
            <ExpiryHint expiresAt={a.expiresAt} />
          </div>
        ),
      },
      {
        accessorKey: 'lastLoginAt',
        header: 'Activity',
        sortUndefined: 'last',
        meta: { width: '9rem', label: 'Last login and sessions' },
        cell: ({ row: { original: a } }) => (
          <div className="text-[0.8125rem] whitespace-nowrap">
            {a.lastLoginAt ? (
              <span className="block text-ink-2">
                Last in <DateText value={a.lastLoginAt} format="relative" />
              </span>
            ) : (
              <span className="block text-ink-4">Never signed in</span>
            )}
            <span className={cn('flex items-center gap-1.5', a.activeSessions ? 'text-green-600' : 'text-ink-3')}>
              <span className={cn('size-1.5 rounded-full', a.activeSessions ? 'bg-green' : 'bg-line-strong')} aria-hidden="true" />
              {a.activeSessions ? `${a.activeSessions} live ${a.activeSessions === 1 ? 'session' : 'sessions'}` : 'No sessions'}
            </span>
          </div>
        ),
      },
    ],
    [],
  );

  const filterBar = (
    <FilterBar
      className={wide ? 'w-full' : 'mb-4'}
      search={<SearchInput value={search} onValueChange={setSearch} placeholder="Search names and notes" slashToFocus debounceMs={100} />}
      filters={
        <SegmentedControl<StatusFilter>
          aria-label="Status"
          size="sm"
          value={status}
          onValueChange={setStatus}
          options={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'active', label: 'Active', count: counts.active },
            { value: 'expired', label: 'Expired', count: counts.expired },
            { value: 'disabled', label: 'Off', count: counts.disabled },
          ]}
        />
      }
    />
  );

  const empty = all.length ? (
    <EmptyState size="sm" title="Nobody matches that" description="Try another name, or clear the filter." cast={[{ shape: 'circle', mood: 'look', size: 40 }]} />
  ) : (
    <EmptyState
      title="Just you so far"
      description="Add helpers with exactly the access they need: door crew for one Friday, a stream operator for the semester."
      cast={[
        { shape: 'circle', mood: 'look', size: 48, lookAt: { x: 0.8, y: 0.2 } },
        { shape: 'arch', mood: 'idle', size: 40 },
      ]}
      action={
        <Button asChild variant="primary" icon={<Plus />}>
          <Link href={`${adminRoutes.admins}/new`}>Add an admin</Link>
        </Button>
      }
    />
  );

  return (
    <div>
      <PageHeader
        title="Admins and access"
        description="Who can get into the studio, and what they can touch. Everything is off until you turn it on."
        meta={
          q.data ? (
            <>
              <Badge tone="outline">{counts.active} active</Badge>
              {counts.expired ? <Badge tone="outline">{counts.expired} expired</Badge> : null}
            </>
          ) : null
        }
        actions={
          <Button asChild variant="primary" icon={<Plus />}>
            <Link href={`${adminRoutes.admins}/new`}>Add an admin</Link>
          </Button>
        }
      />

      {wide && !q.isError ? null : filterBar}

      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : wide ? (
        <DataTable
          aria-label="Admins"
          toolbar={filterBar}
          columns={columns}
          data={q.isPending ? undefined : rows}
          getRowId={(r) => r.id}
          loading={q.isPending}
          fetching={q.isFetching}
          clientPageSize={50}
          noun="admins"
          storageKey="admins"
          onRowClick={(r) => router.push(adminRoutes.admin(r.id))}
          empty={empty}
          maxHeight={null}
        />
      ) : q.isPending ? (
        <div className="space-y-2.5" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full" rounded="lg" />
          ))}
        </div>
      ) : rows.length ? (
        <ul className="grid gap-2.5 md:grid-cols-2" aria-label="Admins">
          {rows.map((a, i) => (
            <motion.li key={a.id} className="min-w-0" initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
              <Card padding="none" interactive className="h-full">
                <Link href={adminRoutes.admin(a.id)} className="flex h-full items-start gap-3 rounded-[20px] p-4 focus-visible:outline-2 focus-visible:outline-focus">
                  <span className="min-w-0 flex-1 space-y-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-ink">{a.name}</span>
                      <AdminStatusChip status={a.status} />
                    </span>
                    <AccessCell admin={a} />
                    <span className="flex flex-wrap gap-x-3 text-[0.8125rem] text-ink-3">
                      <ExpiryHint expiresAt={a.expiresAt} />
                      <span>
                        {a.lastLoginAt ? (
                          <>
                            Last in <DateText value={a.lastLoginAt} format="relative" />
                          </>
                        ) : (
                          'Never signed in'
                        )}
                      </span>
                      <span>
                        {a.activeSessions} {a.activeSessions === 1 ? 'session' : 'sessions'}
                      </span>
                    </span>
                  </span>
                  <ChevronRight className="mt-1 size-4 shrink-0 text-ink-4" aria-hidden="true" />
                </Link>
              </Card>
            </motion.li>
          ))}
        </ul>
      ) : (
        empty
      )}

      <Section
        aside
        className="mt-12"
        title={
          <span className="flex items-center gap-2">
            <KeyRound className="size-4 text-ink-3" aria-hidden="true" /> Your sessions
          </span>
        }
        description="Everywhere the superadmin passphrase is signed in. Left a laptop in the lab? Sign it out here."
      >
        <SessionsList owner="superadmin" name="Superadmin" />
      </Section>
    </div>
  );
}
