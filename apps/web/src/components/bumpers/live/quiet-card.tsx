import type { ReactNode } from 'react';
import { StaticMark } from '../parts/shapes';

/**
 * The only thing a /bumpers page paints when something is off (a replaced link, a bad address,
 * a crash): a small dark card in the middle, so an OBS source never shows the public site or a
 * white page over the camera.
 */
export function QuietCard({ title, children, action, eyebrow = 'Zemi bumpers' }: { title: string; children?: ReactNode; action?: ReactNode; eyebrow?: string }) {
  return (
    <div className="fixed inset-0 grid place-items-center p-4" data-quiet-card="" style={{ fontSize: 'clamp(15px, 1.05vw, 24px)' }}>
      <div role="status" className="w-full max-w-[29em] rounded-[1.6em] bg-[#0e1116]/90 px-[1.5em] py-[1.4em] text-[#f5f6f8] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)] ring-1 ring-white/10 sm:px-[1.75em]">
        <div className="flex items-center gap-[0.75em]">
          <span className="block size-[2em] shrink-0">
            <StaticMark />
          </span>
          <span className="mono text-[0.75em] tracking-[0.08em] text-white/60 uppercase">{eyebrow}</span>
        </div>
        <h1 className="mt-[0.9em] font-display text-[1.7em] leading-tight font-extrabold tracking-[-0.025em] [font-variation-settings:'CASL'_0.3]">{title}</h1>
        {children ? <div className="mt-[0.5em] text-[1em] leading-relaxed text-white/75">{children}</div> : null}
        {action ? <div className="mt-[1.25em]">{action}</div> : null}
      </div>
    </div>
  );
}

export const REVOKED_COPY: Record<'rotated' | 'deleted' | 'archived', { title: string; body: string }> = {
  rotated: { title: 'This link was replaced.', body: 'Grab the new one in Zemi Studio.' },
  deleted: { title: 'This show was deleted.', body: 'Pick another show in Zemi Studio and paste its link here.' },
  archived: { title: 'This show is archived.', body: 'Restore it in Zemi Studio and this link works again.' },
};
