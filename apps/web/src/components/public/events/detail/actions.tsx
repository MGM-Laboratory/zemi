'use client';

import { CalendarPlus, Check, Share2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/public/ui/button';
import { eventUrls } from '@/lib/api/client';

type Size = 'sm' | 'md' | 'lg';

/** Downloads the event's .ics (works with Google, Apple and Outlook calendars). */
export function CalendarButton({
  eventId,
  href,
  size = 'md',
  variant = 'secondary',
  label = 'Add to calendar',
}: {
  eventId?: string;
  href?: string;
  size?: Size;
  variant?: 'secondary' | 'ghost' | 'outlinePaper' | 'paper';
  label?: string;
}) {
  const url = href ?? (eventId ? eventUrls(eventId).calendar : '#');
  return (
    <Button
      href={url}
      external={false}
      variant={variant}
      size={size}
      icon={<CalendarPlus className="size-full" />}
      shape={false}
      download
      data-transition="off"
    >
      {label}
    </Button>
  );
}

/** Web Share API where it exists (phones), copy link everywhere else. */
export function ShareButton({
  title,
  text,
  path,
  size = 'md',
  variant = 'ghost',
}: {
  title: string;
  text?: string;
  path: string;
  size?: Size;
  variant?: 'secondary' | 'ghost' | 'outlinePaper';
}) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = new URL(path, window.location.origin).toString();
    if (typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied. Send it to your lab group.');
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      toast.error("Couldn't copy that. The link is in your address bar.");
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      shape={false}
      onClick={share}
      icon={copied ? <Check className="size-full" /> : <Share2 className="size-full" />}
      aria-live="polite"
    >
      {copied ? 'Copied' : 'Share'}
    </Button>
  );
}
