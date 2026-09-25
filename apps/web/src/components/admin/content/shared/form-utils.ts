/** Form helpers shared by the content editors. */

/** '' (and whitespace) become null for the listed keys; strings are trimmed. */
export function blankToNull<T extends Record<string, unknown>>(values: T, keys: ReadonlyArray<keyof T>): T {
  const out: Record<string, unknown> = { ...values };
  for (const k of keys) {
    const v = out[k as string];
    if (typeof v === 'string') out[k as string] = v.trim() === '' ? null : v.trim();
    else if (v === undefined) out[k as string] = null;
  }
  return out as T;
}

/** null and undefined become '' so inputs stay controlled. */
export function nullToBlank(v: string | null | undefined): string {
  return v ?? '';
}

/**
 * Keep only the top-level keys react-hook-form marked dirty. Arrays and objects count as dirty
 * when any part of them changed. Used for PATCH bodies, so a field someone may not change
 * (visibility without `publish`) never rides along.
 */
export function pickDirty<T extends Record<string, unknown>>(values: T, dirty: Partial<Record<keyof T, unknown>>): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(dirty) as Array<keyof T>) {
    if (isDirtyMark(dirty[key])) out[key] = values[key];
  }
  return out;
}

function isDirtyMark(mark: unknown): boolean {
  if (mark === true) return true;
  if (Array.isArray(mark)) return mark.some(isDirtyMark);
  if (mark && typeof mark === 'object') return Object.values(mark).some(isDirtyMark);
  return false;
}

/** Count words the way people do: runs of letters or digits. */
export function wordCount(text: string | null | undefined): number {
  if (!text) return 0;
  const m = text.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}

/** Stable client-side keys for list rows. */
let seq = 0;
export function newKey(prefix = 'k'): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}`;
}

/** Normalize a DOI from a link or a "doi:" prefix: "https://doi.org/10.1/x" -> "10.1/x". */
export function cleanDoi(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .trim()
    .replace(/^(?:https?:\/\/)?(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .trim();
}

export const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/;
