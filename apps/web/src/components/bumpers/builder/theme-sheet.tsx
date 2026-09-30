'use client';

import { BUMPER_QR_STYLES, type Accent, type BumperMotionLevel, type BumperQrStyle, type BumperTheme } from '@zemi/shared';
import { RotateCcw } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { AccentPicker } from '@/components/admin/fields/simple-fields';
import { ShapeGlyph } from '@/components/admin/ui/badge';
import { Button } from '@/components/admin/ui/button';
import { Sheet } from '@/components/admin/ui/dialog';
import { RadioGroup, SegmentedControl, Switch } from '@/components/admin/ui/toggles';
import { cn } from '@/lib/admin/cn';
import { usePrefersReducedMotion } from '@/lib/admin/hooks';
import { ACCENT_SHAPE } from '../engine/palette';
import { useBuilder, useBuilderUi } from './store';
import { BumperThumb } from './thumb';

const ACCENT_TEXT: Record<Accent, string> = { blue: 'text-blue', red: 'text-red', yellow: 'text-yellow-600', green: 'text-green' };
const ACCENT_NAME: Record<Accent, string> = { blue: 'blue', red: 'red', yellow: 'yellow', green: 'green' };

const MOTION: Array<{ value: BumperMotionLevel; label: string; description: string }> = [
  { value: 'full', label: 'Full', description: 'Every transition and entrance, with all the bounce.' },
  { value: 'calm', label: 'Calm', description: 'Slower and gentler moves. Good for a formal room.' },
  { value: 'still', label: 'Still', description: 'Crossfades only, and nothing flies in. For a slow machine or a sensitive room.' },
];

const BACKGROUNDS: Array<{ value: BumperTheme['background']; label: string; description: string; swatch: string }> = [
  { value: 'paper', label: 'Paper', description: 'White, the house look.', swatch: 'bg-white ring-1 ring-line-strong' },
  { value: 'ink', label: 'Ink', description: 'Dark, easy on a dim room.', swatch: 'bg-ink' },
  { value: 'graph', label: 'Graph', description: 'Graph paper, work in progress.', swatch: 'bg-white ring-1 ring-line-strong [background-image:linear-gradient(#dfe5ef_1px,transparent_1px),linear-gradient(90deg,#dfe5ef_1px,transparent_1px)] [background-size:6px_6px]' },
];

const QR_LABEL: Record<BumperQrStyle, string> = { rounded: 'Rounded', dots: 'Dots', square: 'Square' };

/** Show-wide look: accent, background, characters, motion, corner mark and clock, safe area, QR style, sound. */
export function ThemeSheet() {
  const { panel, openPanel } = useBuilderUi();
  const open = panel === 'theme';
  return (
    <Sheet open={open} onOpenChange={(o) => openPanel(o ? 'theme' : null)} title="Theme" description="How every bumper in this show looks and moves. Single bumpers can still pick their own." width="md" bodyClassName="px-0 py-0 sm:px-0">
      {open ? <ThemeBody /> : null}
    </Sheet>
  );
}

function ThemeBody() {
  const { state, canEdit, setTheme, slide } = useBuilder();
  const { theme, eventId } = state.doc;
  const reduce = usePrefersReducedMotion();
  const [replay, setReplay] = useState(0);
  const preview = slide ?? state.doc.slides[0] ?? null;
  const event = eventId ? state.data.events[eventId] : undefined;
  const eventAccent: Accent = event?.accent ?? 'blue';
  const set = (patch: Partial<BumperTheme>) => {
    setTheme(patch);
    if (patch.motion) setReplay((n) => n + 1);
  };

  return (
    <div>
      <div className="sticky top-0 z-[2] border-b border-line bg-white/95 px-5 pt-4 pb-3 backdrop-blur-sm sm:px-6">
        {preview ? (
          <>
            <BumperThumb
              slide={preview}
              theme={theme}
              data={state.data}
              showEventId={eventId}
              live={!reduce}
              replayKey={`${replay}-${preview.id}-${JSON.stringify(theme)}`}
              className="aspect-video w-full rounded-xl ring-1 ring-line"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[0.8125rem] text-ink-3">The bumper you are on, with this theme.</p>
              {reduce ? null : (
                <Button size="xs" variant="ghost" icon={<RotateCcw />} onClick={() => setReplay((n) => n + 1)}>
                  Play again
                </Button>
              )}
            </div>
          </>
        ) : (
          <p className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-3">Add a bumper to see the theme on it.</p>
        )}
      </div>

      <div className="space-y-7 px-5 py-5 sm:px-6">
        <Group title="Accent" hint="The color the shapes, highlights and QR plates pick up.">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!canEdit}
              aria-pressed={theme.accent === 'event'}
              onClick={() => set({ accent: 'event' })}
              className={cn(
                'inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-45',
                theme.accent === 'event' ? 'border-ink bg-ink text-white' : 'border-line-strong text-ink-2 hover:border-ink-4 hover:text-ink',
              )}
            >
              <ShapeGlyph shape={ACCENT_SHAPE[eventAccent]} className={cn('size-3', theme.accent === 'event' ? 'text-white' : ACCENT_TEXT[eventAccent])} />
              {event ? `The event's color (${ACCENT_NAME[eventAccent]})` : 'Follow the event'}
            </button>
            <AccentPicker value={theme.accent === 'event' ? null : theme.accent} onChange={(a) => set({ accent: a })} readOnly={!canEdit} aria-label="Pick one color for the whole show" />
          </div>
        </Group>

        <Group title="Background" hint="Bumpers on Auto use this. Some templates bring their own.">
          <RadioGroup
            variant="cards"
            value={theme.background}
            onValueChange={(v) => set({ background: v })}
            disabled={!canEdit}
            aria-label="Background"
            className="sm:grid-cols-3"
            options={BACKGROUNDS.map((b) => ({ value: b.value, label: b.label, description: b.description, icon: <span className={cn('size-4 shrink-0 rounded', b.swatch)} aria-hidden="true" /> }))}
          />
        </Group>

        <Group title="Motion" hint="How much moves on screen. Changing it replays the preview.">
          <RadioGroup variant="cards" value={theme.motion} onValueChange={(v) => set({ motion: v })} disabled={!canEdit} aria-label="Motion" className="sm:grid-cols-1" options={MOTION} />
        </Group>

        <Group title="On screen">
          <div className="space-y-4">
            <Switch checked={theme.mascots} onCheckedChange={(v) => set({ mascots: v })} disabled={!canEdit} labelFirst label="Characters" description="Q, Hunch, Block and Bridge show up on the templates that have them." />
            <Switch checked={theme.bug} onCheckedChange={(v) => set({ bug: v })} disabled={!canEdit} labelFirst label="Corner mark" description="The Zemi mark and the event number in a corner." />
            <Switch checked={theme.clock} onCheckedChange={(v) => set({ clock: v })} disabled={!canEdit} labelFirst label="Corner clock" description="A small WIB clock in the top right corner." />
            <Switch checked={theme.safeArea} onCheckedChange={(v) => set({ safeArea: v })} disabled={!canEdit} labelFirst label="Projector safe area" description="Shrinks the content 5% for projectors that crop the edges. Backgrounds still fill the screen." />
          </div>
        </Group>

        <Group title="QR codes" hint="Every style scans the same. Pick the one that suits the room.">
          <SegmentedControl<BumperQrStyle>
            value={theme.qrStyle}
            onValueChange={(v) => canEdit && set({ qrStyle: v })}
            options={BUMPER_QR_STYLES.map((q) => ({ value: q, label: QR_LABEL[q], disabled: !canEdit }))}
            aria-label="QR code style"
          />
        </Group>

        <Group title="Sound">
          <Switch checked={theme.sound} onCheckedChange={(v) => set({ sound: v })} disabled={!canEdit} labelFirst label="Transition sounds" description="Soft stings as bumpers change. Off by default, since the AV desk usually runs the sound." />
        </Group>
      </div>
    </div>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-[0.9375rem] font-semibold text-ink">{title}</h3>
      {hint ? <p className="mt-0.5 mb-3 text-[0.8125rem] text-ink-3">{hint}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}
