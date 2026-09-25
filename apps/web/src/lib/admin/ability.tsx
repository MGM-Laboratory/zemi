'use client';

import {
  createAbility,
  type Ability,
  type ActionFor,
  type Capability,
  type Me,
  type ResourceType,
} from '@zemi/shared';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { fetchMe } from './me';
import { adminKeys } from './query-keys';

interface AbilityContextValue {
  me: Me;
  ability: Ability;
  refetchMe: () => Promise<unknown>;
}

const AbilityContext = createContext<AbilityContextValue | null>(null);

/**
 * Provides the signed-in principal and their resolved ability to the admin tree.
 * `me` comes from the server gate (plain JSON). It seeds the `adminKeys.me()` query, which
 * refreshes every 5 minutes and on window focus, so policy edits and revocations show up
 * without a reload (a 401 sends the browser back to the login page).
 */
export function AbilityProvider({ me: initialMe, children }: { me: Me; children: ReactNode }) {
  const query = useQuery({
    queryKey: adminKeys.me(),
    queryFn: ({ signal }) => fetchMe(signal),
    initialData: initialMe,
    initialDataUpdatedAt: () => Date.now(),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
  const me = query.data ?? initialMe;
  const ability = useMemo(() => createAbility(me.principal, me.policy), [me]);
  const value = useMemo<AbilityContextValue>(
    () => ({ me, ability, refetchMe: () => query.refetch() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me, ability],
  );
  return <AbilityContext.Provider value={value}>{children}</AbilityContext.Provider>;
}

function useAbilityContext(): AbilityContextValue {
  const ctx = useContext(AbilityContext);
  if (!ctx) throw new Error('useAbility/useMe must be used inside <AbilityProvider> (the admin dashboard layout).');
  return ctx;
}

/** The resolved RBAC ability. `ability.can('event', id, 'stream.control')`, `ability.has('site.edit')`. */
export function useAbility(): Ability {
  return useAbilityContext().ability;
}

/** The `GET /auth/me` payload for the signed-in principal. */
export function useMe(): Me {
  return useAbilityContext().me;
}

/** Re-fetch `/auth/me` now (after editing your own policy, for example). */
export function useRefetchMe(): () => Promise<unknown> {
  return useAbilityContext().refetchMe;
}

/** `can` on one resource. Without an id, falls back to `canAny` (at least one resource of that type). */
export function useCan<T extends ResourceType>(type: T, id: string | null | undefined, action: ActionFor<T>): boolean {
  const ability = useAbility();
  return id ? ability.can(type, id, action) : ability.canAny(type, action);
}

export function useCanAny<T extends ResourceType>(type: T, action: ActionFor<T>): boolean {
  return useAbility().canAny(type, action);
}

export function useHas(cap: Capability): boolean {
  return useAbility().has(cap);
}

export function useIsSuperadmin(): boolean {
  return useAbility().isSuperadmin;
}

type ResourceCheck = {
  [T in ResourceType]: {
    type: T;
    /** Omit to check "on at least one resource of this type" (canAny). Use '*' for canAll. */
    id?: string | null;
    action: ActionFor<T>;
    cap?: never;
    superadmin?: never;
    when?: never;
  };
}[ResourceType];

type CapCheck = { cap: Capability; type?: never; id?: never; action?: never; superadmin?: never; when?: never };
type SuperCheck = { superadmin: true; type?: never; id?: never; action?: never; cap?: never; when?: never };
type WhenCheck = { when: (ability: Ability) => boolean; type?: never; id?: never; action?: never; cap?: never; superadmin?: never };

export type CanProps = (ResourceCheck | CapCheck | SuperCheck | WhenCheck) & {
  children: ReactNode | ((allowed: boolean) => ReactNode);
  /** Rendered when not allowed. Default: nothing. */
  fallback?: ReactNode;
};

/** Evaluate a <Can>-style check against an ability. */
export function checkAbility(ability: Ability, check: ResourceCheck | CapCheck | SuperCheck | WhenCheck): boolean {
  if ('when' in check && check.when) return check.when(ability);
  if ('superadmin' in check && check.superadmin) return ability.isSuperadmin;
  if ('cap' in check && check.cap) return ability.has(check.cap);
  const c = check as ResourceCheck;
  if (c.id === '*') return ability.canAll(c.type, c.action as never);
  if (c.id) return ability.can(c.type, c.id, c.action as never);
  return ability.canAny(c.type, c.action as never);
}

/**
 * Permission gate. Hides children unless allowed. The server enforces everything regardless;
 * this is only about not showing buttons people cannot use.
 *
 * @example
 * <Can type="event" id={event.id} action="stream.control"><GoLiveButton /></Can>
 * <Can cap="events.create"><Button>New event</Button></Can>
 * <Can superadmin fallback={<p>Ask the superadmin.</p>}>...</Can>
 * <Can type="event" id={id} action="edit">{(ok) => <Input readOnly={!ok} />}</Can>
 */
export function Can(props: CanProps) {
  const ability = useAbility();
  const { children, fallback = null, ...check } = props;
  const allowed = checkAbility(ability, check as ResourceCheck | CapCheck | SuperCheck | WhenCheck);
  if (typeof children === 'function') return <>{children(allowed)}</>;
  return <>{allowed ? children : fallback}</>;
}
