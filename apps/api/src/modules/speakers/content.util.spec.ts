import { publicationUpdateInput, speakerUpdateInput } from '@zemi/shared';
import { describe, expect, it } from 'vitest';
import { blankToNull, dropUnchanged, isUniqueViolation, presentOnly } from './content.util.js';

describe('presentOnly', () => {
  it('drops defaults that zod partial() fills in, so a PATCH never wipes authors or visibility', () => {
    const raw = { title: 'New title' };
    const parsed = publicationUpdateInput.parse(raw);
    expect(parsed).toMatchObject({ authors: [], visibility: 'published' }); // the trap
    expect(presentOnly(parsed, raw)).toEqual({ title: 'New title' });
    const sp = { nickname: null };
    expect(presentOnly(speakerUpdateInput.parse(sp), sp)).toEqual({ nickname: null });
    expect(presentOnly({ a: 1 }, null)).toEqual({});
    expect(presentOnly({ a: 1 }, [1])).toEqual({});
  });
});

describe('dropUnchanged', () => {
  it('compares jsonb structurally, ignoring key order', () => {
    const set: Record<string, unknown> = { links: [{ kind: 'website', url: 'https://a.b' }], fullName: 'Rina', nickname: 'R' };
    dropUnchanged(set, { links: [{ url: 'https://a.b', kind: 'website' }], fullName: 'Rina', nickname: null });
    expect(set).toEqual({ nickname: 'R' });
  });
});

describe('isUniqueViolation', () => {
  it('finds a wrapped 23505 on the slug constraint', () => {
    const pg = { code: '23505', constraint_name: 'speakers_slug_unique' };
    expect(isUniqueViolation({ message: 'wrapped', cause: pg }, 'slug')).toBe(true);
    expect(isUniqueViolation({ cause: { code: '23505', constraint_name: 'other_uq' } }, 'slug')).toBe(false);
    expect(isUniqueViolation(new Error('nope'), 'slug')).toBe(false);
  });
});

describe('blankToNull', () => {
  it('trims and nulls empties', () => {
    expect(blankToNull('  ')).toBeNull();
    expect(blankToNull(' x ')).toBe('x');
    expect(blankToNull(undefined)).toBeNull();
  });
});
