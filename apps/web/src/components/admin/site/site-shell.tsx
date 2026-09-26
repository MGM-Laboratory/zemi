'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { NoAccess } from '@/components/admin/access/access-ui';
import { PageHeader, TabNav } from '@/components/admin/ui';
import { useAbility } from '@/lib/admin/ability';
import { useBreadcrumbs } from '@/lib/admin/breadcrumbs';
import { adminRoutes } from '@/lib/admin/nav';
import { SITE_SECTIONS, ViewPageLink } from './site-kit';

/** Header + section tabs for every /admin/site/* page. Needs `site.edit`. */
export function SiteShell({ children }: { children: ReactNode }) {
  const ability = useAbility();
  const pathname = usePathname() ?? '';
  const current = SITE_SECTIONS.find((s) => pathname === adminRoutes.site(s.key) || pathname.startsWith(`${adminRoutes.site(s.key)}/`)) ?? SITE_SECTIONS[0]!;
  useBreadcrumbs([{ label: 'Site', href: adminRoutes.site() }, { label: current.label }]);

  if (!ability.has('site.edit')) {
    return <NoAccess title="Site pages are not in your access." description="Editing the public copy, FAQ and team needs the “Edit site pages” power. Ask the superadmin if you should have it." />;
  }

  return (
    <div>
      <PageHeader
        title={current.label}
        eyebrow={<span className="label text-ink-3">Site</span>}
        description={current.blurb}
        actions={current.publicPath ? <ViewPageLink path={current.publicPath} /> : null}
      >
        <TabNav aria-label="Site sections" className="mt-5" items={SITE_SECTIONS.map((s) => ({ href: adminRoutes.site(s.key), label: s.label }))} />
      </PageHeader>
      {children}
    </div>
  );
}
