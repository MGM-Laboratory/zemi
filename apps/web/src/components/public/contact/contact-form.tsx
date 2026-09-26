'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useId, useRef, useState, type BaseSyntheticEvent, type FocusEvent } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { contactInput } from '@zemi/shared';
import { Character } from '@/components/brand/character';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { TickingDigits } from '@/components/motion/ticking-digits';
import { Button } from '@/components/public/ui/button';
import { Field, Input, Textarea } from '@/components/public/ui/field';
import { TextLink } from '@/components/public/ui/text-link';
import { sendContact } from '@/lib/api/client';
import { errorMessage, isApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils';
import styles from './contact.module.css';
import { usePlane } from './plane-layer';

/** The honeypot is filled in separately (see HONEYPOT_NAME), so the form schema leaves it out. */
const schema = contactInput.omit({ website: true });
type FormIn = z.input<typeof schema>;
type FormOut = z.output<typeof schema>;

/** A name no autofill heuristic maps to a real field (a real person must never trip it). */
const HONEYPOT_NAME = 'zemi_extra_notes_2';
const MAX = 5000;
const MIN = 10;
const DRAFT_KEY = 'zemi:contact:draft';

export interface SentMessage {
  name: string;
  email: string;
  topic: string;
}

export interface ContactFormProps {
  topics: string[];
  initialTopic: string;
  fallbackEmail: string;
  onSent: (sent: SentMessage) => void;
}

/** Friendly running commentary for the message counter. */
function counterLine(n: number): string {
  if (n === 0) return 'Say as much or as little as you like.';
  if (n < MIN) return `${MIN - n} more ${MIN - n === 1 ? 'character' : 'characters'} and we're good.`;
  if (n < 120) return 'Nice. Keep going if you like.';
  if (n < 600) return 'Ooh, details. We love details.';
  if (n < MAX - 500) return 'This is basically an abstract now.';
  if (n < MAX) return `${MAX - n} left. Save some for Friday.`;
  return "That's the limit. Tell us the rest in person?";
}

const WAIT = ['13:14', '13:14', '13:15'];
/** "Folding the plane 13:14... 13:15" while the message travels. */
function SendingLabel() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI((n) => (n + 1) % WAIT.length), 700);
    return () => window.clearInterval(t);
  }, []);
  return (
    <span className="inline-flex items-center gap-2">
      <span>Folding the plane</span>
      <span aria-hidden="true" className="hidden opacity-70 sm:inline">
        <TickingDigits value={WAIT[i]!} />
      </span>
    </span>
  );
}

/**
 * The contact form. Plain and quick on purpose: shared zod rules with friendly messages, topic
 * chips, a chatty character counter, a honeypot and a remembered draft. The fun is the plane:
 * it takes off the moment you press send, and the request travels with it.
 */
export function ContactForm({ topics, initialTopic, fallbackEmail, onSent }: ContactFormProps) {
  const plane = usePlane();
  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: { name: '', email: '', topic: initialTopic, message: '' },
  });
  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    reset,
    control,
    formState: { errors, isSubmitting, isValid },
  } = form;
  const message = useWatch({ control, name: 'message' }) ?? '';
  const topic = useWatch({ control, name: 'topic' });
  const [formError, setFormError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const legendId = useId();
  const counterId = useId();

  // Restore an unsent draft (never the honeypot).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as Partial<FormIn>;
      reset(
        { name: d.name ?? '', email: d.email ?? '', topic: initialTopic, message: d.message ?? '' },
        { keepDefaultValues: true },
      );
    } catch {
      /* storage blocked */
    }
  }, [reset, initialTopic]);

  const values = useWatch({ control });
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ name: values.name, email: values.email, message: values.message }));
      } catch {
        /* ignore */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [values.name, values.email, values.message]);

  // The plane does a little roll the first time everything checks out.
  const rolled = useRef(false);
  useEffect(() => {
    if (isValid && !rolled.current) {
      rolled.current = true;
      plane.roll();
    }
  }, [isValid, plane]);

  useEffect(() => {
    if (formError) errorRef.current?.focus();
  }, [formError]);

  const onFocus = (e: FocusEvent<HTMLFormElement>) => {
    const el = e.target as HTMLElement;
    plane.setFocus(el.matches('input, textarea, button') ? el : null);
  };

  const onSubmit = async (v: FormOut, e?: BaseSyntheticEvent) => {
    setFormError(null);
    const formEl = e?.target instanceof HTMLFormElement ? e.target : null;
    const trap = formEl?.elements.namedItem(HONEYPOT_NAME);
    const flight = plane.launch();
    const request = sendContact({ ...v, website: trap instanceof HTMLInputElement ? trap.value : '' });
    const [res] = await Promise.allSettled([request, flight]);
    if (res.status === 'fulfilled') {
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      onSent({ name: v.name, email: v.email, topic: v.topic });
      return;
    }
    plane.comeBack();
    const err = res.reason;
    if (isApiError(err) && err.isValidation) {
      const fields = err.fieldErrors();
      let first: keyof FormIn | null = null;
      for (const [k, m] of Object.entries(fields)) {
        if (k === 'name' || k === 'email' || k === 'topic' || k === 'message') {
          setError(k, { message: m });
          first ??= k;
        }
      }
      if (first) {
        setFocus(first);
        return;
      }
    }
    setFormError(errorMessage(err));
  };

  const n = message.length;
  const pct = Math.min(1, n / MAX);

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      onFocus={onFocus}
      onBlur={() => plane.setFocus(null)}
      className="flex flex-col gap-6"
      aria-describedby={formError ? 'contact-form-error' : undefined}
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Your name" error={errors.name?.message} required>
          <Input autoComplete="name" placeholder="Rani Putri" maxLength={160} {...register('name')} />
        </Field>
        <Field label="Email" error={errors.email?.message} hint="We reply here. No newsletters, promise." required>
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@campus.ac.id"
            maxLength={254}
            {...register('email')}
          />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend id={legendId} className="mb-3 text-[0.9375rem] font-bold text-ink">
          What&apos;s it about?
        </legend>
        <div className="flex flex-wrap gap-2">
          {topics.map((t, i) => {
            const shape = (['circle', 'triangle', 'square', 'arch'] as const)[i % 4]!;
            return (
              <label key={t} className={styles.topic} data-selected={topic === t || undefined}>
                <input type="radio" value={t} className="peer sr-only" {...register('topic')} />
                <ShapeIcon shape={shape} size="0.8em" className={styles.topicShape} />
                <span>{t}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <Field label="Message" error={errors.message?.message} required>
        <Textarea
          rows={6}
          maxLength={MAX}
          placeholder="Hi! I'm working on... and I'd love to present it one Friday."
          aria-describedby={counterId}
          {...register('message')}
        />
      </Field>
      <div id={counterId} className={styles.counter}>
        <span className={styles.counterBar} aria-hidden="true">
          <span style={{ transform: `scaleX(${Math.max(pct, n > 0 ? 0.012 : 0)})` }} data-ok={n >= MIN || undefined} />
        </span>
        <span className="flex items-center gap-2">
          <Character
            shape="square"
            mood={n >= MIN ? 'happy' : n > 0 ? 'thinking' : 'idle'}
            size={22}
            track={false}
            interactive={false}
          />
          <span className="text-ink-2">{counterLine(n)}</span>
        </span>
        <span className="mono text-ink-3">
          {n.toLocaleString('en-US')}
          <span className="text-ink-4"> / {MAX.toLocaleString('en-US')}</span>
        </span>
      </div>

      {/* Honeypot: invisible to people, tempting to bots. Not a real field of the form. */}
      <div className={styles.hp} aria-hidden="true">
        <label>
          Leave this empty
          <input type="text" name={HONEYPOT_NAME} tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      {formError ? (
        <div ref={errorRef} id="contact-form-error" tabIndex={-1} role="alert" className={cn(styles.formError, 'outline-none')}>
          <Character shape="triangle" mood="surprised" size={44} track={false} />
          <div className="flex flex-col gap-1">
            <p className="font-bold text-ink">The plane came back.</p>
            <p className="text-ink-2">
              {formError} You can also write to <TextLink href={`mailto:${fallbackEmail}`}>{fallbackEmail}</TextLink>.
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col-reverse items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[0.9375rem] text-ink-3">A real human reads every message.</p>
        <Button type="submit" size="lg" loading={isSubmitting} className="w-full sm:w-auto" magnetic={false}>
          {isSubmitting ? <SendingLabel /> : 'Send message'}
        </Button>
      </div>
    </form>
  );
}
