import type { VenueKind } from '@zemi/shared';
import { Building2, FlaskConical, MapPin, School, Theater, Wifi, type LucideIcon } from 'lucide-react';

export const VENUE_KIND_META: Record<VenueKind, { label: string; icon: LucideIcon; hint: string; tone: 'blue' | 'red' | 'yellow' | 'green' | 'neutral' }> = {
  classroom: { label: 'Classroom', icon: School, hint: 'Rows of chairs, a projector, the usual.', tone: 'blue' },
  theater: { label: 'Theater', icon: Theater, hint: 'Big room, raked seats, a proper stage.', tone: 'red' },
  lab: { label: 'Lab', icon: FlaskConical, hint: 'Cozy, a bit cluttered, very honest.', tone: 'green' },
  hall: { label: 'Hall', icon: Building2, hint: 'Flat floor, room for posters and coffee.', tone: 'yellow' },
  online: { label: 'Online', icon: Wifi, hint: 'No room, just the livestream.', tone: 'neutral' },
  other: { label: 'Other', icon: MapPin, hint: 'Anything else. The garden counts.', tone: 'neutral' },
};

/** "Building A · floor 3 · 120 seats" */
export function venueSummary(v: { building?: string | null; floor?: string | null; capacity?: number | null }): string {
  return [v.building, v.floor ? `floor ${v.floor}` : null, v.capacity != null ? `${v.capacity.toLocaleString('en-US')} seats` : null].filter(Boolean).join(' · ');
}
