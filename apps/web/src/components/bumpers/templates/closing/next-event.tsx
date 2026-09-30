'use client';

import { formatJakarta, jakartaParts, jakartaTimeInput, type BumperEventData, type ShapeName } from '@zemi/shared';
import { useEnter, useIdle, useSlide } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText, fontStyle } from '../../engine/fit-text';
import { gsap } from '../../engine/gsap';
import { ACCENT_HEX, GRAPH, INK, INK_2, INK_3, PAPER } from '../../engine/palette';
import { eventNumberLabel, eventRoom, speakerPerson } from '../../engine/resolve';
import type { BumperPerson, ResolveCtx } from '../../engine/types';
import { BumperCharacter, charAnim } from '../../parts/character';
import { BrandQr, QR_TONES } from '../../parts/qr';
import { BumperAvatar } from '../../parts/shapes';
import { daysUntilLabel, onPop, paperObject, popFill, QrCard, resetCast, shapeTint } from '../_tpl-end-kit';
import { defineTemplate, Eyebrow, f, useMascots } from '../kit';

/** The event this card promotes: the picked event, else the next published Friday. Never today's. */
export function promotedEvent(ctx: ResolveCtx): BumperEventData | null {
  if (ctx.slide.refs.eventId) return ctx.event;
  return ctx.nextEvent && ctx.nextEvent.id !== ctx.event?.id ? ctx.nextEvent : null;
}

function promotedLineup(ctx: ResolveCtx, ev: BumperEventData | null): BumperPerson[] {
  if (!ev) return [];
  const order = { keynote: 0, speaker: 1, panelist: 2, moderator: 3 } as Record<string, number>;
  return [...ev.speakers]
    .sort((a, b) => (order[a.role] ?? 2) - (order[b.role] ?? 2))
    .map((es) => ctx.data.speakers[es.speakerId])
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map((s) => speakerPerson(s, ev));
}

/** "With Nadia Putri", "With Nadia and Bima", "With Nadia, Bima and 2 more". */
function withLine(people: BumperPerson[]): string {
  if (!people.length) return '';
  if (people.length === 1) return `With ${people[0]!.name}`;
  const firsts = people.map((p) => p.first);
  if (people.length === 2) return `With ${firsts[0]} and ${firsts[1]}`;
  if (people.length === 3) return `With ${firsts[0]}, ${firsts[1]} and ${firsts[2]}`;
  return `With ${firsts[0]}, ${firsts[1]} and ${people.length - 2} more`;
}

const MONTH = (iso: string) => formatJakarta(iso, 'month-year');

/** A tear-off calendar page (weekday, the day, month and year). */
function CalendarPage({ iso, accent, big }: { iso: string | null; accent: string; big: number }) {
  const p = iso ? jakartaParts(iso) : null;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '34px 30px 38px', background: PAPER }}>
      <span style={{ ...fontStyle('mono', { weight: 800, tracking: 0.28 }), fontSize: 38, color: accent, textTransform: 'uppercase', lineHeight: 1 }}>{iso ? formatJakarta(iso, 'weekday') : 'Soon'}</span>
      <span data-cal-day="" style={{ ...fontStyle('display', { weight: 950, casl: 0 }), fontSize: big, lineHeight: 0.8, color: INK, letterSpacing: '-0.06em', marginTop: 10 }}>
        {p ? p.day : '?'}
      </span>
      <span style={{ ...fontStyle('mono', { weight: 700, tracking: 0.16 }), fontSize: 30, color: INK_2, textTransform: 'uppercase', lineHeight: 1 }}>{iso ? MONTH(iso) : 'Stay tuned'}</span>
    </div>
  );
}

/** Ticket outline with a notch at the tear line, top and bottom (px path for clip-path and the SVG outline). */
function ticketPath(w: number, h: number, tear: number, r = 38, n = 34) {
  return `M${r} 0H${tear - n}A${n} ${n} 0 0 0 ${tear + n} 0H${w - r}Q${w} 0 ${w} ${r}V${h - r}Q${w} ${h} ${w - r} ${h}H${tear + n}A${n} ${n} 0 0 0 ${tear - n} ${h}H${r}Q0 ${h} 0 ${h - r}V${r}Q0 0 ${r} 0Z`;
}

/**
 * Next Friday: the next published event (or the picked one) with its number, title, date and
 * room, who is speaking, and a big register QR. Calendar: today's page tears off to reveal the
 * next date while the crew watches it go. Ticket: a graph-paper ticket slides in and gets
 * stamped "See you there".
 */
function Render() {
  const ctx = useSlide();
  const ticket = ctx.slide.style.variant === 'ticket';
  const ev = promotedEvent(ctx);
  const cast = useMascots(ticket ? ['arch', 'circle'] : ['circle']);
  const people = ctx.flag('showSpeakers', true) ? promotedLineup(ctx, ev) : [];
  const url = ctx.text('url');
  const showQr = ctx.flag('showQr', true) && !!url;
  const live = ctx.mode === 'live';
  const still = ctx.theme.motion === 'still';
  const obj = paperObject(ctx.colors);
  const pageAccent = ctx.accent === 'yellow' ? INK : ACCENT_HEX[ctx.accent];
  const frame = obj.border === '#ffffff00' ? PAPER : obj.border;
  // The page that tears away: today's Friday (the show's event) when we know it, else today.
  const oldIso = !ctx.slide.refs.eventId && ctx.event ? ctx.event.startsAt : new Date(ctx.now()).toISOString();
  const tearable = live && !!ev && formatJakarta(oldIso, 'iso-date') !== formatJakarta(ev.startsAt, 'iso-date');
  const soon = ev ? daysUntilLabel(ev.startsAt, ctx.now()) : '';
  const eid = ev?.id ?? 'none';

  useEnter((tl, root, { at, calm }) => {
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-ne-char]'));
    resetCast(chars);
    const day = root.querySelector<HTMLElement>('[data-el="calendar"] [data-cal-day]');
    const title = root.querySelector<HTMLElement>('[data-el="title"] [data-fit]');
    if (title) tl.fromTo(title, { '--casl': 0 }, { '--casl': 0.7, duration: at(1.6), ease: 'power2.out' }, at(0.5));
    const old = root.querySelector<HTMLElement>('[data-cal-old]');
    if (old) {
      if (!still) {
        // Lift the corner, hang for a beat, then tear and tumble away.
        tl.fromTo(old, { rotation: 0, y: 0, x: 0, autoAlpha: 1, transformOrigin: '6% 2%' }, { rotation: calm ? 3 : 7, duration: at(0.35), ease: 'power2.out' }, at(0.55));
        tl.to(old, { rotation: calm ? 18 : 34, y: 980, x: calm ? 60 : 160, duration: at(0.85), ease: 'power2.in' }, at(1.05));
        tl.to(old, { autoAlpha: 0, duration: at(0.2) }, at(1.7));
      }
    }
    if (day) tl.fromTo(day, { '--casl': 0 }, { '--casl': 1, duration: at(1.2), ease: 'power2.out' }, at(1.2));
    if (!still) {
      chars.forEach((c, i) => {
        tl.fromTo(c, { y: ticket ? 170 : -420, autoAlpha: ticket ? 1 : 0 }, { y: 0, autoAlpha: 1, duration: at(ticket ? 0.7 : 0.6), ease: ticket ? 'back.out(1.6)' : 'bounce.out' }, at((ticket ? 0.9 : 0.25) + i * 0.12));
        if (old) {
          tl.add(charAnim.look(c, 0.4, 1, 0.25), at(1.05));
          tl.add(charAnim.look(c, 0.2, 0.2, 0.4), at(1.9));
        }
        tl.add(charAnim.cheer(c, { height: calm ? 12 : 26, spin: !calm && i === 0 }), at((ticket ? 2.15 : 1.95) + i * 0.1));
      });
    }
    const card = root.querySelector('[data-ticket]');
    if (card && !still) tl.fromTo(card, { x: 1500, rotation: 9 }, { x: 0, rotation: 0, duration: at(calm ? 1.1 : 0.95), ease: 'zemiOut' }, at(0.05));
    const stamp = root.querySelector<HTMLElement>('[data-stamp]');
    if (stamp && !still) {
      tl.fromTo(stamp, { scale: calm ? 1.4 : 2.6, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: at(0.26), ease: 'back.out(1.4)' }, at(1.9));
      if (card && !calm) tl.fromTo(card, { y: 0 }, { y: 8, duration: at(0.07), yoyo: true, repeat: 1, ease: 'power1.inOut' }, at(2.12));
    }
    const qr = root.querySelector('[data-el="qr"] [data-qr-card]');
    if (qr && !still) tl.fromTo(qr, { rotation: -8, scale: 0.6 }, { rotation: 0, scale: 1, duration: at(0.8), ease: 'back.out(1.7)' }, at(ticket ? 1.1 : 1.3));
    const faces = root.querySelectorAll('[data-ne-face]');
    if (faces.length && !still) tl.fromTo(faces, { scale: 0 }, { scale: 1, duration: at(0.5), ease: 'back.out(2)', stagger: at(0.07) }, at(1.35));
  });

  useIdle((root, { calm }) => {
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-ne-char]'));
    const stops = chars.map((c) => charAnim.blinkLoop(c));
    const anims: gsap.core.Animation[] = chars.flatMap((c, i) => charAnim.idle(c, { calm, seed: i * 4 + 2 }));
    // Glance from the date to the QR and back, now and then.
    const glance = gsap.timeline({ repeat: -1, repeatDelay: 3.5, delay: 2 });
    chars.forEach((c) => {
      glance.add(charAnim.look(c, 1, 0.6, 0.4), 0).add(charAnim.look(c, 0.2, 0, 0.4), 2.2);
    });
    anims.push(glance);
    const card = root.querySelector('[data-ticket]');
    if (card) anims.push(gsap.to(card, { y: calm ? -5 : -10, rotation: calm ? 0.3 : 0.6, duration: 3.4, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    const cal = root.querySelector('[data-cal-body]');
    if (cal) anims.push(gsap.to(cal, { rotation: calm ? 0.6 : 1.2, duration: 4, ease: 'sine.inOut', yoyo: true, repeat: -1, transformOrigin: '50% 0%' }));
    const chip = root.querySelector('[data-soon]');
    if (chip) anims.push(gsap.to(chip, { rotation: calm ? 2 : 5, scale: calm ? 1.02 : 1.05, duration: 1.6, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    const qr = root.querySelector('[data-el="qr"] [data-qr-card]');
    if (qr) anims.push(gsap.to(qr, { y: calm ? -4 : -8, duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    return () => {
      stops.forEach((s) => s());
      anims.forEach((a) => a.kill());
    };
  });

  const eyebrow = ctx.text('eyebrow');
  const title = ctx.text('title');
  const date = ctx.text('date');
  const hours = ctx.text('hours');
  const room = ctx.text('room');
  const tag = ctx.text('tag');
  const faces = people.slice(0, 5);

  const renderFaces = (size: number) =>
    faces.length ? (
      <div style={{ display: 'flex', alignItems: 'center', flex: 'none' }}>
        {faces.map((p, i) => (
          <div key={p.id ?? i} data-ne-face="" style={{ marginLeft: i ? -size * 0.22 : 0, zIndex: faces.length - i, position: 'relative' }}>
            <BumperAvatar image={p.avatar} name={p.name} clip={p.shape} size={size} ring={5} ringColor={ticket ? PAPER : ctx.colors.bg === 'transparent' ? PAPER : ctx.colors.bg} />
          </div>
        ))}
      </div>
    ) : null;

  if (ticket) {
    const W = 1640;
    const H = 620;
    const tear = 1170;
    const d = ticketPath(W, H, tear);
    const rows: Array<[string, string]> = [
      ['When', [date, hours].filter(Boolean).join(', ')],
      ['Where', room],
    ];
    return (
      <>
        {cast.length ? (
          <El id="cast" label="Characters" box={{ x: 700, y: 118, w: 460, h: 170 }} enter="fade" lockAspect>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 24 }}>
              {cast.map((s, i) => (
                <div key={s} data-ne-char="" style={{ width: cast.length > 2 ? 110 : 150, height: cast.length > 2 ? 110 : 150 }}>
                  <BumperCharacter shape={s} color={shapeTint(ctx.colors, s)} mood={i === 1 ? 'surprised' : 'happy'} lookX={0.5} lookY={0.6} />
                </div>
              ))}
            </div>
          </El>
        ) : null}
        <El id="ticket" label="Ticket" box={{ x: 140, y: 250, w: W, h: H }} enter="fade" lockAspect>
          <div data-ticket="" style={{ position: 'absolute', inset: 0, rotate: '-1.5deg' }}>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', left: 18, top: 18, overflow: 'visible' }} aria-hidden="true">
              <path d={d} fill={obj.shadow} />
            </svg>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                clipPath: `path('${d}')`,
                background: PAPER,
                backgroundImage: `linear-gradient(to right, ${GRAPH} 2px, transparent 2px), linear-gradient(to bottom, ${GRAPH} 2px, transparent 2px)`,
                backgroundSize: '40px 40px',
              }}
            >
              <div style={{ position: 'absolute', left: 64, top: 52, width: tear - 128, height: H - 104, display: 'flex', flexDirection: 'column', color: INK }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 48 }}>
                  <Eyebrow size={30} color={INK} shape={ctx.accent === 'yellow' ? 'square' : undefined}>
                    {eyebrow}
                  </Eyebrow>
                  <span style={{ ...fontStyle('mono', { weight: 800, tracking: 0.12 }), fontSize: 26, color: INK_3, textTransform: 'uppercase' }}>Admit one</span>
                </div>
                <div style={{ height: 250, marginTop: 22 }} data-ticket-title="" data-morph={ev ? `event:${eid}:title` : undefined}>
                  <FitText max={130} min={56} casl={0} lineHeight={0.92} valign="center">
                    {title}
                  </FitText>
                </div>
                <div style={{ marginTop: 'auto', display: 'grid', gridTemplateColumns: '150px 1fr', rowGap: 16, columnGap: 20, alignItems: 'center' }}>
                  {rows
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k} style={{ display: 'contents' }}>
                        <span style={{ ...fontStyle('mono', { weight: 800, tracking: 0.16 }), fontSize: 22, color: pageAccent, textTransform: 'uppercase' }}>{k}</span>
                        <span style={{ ...fontStyle('body', { weight: 700 }), fontSize: 36, lineHeight: 1.15, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
                      </div>
                    ))}
                  {faces.length ? (
                    <div style={{ display: 'contents' }}>
                      <span style={{ ...fontStyle('mono', { weight: 800, tracking: 0.16 }), fontSize: 22, color: pageAccent, textTransform: 'uppercase' }}>Who</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 18, minWidth: 0 }}>
                        {renderFaces(64)}
                        <span style={{ ...fontStyle('body', { weight: 700 }), fontSize: 32, color: INK_2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{withLine(people).replace(/^With /, '')}</span>
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
              {showQr ? (
                <div style={{ position: 'absolute', left: tear, top: 0, width: W - tear, height: H, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
                  <div style={{ width: 384, height: 384, borderRadius: 22, overflow: 'hidden', border: `3px solid ${INK}` }} data-ticket-qr="" data-morph={`qr:${url}`}>
                    <BrandQr value={url} style={ctx.theme.qrStyle} color={QR_TONES.ink} logo radius={0} />
                  </div>
                  <span style={{ ...fontStyle('display', { weight: 850, casl: 0.6 }), fontSize: 40, color: INK, lineHeight: 1 }}>{ctx.text('qrLabel')}</span>
                  <span style={{ ...fontStyle('mono', { weight: 600 }), fontSize: 20, color: INK_2 }}>{ctx.text('qrSub')}</span>
                </div>
              ) : (
                <div style={{ position: 'absolute', left: tear, top: 0, width: W - tear, height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ ...fontStyle('display', { weight: 950, casl: 1 }), fontSize: 150, color: INK, rotate: '-90deg', whiteSpace: 'nowrap' }}>{ev ? eventNumberLabel(ev) || 'Zemi' : 'Zemi'}</span>
                </div>
              )}
            </div>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }} aria-hidden="true">
              <path d={d} fill="none" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
              <line x1={tear} y1={46} x2={tear} y2={H - 46} stroke={INK} strokeWidth={4} strokeDasharray="4 16" strokeLinecap="round" />
            </svg>
          </div>
        </El>
        {tag ? (
          <El id="tag" label="Stamp" box={{ x: 690, y: 736, w: 500, h: 190 }} align="center" valign="center" enter="fade" order={8}>
            <div data-stamp="" style={{ rotate: '-9deg', padding: '18px 38px', borderRadius: 26, border: `7px solid ${ctx.colors.accentHex === '#f7bf33' ? INK : ctx.colors.accentDeep}`, color: ctx.colors.accentHex === '#f7bf33' ? INK : ctx.colors.accentDeep, background: `${PAPER}cc`, boxShadow: `inset 0 0 0 4px ${PAPER}, inset 0 0 0 7px ${ctx.colors.accentHex === '#f7bf33' ? INK : ctx.colors.accentDeep}` }}>
              <span style={{ ...fontStyle('display', { weight: 950, casl: 0.2, tracking: 0.02 }), fontSize: 56, lineHeight: 1, textTransform: 'uppercase', whiteSpace: 'nowrap', display: 'block' }}>{tag}</span>
            </div>
          </El>
        ) : null}
      </>
    );
  }

  return (
    <>
      <El id="calendar" label="Calendar" box={{ x: 130, y: 250, w: 580, h: 700 }} enter="drop" lockAspect>
        <div data-cal-body="" style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', left: 16, top: 16, right: -16, bottom: -16, borderRadius: 40, background: obj.shadow }} />
          <div style={{ position: 'absolute', inset: 0, borderRadius: 40, overflow: 'hidden', border: `5px solid ${frame}`, background: PAPER }}>
            <div style={{ position: 'absolute', left: 0, top: 113, right: 0, bottom: 0 }}>
              <CalendarPage iso={ev?.startsAt ?? null} accent={pageAccent} big={380} />
            </div>
            <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: 113, background: popFill(ctx.colors) === PAPER ? INK : popFill(ctx.colors), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 200 }}>
              {[0, 1].map((i) => (
                <span key={i} style={{ width: 34, height: 34, borderRadius: 34, background: PAPER, boxShadow: `inset 0 6px 0 ${INK}55` }} />
              ))}
            </div>
          </div>
          {tearable ? (
            // Outside the frame's clip, so the torn page can fall right off the calendar. Hidden unless the entrance is playing: a settled or static slide always shows the next date.
            <div data-cal-old="" style={{ position: 'absolute', left: 5, top: 118, right: 5, bottom: 5, borderRadius: '0 0 35px 35px', overflow: 'hidden', boxShadow: `0 -5px 0 ${INK}14`, visibility: 'hidden', opacity: 0 }}>
              <CalendarPage iso={oldIso} accent={INK_3} big={380} />
            </div>
          ) : null}
          {soon ? (
            <div data-soon="" style={{ position: 'absolute', left: -44, top: 30, padding: '14px 28px', borderRadius: 999, background: ctx.colors.dark && ctx.background !== 'accent' ? ctx.colors.accentHex : INK, color: ctx.colors.dark && ctx.background !== 'accent' ? ctx.colors.onAccent : PAPER, rotate: '-7deg', ...fontStyle('display', { weight: 850, casl: 1 }), fontSize: 44, lineHeight: 1, whiteSpace: 'nowrap' }}>
              {soon}
            </div>
          ) : null}
        </div>
        {cast.length ? (
          <div style={{ position: 'absolute', left: 0, right: 0, top: cast.length > 2 ? -92 : -134, display: 'flex', justifyContent: 'flex-end', gap: 14, paddingRight: cast.length > 2 ? 24 : 56, zIndex: 2 }}>
            {cast.map((s: ShapeName, i) => (
              <div key={s} data-ne-char="" style={{ width: cast.length > 2 ? 96 : 140, height: cast.length > 2 ? 96 : 140 }}>
                <BumperCharacter shape={s} color={shapeTint(ctx.colors, s)} mood={i % 2 ? 'surprised' : 'happy'} lookX={0.2} lookY={0.3} />
              </div>
            ))}
          </div>
        ) : null}
      </El>
      <El id="eyebrow" label="Eyebrow" box={{ x: 820, y: 160, w: 1000, h: 56 }} enter="wipe" order={1}>
        <Eyebrow size={32}>{eyebrow}</Eyebrow>
      </El>
      <El id="title" label="Title" box={{ x: 810, y: 228, w: 1014, h: 290 }} enter="split-words" order={2} morph={ev ? `event:${eid}:title` : null}>
        <FitText max={146} min={60} casl={0} lineHeight={1.02} valign="center">
          {title}
        </FitText>
      </El>
      {hours || room ? (
        <El id="meta" label="Time and room" box={{ x: 820, y: 540, w: showQr ? 560 : 1000, h: 116 }} enter="rise" order={4}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
            {[hours, room].filter(Boolean).map((v, i) => (
              <span key={i} style={{ ...fontStyle(i === 0 ? 'mono' : 'body', { weight: 700, tracking: i === 0 ? 0.04 : 0 }), fontSize: i === 0 ? 38 : 36, lineHeight: 1.15, color: i === 0 ? ctx.colors.fg : ctx.colors.fg2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {v}
              </span>
            ))}
          </div>
        </El>
      ) : null}
      {faces.length ? (
        <El id="speakers" label="Speakers" box={{ x: 820, y: 690, w: showQr ? 560 : 1000, h: 110 }} enter="rise" order={5} valign="center">
          <div style={{ display: 'flex', alignItems: 'center', gap: 22, width: '100%' }}>
            {renderFaces(96)}
            <div style={{ flex: 1, minWidth: 0, height: 96 }}>
              <FitText max={36} min={22} font="body" weight={700} lineHeight={1.2} valign="center" style={{ color: ctx.colors.fg }}>
                {withLine(people)}
              </FitText>
            </div>
          </div>
        </El>
      ) : null}
      {tag ? (
        <El id="tag" label="Sign-off" box={{ x: 820, y: 850, w: showQr ? 560 : 1000, h: 100 }} enter="pop" order={9}>
          <span style={{ ...fontStyle('display', { weight: 850, casl: 1 }), fontSize: 46, padding: '12px 30px', borderRadius: 999, background: popFill(ctx.colors), color: onPop(ctx.colors), rotate: '-3deg', display: 'inline-block', whiteSpace: 'nowrap' }}>{tag}</span>
        </El>
      ) : null}
      {showQr ? (
        <El id="qr" label="QR code" box={{ x: 1424, y: 522, w: 400, h: 494 }} enter="fade" order={6} lockAspect morph={`qr:${url}`}>
          <QrCard value={url} size={390} label={ctx.text('qrLabel')} sub={ctx.text('qrSub')} />
        </El>
      ) : null}
    </>
  );
}

export default defineTemplate({
  kind: 'next-event',
  background: 'paper',
  variants: [
    { key: 'calendar', label: 'Tear-off calendar', hint: "Today's page tears off to show the next date." },
    { key: 'ticket', label: 'Ticket', hint: 'A graph-paper ticket with the QR on its stub.' },
  ],
  fields: [
    f.eyebrow((ctx) => {
      const ev = promotedEvent(ctx);
      if (!ev) return 'Next Friday';
      const day = `Next ${formatJakarta(ev.startsAt, 'weekday')}`;
      return ev.number != null ? `${day} · Zemi ${eventNumberLabel(ev)}` : day;
    }),
    f.title((ctx) => promotedEvent(ctx)?.title ?? 'The next one is brewing'),
    { key: 'date', label: 'Date', type: 'text', max: 80, default: (ctx) => { const ev = promotedEvent(ctx); return ev ? formatJakarta(ev.startsAt, 'date-long') : ''; }, hint: 'From the event. Type to override.' },
    { key: 'hours', label: 'Time', type: 'text', max: 60, default: (ctx) => { const ev = promotedEvent(ctx); return ev ? `${jakartaTimeInput(ev.startsAt)} to ${jakartaTimeInput(ev.endsAt)} WIB` : `Dates on ${ctx.site.shortUrl} soon`; } },
    { key: 'room', label: 'Room', type: 'text', max: 120, default: (ctx) => eventRoom(promotedEvent(ctx)) },
    { key: 'tag', label: 'Sign-off', type: 'text', max: 40, default: (ctx) => { const ev = promotedEvent(ctx); return ctx.slide.style.variant === 'ticket' ? 'See you there' : `See you next ${ev ? formatJakarta(ev.startsAt, 'weekday') : 'Friday'}`; } },
    f.url((ctx) => promotedEvent(ctx)?.url ?? `${ctx.site.webUrl}/events`),
    f.qrLabel((ctx) => { const ev = promotedEvent(ctx); return ev && ev.registrationOpen ? 'Save your seat' : 'See what is on'; }),
    { key: 'qrSub', label: 'Small print under the QR', type: 'text', max: 60, default: (ctx) => { const ev = promotedEvent(ctx); return ev && ev.registrationOpen ? 'Free, takes 20 seconds' : ctx.site.shortUrl; } },
    { key: 'showSpeakers', label: 'Show who is speaking', type: 'toggle', default: true, group: 'options' },
    f.showQr(true),
  ],
  describe: (ctx) => {
    const ev = promotedEvent(ctx);
    return ev ? `Next: ${ev.number != null ? `Zemi ${eventNumberLabel(ev)}` : ev.title}` : 'Next Friday';
  },
  headline: (ctx) => {
    const ev = promotedEvent(ctx);
    return ev ? `Next ${formatJakarta(ev.startsAt, 'weekday')}` : 'Next Friday';
  },
  Render,
});
