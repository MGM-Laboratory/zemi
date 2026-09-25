'use client';

import type { SpeakerDeleteResult, SpeakerTalk } from '@zemi/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog, notify } from '@/components/admin/ui';
import { api } from '@/lib/admin/api';
import { publicPaths } from '@/lib/admin/paths';
import { adminKeys } from '@/lib/admin/query-keys';
import { pluralize } from '@zemi/shared';

export interface DeletableSpeaker {
  id: string;
  fullName: string;
  slug: string;
  talkCount?: number;
  talks?: SpeakerTalk[];
  publicationCount?: number;
}

/**
 * "Delete this speaker?" with the real consequences: event_speakers rows cascade, so they
 * disappear from those events' line-ups; author rows on papers lose the speaker link.
 * Speakers with talks need their name typed to confirm.
 */
export function DeleteSpeakerDialog({
  speaker,
  open,
  onOpenChange,
  onDeleted,
}: {
  speaker: DeletableSpeaker | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const qc = useQueryClient();
  if (!speaker) return null;
  const talks = speaker.talkCount ?? speaker.talks?.length ?? 0;
  const pubs = speaker.publicationCount ?? 0;
  const upcoming = speaker.talks?.filter((t) => t.status === 'scheduled' || t.status === 'ongoing').length ?? 0;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      destructive
      title={`Delete ${speaker.fullName}?`}
      confirmLabel="Delete speaker"
      typeToConfirm={talks > 0 ? speaker.fullName : undefined}
      description={
        <span className="block space-y-2">
          {talks > 0 ? (
            <span className="block">
              They are on <strong className="font-semibold text-ink">{pluralize(talks, 'talk')}</strong>
              {upcoming ? <>, including {pluralize(upcoming, 'coming up', 'coming up')}</> : null}. Deleting takes them off those event line-ups for good.
            </span>
          ) : (
            <span className="block">They are not on any talks yet.</span>
          )}
          {pubs > 0 ? (
            <span className="block">
              {pluralize(pubs, 'paper')} list them as an author. The papers keep their name and photo, just without a link to this profile.
            </span>
          ) : null}
          <span className="block">
            Their page at <span className="mono text-ink">{publicPaths.speaker(speaker.slug)}</span> stops working. This cannot be undone.
          </span>
        </span>
      }
      onConfirm={async () => {
        let res: Partial<SpeakerDeleteResult> | null = null;
        try {
          res = await api.delete<SpeakerDeleteResult>(`/admin/speakers/${speaker.id}`);
        } catch (err) {
          notify.error(err);
          throw err;
        }
        qc.removeQueries({ queryKey: adminKeys.speakers.detail(speaker.id) });
        await Promise.all([
          qc.invalidateQueries({ queryKey: adminKeys.speakers.lists() }),
          qc.invalidateQueries({ queryKey: [...adminKeys.speakers.all, 'lookup'] }),
          qc.invalidateQueries({ queryKey: adminKeys.overview() }),
        ]);
        const events = res?.affectedEvents ?? 0;
        const kept = res?.authorshipsKept ?? 0;
        notify.success(`${speaker.fullName} is gone from the directory.`, {
          description:
            [events ? `Taken off ${pluralize(events, 'event')}.` : null, kept ? `${pluralize(kept, 'paper')} kept their name as a plain author.` : null].filter(Boolean).join(' ') ||
            undefined,
        });
        void qc.invalidateQueries({ queryKey: adminKeys.events.all });
        void qc.invalidateQueries({ queryKey: adminKeys.publications.all });
        onDeleted?.();
      }}
    />
  );
}
