import { describe, expect, it } from 'vitest';
import { isExternalHref, linkKey, safeHref, safeLinkItems } from './safe-href';

describe('safeHref', () => {
  it('allows http(s), mailto and tel, trimmed', () => {
    expect(safeHref('https://labmgm.org')).toBe('https://labmgm.org');
    expect(safeHref('  http://example.com/a?b=1 ')).toBe('http://example.com/a?b=1');
    expect(safeHref('mailto:zemi@labmgm.org')).toBe('mailto:zemi@labmgm.org');
    expect(safeHref('tel:+6281213151515')).toBe('tel:+6281213151515');
    expect(safeHref('HTTPS://Example.com')).toBe('HTTPS://Example.com');
  });

  it('drops scripts, data, relative and protocol-relative links', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('JaVaScRiPt:alert(1)')).toBeNull();
    expect(safeHref('java\tscript:alert(1)')).toBeNull();
    expect(safeHref('java\nscript:alert(1)')).toBeNull();
    expect(safeHref('\u0001javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeHref('vbscript:msgbox(1)')).toBeNull();
    expect(safeHref('//evil.example')).toBeNull();
    expect(safeHref('/events')).toBeNull();
    expect(safeHref('labmgm.org')).toBeNull();
    expect(safeHref('https://')).toBeNull();
    expect(safeHref('https:x')).toBeNull();
    expect(safeHref('mailto:')).toBeNull();
    expect(safeHref('')).toBeNull();
    expect(safeHref(null)).toBeNull();
    expect(safeHref(undefined)).toBeNull();
  });

  it('knows which links open in a new tab', () => {
    expect(isExternalHref('https://x.org/')).toBe(true);
    expect(isExternalHref('mailto:a@b.co')).toBe(false);
    expect(isExternalHref('tel:+62')).toBe(false);
  });
});

describe('safeLinkItems', () => {
  it('filters, normalizes and dedupes', () => {
    const items = safeLinkItems([
      { url: 'https://labmgm.org', label: 'Lab' },
      { url: 'javascript:alert(1)', label: 'bad' },
      { url: 'https://www.labmgm.org/', label: 'Lab again' },
      { url: 'tel:+62812', label: 'Call' },
    ]);
    expect(items.map((i) => i.url)).toEqual(['https://labmgm.org', 'tel:+62812']);
    expect(items[0]!.label).toBe('Lab');
  });

  it('compares links loosely', () => {
    expect(linkKey('https://www.labmgm.org/')).toBe(linkKey('http://labmgm.org'));
    expect(linkKey('https://github.com/a')).not.toBe(linkKey('https://github.com/b'));
  });
});
