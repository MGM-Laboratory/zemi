'use client';

import { useContext, type ReactNode } from 'react';
import { ReadOnlyScopeContext as ReadOnlyContext, useFieldContext } from '../ui/field';

/**
 * Make every field inside read-only (for people who can view but not edit).
 * @example
 * <ReadOnlyScope readOnly={!ability.can('event', id, 'edit')}>...form...</ReadOnlyScope>
 */
export function ReadOnlyScope({ readOnly, children }: { readOnly: boolean; children: ReactNode }) {
  const parent = useContext(ReadOnlyContext);
  return <ReadOnlyContext.Provider value={parent || readOnly}>{children}</ReadOnlyContext.Provider>;
}

/** Resolve read-only from an explicit prop, the enclosing <Field>, or a <ReadOnlyScope>. */
export function useReadOnly(prop?: boolean): boolean {
  const scope = useContext(ReadOnlyContext);
  const field = useFieldContext();
  return Boolean(prop ?? (field?.readOnly || scope));
}
