import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  CITATION_FORMATS,
  citationFileName,
  formatAllCitations,
  jakartaDateInput,
  makeCitationKey,
  publicationToCitationSource,
  type CitationFormat,
  type PublicationDetail,
} from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { CaslHeading } from '@/components/motion/casl-heading';
import { BlocksRenderer, hasBlocks } from '@/components/public/media/blocks-renderer';
import { ZemiImage } from '@/components/public/media/zemi-image';
import { CiteBox } from '@/components/public/publications/cite-box';
import {
  absoluteSiteUrl,
  doiText,
  doiUrl,
  formatBytes,
  highwireDate,
  isoPublished,
  licenseUrl,
  sitePdfPath,
  splitPages,
  STATUS_LABEL,
  STATUS_TONE,
  typeLook,
} from '@/components/public/publications/lib';
import { PaperCover } from '@/components/public/publications/paper-cover';
import { PdfReader } from '@/components/public/publications/pdf-reader';
import {
  AuthorsRow,
  LinkList,
  MetaTable,
  publicationLinkItems,
  RelatedEvents,
  SectionTitle,
  VenueLine,
} from '@/components/public/publications/publication-parts';
import styles from '@/components/public/publications/publications.module.css';
import { Enter } from '@/components/public/speakers/enter';
import { jsonLdString, siteUrl } from '@/components/public/speakers/lib';
import { Chip, ChipLink } from '@/components/public/ui/chip';
import { ApiUnavailable } from '@/components/public/ui/empty-state';
import { getPublication, unwrapLookup } from '@/lib/api/server';
import { cn } from '@/lib/utils';

type Props = { params: Promise<{ slug: string }> };

function describe(p: PublicationDetail): string {
  const abs = p.abstract?.replace(/\s+/g, ' ').trim();
  if (abs) return abs.length > 190 ? `${abs.slice(0, 187).replace(/\s+\S*$/, '')}...` : abs;
  const who = p.authorsFull
    .map((a) => a.fullName)
    .slice(0, 3)
    .join(', ');
  return `${typeLook(p.type).label}${p.publishedYear ? ` (${p.publishedYear})` : ''}${who ? ` by ${who}` : ''}. Presented at Zemi, the Friday seminar of MGM Laboratory.`;
}

/** Google Scholar (Highwire Press) tags. https://scholar.google.com/intl/en/scholar/inclusion.html#indexing */
function highwire(p: PublicationDetail): Record<string, string | string[]> {
  const tags: Record<string, string | string[]> = {
    citation_title: p.subtitle ? `${p.title}: ${p.subtitle}` : p.title,
  };
  const authors = p.authorsFull.map((a) => a.fullName).filter(Boolean);
  if (authors.length) tags.citation_author = authors;
  const date = highwireDate(p.publishedYear, p.publishedMonth, p.publishedDay);
  if (date) tags.citation_publication_date = date;
  const container = p.containerTitle?.trim();
  if (container) {
    if (p.type === 'conference-paper' || p.type === 'poster')
      tags.citation_conference_title = container;
    else if (p.type === 'book-chapter') tags.citation_inbook_title = container;
    else if (p.type === 'thesis')
      tags.citation_dissertation_institution = p.publisher?.trim() || container;
    else if (p.type === 'report')
      tags.citation_technical_report_institution = p.publisher?.trim() || container;
    else tags.citation_journal_title = container;
  } else if (p.type === 'thesis' && p.publisher)
    tags.citation_dissertation_institution = p.publisher;
  if (p.volume) tags.citation_volume = p.volume;
  if (p.issue) tags.citation_issue = p.issue;
  const pages = splitPages(p.pages);
  if (pages.first) tags.citation_firstpage = pages.first;
  if (pages.last) tags.citation_lastpage = pages.last;
  if (p.publisher) tags.citation_publisher = p.publisher;
  const doi = doiText(p.doi);
  if (doi) tags.citation_doi = doi;
  if (p.issn) tags.citation_issn = p.issn;
  if (p.isbn) tags.citation_isbn = p.isbn;
  if (p.arxivId) tags.citation_arxiv_id = p.arxivId;
  if (p.language) tags.citation_language = p.language;
  if (p.keywords.length) tags.citation_keywords = p.keywords.join('; ');
  const pdf = sitePdfPath(p.pdf?.url);
  if (pdf) tags.citation_pdf_url = absoluteSiteUrl(pdf);
  tags.citation_abstract_html_url = siteUrl(`/publications/${p.slug}`);
  return tags;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const lookup = await getPublication(slug);
  if (lookup.kind === 'redirect')
    return { alternates: { canonical: `/publications/${lookup.slug}` } };
  if (lookup.kind !== 'found') return { title: 'Publication' };
  const p = lookup.data;
  const url = `/publications/${p.slug}`;
  const description = describe(p);
  const images = p.cover
    ? [
        {
          url: p.cover.src,
          width: p.cover.width,
          height: p.cover.height,
          alt: p.cover.alt ?? p.title,
        },
      ]
    : undefined;
  return {
    title: p.title,
    description,
    keywords: p.keywords.length ? p.keywords : undefined,
    authors: p.authorsFull.map((a) => ({
      name: a.fullName,
      url: a.speaker ? siteUrl(`/speakers/${a.speaker.slug}`) : (a.url ?? undefined),
    })),
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      title: p.title,
      description,
      authors: p.authorsFull.map((a) => a.fullName),
      tags: p.keywords,
      ...(images ? { images } : null),
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title: p.title,
      description,
      ...(images ? { images: images.map((i) => i.url) } : null),
    },
    other: highwire(p),
  };
}

const LD_TYPE: Partial<Record<PublicationDetail['type'], string>> = {
  dataset: 'Dataset',
  software: 'SoftwareSourceCode',
  book: 'Book',
  thesis: 'Thesis',
  'book-chapter': 'Chapter',
  report: 'Report',
};

/** schema.org ScholarlyArticle (or the closer Dataset / Book / Thesis / Chapter / Report type). */
function jsonLd(p: PublicationDetail) {
  const url = siteUrl(`/publications/${p.slug}`);
  const doiHref = doiUrl(p.doi);
  const pdf = sitePdfPath(p.pdf?.url);
  const pages = splitPages(p.pages);
  const container = p.containerTitle?.trim();
  const periodical = container
    ? p.type === 'journal-article' || p.type === 'article'
      ? p.volume || p.issue
        ? {
            '@type': p.issue ? 'PublicationIssue' : 'PublicationVolume',
            ...(p.issue ? { issueNumber: p.issue } : { volumeNumber: p.volume }),
            isPartOf:
              p.issue && p.volume
                ? {
                    '@type': 'PublicationVolume',
                    volumeNumber: p.volume,
                    isPartOf: {
                      '@type': 'Periodical',
                      name: container,
                      ...(p.issn ? { issn: p.issn } : null),
                    },
                  }
                : { '@type': 'Periodical', name: container, ...(p.issn ? { issn: p.issn } : null) },
          }
        : { '@type': 'Periodical', name: container, ...(p.issn ? { issn: p.issn } : null) }
      : { '@type': 'CreativeWork', name: container }
    : undefined;
  return {
    '@context': 'https://schema.org',
    // Always a ScholarlyArticle; datasets, theses, books... also carry their closer schema.org type.
    '@type': LD_TYPE[p.type] ? ['ScholarlyArticle', LD_TYPE[p.type]] : 'ScholarlyArticle',
    '@id': url,
    url,
    headline: p.title.slice(0, 110),
    name: p.subtitle ? `${p.title}: ${p.subtitle}` : p.title,
    ...(p.abstract ? { abstract: p.abstract } : null),
    author: p.authorsFull.map((a) => ({
      '@type': 'Person',
      name: a.fullName,
      ...(a.speaker
        ? { url: siteUrl(`/speakers/${a.speaker.slug}`) }
        : a.url
          ? { url: a.url }
          : null),
      ...(a.organization
        ? { affiliation: { '@type': 'Organization', name: a.organization } }
        : null),
    })),
    ...(isoPublished(p.publishedYear, p.publishedMonth, p.publishedDay)
      ? { datePublished: isoPublished(p.publishedYear, p.publishedMonth, p.publishedDay) }
      : null),
    dateModified: p.updatedAt,
    ...(p.publisher ? { publisher: { '@type': 'Organization', name: p.publisher } } : null),
    ...(periodical ? { isPartOf: periodical } : null),
    ...(pages.first ? { pageStart: pages.first } : null),
    ...(pages.last ? { pageEnd: pages.last } : null),
    ...(p.pages ? { pagination: p.pages } : null),
    ...(p.keywords.length ? { keywords: p.keywords.join(', ') } : null),
    ...(p.language ? { inLanguage: p.language } : null),
    ...(p.license ? { license: licenseUrl(p.license) ?? p.license } : null),
    ...(p.cover ? { image: p.cover.src } : null),
    ...(doiHref
      ? {
          sameAs: doiHref,
          identifier: {
            '@type': 'PropertyValue',
            propertyID: 'DOI',
            value: doiText(p.doi),
            url: doiHref,
          },
        }
      : null),
    ...(p.isbn ? { isbn: p.isbn } : null),
    ...(pdf
      ? {
          encoding: {
            '@type': 'MediaObject',
            encodingFormat: 'application/pdf',
            contentUrl: absoluteSiteUrl(pdf),
          },
        }
      : null),
    ...(p.events.length
      ? {
          subjectOf: p.events.map((e) => ({
            '@type': 'Event',
            name: e.title,
            startDate: e.startsAt,
            url: siteUrl(`/events/${e.slug}`),
          })),
        }
      : null),
  };
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((s) => s.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

export default async function PublicationPage({ params }: Props) {
  const { slug } = await params;
  const pub = unwrapLookup(await getPublication(slug), '/publications');
  if (!pub) {
    return (
      <section className="container-page pb-[var(--section-y)] pt-[calc(var(--nav-h)+64px)]">
        <ApiUnavailable what="this paper" />
      </section>
    );
  }

  const look = typeLook(pub.type);
  // The brief wants type + status chips here (cards stay quiet about plain "published").
  const note =
    pub.type === 'preprint' && pub.status === 'preprint' ? null : STATUS_LABEL[pub.status];
  const hasLinks = publicationLinkItems(pub).length > 0;
  const src = publicationToCitationSource(pub, {
    fallbackUrl: siteUrl(`/publications/${pub.slug}`),
    accessedAt: jakartaDateInput(new Date()),
  });
  const citations = formatAllCitations(src);
  const fileNames = Object.fromEntries(
    CITATION_FORMATS.map((f) => [f.key, citationFileName(f.key, src)]),
  ) as Record<CitationFormat, string>;
  const citationKey =
    pub.citationKey || (src.authors.length || src.year ? makeCitationKey(src) : null);
  const pdf = sitePdfPath(pub.pdf?.url);
  const pdfName = pub.pdf?.filename?.toLowerCase().endsWith('.pdf')
    ? pub.pdf.filename
    : `${citationKey ?? pub.slug}.pdf`;
  const abstract = pub.abstract ? paragraphs(pub.abstract) : [];
  const hasBody = hasBlocks(pub.body);
  const finePrint = (className: string) => (
    <div className={cn('rounded-[28px] border border-line bg-white p-5 sm:p-6', className)}>
      <SectionTitle shape="square" className="mb-4">
        The fine print
      </SectionTitle>
      <MetaTable pub={pub} citationKey={citationKey} />
    </div>
  );

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd(pub)) }}
      />

      <header className="container-page pb-10 pt-[calc(var(--nav-h)+28px)] md:pb-14 md:pt-[calc(var(--nav-h)+56px)]">
        <Enter y={10}>
          <Link
            href="/publications"
            className="group mb-8 inline-flex items-center gap-2 rounded-full py-1 pr-2 text-[0.9375rem] font-bold text-ink-2 transition-colors hover:text-ink md:mb-12"
          >
            <span className="grid size-8 place-items-center rounded-full border border-line-strong transition-transform duration-300 group-hover:-translate-x-1">
              <ArrowLeft className="size-4" aria-hidden="true" />
            </span>
            All papers
          </Link>
        </Enter>
        <div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-[var(--gutter)]">
          <div className="flex min-w-0 flex-col gap-6 lg:col-span-8">
            <Enter delay={0.05} y={12} className="flex flex-wrap items-center gap-2">
              <ChipLink
                href={`/publications?type=${pub.type}`}
                tone={look.tone}
                shape={look.shape}
                size="md"
              >
                {look.label}
              </ChipLink>
              {note ? (
                <Chip tone={STATUS_TONE[pub.status]} size="md">
                  {note}
                </Chip>
              ) : null}
              {pub.publishedYear ? (
                <span className="label ml-1 text-ink-3">{pub.publishedYear}</span>
              ) : null}
            </Enter>
            <CaslHeading
              as="h1"
              size="m"
              reveal={{ by: 'words', stagger: 0.03 }}
              className="max-w-[26ch] text-ink"
              to={0.7}
            >
              {pub.title}
            </CaslHeading>
            {pub.subtitle ? (
              <Enter delay={0.2}>
                <p
                  className="display max-w-[40rem] text-title text-ink-2"
                  style={{
                    fontWeight: 500,
                    fontVariationSettings: "'CASL' 0.4, 'MONO' 0",
                    letterSpacing: '-0.02em',
                  }}
                >
                  {pub.subtitle}
                </p>
              </Enter>
            ) : null}
            <Enter delay={0.25} className="mt-2 flex flex-col gap-5">
              <AuthorsRow authors={pub.authorsFull} />
              <VenueLine pub={pub} className="border-t border-line pt-5" />
            </Enter>
          </div>
          <Enter delay={0.3} y={30} className="hidden lg:col-span-4 lg:col-start-9 lg:block">
            <div className={cn('mx-auto w-full max-w-[20rem]', styles.cover)}>
              <div className="overflow-hidden rounded-[24px] border border-line shadow-3">
                {pub.cover ? (
                  <ZemiImage
                    image={pub.cover}
                    aspect="4/5"
                    sizes="(min-width: 1024px) 320px, 60vw"
                    alt={pub.cover.alt ?? ''}
                    priority
                  />
                ) : (
                  <PaperCover title={pub.title} type={pub.type} year={pub.publishedYear} />
                )}
              </div>
            </div>
          </Enter>
        </div>
      </header>

      <div className="container-page grid gap-12 pb-[var(--section-y)] lg:grid-cols-12 lg:gap-[var(--gutter)]">
        {/* Actions and fine print. First on phones (Read PDF matters most), right column on desktop. */}
        <aside
          className="flex flex-col gap-6 lg:order-2 lg:col-span-4 lg:col-start-9 lg:self-start lg:sticky lg:top-[calc(var(--nav-h)+24px)]"
          aria-label="Get the paper"
        >
          <div className="flex flex-col gap-5 rounded-[28px] border border-line bg-white p-5 shadow-1 sm:p-6">
            {pdf ? (
              <PdfReader
                url={pdf}
                fileName={pdfName}
                sizeLabel={pub.pdf ? formatBytes(pub.pdf.sizeBytes) : undefined}
                title={pub.title}
              />
            ) : (
              <p className="flex items-start gap-2 rounded-2xl bg-surface-muted p-4 text-[0.9375rem] text-ink-2">
                <ShapeIcon shape="square" size={14} className="mt-1" />
                {hasLinks
                  ? 'No PDF mirrored here yet. The links below should get you to it.'
                  : "No PDF here yet. The citation below is the best trail we've got."}
              </p>
            )}
            <LinkList pub={pub} />
          </div>
          {finePrint('hidden lg:block')}
        </aside>

        <div className="flex min-w-0 flex-col gap-14 lg:order-1 lg:col-span-8 lg:pr-[4%] xl:col-span-7">
          {abstract.length ? (
            <section aria-labelledby="abstract" className="flex flex-col gap-5">
              <SectionTitle shape="circle" id="abstract">
                Abstract
              </SectionTitle>
              <div className={cn(styles.abstract, styles.measure, 'flex flex-col gap-4')}>
                {abstract.map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            </section>
          ) : null}

          {hasBody ? (
            <section aria-label="More about this paper" className={styles.measure}>
              <BlocksRenderer blocks={pub.body} size="md" />
            </section>
          ) : null}

          {pub.keywords.length ? (
            <section aria-labelledby="keywords" className="flex flex-col gap-4">
              <SectionTitle shape="triangle" id="keywords">
                Keywords
              </SectionTitle>
              <ul className="flex flex-wrap gap-2">
                {pub.keywords.map((k) => (
                  <li key={k}>
                    <ChipLink
                      href={`/publications?tag=${encodeURIComponent(k)}`}
                      size="md"
                      tone="outline"
                    >
                      {k}
                    </ChipLink>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="cite" className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <SectionTitle shape="square" id="cite">
                Cite this
              </SectionTitle>
              <p className="text-ink-2">
                Pick your style. We did the commas so you don&apos;t have to.
              </p>
            </div>
            <CiteBox citations={citations} fileNames={fileNames} />
          </section>

          {pub.events.length ? (
            <section aria-labelledby="presented" className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <SectionTitle shape="arch" id="presented">
                  Presented at Zemi
                </SectionTitle>
                <p className="text-ink-2">
                  {pub.events.length === 1
                    ? 'This one got its Friday.'
                    : `This one got ${pub.events.length} Fridays. Good papers keep coming back.`}
                </p>
              </div>
              <RelatedEvents events={pub.events} />
            </section>
          ) : null}

          {/* On phones and tablets the fine print comes after the reading, not before it. */}
          {finePrint('lg:hidden')}
        </div>
      </div>
    </article>
  );
}
