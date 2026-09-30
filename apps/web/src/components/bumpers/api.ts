import type {
  BumperControlInput,
  BumperData,
  BumperEventPick,
  BumperGenerateInput,
  BumperGeneratePreview,
  BumperImagePick,
  BumperListQuery,
  BumperLiveState,
  BumperOutputLinks,
  BumperPresence,
  BumperPublicationData,
  BumperPublicShow,
  BumperResolveInput,
  BumperRevision,
  BumperRevisionDetail,
  BumperShowCreateInput,
  BumperShowDetail,
  BumperShowRow,
  BumperShowUpdateInput,
  BumperSpeakerData,
  BumperTeamData,
  BumperThreadData,
  Paginated,
} from '@zemi/shared';
import { adminFetch, api, apiPath } from '@/lib/admin/api';
import { adminKeys } from '@/lib/admin/query-keys';
import { publicApiUrl } from '@/lib/api/client';

/* ---------------------------------------------------------------- query keys */

export const bumperKeys = {
  all: adminKeys.bumpers.all,
  lists: adminKeys.bumpers.lists,
  list: (q: Partial<BumperListQuery>) => adminKeys.bumpers.list(q),
  detail: (id: string) => adminKeys.bumpers.detail(id),
  live: (id: string) => adminKeys.bumpers.part(id, 'live'),
  output: (id: string) => adminKeys.bumpers.part(id, 'output'),
  revisions: (id: string) => adminKeys.bumpers.part(id, 'revisions'),
  revision: (id: string, revId: string) => adminKeys.bumpers.part(id, 'revision', { revId }),
  source: (kind: string, params: Record<string, unknown>) => ['admin', 'bumpers', 'source', kind, params] as const,
  forEvent: (eventId: string) => adminKeys.events.part(eventId, 'bumpers'),
};

/* ---------------------------------------------------------------- admin calls */

export const bumpersApi = {
  list: (q: Partial<BumperListQuery>, signal?: AbortSignal) => adminFetch<Paginated<BumperShowRow>>('/admin/bumpers', { query: q, signal }),
  get: (id: string, signal?: AbortSignal) => adminFetch<BumperShowDetail>(`/admin/bumpers/${id}`, { signal }),
  create: (input: BumperShowCreateInput) => api.post<BumperShowDetail>('/admin/bumpers', input),
  generate: (input: Partial<BumperGenerateInput> & { eventId: string; create: true }) => api.post<BumperShowDetail>('/admin/bumpers/generate', input),
  preview: (input: Partial<BumperGenerateInput> & { eventId: string }) => api.post<BumperGeneratePreview>('/admin/bumpers/generate', { ...input, create: false }),
  update: (id: string, input: BumperShowUpdateInput) => api.patch<BumperShowDetail>(`/admin/bumpers/${id}`, input),
  remove: (id: string) => api.delete<void>(`/admin/bumpers/${id}`),
  duplicate: (id: string, input: { title?: string; eventId?: string | null } = {}) => api.post<BumperShowDetail>(`/admin/bumpers/${id}/duplicate`, input),
  resolve: (input: Partial<BumperResolveInput>) => api.post<BumperData>('/admin/bumpers/resolve', input),
  revisions: (id: string, signal?: AbortSignal) => adminFetch<BumperRevision[]>(`/admin/bumpers/${id}/revisions`, { signal }),
  revision: (id: string, revId: string, signal?: AbortSignal) => adminFetch<BumperRevisionDetail>(`/admin/bumpers/${id}/revisions/${revId}`, { signal }),
  restore: (id: string, revId: string, baseVersion: number) => api.post<BumperShowDetail>(`/admin/bumpers/${id}/revisions/${revId}/restore`, { baseVersion }),
  output: (id: string, signal?: AbortSignal) => adminFetch<BumperOutputLinks>(`/admin/bumpers/${id}/output`, { signal }),
  rotate: (id: string, which: 'output' | 'control' | 'both') => api.post<BumperOutputLinks>(`/admin/bumpers/${id}/output/rotate`, { which }),
  live: (id: string, signal?: AbortSignal) => adminFetch<{ state: BumperLiveState; presence: BumperPresence }>(`/admin/bumpers/${id}/live`, { signal }),
  control: (id: string, input: BumperControlInput) => api.post<BumperLiveState>(`/admin/bumpers/${id}/live`, input),
  sources: {
    events: (q: { q?: string; limit?: number }, signal?: AbortSignal) => adminFetch<BumperEventPick[]>('/admin/bumpers/sources/events', { query: q, signal }),
    speakers: (q: { q?: string; eventId?: string; limit?: number }, signal?: AbortSignal) => adminFetch<BumperSpeakerData[]>('/admin/bumpers/sources/speakers', { query: q, signal }),
    publications: (q: { q?: string; eventId?: string; limit?: number }, signal?: AbortSignal) => adminFetch<BumperPublicationData[]>('/admin/bumpers/sources/publications', { query: q, signal }),
    team: (q: { q?: string; limit?: number }, signal?: AbortSignal) => adminFetch<BumperTeamData[]>('/admin/bumpers/sources/team', { query: q, signal }),
    threads: (q: { q?: string; eventId?: string; limit?: number }, signal?: AbortSignal) => adminFetch<BumperThreadData[]>('/admin/bumpers/sources/threads', { query: q, signal }),
    images: (q: { q?: string; eventId?: string; limit?: number }, signal?: AbortSignal) => adminFetch<BumperImagePick[]>('/admin/bumpers/sources/images', { query: q, signal }),
  },
};

/** Same-origin admin SSE for a show's playback (through the Next rewrite, cookie auth). */
export function adminLiveStreamUrl(id: string, clientId: string): string {
  return apiPath(`/admin/bumpers/${id}/live/stream?cid=${encodeURIComponent(clientId)}&client=controller`);
}

/* ---------------------------------------------------------------- public (token) calls */

const KEY_RE = /^[A-Za-z0-9]{24,64}$/;
export const isBumperKey = (k: string) => KEY_RE.test(k);

async function publicJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(publicApiUrl(path), { cache: 'no-store', ...init, headers: { accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers } });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let code = 'error';
    try {
      const body = (await res.json()) as { error?: { message?: string; code?: string } };
      message = body.error?.message ?? message;
      code = body.error?.code ?? code;
    } catch {
      /* not json */
    }
    throw Object.assign(new Error(message), { status: res.status, code });
  }
  return (await res.json()) as T;
}

export const publicBumpers = {
  output: (key: string, signal?: AbortSignal) => publicJson<BumperPublicShow>(`/api/v1/public/bumpers/out/${key}`, { signal }),
  control: (key: string, signal?: AbortSignal) => publicJson<BumperPublicShow>(`/api/v1/public/bumpers/control/${key}`, { signal }),
  /** The dock calls this same-origin (through the rewrite) so no CORS preflight is involved. */
  send: (key: string, input: BumperControlInput) =>
    fetch(`/api/v1/public/bumpers/control/${key}`, { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(input) }).then(async (res) => {
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string } };
        throw Object.assign(new Error(body.error?.message ?? `Request failed (${res.status})`), { status: res.status, code: body.error?.code });
      }
      return (await res.json()) as BumperLiveState;
    }),
  outputStreamUrl: (key: string, clientId: string, obs: boolean) => publicApiUrl(`/api/v1/public/bumpers/out/${key}/stream?cid=${encodeURIComponent(clientId)}${obs ? '&obs=1' : ''}`),
  controlStreamUrl: (key: string, clientId: string, obs: boolean) => publicApiUrl(`/api/v1/public/bumpers/control/${key}/stream?cid=${encodeURIComponent(clientId)}${obs ? '&obs=1' : ''}`),
};

/* ---------------------------------------------------------------- data helpers */

/** Merge resolved data (records picked in the builder) into a bundle. Later wins. */
export function mergeData(a: BumperData, b: Partial<BumperData>): BumperData {
  return {
    ...a,
    events: { ...a.events, ...(b.events ?? {}) },
    speakers: { ...a.speakers, ...(b.speakers ?? {}) },
    publications: { ...a.publications, ...(b.publications ?? {}) },
    team: { ...a.team, ...(b.team ?? {}) },
    threads: { ...a.threads, ...(b.threads ?? {}) },
    images: { ...a.images, ...(b.images ?? {}) },
    site: b.site ?? a.site,
    nextEventId: b.nextEventId !== undefined ? b.nextEventId : a.nextEventId,
    generatedAt: b.generatedAt ?? a.generatedAt,
  };
}

/** A random id for slides, items, elements and SSE clients. */
export function newBumperId(prefix = ''): string {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = typeof crypto !== 'undefined' && crypto.getRandomValues ? crypto.getRandomValues(new Uint8Array(10)) : Array.from({ length: 10 }, () => Math.floor(Math.random() * 256));
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `${prefix}${out}`;
}
