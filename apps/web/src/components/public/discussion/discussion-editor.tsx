'use client';

import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import type { PartialBlock } from '@blocknote/core';
import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote } from '@blocknote/react';
import type { Blocks } from '@zemi/shared';
import { useEffect, useRef } from 'react';
import { uploadDiscussionImage } from './api';

export default function DiscussionEditor({ value, onChange, imageToken, onImageUsed }: { value?: Blocks; onChange: (blocks: Blocks) => void; imageToken: string; onImageUsed: () => void }) {
  const change = useRef(onChange);
  useEffect(() => { change.current = onChange; }, [onChange]);
  const token = useRef(imageToken);
  useEffect(() => { token.current = imageToken; }, [imageToken]);
  const used = useRef(onImageUsed);
  useEffect(() => { used.current = onImageUsed; }, [onImageUsed]);
  const editor = useCreateBlockNote({
    initialContent: value?.length ? value as unknown as PartialBlock[] : undefined,
    placeholders: { default: 'Start your question, or type / for more options...' },
    domAttributes: { editor: { 'aria-label': 'Question body', 'aria-multiline': 'true' } },
    uploadFile: async (file: File) => {
      if (!token.current) throw new Error('Complete the human check before uploading an image.');
      if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) throw new Error('Choose an image smaller than 5 MB.');
      try { return await uploadDiscussionImage(file, token.current); }
      finally { used.current(); }
    },
  });
  return <BlockNoteView editor={editor} theme="light" onChange={() => change.current(editor.document as unknown as Blocks)} />;
}
