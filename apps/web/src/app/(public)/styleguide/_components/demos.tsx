'use client';

import { Bell, Copy, Search } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { SHAPE_CHARACTER, SHAPE_ORDER, type EventCard, type ShapeName } from '@zemi/shared';
import { Character, type CharacterHandle, type CharacterMood } from '@/components/brand/character';
import { ZemiMark, type MarkTone, type MarkVariant } from '@/components/brand/zemi-mark';
import { CaslHeading } from '@/components/motion/casl-heading';
import { CountUp } from '@/components/motion/count-up';
import { Magnetic } from '@/components/motion/magnetic';
import { shapeConfetti, shapeConfettiCannons } from '@/components/motion/shape-confetti';
import { SplitReveal } from '@/components/motion/split-reveal';
import { TickingDigits } from '@/components/motion/ticking-digits';
import { FridayClock } from '@/components/public/shell/friday-clock';
import { NextEventPill } from '@/components/public/shell/next-event-pill';
import { Button, IconButton } from '@/components/public/ui/button';
import { ChipButton } from '@/components/public/ui/chip';
import { Dialog, Sheet, Tooltip } from '@/components/public/ui/dialog';
import { Choice, Field, FormCard, Input, Select, Textarea } from '@/components/public/ui/field';

/* ------------------------------------------------------------------ logo */

const VARIANTS: MarkVariant[] = ['idle', 'shuffle', 'loading', 'cheer', 'sleep'];

export function MarkDemo() {
  const [tick, setTick] = useState(0);
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {VARIANTS.map((v) => (
          <MarkTile key={v} variant={v} trigger={tick} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" shape="circle" onClick={() => setTick((t) => t + 1)}>
          Replay one-shots
        </Button>
        <p className="text-[0.9375rem] text-ink-3">Hover the idle mark to shuffle, click it to cheer.</p>
      </div>
    </div>
  );
}

function MarkTile({ variant, trigger }: { variant: MarkVariant; trigger: number }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-[24px] border border-line bg-white p-6">
      <ZemiMark size={72} variant={variant} loop={variant === 'shuffle' || variant === 'cheer'} interactive={variant === 'idle'} trigger={trigger} />
      <p className="label text-ink-3">{variant}</p>
    </div>
  );
}

export function ToneDemo() {
  const tones: Array<{ tone: MarkTone; bg: string; fg: string }> = [
    { tone: 'color', bg: 'bg-white border border-line', fg: 'text-ink' },
    { tone: 'ink', bg: 'bg-surface-muted', fg: 'text-ink' },
    { tone: 'paper', bg: 'bg-surface-inverse', fg: 'text-white' },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {tones.map((t) => (
        <div key={t.tone} className={`flex flex-col items-center gap-3 rounded-[24px] p-6 ${t.bg} ${t.fg}`}>
          <ZemiMark size={64} tone={t.tone} interactive />
          <p className="label opacity-60">tone {t.tone}</p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ characters */

const MOODS: CharacterMood[] = ['idle', 'happy', 'sleepy', 'surprised', 'thinking'];

export function CharacterGrid() {
  return (
    <div className="overflow-x-auto rounded-[28px] border border-line" data-lenis-prevent="">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr>
            <th className="label p-4 text-left text-ink-3" />
            {MOODS.map((m) => (
              <th key={m} className="label p-4 text-ink-3">
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SHAPE_ORDER.map((s, row) => (
            <tr key={s} className="border-t border-line">
              <th className="p-4 text-left">
                <span className="display block text-xl">{SHAPE_CHARACTER[s].name}</span>
                <span className="text-[0.875rem] font-normal text-ink-3">{SHAPE_CHARACTER[s].meaning}</span>
              </th>
              {MOODS.map((m, col) => (
                <td key={m} className="p-4 text-center">
                  <Character shape={s} mood={m} size={64} seed={row * 5 + col} className="mx-auto" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CharacterPlayground() {
  const refs = useRef<Array<CharacterHandle | null>>([]);
  const [mood, setMood] = useState<CharacterMood>('idle');
  const cheerAll = () => {
    refs.current.forEach((r, i) => setTimeout(() => r?.cheer(), i * 80));
    void shapeConfetti({ origin: { x: 0.5, y: 0.6 } });
  };
  return (
    <div className="flex flex-col gap-6 rounded-[28px] border border-line bg-white p-6 sm:p-10">
      <div className="flex flex-wrap items-end justify-center gap-[4vw]">
        {SHAPE_ORDER.map((s, i) => (
          <Character
            key={s}
            ref={(h) => {
              refs.current[i] = h;
            }}
            shape={s}
            mood={mood}
            size="clamp(72px, 14vw, 150px)"
            seed={i}
            label
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {MOODS.map((m) => (
          <ChipButton key={m} selected={mood === m} onClick={() => setMood(m)} size="sm">
            {m}
          </ChipButton>
        ))}
        <Button size="sm" onClick={cheerAll} shape="square" cursor="register">
          Cheer
        </Button>
      </div>
      <p className="text-center text-[0.9375rem] text-ink-3">Move the pointer: eyes follow. Tap one: it squashes.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ motion */

const LINES = [
  'Nobody expects slides to be perfect. Bring the messy version.',
  'Half a thesis is a great place to start.',
  'Three hunches and a weird plot? Perfect.',
];

export function SplitDemo() {
  const [k, setK] = useState(0);
  const [i, setI] = useState(0);
  return (
    <div className="flex flex-col gap-4">
      <SplitReveal key={k} as="p" className="display text-display-m max-w-[18ch]">
        {LINES[0]}
      </SplitReveal>
      <CaslHeading as="p" size="title" reveal className="max-w-[24ch]">
        {LINES[i % LINES.length]}
      </CaslHeading>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" shape="circle" onClick={() => setK((x) => x + 1)}>
          Replay
        </Button>
        <Button variant="secondary" size="sm" shape="triangle" onClick={() => setI((x) => x + 1)}>
          Change the text
        </Button>
      </div>
    </div>
  );
}

export function MagneticDemo() {
  return (
    <div className="flex flex-wrap items-center gap-6">
      <Magnetic strength={0.45}>
        <span className="display grid size-28 place-items-center rounded-full bg-yellow text-lg">Pull me</span>
      </Magnetic>
      <Button size="lg">Magnetic by default</Button>
    </div>
  );
}

export function NumbersDemo() {
  const [mins, setMins] = useState(13 * 60 + 14);
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="flex flex-col gap-2 rounded-[24px] border border-line p-6">
        <p className="label text-ink-3">CountUp</p>
        <p className="display text-display-m">
          <CountUp value={1284} suffix="+" />
        </p>
        <p className="text-ink-3">seats filled so far</p>
      </div>
      <div className="flex flex-col gap-3 rounded-[24px] border border-line p-6">
        <p className="label text-ink-3">TickingDigits</p>
        <TickingDigits value={fmt(mins)} className="text-display-m font-semibold" />
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" shape={false} onClick={() => setMins((m) => m + 1)}>
            +1 min
          </Button>
          <Button size="sm" variant="secondary" shape={false} onClick={() => setMins((m) => m + 47)}>
            +47 min
          </Button>
          <Button size="sm" variant="ghost" shape={false} onClick={() => setMins(13 * 60 + 14)}>
            Reset
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ConfettiDemo() {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <div className="flex flex-wrap gap-3">
      <Button ref={ref} onClick={() => void shapeConfetti({ from: ref.current })} shape="triangle">
        Burst from here
      </Button>
      <Button variant="secondary" onClick={() => void shapeConfettiCannons()} shape="circle">
        Side cannons
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ clock */

export function ClockDemo() {
  const [p, setP] = useState(0.35);
  const [fixed, setFixed] = useState(false);
  return (
    <div className="flex flex-col gap-5 rounded-[28px] border border-line bg-surface-muted p-6 sm:p-10">
      <FridayClock progress={p} position="static" />
      <label className="flex flex-col gap-2">
        <span className="label text-ink-3">progress {p.toFixed(2)}</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={p}
          onChange={(e) => setP(Number(e.target.value))}
          className="w-full max-w-md accent-ink"
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <Button size="sm" variant={fixed ? 'primary' : 'secondary'} shape="square" onClick={() => setFixed((f) => !f)}>
          {fixed ? 'Hide the sticky clock' : 'Show it sticky'}
        </Button>
      </div>
      <FridayClock progress={fixed ? p : null} />
    </div>
  );
}

/* ------------------------------------------------------------------ ui */

export function ButtonsDemo() {
  const [loading, setLoading] = useState(false);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" cursor="register">
          Save my seat
        </Button>
        <Button>Show my ticket</Button>
        <Button size="sm">Small</Button>
        <Button variant="secondary" shape="circle">
          Add to calendar
        </Button>
        <Button variant="ghost" shape={false} icon={<Search className="size-full" />}>
          Search
        </Button>
        <Button variant="accent" shape="arch">
          Watch live
        </Button>
        <Button variant="danger" shape={false}>
          Cancel my seat
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          loading={loading}
          onClick={() => {
            setLoading(true);
            setTimeout(() => {
              setLoading(false);
              toast.success('Seat saved. See you Friday.');
            }, 1800);
          }}
        >
          {loading ? 'Saving your seat' : 'Try the loading state'}
        </Button>
        <Tooltip content="Copy ticket code">
          <IconButton label="Copy ticket code" onClick={() => toast('Copied ZM-7K3F9Q')}>
            <Copy className="size-5" />
          </IconButton>
        </Tooltip>
        <Tooltip content="Remind me">
          <IconButton label="Remind me" variant="primary">
            <Bell className="size-5" />
          </IconButton>
        </Tooltip>
        <Button disabled variant="secondary" shape={false}>
          Disabled
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-[24px] bg-surface-inverse p-5">
        <Button variant="paper">Save me a seat</Button>
        <Button variant="outlinePaper" shape={false}>
          Say hi
        </Button>
      </div>
    </div>
  );
}

export function FilterChipsDemo() {
  const [on, setOn] = useState<string[]>(['robotics']);
  const tags = ['robotics', 'nlp', 'networks', 'hci', 'bio'];
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((t) => (
        <ChipButton key={t} selected={on.includes(t)} onClick={() => setOn((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]))}>
          {t}
        </ChipButton>
      ))}
    </div>
  );
}

export function FormDemo() {
  const [email, setEmail] = useState('nadia@');
  const bad = email.length > 0 && !/^\S+@\S+\.\S+$/.test(email);
  return (
    <FormCard className="grid gap-6 md:grid-cols-2">
      <Field label="Full name" required hint="As you'd like it on your ticket.">
        <Input autoComplete="name" placeholder="Nadia Putri" />
      </Field>
      <Field label="Email" required error={bad ? 'That email looks off. Mind checking it?' : null}>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </Field>
      <Field label="Topic">
        <Select defaultValue="present">
          <option value="present">I want to present</option>
          <option value="collab">Collaboration</option>
          <option value="q">A question</option>
        </Select>
      </Field>
      <Field label="Phone" hint="Only used if the room changes last minute.">
        <Input type="tel" inputMode="tel" placeholder="+62 812 3456 7890" size="md" />
      </Field>
      <fieldset className="grid gap-3 md:col-span-2 sm:grid-cols-2">
        <legend className="mb-2 text-[0.9375rem] font-bold">How are you joining?</legend>
        <Choice name="mode" value="in-person" defaultChecked label="In person" description="Grab a seat in the room." />
        <Choice name="mode" value="online" label="Online" description="Watch the stream from anywhere." />
      </fieldset>
      <Field label="Message" className="md:col-span-2">
        <Textarea placeholder="Bring the messy version." />
      </Field>
      <div className="md:col-span-2">
        <Button type="button" size="lg" onClick={() => toast.success('Message sent. A real human reads these.')}>
          Send message
        </Button>
      </div>
    </FormCard>
  );
}

export function OverlaysDemo() {
  return (
    <div className="flex flex-wrap gap-3">
      <Dialog
        trigger={<Button variant="secondary" shape="circle">Open a dialog</Button>}
        title="Add to calendar"
        description="Pick where Friday should live."
        footer={<Button onClick={() => toast('Downloaded zemi-42.ics')}>Download .ics</Button>}
      >
        <p className="text-ink-2">Google, Apple, Outlook, they all read the same .ics file. We keep it simple.</p>
      </Dialog>
      <Sheet trigger={<Button variant="secondary" shape="square">Open a sheet</Button>} title="Filters" description="Narrow down the Fridays.">
        <div className="flex flex-col gap-4">
          <FilterChipsDemo />
          <p className="text-ink-3">Sheets slide up on phones. Drag handle included.</p>
        </div>
      </Sheet>
      <Sheet side="right" trigger={<Button variant="ghost" shape="arch">Right sheet</Button>} title="Share this Friday">
        <p className="text-ink-2">Copy the link, send it to the group chat, bring a friend.</p>
      </Sheet>
    </div>
  );
}

export function NavPillDemo({ upcoming, live }: { upcoming: EventCard; live: EventCard }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-[24px] border border-line p-5">
        <NextEventPill event={upcoming} />
        <NextEventPill event={live} />
        <NextEventPill event={null} />
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-[24px] bg-surface-inverse p-5">
        <NextEventPill event={upcoming} theme="dark" />
        <NextEventPill event={live} theme="dark" />
        <NextEventPill event={null} theme="dark" />
      </div>
    </div>
  );
}

export function ShapeNameList({ shapes }: { shapes: ShapeName[] }) {
  return <>{shapes.join(', ')}</>;
}
