'use client';

/*
 * TEMPORARY overview placeholder (web-admin-foundation). The overview teammate replaces this
 * file with the real dashboard (GET /admin/overview). Keep <AccessSummary> if it helps.
 */
import { CalendarPlus, Command as CommandIcon } from 'lucide-react';
import Link from 'next/link';
import { AccessSummary, useGreeting } from '@/components/admin/access-summary';
import { Character } from '@/components/admin/characters/character';
import { useAdminShell } from '@/components/admin/shell/admin-shell';
import { Button, Card, Kbd, PageHeader, Section } from '@/components/admin/ui';
import { Can } from '@/lib/admin/ability';
import { adminRoutes } from '@/lib/admin/nav';

export default function OverviewPage() {
  const { hello, line } = useGreeting();
  const shell = useAdminShell();
  return (
    <>
      <PageHeader
        title={hello}
        description={line}
        sticky={false}
        actions={
          <Can cap="events.create">
            <Button asChild variant="primary">
              <Link href={adminRoutes.newEvent}>
                <CalendarPlus className="size-4" />
                New event
              </Link>
            </Button>
          </Can>
        }
      />
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Section title="What you can do" description="Straight from your access policy. The server checks every action too.">
          <AccessSummary />
        </Section>
        <Card muted className="flex flex-col gap-4 self-start">
          <div className="flex items-end gap-1.5" aria-hidden="true">
            <Character shape="circle" mood="look" follow size={44} />
            <Character shape="triangle" mood="idle" follow size={36} />
            <Character shape="square" mood="idle" follow size={32} />
            <Character shape="arch" mood="happy" size={38} />
          </div>
          <div>
            <h2 className="font-display text-lg font-extrabold tracking-[-0.02em]">Find anything fast</h2>
            <p className="mt-1 text-sm text-ink-3">
              Press <Kbd keys={['mod', 'k']} /> to jump to a page or search events, speakers and papers. Press <Kbd>?</Kbd> for every shortcut.
            </p>
          </div>
          <Button variant="secondary" icon={<CommandIcon />} onClick={shell.openPalette}>
            Open the palette
          </Button>
        </Card>
      </div>
    </>
  );
}
