'use client';

import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useWorkspaceEvent } from '@/components/admin/events/use-event';
import { Button } from '@/components/admin/ui/button';
import { AddRegistrantDialog } from '../add-registrant-dialog';
import { useRegistrationStats } from '../queries';
import { ExportMenu, PrintSheetDialog } from './export-print';
import { RegistrationsTable, useRegistrationFilters } from './registrations-table';
import { ChartsGrid, StatsRow } from './stats-section';

/**
 * /admin/events/[id]/registrations: numbers up top, charts, then the full list.
 * The workspace layout already blocks this tab without `registrations.view`, so nothing
 * personal ever renders for people who cannot see it.
 */
export function RegistrationsTab() {
  const { event, id, perms } = useWorkspaceEvent();
  const stats = useRegistrationStats(id);
  const [filters, setFilters] = useRegistrationFilters();
  const [adding, setAdding] = useState(false);
  const canExport = perms.has('registrations.export');
  const canAdd = perms.has('registrations.manage') || perms.has('attendance.manage');
  const filtered = Boolean(filters.q) || filters.status !== 'registered' || filters.in !== 'all' || filters.mode !== 'all' || filters.src !== 'all';

  return (
    <div className="space-y-8">
      <StatsRow stats={stats.data} event={event} loading={stats.isPending} />

      <section aria-labelledby="reg-charts-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="reg-charts-title" className="font-display text-xl font-extrabold tracking-[-0.02em]">
              How sign-ups are going
            </h2>
            <p className="text-sm text-ink-3">Times are WIB. Every chart has a table view, top right.</p>
          </div>
        </div>
        <ChartsGrid stats={stats.data} event={event} loading={stats.isPending} error={stats.error} onRetry={() => void stats.refetch()} fetching={stats.isFetching && !stats.isPending} />
      </section>

      <section aria-labelledby="reg-list-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="reg-list-title" className="font-display text-xl font-extrabold tracking-[-0.02em]">
              Everyone on the list
            </h2>
            <p className="text-sm text-ink-3">Click a row for its ticket, WhatsApp message, details and history. Select rows for bulk actions.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canExport ? <PrintSheetDialog eventId={id} inPersonCount={stats.data?.inPerson ?? event.counts.inPerson} totalCount={stats.data?.total ?? event.counts.registrations} hybrid={event.mode === 'hybrid'} /> : null}
            {canExport ? <ExportMenu eventId={id} filters={filters} filtered={filtered} /> : null}
            {canAdd ? (
              <Button variant="primary" icon={<UserPlus />} onClick={() => setAdding(true)}>
                Add registrant
              </Button>
            ) : null}
          </div>
        </div>
        <RegistrationsTable eventId={id} perms={perms} />
      </section>

      {canAdd ? (
        <AddRegistrantDialog
          open={adding}
          onOpenChange={setAdding}
          event={event}
          perms={perms}
          onAdded={(row) => void setFilters({ r: row.id })}
          onOpenExisting={(rid, code) => void setFilters({ r: rid, q: code, status: 'all', in: 'all', mode: 'all', src: 'all', page: 1 })}
        />
      ) : null}
    </div>
  );
}
