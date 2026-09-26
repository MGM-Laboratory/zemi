import type { ReactNode } from 'react';
import { SiteShell } from '@/components/admin/site/site-shell';

export default function SiteLayout({ children }: { children: ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
