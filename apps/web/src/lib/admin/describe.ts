import {
  ACTIONS_BY_TYPE,
  CAPABILITY_META,
  CONTENT_ACTION_META,
  EVENT_ACTION_META,
  expandActions,
  normalizePolicy,
  type AnyAction,
  type Me,
  type ResourceType,
} from '@zemi/shared';

export interface AccessLine {
  /** Short heading, like "Every event" or "Create events". */
  title: string;
  /** Plain-words detail. */
  detail: string;
  kind: 'superadmin' | 'capability' | 'grant';
  resource?: ResourceType;
}

const NOUN: Record<ResourceType, { one: string; many: string }> = {
  event: { one: 'event', many: 'events' },
  speaker: { one: 'speaker', many: 'speakers' },
  publication: { one: 'publication', many: 'publications' },
};

function actionLabel(type: ResourceType, a: AnyAction): string {
  if (type === 'event') return EVENT_ACTION_META[a as keyof typeof EVENT_ACTION_META]?.label.toLowerCase() ?? a;
  return CONTENT_ACTION_META[a as keyof typeof CONTENT_ACTION_META]?.label.toLowerCase() ?? a;
}

/** Expanded actions in catalog order (view, edit, publish, ...), so sentences read predictably. */
function ordered(type: ResourceType, actions: Iterable<AnyAction>): AnyAction[] {
  const set = new Set(actions);
  return ACTIONS_BY_TYPE[type].filter((a) => set.has(a));
}

function listSentence(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * Describe what a principal can do, in plain words, for the overview and the principal menu.
 * Grants are grouped per resource type: wildcard first, then "N specific events".
 */
export function describeAccess(me: Pick<Me, 'principal' | 'policy'>): AccessLine[] {
  if (me.principal.kind === 'superadmin') {
    return [
      {
        kind: 'superadmin',
        title: 'Everything',
        detail: 'You hold the superadmin key: every event, speaker, publication and page, plus admins, sessions and system settings.',
      },
    ];
  }
  const policy = normalizePolicy(me.policy);
  const lines: AccessLine[] = [];
  for (const type of ['event', 'speaker', 'publication'] as const) {
    const grants = policy.grants.filter((g) => g.type === type);
    const wildcard = grants.find((g) => g.id === '*');
    const specific = grants.filter((g) => g.id !== '*');
    if (wildcard) {
      const acts = ordered(type, expandActions(wildcard.actions)).map((a) => actionLabel(type, a));
      lines.push({
        kind: 'grant',
        resource: type,
        title: `Every ${NOUN[type].one}`,
        detail: `On all ${NOUN[type].many}: ${listSentence(acts)}.`,
      });
    }
    if (specific.length) {
      const union = new Set<AnyAction>();
      specific.forEach((g) => expandActions(g.actions).forEach((a) => union.add(a)));
      const acts = ordered(type, union).map((a) => actionLabel(type, a));
      const n = specific.length;
      lines.push({
        kind: 'grant',
        resource: type,
        title: `${n} specific ${n === 1 ? NOUN[type].one : NOUN[type].many}`,
        detail: `On ${n === 1 ? 'that one' : 'those'}: ${listSentence(acts)}.`,
      });
    }
  }
  for (const cap of policy.capabilities) {
    const meta = CAPABILITY_META[cap];
    lines.push({ kind: 'capability', title: meta.label, detail: meta.hint });
  }
  return lines;
}

export function principalRole(me: Pick<Me, 'principal'>): string {
  return me.principal.kind === 'superadmin' ? 'Superadmin' : 'Admin';
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
