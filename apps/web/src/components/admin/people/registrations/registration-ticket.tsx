'use client';

import type { RegistrationRow } from '@zemi/shared';
import { Check, Copy, Download, ExternalLink, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { TicketCard } from '@/components/public/ticket/ticket-card';
import { Button } from '@/components/admin/ui/button';
import { useCopy } from '@/components/admin/ui/display';
import { Callout } from '@/components/admin/ui/feedback';
import { notify } from '@/components/admin/ui/toast';
import { whatsappUrl } from '../lib';
import { useRegistrationTicket } from '../queries';
import { registrationWhatsAppMessage } from './registration-whatsapp';

/** The admin's ready-to-share ticket and an entirely filled-in manual WhatsApp message. */
export function RegistrationTicket({ eventId, registration }: { eventId: string; registration: RegistrationRow }) {
  const { data: ticket, isPending, error, refetch } = useRegistrationTicket(eventId, registration.id);
  const [copy, copied] = useCopy();
  const [saving, setSaving] = useState(false);
  const wa = whatsappUrl(registration.phone);

  if (isPending) return <p className="text-sm text-ink-3">Preparing this registrant’s ticket…</p>;
  if (error || !ticket) {
    return (
      <Callout tone="yellow" title="Ticket unavailable">
        <p>We could not load the ticket details right now.</p>
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => void refetch()}>
          Try again
        </Button>
      </Callout>
    );
  }

  const cancelled = ticket.status === 'cancelled';
  const message = registrationWhatsAppMessage(ticket);
  const waMessageUrl = wa ? `${wa}?text=${encodeURIComponent(message)}` : null;

  const saveImage = async () => {
    setSaving(true);
    try {
      // Load the canvas renderer only when the admin asks to download the image.
      const { downloadTicketPng } = await import('@/components/public/ticket/save-ticket');
      await downloadTicketPng(ticket);
      notify.success('Ticket image downloaded. Attach it to the WhatsApp message.');
    } catch {
      notify.error('Could not create a ticket image with a scannable QR. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby="reg-ticket" className="space-y-3">
        <div>
          <h3 id="reg-ticket" className="font-display text-base font-extrabold tracking-[-0.01em]">Ticket and QR code</h3>
          <p className="mt-1 text-sm text-ink-3">This is {ticket.fullName}’s actual ticket. The image has their name, code, event details and scannable QR.</p>
        </div>
        {cancelled ? (
          <Callout tone="yellow" title="Cancelled ticket">
            The QR below is void. Restore the seat before sharing a ticket image or link.
          </Callout>
        ) : null}
        <TicketCard ticket={ticket} void={cancelled} />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" icon={<Download />} loading={saving} disabled={cancelled} onClick={() => void saveImage()}>
            Download ticket image
          </Button>
          {!cancelled ? (
            <Button variant="ghost" size="sm" icon={<ExternalLink />} asChild>
              <a href={ticket.ticketUrl} target="_blank" rel="noopener noreferrer">Open ticket page</a>
            </Button>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="reg-message" className="space-y-3 border-t border-line pt-5">
        <div>
          <h3 id="reg-message" className="font-display text-base font-extrabold tracking-[-0.01em]">WhatsApp message</h3>
          <p className="mt-1 text-sm text-ink-3">Ready to send to {ticket.fullName}. WhatsApp opens with this text filled in; attach the downloaded image yourself.</p>
        </div>
        <textarea
          aria-label={`WhatsApp message for ${ticket.fullName}`}
          readOnly
          value={message}
          rows={Math.min(18, Math.max(9, message.split('\n').length + 1))}
          className="w-full resize-y rounded-2xl border border-line-strong bg-surface-muted px-4 py-3 text-sm leading-relaxed text-ink focus-visible:outline-2 focus-visible:outline-focus"
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" icon={copied ? <Check /> : <Copy />} onClick={() => void copy(message)}>
            {copied ? 'Copied' : 'Copy message'}
          </Button>
          {waMessageUrl ? (
            <Button variant="primary" size="sm" icon={<MessageCircle />} asChild>
              <a href={waMessageUrl} target="_blank" rel="noopener noreferrer">Open WhatsApp with message</a>
            </Button>
          ) : (
            <p className="self-center text-sm text-ink-3">No usable phone number. Copy the text and send it manually.</p>
          )}
        </div>
        <p className="text-xs text-ink-3">Opening WhatsApp does not send the message automatically.</p>
      </section>
    </div>
  );
}
