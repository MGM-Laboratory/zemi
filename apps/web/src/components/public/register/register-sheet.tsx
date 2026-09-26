'use client';

import { MailCheck } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
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
  const bodyRef = useRef<HTMLDivElement>(null);

  // A new view (success, already in) starts at its top, not where the submit button left the scroll.
  useEffect(() => {
    if (view.kind === 'form') return;
    const scroller = bodyRef.current?.parentElement;
    if (scroller) scroller.scrollTop = 0;
  }, [view.kind]);

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
        ? "You're already in"
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
    // 409 already_registered: the email has a seat, but we never hand its ticket (and its cancel
    // link) to whoever typed the address. The ticket goes to that inbox instead.
    body = (
      <div className="flex flex-col items-center gap-5 py-4 text-center">
        <div className="flex items-end gap-2" aria-hidden="true">
          <Character shape="square" mood="happy" size={72} seed={3} />
          <Character shape="circle" mood="happy" size={52} seed={5} />
        </div>
        <p
          id={headingId}
          className="display max-w-[22ch] text-balance text-title text-ink"
          style={{ fontVariationSettings: "'CASL' 0.7, 'MONO' 0" }}
        >
          You&apos;re already in. Check your inbox for the ticket.
        </p>
        <p className="max-w-[30rem] text-ink-2">
          {view.details.emailSent ? (
            <>
              We just sent it again to <strong className="text-ink">{view.details.email}</strong>.
              Give it a minute, and peek in spam if it&apos;s being shy.
            </>
          ) : (
            <>
              It went to <strong className="text-ink">{view.details.email}</strong> a few minutes
              ago. Search your inbox for &ldquo;Zemi&rdquo;.
            </>
          )}
        </p>
        <div className="flex max-w-[30rem] items-start gap-3 rounded-[16px] bg-surface-muted px-4 py-3 text-left text-[0.9375rem] text-ink-2">
          <MailCheck className="mt-0.5 size-5 flex-none text-ink-3" aria-hidden="true" />
          <p>
            {view.details.emailSent
              ? "Still nothing after 10 minutes? Sign up again with the same email and we'll send it once more."
              : "Nothing there? Wait 10 minutes, then sign up again with the same email and we'll resend it."}{' '}
            Tickets only go to the inbox they belong to.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button shape="circle" onClick={() => onOpenChange(false)}>
            Got it
          </Button>
          <Button variant="secondary" shape={false} onClick={() => setView({ kind: 'form' })}>
            Use a different email
          </Button>
        </div>
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
      <div ref={bodyRef} className="graph-paper mt-2 rounded-[20px] border border-line p-4 sm:p-6">
        {body}
      </div>
    ) : (
      <div ref={bodyRef} className="pt-2">
        {body}
      </div>
    );

  // The success view has its own big heading; keep the dialog title for screen readers only.
  const hideTitle = view.kind === 'success' || view.kind === 'already';
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
