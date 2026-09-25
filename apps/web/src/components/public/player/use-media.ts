'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

export interface MediaSnapshot {
  paused: boolean;
  ended: boolean;
  /** Played at least once for the current source. */
  started: boolean;
  /** Stalled waiting for data (debounced by the UI). */
  buffering: boolean;
  /** Seconds, Infinity for live, NaN before metadata. */
  duration: number;
  /** Whole seconds (the smooth playhead is drawn from the element directly). */
  time: number;
  volume: number;
  muted: boolean;
  rate: number;
  buffered: Array<[number, number]>;
  /** readyState >= HAVE_METADATA */
  ready: boolean;
  pip: boolean;
}

const INITIAL: MediaSnapshot = {
  paused: true,
  ended: false,
  started: false,
  buffering: false,
  duration: Number.NaN,
  time: 0,
  volume: 1,
  muted: false,
  rate: 1,
  buffered: [],
  ready: false,
  pip: false,
};

const EVENTS = [
  'play',
  'pause',
  'playing',
  'waiting',
  'stalled',
  'seeking',
  'seeked',
  'timeupdate',
  'durationchange',
  'loadedmetadata',
  'loadeddata',
  'canplay',
  'progress',
  'volumechange',
  'ratechange',
  'ended',
  'emptied',
  'enterpictureinpicture',
  'leavepictureinpicture',
] as const;

function readBuffered(v: HTMLVideoElement): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const b = v.buffered;
  for (let i = 0; i < b.length; i++) out.push([b.start(i), b.end(i)]);
  return out;
}

const sameRanges = (a: Array<[number, number]>, b: Array<[number, number]>) =>
  a.length === b.length && a.every((r, i) => Math.abs(r[0] - b[i]![0]) < 0.25 && Math.abs(r[1] - b[i]![1]) < 0.25);

function equal(a: MediaSnapshot, b: MediaSnapshot) {
  return (
    a.paused === b.paused &&
    a.ended === b.ended &&
    a.started === b.started &&
    a.buffering === b.buffering &&
    (a.duration === b.duration || (Number.isNaN(a.duration) && Number.isNaN(b.duration))) &&
    a.time === b.time &&
    a.volume === b.volume &&
    a.muted === b.muted &&
    a.rate === b.rate &&
    a.ready === b.ready &&
    a.pip === b.pip &&
    sameRanges(a.buffered, b.buffered)
  );
}

/**
 * Subscribes to a <video> and returns a coarse snapshot (re-renders about once a second while
 * playing). `resetKey` clears the "started" flag when a new source is loaded.
 */
export function useMedia(videoRef: RefObject<HTMLVideoElement | null>, resetKey: string): MediaSnapshot {
  const [snap, setSnap] = useState<MediaSnapshot>(INITIAL);
  const started = useRef(false);
  const buffering = useRef(false);
  const lastKey = useRef(resetKey);

  useEffect(() => {
    if (!Object.is(lastKey.current, resetKey)) {
      lastKey.current = resetKey;
      started.current = false;
    }
    const v = videoRef.current;
    if (!v) return;

    const update = (type?: string) => {
      switch (type) {
        case 'playing':
          started.current = true;
          buffering.current = false;
          break;
        case 'waiting':
        case 'stalled':
          if (!v.paused) buffering.current = true;
          break;
        case 'seeking':
          if (v.readyState < 3) buffering.current = true;
          break;
        case 'canplay':
        case 'seeked':
        case 'pause':
        case 'ended':
        case 'emptied':
          if (type !== 'seeked' || v.readyState >= 3) buffering.current = false;
          break;
        case 'timeupdate':
          if (buffering.current && v.readyState >= 3 && !v.seeking) buffering.current = false;
          break;
      }
      const pipEl = typeof document !== 'undefined' ? document.pictureInPictureElement : null;
      const next: MediaSnapshot = {
        paused: v.paused,
        ended: v.ended,
        started: started.current,
        buffering: buffering.current,
        duration: v.duration,
        time: Math.floor(v.currentTime || 0),
        volume: v.volume,
        muted: v.muted,
        rate: v.playbackRate,
        buffered: readBuffered(v),
        ready: v.readyState >= 1,
        pip: pipEl === v || (v as HTMLVideoElement & { webkitPresentationMode?: string }).webkitPresentationMode === 'picture-in-picture',
      };
      setSnap((prev) => (equal(prev, next) ? prev : next));
    };

    const handlers = EVENTS.map((type) => {
      const h = () => update(type);
      v.addEventListener(type, h);
      return [type, h] as const;
    });
    const onPresentation = () => update();
    v.addEventListener('webkitpresentationmodechanged', onPresentation);
    update();
    return () => {
      for (const [type, h] of handlers) v.removeEventListener(type, h);
      v.removeEventListener('webkitpresentationmodechanged', onPresentation);
    };
  }, [videoRef, resetKey]);

  return snap;
}
