'use client';

import type { BumperBox, BumperData, BumperElement, BumperLayer, BumperPermission, BumperShowDetail, BumperShowStatus, BumperSlide, BumperTheme } from '@zemi/shared';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useState, type Dispatch, type ReactNode } from 'react';
import { errorMessage, isApiError } from '@/lib/admin/api';
import { bumperKeys, bumpersApi, mergeData } from '../api';
import { cloneSlides } from './factory';

/**
 * Builder state: the show document (title, event, theme, slides) with undo/redo, the selection,
 * the resolved data bundle, and autosave. Every edit goes through `edit()` so it lands in the
 * history; rapid edits with the same `coalesce` key (typing, dragging) merge into one undo step.
 *
 * Saving: one PATCH at a time (an edit made while a save is in flight waits for it, so the next
 * save carries the new version). Network and server errors retry every 5 s; a rejected save (a
 * 4xx like an empty title) waits for the next edit. Leaving the builder flushes pending edits.
 */

export interface BuilderDoc {
  title: string;
  eventId: string | null;
  theme: BumperTheme;
  slides: BumperSlide[];
}

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

/** Inspector tabs (the phone tab bar and the tablet drawer open the inspector on one of these). */
export type InspectorTab = 'content' | 'style' | 'timing' | 'element' | 'notes';

export interface BuilderState {
  showId: string;
  doc: BuilderDoc;
  /** Server version the doc is based on (sent as baseVersion). */
  baseVersion: number;
  data: BumperData;
  permissions: BumperPermission[];
  status: string;
  /** Selected slides (multi-select in the rail) and the one shown on the canvas. */
  selected: string[];
  current: string | null;
  /** Selected element on the canvas: a template layer key, or `x:<extraId>` for free elements. */
  element: string | null;
  past: BuilderDoc[];
  future: BuilderDoc[];
  lastCoalesce: { key: string; at: number } | null;
  save: SaveStatus;
  savedAt: number | null;
  error: string | null;
  /** The last error retries by itself (network or server trouble). False for a rejected save. */
  retry: boolean;
  /** When someone else saved first. */
  theirs: BumperShowDetail | null;
  /** Bumps whenever the doc changes (autosave watches it). */
  rev: number;
  /** Inspector tab, shared by the inspector and the small-screen tab bar. */
  inspectorTab: InspectorTab;
  /** Below 1280 px the inspector lives in a bottom drawer: is it open? */
  inspectorOpen: boolean;
}

type Action =
  | { type: 'load'; detail: BumperShowDetail; keepView?: boolean }
  | { type: 'edit'; fn: (d: BuilderDoc) => BuilderDoc; coalesce?: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'select'; ids: string[]; current?: string | null }
  | { type: 'element'; id: string | null }
  | { type: 'data'; data: Partial<BumperData> }
  | { type: 'saving' }
  | { type: 'saved'; detail: BumperShowDetail; rev: number }
  | { type: 'save-error'; error: string; retry: boolean }
  | { type: 'conflict'; theirs: BumperShowDetail }
  | { type: 'keep-mine' }
  | { type: 'take-theirs' }
  | { type: 'inspector'; tab?: InspectorTab; open?: boolean };

const HISTORY = 100;
const COALESCE_MS = 900;

function docOf(d: BumperShowDetail): BuilderDoc {
  return { title: d.title, eventId: d.eventId, theme: d.theme, slides: d.slides };
}

function init(detail: BumperShowDetail): BuilderState {
  const first = detail.slides[0]?.id ?? null;
  return {
    showId: detail.id,
    doc: docOf(detail),
    baseVersion: detail.version,
    data: detail.data,
    permissions: detail.permissions,
    status: detail.status,
    selected: first ? [first] : [],
    current: first,
    element: null,
    past: [],
    future: [],
    lastCoalesce: null,
    save: 'saved',
    savedAt: Date.now(),
    error: null,
    retry: false,
    theirs: null,
    rev: 0,
    inspectorTab: 'content',
    inspectorOpen: false,
  };
}

/** Keep the selection pointing at slides that exist in `doc`. */
function reselect(s: BuilderState, doc: BuilderDoc): Pick<BuilderState, 'selected' | 'current'> {
  const ids = new Set(doc.slides.map((x) => x.id));
  const selected = s.selected.filter((id) => ids.has(id));
  const current = s.current && ids.has(s.current) ? s.current : (selected[0] ?? doc.slides[0]?.id ?? null);
  return { selected: selected.length ? selected : current ? [current] : [], current };
}

const DATA_PARTS = ['events', 'speakers', 'publications', 'team', 'threads', 'images'] as const;

/** A save answer repeats the bundle. Keep the old object (and every memoized thumbnail) unless it brings records we lack. */
function mergeNewRecords(a: BumperData, b: BumperData): BumperData {
  const fresh = DATA_PARTS.some((k) => Object.keys(b[k]).some((id) => !(id in a[k])));
  return fresh || a.nextEventId !== b.nextEventId ? mergeData(a, b) : a;
}

export const canEditState = (s: Pick<BuilderState, 'permissions' | 'status'>) => s.permissions.includes('edit') && s.status !== 'archived';

function reducer(s: BuilderState, a: Action): BuilderState {
  switch (a.type) {
    case 'load': {
      const next = init(a.detail);
      if (!a.keepView) return next;
      return { ...next, ...reselect(s, next.doc), inspectorTab: s.inspectorTab, inspectorOpen: s.inspectorOpen };
    }
    case 'edit': {
      const next = a.fn(s.doc);
      if (next === s.doc) return s;
      const now = Date.now();
      const merge = a.coalesce && s.lastCoalesce && s.lastCoalesce.key === a.coalesce && now - s.lastCoalesce.at < COALESCE_MS;
      const past = merge ? s.past : [...s.past.slice(-HISTORY + 1), s.doc];
      return { ...s, doc: next, past, future: [], lastCoalesce: a.coalesce ? { key: a.coalesce, at: now } : null, save: s.save === 'conflict' ? 'conflict' : 'dirty', rev: s.rev + 1, ...reselect(s, next) };
    }
    case 'undo': {
      const prev = s.past[s.past.length - 1];
      if (!prev) return s;
      return { ...s, doc: prev, past: s.past.slice(0, -1), future: [s.doc, ...s.future].slice(0, HISTORY), lastCoalesce: null, save: s.save === 'conflict' ? 'conflict' : 'dirty', rev: s.rev + 1, ...reselect(s, prev) };
    }
    case 'redo': {
      const next = s.future[0];
      if (!next) return s;
      return { ...s, doc: next, past: [...s.past, s.doc], future: s.future.slice(1), lastCoalesce: null, save: s.save === 'conflict' ? 'conflict' : 'dirty', rev: s.rev + 1, ...reselect(s, next) };
    }
    case 'select':
      return { ...s, selected: a.ids, current: a.current !== undefined ? a.current : (a.ids[a.ids.length - 1] ?? s.current), element: a.current !== undefined && a.current !== s.current ? null : s.element };
    case 'element':
      return { ...s, element: a.id };
    case 'data':
      return { ...s, data: mergeData(s.data, a.data) };
    case 'saving':
      return { ...s, save: 'saving', error: null };
    case 'saved':
      return {
        ...s,
        baseVersion: Math.max(s.baseVersion, a.detail.version),
        data: mergeNewRecords(s.data, a.detail.data),
        status: a.detail.status,
        permissions: a.detail.permissions,
        save: s.save === 'conflict' ? 'conflict' : s.rev === a.rev ? 'saved' : 'dirty',
        savedAt: Date.now(),
        error: null,
        retry: false,
      };
    case 'save-error':
      return { ...s, save: 'error', error: a.error, retry: a.retry };
    case 'conflict':
      return { ...s, save: 'conflict', theirs: a.theirs, error: null };
    case 'keep-mine':
      return s.theirs ? { ...s, baseVersion: s.theirs.version, theirs: null, save: 'dirty', rev: s.rev + 1 } : s;
    case 'take-theirs': {
      if (!s.theirs) return s;
      const next = init(s.theirs);
      return { ...next, ...reselect(s, next.doc), past: [...s.past, s.doc], inspectorTab: s.inspectorTab, inspectorOpen: s.inspectorOpen };
    }
    case 'inspector':
      return { ...s, inspectorTab: a.tab ?? s.inspectorTab, inspectorOpen: a.open ?? s.inspectorOpen };
    default:
      return s;
  }
}

export interface BuilderApi {
  state: BuilderState;
  canEdit: boolean;
  slide: BumperSlide | null;
  /** Generic edit (goes into history). */
  edit: (fn: (d: BuilderDoc) => BuilderDoc, coalesce?: string) => void;
  updateSlide: (id: string, fn: (s: BumperSlide) => BumperSlide, coalesce?: string) => void;
  setField: (id: string, key: string, value: string | number | boolean | null) => void;
  setRefs: (id: string, patch: Partial<BumperSlide['refs']>) => void;
  setStyle: (id: string, patch: Partial<BumperSlide['style']>) => void;
  setTiming: (id: string, patch: Partial<BumperSlide['timing']>) => void;
  /** Patch a template layer override (null clears it back to the template default). */
  setLayer: (id: string, key: string, patch: Partial<BumperLayer> | null, coalesce?: string) => void;
  moveLayer: (id: string, key: string, box: BumperBox, coalesce?: string) => void;
  addExtra: (id: string, el: BumperElement) => void;
  updateExtra: (id: string, elId: string, fn: (e: BumperElement) => BumperElement, coalesce?: string) => void;
  removeExtra: (id: string, elId: string) => void;
  insertSlides: (index: number, slides: BumperSlide[]) => void;
  removeSlides: (ids: string[]) => void;
  duplicateSlides: (ids: string[]) => void;
  /** Move the given slides so the first lands at `toIndex` (in the list without them). */
  moveSlides: (ids: string[], toIndex: number) => void;
  reorder: (orderedIds: string[]) => void;
  setHidden: (ids: string[], hidden: boolean) => void;
  setTheme: (patch: Partial<BumperTheme>) => void;
  setTitle: (title: string) => void;
  setEventId: (eventId: string | null) => void;
  undo: () => void;
  redo: () => void;
  select: (ids: string[], current?: string | null) => void;
  selectElement: (id: string | null) => void;
  mergeData: (data: Partial<BumperData>) => void;
  /** Save right away (optionally as a named checkpoint revision). Resolves with the saved show, or null when nothing was saved. */
  saveNow: (checkpoint?: string) => Promise<BumperShowDetail | null>;
  keepMine: () => void;
  takeTheirs: () => void;
  /** Replace the whole builder state with a show from the server (after a restore). `keepView` keeps the selection and panels. */
  load: (detail: BumperShowDetail, opts?: { keepView?: boolean }) => void;
  /** Archive or restore the show (saves pending edits first). */
  setStatus: (status: BumperShowStatus) => Promise<BumperShowDetail | null>;
  setInspectorTab: (tab: InspectorTab, open?: boolean) => void;
  setInspectorOpen: (open: boolean) => void;
  /** The latest committed state and the newest server version, for async flows (call it in handlers, not in render). */
  snapshot: () => { state: BuilderState; version: number };
}

const Ctx = createContext<BuilderApi | null>(null);

export function useBuilder(): BuilderApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useBuilder needs <BuilderProvider>.');
  return v;
}

const mapSlide = (d: BuilderDoc, id: string, fn: (s: BumperSlide) => BumperSlide): BuilderDoc => {
  let changed = false;
  const slides = d.slides.map((s) => {
    if (s.id !== id) return s;
    const n = fn(s);
    if (n !== s) changed = true;
    return n;
  });
  return changed ? { ...d, slides } : d;
};

type Actions = Omit<BuilderApi, 'state' | 'canEdit' | 'slide'>;

/**
 * What the actions read when they run: the last committed state, the newest server version we
 * know of (updated as soon as a save answers, before React commits) and the save in flight.
 */
class LiveRefs {
  state: BuilderState;
  version: number;
  inflight: Promise<BumperShowDetail | null> | null = null;
  constructor(state: BuilderState) {
    this.state = state;
    this.version = state.baseVersion;
  }
  sync(state: BuilderState) {
    this.state = state;
    this.version = Math.max(this.version, state.baseVersion);
  }
}

/**
 * The action set. Built once per provider: every function reads the latest state through the refs
 * when it is called (never during render).
 */
function createActions(dispatch: Dispatch<Action>, refs: LiveRefs, qc: QueryClient): Actions {
  const edit = (fn: (d: BuilderDoc) => BuilderDoc, coalesce?: string) => {
    if (!canEditState(refs.state)) return;
    dispatch({ type: 'edit', fn, coalesce });
  };
  const updateSlide = (id: string, fn: (s: BumperSlide) => BumperSlide, coalesce?: string) => edit((d) => mapSlide(d, id, fn), coalesce);

  const send = async (checkpoint?: string, status?: BumperShowStatus): Promise<BumperShowDetail | null> => {
    const s = refs.state;
    if (!s.permissions.includes('edit')) return null;
    if (s.save === 'conflict') return null;
    // Archived shows only accept the status change back.
    if (s.status === 'archived' && !status) return null;
    if (s.save === 'saved' && !checkpoint && !status) return null;
    const rev = s.rev;
    dispatch({ type: 'saving' });
    try {
      const res = await bumpersApi.update(s.showId, {
        baseVersion: Math.max(refs.version, s.baseVersion),
        ...(s.status === 'archived' ? {} : { title: s.doc.title, eventId: s.doc.eventId, theme: s.doc.theme, slides: s.doc.slides }),
        ...(checkpoint !== undefined ? { checkpoint } : {}),
        ...(status ? { status } : {}),
      });
      refs.version = Math.max(refs.version, res.version);
      dispatch({ type: 'saved', detail: res, rev: status ? s.rev : rev });
      qc.setQueryData(bumperKeys.detail(s.showId), res);
      void qc.invalidateQueries({ queryKey: bumperKeys.lists() });
      if (checkpoint !== undefined || status) void qc.invalidateQueries({ queryKey: bumperKeys.revisions(s.showId) });
      return res;
    } catch (err) {
      if (isApiError(err) && err.status === 409 && err.code === 'version_conflict') {
        try {
          const theirs = await bumpersApi.get(s.showId);
          dispatch({ type: 'conflict', theirs });
        } catch (e) {
          dispatch({ type: 'save-error', error: errorMessage(e), retry: true });
        }
        return null;
      }
      const retry = !isApiError(err) || err.status === 0 || err.status >= 500 || err.status === 429;
      dispatch({ type: 'save-error', error: errorMessage(err), retry });
      return null;
    }
  };

  /** One save at a time: a second call waits for the running one, then saves what is still unsaved. */
  const save = (checkpoint?: string, status?: BumperShowStatus): Promise<BumperShowDetail | null> => {
    const run = async () => {
      const before = refs.inflight;
      if (before) await before.catch(() => null);
      return send(checkpoint, status);
    };
    const p = run().finally(() => {
      if (refs.inflight === p) refs.inflight = null;
    });
    refs.inflight = p;
    return p;
  };

  return {
    edit,
    updateSlide,
    setField: (id, key, value) =>
      updateSlide(
        id,
        (s) => {
          const fields = { ...s.fields };
          if (value === null || value === undefined || value === '') delete fields[key];
          else fields[key] = value;
          return { ...s, fields };
        },
        `field:${id}:${key}`,
      ),
    setRefs: (id, patch) => updateSlide(id, (s) => ({ ...s, refs: { ...s.refs, ...patch } })),
    setStyle: (id, patch) => updateSlide(id, (s) => ({ ...s, style: { ...s.style, ...patch } }), `style:${id}:${Object.keys(patch).join(',')}`),
    setTiming: (id, patch) => updateSlide(id, (s) => ({ ...s, timing: { ...s.timing, ...patch } })),
    setLayer: (id, key, patch, coalesce) =>
      updateSlide(
        id,
        (s) => {
          const layers = { ...s.layers };
          if (patch === null) delete layers[key];
          else {
            const merged = { ...(layers[key] ?? {}), ...patch };
            for (const k of Object.keys(merged) as Array<keyof BumperLayer>) if (merged[k] === undefined) delete merged[k];
            if (Object.keys(merged).length) layers[key] = merged;
            else delete layers[key];
          }
          return { ...s, layers };
        },
        coalesce,
      ),
    moveLayer: (id, key, box, coalesce) => updateSlide(id, (s) => ({ ...s, layers: { ...s.layers, [key]: { ...(s.layers[key] ?? {}), box } } }), coalesce ?? `move:${id}:${key}`),
    addExtra: (id, el) => updateSlide(id, (s) => ({ ...s, extras: [...s.extras, el] })),
    updateExtra: (id, elId, fn, coalesce) => updateSlide(id, (s) => ({ ...s, extras: s.extras.map((e) => (e.id === elId ? fn(e) : e)) }), coalesce ?? `extra:${id}:${elId}`),
    removeExtra: (id, elId) => updateSlide(id, (s) => ({ ...s, extras: s.extras.filter((e) => e.id !== elId) })),
    insertSlides: (index, slides) => {
      if (!slides.length || !canEditState(refs.state)) return;
      edit((d) => {
        const list = [...d.slides];
        list.splice(Math.max(0, Math.min(index, list.length)), 0, ...slides);
        return { ...d, slides: list };
      });
      dispatch({ type: 'select', ids: slides.map((s) => s.id), current: slides[0]!.id });
    },
    removeSlides: (ids) =>
      edit((d) => {
        const gone = new Set(ids);
        return { ...d, slides: d.slides.filter((s) => !gone.has(s.id)).map((s) => (s.timing.loopToId && gone.has(s.timing.loopToId) ? { ...s, timing: { ...s.timing, loopToId: null } } : s)) };
      }),
    duplicateSlides: (ids) => {
      const s = refs.state;
      if (!canEditState(s)) return;
      const pick = s.doc.slides.filter((x) => ids.includes(x.id));
      if (!pick.length) return;
      const copies = cloneSlides(pick);
      const lastIndex = Math.max(...pick.map((p) => s.doc.slides.findIndex((x) => x.id === p.id)));
      edit((d) => {
        const list = [...d.slides];
        list.splice(lastIndex + 1, 0, ...copies);
        return { ...d, slides: list };
      });
      dispatch({ type: 'select', ids: copies.map((c) => c.id), current: copies[0]!.id });
    },
    moveSlides: (ids, toIndex) =>
      edit((d) => {
        const moving = d.slides.filter((s) => ids.includes(s.id));
        const rest = d.slides.filter((s) => !ids.includes(s.id));
        rest.splice(Math.max(0, Math.min(toIndex, rest.length)), 0, ...moving);
        return rest.every((s, i) => s === d.slides[i]) ? d : { ...d, slides: rest };
      }),
    reorder: (orderedIds) =>
      edit((d) => {
        const byId = new Map(d.slides.map((s) => [s.id, s]));
        const next = orderedIds.map((id) => byId.get(id)).filter((s): s is BumperSlide => !!s);
        if (next.length !== d.slides.length || next.every((s, i) => s === d.slides[i])) return d;
        return { ...d, slides: next };
      }),
    setHidden: (ids, hidden) => edit((d) => ({ ...d, slides: d.slides.map((s) => (ids.includes(s.id) && s.hidden !== hidden ? { ...s, hidden } : s)) })),
    setTheme: (patch) => edit((d) => ({ ...d, theme: { ...d.theme, ...patch } }), `theme:${Object.keys(patch).join(',')}`),
    setTitle: (title) => edit((d) => (d.title === title ? d : { ...d, title }), 'title'),
    setEventId: (eventId) => edit((d) => (d.eventId === eventId ? d : { ...d, eventId })),
    undo: () => {
      if (canEditState(refs.state)) dispatch({ type: 'undo' });
    },
    redo: () => {
      if (canEditState(refs.state)) dispatch({ type: 'redo' });
    },
    select: (ids, current) => dispatch({ type: 'select', ids, current }),
    selectElement: (id) => dispatch({ type: 'element', id }),
    mergeData: (data) => dispatch({ type: 'data', data }),
    saveNow: (checkpoint) => save(checkpoint),
    keepMine: () => dispatch({ type: 'keep-mine' }),
    takeTheirs: () => {
      const theirs = refs.state.theirs;
      if (theirs) refs.version = Math.max(refs.version, theirs.version);
      dispatch({ type: 'take-theirs' });
    },
    load: (detail, opts) => {
      refs.version = detail.version;
      dispatch({ type: 'load', detail, keepView: opts?.keepView });
      qc.setQueryData(bumperKeys.detail(detail.id), detail);
    },
    setStatus: async (status) => {
      // Flush pending edits while the show can still take them.
      if (status === 'archived') await save();
      return save(undefined, status);
    },
    setInspectorTab: (tab, open) => dispatch({ type: 'inspector', tab, open }),
    setInspectorOpen: (open) => dispatch({ type: 'inspector', open }),
    snapshot: () => ({ state: refs.state, version: Math.max(refs.version, refs.state.baseVersion) }),
  };
}

export function BuilderProvider({ detail, children }: { detail: BumperShowDetail; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, detail, init);
  const qc = useQueryClient();
  const [live] = useState(() => new LiveRefs(init(detail)));
  useLayoutEffect(() => {
    live.sync(state);
  });
  const [actions] = useState(() => createActions(dispatch, live, qc));
  const canEdit = canEditState(state);
  const { save, rev, savedAt, retry } = state;
  const saveNow = actions.saveNow;

  // Autosave 900 ms after the last edit; retry network and server errors after 5 s.
  // `savedAt` is in the deps so a save that finishes with edits still pending schedules the next one.
  useEffect(() => {
    if (save !== 'dirty' && !(save === 'error' && retry)) return;
    const t = setTimeout(() => void saveNow(), save === 'error' ? 5000 : 900);
    return () => clearTimeout(t);
  }, [rev, save, savedAt, retry, saveNow]);

  // Leaving the builder (a link, the back button in the app) flushes what is not saved yet.
  useEffect(
    () => () => {
      const s = live.state.save;
      if (s === 'dirty' || s === 'error') void saveNow();
    },
    [live, saveNow],
  );

  // Don't lose work on tab close.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const s = live.state.save;
      if (s === 'dirty' || s === 'saving' || s === 'error') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [live]);

  const { slides } = state.doc;
  const currentId = state.current;
  const slide = useMemo(() => slides.find((s) => s.id === currentId) ?? null, [slides, currentId]);
  const api = useMemo<BuilderApi>(() => ({ ...actions, state, canEdit, slide }), [actions, state, canEdit, slide]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/* ---------------------------------------------------------------- builder chrome (dialogs and sheets) */

export type BuilderPanel = 'history' | 'theme' | 'obs' | 'shortcuts';

export interface BuilderUi {
  /** The gallery is open, inserting at this index (null = closed). */
  galleryAt: number | null;
  openGallery: (index?: number) => void;
  closeGallery: () => void;
  panel: BuilderPanel | null;
  openPanel: (panel: BuilderPanel | null) => void;
}

const UiCtx = createContext<BuilderUi | null>(null);

/** Open state of the builder's dialogs and sheets (gallery, history, theme, OBS guide, shortcuts). */
export function useBuilderUi(): BuilderUi {
  const v = useContext(UiCtx);
  if (!v) throw new Error('useBuilderUi needs <BuilderUiProvider>.');
  return v;
}

/** Put inside <BuilderProvider>: `openGallery()` without an index inserts after the current slide. */
export function BuilderUiProvider({ children }: { children: ReactNode }) {
  const { state } = useBuilder();
  const [galleryAt, setGalleryAt] = useState<number | null>(null);
  const [panel, setPanel] = useState<BuilderPanel | null>(null);
  const { slides } = state.doc;
  const currentId = state.current;
  const openGallery = useCallback(
    (index?: number) => {
      const at = slides.findIndex((s) => s.id === currentId);
      setGalleryAt(index ?? (at >= 0 ? at + 1 : slides.length));
    },
    [slides, currentId],
  );
  const closeGallery = useCallback(() => setGalleryAt(null), []);
  const value = useMemo<BuilderUi>(() => ({ galleryAt, openGallery, closeGallery, panel, openPanel: setPanel }), [galleryAt, openGallery, closeGallery, panel]);
  return <UiCtx.Provider value={value}>{children}</UiCtx.Provider>;
}
