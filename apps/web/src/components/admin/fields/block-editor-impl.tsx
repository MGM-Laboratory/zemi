'use client';

import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import type { PartialBlock } from '@blocknote/core';
import { BlockNoteView, type Theme } from '@blocknote/mantine';
import { useCreateBlockNote } from '@blocknote/react';
import type { AssetPurpose, Blocks } from '@zemi/shared';
import { useEffect, useRef } from 'react';
import { uploadAsset } from '@/lib/admin/upload';
import { notify } from '../ui/toast';

export interface BlockEditorImplProps {
  value: Blocks | null | undefined;
  onChange?: (blocks: Blocks) => void;
  readOnly?: boolean;
  placeholder?: string;
  uploadPurpose?: AssetPurpose;
  onReady?: () => void;
}

/** Brand theme for BlockNote (Mantine). CSS in admin.css adds headings and links. */
const zemiTheme: Theme = {
  colors: {
    editor: { text: '#0e1116', background: '#ffffff' },
    menu: { text: '#0e1116', background: '#ffffff' },
    tooltip: { text: '#ffffff', background: '#0e1116' },
    hovered: { text: '#0e1116', background: '#f7f7f5' },
    selected: { text: '#ffffff', background: '#3a6dc5' },
    disabled: { text: '#9aa1ad', background: '#f7f7f5' },
    shadow: 'rgba(14,17,22,0.12)',
    border: '#ececea',
    sideMenu: '#9aa1ad',
    highlights: {
      yellow: { text: '#7a5600', background: '#fef6e0' },
      blue: { text: '#2f5aa6', background: '#ecf1fa' },
      red: { text: '#d92f2f', background: '#fee5e5' },
      green: { text: '#0b6b45', background: '#e2f1ea' },
    },
  },
  borderRadius: 12,
  fontFamily: 'var(--font-atkinson), ui-sans-serif, system-ui, sans-serif',
};

export default function BlockEditorImpl({ value, onChange, readOnly, placeholder, uploadPurpose = 'editor', onReady }: BlockEditorImplProps) {
  const changeRef = useRef(onChange);
  useEffect(() => {
    changeRef.current = onChange;
  });

  const editor = useCreateBlockNote({
    initialContent: value && value.length ? (value as unknown as PartialBlock[]) : undefined,
    placeholders: placeholder ? { default: placeholder } : undefined,
    uploadFile: async (file: File) => {
      try {
        const asset = await uploadAsset(file, { purpose: uploadPurpose });
        return asset.image?.src ?? asset.file?.url ?? asset.video?.mp4 ?? asset.originalUrl;
      } catch (err) {
        notify.error(err);
        throw err;
      }
    },
  });

  useEffect(() => {
    onReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <BlockNoteView
      editor={editor}
      editable={!readOnly}
      theme={zemiTheme}
      onChange={() => changeRef.current?.(editor.document as unknown as Blocks)}
    />
  );
}
