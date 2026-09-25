import { z } from 'zod';
import {
  ACCENTS,
  ASSET_PURPOSES,
  LINK_KINDS,
  SLUG_MAX,
  SLUG_PATTERN,
  VISIBILITIES,
} from '../constants.js';

export const idSchema = z.uuid();
export const isoDate = z.iso.datetime({ offset: true });
export const slugSchema = z
  .string()
  .min(1)
  .max(SLUG_MAX)
  .regex(SLUG_PATTERN, 'Use lowercase letters, numbers and dashes, like "my-first-talk".');
export const hhmmSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm, like 13:15');
export const urlSchema = z.url({ protocol: /^https?$/ });
export const optionalUrl = z.union([urlSchema, z.literal('')]).optional().nullable();
export const visibilitySchema = z.enum(VISIBILITIES);
export const accentSchema = z.enum(ACCENTS);
export const assetPurposeSchema = z.enum(ASSET_PURPOSES);

/** BlockNote document (array of blocks). Stored and returned as-is. */
export const blocksSchema = z.array(z.record(z.string(), z.unknown()));
export type Blocks = Array<Record<string, unknown>>;

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const linkSchema = z.object({
  kind: z.enum(LINK_KINDS),
  url: z.string().min(1).max(2048),
  label: z.string().max(120).optional().nullable(),
});
export type LinkItem = z.infer<typeof linkSchema>;

/** Image as returned to clients. URLs are absolute. */
export interface ImageSource {
  width: number;
  url: string;
}
export interface ImageRef {
  id: string;
  width: number;
  height: number;
  alt: string | null;
  lqip: string | null; // data URL
  color: string | null; // #rrggbb
  avif: ImageSource[];
  webp: ImageSource[];
  /** Largest webp, handy for og:image and emails. */
  src: string;
}

export interface VideoRef {
  id: string;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  poster: string | null;
  mp4: string | null;
  webm: string | null;
  hls: string | null;
  storyboard: { url: string; interval: number; columns: number; tileWidth: number; tileHeight: number; count: number } | null;
}

export interface FileRef {
  id: string;
  url: string;
  filename: string;
  mime: string;
  sizeBytes: number;
}

export const cropSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number().min(-360).max(360).default(0),
});
export type Crop = z.infer<typeof cropSchema>;

export const adjustSchema = z.object({
  brightness: z.number().min(0.2).max(2).default(1),
  contrast: z.number().min(0.2).max(2).default(1),
  saturation: z.number().min(0).max(2).default(1),
  hue: z.number().min(-180).max(180).default(0),
  sharpen: z.boolean().default(false),
  grayscale: z.boolean().default(false),
});
export type Adjust = z.infer<typeof adjustSchema>;

export type AssetStatus = 'processing' | 'ready' | 'failed';
export type AssetKind = 'image' | 'video' | 'document' | 'audio';

/** Admin-facing asset record. */
export interface Asset {
  id: string;
  kind: AssetKind;
  purpose: z.infer<typeof assetPurposeSchema>;
  status: AssetStatus;
  error: string | null;
  originalFilename: string;
  mime: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  alt: string | null;
  caption: string | null;
  credit: string | null;
  crop: Crop | null;
  adjust: Adjust | null;
  originalUrl: string;
  image: ImageRef | null;
  video: VideoRef | null;
  file: FileRef | null;
  createdAt: string;
}

export const assetMetaInput = z.object({
  alt: z.string().max(300).optional().nullable(),
  caption: z.string().max(500).optional().nullable(),
  credit: z.string().max(200).optional().nullable(),
});

export const recropInput = z.object({ crop: cropSchema.nullable(), adjust: adjustSchema.nullable() });

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
