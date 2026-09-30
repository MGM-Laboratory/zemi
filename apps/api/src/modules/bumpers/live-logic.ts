/**
 * Playback rules (pure, unit tested in live-logic.spec.ts). The server is the authority: these
 * functions turn the stored live_* columns plus a control action (or the auto-advance clock, or a
 * content edit) into the columns to write. `null` means "nothing changes", so the caller neither
 * bumps `live_seq` nor broadcasts.
 */
import {
  BUMPER_TRANSITIONS,
  bumperAutoNext,
  bumperPlayable,
  bumperStep,
  jakartaDateInput,
  pickBumperTransition,
  type BumperControlInput,
  type BumperControlVia,
  type BumperLiveState,
  type BumperOutputMode,
  type BumperSlide,
  type BumperTheme,
  type BumperTransitionKey,
} from '@zemi/shared';
import { AppError, badRequest, notFound } from '../../common/errors.js';

export interface LiveFields {
  liveSlideId: string | null;
  liveFromSlideId: string | null;
  liveTransition: string | null;
  liveDir: number;
  liveMode: BumperOutputMode;
  liveAutoplay: boolean;
  liveAdvanceAt: Date | null;
  liveStartedAt: Date | null;
  liveCue: number;
  /** When the current slide came on screen (or was replayed): countdowns in minutes count from here. */
  liveSlideSince: Date | null;
}

export interface LiveShow extends LiveFields {
  slides: BumperSlide[];
  theme: BumperTheme;
}

export type LivePatch = Partial<LiveFields>;

/** The slide on screen: the stored one while it is playable, else the first playable one. */
export function currentSlide(
  slides: readonly BumperSlide[],
  liveSlideId: string | null,
): BumperSlide | null {
  const list = bumperPlayable(slides);
  return list.find((s) => s.id === liveSlideId) ?? list[0] ?? null;
}

/**
 * When auto-advance fires for this slide: only on screen (`show` mode), with autoplay on, a slide
 * that has `autoAdvanceSec`, and somewhere to go (the last slide without a loop just stays).
 */
export function advanceDeadline(
  slides: readonly BumperSlide[],
  slideId: string | null,
  mode: BumperOutputMode,
  autoplay: boolean,
  now: Date,
): Date | null {
  if (mode !== 'show' || !autoplay || !slideId) return null;
  const slide = bumperPlayable(slides).find((s) => s.id === slideId);
  const sec = slide?.timing.autoAdvanceSec;
  if (!slide || !sec || !bumperAutoNext(slides, slide.id)) return null;
  return new Date(now.getTime() + sec * 1000);
}

/** "First control of the day" is a Jakarta calendar day. */
export const sameJakartaDay = (a: Date, b: Date): boolean =>
  jakartaDateInput(a) === jakartaDateInput(b);

/** Operator (or dock, or Companion) presses a button. Throws for a goto that can't land. */
export function planControl(
  show: LiveShow,
  input: BumperControlInput,
  now: Date,
): LivePatch | null {
  const list = bumperPlayable(show.slides);
  const cur = currentSlide(show.slides, show.liveSlideId);
  const posOf = (id: string) => list.findIndex((s) => s.id === id);

  let slide = cur;
  let from = show.liveFromSlideId;
  let transition = show.liveTransition;
  let dir = show.liveDir === -1 ? -1 : 1;
  let mode = show.liveMode;
  let autoplay = show.liveAutoplay;
  let cue = show.liveCue;
  let startedAt = show.liveStartedAt;
  let since = show.liveSlideSince;

  const move = (target: BumperSlide | null | undefined, forceDir?: 1 | -1): boolean => {
    if (!target || target.id === cur?.id) return false;
    since = now;
    from = cur?.id ?? null;
    transition = pickBumperTransition(cur, target, {
      motion: show.theme.motion,
      override: input.transition ?? null,
    });
    dir = forceDir ?? (cur && posOf(target.id) < posOf(cur.id) ? -1 : 1);
    slide = target;
    return true;
  };

  /** Nothing moves: the press only counts to start a clock that should be running (see below). */
  let still = false;
  switch (input.action) {
    case 'next':
    case 'prev': {
      // Two clickers pressing at once: the second one no longer matches and changes nothing at all.
      if (input.fromSlideId != null && input.fromSlideId !== cur?.id) return null;
      still = !move(bumperStep(show.slides, cur?.id ?? null, input.action === 'next' ? 1 : -1));
      break;
    }
    case 'goto': {
      let target: BumperSlide | undefined;
      if (input.slideId) {
        target = list.find((s) => s.id === input.slideId);
        if (!target) {
          if (show.slides.some((s) => s.id === input.slideId))
            throw new AppError(
              409,
              'hidden',
              'That bumper is hidden. Unhide it in the builder to play it.',
            );
          throw notFound("That bumper isn't in the show anymore.");
        }
      } else if (input.position) {
        target = list[input.position - 1];
        if (!target)
          throw notFound(`There is no bumper ${input.position}. This show plays ${list.length}.`);
      } else {
        throw badRequest('Say where to go: a slideId or a position.');
      }
      still = !move(target);
      break;
    }
    case 'first':
      still = !move(list[0]);
      break;
    case 'last':
      still = !move(list[list.length - 1]);
      break;
    case 'show':
    case 'black':
    case 'clear':
      if (mode === input.action) still = true;
      mode = input.action;
      break;
    case 'toggle-black':
      mode = mode === 'black' ? 'show' : 'black';
      break;
    case 'autoplay-on':
    case 'autoplay-off': {
      const on = input.action === 'autoplay-on';
      if (autoplay === on) still = true;
      autoplay = on;
      break;
    }
    case 'replay':
      if (!cur) return null;
      cue += 1;
      since = now;
      break;
    case 'reset':
      move(list[0], -1);
      since = now;
      mode = 'show';
      autoplay = true;
      break;
  }

  if (input.action === 'reset') startedAt = null;
  else if (!startedAt || !sameJakartaDay(startedAt, now)) startedAt = now;

  const advanceAt = advanceDeadline(show.slides, slide?.id ?? null, mode, autoplay, now);
  if (still) {
    // A fresh show sits on its first slide with the clock stopped: the first press (even "first"
    // while already there) starts it. A clock that already runs keeps its deadline. The press also
    // stamps "running since" and the current slide's start when they are missing.
    const patch: LivePatch = {};
    if (!show.liveAdvanceAt && advanceAt) patch.liveAdvanceAt = advanceAt;
    if (startedAt && startedAt !== show.liveStartedAt) {
      patch.liveStartedAt = startedAt;
      if (!show.liveSlideSince && cur) patch.liveSlideSince = now;
    }
    return Object.keys(patch).length ? patch : null;
  }

  return {
    liveSlideId: slide?.id ?? null,
    liveFromSlideId: from,
    liveTransition: transition,
    liveDir: dir,
    liveMode: mode,
    liveAutoplay: autoplay,
    liveAdvanceAt: advanceAt,
    liveStartedAt: startedAt,
    liveCue: cue,
    liveSlideSince: since,
  };
}

/**
 * The auto-advance clock ran out. Moves along the loop (or to the next slide), always forwards.
 * A deadline that no longer applies (paused, blacked out, last slide) is simply cleared.
 */
export function planAuto(show: LiveShow, now: Date): LivePatch | null {
  if (!show.liveAdvanceAt || show.liveAdvanceAt.getTime() > now.getTime()) return null;
  const cur = currentSlide(show.slides, show.liveSlideId);
  const target =
    cur && show.liveMode === 'show' && show.liveAutoplay
      ? bumperAutoNext(show.slides, cur.id)
      : null;
  if (!cur || !target) return { liveAdvanceAt: null };
  if (target.id === cur.id) {
    // A slide that loops onto itself replays its entrance.
    return {
      liveCue: show.liveCue + 1,
      liveSlideSince: now,
      liveAdvanceAt: advanceDeadline(show.slides, cur.id, show.liveMode, show.liveAutoplay, now),
    };
  }
  return {
    liveSlideId: target.id,
    liveFromSlideId: cur.id,
    liveTransition: pickBumperTransition(cur, target, { motion: show.theme.motion }),
    liveDir: 1,
    liveSlideSince: now,
    liveAdvanceAt: advanceDeadline(show.slides, target.id, show.liveMode, show.liveAutoplay, now),
  };
}

/** Where auto-advance would go from a slide and after how long (to see whether an edit changed it). */
function timingKey(slides: readonly BumperSlide[], slideId: string): string {
  const s = slides.find((x) => x.id === slideId);
  return `${s?.timing.autoAdvanceSec ?? ''}>${bumperAutoNext(slides, slideId)?.id ?? ''}`;
}

/**
 * The slides were edited (PATCH or a revision restore). If the live slide is gone or hidden, the
 * show moves to the slide now at its old position; if its timing changed, the clock restarts.
 */
export function planSlidesChange(
  show: LiveShow,
  nextSlides: readonly BumperSlide[],
  now: Date,
): LivePatch | null {
  const before = bumperPlayable(show.slides);
  const after = bumperPlayable(nextSlides);
  const cur = currentSlide(show.slides, show.liveSlideId);
  if (cur && after.some((s) => s.id === cur.id)) {
    if (timingKey(show.slides, cur.id) === timingKey(nextSlides, cur.id)) return null;
    const advance = advanceDeadline(nextSlides, cur.id, show.liveMode, show.liveAutoplay, now);
    return advance?.getTime() === show.liveAdvanceAt?.getTime() ? null : { liveAdvanceAt: advance };
  }
  const oldPos = cur
    ? Math.max(
        0,
        before.findIndex((s) => s.id === cur.id),
      )
    : 0;
  const target = after[Math.min(oldPos, after.length - 1)] ?? null;
  if ((target?.id ?? null) === show.liveSlideId && show.liveSlideId !== null) return null;
  return {
    liveSlideId: target?.id ?? null,
    liveFromSlideId: null,
    liveTransition: target
      ? pickBumperTransition(null, target, { motion: show.theme.motion })
      : null,
    liveDir: 1,
    liveSlideSince: target ? now : null,
    liveAdvanceAt: advanceDeadline(
      nextSlides,
      target?.id ?? null,
      show.liveMode,
      show.liveAutoplay,
      now,
    ),
  };
}

const TRANSITIONS: ReadonlySet<string> = new Set(BUMPER_TRANSITIONS);
const VIAS: ReadonlySet<string> = new Set(['admin', 'dock', 'api', 'auto', 'system']);

export interface LiveRow extends LiveShow {
  id: string;
  version: number;
  liveUpdatedAt: Date;
  liveSeq: number;
  liveVia: string | null;
  liveBy: string | null;
}

/** The state DTO every screen converges on (position and total count playable slides only). */
export function toLiveState(row: LiveRow, now: Date = new Date()): BumperLiveState {
  const list = bumperPlayable(row.slides);
  const cur = currentSlide(row.slides, row.liveSlideId);
  return {
    showId: row.id,
    slideId: cur?.id ?? null,
    // A stored start only counts for the slide it was stamped for (a fresh show has none yet).
    slideSince: cur && cur.id === row.liveSlideId && row.liveSlideSince ? row.liveSlideSince.toISOString() : null,
    position: cur ? list.indexOf(cur) : -1,
    total: list.length,
    fromSlideId: row.liveFromSlideId,
    transition:
      row.liveTransition && TRANSITIONS.has(row.liveTransition)
        ? (row.liveTransition as BumperTransitionKey)
        : null,
    dir: row.liveDir === -1 ? -1 : 1,
    mode: row.liveMode,
    autoplay: row.liveAutoplay,
    advanceAt: row.liveAdvanceAt ? row.liveAdvanceAt.toISOString() : null,
    startedAt: row.liveStartedAt ? row.liveStartedAt.toISOString() : null,
    updatedAt: row.liveUpdatedAt.toISOString(),
    seq: row.liveSeq,
    cue: row.liveCue,
    via: row.liveVia && VIAS.has(row.liveVia) ? (row.liveVia as BumperControlVia) : 'system',
    by: row.liveBy,
    serverNow: now.toISOString(),
    version: row.version,
  };
}
