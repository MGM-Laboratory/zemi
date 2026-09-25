'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { cn } from '@/lib/utils';
import { formatClock, SPEEDS, speedLabel, storyboardTile, type ChapterSpan, type Storyboard } from './format';
import { CheckIcon, ChevronIcon } from './icons';
import styles from './player.module.css';
import type { QualityLevel } from './types';

export type MenuPage = 'main' | 'speed' | 'quality' | 'captions' | 'chapters';

export interface TextTrackOption {
  index: number;
  label: string;
}

export interface SettingsMenuProps {
  open: boolean;
  page: MenuPage;
  onPage(page: MenuPage): void;
  /** Close; `restoreFocus` sends focus back to the trigger. */
  onClose(restoreFocus: boolean): void;
  triggerRef: RefObject<HTMLElement | null>;
  live: boolean;
  compact: boolean;
  rate: number;
  onRate(rate: number): void;
  levels: QualityLevel[];
  level: number;
  playingLevel: number;
  onLevel(index: number): void;
  tracks: TextTrackOption[];
  activeTrack: number;
  onTrack(index: number): void;
  spans: ChapterSpan[];
  currentChapter: number;
  onChapter(span: ChapterSpan): void;
  storyboard: Storyboard | null;
  duration: number;
  extras: Array<{ key: string; label: string; value?: string; onSelect(): void }>;
}

const ITEM = '[role^="menuitem"]';

function levelName(levels: QualityLevel[], index: number) {
  return levels.find((l) => l.index === index)?.label ?? 'Auto';
}

/**
 * The player's settings menu: one glass panel with pages (speed, quality, captions, chapters)
 * that slide in and out while the panel height springs to fit. Real ARIA menu semantics:
 * roving focus with arrows, Home/End, Right opens a page, Left/Backspace goes back, Escape closes.
 * Rendered inside the player root so it works in fullscreen.
 */
export function SettingsMenu(props: SettingsMenuProps) {
  const { open, page, onPage, onClose, triggerRef } = props;
  const panelRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | 'auto'>('auto');
  const dir = useRef(1);
  const reduced = useReducedMotion();

  // Focus the checked item (or the first) whenever the menu opens or the page changes.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const scope = panel.querySelector<HTMLElement>(`[data-page="${page}"]`) ?? panel;
      const target =
        scope.querySelector<HTMLElement>(`${ITEM}[aria-checked="true"]`) ?? scope.querySelector<HTMLElement>(ITEM);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(id);
  }, [open, page]);

  // Close on outside press.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      onClose(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open, onClose, triggerRef]);

  // Spring the panel height to the current page.
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!open || !el) return;
    // +2 for the panel's 1px borders (border-box).
    const measure = () => setHeight(el.offsetHeight + 2);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, page]);

  const go = (p: MenuPage) => {
    dir.current = p === 'main' ? -1 : 1;
    onPage(p);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const scope = panelRef.current?.querySelector<HTMLElement>(`[data-page="${page}"]`);
    if (!scope) return;
    const items = Array.from(scope.querySelectorAll<HTMLElement>(ITEM));
    const i = items.indexOf(document.activeElement as HTMLElement);
    const focus = (n: number) => items[(n + items.length) % items.length]?.focus();
    switch (e.key) {
      case 'ArrowDown':
        focus(i + 1);
        break;
      case 'ArrowUp':
        focus(i - 1);
        break;
      case 'Home':
        focus(0);
        break;
      case 'End':
        focus(items.length - 1);
        break;
      case 'ArrowRight': {
        const next = (document.activeElement as HTMLElement | null)?.dataset.opens as MenuPage | undefined;
        if (next) go(next);
        break;
      }
      case 'ArrowLeft':
      case 'Backspace':
        if (page !== 'main') go('main');
        break;
      case 'Escape':
        if (page !== 'main') go('main');
        else onClose(true);
        break;
      case 'Tab':
        onClose(true);
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="menu"
          ref={panelRef}
          className={styles.menu}
          data-lenis-prevent
          initial={{ opacity: 0, y: 12, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1, height }}
          exit={{ opacity: 0, y: 8, scale: 0.96, transition: { duration: 0.14 } }}
          transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 460, damping: 36 }}
          onKeyDown={onKeyDown}
        >
          <AnimatePresence mode="popLayout" initial={false} custom={dir.current}>
            <motion.div
              key={page}
              ref={innerRef}
              data-page={page}
              className={styles.menuPage}
              custom={dir.current}
              variants={{
                enter: (d: number) => ({ x: reduced ? 0 : d * 40, opacity: 0 }),
                center: { x: 0, opacity: 1 },
                exit: (d: number) => ({ x: reduced ? 0 : d * -40, opacity: 0 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', stiffness: 520, damping: 40 }}
            >
              <Page {...props} go={go} />
            </motion.div>
          </AnimatePresence>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function Page(props: SettingsMenuProps & { go(p: MenuPage): void }) {
  const { page, go, onClose } = props;
  if (page === 'main') {
    const rows: ReactNode[] = [];
    if (!props.live) {
      rows.push(<SubItem key="speed" label="Speed" value={speedLabel(props.rate)} onOpen={() => go('speed')} opens="speed" />);
    }
    if (props.levels.length > 1) {
      const val =
        props.level === -1
          ? `Auto${props.playingLevel >= 0 ? ` (${levelName(props.levels, props.playingLevel)})` : ''}`
          : levelName(props.levels, props.level);
      rows.push(<SubItem key="quality" label="Quality" value={val} onOpen={() => go('quality')} opens="quality" />);
    }
    if (props.tracks.length) {
      const val = props.activeTrack === -1 ? 'Off' : (props.tracks.find((t) => t.index === props.activeTrack)?.label ?? 'On');
      rows.push(<SubItem key="captions" label="Captions" value={val} onOpen={() => go('captions')} opens="captions" />);
    }
    if (!props.live && props.spans.length) {
      rows.push(
        <SubItem
          key="chapters"
          label="Chapters"
          value={props.spans[props.currentChapter]?.title ?? ''}
          onOpen={() => go('chapters')}
          opens="chapters"
        />,
      );
    }
    for (const x of props.extras) {
      rows.push(
        <button key={x.key} type="button" role="menuitem" tabIndex={-1} className={styles.menuItem} onClick={x.onSelect}>
          <span className={styles.menuLabel}>{x.label}</span>
          {x.value ? <span className={styles.menuValue}>{x.value}</span> : null}
        </button>,
      );
    }
    return (
      <div role="menu" aria-label="Settings" className={styles.menuList}>
        {rows}
      </div>
    );
  }

  const back = (title: string) => (
    <button type="button" role="menuitem" tabIndex={-1} className={cn(styles.menuItem, styles.menuBack)} onClick={() => go('main')}>
      <ChevronIcon dir="left" className={styles.menuChevron} />
      <span className={styles.menuLabel}>{title}</span>
    </button>
  );

  if (page === 'speed') {
    return (
      <div role="menu" aria-label="Playback speed" className={styles.menuList}>
        {back('Speed')}
        {SPEEDS.map((r) => (
          <Radio
            key={r}
            checked={props.rate === r}
            label={speedLabel(r)}
            hint={r === 2 ? 'Speed run' : r === 0.75 ? 'Take it slow' : undefined}
            onSelect={() => {
              props.onRate(r);
              onClose(true);
            }}
          />
        ))}
      </div>
    );
  }

  if (page === 'quality') {
    return (
      <div role="menu" aria-label="Quality" className={styles.menuList}>
        {back('Quality')}
        <Radio
          checked={props.level === -1}
          label="Auto"
          hint={props.playingLevel >= 0 ? levelName(props.levels, props.playingLevel) : 'Picks for your connection'}
          onSelect={() => {
            props.onLevel(-1);
            onClose(true);
          }}
        />
        {props.levels.map((l) => (
          <Radio
            key={l.index}
            checked={props.level === l.index}
            label={l.label}
            badge={l.height >= 720 ? 'HD' : undefined}
            onSelect={() => {
              props.onLevel(l.index);
              onClose(true);
            }}
          />
        ))}
      </div>
    );
  }

  if (page === 'captions') {
    return (
      <div role="menu" aria-label="Captions" className={styles.menuList}>
        {back('Captions')}
        <Radio
          checked={props.activeTrack === -1}
          label="Off"
          onSelect={() => {
            props.onTrack(-1);
            onClose(true);
          }}
        />
        {props.tracks.map((t) => (
          <Radio
            key={t.index}
            checked={props.activeTrack === t.index}
            label={t.label}
            onSelect={() => {
              props.onTrack(t.index);
              onClose(true);
            }}
          />
        ))}
      </div>
    );
  }

  // chapters
  return (
    <div role="menu" aria-label="Chapters" className={cn(styles.menuList, styles.menuChapters)}>
      {back('Chapters')}
      {props.spans.map((s) => {
        const tile = storyboardTile(props.storyboard, s.start + Math.min(5, (s.end - s.start) / 2), 0.5);
        const checked = props.currentChapter === s.index;
        return (
          <button
            key={s.index}
            type="button"
            role="menuitemradio"
            aria-checked={checked}
            tabIndex={-1}
            className={cn(styles.menuItem, styles.chapterItem)}
            onClick={() => {
              props.onChapter(s);
              onClose(true);
            }}
          >
            <span className={styles.chapterThumb} aria-hidden="true">
              {tile ? (
                <span
                  style={{
                    width: tile.width,
                    height: tile.height,
                    backgroundImage: `url("${tile.url}")`,
                    backgroundPosition: `${tile.x}px ${tile.y}px`,
                    backgroundSize: `${tile.sheetWidth}px ${tile.sheetHeight}px`,
                  }}
                />
              ) : (
                <span className={styles.chapterThumbIndex}>{s.index + 1}</span>
              )}
            </span>
            <span className={styles.chapterText}>
              <span className={styles.chapterTitle}>{s.title}</span>
              <span className={cn(styles.chapterTime, 'mono')}>
                {formatClock(s.start, props.duration)} to {formatClock(s.end, props.duration)}
              </span>
            </span>
            {checked ? <span className={styles.chapterNow}>Now</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function SubItem({ label, value, onOpen, opens }: { label: string; value: string; onOpen(): void; opens: MenuPage }) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-haspopup="menu"
      tabIndex={-1}
      data-opens={opens}
      className={styles.menuItem}
      onClick={onOpen}
    >
      <span className={styles.menuLabel}>{label}</span>
      <span className={styles.menuValue}>{value}</span>
      <ChevronIcon className={styles.menuChevron} />
    </button>
  );
}

function Radio({ checked, label, hint, badge, onSelect }: { checked: boolean; label: string; hint?: string; badge?: string; onSelect(): void }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={checked} tabIndex={-1} className={styles.menuItem} onClick={onSelect}>
      <span className={styles.menuCheck} aria-hidden="true">
        {checked ? <CheckIcon /> : null}
      </span>
      <span className={styles.menuLabel}>
        {label}
        {badge ? <span className={styles.menuBadge}>{badge}</span> : null}
      </span>
      {hint ? <span className={styles.menuValue}>{hint}</span> : null}
    </button>
  );
}
