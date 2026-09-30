'use client';

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { BumperOutputLinks, BumperPermission, BumperPresence } from '@zemi/shared';
import { Check, ChevronLeft, ChevronRight, Copy, KeyRound, MousePointer2, PanelsTopLeft, RefreshCw, ShieldAlert } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useContext, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Character } from '@/components/admin/characters/character';
import { Button } from '@/components/admin/ui/button';
import { Callout } from '@/components/admin/ui/feedback';
import { ConfirmDialog } from '@/components/admin/ui/confirm-dialog';
import { Dialog } from '@/components/admin/ui/dialog';
import { CopyField, useCopy } from '@/components/admin/ui/display';
import { Skeleton } from '@/components/admin/ui/feedback';
import { notify } from '@/components/admin/ui/toast';
import { isApiError } from '@/lib/admin/api';
import { useAbility } from '@/lib/admin/ability';
import { cn } from '@/lib/admin/cn';
import { useAdminMutation } from '@/lib/admin/hooks';
import { bumperKeys, bumpersApi } from '../api';
import { AdminLiveContext, useAdminLive } from './use-live';

/**
 * "Put the bumpers in OBS": the three links, the Browser Source settings drawn as little OBS
 * windows, the optional dock, a live "OBS connected" check, a Companion / Stream Deck recipe,
 * and replacing links when one leaks. Rendered by the builder, the library and the controller.
 */
export function ObsGuideDialog({ showId, open, onOpenChange }: { showId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="xl" accent="blue" title="Put the bumpers in OBS" description="One Browser Source for the stream, an optional dock for the buttons. The room screen and the stream stay in step.">
      {open ? <GuideBody showId={showId} /> : null}
    </Dialog>
  );
}

type Which = 'output' | 'control' | 'both';

function GuideBody({ showId }: { showId: string }) {
  const qc = useQueryClient();
  const links = useQuery({
    queryKey: bumperKeys.output(showId),
    queryFn: ({ signal }) => bumpersApi.output(showId, signal),
    staleTime: 30_000,
  });
  // The controller already streams this show: reuse its connection for the live check.
  const shared = useContext(AdminLiveContext);
  const reuse = shared?.showId === showId ? shared : null;
  const own = useAdminLive(showId, { enabled: !reuse, show: false });
  const presence = (reuse ?? own).presence;
  const canEdit = useCanEdit(qc, showId);

  if (links.isPending) {
    return (
      <div className="space-y-4 py-2" aria-busy="true">
        <Skeleton className="h-14 w-full" rounded="lg" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-64 w-full" rounded="lg" />
      </div>
    );
  }
  if (links.isError) {
    const forbidden = isApiError(links.error) && links.error.isForbidden;
    return (
      <div className="flex flex-col items-start gap-4 py-4 sm:flex-row sm:items-center sm:gap-5">
        <div className="flex shrink-0 items-end gap-1.5" aria-hidden="true">
          <Character shape="square" mood="look" size={40} lookAt={{ x: 0.8, y: -0.1 }} />
          <Character shape="circle" mood="idle" size={32} />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-ink">{forbidden ? 'The OBS links stay with the people who run this show.' : "We couldn't load the OBS links."}</p>
          <p className="mt-1 text-sm text-ink-3">{forbidden ? 'Ask a stream operator for them. Anyone with the dock link can drive the show, so they are kept close.' : 'Check your connection and try again.'}</p>
          {forbidden ? null : (
            <Button size="sm" variant="secondary" className="mt-3" icon={<RefreshCw />} loading={links.isFetching} onClick={() => void links.refetch()}>
              Try again
            </Button>
          )}
        </div>
      </div>
    );
  }
  return <Guide links={links.data} presence={presence} canEdit={canEdit} showId={showId} />;
}

/**
 * Rotating needs `edit`. The guide opens from the builder (detail cached), the library (list rows)
 * or the controller (detail): read what is already cached instead of fetching the detail, whose
 * cache the builder owns. Unknown means "offer it"; the API still decides.
 */
function useCanEdit(qc: QueryClient, showId: string): boolean {
  const ability = useAbility();
  if (ability.isSuperadmin || ability.has('bumpers.manage')) return true;
  const found = cachedPermissions(qc, showId);
  return found ? found.includes('edit') : true;
}

function cachedPermissions(qc: QueryClient, showId: string): BumperPermission[] | null {
  for (const [, data] of qc.getQueriesData<unknown>({ queryKey: bumperKeys.all })) {
    const hit = findShow(data, showId);
    if (hit) return hit;
  }
  for (const [, data] of qc.getQueriesData<unknown>({ predicate: (q) => q.queryKey.includes('bumpers') })) {
    const hit = findShow(data, showId);
    if (hit) return hit;
  }
  return null;
}

function findShow(data: unknown, showId: string): BumperPermission[] | null {
  if (!data || typeof data !== 'object') return null;
  const rec = data as { id?: unknown; permissions?: unknown; items?: unknown };
  if (rec.id === showId && Array.isArray(rec.permissions)) return rec.permissions as BumperPermission[];
  const list = Array.isArray(data) ? data : Array.isArray(rec.items) ? rec.items : null;
  if (!list) return null;
  for (const row of list) {
    const r = row as { id?: unknown; permissions?: unknown };
    if (r && r.id === showId && Array.isArray(r.permissions)) return r.permissions as BumperPermission[];
  }
  return null;
}

/* ---------------------------------------------------------------- the guide */

function Guide({ links, presence, canEdit, showId }: { links: BumperOutputLinks; presence: BumperPresence | null; canEdit: boolean; showId: string }) {
  return (
    <div className="space-y-6 pb-1">
      <LiveCheck presence={presence} />

      <section aria-labelledby="obs-links" className="space-y-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="obs-links" className="font-display text-[1.0625rem] font-extrabold tracking-[-0.015em] [font-variation-settings:'CASL'_0.2]">
            The links
          </h3>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink-2">
            <span className="size-1.5 rounded-full bg-blue" aria-hidden="true" />
            OBS 31 or newer
          </span>
        </div>
        <Flash value={links.outputUrl}>
          <CopyField label="Output, for the Browser Source" value={links.outputUrl} onCopy={() => notify.success('Copied. Paste it into the Browser Source URL in OBS.')} />
        </Flash>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3.5 md:grid-cols-2">
          <Flash value={links.dockUrl}>
            <CopyField label="Dock, for a Custom Browser Dock" value={links.dockUrl} secret onCopy={() => notify.success('Copied. Paste it as the dock URL in OBS.')} />
          </Flash>
          <Flash value={links.controlApiUrl}>
            <CopyField label="Control API, for Companion or Stream Deck" value={links.controlApiUrl} secret onCopy={() => notify.success('Copied. POST {"action":"next"} to it.')} />
          </Flash>
        </div>
        <p className="flex items-start gap-2 text-[0.8125rem] text-ink-3">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-ink-4" aria-hidden="true" />
          <span>The output link only shows the bumpers. The dock and control links can drive the show, so treat them like passwords and keep them with your crew.</span>
        </p>
      </section>

      <Steps links={links} />
      <Recipe url={links.controlApiUrl} />
      <Rotate showId={showId} canEdit={canEdit} />
    </div>
  );
}

/* ---------------------------------------------------------------- live check */

function LiveCheck({ presence }: { presence: BumperPresence | null }) {
  const outputs = presence?.clients.filter((c) => c.kind === 'output') ?? [];
  const obs = outputs.filter((c) => c.obs);
  const docks = presence?.clients.filter((c) => c.kind === 'dock') ?? [];
  const ok = obs.length > 0;
  const browser = !ok && outputs.length > 0;
  return (
    <div
      role="status"
      aria-live="polite"
      data-obs-check={ok ? 'connected' : browser ? 'browser' : 'waiting'}
      className={cn('flex items-center gap-4 rounded-2xl border px-4 py-3.5 transition-colors sm:px-5', ok ? 'border-green/25 bg-green-50' : browser ? 'border-blue/20 bg-blue-50' : 'border-line bg-surface-muted')}
    >
      <span className="shrink-0" aria-hidden="true">
        <Character shape={ok ? 'arch' : browser ? 'circle' : 'square'} mood={ok ? 'cheer' : browser ? 'happy' : 'sleep'} size={40} replayKey={obs.length} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 font-semibold text-ink">
          <span className={cn('relative inline-flex size-2.5', ok ? '' : 'opacity-70')} aria-hidden="true">
            {!ok && !browser ? <span className="absolute inset-0 rounded-full bg-ink-4 motion-safe:animate-ping" /> : null}
            <span className={cn('relative size-2.5 rounded-full', ok ? 'bg-green' : browser ? 'bg-blue' : 'bg-ink-4')} />
          </span>
          {ok ? 'OBS connected' : browser ? 'An output is open in a browser' : 'Waiting for OBS'}
        </p>
        <p className="mt-0.5 truncate text-sm text-ink-2">
          {ok
            ? `${obs[0]!.agent ?? 'OBS'}${obs.length > 1 ? `, plus ${obs.length - 1} more` : ''}. It follows the show from here.`
            : browser
              ? `${outputs[0]!.agent ?? 'A browser'} has the output open. OBS shows up here once its source loads.`
              : 'Add the Browser Source below. This turns green the moment OBS loads the output link.'}
          {docks.length ? ` ${docks.length === 1 ? 'One dock' : `${docks.length} docks`} connected too.` : ''}
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- steps */

interface Step {
  key: string;
  tab: string;
  title: string;
  where: string;
  art: ReactNode;
  notes: ReactNode[];
}

const DEFAULT_CSS = 'body { background-color: rgba(0, 0, 0, 0); margin: 0px auto; overflow: hidden; }';

function Steps({ links }: { links: BumperOutputLinks }) {
  const shortOut = links.outputUrl.replace(/^https?:\/\//, '').replace(links.outputKey, `${links.outputKey.slice(0, 6)}...`);
  const shortDock = links.dockUrl.replace(/^https?:\/\//, '').replace(links.controlKey, '••••••••');
  const steps: Step[] = [
    {
      key: 'source',
      tab: 'Add it',
      title: 'Add a Browser Source',
      where: 'OBS main window, Sources dock',
      art: <SourcesArt />,
      notes: [
        <>In the scene that goes on air, click <b>+</b> under <b>Sources</b>, then <b>Browser</b>.</>,
        <>Name it <b>Zemi bumpers</b> and keep it at the top of the list, above the camera.</>,
        <>One source is enough for every scene: add it to other scenes with <b>Add Existing</b>.</>,
      ],
    },
    {
      key: 'props',
      tab: 'Settings',
      title: 'Paste the output link',
      where: 'Properties for "Zemi bumpers"',
      art: <PropertiesArt url={shortOut} />,
      notes: [
        <>Paste the <b>Output</b> link into <b>URL</b>. Width <b>1920</b>, height <b>1080</b>.</>,
        <>Frame rate <b>30</b>, or <b>60</b> when your OBS canvas runs at 60.</>,
        <>Keep <b>Shutdown source when not visible</b> and <b>Refresh browser when scene becomes active</b> off, so the bumpers stay in step between scenes.</>,
        <>Keep the default <b>Custom CSS</b>. It is what makes the page see-through over the camera.</>,
        <>Show sound on? Tick <b>Control audio via OBS</b> and the stings land in the mixer.</>,
      ],
    },
    {
      key: 'dock',
      tab: 'Dock',
      title: 'Buttons inside OBS (optional)',
      where: 'Docks, Custom Browser Docks (older OBS: View, Docks)',
      art: <DockArt url={shortDock} />,
      notes: [
        <>Open <b>Docks</b>, then <b>Custom Browser Docks...</b></>,
        <>Dock name <b>Zemi bumpers</b>, URL: the <b>Dock</b> link. Click <b>Apply</b>.</>,
        <>Drag the dock wherever you like. Next, previous, black and clear work from there, and the arrow keys too once you click into it.</>,
      ],
    },
    {
      key: 'test',
      tab: 'Test',
      title: 'Check it',
      where: 'This dialog and the OBS preview',
      art: <InteractArt />,
      notes: [
        <>The strip at the top turns green with <b>OBS connected</b> when the source loads.</>,
        <>Press Next in the controller or the dock: the OBS preview follows within a blink.</>,
        <>To click inside the page (say, to wake up sound), right click the source and pick <b>Interact</b>.</>,
        <>Framing a projector? Add <b>?safe=1</b> to the output link to see the title-safe guides, then take it off again.</>,
      ],
    },
  ];
  return <StepTabs steps={steps} />;
}

function StepTabs({ steps }: { steps: Step[] }) {
  const [index, setIndex] = useState(0);
  const step = steps[index]!;
  const baseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const reduce = useReducedMotion();
  const go = (i: number, focus = false) => {
    const next = (i + steps.length) % steps.length;
    setIndex(next);
    if (focus) tabRefs.current[next]?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const map: Record<string, number> = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: steps.length - 1 };
    if (!(e.key in map)) return;
    e.preventDefault();
    go(map[e.key]!, true);
  };
  return (
    <section aria-labelledby={`${baseId}-h`} className="@container">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`${baseId}-h`} className="font-display text-[1.0625rem] font-extrabold tracking-[-0.015em] [font-variation-settings:'CASL'_0.2]">
          Set it up
        </h3>
        <span className="mono text-xs text-ink-3">
          Step {index + 1} of {steps.length}
        </span>
      </div>
      <div role="tablist" aria-label="OBS setup steps" onKeyDown={onKey} className="mt-3 flex gap-1 overflow-x-auto rounded-full bg-surface-muted p-1 [scrollbar-width:none]">
        {steps.map((s, i) => {
          const active = i === index;
          const done = i < index;
          return (
            <button
              key={s.key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              id={`${baseId}-tab-${s.key}`}
              role="tab"
              type="button"
              aria-selected={active}
              aria-controls={`${baseId}-panel`}
              tabIndex={active ? 0 : -1}
              onClick={() => go(i)}
              className={cn(
                'relative flex h-9 flex-[1_0_auto] items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
                active ? 'text-ink' : 'text-ink-3 hover:text-ink',
              )}
            >
              {active ? (
                <motion.span layoutId={`${baseId}-pill`} className="absolute inset-0 rounded-full bg-white shadow-[0_1px_2px_rgba(14,17,22,0.08),0_0_0_1px_var(--color-line)]" transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }} />
              ) : null}
              <span className={cn('mono relative flex size-5 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-semibold', active ? 'bg-ink text-white' : done ? 'bg-green text-white' : 'bg-white text-ink-3 ring-1 ring-line-strong')} aria-hidden="true">
                {i + 1}
              </span>
              <span className="relative">{s.tab}</span>
            </button>
          );
        })}
      </div>
      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${step.key}`} className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-5 @3xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] @3xl:items-start">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step.key} initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, rotate: -0.6 }} animate={{ opacity: 1, y: 0, rotate: 0 }} exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }} transition={{ duration: reduce ? 0.12 : 0.32, ease: [0.22, 1, 0.36, 1] }}>
            {step.art}
          </motion.div>
        </AnimatePresence>
        <div className="min-w-0">
          <p className="mono text-[0.75rem] tracking-[0.08em] text-ink-3 uppercase">{step.where}</p>
          <h4 className="mt-1 font-display text-lg font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.3]">{step.title}</h4>
          <ol className="mt-3 space-y-2.5">
            {step.notes.map((n, i) => (
              <li key={i} className="flex gap-2.5 text-[0.9375rem] leading-snug text-ink-2 [&_b]:font-semibold [&_b]:text-ink">
                <span className="mt-[0.45em] size-1.5 shrink-0 rounded-full bg-blue" aria-hidden="true" />
                <span>{n}</span>
              </li>
            ))}
          </ol>
          <div className="mt-5 flex items-center gap-2">
            <Button size="sm" variant="ghost" icon={<ChevronLeft />} onClick={() => go(index - 1)} disabled={index === 0}>
              Back
            </Button>
            <Button size="sm" variant={index === steps.length - 1 ? 'secondary' : 'primary'} iconRight={<ChevronRight />} onClick={() => go(index + 1)}>
              {index === steps.length - 1 ? 'From the top' : 'Next step'}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- drawings (decorative) */

function ObsFrame({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div aria-hidden="true" className={cn('relative overflow-hidden rounded-2xl bg-[#1c1f26] text-[0.75rem] text-[#d7dbe3] shadow-[0_18px_40px_-24px_rgba(14,17,22,0.7)] ring-1 ring-black/40 select-none', className)}>
      <div className="flex h-7 items-center gap-1.5 border-b border-white/5 bg-[#252932] px-3">
        <span className="size-2.5 rounded-full bg-[#f94141]" />
        <span className="size-2.5 rounded-full bg-[#f7bf33]" />
        <span className="size-2.5 rounded-full bg-[#0f8657]" />
        <span className="mono ml-2 truncate text-[0.6875rem] text-white/50">{title}</span>
      </div>
      {children}
    </div>
  );
}

const mark = 'ring-1 ring-[#f7bf33] shadow-[0_0_0_3px_rgba(247,191,51,0.28)]';

function SourcesArt() {
  return (
    <ObsFrame title="OBS Studio">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-2 p-3">
        <div className="min-h-[12.5rem] rounded-lg bg-[#20242c] p-2">
          <p className="mb-1.5 text-[0.6875rem] font-semibold text-white/60">Scenes</p>
          {['Standby', 'Talk', 'Break'].map((s, i) => (
            <p key={s} className={cn('truncate rounded px-1.5 py-1', i === 1 ? 'bg-[#3a6dc5] text-white' : 'text-white/60')}>
              {s}
            </p>
          ))}
        </div>
        <div className="relative min-h-[12.5rem] rounded-lg bg-[#20242c] p-2">
          <p className="mb-1.5 text-[0.6875rem] font-semibold text-white/60">Sources</p>
          <p className="truncate rounded px-1.5 py-1 text-white/85">Zemi bumpers</p>
          <p className="truncate rounded px-1.5 py-1 text-white/60">Camera</p>
          <p className="truncate rounded px-1.5 py-1 text-white/60">Mic</p>
          <div className="mt-2 flex gap-1 border-t border-white/5 pt-1.5">
            <span className={cn('mono flex size-5 items-center justify-center rounded bg-[#2e333d] text-[0.8125rem] text-white', mark)}>+</span>
            <span className="mono flex size-5 items-center justify-center rounded bg-[#2a2e37] text-white/50">-</span>
            <span className="mono flex size-5 items-center justify-center rounded bg-[#2a2e37] text-white/50">⚙</span>
          </div>
          <div className="absolute top-9 -right-1 w-[8.5rem] rounded-lg bg-[#2b2f39] p-1 shadow-xl ring-1 ring-black/40 @max-[28rem]:right-0">
            {['Audio Input Capture', 'Browser', 'Color Source', 'Display Capture', 'Image', 'Media Source'].map((s) => (
              <p key={s} className={cn('truncate rounded px-2 py-[0.3rem]', s === 'Browser' ? 'bg-[#3a6dc5] font-semibold text-white' : 'text-white/65')}>
                {s}
              </p>
            ))}
          </div>
        </div>
      </div>
    </ObsFrame>
  );
}

function Row({ label, children, marked }: { label: string; children: ReactNode; marked?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.3fr)] items-center gap-2">
      <span className="truncate text-right text-white/60">{label}</span>
      <span className={cn('mono min-w-0 truncate rounded-md px-2 py-1 text-[0.6875rem]', marked ? cn('bg-[#2e333d] text-white', mark) : 'bg-[#2a2e37] text-white/70')}>{children}</span>
    </div>
  );
}

function Tick({ label, on, marked }: { label: string; on: boolean; marked?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.3fr)] items-center gap-2">
      <span />
      <span className={cn('flex min-w-0 items-center gap-2 rounded-md px-1.5 py-0.5', marked && mark)}>
        <span className={cn('flex size-3.5 shrink-0 items-center justify-center rounded-[3px]', on ? 'bg-[#3a6dc5]' : 'bg-[#2a2e37] ring-1 ring-white/20')}>{on ? <Check className="size-2.5 text-white" strokeWidth={3} /> : null}</span>
        <span className={cn('truncate', marked ? 'text-white' : 'text-white/70')}>{label}</span>
      </span>
    </div>
  );
}

function PropertiesArt({ url }: { url: string }) {
  return (
    <ObsFrame title={'Properties for "Zemi bumpers"'}>
      <div className="space-y-1.5 p-3 sm:p-3.5">
        <Tick label="Local file" on={false} />
        <Row label="URL" marked>
          {url}
        </Row>
        <Row label="Width" marked>
          1920
        </Row>
        <Row label="Height" marked>
          1080
        </Row>
        <Tick label="Control audio via OBS" on={false} />
        <Tick label="Use custom frame rate" on marked />
        <Row label="FPS" marked>
          30
        </Row>
        <div className="grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.3fr)] items-start gap-2">
          <span className="truncate pt-1 text-right text-white/60">Custom CSS</span>
          <span className="mono block rounded-md bg-[#2a2e37] px-2 py-1 text-[0.625rem] leading-snug break-all text-white/70">{DEFAULT_CSS}</span>
        </div>
        <Tick label="Shutdown source when not visible" on={false} marked />
        <Tick label="Refresh browser when scene becomes active" on={false} marked />
      </div>
    </ObsFrame>
  );
}

function DockArt({ url }: { url: string }) {
  return (
    <ObsFrame title="OBS Studio">
      <div className="flex gap-3 border-b border-white/5 px-3 py-1.5 text-white/60">
        {['File', 'Edit', 'View', 'Docks', 'Profile', 'Tools'].map((m) => (
          <span key={m} className={cn('rounded px-1.5 py-0.5', m === 'Docks' && 'bg-[#3a6dc5] text-white')}>
            {m}
          </span>
        ))}
      </div>
      <div className="relative p-3">
        <div className="w-44 rounded-lg bg-[#2b2f39] p-1 shadow-xl ring-1 ring-black/40">
          {['Scenes', 'Sources', 'Audio Mixer', 'Custom Browser Docks...'].map((s) => (
            <p key={s} className={cn('truncate rounded px-2 py-[0.3rem]', s.startsWith('Custom') ? 'bg-[#3a6dc5] font-semibold text-white' : 'text-white/65')}>
              {s}
            </p>
          ))}
        </div>
        <div className="mt-3 rounded-lg bg-[#20242c] p-2">
          <div className="mono grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] gap-1.5 text-[0.625rem] text-white/50 uppercase">
            <span>Dock Name</span>
            <span>URL</span>
          </div>
          <div className="mt-1 grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] gap-1.5">
            <span className={cn('truncate rounded bg-[#2e333d] px-1.5 py-1 text-white', mark)}>Zemi bumpers</span>
            <span className={cn('mono truncate rounded bg-[#2e333d] px-1.5 py-1 text-[0.6875rem] text-white', mark)}>{url}</span>
          </div>
        </div>
      </div>
    </ObsFrame>
  );
}

function InteractArt() {
  return (
    <ObsFrame title="OBS Studio">
      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-3 p-3">
        <div className="relative aspect-video overflow-hidden rounded-lg bg-[repeating-conic-gradient(#2a2e37_0%_25%,#23272f_0%_50%)] bg-[length:16px_16px]">
          <div className="absolute inset-x-[12%] top-[22%] bottom-[22%] rounded-md bg-white/95 p-2">
            <span className="block h-1.5 w-1/3 rounded bg-[#f94141]" />
            <span className="mt-1.5 block h-3 w-3/4 rounded bg-[#0e1116]" />
            <span className="mt-1 block h-3 w-1/2 rounded bg-[#0e1116]" />
            <span className="absolute right-2 bottom-2 flex gap-1">
              <span className="size-2.5 rounded-full bg-[#3a6dc5]" />
              <span className="size-2.5 rounded-sm bg-[#f7bf33]" />
            </span>
          </div>
          <span className="mono absolute bottom-1 left-1.5 rounded bg-black/60 px-1 text-[0.5625rem] text-white/80">Preview</span>
        </div>
        <div className="w-full rounded-lg bg-[#2b2f39] p-1 shadow-xl ring-1 ring-black/40">
          {['Order', 'Rename', 'Filters', 'Properties', 'Interact', 'Refresh'].map((s) => (
            <p key={s} className={cn('flex items-center gap-1.5 truncate rounded px-2 py-[0.3rem]', s === 'Interact' ? 'bg-[#3a6dc5] font-semibold text-white' : 'text-white/65')}>
              {s === 'Interact' ? <MousePointer2 className="size-3" /> : null}
              {s}
            </p>
          ))}
        </div>
      </div>
    </ObsFrame>
  );
}

/* ---------------------------------------------------------------- Companion / Stream Deck */

const ACTIONS: Array<{ body: string; label: string }> = [
  { body: '{"action":"next"}', label: 'Next bumper' },
  { body: '{"action":"prev"}', label: 'Previous' },
  { body: '{"action":"toggle-black"}', label: 'Black on or off' },
  { body: '{"action":"clear"}', label: 'Clear (camera only)' },
  { body: '{"action":"show"}', label: 'Back to the bumpers' },
  { body: '{"action":"replay"}', label: 'Replay the entrance' },
  { body: '{"action":"goto","position":3}', label: 'Jump to bumper 3' },
  { body: '{"action":"autoplay-off"}', label: 'Pause auto-advance' },
];

function Recipe({ url }: { url: string }) {
  const curl = `curl -X POST '${url}' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"action":"next"}'`;
  const [copy, copied] = useCopy();
  return (
    <section aria-labelledby="obs-recipe" className="rounded-2xl border border-line p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-yellow-50 text-[#7a5600]" aria-hidden="true">
          <PanelsTopLeft className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <h3 id="obs-recipe" className="font-display text-[1.0625rem] font-extrabold tracking-[-0.015em] [font-variation-settings:'CASL'_0.2]">
            Stream Deck and Companion
          </h3>
          <p className="mt-0.5 text-sm text-ink-3">
            Any button that can send an HTTP POST can drive the show. In Bitfocus Companion, use the <b className="font-semibold text-ink-2">Generic HTTP</b> module, action <b className="font-semibold text-ink-2">POST</b>, the Control API link as the URL, and a JSON body. Stream Deck works the same with a web request plugin.
          </p>
        </div>
      </div>
      <div className="relative mt-4 min-w-0 overflow-hidden rounded-xl bg-[#0e1116]">
        <pre className="mono overflow-x-auto p-4 pr-24 text-[0.8125rem] leading-relaxed text-[#e6e9ef]">
          <code>{curl.replace(url, url.replace(/[A-Za-z0-9]{40,64}$/, (k) => `${k.slice(0, 6)}...`))}</code>
        </pre>
        <button
          type="button"
          onClick={async () => {
            if (await copy(curl)) notify.success('Copied the curl example. Run it in a terminal to test.');
          }}
          className={cn('absolute top-2.5 right-2.5 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus', copied ? 'bg-green text-white' : 'bg-white/10 text-white hover:bg-white/20')}
          aria-label={copied ? 'Copied' : 'Copy the curl example'}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <dl className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {ACTIONS.map((a) => (
          <div key={a.body} className="flex min-w-0 items-baseline justify-between gap-3 border-b border-line/70 py-1.5">
            <dt className="text-sm text-ink-2">{a.label}</dt>
            <dd className="mono truncate text-[0.75rem] text-ink">{a.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ---------------------------------------------------------------- rotate */

const ROTATE_COPY: Record<Which, { button: string; title: string; body: string; done: string }> = {
  output: {
    button: 'New output link',
    title: 'Replace the output link?',
    body: 'The old link stops working right away. Every OBS source using it shows "This link was replaced" until you paste the new link into its Browser Source URL. Docks and Stream Deck buttons keep working.',
    done: 'New output link. Paste it into the Browser Source in OBS.',
  },
  control: {
    button: 'New dock and API links',
    title: 'Replace the dock and control links?',
    body: 'Docks and Stream Deck or Companion buttons stop working until they get the new links. The OBS output keeps showing the bumpers.',
    done: 'New dock and control links. Update the OBS dock and any Stream Deck buttons.',
  },
  both: {
    button: 'Replace all three',
    title: 'Replace every link?',
    body: 'The output, dock and control links all change. OBS shows "This link was replaced" and the dock stops until you paste the new links in.',
    done: 'Fresh links all round. Paste them into OBS.',
  },
};

function Rotate({ showId, canEdit }: { showId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const [which, setWhich] = useState<Which | null>(null);
  const [last, setLast] = useState<Which>('output');
  const rotate = useAdminMutation({
    mutationFn: (w: Which) => bumpersApi.rotate(showId, w),
    onSuccess: (links) => {
      qc.setQueryData(bumperKeys.output(showId), links);
    },
    successMessage: (_l, w) => ROTATE_COPY[w].done,
  });
  if (!canEdit) {
    return (
      <Callout tone="neutral" icon={<KeyRound />} title="Link leaked?">
        Ask someone who builds this show to replace the links. The old ones stop working the second they do.
      </Callout>
    );
  }
  const copy = ROTATE_COPY[which ?? last];
  return (
    <section aria-labelledby="obs-rotate" className="rounded-2xl bg-surface-muted p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-[#b42525]" aria-hidden="true">
          <KeyRound className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="obs-rotate" className="font-display text-[1.0625rem] font-extrabold tracking-[-0.015em] [font-variation-settings:'CASL'_0.2]">
            If a link leaks
          </h3>
          <p className="mt-0.5 text-sm text-ink-3">Posted a screenshot with the dock link in it? Replace it. The old one stops working the second you do, and OBS needs the new one.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(['output', 'control', 'both'] as Which[]).map((w) => (
              <Button
                key={w}
                size="sm"
                variant={w === 'both' ? 'danger-soft' : 'secondary'}
                icon={<RefreshCw />}
                loading={rotate.isPending && rotate.variables === w}
                onClick={() => {
                  setLast(w);
                  setWhich(w);
                }}
              >
                {ROTATE_COPY[w].button}
              </Button>
            ))}
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={which !== null}
        onOpenChange={(o) => {
          if (!o) setWhich(null);
        }}
        destructive
        title={copy.title}
        description={copy.body}
        confirmLabel={copy.button}
        onConfirm={() => (which ? rotate.mutateAsync(which).catch(() => undefined) : undefined)}
      />
    </section>
  );
}

/** Briefly highlights its child when `value` changes (after replacing a link). */
function Flash({ value, children }: { value: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  const [first] = useState(value);
  const changed = first !== value;
  return (
    <motion.div
      key={value}
      initial={changed && !reduce ? { backgroundColor: 'rgba(247,191,51,0.45)', scale: 0.985 } : false}
      animate={{ backgroundColor: 'rgba(247,191,51,0)', scale: 1 }}
      transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      className="-m-1 min-w-0 rounded-[18px] p-1"
    >
      {children}
    </motion.div>
  );
}
