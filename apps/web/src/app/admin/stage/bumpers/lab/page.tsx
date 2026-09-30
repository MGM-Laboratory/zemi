import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BumperLab } from '@/components/bumpers/lab/lab-page';

export const metadata: Metadata = { title: 'Bumper lab' };

/** /admin/stage/bumpers/lab: every bumper template and transition with sample data. */
export default function BumperLabPage() {
  return (
    <Suspense fallback={null}>
      <BumperLab />
    </Suspense>
  );
}
