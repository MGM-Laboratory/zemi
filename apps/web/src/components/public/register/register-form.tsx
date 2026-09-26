'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import {
  registerInput,
  type AlreadyRegisteredDetails,
  type EventDetail,
  type RegisterInput,
  type RegisterResult,
} from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { ZemiMark } from '@/components/brand/zemi-mark';
import { TickingDigits } from '@/components/motion/ticking-digits';
import { Button } from '@/components/public/ui/button';
import { Choice, Field, Input } from '@/components/public/ui/field';
import { register as registerSeat } from '@/lib/api/client';
import { errorMessage, isApiError } from '@/lib/api/errors';
import { venueLine } from '../events/lib';

type FormIn = z.input<typeof registerInput>;

export type RegisterFormEvent = Pick<
  EventDetail,
  'id' | 'title' | 'mode' | 'venue' | 'venueFull' | 'roomNote' | 'startsAt'
>;

export interface RegisterFormProps {
  event: RegisterFormEvent;
  onSuccess: (result: RegisterResult) => void;
  onAlready: (details: AlreadyRegisteredDetails) => void;
  /** Seats remaining (null = no cap). Shown above the button when low. */
  spotsLeft: number | null;
}

const WAIT_STEPS = ['13:14', '13:14', '13:15'];

/** "13:14... 13:15": the Friday clock ticks while we save the seat. */
function WaitLabel() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI((n) => (n + 1) % WAIT_STEPS.length), 900);
    return () => window.clearInterval(t);
  }, []);
  return (
    <span className="inline-flex items-center gap-2">
      <ZemiMark variant="loading" size="1.2em" decorative tone="paper" />
      <TickingDigits value={WAIT_STEPS[i]!} label="Saving your seat" />
      <span aria-hidden="true">...</span>
    </span>
  );
}

const STORAGE_KEY = 'zemi:register:last';

/**
 * The sign-up form. Plain and fast on purpose (the delight comes after success):
 * zod validation from shared, friendly API errors, a honeypot, remembered name/email/phone.
 */
export function RegisterForm({ event, onSuccess, onAlready, spotsLeft }: RegisterFormProps) {
  const modes =
    event.mode === 'offline'
      ? (['in-person'] as const)
      : event.mode === 'online'
        ? (['online'] as const)
        : (['in-person', 'online'] as const);
  const form = useForm<FormIn, unknown, RegisterInput>({
    resolver: zodResolver(registerInput),
    mode: 'onTouched',
    defaultValues: { fullName: '', email: '', phone: '', attendanceMode: modes[0], website: '' },
  });
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = form;
  const [formError, setFormError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  // Remember the person on this device (never the honeypot), so next Friday is two taps.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<RegisterInput>;
      if (saved.fullName) setValue('fullName', saved.fullName);
      if (saved.email) setValue('email', saved.email);
      if (saved.phone) setValue('phone', saved.phone);
    } catch {
      /* private mode */
    }
  }, [setValue]);

  useEffect(() => {
    if (formError) errorRef.current?.focus();
  }, [formError]);

  const onSubmit = async (values: RegisterInput) => {
    setFormError(null);
    try {
      const result = await registerSeat(event.id, values);
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ fullName: values.fullName, email: values.email, phone: values.phone }),
        );
      } catch {
        /* ignore */
      }
      onSuccess(result);
    } catch (e) {
      if (!isApiError(e)) {
        setFormError(errorMessage(e));
        return;
      }
      if (e.status === 409 && e.code === 'already_registered') {
        const d = (e.details ?? {}) as Partial<AlreadyRegisteredDetails>;
        onAlready({ email: d.email ?? values.email, emailSent: d.emailSent ?? false });
        return;
      }
      if (e.isValidation) {
        const fields = e.fieldErrors();
        let focused = false;
        for (const [k, message] of Object.entries(fields)) {
          if (k === 'fullName' || k === 'email' || k === 'phone' || k === 'attendanceMode') {
            setError(k, { type: 'server', message }, { shouldFocus: !focused });
            focused = true;
          }
        }
        if (!focused) setFormError(e.message);
        return;
      }
      if (e.isRateLimited) {
        setFormError('Whoa, lots of sign ups from here. Give it a minute and try again.');
        return;
      }
      switch (e.code) {
        case 'event_full':
          setFormError(
            event.mode === 'offline'
              ? 'That was the last seat, sorry. Catch the next Friday?'
              : 'That was the last seat, sorry. The livestream on this page is open to everyone, no sign up needed.',
          );
          return;
        case 'rejected':
          setFormError(
            "Something about that looked like a bot. If you're human, refresh and try again.",
          );
          return;
        default:
          setFormError(e.message || errorMessage(e));
      }
    }
  };

  const venue = venueLine({ venueFull: event.venueFull, venue: event.venue });
  const low = spotsLeft != null && spotsLeft > 0 && spotsLeft <= 10;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="flex flex-col gap-6"
      aria-describedby={formError ? 'register-error' : undefined}
    >
      <Field
        label="What should we call you?"
        hint="Full name, like on your student card."
        error={errors.fullName?.message}
        required
      >
        <Input
          autoComplete="name"
          autoCapitalize="words"
          enterKeyHint="next"
          {...register('fullName')}
        />
      </Field>
      <Field
        label="Where do we send your ticket?"
        hint="Your ticket and a reminder the day before. Nothing else."
        error={errors.email?.message}
        required
      >
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="next"
          {...register('email')}
        />
      </Field>
      <Field
        label="Your number, in case plans change"
        hint="WhatsApp works. We only use it if the room moves."
        error={errors.phone?.message}
        required
      >
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0812 3456 7890"
          enterKeyHint="done"
          {...register('phone')}
        />
      </Field>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-[0.9375rem] font-bold text-ink">How are you joining?</legend>
        <div className={modes.length > 1 ? 'grid gap-3 sm:grid-cols-2' : 'grid gap-3'}>
          {(modes as readonly string[]).includes('in-person') ? (
            <Choice
              value="in-person"
              label="In the room"
              description={
                venue ? `${venue}. Coffee is on us.` : 'Seat, coffee, the good questions.'
              }
              {...register('attendanceMode')}
            />
          ) : null}
          {(modes as readonly string[]).includes('online') ? (
            <Choice
              value="online"
              label="Online"
              description="The livestream plays right on this page."
              {...register('attendanceMode')}
            />
          ) : null}
        </div>
        {errors.attendanceMode?.message ? (
          <p className="text-[0.9375rem] font-semibold text-red-600" role="alert">
            {errors.attendanceMode.message}
          </p>
        ) : null}
      </fieldset>

      {/* Honeypot: people never see it, bots love it. */}
      <div
        aria-hidden="true"
        className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden"
      >
        <label>
          Leave this empty
          <input type="text" tabIndex={-1} autoComplete="off" {...register('website')} />
        </label>
      </div>

      {formError ? (
        <div
          ref={errorRef}
          id="register-error"
          tabIndex={-1}
          role="alert"
          className="flex items-start gap-3 rounded-[14px] border border-red/40 bg-red-50 p-4 text-[0.9375rem] font-semibold text-red-600 outline-none"
        >
          <ShapeIcon shape="triangle" size="1em" className="mt-[0.2em]" />
          <span>{formError}</span>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {low ? (
          <p className="flex items-center gap-2 text-[0.9375rem] font-bold text-ink">
            <ShapeIcon shape="square" size="0.9em" />
            Only {spotsLeft} {spotsLeft === 1 ? 'seat' : 'seats'} left.
          </p>
        ) : null}
        <Button
          type="submit"
          size="lg"
          magnetic={false}
          shape={isSubmitting ? false : 'triangle'}
          className="w-full disabled:opacity-100"
          disabled={isSubmitting}
          aria-busy={isSubmitting || undefined}
          cursor="register"
        >
          {isSubmitting ? <WaitLabel /> : 'Save my seat'}
        </Button>
        <p className="text-center text-[0.875rem] text-ink-3">
          Free. Takes 20 seconds. You can cancel anytime from your ticket.
        </p>
      </div>
    </form>
  );
}
