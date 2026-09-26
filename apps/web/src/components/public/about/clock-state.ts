/** Shared, mutable state between the clock's DOM drag layer and its R3F scene (no React state per frame). */
export interface ClockState {
  /** Minutes away from 13:15 the hands are being dragged to. */
  target: number;
  /** Minutes away from 13:15 the hands show right now (springs back to 0). */
  shown: number;
  velocity: number;
  dragging: 'minute' | 'hour' | null;
  /** Set by the scene: re-render one frame (reduced motion uses frameloop="demand"). */
  invalidate?: () => void;
  /** Set by the scene: the hands' clock angles (radians, clockwise from 12) and the face center in client px. */
  hands?: { minute: number; hour: number };
  center?: { x: number; y: number; r: number };
  /** Called by the scene when the shown time changes. */
  onShown?: (minutes: number) => void;
}

export const REST_MINUTES = 13 * 60 + 15;

export function createClockState(): ClockState {
  return { target: 0, shown: 0, velocity: 0, dragging: null };
}

/** "13:15" style label for an offset from 13:15 (wraps around the day). */
export function clockLabel(offsetMinutes: number): string {
  const total = (((REST_MINUTES + Math.round(offsetMinutes)) % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
