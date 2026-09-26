'use client';

import { ScanLine, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/admin/ui/button';
import { CopyField } from '@/components/admin/ui/display';
import { Skeleton } from '@/components/admin/ui/feedback';
import { cn } from '@/lib/admin/cn';

const noopSubscribe = () => () => {};

/** The door scanner route for an event (outside the dashboard chrome). */
export const scannerPath = (eventId: string) => `/admin/scan/${eventId}`;

/**
 * "Open scanner": a big button for this device, and a QR of the scanner link so a phone can
 * open it in one go. The QR is drawn on the client from the real origin (no hydration
 * mismatch, and it points at whatever address the studio is served from).
 */
export function ScannerCard({ eventId, className }: { eventId: string; className?: string }) {
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => null);
  const hostname = useSyncExternalStore(noopSubscribe, () => window.location.hostname, () => '');
  const url = origin ? new URL(scannerPath(eventId), origin).toString() : null;
  const local = /^(localhost|127\.|\[::1\])/.test(hostname);
  const [qr, setQr] = useState<{ url: string; data: string } | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    void import('qrcode')
      .then((m) =>
        m.toDataURL(url, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 360,
          color: { dark: '#0e1116', light: '#ffffff' },
        }),
      )
      .then((data) => {
        if (!cancelled) setQr({ url, data });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [url]);
  const qrSrc = qr && qr.url === url ? qr.data : null;

  return (
    <section aria-labelledby="scan-card-title" className={cn('overflow-hidden rounded-[24px] bg-surface-inverse text-ink-inverse', className)}>
      <div className="space-y-4 p-5">
        <div className="flex items-center gap-4">
          <div className="group relative shrink-0 rounded-[18px] bg-white p-2 shadow-[0_18px_40px_-18px_rgba(58,109,197,0.8)] transition-transform duration-300 ease-[var(--ease-out)] hover:-rotate-3 hover:scale-[1.04]">
            {qrSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrSrc} alt="QR code that opens the door scanner for this event" width={132} height={132} className="block size-[112px] rounded-[8px] sm:size-[132px]" />
            ) : (
              <Skeleton className="size-[112px] sm:size-[132px]" rounded="md" />
            )}
            <span className="zemi-qr-scan pointer-events-none absolute inset-x-2.5 top-2.5 h-0.5 rounded-full bg-blue/80 shadow-[0_0_12px_rgba(58,109,197,0.9)] [--zemi-qr-travel:106px] sm:[--zemi-qr-travel:126px]" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 id="scan-card-title" className="font-display text-xl leading-tight font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.3]">
              Door scanner
            </h2>
            <p className="mt-1.5 text-sm leading-snug text-white/70">
              <Smartphone className="mr-1 inline size-4 -translate-y-px" aria-hidden="true" />
              Point a phone camera here to open the scanner on it. iPhone and Android both work.
            </p>
          </div>
        </div>
        <Button asChild variant="secondary" size="lg" fullWidth className="group/open border-white bg-white text-ink hover:border-white hover:bg-ink-inverse focus-visible:outline-white">
          <Link href={scannerPath(eventId)}>
            <ScanLine className="size-5 transition-transform duration-300 group-hover/open:scale-110 group-hover/open:-rotate-6" aria-hidden="true" />
            Open scanner here
          </Link>
        </Button>
        {url ? <CopyField value={url} label="Scanner link" size="sm" className="[&>div:first-child]:font-medium [&>div:first-child]:text-white/70" /> : null}
        {local ? (
          <p className="text-[0.8125rem] leading-snug text-yellow">
            This is a localhost address, so only this computer can open it. Phones need the studio&apos;s https address.
          </p>
        ) : null}
      </div>
    </section>
  );
}
