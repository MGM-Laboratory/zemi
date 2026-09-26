'use client';

import { usePathname } from 'next/navigation';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { CaslHeading } from '@/components/motion/casl-heading';
import { Button } from '@/components/public/ui/button';
import { SCHEDULE_LINE } from './nav-links';

export interface FooterLeadProps {
  /** Settings `home.closingTitle` ("See you Friday."). */
  title: string;
  /** Settings `home.closingBody`. */
  note: string;
}

function ClockDot() {
  return (
    <span className="relative inline-grid size-5 place-items-center rounded-full border border-white/40" aria-hidden="true">
      <span className="absolute left-1/2 top-[3px] h-[7px] w-[1.5px] -translate-x-1/2 rounded bg-white" />
      <span className="absolute left-1/2 top-1/2 h-[1.5px] w-[5px] -translate-y-1/2 rounded bg-white" />
    </span>
  );
}

/**
 * The footer's opening block. Every page signs off with "See you Friday." and a seat button,
 * except the home page: its story already ended on "See you next Friday." right above, so the
 * footer asks something new there instead of saying goodbye twice.
 */
export function FooterLead({ title, note }: FooterLeadProps) {
  const home = usePathname() === '/';

  if (home) {
    return (
      <div className="flex flex-col gap-6 lg:col-span-6">
        <p className="label flex items-center gap-2 text-ink-inverse/60">
          <ShapeIcon shape="triangle" size="1em" />
          Before Friday
        </p>
        <CaslHeading as="p" size="m" className="max-w-[14ch] text-white">
          Got a question first? Ask us.
        </CaslHeading>
        <p className="max-w-[30rem] text-ink-inverse/75">
          A real person reads every message, usually within two working days. Want the mic one Friday? Say so.
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          <Button href="/contact" variant="paper" size="lg" shape="circle">
            Say hi
          </Button>
          <Button href="/contact?topic=present" variant="outlinePaper" size="lg" shape="triangle">
            I want to present
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 lg:col-span-6">
      <p className="label flex items-center gap-2 text-ink-inverse/60">
        <ShapeIcon shape="arch" size="1em" />
        {note || 'Same time. Maybe a different room. Always free.'}
      </p>
      <CaslHeading as="p" size="l" className="text-white">
        {title || 'See you Friday.'}
      </CaslHeading>
      <p className="mono flex items-center gap-2.5 text-[0.9375rem] text-ink-inverse/80">
        <ClockDot />
        {SCHEDULE_LINE}
      </p>
      <div className="mt-2 flex flex-wrap gap-3">
        <Button href="/events" variant="paper" size="lg">
          Save me a seat
        </Button>
        <Button href="/contact" variant="outlinePaper" size="lg" shape={false}>
          Say hi
        </Button>
      </div>
    </div>
  );
}
