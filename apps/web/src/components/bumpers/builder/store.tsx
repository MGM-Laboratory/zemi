'use client';

import type { BumperBox, BumperData, BumperElement, BumperLayer, BumperPermission, BumperShowDetail, BumperSlide, BumperTheme } from '@zemi/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { errorMessage, isApiError } from '@/lib/admin/api';
import { bumperKeys, bumpersApi, mergeData } from '../api';
import { cloneSlides } from './factory';

/**
 * Builder state: the show document (title, event, theme, slides) with undo/redo, the selection,
 * the resolved data bundle, and autosave. Every edit goes through `edit()` so it lands in the
 * history; rapid edits with the same `coalesce` key (typing, dragging) merge into one undo step.
 */

export interface BuilderDoc {
  title: string;
  eventId: string | null;
  theme: BumperTheme;
  slides: BumperSlide[];
}

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

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
  /** When someone else saved first. */
  theirs: BumperShowDetail | null;
  /** Bumps whenever the doc changes (autosave watches it). */
  rev: number;
}

type Action =
  | { type: 'load'; detail: BumperShowDetail }
  | { type: 'edit'; fn: (d: BuilderDoc) => BuilderDoc; coalesce?: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'select'; ids: string[]; current?: string | null }
  | { type: 'element'; id: string | null }
  | { type: 'data'; data: Partial<BumperData> }
  | { type: 'saving' }
  | { type: 'saved'; detail: BumperShowDetail; rev: number }
  | { type: 'save-error'; error: string }
  | { type: 'conflict'; theirs: BumperShowDetail }
  | { type: 'keep-mine' }
  | { type: 'take-theirs' };

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
    theirs: null,
    rev: 0,
  };
}

function reducer(s: BuilderState, a: Action): BuilderState {
  switch (a.type) {
    case 'load':
      return init(a.detail);
    case 'edit': {
      const next = a.fn(s.doc);
      if (next === s.doc) return s;
      const now = Date.now();
      const merge = a.coalesce && s.lastCoalesce && s.lastCoalesce.key === a.coalesce && now - s.lastCoalesce.at < COALESCE_MS;
      const past = merge ? s.past : [...s.past.slice(-HISTORY + 1), s.doc];
      // Keep the selection pointing at slides that still exist.
      const ids = new Set(next.slides.map((x) => x.id));
      const selected = s.selected.filter((id) => ids.has(id));
      const current = s.current && ids.has(s.current) ? s.current : (selected[0] ?? next.slides[0]?.id ?? null);
      return { ...s, doc: next, past, future: [], lastCoalesce: a.coalesce ? { key: a.coalesce, at: now } : null, save: s.save === 'conflict' ? 'conflict' : 'dirty', rev: s.rev + 1, selected: selected.length ? selected : current ? [current] : [], current };
    }
    case 'undo': {
      const prev = s.past[s.past.length - 1];
      if (!prev) return s;
      return { ...s, doc: prev, past: s.past.slice(0, -1), future: [s.doc, ...s.future].slice(0, HISTORY), lastCoalesce: null, save: 'dirty', rev: s.rev + 1, current: prev.slides.some((x) => x.id === s.current) ? s.current : (prev.slides[0]?.id ?? null) };
    }
    case 'redo': {
      const next = s.future[0];
      if (!next) return s;
      return { ...s, doc: next, past: [...s.past, s.doc], future: s.future.slice(1), lastCoalesce: null, save: 'dirty', rev: s.rev + 1, current: next.slides.some((x) => x.id === s.current) ? s.current : (next.slides[0]?.id ?? null) };
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
      return { ...s, baseVersion: a.detail.version, data: mergeData(s.data, a.detail.data), status: a.detail.status, save: s.rev === a.rev ? 'saved' : 'dirty', savedAt: Date.now(), error: null };
    case 'save-error':
      return { ...s, save: 'error', error: a.error };
    case 'conflict':
      return { ...s, save: 'conflict', theirs: a.theirs };
    case 'keep-mine':
      return s.theirs ? { ...s, baseVersion: s.theirs.version, theirs: null, save: 'dirty', rev: s.rev + 1 } : s;
    case 'take-theirs':
      return s.theirs ? { ...init(s.theirs), past: [...s.past, s.doc] } : s;
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
  /** Save right away (optionally as a named checkpoint revision). */
  saveNow: (checkpoint?: string) => Promise<void>;
  keepMine: () => void;
  takeTheirs: () => void;
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

export function BuilderProvider({ detail, children }: { detail: BumperShowDetail; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, detail, init);
  const qc = useQueryClient();
  const stateRef = useRef(state);
  stateRef.current = state;
  const canEdit = state.permissions.includes('edit') && state.status !== 'archived';

  const edit = useCallback((fn: (d: BuilderDoc) => BuilderDoc, coalesce?: string) => {
    if (!stateRef.current.permissions.includes('edit')) return;
    dispatch({ type: 'edit', fn, coalesce });
  }, []);

  const save = useCallback(
    async (checkpoint?: string) => {
      const s = stateRef.current;
      if (!s.permissions.includes('edit')) return;
      if (s.save === 'conflict') return;
      if (s.save === 'saved' && !checkpoint) return;
      const rev = s.rev;
      dispatch({ type: 'saving' });
      try {
        const res = await bumpersApi.update(s.showId, { baseVersion: s.baseVersion, title: s.doc.title, eventId: s.doc.eventId, theme: s.doc.theme, slides: s.doc.slides, ...(checkpoint ? { checkpoint } : {}) });
        dispatch({ type: 'saved', detail: res, rev });
        qc.setQueryData(bumperKeys.detail(s.showId), res);
        void qc.invalidateQueries({ queryKey: bumperKeys.lists() });
      } catch (err) {
        if (isApiError(err) && err.status === 409 && err.code === 'version_conflict') {
          try {
            const theirs = await bumpersApi.get(s.showId);
            dispatch({ type: 'conflict', theirs });
          } catch (e) {
            dispatch({ type: 'save-error', error: errorMessage(e) });
          }
          return;
        }
        dispatch({ type: 'save-error', error: errorMessage(err) });
      }
    },
    [qc],
  );

  // Autosave 900ms after the last edit; retry errors after 5s.
  useEffect(() => {
    if (state.save !== 'dirty' && state.save !== 'error') return;
    const t = setTimeout(() => void save(), state.save === 'error' ? 5000 : 900);
    return () => clearTimeout(t);
  }, [state.rev, state.save, save]);

  // Don't lose work on tab close.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const s = stateRef.current.save;
      if (s === 'dirty' || s === 'saving' || s === 'error') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const api = useMemo<BuilderApi>(() => {
    const updateSlide = (id: string, fn: (s: BumperSlide) => BumperSlide, coalesce?: string) => edit((d) => mapSlide(d, id, fn), coalesce);
    return {
      state,
      canEdit,
      slide: state.doc.slides.find((s) => s.id === state.current) ?? null,
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
        edit((d) => {
          const list = [...d.slides];
          list.splice(Math.max(0, Math.min(index, list.length)), 0, ...slides);
          return { ...d, slides: list };
        });
        if (slides[0]) dispatch({ type: 'select', ids: slides.map((s) => s.id), current: slides[0].id });
      },
      removeSlides: (ids) =>
        edit((d) => {
          const gone = new Set(ids);
          return { ...d, slides: d.slides.filter((s) => !gone.has(s.id)).map((s) => (s.timing.loopToId && gone.has(s.timing.loopToId) ? { ...s, timing: { ...s.timing, loopToId: null } } : s)) };
        }),
      duplicateSlides: (ids) => {
        const s = stateRef.current;
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
          return { ...d, slides: rest };
        }),
      reorder: (orderedIds) =>
        edit((d) => {
          const byId = new Map(d.slides.map((s) => [s.id, s]));
          const next = orderedIds.map((id) => byId.get(id)).filter((s): s is BumperSlide => !!s);
          if (next.length !== d.slides.length) return d;
          return { ...d, slides: next };
        }),
      setHidden: (ids, hidden) => edit((d) => ({ ...d, slides: d.slides.map((s) => (ids.includes(s.id) ? { ...s, hidden } : s)) })),
      setTheme: (patch) => edit((d) => ({ ...d, theme: { ...d.theme, ...patch } }), `theme:${Object.keys(patch).join(',')}`),
      setTitle: (title) => edit((d) => ({ ...d, title }), 'title'),
      setEventId: (eventId) => edit((d) => ({ ...d, eventId })),
      undo: () => dispatch({ type: 'undo' }),
      redo: () => dispatch({ type: 'redo' }),
      select: (ids, current) => dispatch({ type: 'select', ids, current }),
      selectElement: (id) => dispatch({ type: 'element', id }),
      mergeData: (data) => dispatch({ type: 'data', data }),
      saveNow: (checkpoint) => save(checkpoint),
      keepMine: () => dispatch({ type: 'keep-mine' }),
      takeTheirs: () => dispatch({ type: 'take-theirs' }),
    };
  }, [state, canEdit, edit, save]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
