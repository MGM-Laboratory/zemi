'use client';

import { Download, FileSpreadsheet, FileText, Printer, Sheet as SheetIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/admin/ui/button';
import { Dialog } from '@/components/admin/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/admin/ui/dropdown-menu';
import { Field } from '@/components/admin/ui/field';
import { NumberInput } from '@/components/admin/ui/input';
import { notify } from '@/components/admin/ui/toast';
import { RadioGroup, Switch } from '@/components/admin/ui/toggles';
import { adminUrl } from '@/lib/admin/api';
import { downloadUrl } from '../lib';
import type { RegistrationFilters } from './registrations-table';

/**
 * Export menu: the current filters (search, status, check-in, mode, source, sort) go along, so
 * "what you see is what you get". The list defaults to active seats; the export would default to
 * everyone, so status is always sent explicitly.
 */
export function ExportMenu({ eventId, filters, filtered }: { eventId: string; filters: RegistrationFilters; filtered: boolean }) {
  const go = (format: 'csv' | 'xlsx', all: boolean) => {
    const q = all
      ? { format, status: 'all', sort: 'name' }
      : { format, search: filters.q || undefined, status: filters.status, checkedIn: filters.in, mode: filters.mode, source: filters.src, sort: filters.sort };
    downloadUrl(adminUrl(`/admin/events/${eventId}/registrations/export`, q));
    notify.info(format === 'xlsx' ? 'Your spreadsheet is downloading.' : 'Your CSV is downloading.');
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" icon={<Download />}>
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>{filtered ? 'What you see (current filters)' : 'Active seats'}</DropdownMenuLabel>
        <DropdownMenuItem icon={<FileSpreadsheet />} onSelect={() => go('xlsx', false)}>
          Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem icon={<SheetIcon />} onSelect={() => go('csv', false)}>
          CSV (Google Sheets, anything)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Everyone, cancelled seats too</DropdownMenuLabel>
        <DropdownMenuItem icon={<FileSpreadsheet />} onSelect={() => go('xlsx', true)}>
          Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem icon={<FileText />} onSelect={() => go('csv', true)}>
          CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "Print attendance paper": the A4 Kertas Absensi PDF with signature boxes and blank walk-in rows. */
export function PrintSheetDialog({ eventId, inPersonCount, totalCount, hybrid }: { eventId: string; inPersonCount: number; totalCount: number; hybrid: boolean }) {
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState<'name' | 'registered'>('name');
  const [blankRows, setBlankRows] = useState<number | null>(10);
  const [inPersonOnly, setInPersonOnly] = useState(true);
  const rows = (hybrid && inPersonOnly ? inPersonCount : totalCount) + (blankRows ?? 0);
  const pages = Math.max(1, Math.ceil(rows / 22));
  const url = adminUrl(`/admin/events/${eventId}/attendance-sheet.pdf`, { sort, blankRows: Math.min(100, Math.max(0, blankRows ?? 0)), mode: hybrid && inPersonOnly ? 'in-person' : 'all' });

  return (
    <>
      <Button variant="secondary" icon={<Printer />} onClick={() => setOpen(true)}>
        <span className="hidden sm:inline">Print attendance paper</span>
        <span className="sm:hidden">Print</span>
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="sm"
        accent="yellow"
        title="Print attendance paper"
        description="An A4 sheet with a signature box per person, for the door or the front desk."
        footer={
          <>
            <Button asChild variant="ghost">
              <a href={url} target="_blank" rel="noopener noreferrer">
                Open to print
              </a>
            </Button>
            <Button
              variant="primary"
              icon={<Download />}
              onClick={() => {
                downloadUrl(url);
                notify.success('The PDF is downloading. Pens at the ready.');
                setOpen(false);
              }}
            >
              Download PDF
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Field label="Order">
            <RadioGroup
              aria-label="Order"
              value={sort}
              onValueChange={setSort}
              variant="cards"
              options={[
                { value: 'name', label: 'By name', description: 'A to Z. Easiest to find yourself.' },
                { value: 'registered', label: 'By sign-up time', description: 'Earliest first.' },
              ]}
            />
          </Field>
          <Field label="Blank rows for walk-ins" hint="Numbered empty rows at the end.">
            <NumberInput value={blankRows} onChange={setBlankRows} min={0} max={100} step={5} unit="rows" />
          </Field>
          {hybrid ? <Switch checked={inPersonOnly} onCheckedChange={setInPersonOnly} label="In-person people only" description="Online folks will not be at the door." /> : null}
          <p className="text-sm text-ink-3">
            About {rows.toLocaleString('en-US')} rows on {pages} {pages === 1 ? 'page' : 'pages'}.
          </p>
        </div>
      </Dialog>
    </>
  );
}
