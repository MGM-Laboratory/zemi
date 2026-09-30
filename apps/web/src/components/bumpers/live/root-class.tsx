'use client';

import { useServerInsertedHTML } from 'next/navigation';
import { useEffect, useRef } from 'react';

/** Runs while the document parses, before first paint: the page background goes transparent for OBS. */
const TRANSPARENT = "document.documentElement.classList.add('zemi-bumpers')";

/**
 * `html.zemi-bumpers` (transparent page, no dev overlays) on every /bumpers page.
 *
 * - On the server a tiny inline script goes into the HTML stream (outside the React tree, so React
 *   never tries to render a <script> on the client), which sets the class before first paint.
 * - On the client the effect keeps it after a client-side navigation and removes it on the way out.
 */
export function BumpersRootClass() {
  const sent = useRef(false);
  useServerInsertedHTML(() => {
    if (sent.current) return null;
    sent.current = true;
    return <script dangerouslySetInnerHTML={{ __html: TRANSPARENT }} />;
  });
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('zemi-bumpers');
    return () => html.classList.remove('zemi-bumpers');
  }, []);
  return null;
}
