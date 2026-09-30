/**
 * Who may do what with a show (pure, so the controller tests need no DB). Shared rules live in
 * `bumperPermissions` / `canUseBumpers` / `canCreateBumpers` (@zemi/shared); this adds the
 * 403-before-404 order: a scoped admin gets the same 403 for a show they can't see and for one
 * that doesn't exist, so show ids can't be probed.
 */
import {
  bumperPermissions,
  canCreateBumpers,
  canUseBumpers,
  type Ability,
  type BumperPermission,
} from '@zemi/shared';
import { forbidden, notFound } from '../../common/errors.js';

/** Superadmin or `bumpers.manage`: every show, standalone ones included. */
export const seesAllShows = (ability: Ability): boolean =>
  ability.isSuperadmin || ability.has('bumpers.manage');

/** 403 for anyone without any bumper access (door crew, content editors). */
export function assertCanUseBumpers(ability: Ability): void {
  if (!canUseBumpers(ability)) {
    throw forbidden(
      "Bumpers aren't part of your access yet. Ask an organizer if you run the screen on Fridays.",
    );
  }
}

/** Permissions on a loaded show (or null when it doesn't exist), throwing unless `need` is among them. */
export function showAccess(
  ability: Ability,
  show: { eventId: string | null } | null | undefined,
  need: BumperPermission,
): BumperPermission[] {
  assertCanUseBumpers(ability);
  if (!show) {
    if (seesAllShows(ability))
      throw notFound("We couldn't find that show. Maybe someone deleted it?");
    throw forbidden("You don't have access to this show.", { details: { need } });
  }
  const perms = bumperPermissions(ability, show.eventId);
  if (!perms.includes(need)) {
    if (need === 'edit' && perms.includes('run'))
      throw forbidden(
        'You can play this show, but changing it needs "Build bumpers" on the event.',
        { details: { need } },
      );
    throw forbidden("You don't have access to this show.", { details: { need } });
  }
  return perms;
}

/** Creating (or moving) a show onto an event needs `edit` there; a standalone show needs `bumpers.manage`. */
export function assertCanBuild(ability: Ability, eventId: string | null): void {
  assertCanUseBumpers(ability);
  if (canCreateBumpers(ability, eventId)) return;
  throw forbidden(
    eventId
      ? 'You can\'t build bumpers for that event. It needs "Build bumpers" or stream control there.'
      : 'Shows without an event need the "Manage all bumpers" permission.',
    { details: { eventId, need: 'edit' } },
  );
}
