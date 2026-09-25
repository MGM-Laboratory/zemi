import sanitizeHtml from 'sanitize-html';

/**
 * Admin broadcast HTML goes to every registrant's inbox, so it is sanitized with a small allowlist:
 * text formatting, lists, headings, quotes, links (http, https, mailto) and https images. No styles,
 * classes, scripts, forms, iframes or event handlers. Brand inline styles are added back per tag because
 * email clients ignore <style> blocks.
 */

const INK = '#0e1116';
const INK2 = '#3b4150';
const BLUE = '#3a6dc5';
const LINE = '#ececea';
const BODY = "'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible', Arial, Helvetica, sans-serif";
const DISPLAY = "'Recursive', 'Arial Black', Arial, Helvetica, sans-serif";

const styled =
  (style: string) =>
  (tagName: string, attribs: sanitizeHtml.Attributes): sanitizeHtml.Tag => ({ tagName, attribs: { ...attribs, style } });

export const BROADCAST_SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li', 'h2', 'h3', 'blockquote', 'hr', 'img', 'code', 'span'],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel', 'style'],
    img: ['src', 'alt', 'width', 'height', 'style'],
    '*': ['style'],
  },
  // Only the styles we add below survive: sanitize-html validates style values against this map.
  allowedStyles: {
    '*': {
      margin: [/^[\d\s.pxem-]+$/],
      padding: [/^[\d\s.pxem-]+$/],
      color: [/^#[0-9a-f]{3,6}$/i],
      'font-family': [/^[\w\s',-]+$/],
      'font-size': [/^\d+px$/],
      'font-weight': [/^\d+$/],
      'line-height': [/^[\d.]+(px)?$/],
      'text-decoration': [/^underline$/],
      'border-left': [/^[\w\s#]+$/],
      'border-top': [/^[\w\s#]+$/],
      border: [/^[\w\s#]+$/],
      'max-width': [/^\d+%$/],
      height: [/^auto$/],
      display: [/^block$/],
      'border-radius': [/^\d+px$/],
      'padding-left': [/^\d+px$/],
    },
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['https'] },
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  // Admin-written style attributes are dropped first (transformTags replace them with ours).
  transformTags: {
    p: styled(`margin: 0 0 14px; font-family: ${BODY}; font-size: 16px; line-height: 25px; color: ${INK2}`),
    li: styled(`margin: 0 0 6px; font-family: ${BODY}; font-size: 16px; line-height: 25px; color: ${INK2}`),
    ul: styled('margin: 0 0 14px; padding-left: 22px'),
    ol: styled('margin: 0 0 14px; padding-left: 22px'),
    h2: styled(`margin: 22px 0 10px; font-family: ${DISPLAY}; font-size: 22px; font-weight: 800; line-height: 28px; color: ${INK}`),
    h3: styled(`margin: 18px 0 8px; font-family: ${DISPLAY}; font-size: 18px; font-weight: 800; line-height: 24px; color: ${INK}`),
    blockquote: styled(`margin: 0 0 14px; padding: 4px 0 4px 14px; border-left: 3px solid ${BLUE}; color: ${INK2}`),
    hr: styled(`border: none; border-top: 1px solid ${LINE}; margin: 22px 0`),
    img: styled('display: block; max-width: 100%; height: auto; border-radius: 12px; margin: 0 0 14px'),
    code: styled(`font-family: 'Courier New', Courier, monospace; font-size: 15px; color: ${INK}`),
    span: (tagName) => ({ tagName, attribs: {} }),
    a: (tagName, attribs) => ({
      tagName,
      attribs: { href: attribs.href ?? '', ...(attribs.title ? { title: attribs.title } : {}), target: '_blank', rel: 'noopener noreferrer', style: `color: ${BLUE}; text-decoration: underline` },
    }),
    strong: (tagName) => ({ tagName, attribs: {} }),
    b: () => ({ tagName: 'strong', attribs: {} }),
    em: (tagName) => ({ tagName, attribs: {} }),
    i: () => ({ tagName: 'em', attribs: {} }),
  },
  // Drop links whose href was stripped (javascript: and friends).
  exclusiveFilter: (frame) => frame.tag === 'a' && !frame.attribs.href,
};

export function sanitizeBroadcastHtml(html: string): string {
  return sanitizeHtml(html, BROADCAST_SANITIZE).trim();
}

/** Plain text with any HTML stripped, for checking that a broadcast isn't empty after sanitizing. */
export function textOf(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** `{{name}}` / `{{firstName}}` placeholders, filled per recipient (escaped). */
export function personalize(html: string, vars: { firstName: string; fullName: string }): string {
  return html
    .replace(/\{\{\s*(first_?name|firstName|name)\s*\}\}/gi, escapeHtml(vars.firstName))
    .replace(/\{\{\s*(full_?name|fullName)\s*\}\}/gi, escapeHtml(vars.fullName));
}
