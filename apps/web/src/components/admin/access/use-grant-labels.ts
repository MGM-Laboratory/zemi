'use client';

import { useQueries } from '@tanstack/react-query';
import { formatJakarta, type EventStatus, type ImageRef, type Policy, type ResourceType } from '@zemi/shared';
import { useCallback, useMemo, useState } from 'react';
import { adminFetch, isApiError } from '@/lib/admin/api';
import { adminKeys } from '@/lib/admin/query-keys';

/** What the editor knows about a granted item. */
export interface ItemInfo {
  /** "Zemi #88" or the title, for sentences. */
  short: string;
  /** Full title. */
  title: string;
  /** "Fri, 2 Oct 2026" or an organization. */
  sub?: string | null;
  status?: EventStatus;
  image?: ImageRef | null;
}

export type ItemState = { kind: 'ready'; info: ItemInfo } | { kind: 'loading' } | { kind: 'missing' } | { kind: 'error' };

type EventLike = { id: string; number: number | null; title: string; startsAt: string; status?: EventStatus; cover?: ImageRef | null };
type SpeakerLike = { id: string; fullName: string; headline?: string | null; defaultOrganization?: string | null; avatar?: ImageRef | null };
type PublicationLike = { id: string; title: string; publishedYear?: number | null; containerTitle?: string | null; cover?: ImageRef | null };

export function eventInfo(e: EventLike): ItemInfo {
  return {
    short: e.number != null ? `Zemi #${e.number}` : `"${e.title}"`,
    title: e.title,
    sub: formatJakarta(e.startsAt, 'date'),
    status: e.status,
    image: e.cover ?? null,
  };
}

export function speakerInfo(s: SpeakerLike): ItemInfo {
  return { short: s.fullName, title: s.fullName, sub: s.headline || s.defaultOrganization || null, image: s.avatar ?? null };
}

export function publicationInfo(p: PublicationLike): ItemInfo {
  const t = p.title.length > 48 ? `${p.title.slice(0, 45)}...` : p.title;
  return { short: `"${t}"`, title: p.title, sub: [p.publishedYear, p.containerTitle].filter(Boolean).join(' · ') || null, image: p.cover ?? null };
}

const PATHS: Record<ResourceType, (id: string) => string> = {
  event: (id) => `/admin/events/${id}`,
  speaker: (id) => `/admin/speakers/${id}`,
  publication: (id) => `/admin/publications/${id}`,
};

const KEYS = {
  event: adminKeys.events,
  speaker: adminKeys.speakers,
  publication: adminKeys.publications,
} as const;

function toInfo(type: ResourceType, data: unknown): ItemInfo {
  if (type === 'event') return eventInfo(data as EventLike);
  if (type === 'speaker') return speakerInfo(data as SpeakerLike);
  return publicationInfo(data as PublicationLike);
}

/**
 * Names for every specific grant in a policy. Items picked in this session are remembered locally
 * (no extra request); the rest load by id. A 404 means the item was deleted.
 */
export function useGrantLabels(policy: Policy) {
  const [known, setKnown] = useState<Record<string, ItemInfo>>({});
  const targets = useMemo(
    () => policy.grants.filter((g) => g.id !== '*' && !known[`${g.type}:${g.id}`]).map((g) => ({ type: g.type, id: g.id })),
    [policy.grants, known],
  );
  const results = useQueries({
    queries: targets.map((t) => ({
      queryKey: [...KEYS[t.type].detail(t.id), 'label'] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => adminFetch<unknown>(PATHS[t.type](t.id), { signal }),
      staleTime: 60_000,
      retry: false,
    })),
  });

  const remember = useCallback((type: ResourceType, id: string, info: ItemInfo) => {
    setKnown((k) => ({ ...k, [`${type}:${id}`]: info }));
  }, []);

  const state = useCallback(
    (type: ResourceType, id: string): ItemState => {
      const hit = known[`${type}:${id}`];
      if (hit) return { kind: 'ready', info: hit };
      const idx = targets.findIndex((t) => t.type === type && t.id === id);
      const r = idx >= 0 ? results[idx] : undefined;
      if (!r || r.isPending) return { kind: 'loading' };
      if (r.isError) return isApiError(r.error) && (r.error.isNotFound || r.error.status === 400) ? { kind: 'missing' } : { kind: 'error' };
      return { kind: 'ready', info: toInfo(type, r.data) };
    },
    [known, targets, results],
  );

  const label = useCallback(
    (type: ResourceType, id: string): string => {
      const s = state(type, id);
      if (s.kind === 'ready') return s.info.short;
      if (s.kind === 'missing') return `a deleted ${type}`;
      return `1 ${type}`;
    },
    [state],
  );

  return { state, label, remember };
}
