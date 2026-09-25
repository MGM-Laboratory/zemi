import Link from 'next/link';
import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { SHAPE_COLORS, SHAPE_ORDER, SHAPE_PATHS_46, type Blocks } from '@zemi/shared';
import { cn } from '@/lib/utils';
import styles from './blocks.module.css';

/* ------------------------------------------------------------------ types (BlockNote JSON) */

interface RawBlock {
  id?: string;
  type?: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: RawBlock[];
}

interface TextStyles {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  textColor?: string;
  backgroundColor?: string;
}

interface StyledText {
  type: 'text';
  text: string;
  styles?: TextStyles;
}

interface LinkContent {
  type: 'link';
  href: string;
  content: StyledText[] | string;
}

export interface BlocksRendererProps {
  blocks: Blocks | null | undefined;
  className?: string;
  /** BlockNote heading 1 renders as h(1 + offset). Default 1 (the page title owns the h1). */
  headingOffset?: number;
  size?: 'sm' | 'md' | 'lg';
  /** Drop the 68ch measure. */
  wide?: boolean;
  /** Absolute origin treated as "internal" for links (default NEXT_PUBLIC_SITE_URL). */
  siteOrigin?: string;
}

/* ------------------------------------------------------------------ colors */

// BlockNote color names mapped to brand-friendly values. Yellow text becomes a highlighter
// (yellow fails contrast as text on white).
const TEXT_COLOR: Record<string, string> = {
  gray: '#6b7280',
  brown: '#7a5a3a',
  red: '#d92f2f',
  orange: '#b8520f',
  green: '#0b6b45',
  blue: '#2f5aa6',
  purple: '#6d4bc3',
  pink: '#b8336f',
};

const BG_COLOR: Record<string, string> = {
  gray: '#f7f7f5',
  brown: '#f3ece4',
  red: '#fee5e5',
  orange: '#fdeee2',
  yellow: '#fef6e0',
  green: '#e2f1ea',
  blue: '#ecf1fa',
  purple: '#efeafb',
  pink: '#fbe8f0',
};

/* ------------------------------------------------------------------ url safety */

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/+$/, '');

function safeHref(href: unknown): string | null {
  if (typeof href !== 'string') return null;
  const h = href.trim();
  if (!h) return null;
  if (h.startsWith('/') && !h.startsWith('//')) return h;
  if (h.startsWith('#')) return h;
  if (/^(https?:|mailto:|tel:)/i.test(h)) return h;
  // "example.com/page" typed without a protocol.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(h)) return `https://${h}`;
  return null;
}

function safeSrc(src: unknown): string | null {
  if (typeof src !== 'string' || !src.trim()) return null;
  const s = src.trim();
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  if (/^https?:\/\//i.test(s)) return s;
  return null;
}

/* ------------------------------------------------------------------ inline */

function renderText(t: StyledText, key: string | number): ReactNode {
  const parts = t.text.split('\n');
  let node: ReactNode = parts.map((p, i) => (
    <Fragment key={i}>
      {i > 0 ? <br /> : null}
      {p}
    </Fragment>
  ));
  const s = t.styles ?? {};
  if (s.code) node = <code className={styles.inlineCode}>{node}</code>;
  if (s.bold) node = <strong>{node}</strong>;
  if (s.italic) node = <em>{node}</em>;
  if (s.underline) node = <u>{node}</u>;
  if (s.strike) node = <s>{node}</s>;
  const tc = s.textColor && s.textColor !== 'default' ? s.textColor : null;
  const bg = s.backgroundColor && s.backgroundColor !== 'default' ? s.backgroundColor : null;
  if (tc === 'yellow') {
    node = <mark className={cn(styles.mark, styles.highlighter)}>{node}</mark>;
  } else if (tc && TEXT_COLOR[tc]) {
    node = <span style={{ color: TEXT_COLOR[tc] }}>{node}</span>;
  }
  if (bg && BG_COLOR[bg]) node = <mark className={styles.mark} style={{ background: BG_COLOR[bg] }}>{node}</mark>;
  return <Fragment key={key}>{node}</Fragment>;
}

function renderInline(content: unknown, ctx: Ctx): ReactNode {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  return content.map((item, i) => {
    if (!item || typeof item !== 'object') return null;
    const it = item as { type?: string; text?: unknown };
    if (it.type === 'text' && typeof it.text === 'string') return renderText(it as StyledText, i);
    if (it.type === 'link') {
      const l = item as LinkContent;
      const inner = typeof l.content === 'string' ? l.content : (l.content ?? []).map((c, j) => renderText(c, j));
      const href = safeHref(l.href);
      if (!href) return <Fragment key={i}>{inner}</Fragment>;
      return <SmartLink key={i} href={href} ctx={ctx}>{inner}</SmartLink>;
    }
    // Mentions or custom inline content: keep any text we can find.
    if (typeof it.text === 'string') return <Fragment key={i}>{it.text}</Fragment>;
    const nested = (item as { content?: unknown }).content;
    return nested ? <Fragment key={i}>{renderInline(nested, ctx)}</Fragment> : null;
  });
}

function hasText(content: unknown): boolean {
  if (typeof content === 'string') return content.trim().length > 0;
  if (!Array.isArray(content)) return false;
  return content.some((c) => {
    if (!c || typeof c !== 'object') return false;
    const t = (c as { text?: unknown }).text;
    if (typeof t === 'string' && t.trim()) return true;
    return hasText((c as { content?: unknown }).content);
  });
}

function plainText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((c) => {
      if (!c || typeof c !== 'object') return '';
      const t = (c as { text?: unknown }).text;
      return typeof t === 'string' ? t : plainText((c as { content?: unknown }).content);
    })
    .join('');
}

interface Ctx {
  offset: number;
  origin: string;
}

function SmartLink({ href, children, ctx }: { href: string; children: ReactNode; ctx: Ctx }) {
  let internal = href.startsWith('/') || href.startsWith('#');
  let path = href;
  if (!internal && ctx.origin && /^https?:/i.test(href)) {
    // Compare real origins: a prefix check would treat https://zemi.org.evil.com as ours.
    try {
      const u = new URL(href);
      if (u.origin === new URL(ctx.origin).origin) {
        internal = true;
        path = `${u.pathname}${u.search}${u.hash}` || '/';
      }
    } catch {
      /* not a URL we can parse: treat as external */
    }
  }
  if (internal && !path.startsWith('#')) {
    return (
      <Link href={path} className={styles.link}>
        {children}
      </Link>
    );
  }
  if (internal) {
    return (
      <a href={path} className={styles.link}>
        {children}
      </a>
    );
  }
  const isHttp = /^https?:/i.test(href);
  return (
    <a href={href} className={styles.link} {...(isHttp ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : null)}>
      {children}
      {isHttp ? <span className="sr-only"> (opens in a new tab)</span> : null}
    </a>
  );
}

/* ------------------------------------------------------------------ blocks */

function blockStyle(props: Record<string, unknown> | undefined): CSSProperties | undefined {
  if (!props) return undefined;
  const out: CSSProperties = {};
  const align = props.textAlignment;
  if (align === 'center' || align === 'right' || align === 'justify') out.textAlign = align;
  const tc = props.textColor;
  if (typeof tc === 'string' && TEXT_COLOR[tc]) out.color = TEXT_COLOR[tc];
  const bg = props.backgroundColor;
  if (typeof bg === 'string' && BG_COLOR[bg]) {
    out.background = BG_COLOR[bg];
    out.borderRadius = 14;
    out.padding = '0.6em 0.9em';
  }
  return Object.keys(out).length ? out : undefined;
}

type ListKind = 'bulletListItem' | 'numberedListItem' | 'checkListItem';
const LIST_TYPES = new Set<string>(['bulletListItem', 'numberedListItem', 'checkListItem']);

function renderBlocks(list: RawBlock[], ctx: Ctx): ReactNode[] {
  const out: ReactNode[] = [];
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (!b || typeof b !== 'object') continue;
    const type = b.type ?? '';
    if (LIST_TYPES.has(type)) {
      const group: RawBlock[] = [];
      while (i < list.length && list[i]?.type === type) group.push(list[i++]!);
      i--;
      out.push(renderList(type as ListKind, group, ctx, b.id ?? `list-${i}`));
      continue;
    }
    const node = renderBlock(b, ctx);
    if (node) out.push(<Fragment key={b.id ?? `b-${i}`}>{node}</Fragment>);
  }
  return out;
}

function Children({ blocks, ctx }: { blocks?: RawBlock[]; ctx: Ctx }) {
  if (!blocks?.length) return null;
  return <div className={styles.nested}>{renderBlocks(blocks, ctx)}</div>;
}

function renderList(kind: ListKind, items: RawBlock[], ctx: Ctx, key: string): ReactNode {
  if (kind === 'checkListItem') {
    return (
      <ul key={key} className={styles.checklist}>
        {items.map((it, i) => {
          const checked = it.props?.checked === true;
          return (
            <li key={it.id ?? i} className={cn(checked && styles.checked)} style={blockStyle(it.props)}>
              <span className={styles.check} aria-hidden="true">
                {checked ? (
                  <svg viewBox="0 0 16 16" width="70%" height="70%">
                    <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </span>
              <span className="sr-only">{checked ? 'Done: ' : 'To do: '}</span>
              <span className={styles.checkText}>{renderInline(it.content, ctx)}</span>
              <Children blocks={it.children} ctx={ctx} />
            </li>
          );
        })}
      </ul>
    );
  }
  const Tag = kind === 'numberedListItem' ? 'ol' : 'ul';
  const start = Number(items[0]?.props?.start);
  return (
    <Tag
      key={key}
      className={kind === 'numberedListItem' ? styles.ol : styles.ul}
      start={Tag === 'ol' && Number.isFinite(start) && start > 1 ? start : undefined}
      style={Tag === 'ol' && Number.isFinite(start) && start > 1 ? ({ '--ol-start': start - 1 } as CSSProperties) : undefined}
    >
      {items.map((it, i) => (
        <li key={it.id ?? i} style={blockStyle(it.props)}>
          {renderInline(it.content, ctx)}
          <Children blocks={it.children} ctx={ctx} />
        </li>
      ))}
    </Tag>
  );
}

function headingTag(level: unknown, offset: number): 'h2' | 'h3' | 'h4' | 'h5' | 'h6' {
  const l = Math.min(6, Math.max(2, (Number(level) || 1) + offset));
  return `h${l}` as 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
}

function Caption({ text }: { text: unknown }) {
  return typeof text === 'string' && text.trim() ? <figcaption className={styles.caption}>{text}</figcaption> : null;
}

function mediaWidth(props: Record<string, unknown> | undefined): CSSProperties | undefined {
  const w = Number(props?.previewWidth);
  const align = props?.textAlignment;
  const style: CSSProperties = {};
  if (Number.isFinite(w) && w > 0) style.maxWidth = `${w}px`;
  if (align === 'center') style.marginInline = 'auto';
  if (align === 'right') style.marginLeft = 'auto';
  return Object.keys(style).length ? style : undefined;
}

function renderBlock(b: RawBlock, ctx: Ctx): ReactNode {
  const p = b.props ?? {};
  switch (b.type) {
    case 'paragraph':
      if (!hasText(b.content) && !b.children?.length) return null;
      return (
        <>
          <p style={blockStyle(p)}>{renderInline(b.content, ctx)}</p>
          <Children blocks={b.children} ctx={ctx} />
        </>
      );

    case 'heading': {
      const Tag = headingTag(p.level, ctx.offset);
      const cls = Tag === 'h2' ? styles.h2 : Tag === 'h3' ? styles.h3 : styles.h4;
      const heading = (
        <Tag className={cls} style={blockStyle(p)}>
          {renderInline(b.content, ctx)}
        </Tag>
      );
      if (p.isToggleable === true) {
        return (
          <details className={styles.toggle}>
            <summary>{heading}</summary>
            <div className={styles.toggleBody}>{renderBlocks(b.children ?? [], ctx)}</div>
          </details>
        );
      }
      return (
        <>
          {heading}
          <Children blocks={b.children} ctx={ctx} />
        </>
      );
    }

    case 'toggleListItem':
      return (
        <details className={styles.toggle} style={blockStyle(p)}>
          <summary>{renderInline(b.content, ctx)}</summary>
          <div className={styles.toggleBody}>{renderBlocks(b.children ?? [], ctx)}</div>
        </details>
      );

    case 'quote':
      return (
        <>
          <blockquote className={styles.quote} style={blockStyle(p)}>
            {renderInline(b.content, ctx)}
          </blockquote>
          <Children blocks={b.children} ctx={ctx} />
        </>
      );

    case 'codeBlock': {
      const lang = typeof p.language === 'string' && p.language !== 'text' ? p.language : null;
      return (
        <pre className={styles.code}>
          {lang ? <span className={styles.codeLang}>{lang}</span> : null}
          <code data-language={lang ?? undefined}>{plainText(b.content)}</code>
        </pre>
      );
    }

    case 'table':
      return <Table content={b.content} ctx={ctx} />;

    case 'image': {
      const src = safeSrc(p.url);
      if (!src) return null;
      const caption = typeof p.caption === 'string' ? p.caption : '';
      const alt = caption || (typeof p.name === 'string' ? p.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ') : '');
      return (
        <figure className={styles.figure} style={mediaWidth(p)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} loading="lazy" decoding="async" />
          <Caption text={caption} />
        </figure>
      );
    }

    case 'video': {
      const src = safeSrc(p.url);
      if (!src) return null;
      return (
        <figure className={styles.figure} style={mediaWidth(p)}>
          <video src={src} controls preload="metadata" playsInline />
          <Caption text={p.caption} />
        </figure>
      );
    }

    case 'audio': {
      const src = safeSrc(p.url);
      if (!src) return null;
      return (
        <figure className={styles.figure}>
          <audio src={src} controls preload="metadata" />
          <Caption text={p.caption} />
        </figure>
      );
    }

    case 'file': {
      const src = safeSrc(p.url);
      if (!src) return null;
      const name = (typeof p.name === 'string' && p.name) || src.split('/').pop() || 'File';
      const ext = name.includes('.') ? name.split('.').pop()!.toUpperCase() : 'FILE';
      return (
        <figure className={styles.figure}>
          <a href={src} className={styles.file} target="_blank" rel="noopener noreferrer" download>
            <svg viewBox="0 0 46 46" width="28" height="28" aria-hidden="true" style={{ flex: 'none' }}>
              <path d={SHAPE_PATHS_46.square} fill={SHAPE_COLORS.square} />
            </svg>
            <span className="flex min-w-0 flex-col">
              <span className={styles.fileName}>{name}</span>
              <span className={styles.fileHint}>{ext} · Download</span>
            </span>
          </a>
          <Caption text={p.caption} />
        </figure>
      );
    }

    case 'divider':
      return (
        <div className={styles.divider} role="separator">
          {SHAPE_ORDER.map((s) => (
            <svg key={s} viewBox="0 0 46 46" aria-hidden="true" width="10" height="10">
              <path d={SHAPE_PATHS_46[s]} fill={SHAPE_COLORS[s]} />
            </svg>
          ))}
        </div>
      );

    case 'pageBreak':
      return <hr className={styles.pageBreak} />;

    default: {
      // Unknown block: keep its words and its children, drop the rest.
      if (hasText(b.content)) {
        return (
          <>
            <p style={blockStyle(p)}>{renderInline(b.content, ctx)}</p>
            <Children blocks={b.children} ctx={ctx} />
          </>
        );
      }
      return b.children?.length ? <>{renderBlocks(b.children, ctx)}</> : null;
    }
  }
}

function Table({ content, ctx }: { content: unknown; ctx: Ctx }) {
  if (!content || typeof content !== 'object') return null;
  const c = content as { rows?: Array<{ cells?: unknown[] }>; headerRows?: number; headerCols?: number };
  const rows = Array.isArray(c.rows) ? c.rows : [];
  if (!rows.length) return null;
  const headerRows = Math.max(0, Number(c.headerRows ?? 0) || 0);
  const headerCols = Math.max(0, Number(c.headerCols ?? 0) || 0);

  const cell = (raw: unknown) => {
    // Newer BlockNote: { type: 'tableCell', content, props }. Older: an inline content array.
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as { type?: string }).type === 'tableCell') {
      const tc = raw as { content?: unknown; props?: Record<string, unknown> };
      const span = {
        colSpan: Number(tc.props?.colspan) > 1 ? Number(tc.props?.colspan) : undefined,
        rowSpan: Number(tc.props?.rowspan) > 1 ? Number(tc.props?.rowspan) : undefined,
      };
      return { node: renderInline(tc.content, ctx), span, style: blockStyle(tc.props) };
    }
    return { node: renderInline(raw, ctx), span: {}, style: undefined };
  };

  const head = rows.slice(0, headerRows);
  const body = rows.slice(headerRows);

  return (
    <div className={styles.tableWrap} data-lenis-prevent="">
      <table className={styles.table}>
        {head.length ? (
          <thead>
            {head.map((r, ri) => (
              <tr key={ri}>
                {(r.cells ?? []).map((raw, ci) => {
                  const { node, span, style } = cell(raw);
                  return (
                    <th key={ci} scope="col" {...span} style={style}>
                      {node}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
        ) : null}
        <tbody>
          {body.map((r, ri) => (
            <tr key={ri}>
              {(r.cells ?? []).map((raw, ci) => {
                const { node, span, style } = cell(raw);
                return ci < headerCols ? (
                  <th key={ci} scope="row" {...span} style={style}>
                    {node}
                  </th>
                ) : (
                  <td key={ci} {...span} style={style}>
                    {node}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Renders BlockNote JSON (event descriptions, bios, publication bodies) with the editorial
 * type styles. Server-safe, no editor code shipped. Unknown blocks keep their text.
 *
 * @example <BlocksRenderer blocks={event.description} />
 */
export function BlocksRenderer({ blocks, className, headingOffset = 1, size = 'md', wide, siteOrigin }: BlocksRendererProps) {
  if (!Array.isArray(blocks) || blocks.length === 0) return null;
  const ctx: Ctx = { offset: headingOffset, origin: (siteOrigin ?? SITE).replace(/\/+$/, '') };
  return (
    <div className={cn(styles.prose, size === 'sm' && styles.sm, size === 'lg' && styles.lg, wide && styles.wide, className)}>
      {renderBlocks(blocks as RawBlock[], ctx)}
    </div>
  );
}

/** True when a BlockNote document has any visible content (skip empty "About" sections). */
export function hasBlocks(blocks: Blocks | null | undefined): boolean {
  if (!Array.isArray(blocks)) return false;
  return (blocks as RawBlock[]).some(
    (b) => b && (hasText(b.content) || ['image', 'video', 'audio', 'file', 'table', 'codeBlock', 'divider'].includes(b.type ?? '') || !!b.children?.length),
  );
}
