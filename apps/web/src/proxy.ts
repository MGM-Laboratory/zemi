import { SESSION_COOKIE } from '@zemi/shared';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Next 16 request proxy (the old middleware.ts).
 *
 * Only runs for /admin pages (see `config.matcher`), so /api/v1 uploads, SSE streams, /media,
 * /_next assets and static files never pass through it and are never buffered.
 *
 * - No `zemi_session` cookie on an /admin page: redirect to /admin/login?next=<path>.
 *   This is a cheap first line; the dashboard layout still validates the session with the API.
 * - Always forwards the current path as `x-zemi-pathname` so server components can build
 *   `?next=` links (see `currentAdminPath()` in lib/admin/server.ts).
 *
 * It never redirects away from /admin/login when a cookie exists: a stale cookie would loop.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isLogin = pathname === '/admin/login' || pathname.startsWith('/admin/login/');

  if (!isLogin && !request.cookies.get(SESSION_COOKIE)?.value) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/login';
    url.search = '';
    if (pathname !== '/admin' || search) url.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  const headers = new Headers(request.headers);
  headers.set('x-zemi-pathname', `${pathname}${search}`);
  const response = NextResponse.next({ request: { headers } });
  // Admin pages are private: keep them out of shared caches and search engines.
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

export const config = {
  // Admin pages only. Anything with a file extension under /admin is skipped too.
  matcher: ['/admin', '/admin/((?!.*\\.[a-zA-Z0-9]+$).*)'],
};
