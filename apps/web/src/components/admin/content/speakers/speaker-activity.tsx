'use client';

import { PUBLICATION_TYPE_LABELS, type SpeakerAdmin, type SpeakerTalk } from '@zemi/shared';
import { ArrowUpRight, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { AdminImage, Badge, Card, CardHeader, DateText, ShapeGlyph, StatusChip } from '@/components/admin/ui';
import { cn } from '@/lib/admin/cn';
import { adminRoutes } from '@/lib/admin/nav';
import { publicPaths } from '@/lib/admin/paths';

const ROLE_LABEL: Record<string, string> = { speaker: 'Speaker', keynote: 'Keynote', moderator: 'Moderator', panelist: 'Panelist' };

/** Read-only list of talks, built from event line-ups. Each row opens the event workspace. */
export function SpeakerTalksCard({ talks }: { talks: SpeakerTalk[] }) {
  const sorted = [...talks].sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 pt-5">
        <CardHeader
          className="mb-3 flex-nowrap"
          title="Talks"
          description="Filled in from event line-ups. Edit them on the event."
          actions={talks.length ? <Badge size="sm" tone="blue">{talks.length}</Badge> : null}
        />
      </div>
      {sorted.length ? (
        <ul className="divide-y divide-line border-t border-line">
          {sorted.map((t) => (
            <li key={`${t.eventId}-${t.role}`}>
              <Link
                href={adminRoutes.event(t.eventId)}
                className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-muted focus-visible:bg-blue-50/50 focus-visible:outline-none"
              >
                <span className="relative block h-12 w-[2.4rem] shrink-0 overflow-hidden rounded-lg bg-surface-muted">
                  {t.cover ? (
                    <AdminImage image={t.cover} sizes="40px" className="size-full" />
                  ) : (
                    <span className="flex size-full items-center justify-center">
                      <ShapeGlyph shape="circle" className="size-3 text-ink-4" />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-xs text-ink-3">
                    {t.eventNumber != null ? <span className="mono">Zemi #{t.eventNumber}</span> : null}
                    <DateText value={t.startsAt} format="date" />
                  </span>
                  <span className="block truncate text-[0.9375rem] font-semibold text-ink group-hover:text-blue">{t.talkTitle || t.eventTitle}</span>
                  {t.talkTitle ? <span className="block truncate text-[0.8125rem] text-ink-3">{t.eventTitle}</span> : null}
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <StatusChip kind="event" value={t.status} size="sm" />
                    {t.role && t.role !== 'speaker' ? (
                      <Badge size="sm" tone="outline">
                        {ROLE_LABEL[t.role] ?? t.role}
                      </Badge>
                    ) : null}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-line px-5 py-4 text-sm text-ink-3">No talks yet. Add them to an event and it shows up here.</p>
      )}
    </Card>
  );
}

export function SpeakerPublicationsCard({ publications }: { publications: SpeakerAdmin['publications'] }) {
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 pt-5">
        <CardHeader
          className="mb-3 flex-nowrap"
          title="Publications"
          description="Papers and projects that list them as an author."
          actions={publications.length ? <Badge size="sm" tone="green">{publications.length}</Badge> : null}
        />
      </div>
      {publications.length ? (
        <ul className="divide-y divide-line border-t border-line">
          {publications.map((p) => {
            const inner = (
              <>
                <ShapeGlyph shape="square" className="size-2.5 shrink-0 text-yellow" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] font-semibold text-ink group-hover:text-blue">{p.title}</span>
                  <span className="block text-[0.8125rem] text-ink-3">
                    {[(PUBLICATION_TYPE_LABELS as Record<string, string>)[p.type] ?? p.type, p.year].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </>
            );
            const cls = cn('group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-muted focus-visible:bg-blue-50/50 focus-visible:outline-none');
            return (
              <li key={p.id ?? p.slug}>
                {p.id ? (
                  <Link href={adminRoutes.publication(p.id)} className={cls}>
                    {inner}
                    <ChevronRight className="size-4 shrink-0 text-ink-4" aria-hidden="true" />
                  </Link>
                ) : (
                  <a href={publicPaths.publication(p.slug)} target="_blank" rel="noopener noreferrer" className={cls}>
                    {inner}
                    <ArrowUpRight className="size-4 shrink-0 text-ink-4" aria-hidden="true" />
                    <span className="sr-only">(opens the public page in a new tab)</span>
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="border-t border-line px-5 py-4 text-sm text-ink-3">Nothing yet. Add them as an author on a publication.</p>
      )}
    </Card>
  );
}
