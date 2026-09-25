import type { Metadata } from 'next';
import { CaslHeading } from '@/components/motion/casl-heading';
import { PlayerDemo } from '@/components/public/player/demo/player-demo';
import { Eyebrow } from '@/components/public/ui/section-header';

export const metadata: Metadata = {
  title: 'Player',
  description: 'The Zemi media player, live and on demand.',
  robots: { index: false, follow: false },
};

const SECTIONS = [
  ['hls', 'HLS recording'],
  ['mp4', 'MP4 + captions'],
  ['live', 'Live'],
  ['states', 'States'],
] as const;

export default function PlayerStyleguidePage() {
  return (
    <div className="pb-24">
      <header className="container-page flex flex-col gap-6 pb-10 pt-[calc(var(--nav-h)+56px)]">
        <Eyebrow shape="triangle">Styleguide · player · not indexed</Eyebrow>
        <CaslHeading as="h1" size="xl" reveal className="max-w-[12ch]">
          Press play.
        </CaslHeading>
        <p className="text-body-l max-w-[44rem] text-ink-2">
          One player for Friday recordings and the live stream. HLS, MP4 and WebM, chapters, storyboard previews, reactions, and a slate for when
          the signal wanders off. Props and decisions live in{' '}
          <code className="mono rounded-md bg-surface-muted px-1.5 py-0.5 text-[0.9em]">docs/features/player.md</code>.
        </p>
        <nav aria-label="Player demos" className="flex flex-wrap gap-2">
          {SECTIONS.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              data-transition="off"
              className="inline-flex h-9 items-center rounded-full border border-line-strong px-3.5 text-[0.9375rem] font-semibold transition-colors hover:border-ink"
            >
              {label}
            </a>
          ))}
        </nav>
      </header>
      <PlayerDemo />
    </div>
  );
}
