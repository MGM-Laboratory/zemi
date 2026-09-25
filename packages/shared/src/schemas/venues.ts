import { z } from 'zod';
import { VENUE_KINDS } from '../constants.js';
import { optionalUrl } from './common.js';

export const venueInput = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(VENUE_KINDS),
  building: z.string().max(120).optional().nullable(),
  floor: z.string().max(40).optional().nullable(),
  capacity: z.number().int().min(0).max(100000).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  mapsUrl: optionalUrl,
  notes: z.string().max(1000).optional().nullable(),
});
export type VenueInput = z.infer<typeof venueInput>;

export interface Venue {
  id: string;
  name: string;
  kind: (typeof VENUE_KINDS)[number];
  building: string | null;
  floor: string | null;
  capacity: number | null;
  address: string | null;
  mapsUrl: string | null;
  notes: string | null;
  eventCount: number;
  createdAt: string;
  updatedAt: string;
}
