'use client';

import { Download, Ticket as TicketIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { RegisterResult } from '@zemi/shared';
import { Character } from '@/components/brand/character';
import { shapeConfetti } from '@/components/motion/shape-confetti';
import { Button } from '@/components/public/ui/button';
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { CalendarButton } from '../events/detail/actions';
import { downloadTicketPng } from '../ticket/save-ticket';
import { TicketCard } from '../ticket/ticket-card';

const CAST = [
  { shape: 'circle', delay: 0 },
  { shape: 'triangle', delay: 0.06 },
  { shape: 'square', delay: 0.12 },
  { shape: 'arch', delay: 0.18 },
] as const;

/** The celebration after a sign-up: confetti, the cast cheering, and the ticket. */
export function RegisterSuccess({
  result,
  headingId,
}: {
  result: RegisterResult;
  headingId?: string;
}) {
  const { ticket, existing, emailSent } = result;
  const ticketRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [cheer, setCheer] = useState(0);
  const [saving, setSaving] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    headingRef.current?.focus();
    const t = window.setTimeout(() => {
      setCheer((c) => c + 1);
      if (!existing) void shapeConfetti({ from: ticketRef.current, count: 140, spread: 90 });
    }, 240);
    return () => window.clearTimeout(t);
  }, [existing]);

  const save = async () => {
    setSaving(true);
    try {
      await downloadTicketPng(ticket);
      toast.success('Ticket saved. Screenshot energy, but crisper.');
    } catch {
      toast.error("Couldn't draw the ticket image. Your ticket link still works.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex items-end justify-center gap-2" aria-hidden="true">
          {CAST.map((c, i) => (
            <motion.span
              key={c.shape}
              initial={reduced ? false : { y: 24, opacity: 0, scale: 0.6 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 18, delay: c.delay }}
            >
              <Character
                shape={c.shape}
                mood="happy"
                size={i % 2 ? 44 : 54}
                cheer={cheer}
                seed={i + 2}
              />
            </motion.span>
          ))}
        </div>
        <h3
          ref={headingRef}
          id={headingId}
          tabIndex={-1}
          className="display text-[clamp(1.75rem,5vw,2.5rem)] text-ink outline-none"
          style={{ fontVariationSettings: "'CASL' 0.8, 'MONO' 0" }}
        >
          {existing ? 'You were already on the list.' : "You're in. See you Friday."}
        </h3>
        <p className="max-w-[32rem] text-ink-2">
          {existing
            ? `No need to sign up twice. Here's your ticket again${emailSent ? `, and we re-sent it to ${ticket.email}.` : '.'}`
            : emailSent
              ? `We emailed your ticket to ${ticket.email}. Show the QR at the door, or just your name.`
              : 'Your ticket is right here. Save it, the email might take a minute.'}
        </p>
      </div>

      <motion.div
        initial={reduced ? false : { y: 40, rotate: -3, opacity: 0 }}
        animate={{ y: 0, rotate: -1.2, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 180, damping: 20, delay: 0.1 }}
        className="mx-auto w-full max-w-[34rem]"
      >
        <TicketCard ref={ticketRef} ticket={ticket} />
      </motion.div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Button
          onClick={save}
          loading={saving}
          variant="secondary"
          shape={false}
          icon={<Download className="size-full" />}
          className="w-full"
        >
          Save ticket
        </Button>
        <div className="[&>*]:w-full">
          <CalendarButton href={ticket.calendarUrl} />
        </div>
        <Button
          href={`/tickets/${ticket.token}`}
          variant="primary"
          magnetic={false}
          icon={<TicketIcon className="size-full" />}
          className="w-full"
        >
          Show my ticket
        </Button>
      </div>
      <p className="text-center text-[0.875rem] text-ink-3">
        Code <span className="mono font-bold text-ink">{ticket.code}</span>. Plans changed? Cancel
        from your ticket page, it frees the seat for someone else.
      </p>
    </div>
  );
}
