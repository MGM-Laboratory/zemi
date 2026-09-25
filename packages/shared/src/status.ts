export type EventStatus = 'scheduled' | 'ongoing' | 'past' | 'cancelled';
export type StreamState = 'idle' | 'preview' | 'live' | 'ended';

export function computeEventStatus(
  e: { startsAt: string | Date; endsAt: string | Date; cancelledAt?: string | Date | null },
  streamState: StreamState | null | undefined,
  now: Date = new Date(),
): EventStatus {
  if (e.cancelledAt) return 'cancelled';
  if (streamState === 'live') return 'ongoing';
  const start = new Date(e.startsAt).getTime();
  const end = new Date(e.endsAt).getTime();
  const t = now.getTime();
  if (t < start) return 'scheduled';
  if (t < end) return 'ongoing';
  return 'past';
}

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  scheduled: 'Coming up',
  ongoing: 'Happening now',
  past: 'Wrapped',
  cancelled: 'Cancelled',
};
