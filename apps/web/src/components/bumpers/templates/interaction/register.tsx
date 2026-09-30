'use client';

import { formatJakarta, jakartaTimeInput, SHAPE_ORDER, type BumperEventData, type ShapeName } from '@zemi/shared';
import { useId } from 'react';
import { useEnter, useIdle, useSlide } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText, fontStyle } from '../../engine/fit-text';
import { BE, gsap } from '../../engine/gsap';
import { GRAPH, INK, INK_2, PAPER } from '../../engine/palette';
import { eventNumberLabel, eventRoom } from '../../engine/resolve';
import type { ResolveCtx } from '../../engine/types';
import { BumperCharacter, charAnim } from '../../parts/character';
import { BrandQr } from '../../parts/qr';
import { BrandShape } from '../../parts/shapes';
import { accentFill, charColor, Pill, QrCard, restChars, shortUrl, surface, textInk } from '../_tpl-mid-kit';
import { defineTemplate, Eyebrow, f, useMascots } from '../kit';

type Which = 'auto' | 'this' | 'next';

/**
 * The event this slide promotes. A picked event (refs) always wins. "auto" promotes the show's
 * event while its registration is open and it has not started, otherwise the next Friday.
 */
function registerEvent(ctx: ResolveCtx): BumperEventData | null {
  if (ctx.slide.refs.eventId && ctx.event) return ctx.event;
  const which = (ctx.text('which') || 'auto') as Which;
  if (which === 'next') return ctx.nextEvent ?? ctx.event;
  if (which === 'this') return ctx.event ?? ctx.nextEvent;
  const e = ctx.event;
  if (e && e.registrationOpen && Date.parse(e.startsAt) > ctx.now()) return e;
  return ctx.nextEvent ?? e;
}

const isNext = (ctx: ResolveCtx, e: BumperEventData | null) => !!e && !!ctx.nextEvent && e.id === ctx.nextEvent.id;

function whenLine(e: BumperEventData | null): string {
  if (!e) return '';
  return `${formatJakarta(e.startsAt, 'date-long')}  ·  ${jakartaTimeInput(e.startsAt)} to ${jakartaTimeInput(e.endsAt)} WIB`;
}

function whereLine(e: BumperEventData | null): string {
  if (!e) return '';
  const room = eventRoom(e);
  if (e.mode === 'hybrid') return room ? `${room}, or join online` : 'In the room or online';
  return room;
}

/** The ticket outline: rounded corners and two notches where the stub tears off. */
function ticketPath(w: number, h: number, px: number, r = 36, n = 34): string {
  return [
    `M${r} 0`,
    `H${px - n}`,
    `A${n} ${n} 0 0 0 ${px + n} 0`,
    `H${w - r}`,
    `Q${w} 0 ${w} ${r}`,
    `V${h - r}`,
    `Q${w} ${h} ${w - r} ${h}`,
    `H${px + n}`,
    `A${n} ${n} 0 0 0 ${px - n} ${h}`,
    `H${r}`,
    `Q0 ${h} 0 ${h - r}`,
    `V${r}`,
    `Q0 0 ${r} 0`,
    'Z',
  ].join(' ');
}

function Ticket({ w, h, px }: { w: number; h: number; px: number }) {
  const ctx = useSlide();
  const id = useId().replace(/[:]/g, '');
  const s = surface(ctx);
  const d = ticketPath(w, h, px);
  const bordered = s.border.startsWith('4px');
  const shadowColor = ctx.background === 'accent' ? INK : ctx.colors.accentHex;
  return (
    <svg viewBox={`-8 -8 ${w + 32} ${h + 32}`} width={w + 32} height={h + 32} style={{ position: 'absolute', left: -8, top: -8, overflow: 'visible', filter: ctx.background === 'transparent' ? 'drop-shadow(0 18px 40px rgba(14,17,22,0.35))' : undefined }} aria-hidden="true">
      <defs>
        <pattern id={`grid-${id}`} width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M32 0H0V32" fill="none" stroke={GRAPH} strokeWidth="2" />
        </pattern>
        <clipPath id={`clip-${id}`}>
          <path d={d} />
        </clipPath>
        <linearGradient id={`shine-${id}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ctx.background === 'transparent' ? null : <path d={d} transform="translate(14 14)" fill={shadowColor} />}
      <path d={d} fill={PAPER} />
      <path d={d} fill={`url(#grid-${id})`} />
      <g clipPath={`url(#clip-${id})`}>
        <rect data-ticket-shine="" x={-360} y={-40} width={220} height={h + 80} fill={`url(#shine-${id})`} transform="skewX(-18)" opacity={0} />
      </g>
      {bordered ? <path d={d} fill="none" stroke={INK} strokeWidth={4} /> : null}
      <path data-ticket-perf="" d={`M${px} 48 V${h - 48}`} stroke={INK_2} strokeWidth={5} strokeDasharray="2 16" strokeLinecap="round" opacity={0.55} />
    </svg>
  );
}

/** A small mono label + value row on the ticket. */
function Row({ label, value, color, labelColor, shadow }: { label: string; value: string; color: string; labelColor: string; shadow?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22, width: '100%', height: '100%' }}>
      <span style={{ ...fontStyle('mono', { weight: 700, tracking: 0.14 }), fontSize: 22, color: labelColor, width: 96, flex: 'none', textTransform: 'uppercase', textShadow: shadow }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0, height: '100%' }}>
        <FitText max={34} min={20} font="body" weight={600} lineHeight={1.2} valign="center" style={{ color, textShadow: shadow }}>
          {value}
        </FitText>
      </div>
    </div>
  );
}

/**
 * Save your seat: a graph-paper ticket for this Friday (or the next one), the QR on the stub, the
 * date and room, and "Free, takes 20 seconds". The crew queues on top of the ticket and hops in
 * one by one; the ticket catches a shine now and then.
 */
function Render() {
  const ctx = useSlide();
  const poster = ctx.slide.style.variant === 'poster';
  const cast = useMascots([...SHAPE_ORDER]);
  const event = registerEvent(ctx);
  const url = ctx.text('url') || `${ctx.site.webUrl}/events`;
  const eyebrow = ctx.text('eyebrow');
  const title = ctx.text('title') || 'Pick an event';
  const when = ctx.text('when');
  const where = ctx.text('where');
  const note = ctx.text('note');
  const label = ctx.text('qrLabel');
  const number = event?.number != null ? String(event.number) : '';
  const onTicket = !poster;
  // The ticket is paper, so its pill can always wear the accent.
  const chip = onTicket ? { fill: ctx.colors.accentHex, text: ctx.colors.onAccent } : accentFill(ctx);
  const ink = textInk(ctx);
  const textColor = onTicket ? INK : ink.fg;
  const labelColor = onTicket ? INK_2 : ink.fg2;
  const shadow = onTicket ? undefined : ink.shadow;

  useEnter((tl, root, { at, calm }) => {
    const ticket = root.querySelector('[data-ticket]');
    if (ticket) tl.fromTo(ticket, { y: calm ? 50 : 140, rotation: calm ? -1 : -4 }, { y: 0, rotation: 0, duration: at(1.05), ease: BE.out }, at(0));
    const perf = root.querySelector('[data-ticket-perf]');
    // The perforation grows down the ticket (drawSVG would replace its dot pattern with a solid line).
    if (perf) tl.fromTo(perf, { scaleY: 0 }, { scaleY: 1, transformOrigin: '50% 0%', duration: at(0.9), ease: BE.inOut }, at(0.45));
    const titleFit = root.querySelector<HTMLElement>('[data-el="title"] [data-fit]');
    if (titleFit) tl.fromTo(titleFit, { '--casl': 0 }, { '--casl': 0.7, duration: at(1.4), ease: 'power2.out' }, at(0.35));
    const pill = root.querySelector('[data-register-pill]');
    if (pill) tl.fromTo(pill, { scale: calm ? 1.15 : 1.7, rotation: -11, opacity: 0 }, { scale: 1, rotation: 0, opacity: 1, duration: at(0.45), ease: 'back.out(2.2)' }, at(1.15));
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-register-char]'));
    restChars(chars);
    chars.forEach((c, i) => {
      const back = chars.length - 1 - i;
      tl.fromTo(c, { x: -(calm ? 120 : 360) - back * 40, opacity: 0 }, { x: 0, opacity: 1, duration: at(0.7), ease: BE.out }, at(0.7 + back * 0.14));
      tl.add(charAnim.hop(c, { height: calm ? 8 : 20, duration: 0.36 }), at(0.72 + back * 0.14));
      tl.add(charAnim.squash(c), at(1.08 + back * 0.14));
    });
    const rest = (c: HTMLElement) => [Number(c.dataset.lookX ?? 1), Number(c.dataset.lookY ?? 0.3)] as const;
    if (chars[0]) tl.add(charAnim.look(chars[0], -1, 0, 0.3), at(1.6)).add(charAnim.look(chars[0], ...rest(chars[0]), 0.3), at(2.1));
    const shelf = root.querySelector('[data-register-shelf]');
    if (shelf) tl.fromTo(shelf, { scaleX: 0 }, { scaleX: 1, transformOrigin: '0% 50%', duration: at(0.7), ease: BE.out }, at(0.5));
  });

  useIdle((root, { calm }) => {
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-register-char]'));
    const stops = chars.map((c) => charAnim.blinkLoop(c));
    const anims: gsap.core.Animation[] = chars.flatMap((c, i) => charAnim.idle(c, { calm, seed: i * 5 }));
    // The last one in line gets impatient, the first one turns around to check.
    const last = chars[chars.length - 1];
    const first = chars[0];
    if (last && first) {
      const fidget = gsap.timeline({ repeat: -1, repeatDelay: 3.8 });
      fidget.add(charAnim.hop(last, { height: calm ? 8 : 16 }), 1.2).add(charAnim.hop(last, { height: calm ? 6 : 12 }), 1.62);
      if (first !== last) fidget.add(charAnim.look(first, -1, 0, 0.3), 2.2).add(charAnim.look(first, Number(first.dataset.lookX ?? 1), Number(first.dataset.lookY ?? 0.3), 0.3), 3.4);
      anims.push(fidget);
    }
    const shine = root.querySelector('[data-ticket-shine]');
    if (shine) anims.push(gsap.fromTo(shine, { x: 0, opacity: 0.9 }, { x: 2400, opacity: 0.9, duration: calm ? 3.2 : 2.2, ease: 'power1.inOut', repeat: -1, repeatDelay: 5.5, delay: 1 }));
    const ticket = root.querySelector('[data-ticket]');
    if (ticket) anims.push(gsap.fromTo(ticket, { y: 0 }, { y: calm ? -3 : -6, duration: 3.2, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    return () => {
      stops.forEach((s) => s());
      anims.forEach((a) => a.kill());
    };
  });

  // Ticket geometry (canvas px).
  const T = { x: 150, y: 196, w: 1620, h: 720 };
  const px = 1090;
  const stubX = T.x + px;
  const stubW = T.w - px;
  const qrSize = 410;
  const qrBox = poster ? { x: 1240, y: 206, w: 470, h: 470 } : { x: stubX + (stubW - qrSize) / 2, y: T.y + 90, w: qrSize, h: qrSize };
  const labelBox = poster ? { x: 1180, y: 718, w: 590, h: 56 } : { x: stubX + 30, y: qrBox.y + qrSize + 34, w: stubW - 60, h: 52 };
  const charSize = cast.length > 2 ? 112 : 136;
  const queueW = cast.length * charSize + Math.max(0, cast.length - 1) * 14;
  const queueBox = poster ? { x: Math.round(1475 - queueW / 2), y: 812, w: queueW, h: charSize } : { x: Math.round(stubX - 60 - queueW), y: T.y - charSize + 8, w: queueW, h: charSize };
  const left = poster ? 140 : T.x + 84;
  const colW = poster ? 1000 : px - 150;
  const watermark = ink.cam ? 'rgba(255,255,255,0.12)' : ctx.colors.dark ? 'rgba(255,255,255,0.07)' : ctx.background === 'accent' ? (ctx.accent === 'yellow' ? 'rgba(14,17,22,0.08)' : 'rgba(255,255,255,0.14)') : ctx.colors.accentSoft;

  return (
    <>
      {poster && number ? (
        <El id="number" label="Big number" box={{ x: 60, y: 60, w: 1180, h: 960 }} enter="fade" order={0} align="start" valign="center">
          <span aria-hidden="true" style={{ ...fontStyle('display', { weight: 1000, casl: 1, tracking: -0.06 }), fontSize: 820, lineHeight: 0.8, color: watermark, whiteSpace: 'nowrap' }}>
            {number}
          </span>
        </El>
      ) : null}
      {onTicket ? (
        <El id="ticket" label="Ticket" box={T} enter="fade" order={0}>
          <div data-ticket="" style={{ position: 'absolute', inset: 0 }}>
            <Ticket w={T.w} h={T.h} px={px} />
          </div>
        </El>
      ) : null}
      <El id="eyebrow" label="Eyebrow" box={poster ? { x: left, y: 226, w: colW, h: 56 } : { x: left, y: T.y + 76, w: colW - 220, h: 52 }} enter="wipe" order={1}>
        {onTicket ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 16, ...fontStyle('mono', { weight: 700, tracking: 0.12 }), fontSize: 30, textTransform: 'uppercase', color: INK, lineHeight: 1 }}>
            <span style={{ width: 24, height: 24, flex: 'none' }}>
              <BrandShape shape="square" />
            </span>
            <span data-split-target="">{eyebrow}</span>
          </span>
        ) : (
          <Eyebrow size={32} shape="square" color={ink.fg} style={{ textShadow: ink.shadow }}>
            {eyebrow}
          </Eyebrow>
        )}
      </El>
      {onTicket && number ? (
        <El id="number" label="Ticket number" box={{ x: T.x + px - 290, y: T.y + 64, w: 230, h: 80 }} enter="fade" order={2} align="end" valign="center">
          <span style={{ ...fontStyle('mono', { weight: 800, tracking: 0.04 }), fontSize: 44, color: INK, lineHeight: 1, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 22, color: INK_2, marginRight: 10, letterSpacing: '0.14em' }}>NO.</span>
            {number.padStart(3, '0')}
          </span>
        </El>
      ) : null}
      <El id="title" label="Event title" box={poster ? { x: left - 10, y: 296, w: colW + 20, h: 340 } : { x: left - 6, y: T.y + 158, w: colW, h: 250 }} enter="split-words" order={2} morph={event ? `event:${event.id}:title` : null}>
        <FitText max={poster ? 150 : 118} min={52} casl={0.7} lineHeight={0.92} valign={poster ? 'start' : 'center'} style={{ color: textColor, textShadow: shadow }}>
          {title}
        </FitText>
      </El>
      {when ? (
        <El id="when" label="Date and time" box={poster ? { x: left, y: 672, w: colW, h: 52 } : { x: left, y: T.y + 448, w: colW, h: 50 }} enter="rise" order={4}>
          <Row label="When" value={when} color={textColor} labelColor={labelColor} shadow={shadow} />
        </El>
      ) : null}
      {where ? (
        <El id="where" label="Room" box={poster ? { x: left, y: 736, w: colW, h: 52 } : { x: left, y: T.y + 510, w: colW, h: 50 }} enter="rise" order={5}>
          <Row label="Where" value={where} color={textColor} labelColor={labelColor} shadow={shadow} />
        </El>
      ) : null}
      {note ? (
        <El id="note" label="Note" box={poster ? { x: left, y: 834, w: 900, h: 96 } : { x: left, y: T.y + 590, w: colW, h: 90 }} enter="fade" order={6}>
          <div data-register-pill="" style={{ transformOrigin: '0% 50%', display: 'inline-block' }}>
            <div style={{ rotate: '-3deg', transformOrigin: '0% 50%' }}>
              <Pill icon="spark" bg={chip.fill} fg={chip.text} size={40} style={{ boxShadow: onTicket ? `5px 5px 0 ${INK}` : undefined }}>
                {note}
              </Pill>
            </div>
          </div>
        </El>
      ) : null}
      <El id="qr" label="QR code" box={qrBox} enter="pop" order={3} lockAspect morph={`qr:${url}`}>
        {onTicket ? (
          <div style={{ width: '100%', height: '100%', borderRadius: 24, overflow: 'hidden', background: '#ffffff', border: `4px solid ${INK}`, boxSizing: 'border-box', padding: 6 }}>
            <BrandQr value={url} style={ctx.theme.qrStyle} color={INK} logo title={`QR code for ${shortUrl(url)}`} />
          </div>
        ) : (
          <QrCard value={url} />
        )}
      </El>
      {label ? (
        <El id="qrLabel" label="Under the QR code" box={labelBox} align="center" enter="fade" order={7}>
          <FitText max={30} min={18} font="mono" weight={700} lineHeight={1.2} valign="center" style={{ color: onTicket ? INK : ink.fg, textShadow: shadow }}>
            {label}
          </FitText>
        </El>
      ) : null}
      {cast.length ? (
        <El id="cast" label="Characters" box={queueBox} enter="fade" order={3} lockAspect>
          {poster ? <div data-register-shelf="" style={{ position: 'absolute', left: -24, right: -24, bottom: -12, height: 10, borderRadius: 10, background: ink.fg, opacity: 0.9, boxShadow: ink.shadow }} /> : null}
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', width: '100%', height: '100%' }}>
            {cast.map((s) => (
              <div key={s} data-register-char="" data-look-x={poster ? 0.2 : 1} data-look-y={poster ? -1 : 0.3} style={{ width: charSize, height: charSize, flex: 'none' }}>
                <BumperCharacter shape={s as ShapeName} color={charColor(ctx, s as ShapeName)} mood="idle" lookX={poster ? 0.2 : 1} lookY={poster ? -1 : 0.3} />
              </div>
            ))}
          </div>
        </El>
      ) : null}
    </>
  );
}

export default defineTemplate({
  kind: 'register',
  variants: [
    { key: 'ticket', label: 'Ticket with a QR stub' },
    { key: 'poster', label: 'Big number, QR right' },
  ],
  fields: [
    {
      key: 'which',
      label: 'Which Friday',
      type: 'select',
      default: 'auto',
      tokens: false,
      options: [
        { value: 'auto', label: 'Auto: this one while it is open, else the next' },
        { value: 'this', label: 'This event' },
        { value: 'next', label: 'Next Friday' },
      ],
      hint: 'Pick an event above to promote a specific one.',
    },
    f.eyebrow((ctx) => {
      const e = registerEvent(ctx);
      if (!e) return 'Save your seat';
      if (isNext(ctx, e)) return `Next Friday${e.number != null ? `, Zemi ${eventNumberLabel(e)}` : ''}`;
      return e.registrationOpen ? 'Save your seat' : 'Coming up';
    }),
    f.title((ctx) => registerEvent(ctx)?.title ?? ''),
    { key: 'when', label: 'When', type: 'text', max: 120, default: (ctx) => whenLine(registerEvent(ctx)) },
    { key: 'where', label: 'Where', type: 'text', max: 160, default: (ctx) => whereLine(registerEvent(ctx)) },
    { key: 'note', label: 'Note', type: 'text', max: 60, default: (ctx) => (registerEvent(ctx)?.registrationOpen === false ? 'All the details on the event page' : 'Free, takes 20 seconds') },
    f.url((ctx) => registerEvent(ctx)?.url ?? `${ctx.site.webUrl}/events`),
    f.qrLabel((ctx) => (registerEvent(ctx)?.registrationOpen === false ? 'Scan for the details' : 'Scan to save your seat')),
  ],
  presets: [
    { key: 'this-friday', label: 'This Friday', description: 'For the pre-show loop: register before the doors close.', slide: { fields: { which: 'this' } } },
    { key: 'next-friday', label: 'Next Friday', description: 'Promote the next Friday at the end of the show.', slide: { fields: { which: 'next' } } },
  ],
  describe: (ctx) => {
    const e = registerEvent(ctx);
    if (!e) return 'Save your seat';
    return `Save your seat: ${eventNumberLabel(e) || e.title}`;
  },
  headline: () => 'Save a seat',
  Render,
});
