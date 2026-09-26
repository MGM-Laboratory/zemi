import { formatJakarta, formatTimeRange } from '@zemi/shared';
import ExcelJS from 'exceljs';

/** One exported registrant. Times are Date (UTC); the writers render them in WIB. */
export interface ExportRow {
  fullName: string;
  email: string;
  phone: string;
  attendanceMode: 'in-person' | 'online';
  ticketCode: string;
  status: 'registered' | 'cancelled';
  source: 'web' | 'admin' | 'walk-in' | 'import';
  checkedInAt: Date | null;
  checkedInBy: string | null;
  createdAt: Date;
  emailStatus: string | null;
  otherEvents: number;
  notes: string | null;
}

export interface ExportEvent {
  title: string;
  number: number | null;
  startsAt: Date;
  endsAt: Date;
  venue: string | null;
}

const COLUMNS: Array<{ header: string; key: keyof ExportRow | 'no'; width: number }> = [
  { header: 'No', key: 'no', width: 6 },
  { header: 'Full name', key: 'fullName', width: 28 },
  { header: 'Email', key: 'email', width: 32 },
  { header: 'Phone', key: 'phone', width: 18 },
  { header: 'Joining', key: 'attendanceMode', width: 11 },
  { header: 'Ticket code', key: 'ticketCode', width: 13 },
  { header: 'Status', key: 'status', width: 12 },
  { header: 'Source', key: 'source', width: 10 },
  { header: 'Checked in (WIB)', key: 'checkedInAt', width: 18 },
  { header: 'Checked in by', key: 'checkedInBy', width: 18 },
  { header: 'Registered (WIB)', key: 'createdAt', width: 18 },
  { header: 'Email status', key: 'emailStatus', width: 13 },
  { header: 'Other Zemis', key: 'otherEvents', width: 12 },
  { header: 'Notes', key: 'notes', width: 36 },
];

const wib = (d: Date | null) => (d ? `${formatJakarta(d, 'iso-date')} ${formatJakarta(d, 'time')}` : '');

/**
 * CSV/formula injection guard: cells starting with = + - @ tab or CR get a leading apostrophe, except plain
 * numbers and phone numbers ("+62 812-3456", "-12"), which can't run anything and should stay readable.
 */
export function csvSafe(value: string): string {
  if (!/^[=+\-@\t\r]/.test(value)) return value;
  if (/^[+-]?[\d\s().-]+$/.test(value)) return value;
  return `'${value}`;
}

const csvCell = (v: string) => {
  const s = csvSafe(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function cellsOf(r: ExportRow, i: number): string[] {
  return [
    String(i + 1),
    r.fullName,
    r.email,
    r.phone,
    r.attendanceMode,
    r.ticketCode,
    r.status,
    r.source,
    wib(r.checkedInAt),
    r.checkedInBy ?? '',
    wib(r.createdAt),
    r.emailStatus ?? '',
    String(r.otherEvents),
    r.notes ?? '',
  ];
}

/** UTF-8 with BOM (Excel on Windows needs it for names with accents), CRLF line endings. */
export function toCsv(rows: ExportRow[]): Buffer {
  const lines = [COLUMNS.map((c) => c.header), ...rows.map(cellsOf)].map((cells) => cells.map(csvCell).join(','));
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(lines.join('\r\n') + '\r\n', 'utf8')]);
}

/** Excel stores no time zone: shift to Jakarta wall-clock so the cell shows WIB. */
const excelWib = (d: Date | null) => (d ? new Date(d.getTime() + 7 * 3_600_000) : null);

export async function toXlsx(rows: ExportRow[], event: ExportEvent): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Zemi';
  wb.created = new Date();
  const title = event.number != null ? `Zemi #${event.number}: ${event.title}` : event.title;

  const ws = wb.addWorksheet('Registrations', {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }],
    properties: { defaultRowHeight: 18 },
  });
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const header = ws.getRow(1);
  header.height = 24;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial', size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E1116' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF3A6DC5' } } };
  });

  rows.forEach((r, i) => {
    const row = ws.addRow({
      no: i + 1,
      fullName: r.fullName,
      email: r.email,
      phone: r.phone,
      attendanceMode: r.attendanceMode,
      ticketCode: r.ticketCode,
      status: r.status,
      source: r.source,
      checkedInAt: excelWib(r.checkedInAt),
      checkedInBy: r.checkedInBy ?? '',
      createdAt: excelWib(r.createdAt),
      emailStatus: r.emailStatus ?? '',
      otherEvents: r.otherEvents,
      notes: r.notes ?? '',
    });
    // Phones stay text (leading + and zeros survive).
    row.getCell('phone').numFmt = '@';
    row.getCell('phone').value = r.phone;
    row.getCell('checkedInAt').numFmt = 'yyyy-mm-dd hh:mm';
    row.getCell('createdAt').numFmt = 'yyyy-mm-dd hh:mm';
    if (r.status === 'cancelled') row.font = { color: { argb: 'FF9AA1AD' }, name: 'Arial', size: 10 };
    else row.font = { name: 'Arial', size: 10 };
    if (i % 2 === 1) row.eachCell({ includeEmpty: true }, (cell) => (cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F7F5' } }));
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: COLUMNS.length } };

  const info = wb.addWorksheet('About');
  info.columns = [
    { key: 'k', width: 22 },
    { key: 'v', width: 60 },
  ];
  const active = rows.filter((r) => r.status === 'registered');
  const lines: Array<[string, string | number]> = [
    ['Event', title],
    ['When', `${formatJakarta(event.startsAt, 'date-long')}, ${formatTimeRange(event.startsAt, event.endsAt)}`],
    ['Where', event.venue ?? 'Online'],
    ['Registered', active.length],
    ['Checked in', active.filter((r) => r.checkedInAt).length],
    ['In person', active.filter((r) => r.attendanceMode === 'in-person').length],
    ['Online', active.filter((r) => r.attendanceMode === 'online').length],
    ['Cancelled', rows.length - active.length],
    ['Exported (WIB)', wib(new Date())],
    ['Note', 'Contains personal data. Keep it inside the organizing team.'],
  ];
  for (const [k, v] of lines) {
    const row = info.addRow({ k, v });
    row.getCell('k').font = { bold: true, name: 'Arial', size: 10 };
    row.getCell('v').font = { name: 'Arial', size: 10 };
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

/** `zemi-12-robots-registrations-2026-10-02.xlsx` */
export function exportFilename(event: { number: number | null; slug: string }, ext: string, what = 'registrations'): string {
  const prefix = event.number != null ? `zemi-${event.number}` : 'zemi';
  // Slugs like `zemi-97-participatory-ai` already carry the prefix: don't say it twice.
  let slug = event.slug.toLowerCase();
  if (slug === prefix || slug.startsWith(`${prefix}-`)) slug = slug.slice(prefix.length).replace(/^-+/, '');
  const base = [prefix, slug.slice(0, 40).replace(/-+$/, ''), what, formatJakarta(new Date(), 'iso-date')].filter(Boolean).join('-');
  return `${base.replace(/[^a-z0-9-]+/gi, '-').replace(/-{2,}/g, '-')}.${ext}`;
}
