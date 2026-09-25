import Link from 'next/link';
import '@/components/admin/admin.css';
import { AdminMark } from '@/components/admin/brand/admin-mark';
import { Character } from '@/components/admin/characters/character';

/**
 * Rendered when an admin page calls `notFound()` (a deleted event, a bad id).
 * It sits outside the dashboard shell, so it carries its own way back.
 */
export default function AdminNotFound() {
  return (
    <div className="zemi-admin flex min-h-dvh flex-col items-center justify-center gap-7 px-6 py-16 text-center">
      <Link href="/admin" aria-label="Back to the studio" className="rounded-xl p-1">
        <AdminMark size={34} />
      </Link>
      <div className="flex items-end gap-2" aria-hidden="true">
        <Character shape="square" mood="sleep" size={60} />
        <Character shape="circle" mood="look" follow size={46} />
        <Character shape="triangle" mood="oops" size={40} />
      </div>
      <div className="max-w-md">
        <p className="label text-ink-4">404</p>
        <h1 className="mt-2 font-display text-[clamp(2rem,5vw,3rem)] leading-none font-black tracking-[-0.04em]">Nothing on this shelf.</h1>
        <p className="mt-3 text-ink-3">It may have been moved or deleted, or the link has a typo. Old slugs still redirect on the public site, but admin links use ids.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Link
          href="/admin"
          className="inline-flex h-11 items-center rounded-full bg-ink px-5 text-[0.9375rem] font-medium text-white transition hover:bg-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Back to the overview
        </Link>
        <Link
          href="/admin/events"
          className="inline-flex h-11 items-center rounded-full border border-line-strong px-5 text-[0.9375rem] font-medium text-ink transition hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          All events
        </Link>
      </div>
    </div>
  );
}
