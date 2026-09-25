import { existsSync } from 'node:fs';
import { Document, Font, Page, Path, renderToBuffer, StyleSheet, Svg, Text, View } from '@react-pdf/renderer';
import { MARK_PATHS, SHAPE_COLORS, SHAPE_ORDER, formatJakarta, formatTimeRange, maskPhone } from '@zemi/shared';
import { apiPath } from '../../config/paths.js';

/**
 * "Kertas Absensi": the printable A4 attendance sheet for the front desk (@react-pdf/renderer).
 * The page header, the table header and the footer are `fixed` + absolutely positioned inside the page
 * padding, so they repeat on every page at the same spot while rows flow underneath (rows never split).
 */

const FONT_DIR = apiPath('assets', 'fonts');
const FONT_FILES = {
  body: ['AtkinsonHyperlegibleNext-Regular.ttf', 'AtkinsonHyperlegibleNext-Bold.ttf'],
  display: ['Recursive-Display-Bold.ttf', 'Recursive-Display-Black.ttf'],
  mono: ['Recursive-Mono-Regular.ttf', 'Recursive-Mono-Bold.ttf'],
};

let fonts: { body: string; display: string; mono: string } | null = null;

/** Register the brand TTFs once. Falls back to the built-in Helvetica/Courier when the files are missing. */
function ensureFonts(): { body: string; display: string; mono: string } {
  if (fonts) return fonts;
  const has = (f: string) => existsSync(`${FONT_DIR}/${f}`);
  const ok = [...FONT_FILES.body, ...FONT_FILES.display, ...FONT_FILES.mono].every(has);
  if (ok) {
    Font.register({
      family: 'Atkinson',
      fonts: [
        { src: `${FONT_DIR}/${FONT_FILES.body[0]}`, fontWeight: 400 },
        { src: `${FONT_DIR}/${FONT_FILES.body[1]}`, fontWeight: 700 },
      ],
    });
    Font.register({
      family: 'RecursiveDisplay',
      fonts: [
        { src: `${FONT_DIR}/${FONT_FILES.display[0]}`, fontWeight: 700 },
        { src: `${FONT_DIR}/${FONT_FILES.display[1]}`, fontWeight: 900 },
      ],
    });
    Font.register({
      family: 'RecursiveMono',
      fonts: [
        { src: `${FONT_DIR}/${FONT_FILES.mono[0]}`, fontWeight: 400 },
        { src: `${FONT_DIR}/${FONT_FILES.mono[1]}`, fontWeight: 700 },
      ],
    });
    fonts = { body: 'Atkinson', display: 'RecursiveDisplay', mono: 'RecursiveMono' };
  } else {
    fonts = { body: 'Helvetica', display: 'Helvetica', mono: 'Courier' };
  }
  // Names and codes must never be hyphenated.
  Font.registerHyphenationCallback((word) => [word]);
  return fonts;
}

export interface SheetPerson {
  fullName: string;
  ticketCode: string;
  phone: string;
  attendanceMode: 'in-person' | 'online';
  checkedIn: boolean;
}

export interface SheetInput {
  event: {
    title: string;
    number: number | null;
    startsAt: Date;
    endsAt: Date;
    venue: string | null;
    roomNote: string | null;
    mode: 'hybrid' | 'offline' | 'online';
  };
  people: SheetPerson[];
  blankRows: number;
  counts: { registered: number; inPerson: number; online: number; checkedIn: number };
  modeFilter: 'all' | 'in-person';
  printedAt: Date;
}

const C = {
  ink: '#0e1116',
  ink2: '#3b4150',
  ink3: '#6b7280',
  ink4: '#9aa1ad',
  line: '#d8d8d2',
  hair: '#ececea',
  shade: '#f7f7f5',
  blue: '#3a6dc5',
  red: '#f94141',
  yellow: '#f7bf33',
  green: '#0f8657',
  green50: '#e2f1ea',
};

const PAGE_X = 32;
const HEADER_TOP = 26;
const TABLE_TOP = 136;
const THEAD_H = 20;
const ROW_H = 27;
const FOOTER_H = 60;

const COLS = [
  { key: 'no', label: 'No', width: 28, align: 'right' as const },
  { key: 'name', label: 'Name', flex: 1 },
  { key: 'code', label: 'Ticket', width: 74 },
  { key: 'phone', label: 'Phone', width: 64 },
  { key: 'mode', label: 'Joining', width: 58 },
  { key: 'rsvp', label: 'Here', width: 36, align: 'center' as const },
  { key: 'sign', label: 'Signature', width: 118 },
];

function styles(f: { body: string; display: string; mono: string }) {
  return StyleSheet.create({
    page: {
      paddingTop: TABLE_TOP + THEAD_H,
      paddingBottom: FOOTER_H + 16,
      paddingHorizontal: PAGE_X,
      fontFamily: f.body,
      fontSize: 9.5,
      color: C.ink,
      backgroundColor: '#ffffff',
    },
    header: { position: 'absolute', top: HEADER_TOP, left: PAGE_X, right: PAGE_X, flexDirection: 'row', alignItems: 'flex-start' },
    eyebrow: { fontFamily: f.mono, fontSize: 7.5, letterSpacing: 1.1, color: C.ink3, textTransform: 'uppercase' },
    title: { fontFamily: f.display, fontWeight: 900, fontSize: 17, lineHeight: 1.08, color: C.ink, marginTop: 3 },
    meta: { fontFamily: f.body, fontSize: 9, color: C.ink2, marginTop: 5, lineHeight: 1.35 },
    countsBox: { width: 132, marginLeft: 14, borderWidth: 1, borderColor: C.hair, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10 },
    countRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 1.5 },
    countLabel: { fontFamily: f.mono, fontSize: 7, letterSpacing: 0.6, color: C.ink3, textTransform: 'uppercase' },
    countValue: { fontFamily: f.mono, fontWeight: 700, fontSize: 9, color: C.ink },
    strip: { position: 'absolute', top: TABLE_TOP - 11, left: PAGE_X, right: PAGE_X, height: 4, flexDirection: 'row' },
    thead: {
      position: 'absolute',
      top: TABLE_TOP,
      left: PAGE_X,
      right: PAGE_X,
      height: THEAD_H,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.ink,
      borderRadius: 5,
    },
    th: { fontFamily: f.mono, fontWeight: 700, fontSize: 7, letterSpacing: 0.8, color: '#ffffff', textTransform: 'uppercase', paddingHorizontal: 5 },
    row: { flexDirection: 'row', alignItems: 'center', height: ROW_H, borderBottomWidth: 0.6, borderBottomColor: C.hair },
    td: { paddingHorizontal: 5, fontSize: 9.5 },
    no: { fontFamily: f.mono, fontSize: 8, color: C.ink3 },
    name: { fontFamily: f.body, fontWeight: 700, fontSize: 10, color: C.ink },
    code: { fontFamily: f.mono, fontSize: 8.5, color: C.ink, letterSpacing: 0.3 },
    phone: { fontFamily: f.mono, fontSize: 8, color: C.ink2 },
    mode: { fontFamily: f.body, fontSize: 8.5, color: C.ink2 },
    box: { width: 11, height: 11, borderWidth: 1, borderColor: C.ink2, borderRadius: 2.5, alignItems: 'center', justifyContent: 'center' },
    boxDone: { width: 11, height: 11, borderRadius: 2.5, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
    sign: { height: 17, marginHorizontal: 5, borderWidth: 0.8, borderColor: C.line, borderRadius: 4, backgroundColor: '#ffffff' },
    blankLine: { height: 12, marginRight: 8, borderBottomWidth: 0.8, borderBottomColor: C.line },
    note: { marginTop: 14, padding: 10, borderRadius: 8, backgroundColor: C.shade, fontSize: 8.5, color: C.ink2, lineHeight: 1.4 },
    footer: {
      position: 'absolute',
      bottom: 22,
      left: PAGE_X,
      right: PAGE_X,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      borderTopWidth: 0.6,
      borderTopColor: C.hair,
      paddingTop: 7,
    },
    footerNote: { position: 'absolute', bottom: 46, left: PAGE_X, right: PAGE_X },
    footText: { fontFamily: f.body, fontSize: 7.5, color: C.ink3 },
    pageNo: { fontFamily: f.mono, fontSize: 7.5, color: C.ink2 },
  });
}

function Mark({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {SHAPE_ORDER.map((s) => (
        <Path key={s} d={MARK_PATHS[s]} fill={SHAPE_COLORS[s]} />
      ))}
    </Svg>
  );
}

function Check() {
  return (
    <Svg width={8} height={8} viewBox="0 0 24 24">
      <Path d="M4 12.5 L9.5 18 L20 6.5" stroke="#ffffff" strokeWidth={3.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Keep long titles and names inside their box (react-pdf has no reliable line clamp). */
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

const colStyle = (c: (typeof COLS)[number]) => ({
  ...(c.width ? { width: c.width } : { flex: c.flex ?? 1 }),
  ...(c.align === 'right' ? { textAlign: 'right' as const } : c.align === 'center' ? { alignItems: 'center' as const } : {}),
});

function AttendanceSheet({ input }: { input: SheetInput }) {
  const f = ensureFonts();
  const s = styles(f);
  const e = input.event;
  const label = e.number != null ? `Zemi #${e.number}` : 'Zemi';
  const where = e.mode === 'online' ? 'Online' : [e.venue, e.roomNote].filter(Boolean).join(', ') || 'Room to be announced';
  const total = input.people.length + input.blankRows;
  return (
    <Document title={`${label} attendance sheet`} author="Zemi" creator="Zemi" producer="Zemi" language="id">
      <Page size="A4" style={s.page} wrap>
        <View style={s.header} fixed>
          <Mark size={38} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.eyebrow}>
              Kertas Absensi · Attendance sheet · {label}
              {input.modeFilter === 'in-person' ? ' · In person only' : ''}
            </Text>
            <Text style={s.title}>{clip(e.title, 64)}</Text>
            <Text style={s.meta}>
              {formatJakarta(e.startsAt, 'date-long')} · {formatTimeRange(e.startsAt, e.endsAt)}
              {'\n'}
              {clip(where, 90)}
            </Text>
          </View>
          <View style={s.countsBox}>
            {(
              [
                ['Registered', input.counts.registered],
                ['In person', input.counts.inPerson],
                ['Online', input.counts.online],
                ['Checked in', input.counts.checkedIn],
              ] as const
            ).map(([k, v]) => (
              <View key={k} style={s.countRow}>
                <Text style={s.countLabel}>{k}</Text>
                <Text style={s.countValue}>{v}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={s.strip} fixed>
          {[C.blue, C.red, C.yellow, C.green].map((c) => (
            <View key={c} style={{ flex: 1, backgroundColor: c }} />
          ))}
        </View>

        <View style={s.thead} fixed>
          {COLS.map((c) => (
            <View key={c.key} style={colStyle(c)}>
              <Text style={[s.th, c.align === 'right' ? { textAlign: 'right' } : {}]}>{c.label}</Text>
            </View>
          ))}
        </View>

        {input.people.map((p, i) => (
          <View key={`p${i}`} style={[s.row, i % 2 === 1 ? { backgroundColor: C.shade } : {}]} wrap={false}>
            <View style={colStyle(COLS[0]!)}>
              <Text style={[s.td, s.no, { textAlign: 'right' }]}>{i + 1}</Text>
            </View>
            <View style={colStyle(COLS[1]!)}>
              <Text style={[s.td, s.name]}>{clip(p.fullName, 52)}</Text>
            </View>
            <View style={colStyle(COLS[2]!)}>
              <Text style={[s.td, s.code]}>{p.ticketCode}</Text>
            </View>
            <View style={colStyle(COLS[3]!)}>
              <Text style={[s.td, s.phone]}>{p.phone ? maskPhone(p.phone) : ''}</Text>
            </View>
            <View style={colStyle(COLS[4]!)}>
              <Text style={[s.td, s.mode]}>{p.attendanceMode === 'online' ? 'Online' : 'In person'}</Text>
            </View>
            <View style={colStyle(COLS[5]!)}>
              {p.checkedIn ? (
                <View style={s.boxDone}>
                  <Check />
                </View>
              ) : (
                <View style={s.box} />
              )}
            </View>
            <View style={colStyle(COLS[6]!)}>
              <View style={s.sign} />
            </View>
          </View>
        ))}

        {Array.from({ length: input.blankRows }, (_, j) => {
          const i = input.people.length + j;
          return (
            <View key={`b${j}`} style={[s.row, i % 2 === 1 ? { backgroundColor: C.shade } : {}]} wrap={false}>
              <View style={colStyle(COLS[0]!)}>
                <Text style={[s.td, s.no, { textAlign: 'right' }]}>{i + 1}</Text>
              </View>
              <View style={[colStyle(COLS[1]!), { paddingLeft: 5 }]}>
                <View style={s.blankLine} />
              </View>
              <View style={colStyle(COLS[2]!)}>
                <Text style={[s.td, { fontFamily: f.mono, fontSize: 7.5, color: C.ink4 }]}>WALK-IN</Text>
              </View>
              <View style={[colStyle(COLS[3]!), { paddingLeft: 5 }]}>
                <View style={s.blankLine} />
              </View>
              <View style={colStyle(COLS[4]!)}>
                <Text style={[s.td, { fontSize: 7.5, color: C.ink4 }]}>In person</Text>
              </View>
              <View style={colStyle(COLS[5]!)}>
                <View style={s.box} />
              </View>
              <View style={colStyle(COLS[6]!)}>
                <View style={s.sign} />
              </View>
            </View>
          );
        })}

        {total === 0 ? (
          <Text style={[s.note, { marginTop: 20 }]}>Nobody has signed up yet. Add blank rows with ?blankRows=20 and let people write themselves in.</Text>
        ) : null}

        <View style={s.footerNote} fixed>
          <Text style={s.footText}>
            Tick "Here" when someone arrives and ask them to sign. Walk-ins: use an empty row, we add you after the session. Phones show the
            last 4 digits only. Keep this sheet with the organizers.
          </Text>
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footText}>
            Zemi by MGM Laboratory · Printed {formatJakarta(input.printedAt, 'datetime')} WIB · {total} {total === 1 ? 'row' : 'rows'}
          </Text>
          <Text style={s.pageNo} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderAttendanceSheet(input: SheetInput): Promise<Buffer> {
  return renderToBuffer(<AttendanceSheet input={input} />);
}
