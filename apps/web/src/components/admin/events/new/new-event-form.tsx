'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Character } from '@/components/admin/characters/character';
import { JakartaDateTimeFields, VenueSelect } from '@/components/admin/fields';
import { Button } from '@/components/admin/ui/button';
import { Card } from '@/components/admin/ui/card';
import { ErrorState } from '@/components/admin/ui/feedback';
import { FormError, FormField } from '@/components/admin/ui/form';
import { Input, NumberInput } from '@/components/admin/ui/input';
import { PageHeader } from '@/components/admin/ui/page-header';
import { notify } from '@/components/admin/ui/toast';
import { useAbility, useRefetchMe } from '@/lib/admin/ability';
import { ApiError, errorMessage } from '@/lib/admin/api';
import { useBreadcrumbs } from '@/lib/admin/breadcrumbs';
import { applyApiErrorToForm, useZodForm } from '@/lib/admin/form';
import { adminRoutes } from '@/lib/admin/nav';
import { adminKeys } from '@/lib/admin/query-keys';
import { useTakenDates } from '../fields';
import { nextFreeFridays, sessionFor } from '../lib';
import { createEvent, eventDetailKey } from '../use-event';

const schema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Give it a working title. You can change it later.')
      .max(200, 'Keep the title under 200 characters.'),
    startsAt: z.string().min(1, 'Pick a date.'),
    endsAt: z.string().min(1, 'Pick an end time.'),
    venueId: z.string().nullable(),
    number: z.number().int().min(0).max(100000).nullable(),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
    path: ['endsAt'],
    message: 'It has to end after it starts.',
  });

/**
 * /admin/events/new: a short, focused form. Creates a draft and drops you in the workspace's
 * Details tab for everything else.
 */
export function NewEventForm() {
  const ability = useAbility();
  const router = useRouter();
  const qc = useQueryClient();
  const refetchMe = useRefetchMe();
  const reduce = useReducedMotion();
  const { dates: taken, ready: takenReady } = useTakenDates();
  const [saving, setSaving] = useState(false);
  const dateTouched = useRef(false);
  useBreadcrumbs([{ label: 'Events', href: adminRoutes.events }, { label: 'New event' }]);

  const firstFree = nextFreeFridays([], 1)[0]!;
  const form = useZodForm(schema, {
    defaultValues: { title: '', ...sessionFor(firstFree), venueId: null, number: null },
  });
  const { control, setValue, formState } = form;
  const startsAt = useWatch({ control, name: 'startsAt' });
  const endsAt = useWatch({ control, name: 'endsAt' });

  // Once we know which Fridays are taken, jump to the first free one (unless someone picked a date).
  useEffect(() => {
    if (!takenReady || dateTouched.current) return;
    const free = nextFreeFridays(taken, 1)[0];
    if (!free) return;
    const s = sessionFor(free);
    setValue('startsAt', s.startsAt);
    setValue('endsAt', s.endsAt);
  }, [takenReady, taken, setValue]);

  if (!ability.has('events.create')) {
    return (
      <>
        <PageHeader
          title="New event"
          back={{ href: adminRoutes.events, label: 'All events' }}
          sticky={false}
        />
        <ErrorState
          error={new ApiError({ status: 403, code: 'forbidden', message: '' })}
          description="Adding Fridays needs the Create events power. Ask the superadmin if that should be you."
          action={
            <Button asChild variant="secondary">
              <Link href={adminRoutes.events}>Back to events</Link>
            </Button>
          }
        />
      </>
    );
  }

  const submit = form.handleSubmit(async (v) => {
    setSaving(true);
    try {
      const created = await createEvent({
        title: v.title.trim(),
        startsAt: v.startsAt,
        endsAt: v.endsAt,
        venueId: v.venueId ?? undefined,
        number: v.number ?? undefined,
        visibility: 'draft',
        mode: 'hybrid',
      });
      qc.setQueryData(eventDetailKey(created.id), created);
      void qc.invalidateQueries({ queryKey: adminKeys.events.lists() });
      void qc.invalidateQueries({ queryKey: adminKeys.overview() });
      // Creators get a full grant on the API side; refresh the ability before landing in the workspace.
      await refetchMe().catch(() => undefined);
      notify.success('Draft created. Now make it look like a Friday.', { celebrate: 'triangle' });
      router.push(adminRoutes.event(created.id, 'details'));
    } catch (err) {
      setSaving(false);
      if (!applyApiErrorToForm(form, err)) notify.error(errorMessage(err));
    }
  });

  return (
    <>
      <PageHeader
        title="New event"
        description="Just the essentials. It starts as a draft, so nobody sees it until you publish."
        back={{ href: adminRoutes.events, label: 'All events' }}
        sticky={false}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,40rem)_minmax(0,1fr)]">
        <Card padding="lg">
          <form
            noValidate
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <FormError errors={formState.errors} />
            <FormField
              control={control}
              name="title"
              label="Title"
              required
              maxLength={200}
              hint="A working title is fine. Something like 'Graph models for Jakarta traffic'."
            >
              {(field) => (
                <Input
                  {...field}
                  autoFocus
                  size="lg"
                  autoComplete="off"
                  placeholder="What is this Friday about?"
                />
              )}
            </FormField>
            <div>
              <JakartaDateTimeFields
                value={{ startsAt, endsAt }}
                takenDates={taken}
                errors={{
                  startsAt: formState.errors.startsAt?.message,
                  endsAt: formState.errors.endsAt?.message,
                }}
                onChange={(r) => {
                  dateTouched.current = true;
                  setValue('startsAt', r.startsAt, {
                    shouldDirty: true,
                    shouldValidate: formState.isSubmitted,
                  });
                  setValue('endsAt', r.endsAt, {
                    shouldDirty: true,
                    shouldValidate: formState.isSubmitted,
                  });
                }}
              />
            </div>
            <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <FormField
                control={control}
                name="venueId"
                label="Room"
                optional
                hint="Pick it now or later. Empty uses the default room, if one is set."
              >
                {(field) => (
                  <VenueSelect value={field.value} onChange={(vid) => field.onChange(vid)} />
                )}
              </FormField>
              <FormField
                control={control}
                name="number"
                label="Number"
                optional
                hint="Empty gets the next one."
              >
                {(field) => (
                  <NumberInput
                    value={field.value}
                    onChange={field.onChange}
                    min={0}
                    max={100000}
                    placeholder="42"
                  />
                )}
              </FormField>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-end">
              <Button asChild variant="ghost">
                <Link href={adminRoutes.events}>Cancel</Link>
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={saving}
                iconRight={<ArrowRight />}
              >
                Create draft
              </Button>
            </div>
          </form>
        </Card>
        <aside className="hidden flex-col justify-center gap-5 lg:flex" aria-hidden="true">
          <motion.div
            className="flex items-end gap-2"
            // Same `initial` on the server and the client (reduced motion is only known in the
            // browser); reduced motion just makes the entrance instant.
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 180, damping: 26, delay: 0.1 }}
          >
            <Character shape="circle" mood="look" follow size={72} />
            <Character shape="triangle" mood="idle" follow size={60} />
            <Character shape="square" mood="idle" follow size={54} />
            <Character shape="arch" mood="happy" size={64} />
          </motion.div>
          <div className="max-w-sm space-y-2 text-[0.9375rem] text-ink-3">
            <p className="font-display text-xl font-extrabold tracking-[-0.02em] text-ink [font-variation-settings:'CASL'_0.5]">
              Another Friday, another table.
            </p>
            <p>
              After this you land on the details: cover, description, speakers, rundown. Nothing is
              public until you hit Publish.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
