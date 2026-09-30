'use client';

import type { ShapeName } from '@zemi/shared';
import type { CSSProperties, ReactNode } from 'react';
import { useEnter, useIdle } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText, fontStyle } from '../../engine/fit-text';
import { BE, gsap } from '../../engine/gsap';
import { INK } from '../../engine/palette';
import type { ResolveCtx } from '../../engine/types';
import { BumperCharacter, charAnim } from '../../parts/character';
import { BrandQr } from '../../parts/qr';
import { BrandShape } from '../../parts/shapes';
import { Sticker } from '../../parts/stickers';
import { defineTemplate, f, useMascots } from '../kit';
import { accentText, charColor, Chip, Label, moves, plate, plateStyle, useOpenCtx, type Plate } from '../_tpl-open-kit';

/**
 * Wi-Fi: the network name and password in huge mono type and a join QR (the standard
 * `WIFI:T:WPA;S:...;P:...;;` payload, escaped), "Scan to join" with a hand-drawn arrow, Bridge
 * (the connector) peeking over the code, and a signal icon that keeps pinging. Without a network
 * name it simply says to ask the crew.
 */

type Security = 'WPA' | 'WEP' | 'nopass';

/** Escape the characters the Wi-Fi QR format reserves. */
function esc(v: string): string {
  return v.replace(/([\\;,:"])/g, '\\$1');
}

function security(ctx: ResolveCtx): Security {
  const v = ctx.text('security');
  return v === 'WEP' ? 'WEP' : v === 'nopass' || v === 'none' ? 'nopass' : 'WPA';
}

function wifiPayload(ssid: string, password: string, sec: Security, hidden: boolean): string {
  const pw = sec === 'nopass' || !password ? '' : `P:${esc(password)};`;
  return `WIFI:T:${sec === 'nopass' || !password ? 'nopass' : sec};S:${esc(ssid)};${pw}${hidden ? 'H:true;' : ''};`;
}

const SEC_LABEL: Record<Security, string> = { WPA: 'WPA2', WEP: 'WEP', nopass: 'Open network' };

/** Keeps hyphenated words ("Wi-Fi") on one line: browsers happily break right after the hyphen. */
function keepHyphens(text: string): ReactNode {
  return text.split(/(\S+-\S+)/).map((part, i) => (i % 2 ? <span key={i} style={{ whiteSpace: 'nowrap' }}>{part}</span> : part));
}

/** Three arcs and a dot; the arcs light up in turn in the idle loop. */
function Signal({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 64 52" style={{ display: 'block', width: '100%', height: '100%', overflow: 'visible' }} aria-hidden="true">
      {['M4 18a40 40 0 0 1 56 0', 'M13 28a27 27 0 0 1 38 0', 'M22 38a14 14 0 0 1 20 0'].map((d, i) => (
        <path key={i} data-wifi-arc={2 - i} d={d} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" opacity={1} />
      ))}
      <circle cx="32" cy="46" r="5" fill={color} />
    </svg>
  );
}

/** "Scan to join" with an arrow that curls up toward the code. */
function ScanLabel({ text, color, arrow }: { text: string; color: string; arrow: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, width: '100%', height: '100%', justifyContent: 'center' }}>
      <svg viewBox="0 0 90 70" width={90} height={70} style={{ flex: 'none', overflow: 'visible' }} aria-hidden="true">
        <path data-draw="" d="M8 62 C 20 40, 44 30, 62 16" fill="none" stroke={arrow} strokeWidth="6" strokeLinecap="round" />
        <path data-draw="" d="M44 12 L 64 14 L 60 34" fill="none" stroke={arrow} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span style={{ ...fontStyle('display', { weight: 850, casl: 1 }), fontSize: 54, lineHeight: 1, color, whiteSpace: 'nowrap' }}>{text}</span>
    </div>
  );
}

interface Spot {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface WifiLayout {
  card: Spot;
  ssid: Spot;
  password: Spot;
  qr: Spot;
  scan: Spot;
  title: Spot;
  eyebrow: Spot;
  note: Spot;
  align: 'start' | 'center';
  /** Ticket only: where the tear-off line sits, from the card's left edge. */
  stub: number;
  peek: { left: number; top: number; size: number };
}

const SPLIT: WifiLayout = {
  eyebrow: { x: 130, y: 172, w: 900, h: 40 },
  title: { x: 124, y: 222, w: 940, h: 180 },
  card: { x: 130, y: 436, w: 920, h: 500 },
  ssid: { x: 178, y: 520, w: 824, h: 104 },
  password: { x: 178, y: 710, w: 824, h: 104 },
  note: { x: 178, y: 862, w: 560, h: 44 },
  qr: { x: 1206, y: 196, w: 576, h: 576 },
  scan: { x: 1180, y: 830, w: 620, h: 90 },
  align: 'start',
  stub: 0,
  peek: { left: 390, top: -118, size: 160 },
};

const TICKET: WifiLayout = {
  eyebrow: { x: 360, y: 104, w: 1200, h: 40 },
  title: { x: 200, y: 150, w: 1520, h: 150 },
  card: { x: 170, y: 356, w: 1580, h: 580 },
  ssid: { x: 250, y: 470, w: 860, h: 104 },
  password: { x: 250, y: 660, w: 860, h: 104 },
  note: { x: 250, y: 838, w: 700, h: 44 },
  qr: { x: 1276, y: 400, w: 400, h: 400 },
  scan: { x: 1206, y: 832, w: 540, h: 80 },
  align: 'center',
  stub: 1010,
  peek: { left: 280, top: -122, size: 150 },
};

function Card({ L, p, sec, hasNet, ticket }: { L: WifiLayout; p: Plate; sec: Security; hasNet: boolean; ticket: boolean }) {
  const { ctx } = useOpenCtx();
  const rel = (s: Spot) => ({ left: s.x - L.card.x, top: s.y - L.card.y });
  const label: CSSProperties = { ...fontStyle('mono', { weight: 700, tracking: 0.16 }), position: 'absolute', fontSize: 24, textTransform: 'uppercase', color: p.fg2 };
  const hole = ctx.background === 'transparent' ? '#00000000' : ctx.colors.bg;
  const stub = L.stub;
  return (
    <div data-wifi-card="" style={{ ...plateStyle(p, { radius: 36, lift: 16 }), position: 'absolute', inset: 0, overflow: 'visible' }}>
      {hasNet ? (
        <>
          <span style={{ ...label, ...rel(L.ssid), marginTop: -40 }}>Network</span>
          <span aria-hidden="true" style={{ position: 'absolute', left: 48, right: ticket ? L.card.w - stub + 48 : 48, top: L.password.y - L.card.y - 66, height: 3, borderRadius: 3, background: p.line }} />
          <span style={{ ...label, ...rel(L.password), marginTop: -40 }}>Password</span>
          <div style={{ position: 'absolute', ...rel(L.note), height: L.note.h, display: 'flex', alignItems: 'center', gap: 16 }}>
            <Chip bg={p.dark ? '#ffffff14' : ctx.colors.accentSoft} fg={p.dark ? p.fg : ctx.accent === 'yellow' ? '#0e1116' : ctx.colors.accentDeep} size={22}>
              {SEC_LABEL[sec]}
            </Chip>
          </div>
        </>
      ) : (
        <div style={{ position: 'absolute', left: 48, top: 90, right: ticket ? L.card.w - stub + 48 : 150, bottom: 90, display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1, height: '100%' }}>
            <FitText max={84} min={36} casl={0.8} weight={850} lineHeight={1} valign="center" style={{ color: p.fg }}>
              {keepHyphens(ctx.text('fallback'))}
            </FitText>
          </div>
        </div>
      )}
      <div data-wifi-signal="" style={{ position: 'absolute', right: ticket ? L.card.w - stub + 44 : 44, top: 40, width: 76, height: 62 }}>
        <Signal color={!p.dark && ctx.accent === 'yellow' ? INK : ctx.colors.accentHex} />
      </div>
      {ticket ? (
        <>
          <span aria-hidden="true" style={{ position: 'absolute', left: stub, top: 24, bottom: 24, width: 0, borderLeft: `4px dashed ${p.dark ? '#ffffff38' : '#0e111633'}` }} />
          {[-1, 1].map((k) => (
            <span key={k} aria-hidden="true" style={{ position: 'absolute', left: stub - 30, top: k < 0 ? -34 : undefined, bottom: k > 0 ? -34 : undefined, width: 60, height: 60, borderRadius: '50%', background: hole, borderTop: k > 0 ? `4px solid ${p.border}` : undefined, borderBottom: k < 0 ? `4px solid ${p.border}` : undefined }} />
          ))}
        </>
      ) : null}
    </div>
  );
}

function Render() {
  const { ctx } = useOpenCtx();
  const ticket = ctx.slide.style.variant === 'ticket';
  const L = ticket ? TICKET : SPLIT;
  const p = plate(ctx);
  const cast = useMascots(['arch']);
  const peek: ShapeName | null = cast[0] ?? null;
  const ssid = ctx.text('ssid').trim();
  const password = ctx.text('password');
  const sec = security(ctx);
  const hasNet = !!ssid;
  const payload = hasNet ? wifiPayload(ssid, password, sec, ctx.flag('hidden', false)) : '';
  const noPass = sec === 'nopass' || !password;

  useEnter((tl, root, { at, calm }) => {
    if (!moves(ctx)) return;
    const titleFit = root.querySelector<HTMLElement>('[data-el="title"] [data-fit]');
    if (titleFit) tl.fromTo(titleFit, { '--casl': 0 }, { '--casl': 0.85, duration: at(1.5), ease: 'power2.out' }, at(0.3));
    const card = root.querySelector('[data-wifi-card]');
    if (card) tl.fromTo(card, { rotation: calm ? -1 : -3, transformOrigin: '0% 100%' }, { rotation: 0, duration: at(0.9), ease: BE.back }, at(0.1));
    const back = root.querySelector('[data-wifi-back]');
    if (back) tl.fromTo(back, { scale: 0.3, rotation: -50, opacity: 0 }, { scale: 1, rotation: 0, opacity: 1, duration: at(1.0), ease: BE.pop }, at(0.25));
    const arcs = root.querySelectorAll('[data-wifi-arc]');
    if (arcs.length) tl.fromTo(Array.from(arcs).reverse(), { opacity: 0, scale: 0.4, transformOrigin: '50% 100%' }, { opacity: 1, scale: 1, duration: at(0.4), ease: BE.back, stagger: at(0.12) }, at(0.9));
    const arrow = root.querySelectorAll('[data-el="scan"] [data-draw]');
    if (arrow.length) tl.fromTo(arrow, { drawSVG: '0%' }, { drawSVG: '100%', duration: at(0.5), ease: BE.inOut, stagger: at(0.25) }, at(1.3));
    const peekEl = root.querySelector<HTMLElement>('[data-wifi-peek]');
    if (peekEl) {
      tl.fromTo(peekEl, { y: calm ? 60 : 170 }, { y: 0, duration: at(0.8), ease: 'back.out(1.6)' }, at(1.15));
      tl.add(charAnim.look(peekEl, ticket ? 1 : -1, 0.6, 0.3), at(1.7));
      if (!calm) tl.add(charAnim.hop(peekEl, { height: 18 }), at(1.9));
    }
  });

  useIdle((root, { calm }) => {
    const anims: gsap.core.Animation[] = [];
    const stops: Array<() => void> = [];
    const arcs = Array.from(root.querySelectorAll('[data-wifi-arc]')).sort((a, b) => Number(a.getAttribute('data-wifi-arc')) - Number(b.getAttribute('data-wifi-arc')));
    if (arcs.length) {
      const ping = gsap.timeline({ repeat: -1, repeatDelay: calm ? 1.6 : 0.9 });
      ping.to(arcs, { opacity: 0.2, duration: 0.25, ease: 'power1.out' });
      arcs.forEach((a, i) => ping.to(a, { opacity: 1, duration: 0.35, ease: 'power1.out' }, 0.45 + i * 0.35));
      anims.push(ping);
    }
    const peekEl = root.querySelector<HTMLElement>('[data-wifi-peek]');
    if (peekEl) {
      stops.push(charAnim.blinkLoop(peekEl));
      anims.push(...charAnim.idle(peekEl, { calm, seed: 3 }));
      const glance = gsap.timeline({ repeat: -1, repeatDelay: 4 });
      glance.add(charAnim.look(peekEl, ticket ? -1 : 1, 0.2, 0.4), 3).add(charAnim.look(peekEl, ticket ? 1 : -1, 0.6, 0.4), 5.5);
      anims.push(glance);
    }
    const back = root.querySelector('[data-wifi-back]');
    if (back) anims.push(gsap.fromTo(back, { rotation: 0 }, { rotation: calm ? 3 : 7, duration: 5, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    return () => {
      stops.forEach((s) => s());
      anims.forEach((a) => a.kill());
      if (arcs.length) gsap.set(arcs, { opacity: 1 });
    };
  });

  const valueColor = p.fg;
  return (
    <>
      <El id="eyebrow" label="Eyebrow" box={L.eyebrow} align={L.align} enter="wipe" order={0}>
        <Label color={ctx.colors.fg} bullet={ctx.background === 'accent' ? ctx.colors.onAccent : ctx.colors.accentHex} size={28}>
          {ctx.text('eyebrow')}
        </Label>
      </El>
      <El id="title" label="Title" box={L.title} align={L.align} enter="split-words" order={1}>
        <FitText max={ticket ? 132 : 168} min={60} casl={0} lineHeight={0.92} valign={ticket ? 'center' : 'end'}>
          {ctx.text('title')}
        </FitText>
      </El>
      <El id="card" label="Network card" box={L.card} enter="rise" order={2}>
        <Card L={L} p={p} sec={sec} hasNet={hasNet} ticket={ticket} />
      </El>
      {hasNet ? (
        <>
          <El id="ssid" label="Network name" box={L.ssid} enter="scramble" order={5}>
            <FitText max={96} min={34} font="mono" weight={700} tracking={0} lineHeight={1.05} valign="center" style={{ color: valueColor }}>
              {ssid}
            </FitText>
          </El>
          <El id="password" label="Password" box={L.password} enter={noPass ? 'rise' : 'scramble'} order={7}>
            {noPass ? (
              <FitText max={72} min={30} casl={0.8} weight={800} valign="center" style={{ color: p.fg2 }}>
                No password needed
              </FitText>
            ) : (
              <FitText max={96} min={30} font="mono" weight={700} tracking={0} lineHeight={1.05} valign="center" style={{ color: valueColor }}>
                {password}
              </FitText>
            )}
          </El>
        </>
      ) : null}
      <El id="qr" label="Join QR code" box={L.qr} enter="pop" order={4} lockAspect morph={hasNet ? `qr:${payload}` : null}>
        <div data-wifi-back="" aria-hidden="true" style={{ position: 'absolute', left: L.qr.w * 0.08, top: L.qr.h * 0.08, width: L.qr.w, height: L.qr.h, zIndex: 0 }}>
          <BrandShape shape="square" color={ctx.background === 'accent' ? INK : ctx.colors.accentHex} />
        </div>
        {peek ? (
          <div data-wifi-peek="" style={{ position: 'absolute', width: L.peek.size, height: L.peek.size, left: L.peek.left * (L.qr.w / 576), top: L.peek.top, zIndex: 0 }}>
            <BumperCharacter shape={peek} mood="happy" color={charColor(ctx, peek)} lookX={ticket ? 0.8 : -0.8} lookY={0.6} name={`wifi-${peek}`} />
          </div>
        ) : null}
        {hasNet ? (
          <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', borderRadius: 28, overflow: 'hidden' }}>
            <BrandQr value={payload} style={ctx.theme.qrStyle} color={INK} title={`Join ${ssid}`} radius={3} />
          </div>
        ) : (
          <div style={{ background: '#ffffff', border: `4px solid ${INK}`, borderRadius: 28, position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '58%', height: '58%' }}>
              <Sticker name="wifi" />
            </div>
          </div>
        )}
      </El>
      {hasNet ? (
        <El id="scan" label="Under the QR code" box={L.scan} align="center" enter="rise" order={9}>
          <ScanLabel text={ctx.text('qrLabel')} color={ticket ? p.fg : ctx.colors.fg} arrow={ticket ? (!p.dark && ctx.accent === 'yellow' ? INK : ctx.colors.accentHex) : accentText(ctx)} />
        </El>
      ) : null}
      {ctx.text('note') ? (
        <El id="note" label="Note" box={ticket ? { x: 250, y: 960, w: 900, h: 44 } : { x: 130, y: 962, w: 920, h: 44 }} enter="fade" order={10}>
          <FitText max={30} min={18} font="body" weight={600} style={{ color: ctx.colors.fg2 }}>
            {ctx.text('note')}
          </FitText>
        </El>
      ) : null}
    </>
  );
}

export default defineTemplate({
  kind: 'wifi',
  background: 'paper',
  timing: { autoAdvanceSec: 15 },
  variants: [
    { key: 'split', label: 'Details left, QR right' },
    { key: 'ticket', label: 'Ticket', hint: 'One big ticket with a tear-off QR stub.' },
  ],
  fields: [
    f.eyebrow('Wi-Fi'),
    f.title('Get online'),
    { key: 'ssid', label: 'Network name', type: 'text', max: 32, default: '', tokens: false, placeholder: 'Zemi-Friday' },
    { key: 'password', label: 'Password', type: 'text', max: 63, default: '', tokens: false },
    {
      key: 'security',
      label: 'Security',
      type: 'select',
      default: 'WPA',
      options: [
        { value: 'WPA', label: 'WPA or WPA2 (most networks)' },
        { value: 'WEP', label: 'WEP' },
        { value: 'nopass', label: 'None, it is open' },
      ],
    },
    f.qrLabel('Scan to join'),
    { key: 'note', label: 'Small print', type: 'text', max: 100, default: 'Acting up? Wave at the crew.' },
    { key: 'hidden', label: 'Hidden network', type: 'toggle', default: false, group: 'options' },
    { key: 'fallback', label: 'Without a network name', type: 'text', max: 80, default: 'Ask the crew for the Wi-Fi password.', group: 'options' },
  ],
  describe: (ctx) => (ctx.text('ssid') ? `Wi-Fi: ${ctx.text('ssid')}` : 'Wi-Fi'),
  headline: () => 'Wi-Fi',
  sample: () => ({ fields: { ssid: 'Zemi-Friday', password: 'bringthemessyversion' } }),
  Render,
});
