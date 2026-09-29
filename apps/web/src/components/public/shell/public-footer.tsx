import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import type { LinkItem, PublicSite } from '@zemi/shared';
import { isExternalHref, linkKey, safeHref } from '@/components/public/ui/safe-href';
import { BackToTop, FooterEgg } from './footer-egg';
import { FooterLead } from './footer-lead';
import { FooterWordmark } from './footer-wordmark';

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
  const year = new Date().getFullYear();

  // "Elsewhere" is admin free text: only http(s), mailto and tel reach an href, and the same place
  // is listed once (the lab site is often also saved as a "website" social).
  const labHref = safeHref(general.labUrl);
  const elsewhere: Col['links'] = [];
  const seen = new Set<string>();
  const add = (href: string | null, label: string) => {
    if (!href || !label.trim()) return;
    const k = linkKey(href);
    if (seen.has(k)) return;
    seen.add(k);
    elsewhere.push({ href, label, external: isExternalHref(href) });
  };
  add(labHref && isExternalHref(labHref) ? labHref : 'https://labmgm.org/', general.labName || 'MGM Laboratory');
  for (const s of contact.socials ?? []) {
    // Platform names read better than handles in a link list; websites keep their own label.
    const label = s.kind === 'website' || s.kind === 'other' ? s.label || SOCIAL_LABEL[s.kind] : SOCIAL_LABEL[s.kind];
    add(safeHref(s.url), label);
  }
  if (contact.email) add(safeHref(`mailto:${contact.email.trim()}`), contact.email.trim());

  const cols: Col[] = [
    {
      title: 'Explore',
      links: [
        { href: '/events', label: 'Events' },
        { href: '/discussion', label: 'Discussion' },
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
    { title: 'Elsewhere', links: elsewhere },
  ];

  return (
    <footer data-nav-theme="dark" className="relative isolate overflow-hidden bg-surface-inverse text-ink-inverse">
      <div className="container-page pt-[clamp(80px,13vh,176px)]">
        <div className="grid gap-x-[var(--gutter)] gap-y-14 lg:grid-cols-12">
          <FooterLead title={home.closingTitle} note={home.closingBody} />

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:col-span-6 lg:col-start-7 xl:col-span-5 xl:col-start-8">
            {cols.map((c) => (
              <div key={c.title} className="flex min-w-0 flex-col gap-4">
                <p className="label text-ink-inverse/50">{c.title}</p>
                <ul className="-my-2 flex flex-col">
                  {c.links.map((l) => (
                    <li key={`${l.href}-${l.label}`} className="min-w-0">
                      {l.external ? (
                        <a
                          href={l.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group inline-flex min-h-11 max-w-full items-center gap-1 break-words font-semibold text-white/85 transition-colors hover:text-white"
                        >
                          <span className="truncate">{l.label}</span>
                          <ArrowUpRight className="size-4 flex-none opacity-50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden="true" />
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      ) : (
                        <Link href={l.href} className="group inline-flex min-h-11 max-w-full items-center gap-2 font-semibold text-white/85 transition-colors hover:text-white">
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
