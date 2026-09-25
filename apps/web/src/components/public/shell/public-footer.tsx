import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import type { LinkItem, PublicSite } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { CaslHeading } from '@/components/motion/casl-heading';
import { Button } from '@/components/public/ui/button';
import { BackToTop, FooterEgg } from './footer-egg';
import { FooterWordmark } from './footer-wordmark';
import { SCHEDULE_LINE } from './nav-links';

const SOCIAL_LABEL: Record<LinkItem['kind'], string> = {
  website: 'Website',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  scholar: 'Google Scholar',
  orcid: 'ORCID',
  researchgate: 'ResearchGate',
  x: 'X',
  instagram: 'Instagram',
  youtube: 'YouTube',
  email: 'Email',
  other: 'Link',
};

const SAFE = /^(https?:|mailto:)/i;

type Col = { title: string; links: Array<{ href: string; label: string; external?: boolean }> };

export interface PublicFooterProps {
  site: Pick<PublicSite, 'settings'>;
}

/**
 * Footer on the inverse surface: closing line, link columns, schedule, socials from site
 * settings, the giant interactive wordmark and a tiny easter egg. Marks itself
 * data-nav-theme="dark" so the nav flips while it's under it.
 */
export function PublicFooter({ site }: PublicFooterProps) {
  const { general, contact, home } = site.settings;
  const socials = (contact.socials ?? []).filter((s) => SAFE.test(s.url));
  const year = new Date().getFullYear();

  const cols: Col[] = [
    {
      title: 'Explore',
      links: [
        { href: '/events', label: 'Events' },
        { href: '/speakers', label: 'Speakers' },
        { href: '/publications', label: 'Publications' },
      ],
    },
    {
      title: 'Zemi',
      links: [
        { href: '/about', label: 'About' },
        { href: '/contact', label: 'Contact' },
        { href: '/contact?topic=present', label: 'Present at Zemi' },
      ],
    },
    {
      title: 'Elsewhere',
      links: [
        {
          // labUrl is free text in settings: only http(s) goes into an href.
          href: general.labUrl && /^https?:\/\//i.test(general.labUrl) ? general.labUrl : 'https://labmgm.org',
          label: general.labName || 'MGM Laboratory',
          external: true,
        },
        ...socials.map((s) => ({ href: s.url, label: s.label || SOCIAL_LABEL[s.kind], external: !s.url.startsWith('mailto:') })),
        ...(contact.email ? [{ href: `mailto:${contact.email}`, label: contact.email }] : []),
      ],
    },
  ];

  return (
    <footer data-nav-theme="dark" className="relative isolate overflow-hidden bg-surface-inverse text-ink-inverse">
      <div className="container-page pt-[clamp(80px,13vh,176px)]">
        <div className="grid gap-x-[var(--gutter)] gap-y-14 lg:grid-cols-12">
          <div className="flex flex-col gap-6 lg:col-span-6">
            <p className="label flex items-center gap-2 text-ink-inverse/60">
              <ShapeIcon shape="arch" size="1em" />
              {home.closingBody || 'Same time. Maybe a different room. Always free.'}
            </p>
            <CaslHeading as="p" size="l" className="text-white">
              {home.closingTitle || 'See you Friday.'}
            </CaslHeading>
            <p className="mono flex items-center gap-2.5 text-[0.9375rem] text-ink-inverse/80">
              <span className="relative inline-grid size-5 place-items-center rounded-full border border-white/40" aria-hidden="true">
                <span className="absolute left-1/2 top-[3px] h-[7px] w-[1.5px] -translate-x-1/2 rounded bg-white" />
                <span className="absolute left-1/2 top-1/2 h-[1.5px] w-[5px] -translate-y-1/2 rounded bg-white" />
              </span>
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

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:col-span-6 lg:col-start-7 xl:col-span-5 xl:col-start-8">
            {cols.map((c) => (
              <div key={c.title} className="flex min-w-0 flex-col gap-4">
                <p className="label text-ink-inverse/50">{c.title}</p>
                <ul className="flex flex-col gap-2.5">
                  {c.links.map((l) => (
                    <li key={`${l.href}-${l.label}`} className="min-w-0">
                      {l.external ? (
                        <a
                          href={l.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group inline-flex max-w-full items-center gap-1 break-words font-semibold text-white/85 transition-colors hover:text-white"
                        >
                          <span className="truncate">{l.label}</span>
                          <ArrowUpRight className="size-4 flex-none opacity-50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden="true" />
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      ) : (
                        <Link href={l.href} className="inline-flex max-w-full font-semibold text-white/85 transition-colors hover:text-white">
                          <span className="truncate">{l.label}</span>
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </div>

      <div className="mx-auto mt-[clamp(56px,10vh,120px)] w-full max-w-[var(--max-content)] px-[max(8px,calc(var(--page-margin)*0.5))]">
        <FooterWordmark />
      </div>

      <div className="container-page">
        <div className="flex flex-col gap-4 border-t border-white/10 py-6 text-[0.875rem] text-ink-inverse/55 md:flex-row md:items-center md:justify-between">
          <p>
            © {year} {general.labName || 'MGM Laboratory'}. {general.footerNote}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <FooterEgg />
            <BackToTop />
          </div>
        </div>
      </div>
    </footer>
  );
}
