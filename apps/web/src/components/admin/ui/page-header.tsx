'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/admin/cn';

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons on the right. They stay visible in the sticky bar. */
  actions?: ReactNode;
  /** "Back to Events" style link above the title. */
  back?: { href: string; label: string };
  /** Small line above the title (a status chip, "Zemi #42"). */
  eyebrow?: ReactNode;
  /** Chips or meta under the title. */
  meta?: ReactNode;
  /** Stick the title row under the topbar while scrolling. Default true. */
  sticky?: boolean;
  /** Content under the header, like a `<TabNav>`. */
  children?: ReactNode;
  className?: string;
}

/**
 * Page title block. The title row sticks under the topbar and gets a hairline once content
 * scrolls under it (DESIGN.md: sticky page headers).
 *
 * @example
 * <PageHeader title="Events" description="Every Friday, past and upcoming."
 *   actions={<Can cap="events.create"><Button variant="primary">New event</Button></Can>} />
 */
export function PageHeader({ title, description, actions, back, eyebrow, meta, sticky = true, children, className }: PageHeaderProps) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (!sticky) return;
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const topbar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--admin-topbar-h')) || 60;
    const io = new IntersectionObserver(([entry]) => setStuck(!entry!.isIntersecting), { rootMargin: `-${topbar + 1}px 0px 0px 0px`, threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [sticky]);

  return (
    <header className={cn('mb-6 sm:mb-8', className)}>
      {back ? (
        <Link
          href={back.href}
          className="group mb-3 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-ink-3 transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-4 transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden="true" />
          {back.label}
        </Link>
      ) : null}
      {eyebrow ? <div className="mb-2 flex flex-wrap items-center gap-2">{eyebrow}</div> : null}
      <div ref={sentinel} aria-hidden="true" className="h-0" />
      <div
        className={cn(
          sticky && 'sticky top-[var(--admin-topbar-h,60px)] z-20 -mx-4 bg-white/90 px-4 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8',
          'transition-[box-shadow,padding] duration-200',
          stuck ? 'py-2.5 shadow-[0_1px_0_var(--color-line)]' : 'py-0',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <h1
            className={cn(
              'min-w-0 font-display leading-[1.02] font-extrabold tracking-[-0.03em] text-ink [font-variation-settings:"CASL"_0.2] transition-[font-size] duration-200',
              stuck ? 'truncate text-xl' : 'text-[clamp(1.75rem,2.6vw,2.375rem)]',
            )}
          >
            {title}
          </h1>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </div>
      {meta ? <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div> : null}
      {description ? <p className="mt-2 max-w-3xl text-[0.9375rem] leading-relaxed text-ink-3">{description}</p> : null}
      {children ? <div className="mt-5">{children}</div> : null}
    </header>
  );
}
