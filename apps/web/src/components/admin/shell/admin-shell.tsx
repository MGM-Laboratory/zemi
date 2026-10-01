'use client';

import { ChevronRight, ExternalLink, Menu, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Dialog as RDialog } from 'radix-ui';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAbility } from '@/lib/admin/ability';
import { useCurrentBreadcrumbs, type Crumb } from '@/lib/admin/breadcrumbs';
import { cn } from '@/lib/admin/cn';
import { useHotkeys } from '@/lib/admin/hooks';
import { useLogout } from '@/lib/admin/me';
import { ADMIN_NAV, flattenNav, isActivePath, visibleNav, type AdminNavGroup } from '@/lib/admin/nav';
import { confirmLeave } from '@/lib/admin/leave-guard';
import { ConfirmProvider } from '../ui/confirm-dialog';
import { Dialog } from '../ui/dialog';
import { Kbd } from '../ui/media';
import { notify } from '../ui/toast';
import { Tooltip } from '../ui/tooltip';
import { CommandPalette } from './command-palette';
import { PrincipalMenu } from './principal-menu';
import { Sidebar } from './sidebar';
import { useInboxUnread } from './use-shell-data';

const COLLAPSE_KEY = 'zemi.admin.sidebar';

interface AdminShellApi {
  openPalette: () => void;
  openShortcuts: () => void;
  toggleSidebar: () => void;
}
const ShellContext = createContext<AdminShellApi | null>(null);

/** Control the shell from a page: `const shell = useAdminShell(); shell.openPalette()`. */
export function useAdminShell(): AdminShellApi {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useAdminShell must be used inside the admin dashboard.');
  return ctx;
}

/**
 * The admin frame: sidebar (collapsible on desktop, drawer on phones), sticky topbar with
 * breadcrumbs, Cmd/Ctrl+K palette, principal menu, keyboard shortcuts.
 * Rendered by app/admin/(dashboard)/layout.tsx inside <AdminProviders>.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/admin';
  const router = useRouter();
  const ability = useAbility();
  const groups = useMemo(() => visibleNav(ability), [ability]);
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const logout = useLogout((message) => notify.error(message));
  const inbox = useInboxUnread(ability.has('inbox.view'));

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);
  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });
  }, []);

  // Close the drawer when the route changes.
  useEffect(() => {
    setDrawer(false);
  }, [pathname]);

  const navShortcuts = useMemo(() => {
    const map: Record<string, () => void> = {};
    // Unsaved work or an uncopied passphrase gets a say first (confirmLeave), like a link click.
    for (const item of flattenNav(groups)) if (item.shortcut) map[item.shortcut] = () => void confirmLeave().then((ok) => ok && router.push(item.href));
    return map;
  }, [groups, router]);

  useHotkeys({
    'mod+k': () => setPalette((o) => !o),
    '[': toggleCollapsed,
    '?': () => setShortcuts(true),
    ...navShortcuts,
  });

  const doLogout = () => logout.mutate();
  const api = useMemo<AdminShellApi>(
    () => ({ openPalette: () => setPalette(true), openShortcuts: () => setShortcuts(true), toggleSidebar: toggleCollapsed }),
    [toggleCollapsed],
  );

  return (
    <ShellContext.Provider value={api}>
    <ConfirmProvider>
      <div className="zemi-admin">
        <a
          href="#admin-main"
          className="sr-only z-[90] rounded-full bg-ink px-4 py-2 text-sm font-medium text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>

        {/* Desktop rail */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-40 hidden border-r border-line bg-white transition-[width] duration-300 ease-[var(--ease-out)] lg:block',
            collapsed ? 'w-[var(--admin-sidebar-w-collapsed)]' : 'w-[var(--admin-sidebar-w)]',
          )}
        >
          <Sidebar
            groups={groups}
            pathname={pathname}
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
            inboxUnread={inbox.data ?? null}
          />
        </aside>

        {/* Mobile drawer */}
        <RDialog.Root open={drawer} onOpenChange={setDrawer}>
          <RDialog.Portal>
            <RDialog.Overlay className="fixed inset-0 z-[60] bg-[rgba(14,17,22,0.32)] data-[state=open]:animate-[zemi-fade-in_180ms_var(--ease-out)] lg:hidden" />
            <RDialog.Content
              className="fixed inset-y-0 left-0 z-[60] w-[min(20rem,86vw)] bg-white shadow-[var(--shadow-3)] outline-none data-[state=open]:animate-[zemi-slide-in-left_260ms_var(--ease-out)] lg:hidden"
              aria-describedby={undefined}
            >
              <RDialog.Title className="sr-only">Menu</RDialog.Title>
              <div className="zemi-admin !min-h-0 h-full">
                <Sidebar groups={groups} pathname={pathname} collapsed={false} variant="drawer" onNavigate={() => setDrawer(false)} inboxUnread={inbox.data ?? null} />
              </div>
            </RDialog.Content>
          </RDialog.Portal>
        </RDialog.Root>

        <div className={cn('flex min-h-dvh min-w-0 flex-col transition-[padding] duration-300 ease-[var(--ease-out)]', collapsed ? 'lg:pl-[var(--admin-sidebar-w-collapsed)]' : 'lg:pl-[var(--admin-sidebar-w)]')}>
          <Topbar
            groups={groups}
            pathname={pathname}
            onMenu={() => setDrawer(true)}
            onPalette={() => setPalette(true)}
            right={<PrincipalMenu onLogout={doLogout} loggingOut={logout.isPending} onShowShortcuts={() => setShortcuts(true)} />}
          />
          <main id="admin-main" tabIndex={-1} className="mx-auto w-full max-w-[1600px] min-w-0 flex-1 px-4 pt-6 pb-16 outline-none sm:px-6 sm:pt-8 lg:px-8">
            {children}
          </main>
        </div>

        <CommandPalette
          open={palette}
          onOpenChange={setPalette}
          onToggleSidebar={toggleCollapsed}
          onShowShortcuts={() => setShortcuts(true)}
          onLogout={doLogout}
        />
        <ShortcutsDialog open={shortcuts} onOpenChange={setShortcuts} groups={groups} />
      </div>
    </ConfirmProvider>
    </ShellContext.Provider>
  );
}

/* ------------------------------------------------------------------ topbar */

function Topbar({ groups, pathname, onMenu, onPalette, right }: { groups: AdminNavGroup[]; pathname: string; onMenu: () => void; onPalette: () => void; right: ReactNode }) {
  const custom = useCurrentBreadcrumbs();
  // Pages outside your nav (a typed URL that lands on "not in your access") still get a title.
  const derived = deriveCrumbs(groups, pathname);
  const crumbs = custom ?? (derived.length ? derived : deriveCrumbs(ADMIN_NAV, pathname));
  return (
    <header className="sticky top-0 z-30 flex h-[var(--admin-topbar-h)] shrink-0 items-center gap-2 border-b border-line bg-white/85 px-3 backdrop-blur-md sm:gap-3 sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open menu"
        className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink-2 transition hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus lg:hidden"
      >
        <Menu className="size-5" />
      </button>
      <Breadcrumbs crumbs={crumbs} />
      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={onPalette}
          aria-label="Search and jump (Cmd or Ctrl K)"
          className="group flex h-10 items-center gap-2 rounded-full border border-line-strong bg-white px-3 text-sm text-ink-3 transition hover:border-ink-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-focus sm:w-48 xl:w-64"
        >
          <Search className="size-4 shrink-0" />
          <span className="hidden min-w-0 flex-1 truncate text-left whitespace-nowrap sm:inline">
            Search<span className="hidden xl:inline"> or jump</span>
          </span>
          <span className="hidden sm:inline-flex">
            <Kbd keys={['mod', 'k']} />
          </span>
        </button>
        <Tooltip content="View the public site">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View the public site"
            className="hidden h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap text-ink-2 transition hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus md:flex"
          >
            <span className="hidden xl:inline">View site</span>
            <ExternalLink className="size-4 xl:size-3.5" aria-hidden="true" />
          </a>
        </Tooltip>
        {right}
      </div>
    </header>
  );
}

function deriveCrumbs(groups: AdminNavGroup[], pathname: string): Crumb[] {
  const flat = flattenNav(groups);
  const matches = flat.filter((i) => isActivePath(pathname, i)).sort((a, b) => b.href.length - a.href.length);
  const hit = matches[0];
  if (!hit) return pathname === '/admin/kit' ? [{ label: 'UI kit' }] : [];
  const out: Crumb[] = [];
  if (hit.parent) out.push({ label: hit.parent.label, href: hit.parent.href });
  out.push({ label: hit.label, href: pathname === hit.href ? undefined : hit.href });
  return out;
}

function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  if (!crumbs.length) return <div className="min-w-0 flex-1" />;
  // Long labels (an event title as a middle crumb) truncate instead of running under the search
  // box: the first crumb keeps its size, middle crumbs give way first, the current page last.
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 flex-1 overflow-hidden">
      <ol className="flex min-w-0 items-center gap-1 text-sm whitespace-nowrap">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          const first = i === 0;
          return (
            <li
              key={`${c.label}-${i}`}
              title={c.label}
              className={cn(
                'flex min-w-0 items-center gap-1',
                // With a middle crumb the current page is a short tab label: keep it whole.
                last ? (crumbs.length > 2 ? 'max-w-[12rem] shrink-0' : 'shrink') : 'hidden sm:flex',
                !last && first && 'shrink-0',
                !last && !first && 'min-w-[2.5rem] max-w-[22rem] [flex-shrink:20] sm:hidden lg:flex',
              )}
            >
              {c.href && !last ? (
                <Link href={c.href} className="min-w-0 truncate rounded-md px-1 py-0.5 text-ink-3 transition-colors hover:text-ink">
                  {c.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className={cn('min-w-0 truncate px-1 py-0.5', last ? 'font-semibold text-ink' : 'text-ink-3')}>
                  {c.label}
                </span>
              )}
              {!last ? <ChevronRight className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ------------------------------------------------------------------ shortcuts */

function ShortcutsDialog({ open, onOpenChange, groups }: { open: boolean; onOpenChange: (o: boolean) => void; groups: AdminNavGroup[] }) {
  const nav = flattenNav(groups).filter((i) => i.shortcut);
  const rows: Array<[ReactNode, string]> = [
    [<Kbd key="k" keys={['mod', 'k']} />, 'Search and jump anywhere'],
    [<Kbd key="b">[</Kbd>, 'Collapse or expand the sidebar'],
    [<Kbd key="s" keys={['mod', 's']} />, 'Save the form you are on'],
    [<Kbd key="slash">/</Kbd>, 'Focus the search box on lists'],
    [<Kbd key="q">?</Kbd>, 'This list'],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Keyboard shortcuts" description="Fewer clicks, more coffee." size="sm">
      <div className="space-y-5">
        <ul className="space-y-2.5">
          {rows.map(([k, label], i) => (
            <li key={i} className="flex items-center justify-between gap-4 text-[0.9375rem]">
              <span className="text-ink-2">{label}</span>
              {k}
            </li>
          ))}
        </ul>
        {nav.length ? (
          <div>
            <div className="label mb-2 text-ink-3">Go to</div>
            <ul className="space-y-2.5">
              {nav.map((n) => (
                <li key={n.key} className="flex items-center justify-between gap-4 text-[0.9375rem]">
                  <span className="text-ink-2">{n.label}</span>
                  <span className="flex gap-1">
                    {n.shortcut!.split(' ').map((k) => (
                      <Kbd key={k}>{k.toUpperCase()}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
