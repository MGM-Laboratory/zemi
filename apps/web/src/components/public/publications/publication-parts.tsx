/**
 * Server-rendered building blocks of the publication page: authors, venue line, metadata
 * table, links and related events. Interactive bits (cite box, PDF reader) are client islands.
 */
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  formatJakarta,
  type PublicationAuthor,
  type PublicationDetail,
  type ShapeName,
} from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { EmailIcon } from '@/components/icons';
import { ZemiImage } from '@/components/public/media/zemi-image';
import { safeHref } from '@/components/public/speakers/lib';
import { Avatar } from '@/components/public/ui/avatar';
import { cn } from '@/lib/utils';
import {
  arxivUrl,
  doiText,
  doiUrl,
  languageName,
  licenseUrl,
  LINK_KIND_LABEL,
  venueParts,
} from './lib';
import { DoiIcon, PubLinkIcon, PublisherIcon } from './pub-link-icon';
import styles from './publications.module.css';

/* ------------------------------------------------------------------ section titles */

/**
 * A section heading that looks like the foundation Eyebrow (mono label + shape) but is a real
 * `h2`, so the reading page has an outline screen readers can jump through. (Eyebrow renders a
 * `<p>`, which can't sit inside a heading.)
 */
export function SectionTitle({
  children,
  shape = 'circle',
  id,
  className,
}: {
  children: ReactNode;
  shape?: ShapeName;
  id?: string;
  className?: string;
}) {
  return (
    <h2 id={id} className={cn('label inline-flex items-center gap-2 text-ink-3', className)}>
      <ShapeIcon shape={shape} size="0.95em" />
      <span>{children}</span>
    </h2>
  );
}

/* ------------------------------------------------------------------ authors */

function AuthorName({ a }: { a: PublicationAuthor }) {
  const cls =
    'font-semibold text-ink underline decoration-ink/20 underline-offset-[0.22em] transition-[text-decoration-color] hover:decoration-ink';
  if (a.speaker) {
    return (
      <Link href={`/speakers/${a.speaker.slug}`} className={cls}>
        {a.fullName}
      </Link>
    );
  }
  const href = safeHref(a.url);
  if (href && /^https?:/i.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {a.fullName}
        <ArrowUpRight className="ml-0.5 inline size-[0.85em] align-[-0.08em]" aria-hidden="true" />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }
  return <span className="font-semibold text-ink">{a.fullName}</span>;
}

/** Everyone on the paper, in order, with photos, affiliations and the corresponding author mark. */
export function AuthorsRow({ authors }: { authors: PublicationAuthor[] }) {
  if (!authors.length) return null;
  const anyCorresponding = authors.some((a) => a.isCorresponding);
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-x-6 gap-y-4" aria-label="Authors">
        {authors.map((a) => (
          <li key={a.id} className="flex min-w-0 max-w-full items-center gap-3">
            <Avatar name={a.fullName} image={a.avatar ?? a.speaker?.avatar ?? null} size={44} />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="flex items-center gap-1.5 text-[1rem]">
                <AuthorName a={a} />
                {a.isCorresponding ? (
                  <span
                    className="inline-grid size-5 place-items-center rounded-full bg-blue-50 text-blue-600"
                    title="Corresponding author"
                  >
                    <EmailIcon size={13} strokeWidth={2.2} />
                    <span className="sr-only">(corresponding author)</span>
                  </span>
                ) : null}
              </span>
              {a.organization || a.speaker?.defaultOrganization ? (
                <span className="line-clamp-2 text-[0.875rem] text-ink-3">
                  {a.organization ?? a.speaker?.defaultOrganization}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {anyCorresponding ? (
        <p className="label flex items-center gap-1.5 text-ink-3">
          <span
            className="inline-grid size-4 place-items-center rounded-full bg-blue-50 text-blue-600"
            aria-hidden="true"
          >
            <EmailIcon size={10} strokeWidth={2.4} />
          </span>
          Corresponding author
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ venue */

/** "Journal of Urban Computing, 12(2), pp. 145-168. Urban Computing Society. 12 March 2026." */
export function VenueLine({ pub, className }: { pub: PublicationDetail; className?: string }) {
  const v = venueParts(pub);
  const bits = [v.volumeIssue, v.pages].filter(Boolean);
  if (!v.container && !bits.length && !v.publisher && !v.date) return null;
  return (
    <p className={cn('text-[1rem] leading-relaxed text-ink-2', className)}>
      {v.container ? <cite className="font-semibold italic text-ink">{v.container}</cite> : null}
      {bits.length ? <span>{`${v.container ? ', ' : ''}${bits.join(', ')}`}</span> : null}
      {v.container || bits.length ? '. ' : null}
      {v.publisher ? <span>{`${v.publisher}. `}</span> : null}
      {v.date ? (
        <time
          dateTime={[pub.publishedYear, pub.publishedMonth, pub.publishedDay]
            .filter(Boolean)
            .map((n, i) => (i ? String(n).padStart(2, '0') : n))
            .join('-')}
        >
          {v.date}
        </time>
      ) : null}
    </p>
  );
}

/* ------------------------------------------------------------------ metadata */

function ExtLink({ href, children, mono }: { href: string; children: ReactNode; mono?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'font-semibold text-blue-600 underline decoration-blue/30 underline-offset-[0.2em] hover:decoration-blue',
        mono && 'mono text-[0.9375rem]',
      )}
    >
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** The fine print: DOI, ISBN, ISSN, arXiv, citation key, language, license. */
export function MetaTable({
  pub,
  citationKey,
}: {
  pub: PublicationDetail;
  citationKey: string | null;
}) {
  const doi = doiText(pub.doi);
  const doiHref = doiUrl(pub.doi);
  const arxiv = arxivUrl(pub.arxivId);
  const lic = licenseUrl(pub.license);
  const rows: Array<{ label: string; value: ReactNode }> = [];
  if (doi && doiHref)
    rows.push({
      label: 'DOI',
      value: (
        <ExtLink href={doiHref} mono>
          {doi}
        </ExtLink>
      ),
    });
  if (pub.isbn)
    rows.push({ label: 'ISBN', value: <span className="mono text-[0.9375rem]">{pub.isbn}</span> });
  if (pub.issn)
    rows.push({ label: 'ISSN', value: <span className="mono text-[0.9375rem]">{pub.issn}</span> });
  if (arxiv && pub.arxivId)
    rows.push({
      label: 'arXiv',
      value: (
        <ExtLink href={arxiv} mono>
          {pub.arxivId}
        </ExtLink>
      ),
    });
  if (citationKey)
    rows.push({
      label: 'Cite key',
      value: (
        <code className="mono rounded-md bg-surface-muted px-1.5 py-0.5 text-[0.875rem]">
          {citationKey}
        </code>
      ),
    });
  const lang = languageName(pub.language);
  if (lang) rows.push({ label: 'Language', value: lang });
  if (pub.license)
    rows.push({
      label: 'License',
      value: lic ? <ExtLink href={lic}>{pub.license}</ExtLink> : pub.license,
    });
  if (pub.publisher) rows.push({ label: 'Publisher', value: pub.publisher });
  if (!rows.length) return null;
  return (
    <dl
      className={cn(
        styles.meta,
        'grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 text-[0.9375rem] text-ink',
      )}
    >
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="pt-[0.2em]">{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------ links */

interface LinkItemView {
  key: string;
  href: string;
  label: string;
  sub: string;
  icon: ReactNode;
}

/**
 * Publisher, DOI and every other link, deduped, unsafe URLs dropped. PDF links are skipped only
 * when the PDF is mirrored here (the Read / Download buttons cover it); otherwise they are the
 * way to the paper and stay.
 */
export function publicationLinkItems(pub: PublicationDetail): LinkItemView[] {
  const items: LinkItemView[] = [];
  const seen = new Set<string>();
  const add = (href: string | null, label: string, icon: ReactNode) => {
    if (!href || seen.has(href)) return;
    seen.add(href);
    let sub = href;
    try {
      const u = new URL(href);
      sub = u.hostname.replace(/^www\./, '');
    } catch {
      /* keep the raw text */
    }
    items.push({ key: href, href, label, sub, icon });
  };
  const doiHref = doiUrl(pub.doi);
  const publisher = safeHref(pub.url);
  if (publisher && publisher !== doiHref)
    add(publisher, 'Publisher page', <PublisherIcon size={20} />);
  add(doiHref, 'DOI', <DoiIcon size={20} />);
  for (const l of pub.links) {
    const href = safeHref(l.url);
    if (!href || (l.kind === 'pdf' && pub.pdf)) continue;
    add(href, l.label || LINK_KIND_LABEL[l.kind], <PubLinkIcon kind={l.kind} size={20} />);
  }
  return items;
}

/** The links from `publicationLinkItems`, each with its kind icon. */
export function LinkList({ pub }: { pub: PublicationDetail }) {
  const items = publicationLinkItems(pub);
  if (!items.length) return null;
  return (
    <ul className="flex flex-col">
      {items.map((it) => (
        <li key={it.key}>
          <a
            href={it.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 -mx-3 transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted"
          >
            <span className="grid size-10 flex-none place-items-center rounded-full border border-line bg-white text-ink transition-transform duration-500 group-hover:rotate-[-10deg] group-hover:scale-110">
              {it.icon}
            </span>
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="font-bold text-ink">{it.label}</span>
              <span className="mono truncate text-[0.8125rem] text-ink-3">{it.sub}</span>
            </span>
            <ArrowUpRight
              className="size-4 flex-none text-ink-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ events */

/** Fridays where the paper was presented. */
export function RelatedEvents({ events }: { events: PublicationDetail['events'] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {events.map((e, i) => (
        <li key={e.id}>
          <Link
            href={`/events/${e.slug}`}
            className="group flex h-full items-center gap-4 rounded-[24px] border border-line bg-white p-3 pr-5 transition-[box-shadow,transform,border-color] duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <span
              className="w-[4.5rem] flex-none overflow-hidden rounded-[14px] transition-transform duration-500 group-hover:rotate-[-3deg] group-hover:scale-105"
              style={{ rotate: `${i % 2 ? 2 : -2}deg` }}
            >
              <ZemiImage image={e.cover} aspect="4/5" sizes="96px" alt="" placeholderShape="arch" />
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="label flex items-center gap-1.5 text-ink-3">
                <ShapeIcon shape="arch" size="0.9em" />
                {e.number ? `Zemi #${e.number}` : 'Zemi'}
              </span>
              <span
                className="display line-clamp-2 text-[1.125rem] text-ink"
                style={{ fontVariationSettings: "'CASL' 0.4, 'MONO' 0", lineHeight: 1.12 }}
              >
                {e.title}
              </span>
              <time dateTime={e.startsAt} className="text-[0.875rem] text-ink-3">
                {formatJakarta(e.startsAt, 'date')}, {formatJakarta(e.startsAt, 'time')} WIB
              </time>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
