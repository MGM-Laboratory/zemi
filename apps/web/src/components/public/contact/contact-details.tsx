'use client';

import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { formatJakarta, type EventCard } from '@zemi/shared';
import { Character } from '@/components/brand/character';
import { EmailIcon, LinkIcon } from '@/components/icons/link-icon';
import { LINK_KIND_LABELS, linkDisplay } from '@/components/icons/link-kinds';
import { isExternalHref, safeLinkItems } from '@/components/public/ui/safe-href';
import { cn } from '@/lib/utils';
import styles from './contact.module.css';
import { CheckIcon, ClockIcon, CopyIcon, DoorIcon, PinIcon, WhatsappIcon } from './icons';
import { mapsHref, whatsappHref, type PublicContact } from './lib';

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the old way */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function Row({ icon, label, children, className }: { icon: ReactNode; label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn(styles.row, className)}>
      <span className={styles.rowIcon} aria-hidden="true">
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="label text-ink-3">{label}</p>
        {children}
      </div>
    </div>
  );
}

function EmailRow({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onCopy = async () => {
    const ok = await copyText(email);
    if (ok) {
      setCopied(true);
      toast.success('Copied. Paste away.', { description: email });
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2200);
    } else {
      toast.error("Couldn't copy that. Long-press the address instead?");
    }
  };
  return (
    <Row icon={<EmailIcon size={22} />} label="Email">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <a href={`mailto:${email}`} className={styles.bigLink}>
          {email}
        </a>
        <button
          type="button"
          onClick={onCopy}
          className={styles.copy}
          data-copied={copied || undefined}
          aria-label={copied ? 'Email address copied' : `Copy ${email}`}
        >
          <span className={styles.copyIcons} aria-hidden="true">
            <CopyIcon size={16} className={styles.copyA} />
            <CheckIcon size={16} className={styles.copyB} />
          </span>
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
    </Row>
  );
}

export interface ContactDetailsProps {
  contact: PublicContact;
  nextEvent: EventCard | null;
}

/** Email (copy to clipboard), WhatsApp, office hours, address + maps, socials, and the room note. */
export function ContactDetails({ contact, nextEvent }: ContactDetailsProps) {
  const wa = whatsappHref(contact.whatsapp);
  const maps = mapsHref(contact.mapsUrl, contact.address);
  // Free text from the admin: only http(s), mailto and tel links render.
  const socials = safeLinkItems(contact.socials);
  const nextVenue = nextEvent?.venue?.name;

  return (
    <div className="flex flex-col gap-8">
      <div className={styles.details}>
        {contact.email ? <EmailRow email={contact.email} /> : null}

        {wa ? (
          <Row icon={<WhatsappIcon size={22} />} label="WhatsApp">
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(styles.bigLink, 'group inline-flex items-center gap-1.5')}
            >
              {contact.whatsapp}
              <ArrowUpRight
                className="size-4 flex-none opacity-50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100"
                aria-hidden="true"
              />
              <span className="sr-only"> (opens WhatsApp in a new tab)</span>
            </a>
            <p className="text-[0.9375rem] text-ink-3">Quick questions are fine. Long ones too, honestly.</p>
          </Row>
        ) : null}

        {contact.officeHours ? (
          <Row icon={<ClockIcon size={22} />} label="Office hours">
            <p className="font-semibold text-ink">{contact.officeHours}</p>
            <p className="text-[0.9375rem] text-ink-3">Fridays after 13:15 WIB we are a little busy. You know why.</p>
          </Row>
        ) : null}

        {contact.address ? (
          <Row icon={<PinIcon size={22} />} label="Find the lab">
            <address className="not-italic text-ink-2">{contact.address}</address>
            {maps ? (
              <a href={maps} target="_blank" rel="noopener noreferrer" className={cn(styles.pill, 'mt-1')}>
                <PinIcon size={16} />
                Open in Maps
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : null}
          </Row>
        ) : null}
      </div>

      {socials.length ? (
        <div className="flex flex-col gap-3">
          <p className="label text-ink-3">Elsewhere</p>
          <ul className="flex flex-wrap gap-2">
            {socials.map((s) => {
              const label = s.label || LINK_KIND_LABELS[s.kind];
              const external = isExternalHref(s.url);
              return (
                <li key={`${s.kind}-${s.url}`}>
                  <a
                    href={s.url}
                    {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : null)}
                    className={styles.social}
                    title={linkDisplay(s.url)}
                  >
                    <span className={styles.socialIcon} aria-hidden="true">
                      <LinkIcon kind={s.kind} size={18} />
                    </span>
                    <span>{label}</span>
                    {external ? <span className="sr-only"> ({LINK_KIND_LABELS[s.kind]}, opens in a new tab)</span> : null}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <aside className={styles.venueNote} aria-label="About the room">
        <Character shape="arch" mood="thinking" size={56} seed={3} className="flex-none" />
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 font-bold text-ink">
            <DoorIcon size={18} />
            Rooms change week to week.
          </p>
          <p className="text-ink-2">
            Sometimes a classroom, sometimes the theater. The event page always has this Friday&apos;s room and a map link.
          </p>
          {nextEvent ? (
            <Link href={`/events/${nextEvent.slug}`} className={cn(styles.pill, 'mt-1 self-start')}>
              <span className="mono text-ink-3">{formatJakarta(nextEvent.startsAt, 'date-short')}</span>
              <span className="truncate">{nextVenue ? `Next up: ${nextVenue}` : 'Check the next Friday'}</span>
              <span aria-hidden="true">→</span>
            </Link>
          ) : (
            <Link href="/events" className={cn(styles.pill, 'mt-1 self-start')}>
              See the Fridays <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>
      </aside>
    </div>
  );
}
