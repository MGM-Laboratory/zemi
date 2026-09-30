'use client';

import type { BumperItem, ShapeName } from '@zemi/shared';
import { useEnter, useIdle } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText } from '../../engine/fit-text';
import { BE, gsap } from '../../engine/gsap';
import { eventNumberLabel } from '../../engine/resolve';
import type { ResolveCtx } from '../../engine/types';
import { BumperCharacter, charAnim } from '../../parts/character';
import { Sticker, STICKERS } from '../../parts/stickers';
import { defineTemplate, f, useMascots } from '../kit';
import { charColor, Label, marker, moves, plate, plateStyle, useOpenCtx } from '../_tpl-open-kit';

/**
 * Housekeeping: a title and three to six rules with sticker icons. Rules pop in one by one and
 * each icon wiggles once; then a highlighter strolls from rule to rule while Block keeps an eye
 * on whichever one is lit. The default rules come from the event (streaming only when it is
 * hybrid or online) and the site (the Q and A link).
 */

const MAX = 6;

function defaultRules(ctx: ResolveCtx): BumperItem[] {
  const rows: Array<Pick<BumperItem, 'title' | 'body' | 'icon'>> = [{ icon: 'silent', title: 'Phones on silent', body: 'Buzzing is fine. Ringtones, not so much.' }];
  if (ctx.event && ctx.event.mode !== 'offline') rows.push({ icon: 'rec', title: "We're streaming this one", body: 'Say hi to everyone watching from home.' });
  rows.push({ icon: 'question', title: `Questions at ${ctx.site.qnaShort}`, body: "Type them anytime. We'll pick a few." });
  rows.push({ icon: 'coffee', title: "Coffee's at the back", body: 'Refills are free. Spills happen.' });
  rows.push({ icon: 'door', title: 'Restrooms are down the hall', body: 'No need to ask, just go.' });
  return rows.map((r, i) => ({ id: `rule-${i}`, meta: '', assetId: null, url: null, ...r }));
}

interface Rule {
  id: string;
  icon: string;
  title: string;
  body: string;
}

function useRules(): Rule[] {
  const { ctx } = useOpenCtx();
  return ctx.items
    .filter((it) => it.title.trim() || it.body.trim())
    .slice(0, MAX)
    .map((it) => ({ id: it.id, icon: it.icon && STICKERS[it.icon] ? it.icon : 'spark', title: ctx.fill(it.title), body: ctx.fill(it.body) }));
}

/** The marker swipe that sits behind a rule's title (on the slide, or on a card). */
function Highlight({ on, onPlate }: { on: boolean; onPlate?: boolean }) {
  const { ctx } = useOpenCtx();
  const p = plate(ctx);
  const m = onPlate ? (p.dark ? { color: `${ctx.colors.accentHex}59`, blend: 'normal' as const } : { color: '#f7bf33', blend: 'multiply' as const }) : marker(ctx);
  return (
    <span
      data-hr-mark=""
      aria-hidden="true"
      style={{ position: 'absolute', left: -14, right: -14, top: '46%', bottom: '-4%', borderRadius: 10, background: m.color, mixBlendMode: m.blend, transformOrigin: '0% 50%', transform: on ? 'none' : 'scaleX(0)', zIndex: -1 }}
    />
  );
}

/** A sticker; on dark or colored backgrounds it sits on a white die-cut disc so its ink outline reads. */
function StickerBadge({ name, size, onPlate }: { name: string; size: number; onPlate?: boolean }) {
  const { ctx } = useOpenCtx();
  const badge = onPlate ? plate(ctx).dark : ctx.colors.dark || ctx.background === 'accent';
  return (
    <div data-hr-icon="" style={{ width: size, height: size, flex: 'none', position: 'relative' }}>
      {badge ? <span aria-hidden="true" style={{ position: 'absolute', inset: -size * 0.1, borderRadius: '50%', background: '#ffffff' }} /> : null}
      <div style={{ position: 'absolute', inset: badge ? size * 0.06 : 0 }}>
        <Sticker name={name} />
      </div>
    </div>
  );
}

function ListLayout({ rules, cast }: { rules: Rule[]; cast: ShapeName[] }) {
  const { ctx } = useOpenCtx();
  const n = Math.max(1, rules.length);
  const top = 150;
  const height = 800;
  const rowH = Math.min(158, height / n);
  const icon = Math.min(118, rowH * 0.74);
  return (
    <>
      <El id="eyebrow" label="Eyebrow" box={{ x: 130, y: 256, w: 640, h: 44 }} enter="wipe" order={0}>
        <Label color={ctx.colors.fg} bullet={ctx.background === 'accent' ? ctx.colors.onAccent : ctx.colors.accentHex} size={28}>
          {ctx.text('eyebrow')}
        </Label>
      </El>
      <El id="title" label="Title" box={{ x: 124, y: 316, w: 660, h: 390 }} enter="split-words" order={1}>
        <FitText max={132} min={60} casl={0} lineHeight={0.92}>
          {ctx.text('title')}
        </FitText>
      </El>
      {cast.length ? (
        <El id="cast" label="Character" box={{ x: 130, y: 760, w: 420, h: 170 }} enter="fade" order={2} lockAspect>
          <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end', height: '100%' }}>
            {cast.map((s, i) => (
              <div key={s} data-hr-char="" style={{ width: cast.length > 2 ? 96 : 160, height: cast.length > 2 ? 96 : 160 }}>
                <BumperCharacter shape={s} mood={i % 2 ? 'happy' : 'idle'} color={charColor(ctx, s)} lookX={1} lookY={-0.2} name={`rules-${s}`} />
              </div>
            ))}
          </div>
        </El>
      ) : null}
      <El id="rules" label="Rules" box={{ x: 880, y: top, w: 930, h: height }} valign="center" enter="fade" order={1}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', height: '100%' }}>
          {rules.map((r, i) => (
            <div key={r.id} data-hr-row="" style={{ display: 'flex', alignItems: 'center', gap: 34, height: rowH, width: '100%' }}>
              <StickerBadge name={r.icon} size={icon} />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, height: '100%' }}>
                <div style={{ position: 'relative', isolation: 'isolate', alignSelf: 'flex-start', maxWidth: '100%', height: rowH * (r.body ? 0.42 : 0.56) }}>
                  <Highlight on={i === 0} />
                  <FitText max={rowH * (r.body ? 0.36 : 0.44)} min={26} weight={850} casl={0.35} lineHeight={1.05} balance={false} style={{ whiteSpace: 'nowrap' }}>
                    {r.title}
                  </FitText>
                </div>
                {r.body ? (
                  <div style={{ height: rowH * 0.24, color: ctx.colors.fg2 }}>
                    <FitText max={rowH * 0.2} min={18} font="body" weight={500} lineHeight={1.2} balance={false}>
                      {r.body}
                    </FitText>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </El>
    </>
  );
}

function CardsLayout({ rules, cast }: { rules: Rule[]; cast: ShapeName[] }) {
  const { ctx } = useOpenCtx();
  const p = plate(ctx);
  const n = Math.max(1, rules.length);
  const cols = n <= 3 ? n : n === 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const gap = 44;
  const areaW = cols === 2 ? 1240 : 1660;
  const areaH = 650;
  const cardW = (areaW - gap * (cols - 1)) / cols;
  const cardH = Math.min(rows === 1 ? 470 : 300, (areaH - gap * (rows - 1)) / rows);
  const icon = Math.min(120, cardH * 0.36);
  return (
    <>
      <El id="eyebrow" label="Eyebrow" box={{ x: 360, y: 96, w: 1200, h: 44 }} align="center" enter="wipe" order={0}>
        <Label color={ctx.colors.fg} bullet={ctx.background === 'accent' ? ctx.colors.onAccent : ctx.colors.accentHex} size={28}>
          {ctx.text('eyebrow')}
        </Label>
      </El>
      <El id="title" label="Title" box={{ x: 200, y: 152, w: 1520, h: 140 }} align="center" enter="split-words" order={1}>
        <FitText max={124} min={56} casl={0} lineHeight={0.95} valign="center">
          {ctx.text('title')}
        </FitText>
      </El>
      <El id="rules" label="Rules" box={{ x: (1920 - areaW) / 2, y: 330, w: areaW, h: areaH }} enter="fade" order={1}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap, alignContent: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
          {rules.map((r, i) => (
            <div key={r.id} data-hr-row="" style={{ position: 'relative', width: cardW, height: cardH }}>
              {i === cols - 1 && cast.length ? (
                <div data-hr-char="" style={{ position: 'absolute', right: 30, top: -118, width: 124, height: 124 }}>
                  <BumperCharacter shape={cast[0]!} mood="happy" color={charColor(ctx, cast[0]!)} lookX={-0.9} lookY={0.6} name={`rules-card-${cast[0]}`} />
                </div>
              ) : null}
              <div data-hr-card="" style={{ ...plateStyle(p, { radius: 28, lift: 12 }), position: 'absolute', inset: 0, padding: '28px 34px', display: 'flex', flexDirection: rows === 1 ? 'column' : 'row', alignItems: rows === 1 ? 'flex-start' : 'center', gap: rows === 1 ? 26 : 30 }}>
                <StickerBadge name={r.icon} size={icon} onPlate />
                <div style={{ flex: 1, minWidth: 0, width: '100%', display: 'flex', flexDirection: 'column', gap: 10, height: rows === 1 ? 'auto' : '100%', justifyContent: 'center' }}>
                  <div style={{ position: 'relative', isolation: 'isolate', height: rows === 1 ? 118 : cardH * 0.4 }}>
                    <Highlight on={i === 0} onPlate />
                    <FitText max={rows === 1 ? 54 : 46} min={24} weight={850} casl={0.35} lineHeight={1.02} valign="end">
                      {r.title}
                    </FitText>
                  </div>
                  {r.body ? (
                    <div style={{ height: rows === 1 ? 90 : cardH * 0.26, color: p.fg2 }}>
                      <FitText max={28} min={16} font="body" weight={500} lineHeight={1.25}>
                        {r.body}
                      </FitText>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </El>
    </>
  );
}

function Render() {
  const { ctx } = useOpenCtx();
  const cards = ctx.slide.style.variant === 'cards';
  const cast = useMascots(['square']);
  const rules = useRules();

  useEnter((tl, root, { at, calm }) => {
    if (!moves(ctx)) return;
    const titleFit = root.querySelector<HTMLElement>('[data-el="title"] [data-fit]');
    if (titleFit) tl.fromTo(titleFit, { '--casl': 0 }, { '--casl': 0.75, duration: at(1.6), ease: 'power2.out' }, at(0.3));
    const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-hr-row]'));
    rows.forEach((row, i) => {
      const t = 0.45 + i * (calm ? 0.2 : 0.16);
      tl.fromTo(row, { scale: calm ? 0.94 : 0.55, opacity: 0, y: calm ? 12 : 30, transformOrigin: '0% 50%' }, { scale: 1, opacity: 1, y: 0, duration: at(0.7), ease: BE.back }, at(t));
      const icon = row.querySelector('[data-hr-icon]');
      if (icon) {
        const k = calm ? 0.4 : 1;
        tl.to(icon, { keyframes: { rotation: [-16 * k, 12 * k, -7 * k, 0] }, duration: at(0.7), ease: 'power1.inOut' }, at(t + 0.45));
      }
    });
    const marks = Array.from(root.querySelectorAll<HTMLElement>('[data-hr-mark]'));
    if (marks[0]) tl.fromTo(marks[0], { scaleX: 0 }, { scaleX: 1, duration: at(0.6), ease: BE.inOut }, at(0.6 + rows.length * 0.16));
    root.querySelectorAll<HTMLElement>('[data-hr-char]').forEach((c, i) => {
      tl.fromTo(c, { y: calm ? -120 : -380, opacity: 0 }, { y: 0, opacity: 1, duration: at(0.8), ease: 'bounce.out' }, at(0.9 + i * 0.12));
      tl.add(charAnim.squash(c), at(1.55 + i * 0.12));
    });
  });

  useIdle((root, { calm }) => {
    const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-hr-row]'));
    const marks = rows.map((r) => r.querySelector<HTMLElement>('[data-hr-mark]'));
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-hr-char]'));
    const anims: gsap.core.Animation[] = [];
    const stops = chars.map((c) => charAnim.blinkLoop(c));
    chars.forEach((c, i) => anims.push(...charAnim.idle(c, { calm, seed: i * 2 })));
    rows.forEach((row, i) => {
      const icon = row.querySelector('[data-hr-icon]');
      if (icon) anims.push(gsap.fromTo(icon, { rotation: -3 }, { rotation: 3, duration: 2.6 + (i % 3) * 0.4, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: i * 0.3 }));
    });
    // The highlighter strolls from one rule to the next; the character keeps an eye on it.
    const stroll = gsap.timeline({ repeat: -1 });
    const hold = calm ? 3.6 : 2.8;
    const lookAt = (i: number) => {
      const row = rows[i];
      if (!row) return;
      const rect = row.getBoundingClientRect();
      chars.forEach((c) => {
        const cr = c.getBoundingClientRect();
        const dx = rect.left + rect.width / 2 - (cr.left + cr.width / 2);
        const dy = rect.top + rect.height / 2 - (cr.top + cr.height / 2);
        const len = Math.hypot(dx, dy) || 1;
        charAnim.look(c, dx / len, dy / len, 0.4);
      });
    };
    if (rows.length > 1) {
      rows.forEach((_, i) => {
        const cur = marks[i];
        const next = marks[(i + 1) % rows.length];
        stroll.to({}, { duration: hold });
        if (cur) stroll.to(cur, { scaleX: 0, transformOrigin: '100% 50%', duration: 0.45, ease: BE.inOut });
        stroll.call(() => {
          lookAt((i + 1) % rows.length);
          if (!calm) chars.forEach((c) => charAnim.hop(c, { height: 10 }));
        });
        if (next) stroll.fromTo(next, { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, duration: 0.6, ease: BE.inOut, immediateRender: false });
      });
      anims.push(stroll);
    }
    lookAt(0);
    return () => {
      stops.forEach((s) => s());
      anims.forEach((a) => a.kill());
      marks.forEach((m, i) => m && gsap.set(m, { scaleX: i === 0 ? 1 : 0, transformOrigin: '0% 50%' }));
    };
  });

  if (!rules.length) {
    return (
      <El id="title" label="Title" box={{ x: 200, y: 380, w: 1520, h: 320 }} align="center" enter="split-words" order={0}>
        <FitText max={140} min={60} casl={0.3} valign="center">
          {ctx.text('title')}
        </FitText>
      </El>
    );
  }
  return cards ? <CardsLayout rules={rules} cast={cast} /> : <ListLayout rules={rules} cast={cast} />;
}

const STARTER: Array<Partial<BumperItem>> = [
  { icon: 'silent', title: 'Phones on silent', body: 'Buzzing is fine. Ringtones, not so much.' },
  { icon: 'rec', title: "We're recording this one", body: 'Slides and video go up after.' },
  { icon: 'question', title: 'Questions at {site.q}', body: "Type them anytime. We'll pick a few." },
  { icon: 'coffee', title: "Coffee's at the back", body: 'Refills are free. Spills happen.' },
  { icon: 'door', title: 'Restrooms are down the hall', body: 'No need to ask, just go.' },
];

export default defineTemplate({
  kind: 'house-rules',
  background: 'paper',
  timing: { autoAdvanceSec: 15 },
  variants: [
    { key: 'list', label: 'Title left, rules right' },
    { key: 'cards', label: 'Sticker cards', hint: 'Every rule on its own card, in a grid.' },
  ],
  fields: [
    f.eyebrow((ctx) => (ctx.event?.number != null ? `Zemi ${eventNumberLabel(ctx.event)}, before we start` : 'Before we start')),
    f.title('A few house rules'),
  ],
  items: {
    label: 'Rules',
    itemLabel: 'Rule',
    max: MAX,
    fields: [
      { key: 'icon', label: 'Sticker', type: 'icon' },
      { key: 'title', label: 'Rule', type: 'text', placeholder: 'Phones on silent' },
      { key: 'body', label: 'Small print', type: 'text', placeholder: 'Buzzing is fine. Ringtones, not so much.' },
    ],
    fallback: defaultRules,
    starter: () => STARTER.map((r) => ({ ...r })),
  },
  describe: (ctx) => `House rules (${Math.min(MAX, ctx.items.length)})`,
  headline: () => 'House rules',
  Render,
});
