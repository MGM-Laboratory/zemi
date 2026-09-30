'use client';

import { useQuery } from '@tanstack/react-query';
import { bumperThemeSchema, canCreateBumpers } from '@zemi/shared';
import { FilePlus2, LayoutTemplate } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Button } from '@/components/admin/ui/button';
import { Dialog } from '@/components/admin/ui/dialog';
import { Callout } from '@/components/admin/ui/feedback';
import { Field } from '@/components/admin/ui/field';
import { Input } from '@/components/admin/ui/input';
import { notify } from '@/components/admin/ui/toast';
import { useAbility } from '@/lib/admin/ability';
import { useAdminMutation } from '@/lib/admin/hooks';
import { adminRoutes } from '@/lib/admin/nav';
import { bumperKeys, bumpersApi } from '../api';
import { useSlidesData } from './cover-data';
import { EventPicker, nextBuildable, STANDALONE, type EventPickLike } from './event-picker';
import { countLabel } from './labels';
import { ShowPreview } from './show-preview';
import type { StarterKit } from './starters';

export interface NewShowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A starter kit, or null for a blank show. */
  kit: StarterKit | null;
  /** Start with this Friday picked (the event tab). */
  event?: EventPickLike | null;
}

const NO_SLIDES: never[] = [];

/**
 * A blank show or a starter kit: a name, the Friday it belongs to (or none, with
 * bumpers.manage), and for kits a preview of what you get, filled from that Friday's lineup.
 */
export function NewShowDialog({ open, onOpenChange, kit, event }: NewShowDialogProps) {
  const router = useRouter();
  const ability = useAbility();
  const canStandalone = canCreateBumpers(ability, null);
  const [choice, setChoice] = useState<string | null>(event?.id ?? null);
  const [picked, setPicked] = useState<EventPickLike | null>(event ?? null);
  const [title, setTitle] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setChoice(event?.id ?? null);
      setPicked(event ?? null);
      setTitle(null);
    }
  }

  const events = useQuery({
    queryKey: bumperKeys.source('events', { limit: 30 }),
    queryFn: ({ signal }) => bumpersApi.sources.events({ limit: 30 }, signal),
    enabled: open && !choice,
    staleTime: 60_000,
  });
  const fallback = nextBuildable(events.data);
  // Nothing picked: the next Friday, or standalone when that is all the principal may make.
  const value = choice ?? fallback?.id ?? (canStandalone && events.isSuccess ? STANDALONE : null);
  const shown = choice ? picked : fallback;
  const eventId = value && value !== STANDALONE ? value : null;

  const eventIds = useMemo(() => (eventId ? [eventId] : []), [eventId]);
  const { data, loading } = useSlidesData(NO_SLIDES, eventIds);
  const ev = eventId ? (data.events[eventId] ?? null) : null;
  const slides = useMemo(() => (kit ? kit.build({ event: ev }) : []), [kit, ev]);
  const theme = useMemo(() => bumperThemeSchema.parse(kit?.theme ?? {}), [kit]);

  const number = ev?.number ?? shown?.number ?? null;
  const autoTitle = kit ? (eventId && number != null ? `${kit.label}, Zemi #${number}` : kit.label) : eventId && number != null ? `Zemi #${number} bumpers` : 'Untitled show';
  const name = title ?? autoTitle;

  const create = useAdminMutation({
    mutationFn: () =>
      bumpersApi.create({
        title: name.trim() || autoTitle,
        eventId,
        origin: kit ? 'starter' : 'blank',
        ...(kit ? { slides, theme: kit.theme ?? {} } : {}),
      }),
    invalidate: [bumperKeys.lists()],
    onSuccess: (show) => {
      notify.success(kit ? `${kit.label} is ready: ${countLabel(show.slideCount)} to make your own.` : 'A fresh show. Add the first bumper from the gallery.', { celebrate: true });
      onOpenChange(false);
      router.push(adminRoutes.bumper(show.id));
    },
  });

  const ready = !!value && !create.isPending && !(kit && eventId && loading);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size={kit ? 'xl' : 'md'}
      accent={kit ? 'yellow' : 'blue'}
      title={kit ? kit.label : 'Blank show'}
      description={kit ? kit.description : 'Start empty and add bumpers from the gallery in the builder.'}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" icon={kit ? <LayoutTemplate /> : <FilePlus2 />} loading={create.isPending} disabled={!ready} onClick={() => create.mutate()}>
            {kit ? 'Use this kit' : 'Create show'}
          </Button>
        </>
      }
    >
      <div className={kit ? 'grid min-w-0 gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]' : 'space-y-4'}>
        <div className="min-w-0 space-y-4">
          <Field label="Event" hint={canStandalone ? 'Pick a Friday, or none for a show you reuse any week.' : 'The Friday this show belongs to.'}>
            <EventPicker
              value={value}
              selected={shown}
              buildableOnly
              standalone={canStandalone}
              onChange={(v, e) => {
                setPicked(e);
                setChoice(v);
              }}
              placeholder={events.isPending && !choice ? 'Finding the next Friday...' : 'Pick a Friday'}
            />
          </Field>
          <Field label="Show name" required count={{ value: name.length, max: 120 }}>
            <Input value={name} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          {events.isSuccess && !value ? (
            <Callout tone="yellow" title="No Friday you can build for.">
              Ask the superadmin for bumper access on an event, then come back.
            </Callout>
          ) : null}
          {kit && !eventId && value === STANDALONE ? (
            <p className="text-sm text-ink-3">Without a Friday, the speaker and event cards wait for you to pick someone in the builder.</p>
          ) : null}
        </div>
        {kit ? (
          <section aria-label={`What ${kit.label} gives you`} className="min-w-0">
            <h3 className="label mb-3 text-ink-3">
              You get {countLabel(slides.length)}
            </h3>
            <ShowPreview slides={slides} theme={theme} data={data} showEventId={eventId} version={`${kit.key}-${eventId ?? 'none'}-${ev ? 1 : 0}`} stale={loading} />
          </section>
        ) : null}
      </div>
    </Dialog>
  );
}
