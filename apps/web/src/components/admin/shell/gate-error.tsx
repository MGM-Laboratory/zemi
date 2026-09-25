'use client';

import { RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Character } from '../characters/character';
import { AdminMark } from '../brand/admin-mark';
import { Button } from '../ui/button';

/** Full-page state when the dashboard cannot reach the API. Keeps the session (no redirect). */
export function GateError({ message }: { message: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="zemi-admin flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <AdminMark size={36} variant={pending ? 'loading' : 'idle'} label="Zemi" />
      <div className="flex items-end gap-2" aria-hidden="true">
        <Character shape="triangle" mood="oops" size={64} />
        <Character shape="circle" mood="look" lookAt={{ x: -0.9, y: 0.2 }} size={48} />
      </div>
      <div className="max-w-md">
        <h1 className="font-display text-2xl font-extrabold tracking-[-0.03em]">The studio can&apos;t reach the server.</h1>
        <p className="mt-2 text-ink-3">{message} Your session is fine. Give it a few seconds and try again.</p>
      </div>
      <Button variant="primary" icon={<RotateCcw />} loading={pending} onClick={() => start(() => router.refresh())}>
        Try again
      </Button>
    </div>
  );
}
