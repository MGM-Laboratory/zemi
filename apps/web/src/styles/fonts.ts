import { Atkinson_Hyperlegible_Next, Recursive } from 'next/font/google';

/*
 * The two brand fonts, defined once. The root layout and app/global-error.tsx both import these,
 * so every route loads one set of files. (Two separate loader calls with different options each
 * ship and preload their own copy: global-error sits in every page's tree.)
 *
 * - `subsets` only picks what gets PRELOADED. The other subsets' @font-face rules stay in the CSS
 *   with their unicode-range, so a name with latin-ext letters still renders in the brand font:
 *   the browser fetches that file only when a page actually has such a letter.
 * - Recursive: only the axes we use. CASL (the casual loosen) and MONO (the mono labels and
 *   clocks). slnt and CRSV were never set anywhere (italics on the site are body text) and
 *   roughly doubled the file.
 */

export const recursive = Recursive({
  subsets: ['latin'],
  axes: ['CASL', 'MONO'],
  variable: '--font-recursive',
  display: 'swap',
});

export const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ['latin'],
  variable: '--font-atkinson',
  display: 'swap',
  // Next has no metric overrides for this 2025 font and retries (and warns) on every compile.
  adjustFontFallback: false,
  fallback: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
});
