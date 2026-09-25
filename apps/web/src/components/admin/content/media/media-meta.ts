import type { Asset, AssetKind, AssetPurpose, ShapeName } from '@zemi/shared';

export const PURPOSE_LABELS: Record<AssetPurpose, string> = {
  'event-cover': 'Event cover',
  'speaker-avatar': 'Speaker photo',
  'author-avatar': 'Author photo',
  'team-avatar': 'Team photo',
  documentation: 'Documentation',
  'publication-cover': 'Publication cover',
  'publication-pdf': 'Publication PDF',
  recording: 'Recording',
  editor: 'In a text block',
  site: 'Site pages',
};

export const KIND_LABELS: Record<AssetKind, { one: string; many: string; shape: ShapeName }> = {
  image: { one: 'Image', many: 'Images', shape: 'circle' },
  video: { one: 'Video', many: 'Videos', shape: 'triangle' },
  document: { one: 'Document', many: 'Documents', shape: 'square' },
  audio: { one: 'Audio', many: 'Audio', shape: 'arch' },
};

/** "1600 x 2000" or null. */
export function dimensions(a: Pick<Asset, 'width' | 'height'>): string | null {
  return a.width && a.height ? `${a.width} x ${a.height}` : null;
}

/** File extension in caps, like "PDF", from the filename or the mime. */
export function extLabel(a: Pick<Asset, 'originalFilename' | 'mime'>): string {
  const fromName = a.originalFilename.includes('.') ? a.originalFilename.split('.').pop() : null;
  const fromMime = a.mime.split('/')[1]?.split(/[+;]/)[0];
  return (fromName || fromMime || 'file').slice(0, 5).toUpperCase();
}
