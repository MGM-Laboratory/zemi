import { z } from 'zod';

/**
 * RBAC for Zemi admins. Default deny, least privilege.
 * The same resolver runs on the server (guards) and in the browser (hiding UI).
 */

export const CAPABILITIES = [
  'events.create',
  'speakers.create',
  'publications.create',
  'venues.manage',
  'site.edit',
  'inbox.view',
  'media.library',
  'audience.view',
  'audit.view',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const EVENT_ACTIONS = [
  'view',
  'edit',
  'publish',
  'delete',
  'registrations.view',
  'registrations.manage',
  'registrations.export',
  'attendance.scan',
  'attendance.manage',
  'stream.view',
  'stream.control',
  'media.manage',
  'emails.send',
] as const;
export type EventAction = (typeof EVENT_ACTIONS)[number];

export const CONTENT_ACTIONS = ['view', 'edit', 'publish', 'delete'] as const;
export type ContentAction = (typeof CONTENT_ACTIONS)[number];

export const RESOURCE_TYPES = ['event', 'speaker', 'publication'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export type ActionFor<T extends ResourceType> = T extends 'event' ? EventAction : ContentAction;
export type AnyAction = EventAction | ContentAction;

export const ACTIONS_BY_TYPE: Record<ResourceType, readonly AnyAction[]> = {
  event: EVENT_ACTIONS,
  speaker: CONTENT_ACTIONS,
  publication: CONTENT_ACTIONS,
};

/** Human labels + groups for the permission editor UI. */
export const CAPABILITY_META: Record<Capability, { label: string; hint: string }> = {
  'events.create': { label: 'Create events', hint: 'Can add new Fridays. Gets full access to events they create.' },
  'speakers.create': { label: 'Add speakers', hint: 'Can add people to the speaker directory.' },
  'publications.create': { label: 'Add publications', hint: 'Can add papers, projects and articles.' },
  'venues.manage': { label: 'Manage rooms', hint: 'Add or edit classrooms, theaters and their map links.' },
  'site.edit': { label: 'Edit site pages', hint: 'Home, about, contact copy, FAQ, team and site settings.' },
  'inbox.view': { label: 'Read the inbox', hint: 'Messages sent from the contact page.' },
  'media.library': { label: 'Browse media library', hint: 'See every uploaded file across the site.' },
  'audience.view': { label: 'See audience list', hint: 'Everyone who ever registered, across all events. Contains personal data.' },
  'audit.view': { label: 'Read the audit log', hint: 'Who changed what, and when.' },
};

export const EVENT_ACTION_META: Record<EventAction, { label: string; group: string; hint: string }> = {
  view: { label: 'View', group: 'Content', hint: 'See the event in the dashboard.' },
  edit: { label: 'Edit', group: 'Content', hint: 'Title, cover, speakers, rundown, schedule, room, slug.' },
  publish: { label: 'Publish', group: 'Content', hint: 'Publish, unpublish, cancel or restore.' },
  delete: { label: 'Delete', group: 'Content', hint: 'Remove the event for good.' },
  'registrations.view': { label: 'See registrants', group: 'People', hint: 'Names, emails and phone numbers.' },
  'registrations.manage': { label: 'Manage registrants', group: 'People', hint: 'Add, edit, cancel, resend tickets.' },
  'registrations.export': { label: 'Export & print', group: 'People', hint: 'CSV/XLSX export and the attendance paper PDF.' },
  'attendance.scan': { label: 'Scan tickets', group: 'Door', hint: 'Open the QR scanner. Only sees the scanned person.' },
  'attendance.manage': { label: 'Manual check-in', group: 'Door', hint: 'Check-in list, undo, walk-ins.' },
  'stream.view': { label: 'See stream setup', group: 'Stream', hint: 'OBS keys, preview and health.' },
  'stream.control': { label: 'Control stream', group: 'Stream', hint: 'Go live, end, rotate keys, recordings.' },
  'media.manage': { label: 'Documentation', group: 'Media', hint: 'Upload and arrange photos and videos.' },
  'emails.send': { label: 'Email registrants', group: 'People', hint: 'Send updates to everyone who registered.' },
};

export const CONTENT_ACTION_META: Record<ContentAction, { label: string; hint: string }> = {
  view: { label: 'View', hint: 'See it in the dashboard.' },
  edit: { label: 'Edit', hint: 'Change any field, including the slug.' },
  publish: { label: 'Publish', hint: 'Show or hide it on the public site.' },
  delete: { label: 'Delete', hint: 'Remove it for good.' },
};

export const grantSchema = z.object({
  type: z.enum(RESOURCE_TYPES),
  id: z.union([z.literal('*'), z.string().min(1)]),
  actions: z.array(z.string()).min(1),
});
export type Grant = { type: ResourceType; id: string | '*'; actions: AnyAction[] };

export const policySchema = z.object({
  capabilities: z.array(z.enum(CAPABILITIES)).default([]),
  grants: z.array(grantSchema).default([]),
});
export type Policy = { capabilities: Capability[]; grants: Grant[] };

export const EMPTY_POLICY: Policy = { capabilities: [], grants: [] };

/** Normalize an untrusted policy: drop unknown actions, dedupe, merge grants for the same target. */
export function normalizePolicy(input: unknown): Policy {
  const parsed = policySchema.safeParse(input);
  if (!parsed.success) return { capabilities: [], grants: [] };
  const caps = Array.from(new Set(parsed.data.capabilities));
  const merged = new Map<string, Grant>();
  for (const g of parsed.data.grants) {
    const allowed = ACTIONS_BY_TYPE[g.type] as readonly string[];
    const actions = g.actions.filter((a) => allowed.includes(a)) as AnyAction[];
    if (!actions.length) continue;
    const key = `${g.type}:${g.id}`;
    const prev = merged.get(key);
    merged.set(key, {
      type: g.type,
      id: g.id,
      actions: Array.from(new Set([...(prev?.actions ?? []), ...actions])) as AnyAction[],
    });
  }
  return { capabilities: caps, grants: [...merged.values()] };
}

const IMPLIES: Partial<Record<AnyAction, AnyAction[]>> = {
  edit: ['view'],
  publish: ['view'],
  delete: ['view'],
  'registrations.view': ['view'],
  'registrations.manage': ['registrations.view', 'view'],
  'registrations.export': ['registrations.view', 'view'],
  'attendance.scan': ['view'],
  'attendance.manage': ['attendance.scan', 'view'],
  'stream.view': ['view'],
  'stream.control': ['stream.view', 'view'],
  'media.manage': ['view'],
  'emails.send': ['view'],
};

export function expandActions(actions: readonly AnyAction[]): Set<AnyAction> {
  const out = new Set<AnyAction>();
  const visit = (a: AnyAction) => {
    if (out.has(a)) return;
    out.add(a);
    for (const b of IMPLIES[a] ?? []) visit(b);
  };
  actions.forEach(visit);
  return out;
}

export type Principal =
  | { kind: 'superadmin'; id: 'superadmin'; name: string }
  | { kind: 'admin'; id: string; name: string; expiresAt: string | null };

export interface Ability {
  readonly principal: Principal;
  readonly isSuperadmin: boolean;
  /** Global capability check. */
  has(cap: Capability): boolean;
  /** Can the principal do `action` on this specific resource? */
  can<T extends ResourceType>(type: T, id: string, action: ActionFor<T>): boolean;
  /** Effective actions on a specific resource. */
  actionsOn<T extends ResourceType>(type: T, id: string): ActionFor<T>[];
  /** Does the principal have `action` on at least one resource of this type (or on all)? */
  canAny<T extends ResourceType>(type: T, action: ActionFor<T>): boolean;
  /** Has a wildcard grant for this action (e.g. can view every event). */
  canAll<T extends ResourceType>(type: T, action: ActionFor<T>): boolean;
  /** Specific resource ids granted `action` (excluding wildcard). */
  idsWith<T extends ResourceType>(type: T, action: ActionFor<T>): string[];
}

export function createAbility(principal: Principal, policy: Policy | null | undefined): Ability {
  const isSuper = principal.kind === 'superadmin';
  const p = normalizePolicy(policy ?? EMPTY_POLICY);
  const caps = new Set(p.capabilities);
  const wildcard = new Map<ResourceType, Set<AnyAction>>();
  const byId = new Map<string, Set<AnyAction>>();
  for (const g of p.grants) {
    const expanded = expandActions(g.actions);
    if (g.id === '*') {
      const cur = wildcard.get(g.type) ?? new Set();
      expanded.forEach((a) => cur.add(a));
      wildcard.set(g.type, cur);
    } else {
      const key = `${g.type}:${g.id}`;
      const cur = byId.get(key) ?? new Set();
      expanded.forEach((a) => cur.add(a));
      byId.set(key, cur);
    }
  }
  const all = (type: ResourceType) => ACTIONS_BY_TYPE[type];

  const ability: Ability = {
    principal,
    isSuperadmin: isSuper,
    has: (cap) => isSuper || caps.has(cap),
    can: (type, id, action) => {
      if (isSuper) return true;
      return (
        wildcard.get(type)?.has(action as AnyAction) === true ||
        byId.get(`${type}:${id}`)?.has(action as AnyAction) === true
      );
    },
    actionsOn: (type, id) => {
      if (isSuper) return [...all(type)] as never;
      const set = new Set<AnyAction>([
        ...(wildcard.get(type) ?? []),
        ...(byId.get(`${type}:${id}`) ?? []),
      ]);
      return all(type).filter((a) => set.has(a)) as never;
    },
    canAny: (type, action) => {
      if (isSuper) return true;
      if (wildcard.get(type)?.has(action as AnyAction)) return true;
      for (const [key, set] of byId) {
        if (key.startsWith(`${type}:`) && set.has(action as AnyAction)) return true;
      }
      return false;
    },
    canAll: (type, action) => isSuper || wildcard.get(type)?.has(action as AnyAction) === true,
    idsWith: (type, action) => {
      const ids: string[] = [];
      for (const [key, set] of byId) {
        if (key.startsWith(`${type}:`) && set.has(action as AnyAction)) ids.push(key.slice(type.length + 1));
      }
      return ids;
    },
  };
  return ability;
}

/** Add a full grant for a newly created resource (used when an admin creates something). */
export function withOwnerGrant(policy: Policy, type: ResourceType, id: string): Policy {
  return normalizePolicy({
    ...policy,
    grants: [...policy.grants, { type, id, actions: [...ACTIONS_BY_TYPE[type]] }],
  });
}

/** Remove grants pointing at a deleted resource. */
export function withoutResource(policy: Policy, type: ResourceType, id: string): Policy {
  return { ...policy, grants: policy.grants.filter((g) => !(g.type === type && g.id === id)) };
}

export const POLICY_PRESETS: Array<{ key: string; label: string; description: string; policy: Policy }> = [
  {
    key: 'viewer',
    label: 'Viewer',
    description: 'Read-only look at every event, speaker and publication. No personal data.',
    policy: {
      capabilities: [],
      grants: [
        { type: 'event', id: '*', actions: ['view'] },
        { type: 'speaker', id: '*', actions: ['view'] },
        { type: 'publication', id: '*', actions: ['view'] },
      ],
    },
  },
  {
    key: 'event-editor',
    label: 'Event editor',
    description: 'Edits content of the events you pick. Add events below after choosing this.',
    policy: { capabilities: [], grants: [] },
  },
  {
    key: 'door-crew',
    label: 'Door crew',
    description: 'Scans tickets and checks people in. Pick the events they work.',
    policy: { capabilities: [], grants: [] },
  },
  {
    key: 'stream-operator',
    label: 'Stream operator',
    description: 'Runs OBS, goes live, manages recordings for the events you pick.',
    policy: { capabilities: [], grants: [] },
  },
  {
    key: 'content-manager',
    label: 'Content manager',
    description: 'Owns speakers, publications and site pages. No registrant data.',
    policy: {
      capabilities: ['speakers.create', 'publications.create', 'site.edit', 'media.library'],
      grants: [
        { type: 'speaker', id: '*', actions: ['view', 'edit', 'publish', 'delete'] },
        { type: 'publication', id: '*', actions: ['view', 'edit', 'publish', 'delete'] },
        { type: 'event', id: '*', actions: ['view'] },
      ],
    },
  },
  {
    key: 'full-admin',
    label: 'Full admin',
    description: 'Everything except managing other admins.',
    policy: {
      capabilities: [...CAPABILITIES],
      grants: [
        { type: 'event', id: '*', actions: [...EVENT_ACTIONS] },
        { type: 'speaker', id: '*', actions: [...CONTENT_ACTIONS] },
        { type: 'publication', id: '*', actions: [...CONTENT_ACTIONS] },
      ],
    },
  },
];

/** Per-event action bundles used by presets when the superadmin picks specific events. */
export const EVENT_ACTION_BUNDLES: Record<string, EventAction[]> = {
  'read-only': ['view'],
  'event-editor': ['view', 'edit', 'media.manage'],
  'door-crew': ['attendance.scan', 'attendance.manage'],
  'stream-operator': ['stream.view', 'stream.control'],
  'read-write': ['view', 'edit', 'publish', 'registrations.view', 'registrations.manage', 'attendance.scan', 'attendance.manage', 'stream.view', 'stream.control', 'media.manage', 'emails.send', 'registrations.export'],
};
