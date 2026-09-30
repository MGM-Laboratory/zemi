import type {
  Accent,
  BumperBackground,
  BumperData,
  BumperEventData,
  BumperItem,
  BumperKind,
  BumperPublicationData,
  BumperRundownItem,
  BumperSiteData,
  BumperSlide,
  BumperSlideInput,
  BumperTeamData,
  BumperTheme,
  BumperThreadData,
  ImageRef,
  ShapeName,
} from '@zemi/shared';
import type { ComponentType } from 'react';
import type { SlideColors } from './palette';

/**
 * live: animated (player, OBS output, controller preview). edit: the builder canvas, static final
 * state, elements selectable. thumb: tiny static render (rail, library cards, gallery).
 */
export type SlideMode = 'live' | 'edit' | 'thumb';

/** A person on a slide: a speaker, a team member, or a name typed by hand. */
export interface BumperPerson {
  kind: 'speaker' | 'team' | 'manual';
  id: string | null;
  name: string;
  first: string;
  nickname: string | null;
  headline: string | null;
  avatar: ImageRef | null;
  organization: string | null;
  position: string | null;
  /** Event role (speaker, keynote, moderator, panelist) or a team role. */
  role: string | null;
  talkTitle: string | null;
  url: string | null;
  /** Their brand shape (stable per name). */
  shape: ShapeName;
}

export interface ResolvedRundownItem extends BumperRundownItem {
  index: number;
  speaker: BumperPerson | null;
}

/** Everything a template reads. Built once per render by `buildResolveCtx`. */
export interface ResolveCtx {
  slide: BumperSlide;
  theme: BumperTheme;
  data: BumperData;
  mode: SlideMode;
  /** slide.refs.eventId, else the show's event. */
  event: BumperEventData | null;
  /** refs.speakerId (with the event's role, organization and talk title), else refs.teamMemberId, else null. */
  person: BumperPerson | null;
  /** refs.speakerIds in order (panel). */
  people: BumperPerson[];
  /** The event lineup, in order (speakers with their event info). */
  lineup: BumperPerson[];
  publication: BumperPublicationData | null;
  /** refs.rundown resolved against the event rundown (time + agenda first, then index). */
  rundownItem: ResolvedRundownItem | null;
  rundown: ResolvedRundownItem[];
  threads: BumperThreadData[];
  team: BumperTeamData[];
  /** refs.assetId */
  image: ImageRef | null;
  /** refs.assetIds */
  images: ImageRef[];
  /** style.backgroundAssetId */
  backgroundImage: ImageRef | null;
  site: BumperSiteData;
  nextEvent: BumperEventData | null;
  accent: Accent;
  background: Exclude<BumperBackground, 'auto'>;
  colors: SlideColors;
  /** Slide items, or the template's fallback items when there are none. */
  items: BumperItem[];
  /** Raw field value, falling back to the template default. */
  field(key: string): string | number | boolean | null;
  /** String field with {tokens} filled in. */
  text(key: string): string;
  /** Number field. */
  num(key: string, fallback?: number): number;
  /** Boolean field. */
  flag(key: string, fallback?: boolean): boolean;
  /** Fill {tokens} in any string. */
  fill(s: string): string;
  /** Server-corrected Date.now(). */
  now(): number;
  /**
   * When this slide came on screen (server clock ms), the same on every screen, or null outside
   * live playback (builder, thumbnails). Countdowns in minutes count from here.
   */
  liveSince(): number | null;
}

export type FieldType =
  | 'text'
  | 'longtext'
  | 'url'
  | 'time'
  | 'datetime'
  | 'number'
  | 'minutes'
  | 'toggle'
  | 'select'
  | 'tone'
  | 'shape';

export type FieldValue = string | number | boolean | null;

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  hint?: string;
  /** Text length or number max. */
  max?: number;
  min?: number;
  step?: number;
  options?: Array<{ value: string; label: string }>;
  /** Value when the slide has none. A function can read data, so the inspector can say "from the profile". */
  default?: FieldValue | ((ctx: ResolveCtx) => FieldValue);
  /** Text fields support {tokens} by default. */
  tokens?: boolean;
  /** Content fields come first in the inspector; options go under "More". */
  group?: 'content' | 'options';
}

export type ItemFieldKey = 'title' | 'body' | 'meta' | 'icon' | 'assetId' | 'url';

export interface ItemsDef {
  label: string;
  itemLabel: string;
  max: number;
  fields: Array<{ key: ItemFieldKey; label: string; type: 'text' | 'longtext' | 'icon' | 'image' | 'url'; placeholder?: string }>;
  /** Items shown when the slide has none (for example the event rundown on the agenda). */
  fallback?: (ctx: ResolveCtx) => BumperItem[];
  /** Items the builder adds when the template is inserted. */
  starter?: () => Array<Partial<BumperItem>>;
}

export interface VariantDef {
  key: string;
  label: string;
  hint?: string;
}

export interface TemplatePreset {
  key: string;
  label: string;
  description?: string;
  slide: Partial<Omit<BumperSlideInput, 'id' | 'kind'>>;
}

export interface TemplateDefinition {
  kind: BumperKind;
  fields: FieldDef[];
  items?: ItemsDef;
  variants?: VariantDef[];
  /** Background when the slide style says 'auto'. */
  background?: BumperBackground;
  /** Timing for new slides of this kind. */
  timing?: Partial<BumperSlide['timing']>;
  /** Style for new slides of this kind. */
  style?: Partial<BumperSlide['style']>;
  /** Hide the corner bug. */
  noBug?: boolean;
  /** Paints on a clear canvas (lower third, blank). No backdrop. */
  overlay?: boolean;
  /** One-click starting points shown in the gallery ("Opening prayer", "National anthem"). */
  presets?: TemplatePreset[];
  /** Rail label from data, like the speaker's name. */
  describe?: (ctx: ResolveCtx) => string | null;
  /** Short text that transitions can flash (word train, stamp, scramble). */
  headline?: (ctx: ResolveCtx) => string;
  /** Demo content for the lab and gallery previews when real data would be empty (fields, items, refs are merged over the lab's sample refs). */
  sample?: () => Partial<Omit<BumperSlideInput, 'id' | 'kind'>>;
  Render: ComponentType;
}

export type EnterKind =
  | 'rise'
  | 'fade'
  | 'pop'
  | 'drop'
  | 'wipe'
  | 'wipe-up'
  | 'slide-left'
  | 'slide-right'
  | 'zoom'
  | 'tilt'
  | 'spin'
  | 'split-lines'
  | 'split-words'
  | 'split-chars'
  | 'scramble'
  | 'draw'
  | 'count'
  | 'none';

export type IdleKind = 'float' | 'bob' | 'sway' | 'pulse' | 'spin-slow' | 'breathe' | 'none';
