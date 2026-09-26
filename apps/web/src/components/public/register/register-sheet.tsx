'use client';

import { MailCheck } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  formatJakarta,
  formatTimeRange,
  type AlreadyRegisteredDetails,
  type RegisterResult,
} from '@zemi/shared';
import { Character } from '@/components/brand/character';
import { Button } from '@/components/public/ui/button';
import { Dialog, Sheet } from '@/components/public/ui/dialog';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { eventLabel } from '../events/lib';
import { RegisterForm, type RegisterFormEvent } from './register-form';
import { RegisterSuccess } from './register-success';

export interface RegisterSheetProps {
  event: RegisterFormEvent & { number: number | null; endsAt: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Registration is open right now (server info + live status). */
  canRegister: boolean;
  /** Why it's closed, in plain words (from EventRegistrationInfo.reason). */
  closedReason?: string | null;
  spotsLeft: number | null;
  onRegistered?: (result: RegisterResult) => void;
}

type View =
  | { kind: 'form' }
  | { kind: 'success'; result: RegisterResult }
  | { kind: 'already'; details: AlreadyRegisteredDetails };

/**
 * The register flow as a bottom sheet on phones and a dialog on bigger screens.
 * Form, then success (ticket + celebration) or "already on the list, check your inbox".
 */
export function RegisterSheet({
  event,
  open,
  onOpenChange,
  canRegister,
  closedReason,
  spotsLeft,
  onRegistered,
}: RegisterSheetProps) {
  const wide = useMediaQuery('(min-width: 768px)');
  const [view, setView] = useState<View>({ kind: 'form' });
  const headingId = useId();

  // Back to the form a moment after closing (so the exit animation shows the same content).
  useEffect(() => {
    if (open || view.kind === 'form') return;
    const t = window.setTimeout(() => setView({ kind: 'form' }), 400);
    return () => window.clearTimeout(t);
  }, [open, view.kind]);

  const title =
    view.kind === 'success'
      ? view.result.existing
        ? 'Your ticket'
        : "You're in"
      : view.kind === 'already'
        ? 'Already on the list'
        : canRegister
          ? 'Save your seat'
          : 'Sign ups are closed';
  const description =
    view.kind === 'form'
      ? `${eventLabel(event)}, ${formatJakarta(event.startsAt, 'date')}, ${formatTimeRange(event.startsAt, event.endsAt)}`
      : undefined;

  let body: ReactNode;
  if (view.kind === 'success') {
    body = <RegisterSuccess result={view.result} headingId={headingId} />;
  } else if (view.kind === 'already') {
    body = (
      <div className="flex flex-col items-center gap-5 py-4 text-center">
        <div className="flex items-end gap-2" aria-hidden="true">
          <Character shape="square" mood="happy" size={72} seed={3} />
          <Character shape="circle" mood="surprised" size={52} seed={5} />
        </div>
        <p
          className="display text-title text-ink"
          style={{ fontVariationSettings: "'CASL' 0.7, 'MONO' 0" }}
        >
          That email already has a seat.
        </p>
        <p className="max-w-[30rem] text-ink-2">
          {view.details.emailSent
            ? `We just sent the ticket to ${view.details.email} again. Check your inbox (and the spam folder, it gets hungry).`
            : `The ticket went to ${view.details.email} when you signed up. Search your inbox for "Zemi".`}
        </p>
        <p className="flex items-center gap-2 text-[0.9375rem] text-ink-3">
          <MailCheck className="size-4" aria-hidden="true" />
          For privacy, we only send tickets to the inbox they belong to.
        </p>
        <Button variant="secondary" shape={false} onClick={() => setView({ kind: 'form' })}>
          Use a different email
        </Button>
      </div>
    );
  } else if (!canRegister) {
    body = (
      <div className="flex flex-col items-center gap-5 py-4 text-center">
        <Character shape="arch" mood="sleepy" size={84} seed={2} />
        <p
          className="display max-w-[30rem] text-title text-ink"
          style={{ fontVariationSettings: "'CASL' 0.7, 'MONO' 0" }}
        >
          {closedReason ?? 'This Friday is not taking sign ups right now.'}
        </p>
        <Button
          variant="secondary"
          shape="circle"
          href="/events"
          onClick={() => onOpenChange(false)}
        >
          See other Fridays
        </Button>
      </div>
    );
  } else {
    body = (
      <RegisterForm
        event={event}
        spotsLeft={spotsLeft}
        onSuccess={(result) => {
          setView({ kind: 'success', result });
          onRegistered?.(result);
        }}
        onAlready={(details) => setView({ kind: 'already', details })}
      />
    );
  }

  const content =
    view.kind === 'form' && canRegister ? (
      <div className="graph-paper mt-2 rounded-[20px] border border-line p-4 sm:p-6">{body}</div>
    ) : (
      <div className="pt-2">{body}</div>
    );

  // The success view has its own big heading; keep the dialog title for screen readers only.
  const hideTitle = view.kind === 'success';
  return wide ? (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="md"
      hideTitle={hideTitle}
    >
      {content}
    </Dialog>
  ) : (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      side="bottom"
      hideTitle={hideTitle}
    >
      {content}
    </Sheet>
  );
}
