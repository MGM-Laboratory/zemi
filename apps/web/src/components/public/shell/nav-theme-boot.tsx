'use client';

import { useSyncExternalStore } from 'react';
import { NAV_THEME_BOOT_SCRIPT } from './use-nav-theme';

const noop = () => () => {};

/**
 * Pre-paint nav theme (layout only, after the page and the footer). A page that opens on a dark
 * hero gets a paper-tone nav in the very first paint, before hydration. Renders only into the
 * server HTML: client renders skip it (React warns about script tags rendered on the client).
 */
export function NavThemeBootScript() {
  const isServerOrHydrating = useSyncExternalStore(noop, () => false, () => true);
  if (!isServerOrHydrating) return null;
  return <script dangerouslySetInnerHTML={{ __html: NAV_THEME_BOOT_SCRIPT }} />;
}
