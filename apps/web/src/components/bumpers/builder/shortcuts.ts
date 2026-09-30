'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { notify } from '@/components/admin/ui/toast';
import { useHotkeys } from '@/lib/admin/hooks';
import { adminRoutes } from '@/lib/admin/nav';
import { useBuilder, useBuilderUi } from './store';

/** The builder's keyboard shortcuts, for the `?` dialog. `mod` is Cmd on a Mac and Ctrl elsewhere. */
export const BUILDER_SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ['mod', 'z'], label: 'Undo' },
  { keys: ['shift', 'mod', 'z'], label: 'Redo' },
  { keys: ['mod', 'd'], label: 'Duplicate the selected bumpers' },
  { keys: ['Del'], label: 'Delete the selected bumpers (from the running order)' },
  { keys: ['mod', 's'], label: 'Save now' },
  { keys: ['mod', 'enter'], label: 'Play from the bumper you are on' },
  { keys: ['['], label: 'Previous bumper' },
  { keys: [']'], label: 'Next bumper' },
  { keys: ['n'], label: 'Add a bumper (opens the gallery)' },
  { keys: ['?'], label: 'This list' },
];

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/** Focus is inside a dialog, sheet, menu or popover: the builder keys stay out of its way. */
function inLayer(target: EventTarget | null): boolean {
  const el = target as Element | null;
  return !!el?.closest?.('[role="dialog"],[role="alertdialog"],[role="menu"],[data-radix-popper-content-wrapper]');
}

/**
 * Open the player or the controller. Unsaved edits are saved first, because both read the show
 * from the server. `fromCurrent` starts the player at the bumper on the canvas (or the next one
 * that plays, when it is hidden).
 */
export function useOpenStage() {
  const router = useRouter();
  const { saveNow, snapshot } = useBuilder();
  return async (where: 'play' | 'control', fromCurrent = false) => {
    const s = snapshot().state;
    if (s.save !== 'saved' && s.permissions.includes('edit') && s.status !== 'archived') {
      if (!(await saveNow())) notify.warning("Your latest changes aren't saved yet, so the screen shows the last saved version.");
    }
    const base = where === 'play' ? adminRoutes.bumperPlay(s.showId) : adminRoutes.bumperControl(s.showId);
    let slideId: string | null = null;
    if (fromCurrent && s.current) {
      const i = s.doc.slides.findIndex((x) => x.id === s.current);
      slideId = s.doc.slides.slice(Math.max(0, i)).find((x) => !x.hidden)?.id ?? null;
    }
    router.push(slideId ? `${base}?slide=${encodeURIComponent(slideId)}` : base);
  };
}

/**
 * Builder shortcuts. They never fire while typing in a field or inside a dialog, sheet or menu
 * (mod+s still saves from a field). `[`, `]` and `?` are caught in the capture phase so they win
 * over the admin shell's own `[` (sidebar) and `?` (admin shortcuts) on this page.
 */
export function useBuilderShortcuts() {
  const b = useBuilder();
  const ui = useBuilderUi();
  const openStage = useOpenStage();
  const blocked = (e: KeyboardEvent) => isEditable(e.target) || inLayer(e.target);

  useHotkeys(
    {
      'mod+z': (e) => {
        if (blocked(e)) return;
        e.preventDefault();
        b.undo();
      },
      'shift+mod+z': (e) => {
        if (blocked(e)) return;
        e.preventDefault();
        b.redo();
      },
      'mod+d': (e) => {
        if (blocked(e)) return;
        e.preventDefault();
        if (b.canEdit && b.state.selected.length) b.duplicateSlides(b.state.selected);
      },
      'mod+s': (e) => {
        e.preventDefault();
        if (b.canEdit) void b.saveNow();
      },
      'mod+enter': (e) => {
        if (inLayer(e.target)) return;
        e.preventDefault();
        void openStage('play', true);
      },
      n: (e) => {
        if (blocked(e) || !b.canEdit) return;
        e.preventDefault();
        ui.openGallery();
      },
    },
    { preventDefault: false },
  );

  const step = (dir: 1 | -1) => {
    const { slides } = b.state.doc;
    if (!slides.length) return;
    const i = slides.findIndex((s) => s.id === b.state.current);
    const next = slides[Math.max(0, Math.min(slides.length - 1, (i < 0 ? 0 : i) + dir))];
    if (next && next.id !== b.state.current) b.select([next.id], next.id);
  };
  const keys = useRef<Record<string, () => void>>({});
  useEffect(() => {
    keys.current = { '[': () => step(-1), ']': () => step(1), '?': () => ui.openPanel('shortcuts') };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      const run = keys.current[e.key];
      if (!run || isEditable(e.target) || inLayer(e.target)) return;
      e.preventDefault();
      run();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
}
