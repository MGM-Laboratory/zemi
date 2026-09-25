'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Paginated, SpeakerAdmin, SpeakerInput, Visibility } from '@zemi/shared';
import { adminFetch } from '@/lib/admin/api';
import { adminKeys } from '@/lib/admin/query-keys';
import { nullToBlank } from '../shared/form-utils';
import { toPaginated, type SpeakerRow } from '../shared/types';

export type SpeakerSort = 'name' | 'recent' | 'talks';

export interface SpeakerListParams {
  search?: string;
  visibility?: Visibility | null;
  sort: SpeakerSort;
  page: number;
  pageSize: number;
}

/** GET /admin/speakers?search&visibility&sort&page&pageSize */
export function useSpeakerList(params: SpeakerListParams) {
  const query = {
    search: params.search || undefined,
    visibility: params.visibility || undefined,
    sort: params.sort,
    page: params.page,
    pageSize: params.pageSize,
  };
  return useQuery({
    queryKey: adminKeys.speakers.list(query),
    queryFn: async ({ signal }) =>
      toPaginated(await adminFetch<Paginated<SpeakerRow> | SpeakerRow[]>('/admin/speakers', { query, signal }), params.page, params.pageSize),
    placeholderData: keepPreviousData,
  });
}

/** GET /admin/speakers/:id */
export function useSpeaker(id: string | null) {
  return useQuery({
    queryKey: adminKeys.speakers.detail(id ?? 'none'),
    queryFn: ({ signal }) => adminFetch<SpeakerAdmin>(`/admin/speakers/${id}`, { signal }),
    enabled: Boolean(id),
  });
}

/** Form values: every text field is a string (inputs need '' not null). */
export type SpeakerFormValues = {
  slug: string;
  fullName: string;
  nickname: string;
  headline: string;
  bio: SpeakerInput['bio'];
  avatarAssetId: string | null;
  links: SpeakerInput['links'];
  defaultOrganization: string;
  defaultPosition: string;
  email: string;
  visibility: Visibility;
};

export const EMPTY_SPEAKER: SpeakerFormValues = {
  slug: '',
  fullName: '',
  nickname: '',
  headline: '',
  bio: [],
  avatarAssetId: null,
  links: [],
  defaultOrganization: '',
  defaultPosition: '',
  email: '',
  visibility: 'published',
};

export function speakerToForm(s: SpeakerAdmin): SpeakerFormValues {
  return {
    slug: s.slug,
    fullName: s.fullName,
    nickname: nullToBlank(s.nickname),
    headline: nullToBlank(s.headline),
    bio: Array.isArray(s.bio) ? s.bio : [],
    avatarAssetId: s.avatarAssetId ?? s.avatar?.id ?? null,
    links: Array.isArray(s.links) ? s.links.map((l) => ({ kind: l.kind, url: l.url, label: l.label ?? null })) : [],
    defaultOrganization: nullToBlank(s.defaultOrganization),
    defaultPosition: nullToBlank(s.defaultPosition),
    email: nullToBlank(s.email),
    visibility: s.visibility ?? 'published',
  };
}

export const SPEAKER_NULLABLE = ['nickname', 'headline', 'defaultOrganization', 'defaultPosition', 'email'] as const;

export const SORT_OPTIONS: Array<{ value: SpeakerSort; label: string }> = [
  { value: 'name', label: 'Name, A to Z' },
  { value: 'recent', label: 'Recently updated' },
  { value: 'talks', label: 'Most talks' },
];
