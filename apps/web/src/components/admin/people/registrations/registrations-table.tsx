'use client';

import { formatJakarta, type EventAction, type RegistrationRow } from '@zemi/shared';
import {
  Ban,
  Check,
  Eye,
  Mail,
  MoreHorizontal,
  RotateCcw,
  StickyNote,
  Trash2,
  Undo2,
  UserCheck,
} from 'lucide-react';
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { useMemo, useState, type ReactNode } from 'react';
import { Badge } from '@/components/admin/ui/badge';
import { useConfirm } from '@/components/admin/ui/confirm-dialog';
import { DataTable, type ColumnDef, type SortingState } from '@/components/admin/ui/data-table';
import { DateText } from '@/components/admin/ui/display';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/admin/ui/dropdown-menu';
import { EmptyState, ErrorState } from '@/components/admin/ui/feedback';
import { FilterBar, SearchInput, type FilterChip } from '@/components/admin/ui/filters';
import { IconButton } from '@/components/admin/ui/button';
import { Select } from '@/components/admin/ui/select';
import { StatusChip } from '@/components/admin/ui/status-chip';
import { Tooltip } from '@/components/admin/ui/tooltip';
import { cn } from '@/lib/admin/cn';
import {
  CHECKED_FILTERS,
  formatPhone,
  MODE_FILTERS,
  MODE_LABEL,
  shortName,
  sortToState,
  SORTS,
  SOURCE_FILTERS,
  SOURCE_LABEL,
  stateToSort,
  STATUS_FILTERS,
  type RegistrationSort,
} from '../lib';
import { useBulkRegistrations, useRegistrationActions, useRegistrationList, type BulkAction, type RegistrationListParams } from '../queries';
import { RegistrationSheet } from './registration-sheet';

const PAGE_SIZES = [20, 50, 100, 200];

/** URL state for the registrations list (nuqs): share a filtered view by copying the link. */
export function useRegistrationFilters() {
  return useQueryStates(
    {
      q: parseAsString.withDefault(''),
      status: parseAsStringLiteral(STATUS_FILTERS).withDefault('registered'),
      in: parseAsStringLiteral(CHECKED_FILTERS).withDefault('all'),
      mode: parseAsStringLiteral(MODE_FILTERS).withDefault('all'),
      src: parseAsStringLiteral(SOURCE_FILTERS).withDefault('all'),
      sort: parseAsStringLiteral(SORTS).withDefault('-createdAt'),
      page: parseAsInteger.withDefault(1),
      size: parseAsInteger.withDefault(50),
      r: parseAsString, // open registration (Sheet)
    },
    { history: 'replace', scroll: false },
  );
}

export type RegistrationFilters = ReturnType<typeof useRegistrationFilters>[0];

export function listParams(f: RegistrationFilters): RegistrationListParams {
  return {
    search: f.q || undefined,
    status: f.status,
    checkedIn: f.in,
    mode: f.mode,
    source: f.src,
    sort: f.sort,
    page: Math.max(1, f.page),
    pageSize: PAGE_SIZES.includes(f.size) ? f.size : 50,
  };
}

const STATUS_OPTS = [
  { value: 'registered', label: 'Active seats' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'Everyone' },
] as const;
const CHECKED_OPTS = [
  { value: 'all', label: 'Checked in or not' },
  { value: 'yes', label: 'Checked in' },
  { value: 'no', label: 'Not yet' },
] as const;
const MODE_OPTS = [
  { value: 'all', label: 'Any mode' },
  { value: 'in-person', label: 'In person' },
  { value: 'online', label: 'Online' },
] as const;
const SOURCE_OPTS = [
  { value: 'all', label: 'Any source' },
  { value: 'web', label: 'Website' },
  { value: 'admin', label: 'Added by admin' },
  { value: 'walk-in', label: 'Walk-in' },
  { value: 'import', label: 'Imported' },
] as const;

/**
 * The registrations list: server-side paging, sorting and search, filters in the URL,
 * selection with bulk actions (by permission), and a detail Sheet per row.
 */
export function RegistrationsTable({ eventId, perms, toolbarExtra }: { eventId: string; perms: ReadonlySet<EventAction>; toolbarExtra?: ReactNode }) {
  const [f, setF] = useRegistrationFilters();
  const params = listParams(f);
  const list = useRegistrationList(eventId, params);
  const bulk = useBulkRegistrations(eventId);
  const actions = useRegistrationActions(eventId);
  const confirm = useConfirm();
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  // A new search, filter or sort starts a fresh selection, so a bulk action never reaches rows
  // that are no longer on screen (the bulk bar acts on every selected id).
  const viewKey = `${f.q}|${f.status}|${f.in}|${f.mode}|${f.src}|${f.sort}`;
  const [selectionView, setSelectionView] = useState(viewKey);
  if (selectionView !== viewKey) {
    setSelectionView(viewKey);
    setSelection({});
  }
  const canManage = perms.has('registrations.manage');
  const canDoor = perms.has('attendance.manage');

  const sorting: SortingState = sortToState(f.sort as RegistrationSort);
  const rows = list.data?.items;
  const openRow = f.r ? (rows?.find((r) => r.id === f.r) ?? null) : null;

  const runBulk = async (action: BulkAction, ids: string[], clear: () => void) => {
    if (action === 'delete' || action === 'cancel') {
      const n = ids.length;
      const ok = await confirm({
        title: action === 'delete' ? `Delete ${n} ${n === 1 ? 'registration' : 'registrations'}?` : `Cancel ${n} ${n === 1 ? 'seat' : 'seats'}?`,
        description:
          action === 'delete'
            ? 'Their tickets and QR codes stop working and their check-in history goes too. This cannot be undone. Cancelling is usually kinder.'
            : 'Their tickets stop working at the door and the seats open up again. Nobody gets an email. You can restore them later.',
        confirmLabel: action === 'delete' ? `Delete ${n}` : `Cancel ${n} ${n === 1 ? 'seat' : 'seats'}`,
        destructive: true,
      });
      if (!ok) return;
    }
    if (action === 'resend' && ids.length > 20) {
      const ok = await confirm({
        title: `Email ${ids.length} tickets again?`,
        description: 'Everyone selected gets their ticket email one more time. Handy after a venue change, noisy otherwise.',
        confirmLabel: `Send ${ids.length} emails`,
      });
      if (!ok) return;
    }
    await bulk.mutateAsync({ ids, action }).then(clear).catch(() => undefined);
  };

  const rowMenu = (r: RegistrationRow) => {
    const cancelled = r.status === 'cancelled';
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton label={`Actions for ${r.fullName}`} size="sm">
            <MoreHorizontal />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem icon={<Eye />} onSelect={() => void setF({ r: r.id })}>
            Open details
          </DropdownMenuItem>
          {canDoor && !cancelled ? (
            r.checkedInAt ? (
              <DropdownMenuItem icon={<Undo2 />} onSelect={() => actions.checkIn.mutate({ id: r.id, fullName: r.fullName, undo: true })}>
                Undo check-in
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem icon={<UserCheck />} onSelect={() => actions.checkIn.mutate({ id: r.id, fullName: r.fullName })}>
                Check in now
              </DropdownMenuItem>
            )
          ) : null}
          {canManage && !cancelled ? (
            <DropdownMenuItem icon={<Mail />} onSelect={() => actions.resend.mutate({ id: r.id, fullName: r.fullName })}>
              Resend ticket
            </DropdownMenuItem>
          ) : null}
          {canManage ? (
            <>
              <DropdownMenuSeparator />
              {cancelled ? (
                <DropdownMenuItem icon={<RotateCcw />} onSelect={() => actions.patch.mutate({ id: r.id, body: { status: 'registered' }, message: `${shortName(r.fullName)} has a seat again.` })}>
                  Restore seat
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  icon={<Ban />}
                  destructive
                  onSelect={async () => {
                    const ok = await confirm({
                      title: `Cancel ${shortName(r.fullName)}'s seat?`,
                      description: 'Their ticket stops working at the door and the seat opens up. No email goes out. You can restore it later.',
                      confirmLabel: 'Cancel seat',
                      destructive: true,
                    });
                    if (ok) actions.patch.mutate({ id: r.id, body: { status: 'cancelled' }, message: `Cancelled ${shortName(r.fullName)}'s seat.` });
                  }}
                >
                  Cancel seat
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                icon={<Trash2 />}
                destructive
                onSelect={async () => {
                  const ok = await confirm({
                    title: `Delete ${r.fullName}?`,
                    description: 'The registration, ticket and check-in history go for good. Cancelling the seat keeps the history.',
                    confirmLabel: 'Delete registration',
                    destructive: true,
                  });
                  if (ok) actions.remove.mutate({ id: r.id, fullName: r.fullName });
                }}
              >
                Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const columns = useMemo<ColumnDef<RegistrationRow>[]>(
    () => [
      {
        id: 'fullName',
        accessorKey: 'fullName',
        header: 'Name',
        meta: { hideable: false },
        cell: ({ row }) => {
          const r = row.original;
          return (
            // The name stays on one line; on a tight table the badges drop under it.
            <div className="flex min-w-[10rem] flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className={cn('font-medium whitespace-nowrap text-ink', r.status === 'cancelled' && 'text-ink-3 line-through decoration-ink-4')}>{r.fullName}</span>
              {r.otherEvents > 0 ? (
                <Tooltip content={`Also registered for ${r.otherEvents} other ${r.otherEvents === 1 ? 'Friday' : 'Fridays'}`}>
                  <span>
                    <Badge tone="blue" size="sm" shape="circle">
                      Returning{r.otherEvents > 1 ? ` · ${r.otherEvents}` : ''}
                    </Badge>
                  </span>
                </Tooltip>
              ) : null}
              {r.status === 'cancelled' ? <StatusChip kind="registration" value="cancelled" size="sm" /> : null}
              {r.notes ? (
                <Tooltip content={r.notes}>
                  <StickyNote className="size-3.5 shrink-0 text-ink-3" aria-label="Has notes" />
                </Tooltip>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'checkedInAt',
        accessorKey: 'checkedInAt',
        header: 'Checked in',
        cell: ({ row }) => {
          const r = row.original;
          if (!r.checkedInAt) return <span className="text-sm text-ink-3">Not yet</span>;
          return (
            <Tooltip content={`${r.checkInMethod === 'qr' ? 'Scanned' : 'Checked in by hand'}${r.checkedInBy ? ` by ${r.checkedInBy}` : ''}`}>
              <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap text-green-600">
                <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
                <DateText value={r.checkedInAt} format="time" tooltip={false} />
              </span>
            </Tooltip>
          );
        },
      },
      {
        // Email over phone in one column, so the list fits a laptop without scrolling sideways.
        id: 'contact',
        accessorKey: 'email',
        header: 'Contact',
        enableSorting: false,
        meta: { label: 'Email and phone' },
        cell: ({ row }) => {
          const r = row.original;
          const phone = formatPhone(r.phone);
          return (
            <div className="min-w-0 leading-snug">
              <span className="block max-w-[17rem] truncate text-ink-2" title={r.email}>
                {r.email}
              </span>
              <span className={cn('mono block text-[0.8125rem] whitespace-nowrap', phone ? 'text-ink-2' : 'text-ink-3')}>{phone || 'No phone'}</span>
            </div>
          );
        },
      },
      {
        id: 'attendanceMode',
        accessorKey: 'attendanceMode',
        header: 'Mode',
        enableSorting: false,
        cell: ({ row }) => (
          <Badge tone={row.original.attendanceMode === 'online' ? 'green' : 'neutral'} size="sm" shape={row.original.attendanceMode === 'online' ? 'arch' : 'square'}>
            {MODE_LABEL[row.original.attendanceMode]}
          </Badge>
        ),
      },
      {
        id: 'ticketCode',
        accessorKey: 'ticketCode',
        header: 'Ticket',
        enableSorting: false,
        cell: ({ getValue }) => <span className="mono text-sm whitespace-nowrap">{getValue<string>()}</span>,
      },
      {
        id: 'createdAt',
        accessorKey: 'createdAt',
        header: 'Registered',
        meta: { label: 'Registered and source' },
        // Compact ("25 Sept, 13:16 WIB") with the source under it, so the list fits a laptop;
        // the full date is in the tooltip.
        cell: ({ row }) => {
          const v = row.original.createdAt;
          return (
            <div className="leading-snug whitespace-nowrap">
              <time dateTime={v} title={`${formatJakarta(v, 'datetime')} WIB`} className="block text-sm text-ink-2 tabular-nums">
                {formatJakarta(v, 'date-short')}, {formatJakarta(v, 'time')} WIB
              </time>
              <span className="block text-[0.8125rem] text-ink-3">{SOURCE_LABEL[row.original.source]}</span>
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        // Pinned right, so the row menu is always on screen even when the table scrolls.
        meta: { hideable: false, stopRowClick: true, width: '3.5rem', align: 'right', pin: 'right' },
        cell: ({ row }) => rowMenu(row.original),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage, canDoor],
  );

  const chips: FilterChip[] = [];
  if (f.status !== 'registered') chips.push({ key: 'status', label: `Showing: ${STATUS_OPTS.find((o) => o.value === f.status)?.label}`, onRemove: () => void setF({ status: 'registered', page: 1 }) });
  if (f.in !== 'all') chips.push({ key: 'in', label: CHECKED_OPTS.find((o) => o.value === f.in)!.label, onRemove: () => void setF({ in: 'all', page: 1 }) });
  if (f.mode !== 'all') chips.push({ key: 'mode', label: MODE_OPTS.find((o) => o.value === f.mode)!.label, onRemove: () => void setF({ mode: 'all', page: 1 }) });
  if (f.src !== 'all') chips.push({ key: 'src', label: `Source: ${SOURCE_OPTS.find((o) => o.value === f.src)!.label}`, onRemove: () => void setF({ src: 'all', page: 1 }) });
  if (f.q) chips.push({ key: 'q', label: `"${f.q}"`, onRemove: () => void setF({ q: '', page: 1 }) });

  const filtered = chips.length > 0;

  if (list.isError && !list.data) {
    return <ErrorState error={list.error} onRetry={() => void list.refetch()} retrying={list.isFetching} />;
  }

  return (
    <>
      <FilterBar
        search={
          <SearchInput
            value={f.q}
            onValueChange={(q) => void setF({ q, page: 1 })}
            placeholder="Search name, email, phone, code, notes"
            aria-label="Search registrations"
            loading={list.isFetching && Boolean(f.q)}
            slashToFocus
          />
        }
        filters={
          <div className="grid w-[calc(100vw-2rem)] grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <Select size="md" aria-label="Status" className="w-full sm:w-[10.5rem]" value={f.status} onValueChange={(v) => void setF({ status: (v ?? 'registered') as typeof f.status, page: 1 })} options={[...STATUS_OPTS]} />
            <Select size="md" aria-label="Checked in" className="w-full sm:w-[11.5rem]" value={f.in} onValueChange={(v) => void setF({ in: (v ?? 'all') as typeof f.in, page: 1 })} options={[...CHECKED_OPTS]} />
            <Select size="md" aria-label="Mode" className="w-full sm:w-[9.5rem]" value={f.mode} onValueChange={(v) => void setF({ mode: (v ?? 'all') as typeof f.mode, page: 1 })} options={[...MODE_OPTS]} />
            <Select size="md" aria-label="Source" className="w-full sm:w-[10.5rem]" value={f.src} onValueChange={(v) => void setF({ src: (v ?? 'all') as typeof f.src, page: 1 })} options={[...SOURCE_OPTS]} />
          </div>
        }
        chips={chips}
        onClearAll={() => void setF({ q: '', status: 'registered', in: 'all', mode: 'all', src: 'all', page: 1 })}
        actions={toolbarExtra}
      />

      <DataTable<RegistrationRow>
        className="mt-3"
        aria-label="Registrations"
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        loading={list.isPending}
        fetching={list.isFetching}
        total={list.data?.total}
        pagination={{ page: params.page, pageSize: params.pageSize }}
        onPaginationChange={({ page, pageSize }) => {
          setSelection({});
          void setF({ page, size: pageSize });
        }}
        pageSizes={PAGE_SIZES}
        noun="people"
        sorting={sorting}
        onSortingChange={(s) => void setF({ sort: stateToSort(s, '-createdAt'), page: 1 })}
        selectable={canManage || canDoor}
        rowSelection={selection}
        onRowSelectionChange={setSelection}
        bulkActions={({ ids, rows: sel, clear }) => {
          const anyCancelled = sel.some((r) => r.status === 'cancelled');
          const anyActive = sel.some((r) => r.status !== 'cancelled');
          const anyIn = sel.some((r) => r.checkedInAt);
          const anyOut = sel.some((r) => !r.checkedInAt && r.status !== 'cancelled');
          const pending = bulk.isPending;
          return (
            <>
              {canDoor && (anyOut || sel.length === 0) ? <BulkBtn icon={<UserCheck />} onClick={() => void runBulk('check-in', ids, clear)} disabled={pending}>Check in</BulkBtn> : null}
              {canDoor && (anyIn || sel.length === 0) ? <BulkBtn icon={<Undo2 />} onClick={() => void runBulk('undo-check-in', ids, clear)} disabled={pending}>Undo check-in</BulkBtn> : null}
              {canManage && (anyActive || sel.length === 0) ? <BulkBtn icon={<Mail />} onClick={() => void runBulk('resend', ids, clear)} disabled={pending}>Resend tickets</BulkBtn> : null}
              {canManage && (anyActive || sel.length === 0) ? <BulkBtn icon={<Ban />} onClick={() => void runBulk('cancel', ids, clear)} disabled={pending}>Cancel</BulkBtn> : null}
              {canManage && anyCancelled ? <BulkBtn icon={<RotateCcw />} onClick={() => void runBulk('restore', ids, clear)} disabled={pending}>Restore</BulkBtn> : null}
              {canManage ? <BulkBtn icon={<Trash2 />} tone="danger" onClick={() => void runBulk('delete', ids, clear)} disabled={pending}>Delete</BulkBtn> : null}
            </>
          );
        }}
        onRowClick={(r) => void setF({ r: r.id })}
        activeRowId={f.r}
        storageKey="registrations"
        maxHeight={null}
        empty={
          filtered ? (
            <EmptyState framed={false} size="sm" title="Nobody matches that." description="Try fewer filters, or search by ticket code." cast={[{ shape: 'circle', mood: 'look', size: 44, lookAt: { x: 0.8, y: 0.2 } }, { shape: 'square', mood: 'sleep', size: 36 }]} />
          ) : (
            <EmptyState framed={false} size="sm" title="No registrations yet." description="When people sign up on the event page, they land here. You can also add someone by hand." cast={[{ shape: 'arch', mood: 'idle', size: 48 }, { shape: 'circle', mood: 'look', size: 36, lookAt: { x: -0.8, y: 0.2 } }]} />
          )
        }
      />

      <RegistrationSheet
        eventId={eventId}
        perms={perms}
        registration={openRow}
        registrationId={f.r}
        onClose={() => void setF({ r: null })}
      />
    </>
  );
}

function BulkBtn({ children, icon, onClick, disabled, tone }: { children: ReactNode; icon: ReactNode; onClick: () => void; disabled?: boolean; tone?: 'danger' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 font-medium whitespace-nowrap transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white disabled:opacity-50 [&_svg]:size-4',
        tone === 'danger' ? 'text-[#ff9a9a]' : 'text-white',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
