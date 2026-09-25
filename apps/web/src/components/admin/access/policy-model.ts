/**
 * Pure helpers behind the RBAC editor. No React here, so the rules are easy to reason about.
 *
 * Stored vs shown: a grant stores the actions someone explicitly ticked. What the editor shows
 * as checked is `expandActions(explicit)`. An action is locked when another explicit action
 * implies it (edit implies view, attendance.manage implies attendance.scan, ...).
 */
import {
  ACTIONS_BY_TYPE,
  CAPABILITIES,
  CONTENT_ACTION_META,
  EVENT_ACTION_BUNDLES,
  EVENT_ACTION_META,
  POLICY_PRESETS,
  expandActions,
  normalizePolicy,
  type AnyAction,
  type Capability,
  type EventAction,
  type Grant,
  type Policy,
  type ResourceType,
} from '@zemi/shared';

export type ShapeName = 'circle' | 'triangle' | 'square' | 'arch';

export const RESOURCE_META: Record<ResourceType, { one: string; many: string; all: string; shape: ShapeName; tone: string; title: string }> = {
  event: { one: 'event', many: 'events', all: 'All events', shape: 'circle', tone: 'text-blue', title: 'Events' },
  speaker: { one: 'speaker', many: 'speakers', all: 'All speakers', shape: 'arch', tone: 'text-green', title: 'Speakers' },
  publication: { one: 'publication', many: 'publications', all: 'All publications', shape: 'square', tone: 'text-yellow', title: 'Publications' },
};

export const RESOURCE_ORDER: ResourceType[] = ['event', 'speaker', 'publication'];

/* ------------------------------------------------------------------ actions and groups */

export function actionLabel(type: ResourceType, a: AnyAction): string {
  if (type === 'event') return EVENT_ACTION_META[a as EventAction]?.label ?? a;
  return CONTENT_ACTION_META[a as keyof typeof CONTENT_ACTION_META]?.label ?? a;
}

export function actionHint(type: ResourceType, a: AnyAction): string {
  if (type === 'event') return EVENT_ACTION_META[a as EventAction]?.hint ?? '';
  return CONTENT_ACTION_META[a as keyof typeof CONTENT_ACTION_META]?.hint ?? '';
}

/** Group order in the event matrix. */
export const EVENT_GROUP_ORDER = ['Content', 'People', 'Door', 'Stream', 'Media'] as const;

export const GROUP_META: Record<string, { shape: ShapeName; tone: string; blurb: string }> = {
  Content: { shape: 'circle', tone: 'text-blue', blurb: 'The event itself' },
  People: { shape: 'triangle', tone: 'text-red', blurb: 'Personal data lives here' },
  Door: { shape: 'arch', tone: 'text-green', blurb: 'Check-in on the day' },
  Stream: { shape: 'triangle', tone: 'text-red', blurb: 'OBS and the livestream' },
  Media: { shape: 'square', tone: 'text-yellow', blurb: 'Photos and videos' },
};

export interface ActionGroup {
  group: string;
  actions: AnyAction[];
}

/** Actions of a type, grouped for the matrix. Speakers and publications have one group. */
export function actionGroups(type: ResourceType): ActionGroup[] {
  if (type !== 'event') return [{ group: 'Content', actions: [...ACTIONS_BY_TYPE[type]] }];
  return EVENT_GROUP_ORDER.map((group) => ({
    group,
    actions: (Object.keys(EVENT_ACTION_META) as EventAction[]).filter((a) => EVENT_ACTION_META[a].group === group),
  })).filter((g) => g.actions.length > 0);
}

/** Actions checked in the UI (explicit plus everything they imply), in catalog order. */
export function shownActions(type: ResourceType, explicit: readonly AnyAction[]): Set<AnyAction> {
  const expanded = expandActions(explicit);
  return new Set(ACTIONS_BY_TYPE[type].filter((a) => expanded.has(a)));
}

/**
 * Which explicit actions imply `action` (other than itself). Non-empty means the checkbox is
 * shown checked and locked.
 */
export function lockedBy(action: AnyAction, explicit: readonly AnyAction[]): AnyAction[] {
  return explicit.filter((b) => b !== action && expandActions([b]).has(action));
}

/**
 * Tick or untick one action. Unticking only removes that action: actions it implied stay if they
 * were explicit too. Unticking a locked action does nothing (the caller disables it anyway).
 */
export function toggleAction(explicit: readonly AnyAction[], action: AnyAction, on: boolean): AnyAction[] {
  if (on) return explicit.includes(action) ? [...explicit] : [...explicit, action];
  if (lockedBy(action, explicit).length) return [...explicit];
  return explicit.filter((a) => a !== action);
}

/* ------------------------------------------------------------------ bundles */

export interface Bundle {
  key: string;
  label: string;
  hint: string;
  actions: AnyAction[];
}

const EVENT_BUNDLE_COPY: Record<string, { label: string; hint: string }> = {
  'read-only': { label: 'Read-only', hint: 'Look, do not touch.' },
  'event-editor': { label: 'Editor', hint: 'Content, speakers, rundown and documentation.' },
  'door-crew': { label: 'Door crew', hint: 'Scan tickets and check people in. No emails or phones.' },
  'stream-operator': { label: 'Stream operator', hint: 'OBS keys, go live, recordings.' },
  'read-write': { label: 'Read and write', hint: 'Everything except deleting the event.' },
};

export const BUNDLES: Record<ResourceType, Bundle[]> = {
  event: Object.entries(EVENT_ACTION_BUNDLES).map(([key, actions]) => ({
    key,
    label: EVENT_BUNDLE_COPY[key]?.label ?? key,
    hint: EVENT_BUNDLE_COPY[key]?.hint ?? '',
    actions: [...actions],
  })),
  speaker: [
    { key: 'read-only', label: 'Read-only', hint: 'Look, do not touch.', actions: ['view'] },
    { key: 'editor', label: 'Editor', hint: 'Change details, but not visibility.', actions: ['view', 'edit'] },
    { key: 'read-write', label: 'Read and write', hint: 'Edit, publish and delete.', actions: ['view', 'edit', 'publish', 'delete'] },
  ],
  publication: [
    { key: 'read-only', label: 'Read-only', hint: 'Look, do not touch.', actions: ['view'] },
    { key: 'editor', label: 'Editor', hint: 'Change details, but not visibility.', actions: ['view', 'edit'] },
    { key: 'read-write', label: 'Read and write', hint: 'Edit, publish and delete.', actions: ['view', 'edit', 'publish', 'delete'] },
  ],
};

function sameSet<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/** The bundle whose expanded actions match exactly, if any. */
export function matchingBundle(type: ResourceType, explicit: readonly AnyAction[]): Bundle | null {
  const cur = expandActions(explicit);
  return BUNDLES[type].find((b) => sameSet(expandActions(b.actions), cur)) ?? null;
}

export function bundleByKey(type: ResourceType, key: string | null | undefined): Bundle | null {
  if (!key) return null;
  return BUNDLES[type].find((b) => b.key === key) ?? null;
}

/* ------------------------------------------------------------------ presets */

/** Presets that start empty and ask you to pick events, with the bundle new events get. */
export const PICK_EVENTS_PRESETS: Record<string, string> = {
  'event-editor': 'event-editor',
  'door-crew': 'door-crew',
  'stream-operator': 'stream-operator',
};

export const PRESET_SHAPES: Record<string, { shape: ShapeName; tone: string }> = {
  viewer: { shape: 'circle', tone: 'text-blue' },
  'event-editor': { shape: 'square', tone: 'text-yellow' },
  'door-crew': { shape: 'arch', tone: 'text-green' },
  'stream-operator': { shape: 'triangle', tone: 'text-red' },
  'content-manager': { shape: 'square', tone: 'text-green' },
  'full-admin': { shape: 'triangle', tone: 'text-ink' },
};

export type Preset = (typeof POLICY_PRESETS)[number];

function canonical(policy: Policy): string {
  const p = normalizePolicy(policy);
  const caps = [...p.capabilities].sort();
  const grants = p.grants
    .map((g) => ({ t: g.type, id: g.id, a: [...expandActions(g.actions)].sort() }))
    .sort((x, y) => `${x.t}:${x.id}`.localeCompare(`${y.t}:${y.id}`));
  return JSON.stringify({ caps, grants });
}

export function samePolicy(a: Policy, b: Policy): boolean {
  return canonical(a) === canonical(b);
}

export function isEmptyPolicy(policy: Policy): boolean {
  return policy.capabilities.length === 0 && policy.grants.every((g) => g.actions.length === 0);
}

/**
 * The preset a policy currently matches. Pick-event presets match when every grant is a specific
 * event with that bundle and nothing else is granted.
 */
export function matchingPreset(policy: Policy): Preset | null {
  if (isEmptyPolicy(policy)) return null;
  for (const preset of POLICY_PRESETS) {
    const bundleKey = PICK_EVENTS_PRESETS[preset.key];
    if (bundleKey) {
      const bundle = bundleByKey('event', bundleKey)!;
      const want = expandActions(bundle.actions);
      const grants = policy.grants.filter((g) => g.actions.length);
      if (
        policy.capabilities.length === 0 &&
        grants.length > 0 &&
        grants.every((g) => g.type === 'event' && g.id !== '*' && sameSet(expandActions(g.actions), want))
      ) {
        return preset;
      }
      continue;
    }
    if (samePolicy(policy, preset.policy)) return preset;
  }
  return null;
}

/* ------------------------------------------------------------------ editing */

export function clonePolicy(p: Policy): Policy {
  return { capabilities: [...p.capabilities], grants: p.grants.map((g) => ({ ...g, actions: [...g.actions] })) };
}

export function toggleCapability(policy: Policy, cap: Capability, on: boolean): Policy {
  const set = new Set(policy.capabilities);
  if (on) set.add(cap);
  else set.delete(cap);
  // Keep the catalog order so diffs and summaries read the same every time.
  return { ...policy, capabilities: CAPABILITIES.filter((c) => set.has(c)) };
}

export function grantsOf(policy: Policy, type: ResourceType): Grant[] {
  const list = policy.grants.filter((g) => g.type === type);
  // Wildcard first, then the order they were added in.
  return [...list.filter((g) => g.id === '*'), ...list.filter((g) => g.id !== '*')];
}

export function hasScope(policy: Policy, type: ResourceType, id: string): boolean {
  return policy.grants.some((g) => g.type === type && g.id === id);
}

export function addScope(policy: Policy, type: ResourceType, id: string, actions: AnyAction[]): Policy {
  if (hasScope(policy, type, id)) return policy;
  return { ...policy, grants: [...policy.grants, { type, id, actions: [...actions] }] };
}

export function removeScope(policy: Policy, type: ResourceType, id: string): Policy {
  return { ...policy, grants: policy.grants.filter((g) => !(g.type === type && g.id === id)) };
}

export function setScopeActions(policy: Policy, type: ResourceType, id: string, actions: AnyAction[]): Policy {
  return { ...policy, grants: policy.grants.map((g) => (g.type === type && g.id === id ? { ...g, actions: [...actions] } : g)) };
}

/** What gets sent to the API: empty scopes dropped, actions deduped, catalog order. */
export function cleanPolicy(policy: Policy): Policy {
  const grants = policy.grants
    .filter((g) => g.actions.length > 0)
    .map((g) => {
      const set = new Set(g.actions);
      return { ...g, actions: ACTIONS_BY_TYPE[g.type].filter((a) => set.has(a)) };
    });
  return normalizePolicy({ capabilities: policy.capabilities, grants });
}

/** Scopes that currently grant nothing (someone unticked everything). */
export function emptyScopes(policy: Policy): Grant[] {
  return policy.grants.filter((g) => g.actions.length === 0);
}
