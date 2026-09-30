'use client';

import { canCreateBumpers, type ShapeName } from '@zemi/shared';
import { ChevronDown, FilePlus2, Plus, Sparkles } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ShapeGlyph } from '@/components/admin/ui/badge';
import { Button } from '@/components/admin/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/admin/ui/dropdown-menu';
import { useAbility } from '@/lib/admin/ability';
import type { EventPickLike } from './event-picker';
import { GenerateDialog } from './generate-dialog';
import { NewShowDialog } from './new-show-dialog';
import { STARTER_KITS, type StarterKit } from './starters';

/** Can this principal make a show at all (for this event, when given)? */
export function useCanCreateShow(eventId?: string | null): boolean {
  const ability = useAbility();
  if (eventId) return canCreateBumpers(ability, eventId);
  return ability.isSuperadmin || ability.has('bumpers.manage') || ability.canAny('event', 'bumpers.edit');
}

const SHAPE_TEXT: Record<ShapeName, string> = { circle: '!text-blue', triangle: '!text-red', square: '!text-yellow', arch: '!text-green' };

function MenuRow({ title, hint }: { title: string; hint: string }) {
  return (
    <span className="block min-w-0">
      <span className="block font-medium text-ink">{title}</span>
      <span className="block text-[0.8125rem] leading-snug whitespace-normal text-ink-3">{hint}</span>
    </span>
  );
}

export interface NewShowMenuProps {
  /** Preselect this Friday in every dialog (the event tab). */
  event?: EventPickLike | null;
  /** Controlled open state of the menu (the library opens it for ?new=1). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  label?: ReactNode;
  variant?: 'primary' | 'secondary';
}

/**
 * "New show": generate from an event, a blank show, or one of the starter kits. Owns the dialogs
 * so the library header and the event tab behave the same.
 */
export function NewShowMenu({ event, open, onOpenChange, label = 'New show', variant = 'primary' }: NewShowMenuProps) {
  const [generating, setGenerating] = useState(false);
  // The kit stays set while the dialog closes, so its title does not flip mid-animation.
  const [kitDialog, setKit] = useState<{ open: boolean; kit: StarterKit | null }>({ open: false, kit: null });
  return (
    <>
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button variant={variant} icon={<Plus />} iconRight={<ChevronDown className="size-4 opacity-70" />}>
            {label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[21rem] max-w-[calc(100vw-24px)]">
          <DropdownMenuItem icon={<Sparkles className="!text-red" />} className="items-start [&_svg]:mt-0.5" onSelect={() => setGenerating(true)}>
            <MenuRow title="Generate from an event" hint="From the lineup, rundown and papers. The quickest way in." />
          </DropdownMenuItem>
          <DropdownMenuItem icon={<FilePlus2 />} className="items-start [&_svg]:mt-0.5" onSelect={() => setKit({ open: true, kit: null })}>
            <MenuRow title="Blank show" hint="An empty show you fill from the gallery." />
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Starter kits</DropdownMenuLabel>
          {STARTER_KITS.map((kit) => (
            <DropdownMenuItem
              key={kit.key}
              // A 16px slot like the lucide icons above, so every title starts on the same line.
              icon={
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                  <ShapeGlyph shape={kit.shape} className={`!size-3 ${SHAPE_TEXT[kit.shape]}`} />
                </span>
              }
              className="items-start"
              onSelect={() => setKit({ open: true, kit })}
            >
              <MenuRow title={kit.label} hint={kit.blurb} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <GenerateDialog open={generating} onOpenChange={setGenerating} event={event} />
      <NewShowDialog open={kitDialog.open} onOpenChange={(o) => setKit((k) => ({ ...k, open: o }))} kit={kitDialog.kit} event={event} />
    </>
  );
}
