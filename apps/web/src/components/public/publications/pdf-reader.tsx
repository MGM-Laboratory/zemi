'use client';

import { ExternalLink } from 'lucide-react';
import { useRef, useState, type MouseEvent } from 'react';
import { ZemiMark } from '@/components/brand/zemi-mark';
import { Button, buttonVariants } from '@/components/public/ui/button';
import { Dialog } from '@/components/public/ui/dialog';
import { cn } from '@/lib/utils';
import { DownloadIcon, PdfIcon } from './pub-link-icon';

export interface PdfReaderProps {
  /** Same-origin `/media/...` path of the PDF. */
  url: string;
  fileName: string;
  /** "115 KB" */
  sizeLabel?: string;
  title: string;
  className?: string;
}

/** Can this browser show a PDF inside the page? Phones and tablets mostly can't (or show page one only). */
function canInline(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { pdfViewerEnabled?: boolean };
  if (nav.pdfViewerEnabled === false) return false;
  return window.matchMedia('(pointer: fine)').matches && window.innerWidth >= 768;
}

/**
 * "Read PDF" opens the mirror in an in-page viewer (a large dialog with an iframe) where the
 * browser can render PDFs. Everywhere else, and without JavaScript, it is a plain link that
 * opens the PDF in a new tab. The viewer always offers "Open in a new tab" and "Download".
 */
export function PdfReader({ url, fileName, sizeLabel, title, className }: PdfReaderProps) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const readRef = useRef<HTMLAnchorElement>(null);

  // The dialog has no Radix trigger, so Radix can't hand focus back on close. Do it here.
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) requestAnimationFrame(() => readRef.current?.focus({ preventScroll: true }));
  };

  const onRead = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (!canInline()) return;
    e.preventDefault();
    setLoaded(false);
    setOpen(true);
  };

  return (
    <>
      <div
        className={cn(
          'flex flex-col gap-2 sm:flex-row lg:flex-col min-[120rem]:flex-row',
          className,
        )}
      >
        <Button
          ref={readRef}
          href={url}
          external
          size="lg"
          magnetic={false}
          onClick={onRead}
          icon={<PdfIcon size={20} />}
          className="w-full sm:flex-1 lg:flex-none min-[120rem]:flex-1"
          cursor="open"
          data-transition="off"
        >
          Read the PDF
        </Button>
        {/* A plain <a>: `download` needs a same-origin URL and a Next <Link> would try a client navigation. */}
        <a
          href={url}
          download={fileName}
          className={cn(
            buttonVariants({ variant: 'secondary', size: 'lg' }),
            'w-full sm:w-auto lg:w-full min-[120rem]:w-auto',
          )}
          data-transition="off"
        >
          <DownloadIcon size={20} />
          <span>Download PDF</span>
          {sizeLabel ? (
            <span className="mono text-[0.8125rem] font-normal text-ink-3">{sizeLabel}</span>
          ) : null}
        </a>
      </div>

      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title="Read the PDF"
        description={<span className="line-clamp-1">{title}</span>}
        className="h-[calc(100dvh-32px)] max-w-[min(1200px,calc(100vw-32px))]"
        size="lg"
      >
        <div className="flex h-full min-h-[60vh] flex-col gap-3">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="flex flex-none gap-2">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong px-4 text-[0.9375rem] font-bold text-ink transition-colors hover:border-ink hover:bg-surface-muted"
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                New tab<span className="sr-only"> (opens in a new tab)</span>
              </a>
              <a
                href={url}
                download={fileName}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-[0.9375rem] font-bold text-white transition-colors hover:bg-[#1c2230]"
              >
                <DownloadIcon size={16} />
                Download
              </a>
            </div>
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-[18px] border border-line bg-surface-muted">
            {!loaded ? (
              <div className="absolute inset-0 grid place-items-center" aria-hidden="true">
                <div className="flex flex-col items-center gap-3 text-ink-3">
                  <ZemiMark variant="loading" size={48} decorative />
                  <span className="label">Unfolding the paper</span>
                </div>
              </div>
            ) : null}
            <iframe
              src={`${url}#view=FitH`}
              title={`PDF of ${title}`}
              className="relative size-full border-0"
              onLoad={() => setLoaded(true)}
            />
          </div>
          <p className="text-[0.875rem] text-ink-3">
            Blank page? Some browsers won&apos;t show PDFs inline.{' '}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-blue-600 underline underline-offset-2"
            >
              Open it in a new tab
            </a>{' '}
            instead.
          </p>
        </div>
      </Dialog>
    </>
  );
}
