'use client';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AttendanceSummary,
  BulkRegistrationResult,
  CheckinResult,
  EmailLogRow,
  Paginated,
  RegistrationRow,
  RegistrationStats,
  ResendResult,
  RosterRow,
} from '@zemi/shared';
import { adminFetch, api } from '@/lib/admin/api';
import { useAdminMutation } from '@/lib/admin/hooks';
import { invalidatePeople, peopleKeys, shortName } from './lib';

export interface RegistrationListParams {
  search?: string;
  status: 'registered' | 'cancelled' | 'all';
  checkedIn: 'yes' | 'no' | 'all';
  mode: 'in-person' | 'online' | 'all';
  source: 'web' | 'admin' | 'walk-in' | 'import' | 'all';
  sort: string;
  page: number;
  pageSize: number;
}

export function useRegistrationStats(eventId: string, enabled = true) {
  return useQuery({
    queryKey: peopleKeys.stats(eventId),
    queryFn: ({ signal }) => api.get<RegistrationStats>(`/admin/events/${eventId}/registrations/stats`, undefined, signal),
    enabled,
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

export function useRegistrationList(eventId: string, params: RegistrationListParams) {
  return useQuery({
    queryKey: peopleKeys.list(eventId, params as unknown as Record<string, unknown>),
    queryFn: ({ signal }) =>
      api.get<Paginated<RegistrationRow>>(`/admin/events/${eventId}/registrations`, { ...params, search: params.search || undefined }, signal),
    placeholderData: keepPreviousData,
  });
}

export function useAttendanceSummary(eventId: string, enabled = true) {
  return useQuery({
    queryKey: peopleKeys.attendance(eventId),
    queryFn: ({ signal }) => api.get<AttendanceSummary>(`/admin/events/${eventId}/attendance`, undefined, signal),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useRoster(eventId: string, params: { search?: string; checkedIn: 'yes' | 'no' | 'all' }, enabled = true) {
  return useQuery({
    queryKey: peopleKeys.roster(eventId, params),
    queryFn: ({ signal }) =>
      api.get<Paginated<RosterRow>>(`/admin/events/${eventId}/attendance/roster`, { ...params, search: params.search || undefined, pageSize: 500 }, signal),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useEmailLog(eventId: string, params: { page: number; pageSize: number; status: 'sent' | 'failed' | 'logged' | 'all'; template?: string }) {
  return useQuery({
    queryKey: peopleKeys.emails(eventId, params),
    queryFn: ({ signal }) => api.get<Paginated<EmailLogRow>>(`/admin/events/${eventId}/emails`, { ...params, template: params.template || undefined }, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
}

/* ------------------------------------------------------------------ mutations */

export type BulkAction = BulkRegistrationResult['action'];

const BULK_DONE: Record<BulkAction, (n: number) => string> = {
  resend: (n) => `Sent ${n} ${n === 1 ? 'ticket' : 'tickets'} again.`,
  cancel: (n) => `Cancelled ${n} ${n === 1 ? 'seat' : 'seats'}.`,
  restore: (n) => `Restored ${n} ${n === 1 ? 'seat' : 'seats'}.`,
  'check-in': (n) => `Checked in ${n} ${n === 1 ? 'person' : 'people'}.`,
  'undo-check-in': (n) => `Undid ${n} ${n === 1 ? 'check-in' : 'check-ins'}.`,
  delete: (n) => `Deleted ${n} ${n === 1 ? 'registration' : 'registrations'}.`,
};

export function bulkMessage(res: BulkRegistrationResult): string {
  const main = BULK_DONE[res.action](res.affected);
  const skipped = res.skipped ? ` ${res.skipped} skipped (already that way).` : '';
  const failed = res.emails?.failed ? ` ${res.emails.failed} emails failed.` : '';
  return `${main}${skipped}${failed}`;
}

export function useBulkRegistrations(eventId: string) {
  const qc = useQueryClient();
  return useAdminMutation({
    mutationFn: (vars: { ids: string[]; action: BulkAction }) =>
      adminFetch<BulkRegistrationResult>(`/admin/events/${eventId}/registrations/bulk`, { method: 'POST', body: vars }),
    successMessage: (res) => bulkMessage(res),
    celebrate: false,
    onSuccess: () => invalidatePeople(qc, eventId),
  });
}

export function useRegistrationActions(eventId: string, device = 'Studio (registrations tab)') {
  const qc = useQueryClient();
  const refresh = () => invalidatePeople(qc, eventId);
  const checkIn = useAdminMutation({
    mutationFn: (r: { id: string; fullName: string; undo?: boolean }) =>
      adminFetch<CheckinResult>(`/admin/registrations/${r.id}/${r.undo ? 'undo-check-in' : 'check-in'}`, { method: 'POST', body: { device } }),
    successMessage: (res, r) => (res.changed ? (r.undo ? `Undid the check-in for ${shortName(r.fullName)}.` : `${shortName(r.fullName)} is in.`) : res.message),
    celebrate: true,
    onSuccess: refresh,
  });
  const resend = useAdminMutation({
    mutationFn: (r: { id: string; fullName: string }) => adminFetch<ResendResult>(`/admin/registrations/${r.id}/resend`, { method: 'POST' }),
    successMessage: (res, r) =>
      res.status === 'failed' ? `The email to ${shortName(r.fullName)} failed. Check the address.` : `Ticket sent to ${shortName(r.fullName)} again.`,
    onSuccess: refresh,
  });
  const patch = useAdminMutation({
    mutationFn: (v: { id: string; body: Record<string, unknown>; message?: string }) =>
      adminFetch<RegistrationRow>(`/admin/registrations/${v.id}`, { method: 'PATCH', body: v.body }),
    successMessage: (_res, v) => v.message ?? 'Saved.',
    errorToast: (err) => (err.hasFieldErrors ? false : err.message),
    onSuccess: refresh,
  });
  const remove = useAdminMutation({
    mutationFn: (r: { id: string; fullName: string }) => adminFetch(`/admin/registrations/${r.id}`, { method: 'DELETE' }),
    successMessage: (_res, r) => `Deleted ${shortName(r.fullName)}'s registration.`,
    onSuccess: refresh,
  });
  return { checkIn, resend, patch, remove };
}
