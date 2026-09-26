'use client';

import { useState } from 'react';
import type { PublicationCard } from '@zemi/shared';
import { CoverPreview } from '@/components/public/publications/cover-preview';
import { PublicationRow } from '@/components/public/publications/publication-row';
import pubStyles from '@/components/public/publications/publications.module.css';
import { cn } from '@/lib/utils';

/** The speaker's papers as list rows, with the floating cover preview. */
export function SpeakerPapers({ pubs }: { pubs: PublicationCard[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const pub = hovered ? (pubs.find((p) => p.id === hovered) ?? null) : null;
  return (
    <div className="flex flex-col">
      {pubs.map((p) => (
        <div key={p.id} className={cn(pubStyles.item, 'flex flex-col')}>
          <PublicationRow pub={p} onPreview={setHovered} />
        </div>
      ))}
      <CoverPreview pub={pub} />
    </div>
  );
}
