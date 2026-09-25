'use client';

import type { AssetPurpose, Blocks } from '@zemi/shared';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/admin/cn';
import { useFieldControlProps } from '../ui/field';
import { SkeletonText } from '../ui/feedback';
import { useReadOnly } from './read-only';

const Impl = dynamic(() => import('./block-editor-impl'), {
  ssr: false,
  loading: () => (
    <div className="px-5 py-4">
      <SkeletonText lines={4} />
    </div>
  ),
});

export interface BlockEditorProps {
  /** BlockNote document (Blocks JSON from @zemi/shared). Read once on mount; remount with `key` to reset. */
  value: Blocks | null | undefined;
  onChange?: (blocks: Blocks) => void;
  readOnly?: boolean;
  placeholder?: string;
  /** Asset purpose for pasted or uploaded images. Default 'editor'. */
  uploadPurpose?: AssetPurpose;
  /** Min height of the writing area. Default 12rem. */
  minHeight?: string;
  className?: string;
  id?: string;
}

/**
 * Rich text (BlockNote 0.55 + Mantine), loaded client-side only. Themed with the brand fonts.
 * Images dropped or pasted into the editor upload through `uploadAsset` (purpose "editor").
 * Type "/" for blocks. The value is the BlockNote document JSON.
 *
 * @example <BlockEditor value={field.value} onChange={field.onChange} placeholder="What is the talk about?" />
 */
export function BlockEditor({ value, onChange, readOnly: ro, placeholder = "Write something, or type '/' for blocks", uploadPurpose, minHeight = '12rem', className, id }: BlockEditorProps) {
  const readOnly = useReadOnly(ro);
  const aria = useFieldControlProps({ id });
  return (
    <div
      id={aria.id}
      aria-describedby={aria['aria-describedby']}
      aria-invalid={aria['aria-invalid']}
      className={cn(
        'zemi-blocknote rounded-[var(--radius-input)] border border-line-strong bg-white py-3 transition-[border-color,box-shadow] duration-150',
        'focus-within:border-blue focus-within:ring-4 focus-within:ring-blue/15 aria-invalid:border-red-600',
        readOnly && 'bg-surface-muted focus-within:border-line-strong focus-within:ring-0',
        className,
      )}
      style={{ minHeight }}
    >
      <Impl value={value} onChange={onChange} readOnly={readOnly} placeholder={placeholder} uploadPurpose={uploadPurpose} />
    </div>
  );
}
