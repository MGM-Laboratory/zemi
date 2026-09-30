'use client';

import { canCreateBumpers, formatJakarta } from '@zemi/shared';
import { ArchiveRestore, ArrowLeft, Gamepad2, History, Keyboard, Lock, MoreHorizontal, Palette, Play, Redo2, Tv, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button, IconButton } from '@/components/admin/ui/button';
import { useConfirm } from '@/components/admin/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/admin/ui/dropdown-menu';
import { DateText } from '@/components/admin/ui/display';
import { Callout } from '@/components/admin/ui/feedback';
import { notify } from '@/components/admin/ui/toast';
import { Tooltip } from '@/components/admin/ui/tooltip';
import { useAbility } from '@/lib/admin/ability';
import { useBreadcrumbs } from '@/lib/admin/breadcrumbs';
import { cn } from '@/lib/admin/cn';
import { formatRelative } from '@/lib/admin/format';
import { isMac, useNow } from '@/lib/admin/hooks';
import { adminRoutes } from '@/lib/admin/nav';
import { bumpersApi } from '../api';
import { EventChip } from '../library/show-card';
import { EventPicker, STANDALONE, type EventPickLike } from '../library/event-picker';
import { useOpenStage } from './shortcuts';
import { useBuilder, useBuilderUi } from './store';

const mod = () => (isMac() ? '⌘' : 'Ctrl+');

/**
 * The builder's own bar: back to the library, the show's name (edit in place), its Friday,
 * save status, undo and redo, History, Theme, the OBS guide, Controller and Play. Narrow screens
 * fold the secondary actions into a menu.
 */
export function BuilderTopbar() {
  const { state, canEdit, undo, redo } = useBuilder();
  const { openPanel } = useBuilderUi();
  const openStage = useOpenStage();
  useBreadcrumbs([{ label: 'Bumpers', href: adminRoutes.bumpers }, { label: state.doc.title || 'Untitled show' }]);
  const canUndo = canEdit && state.past.length > 0;
  const canRedo = canEdit && state.future.length > 0;
  const playable = state.doc.slides.some((s) => !s.hidden);

  return (
    <div className="@container shrink-0 border-b border-line bg-white">
      <div className="flex h-14 items-center gap-1.5 px-2 @lg:gap-2 @lg:px-3">
        <Tooltip content="All shows">
          <Link
            href={adminRoutes.bumpers}
            aria-label="Back to all shows"
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-2 transition hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
          >
            <ArrowLeft className="size-[18px]" aria-hidden="true" />
          </Link>
        </Tooltip>
        <TitleField />
        <div className="hidden shrink-0 @3xl:block">
          <EventControl />
        </div>
        <SaveStatus className="ml-1" />

        <div className="ml-auto flex shrink-0 items-center gap-0.5 @lg:gap-1">
          <IconButton label={`Undo (${mod()}Z)`} size="sm" disabled={!canUndo} onClick={undo}>
            <Undo2 />
          </IconButton>
          <IconButton label={`Redo (${isMac() ? '⇧⌘Z' : 'Shift+Ctrl+Z'})`} size="sm" disabled={!canRedo} onClick={redo} className="hidden @xl:inline-flex">
            <Redo2 />
          </IconButton>
          <span className="mx-1 hidden h-5 w-px bg-line @3xl:block" aria-hidden="true" />
          <div className="hidden items-center gap-0.5 @3xl:flex">
            <ChromeButton icon={<History />} label="History" onClick={() => openPanel('history')} />
            <ChromeButton icon={<Palette />} label="Theme" onClick={() => openPanel('theme')} />
            <ChromeButton icon={<Tv />} label="OBS" tooltip="Set up OBS" onClick={() => openPanel('obs')} />
          </div>
          <Button size="sm" variant="secondary" icon={<Gamepad2 />} onClick={() => void openStage('control')} className="ml-1 hidden @3xl:inline-flex" aria-label="Open the controller">
            <span className="hidden @6xl:inline">Controller</span>
          </Button>
          <MoreMenu />
          <Tooltip content={`Play from the start. ${mod()}Enter plays from this bumper.`}>
            <Button size="sm" variant="primary" icon={<Play className="fill-current" />} disabled={!playable} onClick={() => void openStage('play')} className="ml-1" aria-label="Play the show">
              <span className="hidden @md:inline">Play</span>
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

function ChromeButton({ icon, label, tooltip, onClick }: { icon: ReactNode; label: string; tooltip?: string; onClick: () => void }) {
  return (
    <Tooltip content={tooltip ?? label}>
      <Button size="sm" variant="ghost" icon={icon} onClick={onClick} aria-label={tooltip ?? label} className="px-2.5 @6xl:px-3">
        <span className="hidden @6xl:inline">{label}</span>
      </Button>
    </Tooltip>
  );
}

function MoreMenu() {
  const { canEdit, redo, state } = useBuilder();
  const { openPanel } = useBuilderUi();
  const openStage = useOpenStage();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label="More" size="sm" className="@3xl:hidden">
          <MoreHorizontal />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        <DropdownMenuItem icon={<Redo2 />} disabled={!canEdit || !state.future.length} onSelect={redo} className="@xl:hidden">
          Redo
        </DropdownMenuItem>
        <DropdownMenuItem icon={<History />} onSelect={() => openPanel('history')}>
          History
        </DropdownMenuItem>
        <DropdownMenuItem icon={<Palette />} onSelect={() => openPanel('theme')}>
          Theme
        </DropdownMenuItem>
        <DropdownMenuItem icon={<Tv />} onSelect={() => openPanel('obs')}>
          Set up OBS
        </DropdownMenuItem>
        <DropdownMenuItem icon={<Gamepad2 />} onSelect={() => void openStage('control')}>
          Controller
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<Keyboard />} shortcut="?" onSelect={() => openPanel('shortcuts')}>
          Keyboard shortcuts
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---------------------------------------------------------------- title */

function TitleField() {
  const { state, canEdit, setTitle } = useBuilder();
  const [draft, setDraft] = useState<string | null>(null);
  const [before, setBefore] = useState('');
  const title = state.doc.title;
  const value = draft ?? title;
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') {
      setTitle(before);
      setDraft(before);
      e.currentTarget.blur();
    }
  };
  if (!canEdit) {
    return (
      <h1 className="min-w-0 truncate px-1 font-display text-[1.0625rem] font-extrabold tracking-[-0.02em] text-ink [font-variation-settings:'CASL'_0.2]" title={title}>
        {title}
      </h1>
    );
  }
  return (
    <input
      value={value}
      aria-label="Show name"
      maxLength={120}
      spellCheck={false}
      onFocus={(e) => {
        setBefore(title);
        setDraft(title);
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        // An empty name can't be saved; keep the last one until something is typed.
        if (v.trim()) setTitle(v);
      }}
      onBlur={() => {
        if (!(draft ?? '').trim()) setTitle(before || title);
        setDraft(null);
      }}
      onKeyDown={onKey}
      className={cn(
        'h-9 min-w-[6rem] max-w-[min(26rem,100%)] shrink truncate rounded-lg border border-transparent bg-transparent px-2 font-display text-[1.0625rem] font-extrabold tracking-[-0.02em] text-ink [field-sizing:content] [font-variation-settings:"CASL"_0.2]',
        'transition-colors hover:border-line-strong focus:border-blue focus:bg-white focus:ring-4 focus:ring-blue/15 focus:outline-none',
      )}
    />
  );
}

/* ---------------------------------------------------------------- event */

function EventControl() {
  const ability = useAbility();
  const confirm = useConfirm();
  const { state, canEdit, setEventId, mergeData } = useBuilder();
  const { eventId } = state.doc;
  const event = eventId ? (state.data.events[eventId] ?? null) : null;
  const row = event ? { id: event.id, slug: event.slug, number: event.number, title: event.title, startsAt: event.startsAt, endsAt: event.endsAt, accent: event.accent, cover: event.cover, status: event.status } : null;
  const standalone = canCreateBumpers(ability, null);
  // Moving needs edit on this show and on the target (the picker greys out Fridays you can't build for).
  if (!canEdit || (!eventId && !standalone && !ability.canAny('event', 'bumpers.edit'))) return <EventChip event={row} className="h-8 max-w-56" />;
  const selected: EventPickLike | null = event ? { id: event.id, number: event.number, title: event.title, startsAt: event.startsAt, accent: event.accent, canBuild: true } : null;
  const change = async (value: string | null, pick: EventPickLike | null) => {
    const next = value === STANDALONE ? null : value;
    if (next === eventId || (value === null && !standalone)) return;
    const name = pick ? (pick.number != null ? `Zemi #${pick.number}` : pick.title) : 'no event';
    const ok = await confirm({
      title: next ? `Move this show to ${name}?` : 'Make this a standalone show?',
      description: next
        ? `People who build bumpers for ${name} can open it, and bumpers that follow the event show its title, lineup and rundown. The OBS links stay the same.`
        : `It stops following ${event ? (event.number != null ? `Zemi #${event.number}` : event.title) : 'its event'}, and only people who manage every show can open it. The OBS links stay the same.`,
      confirmLabel: next ? `Move to ${name}` : 'Make it standalone',
    });
    if (!ok) return;
    setEventId(next);
    if (next) {
      try {
        mergeData(await bumpersApi.resolve({ eventIds: [next] }));
      } catch {
        // The save answer brings the event data too.
      }
      notify.success(`Moved to ${name}${pick ? `, ${formatJakarta(pick.startsAt, 'date')}` : ''}.`);
    }
  };
  return (
    <div className="w-48 @6xl:w-56 [&_button[role=combobox]]:rounded-full [&_button[role=combobox]]:border-line [&_button[role=combobox]]:bg-surface-muted [&_button[role=combobox]]:text-[0.8125rem] hover:[&_button[role=combobox]]:border-line-strong">
      <EventPicker value={eventId ?? STANDALONE} selected={selected} onChange={(v, pick) => void change(v, pick)} buildableOnly standalone={standalone} size="sm" aria-label="The show's event" placeholder="No event" />
    </div>
  );
}

/* ---------------------------------------------------------------- save status */

function SaveStatus({ className }: { className?: string }) {
  const { state, canEdit, saveNow } = useBuilder();
  const now = useNow(5000).getTime();
  const { save, savedAt, error, retry } = state;
  if (!canEdit) {
    return (
      <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-[0.75rem] font-medium text-ink-3', className)}>
        <Lock className="size-3" aria-hidden="true" />
        <span className="hidden @lg:inline">View only</span>
      </span>
    );
  }
  const age = savedAt ? Math.max(0, now - savedAt) : 0;
  const ago = age < 10_000 ? 'just now' : age < 60_000 ? `${Math.round(age / 1000)} s ago` : formatRelative(savedAt!, new Date(now));
  const view =
    save === 'saved'
      ? { dot: 'bg-green', text: `Saved ${ago}`, tip: 'Every change saves by itself.' }
      : save === 'dirty' || save === 'saving'
        ? { dot: 'bg-blue motion-safe:animate-pulse', text: 'Saving...', tip: 'Saving your changes.' }
        : save === 'conflict'
          ? { dot: 'bg-yellow', text: 'Not saved', tip: 'Someone else saved first. Pick a version in the banner below.' }
          : retry
            ? { dot: 'bg-red', text: "Couldn't save, retrying", tip: `${error ?? 'The server did not answer.'} Click to try right now.` }
            : { dot: 'bg-red', text: "Couldn't save", tip: `${error ?? 'The server said no.'} Fix it and it saves again, or click to retry.` };
  const inner = (
    <>
      <span className={cn('size-2 shrink-0 rounded-full', view.dot)} aria-hidden="true" />
      <span role="status" className="sr-only whitespace-nowrap @5xl:not-sr-only">
        {view.text}
      </span>
    </>
  );
  const cls = cn('inline-flex h-8 shrink-0 items-center gap-2 rounded-full px-2 text-[0.8125rem] text-ink-3', className);
  return (
    <Tooltip content={view.tip}>
      {save === 'error' ? (
        <button type="button" onClick={() => void saveNow()} className={cn(cls, 'cursor-pointer text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-focus')}>
          {inner}
        </button>
      ) : (
        <span className={cls}>{inner}</span>
      )}
    </Tooltip>
  );
}

/* ---------------------------------------------------------------- banners */

/** Conflict and read-only banners under the bar. */
export function BuilderNotices() {
  const { state, keepMine, takeTheirs, setStatus } = useBuilder();
  const [restoring, setRestoring] = useState(false);
  const theirs = state.theirs;
  const archived = state.status === 'archived';
  const editor = state.permissions.includes('edit');
  const standalone = !state.doc.eventId;

  if (state.save === 'conflict' && theirs) {
    const who = theirs.updatedByName ?? 'Someone';
    return (
      <div className="shrink-0 border-b border-line bg-white px-3 py-2.5">
        <Callout
          tone="yellow"
          title="Someone else saved this show while you were editing."
          action={
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={takeTheirs}>
                Load theirs
              </Button>
              <Button size="sm" variant="primary" onClick={keepMine}>
                Keep mine
              </Button>
            </div>
          }
        >
          {who} saved version {theirs.version} <DateText value={theirs.updatedAt} format="relative" />. Keep mine saves yours over it. Load theirs swaps theirs in, and undo brings yours back.
        </Callout>
      </div>
    );
  }
  if (archived) {
    const restore = async () => {
      setRestoring(true);
      const res = await setStatus('active');
      setRestoring(false);
      if (res) notify.success('Restored. Its OBS links work again.', { celebrate: 'arch' });
      else notify.error("Couldn't restore the show. Try again in a moment.");
    };
    return (
      <div className="shrink-0 border-b border-line bg-white px-3 py-2.5">
        <Callout
          tone="neutral"
          icon={<ArchiveRestore />}
          title="This show is archived."
          action={
            editor ? (
              <Button size="sm" variant="primary" icon={<ArchiveRestore />} loading={restoring} onClick={() => void restore()}>
                Restore
              </Button>
            ) : undefined
          }
        >
          Its OBS links are paused and nothing changes until it is restored.{editor ? '' : ' Ask someone who builds bumpers for this Friday.'}
        </Callout>
      </div>
    );
  }
  if (!editor) {
    return (
      <div className="shrink-0 border-b border-line bg-white px-3 py-2.5">
        <Callout tone="neutral" icon={<Lock />} title="View only.">
          You can play this show and drive the screen. Changes need {standalone ? 'the Manage all bumpers permission' : 'Build bumpers on this Friday'}.
        </Callout>
      </div>
    );
  }
  return null;
}
