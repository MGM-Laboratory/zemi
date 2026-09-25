'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Me } from '@zemi/shared';
import { adminFetch, errorMessage, isApiError, markSigningOut } from './api';
import { adminKeys } from './query-keys';

/**
 * `GET /auth/me`. The dashboard layout resolves this on the server (`getMeServer()`), and
 * `<AbilityProvider>` keeps it fresh in the `adminKeys.me()` query. Inside the dashboard use
 * `useMe()` from `./ability` (synchronous, never undefined).
 */
export function fetchMe(signal?: AbortSignal) {
  return adminFetch<Me>('/auth/me', { signal });
}

function leaveToLogin(qc: ReturnType<typeof useQueryClient>) {
  markSigningOut();
  void qc.cancelQueries({ queryKey: adminKeys.all });
  window.location.replace('/admin/login?reason=signed-out');
}

/**
 * POST /auth/logout, then a full navigation to the login page (which also drops every cached
 * admin query from memory). Background queries that 401 meanwhile do not redirect on their own.
 *
 * Only a confirmed logout (2xx) or an already dead session (401) leaves the page. If the API is
 * unreachable or fails, the session cookie is still valid, so we stay put and report the error
 * instead of pretending the person is logged out (that matters on shared lab machines).
 *
 * @param onFailure Called with a friendly message when the logout did not go through.
 */
export function useLogout(onFailure?: (message: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      adminFetch<void>('/auth/logout', {
        method: 'POST',
        body: {},
        redirectOn401: false,
      }),
    onSuccess: () => leaveToLogin(qc),
    onError: (err) => {
      if (isApiError(err) && err.isUnauthorized) {
        leaveToLogin(qc);
        return;
      }
      onFailure?.(`We could not log you out. ${errorMessage(err)}`);
    },
  });
}
