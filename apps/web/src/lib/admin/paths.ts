/**
 * Sanitize a `?next=` redirect target so the login page can never bounce people off-site.
 * Only same-origin admin paths are allowed, and never the login page itself.
 *
 * @example safeAdminNext(searchParams.next) // '/admin/events/123' or '/admin'
 */
export function safeAdminNext(raw: string | string[] | null | undefined, fallback = '/admin'): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== 'string') return fallback;
  let decoded = value.trim();
  try {
    // Tolerate double-encoded values like %2Fadmin%2Fevents.
    if (/%2f/i.test(decoded)) decoded = decodeURIComponent(decoded);
  } catch {
    return fallback;
  }
  if (!decoded.startsWith('/') || decoded.startsWith('//') || decoded.includes('\\')) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(decoded)) return fallback;
  if (decoded !== '/admin' && !decoded.startsWith('/admin/') && !decoded.startsWith('/admin?')) return fallback;
  if (decoded === '/admin/login' || decoded.startsWith('/admin/login/') || decoded.startsWith('/admin/login?')) return fallback;
  return decoded;
}

/** Public site URL for a resource, used in previews and "View on site" links. */
export const publicPaths = {
  event: (slug: string) => `/events/${slug}`,
  speaker: (slug: string) => `/speakers/${slug}`,
  publication: (slug: string) => `/publications/${slug}`,
  ticket: (token: string) => `/tickets/${token}`,
} as const;

/** Absolute public site origin (no trailing slash). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3300').replace(/\/$/, '');
