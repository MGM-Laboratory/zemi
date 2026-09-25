import type { Ref } from 'react';
import type { Accent, ReactionKind, RecordingChapter, VideoRef } from '@zemi/shared';

export interface PlayerSources {
  hls?: string | null;
  mp4?: string | null;
  webm?: string | null;
}

/** A WebVTT track. Cross-origin files need CORS on their host (the player then sets crossorigin). */
export interface CaptionTrack {
  src: string;
  srclang: string;
  label: string;
  kind?: 'subtitles' | 'captions';
  default?: boolean;
}

export interface PlayerLiveInfo {
  ingestOnline: boolean;
  viewers: number;
  startedAt: string | null;
}

/** Imperative handle (React 19 `ref` prop). */
export interface ZemiPlayerHandle {
  play(): Promise<void>;
  pause(): void;
  /** Seconds (VOD only). */
  seek(sec: number): void;
  toggleFullscreen(): void;
  /** Float reaction shapes as if they came in over the wire (demos, or a parent that owns the SSE). */
  burst(kind: ReactionKind, count?: number): void;
  readonly video: HTMLVideoElement | null;
}

export interface ZemiPlayerProps {
  mode: 'live' | 'vod';
  sources: PlayerSources;
  poster?: string | null;
  title: string;
  subtitle?: string | null;
  accent?: Accent;
  /** Live: reactions, heartbeats and live viewer count / ingest state via useLiveEvent. */
  eventId?: string;
  live?: PlayerLiveInfo;
  storyboard?: VideoRef['storyboard'];
  chapters?: RecordingChapter[];
  durationSec?: number | null;
  autoPlay?: boolean;
  className?: string;

  /* ---- optional extras (additive to the contract) ---- */

  /** Blurred placeholder under the poster (ImageRef.lqip). */
  posterLqip?: string | null;
  /** Poster fill color while it loads (ImageRef.color). */
  posterColor?: string | null;
  captions?: CaptionTrack[];
  /** Controlled theater state. Omit to let the player keep its own (it sets data-theater on the root). */
  theater?: boolean;
  onTheaterChange?: (theater: boolean) => void;
  /** Show the theater button. Default: true when onTheaterChange is passed. */
  showTheater?: boolean;
  /** Remember the VOD position per source in localStorage. Default true. */
  rememberPosition?: boolean;
  /** Show the live reaction bar. Default true in live mode. */
  reactions?: boolean;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  ref?: Ref<ZemiPlayerHandle>;
}

export type PlayerErrorCode = 'network' | 'media' | 'unsupported' | 'unknown';

export interface PlayerError {
  code: PlayerErrorCode;
  detail?: string;
}

export interface QualityLevel {
  index: number;
  height: number;
  bitrate: number;
  label: string;
}

export type { ReactionKind, RecordingChapter };
