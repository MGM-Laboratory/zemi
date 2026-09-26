'use client';

import { formatJakarta, type RosterRow } from '@zemi/shared';
import { Check, Undo2, UserCheck } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/admin/ui/badge';
import { Button } from '@/components/admin/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/admin/ui/feedback';
import { SearchInput } from '@/components/admin/ui/filters';
import { SegmentedControl } from '@/components/admin/ui/toggles';
import { cn } from '@/lib/admin/cn';
import { MODE_LABEL } from '../lib';
import { useRegistrationActions, useRoster } from '../queries';

const PAGE = 60;
type Show = 'all' | 'no' | 'yes';

/**
 * Door roster (attendance.manage): everyone with a seat, masked contact details, and one big
 * button per person to check in or undo. Search runs on the server (name, code); the
 * here / not yet split is counted from the loaded list so the numbers match what you see.
 */
export function Roster({ eventId, device }: { eventId: string; device: string }) {
  const [search, setSearch] = useState('');
  const [show, setShow] = useState<Show>('no');
  const [limit, setLimit] = useState(PAGE);
  const roster = useRoster(eventId, { search: search || undefined, checkedIn: 'all' });
  const { checkIn } = useRegistrationActions(eventId, device);
  const [busyId, setBusyId] = useState<string | null>(null);
  const reduce = useReducedMotion();

  const all = useMemo(() => roster.data?.items ?? [], [roster.data]);
  const here = all.filter((r) => r.checkedInAt).length;
  const rows = useMemo(() => all.filter((r) => (show === 'all' ? true : show === 'yes' ? Boolean(r.checkedInAt) : !r.checkedInAt)), [all, show]);
  const visible = rows.slice(0, limit);

  const toggle = (r: RosterRow) => {
    setBusyId(r.id);
    checkIn.mutate(
      { id: r.id, fullName: r.fullName, undo: Boolean(r.checkedInAt) },
      { onSettled: () => setBusyId((id) => (id === r.id ? null : id)) },
    );
  };

  return (
    <section aria-labelledby="roster-title" className="rounded-[24px] border border-line bg-white">
      <header className="flex flex-col gap-3 border-b border-line p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="roster-title" className="font-display text-xl font-extrabold tracking-[-0.02em]">
              Check in by hand
            </h2>
            <p className="text-sm text-ink-3">For cracked screens, dead phones and printed tickets. Contact details stay masked.</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput
            value={search}
            onValueChange={(v) => {
              setSearch(v);
              setLimit(PAGE);
            }}
            placeholder="Name or ticket code"
            aria-label="Search the roster"
            loading={roster.isFetching && Boolean(search)}
            className="sm:max-w-xs sm:flex-1"
          />
          <SegmentedControl<Show>
            aria-label="Show"
            fullWidth
            className="sm:inline-flex sm:w-auto"
            value={show}
            onValueChange={(v) => {
              setShow(v);
              setLimit(PAGE);
            }}
            options={[
              { value: 'no', label: 'Not yet', count: all.length - here },
              { value: 'yes', label: 'Here', count: here },
              { value: 'all', label: 'All', count: all.length },
            ]}
          />
        </div>
      </header>

      {roster.isPending ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14" rounded="lg" />
          ))}
        </div>
      ) : roster.isError && !roster.data ? (
        <div className="p-4">
          <ErrorState error={roster.error} onRetry={() => void roster.refetch()} retrying={roster.isFetching} size="sm" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          framed={false}
          size="sm"
          title={search ? 'Nobody by that name.' : show === 'no' ? 'Everyone is in.' : show === 'yes' ? 'Nobody checked in yet.' : 'No seats on this one yet.'}
          description={search ? 'Try the ticket code, or add them as a walk-in.' : show === 'no' ? 'Every ticket holder made it. Go get a coffee.' : undefined}
          cast={show === 'no' && !search ? [{ shape: 'arch', mood: 'cheer', size: 52 }, { shape: 'square', mood: 'happy', size: 38 }] : undefined}
        />
      ) : (
        <ul className={cn('divide-y divide-line transition-opacity', roster.isFetching && 'opacity-80')}>
          <AnimatePresence initial={false}>
            {visible.map((r) => {
              const inAt = r.checkedInAt;
              return (
                <motion.li
                  key={r.id}
                  layout={reduce ? false : 'position'}
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, x: show === 'all' ? 0 : 24 }}
                  transition={{ duration: 0.22 }}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-muted/60 sm:px-5"
                >
                  <span
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-full transition-colors',
                      inAt ? 'bg-green text-white' : 'border-2 border-dashed border-line-strong text-transparent',
                    )}
                    aria-hidden="true"
                  >
                    <Check className="size-4" strokeWidth={3} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{r.fullName}</p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.8125rem] text-ink-3">
                      <span className="mono text-ink-2">{r.ticketCode}</span>
                      <span className="truncate">{r.maskedEmail}</span>
                      {r.maskedPhone ? <span className="mono">{r.maskedPhone}</span> : null}
                      {r.attendanceMode === 'online' ? (
                        <Badge tone="green" size="sm" shape="arch">
                          {MODE_LABEL.online}
                        </Badge>
                      ) : null}
                    </p>
                  </div>
                  {inAt ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="mono hidden text-[0.8125rem] text-green-600 sm:inline">In at {formatJakarta(inAt, 'time')}</span>
                      <Button size="sm" variant="ghost" icon={<Undo2 />} loading={busyId === r.id} onClick={() => toggle(r)} aria-label={`Undo check-in for ${r.fullName}`}>
                        Undo
                      </Button>
                    </div>
                  ) : (
                    <Button size="md" variant="primary" icon={<UserCheck />} loading={busyId === r.id} onClick={() => toggle(r)} aria-label={`Check in ${r.fullName}`}>
                      Check in
                    </Button>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      {rows.length > limit ? (
        <div className="border-t border-line p-3 text-center">
          <Button variant="ghost" onClick={() => setLimit((l) => l + PAGE * 2)}>
            Show {Math.min(PAGE * 2, rows.length - limit)} more of {rows.length - limit}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
