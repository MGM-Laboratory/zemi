import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SHAPE_CHARACTER, SHAPE_COLORS, SHAPE_ORDER } from '@zemi/shared';
import { Character } from '@/components/brand/character';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { ZemiLogo } from '@/components/brand/zemi-logo';
import { ZemiWordmark } from '@/components/brand/zemi-wordmark';
import { CaslHeading } from '@/components/motion/casl-heading';
import { HighlightSwipe } from '@/components/motion/highlight-swipe';
import { Marquee } from '@/components/motion/marquee';
import { Parallax, Reveal } from '@/components/motion/reveal';
import { stagger } from '@/components/motion/stagger';
import { BlocksRenderer } from '@/components/public/media/blocks-renderer';
import { ZemiImage } from '@/components/public/media/zemi-image';
import { Avatar, AvatarStack } from '@/components/public/ui/avatar';
import { Card, CardLink } from '@/components/public/ui/card';
import { Chip, LiveBadge, StatusBadge } from '@/components/public/ui/chip';
import { ApiUnavailable, EmptyState } from '@/components/public/ui/empty-state';
import { Eyebrow, SectionHeader } from '@/components/public/ui/section-header';
import { TextLink } from '@/components/public/ui/text-link';
import { availableModels } from '@/components/three/models-server';
import {
  ButtonsDemo,
  CharacterGrid,
  CharacterPlayground,
  ClockDemo,
  ConfettiDemo,
  FilterChipsDemo,
  FormDemo,
  MagneticDemo,
  MarkDemo,
  NavPillDemo,
  NumbersDemo,
  OverlaysDemo,
  SplitDemo,
  ToneDemo,
} from './_components/demos';
import { blocksFixture, cupImage, eventFixtures, laptopImage } from './_components/fixtures';
import { BackdropDemo, DistortDemo, PropsDemo, ThreeCharactersDemo } from './_components/three-demo';

export const metadata: Metadata = {
  title: 'Styleguide',
  description: 'The Zemi public design system, live.',
  robots: { index: false, follow: false },
};

const SECTIONS = [
  ['color', 'Color'],
  ['type', 'Type'],
  ['logo', 'Logo'],
  ['characters', 'Characters'],
  ['three', '3D'],
  ['motion', 'Motion'],
  ['clock', 'Friday clock'],
  ['ui', 'UI'],
  ['media', 'Media'],
  ['blocks', 'Rich text'],
] as const;

const SWATCHES: Array<{ group: string; items: Array<[string, string, string?]> }> = [
  { group: 'Surfaces', items: [['bg / surface', '#ffffff'], ['surface-muted', '#f7f7f5'], ['surface-inverse', '#0e1116', 'light']] },
  {
    group: 'Brand',
    items: [
      ['blue', '#3a6dc5', 'light'],
      ['red', '#f94141', 'light'],
      ['yellow', '#f7bf33'],
      ['green', '#0f8657', 'light'],
    ],
  },
  { group: 'Tints', items: [['blue-50', '#ecf1fa'], ['red-50', '#fee5e5'], ['yellow-50', '#fef6e0'], ['green-50', '#e2f1ea']] },
  {
    group: 'Deep',
    items: [
      ['blue-600', '#2f5aa6', 'light'],
      ['red-600', '#d92f2f', 'light'],
      ['yellow-600', '#d99e12'],
      ['green-600', '#0b6b45', 'light'],
    ],
  },
  {
    group: 'Ink',
    items: [
      ['ink', '#0e1116', 'light'],
      ['ink-2', '#3b4150', 'light'],
      ['ink-3', '#6b7280', 'light'],
      ['ink-4', '#9aa1ad'],
      ['line', '#ececea'],
      ['line-strong', '#d8d8d2'],
      ['graph', '#eef1f6'],
    ],
  },
];

function Block({ id, eyebrow, title, children, description }: { id: string; eyebrow: string; title: string; children: ReactNode; description?: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 border-t border-line py-[clamp(56px,9vh,112px)]">
      <SectionHeader eyebrow={eyebrow} title={title} size="m" description={description} />
      <div className="mt-10 flex flex-col gap-10">{children}</div>
    </section>
  );
}

function Sub({ title, children, note }: { title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="label text-ink-3">{title}</h3>
        {note ? <p className="text-[0.875rem] text-ink-4">{note}</p> : null}
      </div>
      {children}
    </div>
  );
}

export default function StyleguidePage() {
  const { upcoming, live } = eventFixtures();
  const models = availableModels();

  return (
    <div className="container-page pb-24 pt-[calc(var(--nav-h)+56px)]">
      <header className="flex flex-col gap-6 pb-12">
        <Eyebrow shape="square">Living styleguide · not indexed</Eyebrow>
        <CaslHeading as="h1" size="xl" reveal className="max-w-[12ch]">
          The Zemi kit.
        </CaslHeading>
        <p className="text-body-l max-w-[42rem] text-ink-2">
          Everything the public site is built from, running for real. If it looks off here, it looks off everywhere. Props and gotchas live in{' '}
          <code className="mono rounded-md bg-surface-muted px-1.5 py-0.5 text-[0.9em]">docs/foundation/web-public.md</code>.
        </p>
        <nav aria-label="Styleguide sections" className="flex flex-wrap gap-2">
          {SECTIONS.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="inline-flex h-9 items-center rounded-full border border-line-strong px-3.5 text-[0.9375rem] font-semibold transition-colors hover:border-ink"
            >
              {label}
            </a>
          ))}
        </nav>
      </header>

      <Block id="color" eyebrow="Tokens" title="Color" description="White is the page. Color is highlighter and toy blocks. Yellow never carries text.">
        {SWATCHES.map((g) => (
          <Sub key={g.group} title={g.group}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {g.items.map(([name, hex, light]) => (
                <div key={name} className="overflow-hidden rounded-[20px] border border-line">
                  <div className="grid h-24 place-items-end p-3" style={{ background: hex, color: light ? '#fff' : '#0e1116' }}>
                    <span className="mono text-[0.75rem] opacity-80">{hex}</span>
                  </div>
                  <p className="px-3 py-2 text-[0.875rem] font-semibold">{name}</p>
                </div>
              ))}
            </div>
          </Sub>
        ))}
        <Sub title="Shapes and their colors">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SHAPE_ORDER.map((s) => (
              <div key={s} className="flex items-center gap-4 rounded-[20px] border border-line p-4">
                <ShapeIcon shape={s} size={40} title={s} />
                <div>
                  <p className="font-bold">{SHAPE_CHARACTER[s].name}</p>
                  <p className="mono text-[0.75rem] text-ink-3">
                    {s} · {SHAPE_COLORS[s]}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Sub>
      </Block>

      <Block id="type" eyebrow="Recursive + Atkinson Hyperlegible Next" title="Type" description="Display headings loosen their CASL axis on hover and as they scroll in. Body stays put.">
        <Sub title="display-xl · CaslHeading" note="hover it">
          <CaslHeading as="p" size="xl">
            Fridays.
          </CaslHeading>
        </Sub>
        <Sub title="display-l">
          <CaslHeading as="p" size="l">
            Research is lonely.
          </CaslHeading>
        </Sub>
        <Sub title="display-m">
          <CaslHeading as="p" size="m">
            Coffee is on the left.
          </CaslHeading>
        </Sub>
        <Sub title="title">
          <CaslHeading as="p" size="title">
            Robots that ask for help
          </CaslHeading>
        </Sub>
        <Sub title="body-l / body / small">
          <div className="flex max-w-[44rem] flex-col gap-3">
            <p className="text-body-l">Every Friday we pull up chairs and talk about the stuff that is not done yet.</p>
            <p>
              Master&apos;s, PhD, undergrads. Same table. Bring a half-baked idea and <HighlightSwipe>leave with three questions</HighlightSwipe> you didn&apos;t have before.
            </p>
            <p className="text-[0.875rem] text-ink-3">Small print: the coffee machine is still broken. We know.</p>
          </div>
        </Sub>
        <Sub title="mono · label">
          <div className="flex flex-wrap items-center gap-6">
            <span className="mono text-2xl">13:15 to 15:15 WIB</span>
            <span className="mono text-xl">ZM-7K3F9Q</span>
            <span className="label text-ink-3">Fri, 3 Oct 2026</span>
          </div>
        </Sub>
      </Block>

      <Block id="logo" eyebrow="components/brand" title="Logo" description="The mark is four shapes in a 2x2 grid. The wordmark is live text with an idea dot that keeps changing its mind.">
        <Sub title="ZemiMark variants">
          <MarkDemo />
        </Sub>
        <Sub title="Tones">
          <ToneDemo />
        </Sub>
        <Sub title="ZemiWordmark" note="hover: CASL eases to 1 and the dot cycles">
          <div className="flex flex-wrap items-end gap-10">
            <ZemiWordmark className="text-[5rem] sm:text-[7rem]" />
            <ZemiWordmark className="text-[3rem]" />
            <span className="rounded-[20px] bg-surface-inverse px-6 py-4 text-white">
              <ZemiWordmark className="text-[3rem]" />
            </span>
          </div>
        </Sub>
        <Sub title="ZemiLogo lockup" note="collapses to the mark under 380px">
          <div className="flex flex-wrap items-center gap-10">
            <ZemiLogo className="text-[3rem]" />
            <ZemiLogo className="text-[1.6rem]" />
            <span className="rounded-[20px] bg-surface-inverse px-6 py-4 text-white">
              <ZemiLogo className="text-[2rem]" tone="paper" />
            </span>
          </div>
        </Sub>
        <Sub title="ShapeIcon">
          <div className="flex flex-wrap items-center gap-6">
            {SHAPE_ORDER.map((s) => (
              <ShapeIcon key={s} shape={s} size={32} />
            ))}
            {SHAPE_ORDER.map((s) => (
              <ShapeIcon key={`c-${s}`} shape={s} size={24} color="current" className="text-ink-3" />
            ))}
          </div>
        </Sub>
      </Block>

      <Block id="characters" eyebrow="components/brand/character" title="Characters" description="Two ink eyes, no mouths, no limbs. They blink every 3 to 6 seconds and keep an eye on your pointer.">
        <CharacterPlayground />
        <CharacterGrid />
        <Sub title="EmptyState">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[28px] border border-line">
              <EmptyState shape="square" mood="thinking" title="No Fridays match that." body="Try a different tag, or clear the search." friend="triangle" />
            </div>
            <div className="rounded-[28px] border border-line">
              <ApiUnavailable what="the schedule" />
            </div>
          </div>
        </Sub>
      </Block>

      <Block id="three" eyebrow="components/three" title="3D" description="Soft toy clay on white. Lazy mounted, paused offscreen, still under reduced motion, 2D characters when WebGL is missing.">
        <ThreeCharactersDemo />
        <Sub title="ModelProp" note={models.length ? `${models.length} GLBs in /public/models` : 'no GLBs yet, primitives stand in'}>
          <PropsDemo models={models} />
        </Sub>
        <Sub title="ShaderBackdrop">
          <BackdropDemo />
        </Sub>
        <Sub title="DistortImage" note="hover the covers">
          <DistortDemo />
        </Sub>
      </Block>

      <Block id="motion" eyebrow="components/motion" title="Motion" description="Smooth scroll is Lenis on the GSAP ticker. Everything here calms down under reduced motion.">
        <Sub title="SplitReveal">
          <SplitDemo />
        </Sub>
        <Sub title="Reveal + stagger">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SHAPE_ORDER.map((s, i) => (
              <Reveal key={s} delay={stagger(i)} className="grid aspect-square place-items-center rounded-[24px]" style={{ background: SHAPE_COLORS[s] }}>
                <Character shape={s} size={56} color="#ffffff" track={false} />
              </Reveal>
            ))}
          </div>
        </Sub>
        <Sub title="Parallax">
          <div className="relative flex h-64 items-center justify-center gap-10 overflow-hidden rounded-[28px] bg-surface-muted">
            <Parallax speed={0.35}>
              <Character shape="arch" size={96} />
            </Parallax>
            <Parallax speed={-0.2}>
              <Character shape="triangle" size={72} />
            </Parallax>
            <Parallax speed={0.1}>
              <Character shape="circle" size={120} />
            </Parallax>
          </div>
        </Sub>
        <Sub title="Marquee" note="scroll to speed it up; hover to pause">
          <div className="rounded-[28px] border border-line py-6">
            <Marquee label="Things people bring">
              {['Half a thesis', 'A weird plot', 'Three hunches', 'One good question', 'Cold coffee'].map((w, i) => (
                <span key={w} className="display flex items-center gap-12 text-[clamp(2rem,5vw,4rem)]">
                  {w}
                  <ShapeIcon shape={SHAPE_ORDER[i % 4]!} size="0.6em" />
                </span>
              ))}
            </Marquee>
          </div>
        </Sub>
        <Sub title="Magnetic">
          <MagneticDemo />
        </Sub>
        <Sub title="Numbers">
          <NumbersDemo />
        </Sub>
        <Sub title="HighlightSwipe">
          <p className="text-display-m display max-w-[20ch]">
            Bring the <HighlightSwipe>messy version</HighlightSwipe>. Leave with <HighlightSwipe color="blue" delay={300}>better questions</HighlightSwipe>.
          </p>
        </Sub>
        <Sub title="Shape confetti">
          <ConfettiDemo />
        </Sub>
      </Block>

      <Block id="clock" eyebrow="components/public/shell/friday-clock" title="Friday clock" description="The signature: story time from 13:15 to 15:15. The home page drives it with scroll progress.">
        <ClockDemo />
      </Block>

      <Block id="ui" eyebrow="components/public/ui" title="UI" description="Big, friendly, keyboard-first. Every interactive thing responds.">
        <Sub title="Button">
          <ButtonsDemo />
        </Sub>
        <Sub title="Chip · StatusBadge · LiveBadge">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Chip>Neutral</Chip>
              <Chip tone="outline">Outline</Chip>
              <Chip tone="ink">Ink</Chip>
              <Chip tone="blue" shape>
                Hybrid
              </Chip>
              <Chip tone="red" shape>
                Hunch
              </Chip>
              <Chip tone="yellow" shape>
                Data
              </Chip>
              <Chip tone="green" shape>
                Checked in
              </Chip>
              <Chip mono tone="outline">
                Zemi #42
              </Chip>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status="scheduled" />
              <StatusBadge status="ongoing" />
              <StatusBadge status="past" />
              <StatusBadge status="cancelled" />
              <StatusBadge status="ongoing" size="md" />
              <LiveBadge />
            </div>
            <FilterChipsDemo />
          </div>
        </Sub>
        <Sub title="Nav pill states">
          <NavPillDemo upcoming={upcoming} live={live} />
        </Sub>
        <Sub title="SectionHeader">
          <div className="rounded-[28px] border border-line p-6 sm:p-10">
            <SectionHeader eyebrow="Coming up" eyebrowShape="triangle" title="This Friday" description="One talk, one coffee, a lot of questions." size="m" />
          </div>
        </Sub>
        <Sub title="Card" note="hover: lift, tilt, glare">
          <div className="grid gap-4 md:grid-cols-3">
            {[upcoming, live].map((e) => (
              <Card key={e.id} accent={e.accent} className="flex flex-col gap-4 p-3" cursor="open">
                <ZemiImage image={e.cover} aspect="4/5" sizes="(min-width: 768px) 30vw, 100vw" className="rounded-[20px]" />
                <div className="flex flex-col gap-2 px-2 pb-3">
                  <StatusBadge status={e.status} />
                  <CardLink href="#ui" className="display text-title">
                    {e.title}
                  </CardLink>
                  <AvatarStack people={e.speakers.map((s) => ({ name: s.fullName, image: s.avatar }))} />
                </div>
              </Card>
            ))}
            <Card graph tilt={false} className="flex flex-col justify-between gap-6 p-6">
              <p className="label text-ink-3">graph paper, no tilt</p>
              <p className="display text-title">Work in progress surfaces only.</p>
            </Card>
          </div>
        </Sub>
        <Sub title="Avatar">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name="Nadia Putri" image={cupImage} size={64} />
            {['Nadia Putri', 'Arif Wicaksono', 'Sari Dewi', 'Budi', 'Rina Kartika Sari'].map((n) => (
              <Avatar key={n} name={n} size={56} />
            ))}
            <AvatarStack
              people={['Nadia Putri', 'Arif Wicaksono', 'Sari Dewi', 'Budi', 'Rina', 'Tono'].map((name) => ({ name }))}
              size={40}
            />
          </div>
        </Sub>
        <Sub title="Fields">
          <FormDemo />
        </Sub>
        <Sub title="Dialog · Sheet · Tooltip">
          <OverlaysDemo />
        </Sub>
        <Sub title="TextLink">
          <p className="max-w-[40rem]">
            Inline links look like <TextLink href="/about">this internal one</TextLink> or{' '}
            <TextLink href="https://labmgm.org">this one that opens MGM Lab</TextLink>.
          </p>
        </Sub>
      </Block>

      <Block id="media" eyebrow="components/public/media" title="Media" description="ZemiImage: picture with AVIF and WebP, dominant color, LQIP blur, fade in. Null-safe.">
        <div className="grid gap-4 sm:grid-cols-3">
          <ZemiImage image={laptopImage} aspect="4/5" sizes="(min-width: 640px) 30vw, 100vw" className="rounded-[24px]" />
          <ZemiImage image={cupImage} aspect="4/5" sizes="(min-width: 640px) 30vw, 100vw" className="rounded-[24px]" />
          <ZemiImage image={null} aspect="4/5" className="rounded-[24px]" placeholderShape="arch" />
        </div>
      </Block>

      <Block id="blocks" eyebrow="components/public/media/blocks-renderer" title="Rich text" description="BlockNote JSON from the admin editor, set in the brand's editorial style.">
        <div className="rounded-[28px] border border-line p-6 sm:p-10">
          <BlocksRenderer blocks={blocksFixture} />
        </div>
      </Block>

      <section data-nav-theme="dark" className="-mx-[var(--page-margin)] rounded-[28px] bg-surface-inverse px-[var(--page-margin)] py-24 text-white">
        <Eyebrow inverse shape="arch">
          data-nav-theme=&quot;dark&quot;
        </Eyebrow>
        <CaslHeading size="l" className="mt-4 max-w-[16ch] text-white">
          Scroll the nav over me: it flips to paper.
        </CaslHeading>
      </section>
    </div>
  );
}
