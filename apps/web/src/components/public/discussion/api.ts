import type { Blocks } from '@zemi/shared';

export interface Identity { id: string; name: string; tag: string; label: string }
export interface EventOption { id: string; slug: string; title: string; number: number | null; startsAt: string; endsAt: string; summary?: string | null; speakers?: string[]; accent?: string; featured?: boolean; current?: boolean; cover?: { src: string; alt: string | null; width: number; height: number } | null }
export interface Thread {
  id: string; author: string; authorId: string | null; mine: boolean; title: string; body: Blocks; excerpt: string;
  tags: string[]; status: string; pinned: boolean; score: number; myVote: number; myReactions: string[];
  commentCount: number; acceptedCommentId: string | null; event: EventOption | null; featured: boolean;
  createdAt: string; updatedAt: string;
}
export interface Reply { id: string; parentId: string | null; author: string; authorId: string | null; mine: boolean; body: string; status: string; score: number; myVote: number; createdAt: string }
export interface ThreadDetail extends Thread { comments: Reply[] }
export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }

export async function discussionRequest<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, data?: unknown): Promise<T> {
  const response = await fetch(`/api/v1/public/discussion${path}`, {
    method, credentials: 'same-origin', cache: 'no-store',
    headers: { accept: 'application/json', ...(method !== 'GET' ? { 'x-zemi-csrf': '1' } : {}), ...(data !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  if (!response.ok) {
    const json = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(json?.error?.message || `Request failed (${response.status}).`);
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

export async function uploadDiscussionImage(file: File, challenge: string): Promise<string> {
  const data = new FormData();
  data.append('file', file);
  data.append('challenge', challenge);
  const response = await fetch('/api/v1/public/discussion/images', { method: 'POST', credentials: 'same-origin', headers: { 'x-zemi-csrf': '1' }, body: data });
  if (!response.ok) {
    const json = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(json?.error?.message || 'The image could not be uploaded.');
  }
  return (await response.json() as { url: string }).url;
}
