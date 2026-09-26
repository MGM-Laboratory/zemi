'use client';

import type { PublicationAdmin } from '@zemi/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { AdminImage, Badge, ConfirmDialog, DateText, notify, ShapeGlyph } from '@/components/admin/ui';
import { api } from '@/lib/admin/api';
import { adminRoutes } from '@/lib/admin/nav';
import { publicPaths } from '@/lib/admin/paths';
import { adminKeys } from '@/lib/admin/query-keys';
import { pluralize } from '@zemi/shared';
import { EditorCard } from '../shared/content-ui';

/** Events that list this publication (read-only; edit on the event). */
export function RelatedEventsCard({ events }: { events: PublicationAdmin['events'] }) {
  const sorted = [...(events ?? [])].sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
  return (
    <EditorCard
      id="events"
      title="Related events"
      description="Fridays that mention this. Add or remove it from the event's Publications list."
      actions={sorted.length ? <Badge size="sm" tone="blue">{sorted.length}</Badge> : null}
    >
      {sorted.length ? (
        <ul className="-mx-2 divide-y divide-line">
          {sorted.map((e) => (
            <li key={e.id}>
              <Link href={adminRoutes.event(e.id)} className="group flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-focus">
                <span className="block h-12 w-[2.4rem] shrink-0 overflow-hidden rounded-lg bg-surface-muted">
                  {e.cover ? (
                    <AdminImage image={e.cover} sizes="40px" className="size-full" />
                  ) : (
                    <span className="flex size-full items-center justify-center">
                      <ShapeGlyph shape="circle" className="size-3 text-ink-4" />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-xs text-ink-3">
                    {e.number != null ? <span className="mono">Zemi #{e.number}</span> : null}
                    <DateText value={e.startsAt} format="date" />
                  </span>
                  <span className="block truncate font-semibold text-ink group-hover:text-blue">{e.title}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-3">No events mention this yet. On an event, open Publications and pick it.</p>
      )}
    </EditorCard>
  );
}

export function DeletePublicationDialog({
  pub,
  open,
  onOpenChange,
  onDeleted,
}: {
  pub: { id: string; title: string; slug: string; eventCount?: number; authorCount?: number } | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDeleted?: () => void;
}) {
  const qc = useQueryClient();
  if (!pub) return null;
  const events = pub.eventCount ?? 0;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      destructive
      title="Delete this publication?"
      confirmLabel="Delete publication"
      typeToConfirm={events > 0 ? pub.title.slice(0, 60) : undefined}
      description={
        <span className="block space-y-2">
          <span className="block font-semibold text-ink">{pub.title}</span>
          {events > 0 ? (
            <span className="block">
              {pluralize(events, 'event')} {events === 1 ? 'lists' : 'list'} it. It disappears from {events === 1 ? 'that page' : 'those pages'}.
            </span>
          ) : null}
          <span className="block">
            Its author list goes with it, and <span className="mono text-ink">{publicPaths.publication(pub.slug)}</span> stops working. Uploaded files stay in the media library. This cannot be
            undone.
          </span>
        </span>
      }
      onConfirm={async () => {
        try {
          await api.delete(`/admin/publications/${pub.id}`);
        } catch (err) {
          notify.error(err);
          throw err;
        }
        qc.removeQueries({ queryKey: adminKeys.publications.detail(pub.id) });
        await Promise.all([
          qc.invalidateQueries({ queryKey: adminKeys.publications.lists() }),
          qc.invalidateQueries({ queryKey: [...adminKeys.publications.all, 'lookup'] }),
          qc.invalidateQueries({ queryKey: adminKeys.speakers.details() }),
        ]);
        notify.success('Deleted. The shelf is a little lighter.');
        onDeleted?.();
      }}
    />
  );
}
