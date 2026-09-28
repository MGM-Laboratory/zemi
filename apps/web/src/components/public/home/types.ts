import type {
  EventCard,
  EventDetail,
  PublicationCard,
  PublicSite,
  SiteSettings,
  SpeakerRef,
} from '@zemi/shared';

/** One story beat as the home page renders it. `time` is 'HH:mm' (story time, WIB). */
export interface StoryBeat {
  time: string;
  title: string;
  body: string;
}

/** Scenes the home page knows how to stage. `generic` is any extra beat an admin adds. */
export type SceneKind =
  'doors' | 'lonely' | 'loud' | 'table' | 'question' | 'coffee' | 'closing' | 'generic';

export interface StoryScene {
  kind: SceneKind;
  beat: StoryBeat;
  /** Short lowercase label for the section stamp ("the lonely part"). */
  label: string;
  /** Position in the story, 1-based ("1 - THE LONELY PART"). */
  n: number;
  /** DOM id for anchors (e.g. "story-lonely"). */
  id: string;
}

export interface HomeSpeaker extends Pick<
  SpeakerRef,
  'id' | 'slug' | 'fullName' | 'nickname' | 'avatar' | 'defaultOrganization'
> {
  talkCount: number;
}

/** Everything the home page needs, fetched once on the server. Serializable. */
export interface HomeData {
  home: SiteSettings['home'];
  general: Pick<SiteSettings['general'], 'siteName' | 'labName'>;
  stats: PublicSite['stats'];
  /** The API was unreachable: copy comes from defaults and lists are empty. */
  offline: boolean;
  /** The upcoming schedule could not be loaded (the site settings may still have come from cache). */
  scheduleOffline: boolean;
  /** The past Fridays could not be loaded. */
  archiveOffline: boolean;
  /** 13:15 beat, stamped in the hero. */
  doors: StoryBeat;
  /** Middle beats, staged as scroll scenes (13:20 to 14:50 by default). */
  scenes: StoryScene[];
  /** 15:15 beat, the closing. */
  closing: StoryBeat;
  /** The next Friday (live or upcoming). Hero CTA and mini card. */
  next: EventCard | null;
  /** The event featured in "Up next": home.featuredEventId when it is still upcoming, else `next`. */
  featured: EventCard | null;
  /** Detail for the featured event (spots left, full speakers). Null when unavailable. */
  featuredDetail: Pick<
    EventDetail,
    'registration' | 'speakersFull' | 'roomNote' | 'venueFull' | 'mode'
  > | null;
  past: EventCard[];
  pastTotal: number;
  speakers: HomeSpeaker[];
  speakersTotal: number;
  publications: PublicationCard[];
  publicationsTotal: number;
  /** GLB names present in /public/models. */
  models: string[];
}
