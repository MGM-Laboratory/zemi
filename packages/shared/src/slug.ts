import { SLUG_MAX, SLUG_PATTERN } from './constants.js';

export function slugify(input: string, max = SLUG_MAX): string {
  const s = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
  return s || 'untitled';
}

export function isValidSlug(s: string): boolean {
  return s.length > 0 && s.length <= SLUG_MAX && SLUG_PATTERN.test(s);
}
