#!/usr/bin/env node
/**
 * 30 procedural 4:5 event covers (1600x2000) in the Zemi brand language. No text baked in.
 *
 *   node scripts/seed-media/gen-covers.mjs [--only 3,7] [--sheet <png>]
 *
 * Every cover comes from one of 12 composition archetypes, driven by a seeded PRNG, so reruns
 * are byte-for-byte stable. Output: apps/api/seed/assets/covers/cover-XX.jpg (+ manifest section).
 */
import { join } from 'node:path';
import { ASSETS, BRAND as B, bytes, contactSheet, ensureDir, rel, rng, scratch, sharp, writeSection } from './lib/common.mjs';
import { character, closedSmooth, eyes, f, graphPaper, grain, grainDefs, shadowDef, shape, smoothPath, svgDoc } from './lib/svg.mjs';

const W = 1600;
const H = 2000;
const SH = ['circle', 'triangle', 'square', 'arch'];
const BRANDS = [B.blue, B.red, B.yellow, B.green];
const NAME = { [B.blue]: 'blue', [B.red]: 'red', [B.yellow]: 'yellow', [B.green]: 'green' };
const lookAt = (x0, y0, x1, y1) => {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
};

// ------------------------------------------------------------------ archetypes

function bigCrop(r, o) {
  const s1 = o.s1;
  const c1 = o.c1;
  const big = r.range(1750, 2000);
  const bx = W * r.range(0.74, 0.86);
  const by = H * r.range(0.12, 0.2);
  const rot1 = s1 === 'circle' ? 0 : r.pick([0, 90, 180, 270]);
  const s2 = o.s2;
  const m = r.range(950, 1150);
  const mx = W * r.range(0.22, 0.32);
  const my = H * r.range(0.72, 0.8);
  const cx = W * r.range(0.72, 0.82);
  const cy = H * 0.86;
  const cs = 300;
  const bits = [];
  for (let i = 0; i < 4; i++) {
    bits.push(shape(SH[i], r.range(160, W - 160), r.range(H * 0.52, H * 0.64), r.range(80, 120), r.pick(o.confetti), { rot: r.range(0, 360) }));
  }
  return {
    bg: o.ground,
    body: [
      shape(s1, bx, by, big, c1, { rot: rot1 }),
      shape(s2, mx, my, m, o.c2, { rot: r.range(-18, 18), blend: o.blend ?? 'multiply' }),
      ...bits,
      character(o.s3, cx, cy, cs, o.c3, { look: lookAt(cx, cy, mx, my), rot: 0 }),
    ].join(''),
  };
}

function bauhausGrid(r, o) {
  const cols = 4;
  const rows = 5;
  const cell = 400;
  const pal = o.palette;
  const charAt = r.int(0, cols * rows - 1);
  const out = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      const x = i * cell;
      const y = j * cell;
      const cx = x + cell / 2;
      const cy = y + cell / 2;
      const cellBg = r.chance(0.32) ? r.pick(pal) : null;
      if (cellBg) out.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${cellBg}"/>`);
      const col = r.pick(pal.filter((c) => c !== cellBg));
      if (k === charAt) {
        const s = r.pick(SH);
        out.push(character(s, cx, cy + (s === 'triangle' ? 8 : 0), 300, col === o.ground ? B.yellow : col, { look: [r.range(-0.6, 0.6), 0.3] }));
        continue;
      }
      const t = r.next();
      const rot = r.pick([0, 90, 180, 270]);
      if (t < 0.34) {
        out.push(shape(r.pick(SH), cx, cy, 300, col, { rot: r.chance(0.5) ? rot : 0 }));
      } else if (t < 0.62) {
        // quarter disc from a cell corner
        out.push(`<path d="M0 0 H${cell} A${cell} ${cell} 0 0 1 0 ${cell} Z" fill="${col}" transform="translate(${cx} ${cy}) rotate(${rot}) translate(${-cell / 2} ${-cell / 2})"/>`);
      } else if (t < 0.8) {
        // half disc on an edge
        out.push(`<path d="M0 ${cell} A${cell / 2} ${cell / 2} 0 0 1 ${cell} ${cell} Z" fill="${col}" transform="translate(${cx} ${cy}) rotate(${rot}) translate(${-cell / 2} ${-cell / 2})"/>`);
      } else if (t < 0.9) {
        out.push(`<circle cx="${cx}" cy="${cy}" r="70" fill="${col}"/>`);
      }
    }
  }
  return { bg: o.ground, body: out.join('') };
}

function insideFn(kind, cx, cy, R) {
  if (kind === 'circle') return (x, y) => Math.hypot(x - cx, y - cy) <= R;
  if (kind === 'square') return (x, y) => Math.abs(x - cx) <= R && Math.abs(y - cy) <= R;
  if (kind === 'arch')
    return (x, y) => (y >= cy && y <= cy + R && Math.abs(x - cx) <= R) || (y < cy && Math.hypot(x - cx, y - cy) <= R);
  // triangle, apex up
  const a = [cx, cy - R];
  const b = [cx + R * 1.05, cy + R * 0.85];
  const c = [cx - R * 1.05, cy + R * 0.85];
  const sign = (p, q, s) => (p[0] - s[0]) * (q[1] - s[1]) - (q[0] - s[0]) * (p[1] - s[1]);
  return (x, y) => {
    const p = [x, y];
    const d1 = sign(p, a, b);
    const d2 = sign(p, b, c);
    const d3 = sign(p, c, a);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
}

function halftoneField(kind, cx, cy, R, color, { step = 34, maxR = 16, dir = [1, -1], blend } = {}) {
  const inside = insideFn(kind, cx, cy, R);
  const l = Math.hypot(...dir);
  const d = [dir[0] / l, dir[1] / l];
  const dots = [];
  for (let j = 0, y = cy - R * 1.2; y <= cy + R * 1.2; y += step * 0.866, j++) {
    for (let x = cx - R * 1.2 + (j % 2 ? step / 2 : 0); x <= cx + R * 1.2; x += step) {
      if (!inside(x, y)) continue;
      const t = ((x - cx) * d[0] + (y - cy) * d[1]) / (R * 1.1); // -1..1
      const rr = maxR * Math.min(1, Math.max(0, 0.5 - t * 0.55));
      if (rr > 1.2) dots.push(`M${f(x + rr)} ${f(y)}a${f(rr)} ${f(rr)} 0 1 0 ${f(-2 * rr)} 0a${f(rr)} ${f(rr)} 0 1 0 ${f(2 * rr)} 0`);
    }
  }
  return `<path d="${dots.join('')}" fill="${color}"${blend ? ` style="mix-blend-mode:${blend}"` : ''}/>`;
}

function halftone(r, o) {
  const cx = W * r.range(0.42, 0.58);
  const cy = H * r.range(0.36, 0.44);
  const R = r.range(600, 700);
  const k2 = o.s2;
  const cx2 = cx + r.range(-360, 360);
  const cy2 = cy + r.range(420, 620);
  const ch = r.pick(SH);
  const chx = W * (cx2 > W / 2 ? 0.2 : 0.8);
  const chy = H * 0.86;
  return {
    bg: o.ground,
    body: [
      halftoneField(o.s1, cx, cy, R, o.c1, { step: 36, maxR: 17, dir: [r.range(0.3, 1), -1] }),
      halftoneField(k2, cx2, cy2, R * 0.62, o.c2, { step: 30, maxR: 14, dir: [-1, r.range(-1, 1)], blend: o.dark ? undefined : 'multiply' }),
      shape(r.pick(SH), W * r.range(0.12, 0.25), H * r.range(0.08, 0.14), 150, o.c2, { rot: r.range(-20, 20) }),
      character(ch, chx, chy, 250, o.c3, { look: lookAt(chx, chy, cx, cy) }),
    ].join(''),
  };
}

function plot(r, o) {
  const x0 = 200;
  const x1 = 1440;
  const y0 = 300;
  const y1 = 1760;
  const ink = o.dark ? '#f5f6f8' : B.ink;
  const n = 7;
  const pts = [];
  let y = r.range(y1 - 300, y1 - 150);
  for (let i = 0; i < n; i++) {
    const x = x0 + 80 + ((x1 - x0 - 140) * i) / (n - 1);
    y = Math.max(y0 + 200, Math.min(y1 - 120, y - r.range(-120, 330)));
    pts.push([x, y]);
  }
  const peak = pts.reduce((a, b) => (b[1] < a[1] ? b : a));
  const pts2 = pts.map(([x, yy], i) => [x, Math.min(y1 - 90, yy + r.range(140, 320) + i * 10)]);
  const bandY = r.range(y0 + 260, y1 - 700);
  const ticks = [];
  for (let i = 1; i <= 6; i++) ticks.push(`M${x0 + i * 200} ${y1}v28`, `M${x0} ${y1 - i * 230}h-28`);
  const body = [
    graphPaper(W, H, 50, o.grid, { width: 2, major: 4, majorColor: o.gridMajor, majorWidth: 3 }),
    `<rect x="${x0 - 40}" y="${f(bandY)}" width="${x1 - x0 + 120}" height="${f(r.range(260, 420))}" fill="${o.band}" opacity="${o.dark ? 0.35 : 0.8}" style="mix-blend-mode:${o.dark ? 'screen' : 'multiply'}" transform="rotate(${f(r.range(-4, 4))} ${W / 2} ${f(bandY)})"/>`,
    `<path d="M${x0} ${y0 - 60}V${y1}H${x1 + 80}" fill="none" stroke="${ink}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<path d="${ticks.join('')}" stroke="${ink}" stroke-width="10" stroke-linecap="round"/>`,
    `<path d="${smoothPath(pts2)}" fill="none" stroke="${o.c2}" stroke-width="22" stroke-linecap="round" stroke-dasharray="1 44"/>`,
    `<path d="${smoothPath(pts)}" fill="none" stroke="${o.c1}" stroke-width="36" stroke-linecap="round"/>`,
    ...pts.filter((p) => p !== peak).map((p, i) => shape(i % 2 ? 'square' : 'circle', p[0], p[1], 96, i % 2 ? B.yellow : o.dark ? B.paper : B.ink, { rot: i % 2 ? 12 : 0 })),
    ...pts2.filter((_, i) => i % 2 === 0).map((p) => shape('triangle', p[0], p[1], 70, o.c2)),
    character(o.s1, peak[0], peak[1] - 150, 340, o.c3, { look: [0.3, -0.8] }),
  ];
  return { bg: o.ground, body: body.join('') };
}

function collage(r, o) {
  const defs = [shadowDef('shadow', { dy: 22, blur: 26, opacity: 0.16 })];
  const kinds = r.shuffle([...o.fills, 'stripes', 'dots']);
  const spots = r.shuffle([
    [0.28, 0.2],
    [0.74, 0.22],
    [0.5, 0.48],
    [0.22, 0.7],
    [0.78, 0.72],
    [0.5, 0.9],
  ]);
  const body = [];
  spots.forEach(([u, v], i) => {
    const s = SH[(i + r.int(0, 3)) % 4];
    const size = r.range(560, 900);
    const k = kinds[i % kinds.length];
    let fill = k;
    if (k === 'stripes' || k === 'dots') {
      // patterns live in the shape's scaled user space, so counter-scale them
      const inv = (46 / size).toFixed(5);
      const id = `${k}${i}`;
      defs.push(
        k === 'stripes'
          ? `<pattern id="${id}" width="44" height="44" patternUnits="userSpaceOnUse" patternTransform="scale(${inv}) rotate(35)"><rect width="44" height="44" fill="${B.paper}"/><rect width="22" height="44" fill="${o.stripe}"/></pattern>`
          : `<pattern id="${id}" width="44" height="44" patternUnits="userSpaceOnUse" patternTransform="scale(${inv})"><rect width="44" height="44" fill="${o.dotBg}"/><circle cx="22" cy="22" r="9" fill="${B.ink}"/></pattern>`,
      );
      fill = `url(#${id})`;
    }
    body.push(shape(s, W * u + r.range(-80, 80), H * v + r.range(-80, 80), size, fill, { rot: r.range(-28, 28), filter: 'shadow' }));
  });
  const cs = r.pick(SH);
  const cx = W * r.range(0.4, 0.6);
  const cy = H * r.range(0.4, 0.55);
  body.push(character(cs, cx, cy, 420, o.charColor, { rot: r.range(-10, 10), filter: 'shadow', look: [r.range(-0.8, 0.8), r.range(-0.5, 0.5)] }));
  return { bg: o.ground, defs: defs.join(''), body: body.join(''), grain: 0.75 };
}

function stack(r, o) {
  const floor = 1660;
  const cx = W * r.range(0.44, 0.56);
  const order = o.order;
  const sizes = [480, 410, 340, 270];
  const cols = o.colors;
  const body = [
    `<rect x="0" y="${floor}" width="${W}" height="${H - floor}" fill="${o.floor}"/>`,
    `<ellipse cx="${f(cx)}" cy="${floor + 8}" rx="360" ry="36" fill="${B.ink}" opacity="0.14"/>`,
  ];
  let y = floor;
  const placed = [];
  order.forEach((s, i) => {
    const size = sizes[i];
    const h = s === 'triangle' ? size * (44 / 46) : s === 'arch' ? size : size;
    const x = cx + (i === 0 ? 0 : r.range(-60, 60));
    const rot = i === 0 ? 0 : r.range(-7, 7);
    const cy = y - h / 2 + (s === 'triangle' ? size * 0.02 : 0);
    placed.push({ s, x, cy, size, rot, col: cols[i] });
    y = cy - h / 2 + (s === 'circle' ? 18 : s === 'arch' ? 0 : 6);
  });
  const top = placed[placed.length - 1];
  placed.forEach((p, i) => {
    body.push(shape(p.s, p.x, p.cy, p.size, p.col, { rot: p.rot }));
    const look = i === placed.length - 1 ? [0.2, 0.9] : [(top.x - p.x) / 200, -0.9];
    body.push(eyes(p.s, p.x, p.cy, p.size, { rot: p.rot, look, blink: i === 1 && o.blink }));
  });
  // a runaway: a small circle rolling off to the side
  const rx = cx + r.pick([-1, 1]) * r.range(480, 560);
  body.push(character('circle', rx, floor - 80, 160, o.runaway, { look: lookAt(rx, floor - 80, cx, floor - 700) }));
  return { bg: o.ground, body: body.join('') };
}

function orbit(r, o) {
  const cx = W * r.range(0.4, 0.6);
  const cy = H * r.range(0.4, 0.5);
  const body = [];
  const rings = [];
  for (let rad = 300; rad < 1600; rad += r.range(95, 140)) rings.push(rad);
  rings.forEach((rad) => body.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rad)}" fill="none" stroke="${o.line}" stroke-width="4" opacity="0.35"/>`));
  // chunky partial arcs
  rings.slice(0, 7).forEach((rad, i) => {
    if (r.chance(0.35)) return;
    const a0 = r.range(0, Math.PI * 2);
    const a1 = a0 + r.range(0.5, 1.6);
    const p0 = [cx + rad * Math.cos(a0), cy + rad * Math.sin(a0)];
    const p1 = [cx + rad * Math.cos(a1), cy + rad * Math.sin(a1)];
    body.push(`<path d="M${f(p0[0])} ${f(p0[1])}A${f(rad)} ${f(rad)} 0 0 1 ${f(p1[0])} ${f(p1[1])}" fill="none" stroke="${o.arcs[i % o.arcs.length]}" stroke-width="${f(r.range(34, 58))}" stroke-linecap="round"/>`);
  });
  // planets on rings
  rings.slice(0, 8).forEach((rad, i) => {
    const a = r.range(0, Math.PI * 2);
    const x = cx + rad * Math.cos(a);
    const y = cy + rad * Math.sin(a);
    if (x < -60 || x > W + 60 || y < -60 || y > H + 60) return;
    const s = SH[(i + 1) % 4];
    const size = r.range(80, 170);
    if (i === 3) body.push(character(s, x, y, 220, o.arcs[(i + 1) % o.arcs.length], { look: lookAt(x, y, cx, cy) }));
    else body.push(shape(s, x, y, size, r.pick(o.arcs), { rot: r.range(0, 360) }));
  });
  body.push(character(o.center, cx, cy, 400, o.centerColor, { look: [r.range(-0.5, 0.5), -0.2] }));
  return { bg: o.ground, body: body.join('') };
}

function archBands(cx, baseY, outer, band, colors, rot = 0) {
  const out = [];
  let rad = outer;
  let i = 0;
  while (rad > band * 0.9) {
    const c = colors[i % colors.length];
    out.push(`<path d="M${f(-rad)} 0V0A${f(rad)} ${f(rad)} 0 0 1 ${f(rad)} 0V${f(rad * 0.001)}Z M${f(-rad)} 0 H${f(rad)} V${f(outer * 0.9)} H${f(-rad)} Z" fill="${c}"/>`);
    rad -= band;
    i++;
  }
  return `<g transform="translate(${f(cx)} ${f(baseY)}) rotate(${rot})">${out.join('')}</g>`;
}

function rainbow(r, o) {
  const body = [];
  const bx = W * r.range(0.3, 0.42);
  const by = H - r.range(560, 700);
  const outer = r.range(820, 900);
  const band = r.range(96, 124);
  body.push(archBands(bx, by, outer, band, o.bands));
  const sx = W * r.range(0.74, 0.86);
  const sy = H * r.range(0.14, 0.22);
  body.push(archBands(sx, sy, 420, 70, [...o.bands].reverse(), 180));
  const sun = r.pick(SH.filter((s) => s !== 'arch'));
  const ux = W * r.range(0.72, 0.84);
  const uy = H * r.range(0.46, 0.56);
  body.push(shape(sun, ux, uy, 260, o.sun, { rot: r.range(-12, 12) }));
  // a character sitting on top of the big arch
  const ch = r.pick(['square', 'triangle', 'circle']);
  const cs = 230;
  const topY = by - outer - cs / 2 + (ch === 'circle' ? 14 : 4);
  body.push(character(ch, bx + r.range(-80, 80), topY, cs, o.char, { look: lookAt(bx, topY, ux, uy) }));
  return { bg: o.ground, body: body.join('') };
}

function confetti(r, o) {
  const cx = W / 2 + r.range(-120, 120);
  const cy = H * r.range(0.44, 0.52);
  const placed = [];
  const body = [];
  let tries = 0;
  while (placed.length < 120 && tries++ < 6000) {
    const size = r.range(42, 118);
    const x = r.range(-20, W + 20);
    const y = r.range(-20, H + 20);
    if (Math.hypot(x - cx, y - cy) < 460 + size) continue;
    if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < (p.size + size) * 0.62)) continue;
    placed.push({ x, y, size });
    body.push(shape(r.pick(SH), x, y, size, r.pick(o.colors), { rot: r.range(0, 360) }));
  }
  const s = o.center;
  body.push(character(s, cx, cy, 600, o.centerColor, { look: [r.range(-0.6, 0.6), r.range(-0.6, 0.4)] }));
  return { bg: o.ground, body: body.join('') };
}

function split(r, o) {
  const a = H * r.range(0.35, 0.5);
  const b = H * r.range(0.5, 0.68);
  const top = `M0 0H${W}V${f(b)}L0 ${f(a)}Z`;
  const bottom = `M0 ${f(a)}L${W} ${f(b)}V${H}H0Z`;
  const cx = W * r.range(0.45, 0.58);
  const cy = (a + b) / 2 + r.range(-80, 80);
  const s = o.s1;
  const size = r.range(1150, 1350);
  const rot = s === 'circle' ? 0 : r.pick([0, 180]);
  const defs = `<clipPath id="top"><path d="${top}"/></clipPath><clipPath id="bottom"><path d="${bottom}"/></clipPath>`;
  const chS = r.pick(SH);
  const chx = W * r.range(0.16, 0.26);
  const chy = H * 0.88;
  return {
    bg: o.c1,
    defs,
    body: [
      `<path d="${bottom}" fill="${o.c2}"/>`,
      `<g clip-path="url(#top)">${shape(s, cx, cy, size, o.c2, { rot })}</g>`,
      `<g clip-path="url(#bottom)">${shape(s, cx, cy, size, o.c1, { rot })}</g>`,
      shape(r.pick(SH), W * r.range(0.74, 0.86), H * r.range(0.08, 0.14), 170, o.c3, { rot: r.range(-25, 25) }),
      character(chS, chx, chy, 240, o.c3, { look: lookAt(chx, chy, cx, cy) }),
    ].join(''),
  };
}

function truchet(r, o) {
  const t = 200;
  const sw = 46;
  const d = [];
  for (let j = 0; j < H / t; j++) {
    for (let i = 0; i < W / t; i++) {
      const x = i * t;
      const y = j * t;
      if (r.chance(0.5)) {
        d.push(`M${x + t / 2} ${y}A${t / 2} ${t / 2} 0 0 1 ${x + t} ${y + t / 2}`, `M${x} ${y + t / 2}A${t / 2} ${t / 2} 0 0 1 ${x + t / 2} ${y + t}`);
      } else {
        d.push(`M${x + t / 2} ${y}A${t / 2} ${t / 2} 0 0 0 ${x} ${y + t / 2}`, `M${x + t} ${y + t / 2}A${t / 2} ${t / 2} 0 0 0 ${x + t / 2} ${y + t}`);
      }
    }
  }
  const cx = W * r.range(0.4, 0.6);
  const cy = H * r.range(0.4, 0.55);
  const s = o.s1;
  return {
    bg: o.ground,
    body: [
      `<path d="${d.join('')}" fill="none" stroke="${o.line}" stroke-width="${sw}" stroke-linecap="round"/>`,
      shape(s, cx, cy, 760, o.ground, { stroke: o.line, strokeWidth: sw }),
      character(s, cx, cy, 560, o.c1, { look: [r.range(-0.6, 0.6), r.range(-0.4, 0.4)] }),
    ].join(''),
  };
}

function bubble(x, y, w, h, tailLeft, fill) {
  const rr = 70;
  const tx = tailLeft ? x + w * 0.22 : x + w * 0.78;
  const dir = tailLeft ? -1 : 1;
  return `<path d="M${x + rr} ${y}H${x + w - rr}Q${x + w} ${y} ${x + w} ${y + rr}V${y + h - rr}Q${x + w} ${y + h} ${x + w - rr} ${y + h}H${tx + 40}L${tx + dir * 20} ${y + h + 90}L${tx - 40} ${y + h}H${x + rr}Q${x} ${y + h} ${x} ${y + h - rr}V${y + rr}Q${x} ${y} ${x + rr} ${y}Z" fill="${fill}" filter="url(#shadow)"/>`;
}

function conversation(r, o) {
  const defs = shadowDef('shadow', { dy: 16, blur: 20, opacity: 0.12 });
  const [sa, sb] = o.pair;
  const ax = W * 0.3;
  const bx = W * 0.72;
  const floor = 1760;
  const aS = 520;
  const bS = 440;
  const ay = floor - aS / 2;
  const by = floor - bS / 2;
  const b1 = { x: 110, y: 330, w: 760, h: 420 };
  const b2 = { x: 760, y: 820, w: 730, h: 360 };
  const bars = (bx0, by0, w, n, color) =>
    Array.from({ length: n }, (_, i) => `<rect x="${bx0}" y="${by0 + i * 62}" width="${f(i === n - 1 ? w * r.range(0.4, 0.7) : w)}" height="30" rx="15" fill="${color}"/>`).join('');
  const body = [
    `<rect x="0" y="${floor}" width="${W}" height="${H - floor}" fill="${o.floor}"/>`,
    `<path d="${smoothPath([
      [b1.x + b1.w * 0.8, b1.y + b1.h + 40],
      [W * 0.52, H * 0.44],
      [b2.x + b2.w * 0.2, b2.y - 30],
    ])}" fill="none" stroke="${B.ink}" stroke-width="12" stroke-dasharray="0.1 34" stroke-linecap="round" opacity="0.5"/>`,
    bubble(b1.x, b1.y, b1.w, b1.h, true, B.paper),
    shape('circle', b1.x + 140, b1.y + 150, 130, B.blue),
    shape('triangle', b1.x + 300, b1.y + 150, 130, B.red),
    bars(b1.x + 110, b1.y + 270, 520, 2, B.lineStrong),
    bubble(b2.x, b2.y, b2.w, b2.h, false, B.paper),
    bars(b2.x + 90, b2.y + 90, 420, 3, B.lineStrong),
    shape('square', b2.x + 600, b2.y + 150, 120, B.yellow, { rot: 8 }),
    `<ellipse cx="${ax}" cy="${floor + 6}" rx="230" ry="24" fill="${B.ink}" opacity="0.12"/>`,
    `<ellipse cx="${bx}" cy="${floor + 6}" rx="200" ry="22" fill="${B.ink}" opacity="0.12"/>`,
    character(sa, ax, ay, aS, o.ca, { look: [0.9, -0.2] }),
    character(sb, bx, by, bS, o.cb, { look: [-0.9, -0.3] }),
  ];
  return { bg: o.ground, defs, body: body.join('') };
}

// ------------------------------------------------------------------ the 30 covers

const PAPER = B.paper;
const COVERS = [
  ['bigCrop', { ground: B.yellow, s1: 'circle', c1: B.blue, s2: 'triangle', c2: B.red, s3: 'square', c3: B.paper, confetti: [B.ink, B.paper], blend: 'normal' }, 'blue'],
  ['bauhausGrid', { ground: PAPER, palette: [PAPER, B.blue, B.red, B.yellow, B.green, B.ink] }, 'blue'],
  ['halftone', { ground: PAPER, s1: 'circle', c1: B.blue, s2: 'triangle', c2: B.red, c3: B.yellow }, 'blue'],
  ['plot', { ground: PAPER, grid: '#eef1f6', gridMajor: '#dfe5ee', band: B.yellow, c1: B.blue, c2: B.red, c3: B.green, s1: 'arch' }, 'blue'],
  ['collage', { ground: B.muted, fills: [B.blue, B.red, B.yellow, B.green], stripe: B.red, dotBg: B.yellow, charColor: B.blue }, 'red'],
  ['stack', { ground: B.blue, floor: B.blue600, order: ['square', 'arch', 'triangle', 'circle'], colors: [B.yellow, B.green, B.red, B.paper], runaway: B.yellow, blink: true }, 'blue'],
  ['orbit', { ground: B.ink, line: '#f5f6f8', arcs: [B.blue, B.red, B.yellow, B.green], center: 'circle', centerColor: B.blue }, 'blue'],
  ['rainbow', { ground: PAPER, bands: [B.blue, B.red, B.yellow, B.green, PAPER], sun: B.yellow, char: B.red }, 'green'],
  ['confetti', { ground: PAPER, colors: [B.blue, B.red, B.yellow, B.green], center: 'triangle', centerColor: B.red }, 'red'],
  ['split', { c1: B.blue, c2: PAPER, c3: B.yellow, s1: 'circle' }, 'blue'],
  ['truchet', { ground: B.yellow, line: B.ink, s1: 'circle', c1: B.blue }, 'yellow'],
  ['conversation', { ground: B.blue50, floor: '#dfe7f5', pair: ['circle', 'triangle'], ca: B.blue, cb: B.red }, 'blue'],
  ['bigCrop', { ground: B.ink, s1: 'arch', c1: B.green, s2: 'circle', c2: B.yellow, s3: 'triangle', c3: B.red, confetti: [B.paper, B.blue], blend: 'normal' }, 'green'],
  ['bauhausGrid', { ground: B.ink, palette: [B.ink, B.blue, B.red, B.yellow, B.green, PAPER] }, 'yellow'],
  ['halftone', { ground: B.yellow50, s1: 'arch', c1: B.green, s2: 'circle', c2: B.blue, c3: B.red }, 'green'],
  ['plot', { ground: B.ink, dark: true, grid: '#1c222c', gridMajor: '#262d39', band: B.blue, c1: B.yellow, c2: B.red, c3: B.green, s1: 'square' }, 'yellow'],
  ['collage', { ground: B.blue50, fills: [B.blue, B.yellow, B.ink, B.red], stripe: B.blue, dotBg: B.paper, charColor: B.yellow }, 'blue'],
  ['stack', { ground: B.red50, floor: '#f8cfcf', order: ['arch', 'square', 'circle', 'triangle'], colors: [B.green, B.blue, B.yellow, B.red], runaway: B.blue, blink: false }, 'red'],
  ['orbit', { ground: B.blue, line: '#ffffff', arcs: [B.yellow, B.paper, B.red, B.green], center: 'square', centerColor: B.yellow }, 'blue'],
  ['rainbow', { ground: B.yellow, bands: [B.ink, B.paper, B.red, B.blue], sun: B.paper, char: B.green }, 'yellow'],
  ['confetti', { ground: B.ink, colors: [B.blue, B.red, B.yellow, B.green, B.paper], center: 'circle', centerColor: B.blue }, 'blue'],
  ['split', { c1: B.red, c2: B.yellow, c3: B.ink, s1: 'arch' }, 'red'],
  ['truchet', { ground: B.blue, line: B.paper, s1: 'triangle', c1: B.red }, 'blue'],
  ['conversation', { ground: B.yellow50, floor: '#fbeac0', pair: ['square', 'arch'], ca: B.yellow, cb: B.green }, 'yellow'],
  ['bigCrop', { ground: B.red, s1: 'square', c1: B.paper, s2: 'arch', c2: B.ink, s3: 'circle', c3: B.yellow, confetti: [B.paper, B.yellow], blend: 'normal' }, 'red'],
  ['bauhausGrid', { ground: B.yellow50, palette: [B.yellow50, B.green, B.blue, B.red, B.ink] }, 'green'],
  ['halftone', { ground: B.ink, dark: true, s1: 'square', c1: B.yellow, s2: 'arch', c2: B.red, c3: B.blue }, 'yellow'],
  ['plot', { ground: B.yellow50, grid: '#f6e7bd', gridMajor: '#eed89b', band: B.green, c1: B.ink, c2: B.blue, c3: B.red, s1: 'triangle' }, 'yellow'],
  ['collage', { ground: B.green50, fills: [B.green, B.blue, B.red, B.yellow], stripe: B.green, dotBg: B.red, charColor: B.paper }, 'green'],
  ['stack', { ground: B.green, floor: B.green600, order: ['square', 'circle', 'arch', 'triangle'], colors: [B.paper, B.yellow, B.blue, B.red], runaway: B.red, blink: true }, 'green'],
];

const ARCH = { bigCrop, bauhausGrid, halftone, plot, collage, stack, orbit, rainbow, confetti, split, truchet, conversation };

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',').map(Number) : null;
const sheet = args.includes('--sheet') ? args[args.indexOf('--sheet') + 1] : scratch('covers-sheet.png');
const outDir = ensureDir(join(ASSETS, 'covers'));
const items = [];
for (let i = 0; i < COVERS.length; i++) {
  const [arch, opts, accent] = COVERS[i];
  const id = `cover-${String(i + 1).padStart(2, '0')}`;
  const file = join(outDir, `${id}.jpg`);
  if (!only || only.includes(i + 1)) {
    const r = rng(1000 + i * 7919);
    const res = ARCH[arch](r, opts);
    const svg = svgDoc(W, H, res.bg, `${grainDefs(i + 11)}${res.defs ?? ''}`, `${res.body}${grain(W, H, res.grain ?? 0.55)}`);
    await sharp(Buffer.from(svg)).jpeg({ quality: 86, mozjpeg: true }).toFile(file);
  }
  items.push({
    id,
    path: rel(file),
    type: 'image',
    mime: 'image/jpeg',
    width: W,
    height: H,
    bytes: bytes(file),
    aspect: '4:5',
    style: arch,
    accent,
    ground: opts.ground ?? opts.c1,
    usage: 'event cover (events.coverAssetId). Match events.accent to `accent`.',
    credit: 'Procedural artwork, scripts/seed-media/gen-covers.mjs (Zemi brand shapes).',
  });
  console.log(`${id} ${arch}`);
}
writeSection('covers', {
  purpose: 'event-cover',
  note: '4:5 posters with no text. The site overlays titles. `accent` is the dominant brand color.',
  credit: 'Procedural, generated from the Zemi brand geometry.',
  items,
});
await contactSheet(items.map((it) => join(ASSETS, it.path)), sheet, { cols: 6, cell: 240, aspect: 1.25 });
console.log(`contact sheet: ${sheet}`);
