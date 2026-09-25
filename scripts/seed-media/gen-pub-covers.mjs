#!/usr/bin/env node
/**
 * 16 generative 4:5 publication covers (1200x1500): abstract "figure" aesthetics on white.
 * Plots, networks, contour lines, scatter clouds and friends, in brand colors. No text.
 *
 *   node scripts/seed-media/gen-pub-covers.mjs [--sheet <png>]
 */
import { join } from 'node:path';
import { ASSETS, BRAND as B, bytes, contactSheet, ensureDir, rel, rng, scratch, sharp, writeSection } from './lib/common.mjs';
import { f, graphPaper, shape, smoothPath, svgDoc } from './lib/svg.mjs';

const W = 1200;
const H = 1500;
const C = [B.blue, B.red, B.yellow, B.green];
// plot area
const X0 = 170;
const X1 = 1060;
const Y0 = 250;
const Y1 = 1250;

const gauss = (r) => {
  let u = 0;
  let v = 0;
  while (u === 0) u = r.next();
  while (v === 0) v = r.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

function axes({ grid = true, ticks = 5, box = false } = {}) {
  const out = [];
  if (grid) out.push(graphPaper(W, H, 50, '#f1f3f7', { width: 2 }));
  const t = [];
  for (let i = 0; i <= ticks; i++) {
    const x = X0 + ((X1 - X0) * i) / ticks;
    const y = Y1 - ((Y1 - Y0) * i) / ticks;
    t.push(`M${f(x)} ${Y1}v18`, `M${X0} ${f(y)}h-18`);
  }
  out.push(`<path d="${t.join('')}" stroke="${B.ink}" stroke-width="4" stroke-linecap="round"/>`);
  out.push(
    box
      ? `<rect x="${X0}" y="${Y0}" width="${X1 - X0}" height="${Y1 - Y0}" fill="none" stroke="${B.ink}" stroke-width="5"/>`
      : `<path d="M${X0} ${Y0 - 30}V${Y1}H${X1 + 30}" fill="none" stroke="${B.ink}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
  return out.join('');
}

/** A wordless legend: brand shape swatches + grey "label" bars. */
function legend(r, colors, x = X1 - 250, y = Y0 + 20) {
  const out = [`<rect x="${x - 26}" y="${y - 26}" width="250" height="${colors.length * 54 + 26}" rx="16" fill="#ffffff" stroke="${B.line}" stroke-width="3"/>`];
  colors.forEach((c, i) => {
    out.push(shape(['circle', 'triangle', 'square', 'arch'][i % 4], x + 14, y + 14 + i * 54, 28, c));
    out.push(`<rect x="${x + 46}" y="${y + 6 + i * 54}" width="${f(r.range(90, 150))}" height="16" rx="8" fill="${B.lineStrong}"/>`);
  });
  return out.join('');
}

// ------------------------------------------------------------------ figures

const FIG = {
  scatterClusters(r) {
    const out = [axes()];
    const cl = [];
    for (const c of C.slice(0, 3)) {
      let k;
      do k = { c, x: r.range(X0 + 200, X1 - 200), y: r.range(Y0 + 220, Y1 - 200), sx: r.range(60, 130), sy: r.range(60, 130) };
      while (cl.some((q) => Math.hypot(q.x - k.x, q.y - k.y) < 380));
      cl.push(k);
    }
    for (const k of cl) {
      for (let i = 0; i < 160; i++) {
        const x = k.x + gauss(r) * k.sx;
        const y = k.y + gauss(r) * k.sy;
        if (x < X0 + 10 || x > X1 || y < Y0 || y > Y1 - 10) continue;
        out.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(r.range(6, 13))}" fill="${k.c}" opacity="0.78" style="mix-blend-mode:multiply"/>`);
      }
      out.push(`<ellipse cx="${f(k.x)}" cy="${f(k.y)}" rx="${f(k.sx * 2)}" ry="${f(k.sy * 2)}" fill="none" stroke="${B.ink}" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round"/>`);
    }
    out.push(legend(r, cl.map((k) => k.c)));
    return out.join('');
  },
  network(r) {
    const n = 34;
    const nodes = [];
    while (nodes.length < n) {
      const x = r.range(140, W - 140);
      const y = r.range(180, H - 180);
      if (nodes.every((p) => Math.hypot(p.x - x, p.y - y) > 120)) nodes.push({ x, y, c: r.pick(C), s: r.range(24, 70), deg: 0 });
    }
    const edges = [];
    nodes.forEach((a, i) => {
      const near = nodes.map((b, j) => ({ j, d: Math.hypot(a.x - b.x, a.y - b.y) })).filter((e) => e.j !== i).sort((p, q) => p.d - q.d);
      near.slice(0, r.int(1, 3)).forEach((e) => edges.push([i, e.j]));
    });
    const hub = nodes[r.int(0, n - 1)];
    const out = [graphPaper(W, H, 50, '#f3f5f8', { width: 2 })];
    out.push(`<path d="${edges.map(([i, j]) => `M${f(nodes[i].x)} ${f(nodes[i].y)}L${f(nodes[j].x)} ${f(nodes[j].y)}`).join('')}" stroke="${B.ink}" stroke-width="4" opacity="0.55"/>`);
    nodes.slice(0, 8).forEach((p) => out.push(`<path d="M${f(p.x)} ${f(p.y)}L${f(hub.x)} ${f(hub.y)}" stroke="${B.blue}" stroke-width="7" opacity="0.5"/>`));
    nodes.forEach((p) => out.push(`<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(p.s / 2)}" fill="${p.c}" stroke="#fff" stroke-width="6"/>`));
    out.push(`<circle cx="${f(hub.x)}" cy="${f(hub.y)}" r="70" fill="${B.ink}" stroke="#fff" stroke-width="10"/>`);
    return out.join('');
  },
  contours(r) {
    const peaks = Array.from({ length: 5 }, () => ({ x: r.range(0, W), y: r.range(0, H), s: r.range(160, 380), a: r.range(-1, 1.4) }));
    const field = (x, y) => peaks.reduce((acc, p) => acc + p.a * Math.exp(-((x - p.x) ** 2 + (y - p.y) ** 2) / (2 * p.s * p.s)), 0);
    const step = 8;
    const nx = Math.ceil(W / step) + 1;
    const ny = Math.ceil(H / step) + 1;
    const v = new Float64Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = field(i * step, j * step);
    const out = [];
    const levels = 18;
    let lo = Infinity;
    let hi = -Infinity;
    for (const x of v) {
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
    for (let L = 1; L < levels; L++) {
      const t = lo + ((hi - lo) * L) / levels;
      const d = [];
      for (let j = 0; j < ny - 1; j++) {
        for (let i = 0; i < nx - 1; i++) {
          const a = v[j * nx + i];
          const b = v[j * nx + i + 1];
          const c = v[(j + 1) * nx + i + 1];
          const e = v[(j + 1) * nx + i];
          const idx = (a > t ? 8 : 0) | (b > t ? 4 : 0) | (c > t ? 2 : 0) | (e > t ? 1 : 0);
          if (idx === 0 || idx === 15) continue;
          const x = i * step;
          const y = j * step;
          const lerp = (p, q) => (t - p) / (q - p);
          const top = [x + step * lerp(a, b), y];
          const right = [x + step, y + step * lerp(b, c)];
          const bottom = [x + step * lerp(e, c), y + step];
          const left = [x, y + step * lerp(a, e)];
          const segs = {
            1: [left, bottom], 2: [bottom, right], 3: [left, right], 4: [top, right], 5: [left, top, bottom, right], 6: [top, bottom], 7: [left, top],
            8: [left, top], 9: [top, bottom], 10: [left, bottom, top, right], 11: [top, right], 12: [left, right], 13: [bottom, right], 14: [left, bottom],
          }[idx];
          for (let k = 0; k < segs.length; k += 2) d.push(`M${f(segs[k][0])} ${f(segs[k][1])}L${f(segs[k + 1][0])} ${f(segs[k + 1][1])}`);
        }
      }
      const u = L / levels;
      const col = u > 0.8 ? B.red : u > 0.6 ? B.yellow : u > 0.35 ? B.green : B.blue;
      out.push(`<path d="${d.join('')}" stroke="${col}" stroke-width="${L % 4 === 0 ? 6 : 3}" stroke-linecap="round" fill="none"/>`);
    }
    const top = peaks.reduce((p, q) => (q.a > p.a ? q : p));
    out.push(shape('triangle', top.x, top.y, 46, B.ink));
    return out.join('');
  },
  bands(r) {
    const out = [axes()];
    const n = 40;
    [B.blue, B.red, B.green].forEach((c, k) => {
      let y = r.range(Y0 + 300, Y1 - 200);
      const pts = [];
      const up = [];
      const dn = [];
      for (let i = 0; i <= n; i++) {
        const x = X0 + 20 + ((X1 - X0 - 40) * i) / n;
        y += gauss(r) * 22 - (k - 1) * 4;
        y = Math.min(Y1 - 80, Math.max(Y0 + 80, y));
        const w = 30 + i * r.range(1.5, 3.5);
        pts.push([x, y]);
        up.push([x, y - w]);
        dn.push([x, y + w]);
      }
      out.push(`<path d="${smoothPath(up)} L${dn.reverse().map((p) => `${f(p[0])} ${f(p[1])}`).join(' L')}Z" fill="${c}" opacity="0.18"/>`);
      out.push(`<path d="${smoothPath(pts)}" fill="none" stroke="${c}" stroke-width="9" stroke-linecap="round"/>`);
    });
    out.push(legend(r, [B.blue, B.red, B.green]));
    return out.join('');
  },
  bars(r) {
    const out = [axes({ ticks: 4 })];
    const groups = 5;
    const gw = (X1 - X0) / groups;
    for (let g = 0; g < groups; g++) {
      C.forEach((c, k) => {
        const h = r.range(120, 880);
        const x = X0 + g * gw + 30 + k * ((gw - 60) / 4);
        out.push(`<rect x="${f(x)}" y="${f(Y1 - h)}" width="${f((gw - 60) / 4 - 8)}" height="${f(h)}" rx="10" fill="${c}"/>`);
        out.push(`<path d="M${f(x + (gw - 60) / 8 - 4)} ${f(Y1 - h - 40)}v80" stroke="${B.ink}" stroke-width="4" stroke-linecap="round"/>`);
      });
    }
    out.push(legend(r, C));
    return out.join('');
  },
  heatmap(r) {
    const n = 14;
    const cell = (X1 - X0) / n;
    const out = [];
    const ramp = ['#ffffff', '#ecf1fa', '#c9d6f0', '#8fadde', B.blue, B.blue600, '#1d3a73', B.ink];
    const a = r.range(0.2, 0.5);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const v = Math.max(0, Math.min(0.999, 0.5 + 0.45 * Math.sin(i * a + j * 0.3) * Math.cos(j * a * 0.8) + gauss(r) * 0.08 + (i === j ? 0.4 : 0)));
        out.push(`<rect x="${f(X0 + i * cell + 3)}" y="${f(Y0 + j * cell * 1.05 + 3)}" width="${f(cell - 6)}" height="${f(cell * 1.05 - 6)}" rx="8" fill="${ramp[Math.floor(v * ramp.length)]}"/>`);
      }
    }
    for (let i = 0; i < 8; i++) out.push(`<rect x="${X0 + i * 60}" y="${Y1 + 140}" width="60" height="34" fill="${ramp[i]}" ${i === 0 ? `stroke="${B.line}" stroke-width="2"` : ''}/>`);
    out.push(shape('square', X1 - 40, Y1 + 157, 50, B.yellow, { rot: 10 }));
    return out.join('');
  },
  histogram(r) {
    const out = [axes()];
    const bins = 26;
    const bw = (X1 - X0 - 40) / bins;
    const mu = r.range(9, 16);
    const pts = [];
    for (let i = 0; i < bins; i++) {
      const g = Math.exp(-((i - mu) ** 2) / (2 * 16)) + 0.45 * Math.exp(-((i - mu - 7) ** 2) / 8);
      const h = (g * 700 + r.range(0, 70)) | 0;
      const x = X0 + 20 + i * bw;
      out.push(`<rect x="${f(x + 3)}" y="${f(Y1 - h)}" width="${f(bw - 6)}" height="${h}" rx="6" fill="${i > mu + 4 ? B.red : B.yellow}"/>`);
      pts.push([x + bw / 2, Y1 - g * 720 - 30]);
    }
    out.push(`<path d="${smoothPath(pts)}" fill="none" stroke="${B.ink}" stroke-width="8" stroke-linecap="round"/>`);
    const mx = X0 + 20 + mu * bw + bw / 2;
    out.push(`<path d="M${f(mx)} ${Y0}V${Y1}" stroke="${B.blue}" stroke-width="6" stroke-dasharray="4 18" stroke-linecap="round"/>`);
    out.push(shape('circle', mx, Y0 - 10, 48, B.blue));
    return out.join('');
  },
  flow(r) {
    const k1 = r.range(0.002, 0.004);
    const k2 = r.range(0.002, 0.004);
    const ph = r.range(0, 6);
    const ang = (x, y) => Math.sin(x * k1 + ph) * 2.2 + Math.cos(y * k2 - ph) * 2.2;
    const out = [];
    for (let s = 0; s < 190; s++) {
      let x = r.range(0, W);
      let y = r.range(0, H);
      const pts = [[x, y]];
      for (let i = 0; i < 70; i++) {
        const a = ang(x, y);
        x += Math.cos(a) * 9;
        y += Math.sin(a) * 9;
        if (x < 0 || x > W || y < 0 || y > H) break;
        pts.push([x, y]);
      }
      if (pts.length < 10) continue;
      const c = s % 9 === 0 ? B.red : s % 5 === 0 ? B.yellow : s % 3 === 0 ? B.green : B.blue;
      out.push(`<path d="M${pts.map((p) => `${f(p[0])} ${f(p[1])}`).join(' L')}" fill="none" stroke="${c}" stroke-width="${f(r.range(3, 8))}" stroke-linecap="round" opacity="0.9"/>`);
    }
    return out.join('');
  },
  radar(r) {
    const cx = W / 2;
    const cy = H / 2 + 20;
    const R = 430;
    const n = 7;
    const out = [];
    for (let k = 1; k <= 5; k++) {
      const pts = Array.from({ length: n }, (_, i) => {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        return `${f(cx + Math.cos(a) * R * (k / 5))} ${f(cy + Math.sin(a) * R * (k / 5))}`;
      });
      out.push(`<path d="M${pts.join(' L')}Z" fill="none" stroke="${B.lineStrong}" stroke-width="3"/>`);
    }
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      out.push(`<path d="M${cx} ${cy}L${f(cx + Math.cos(a) * R)} ${f(cy + Math.sin(a) * R)}" stroke="${B.lineStrong}" stroke-width="3"/>`);
    }
    [B.blue, B.red, B.yellow].forEach((c) => {
      const pts = Array.from({ length: n }, (_, i) => {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        const v = r.range(0.3, 0.98);
        return [cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v];
      });
      out.push(`<path d="M${pts.map((p) => `${f(p[0])} ${f(p[1])}`).join(' L')}Z" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="7" stroke-linejoin="round" style="mix-blend-mode:multiply"/>`);
      pts.forEach((p) => out.push(`<circle cx="${f(p[0])}" cy="${f(p[1])}" r="11" fill="${c}"/>`));
    });
    return out.join('');
  },
  dendrogram(r) {
    const leaves = 18;
    let clusters = Array.from({ length: leaves }, (_, i) => ({ x: X0 + ((X1 - X0) * (i + 0.5)) / leaves, h: Y1, c: C[Math.floor(i / 5) % 4] }));
    const out = [];
    let level = Y1;
    while (clusters.length > 1) {
      const i = r.int(0, clusters.length - 2);
      const a = clusters[i];
      const b = clusters[i + 1];
      level -= r.range(30, 70);
      const col = a.c === b.c ? a.c : B.ink;
      out.push(`<path d="M${f(a.x)} ${f(a.h)}V${f(level)}H${f(b.x)}V${f(b.h)}" fill="none" stroke="${col}" stroke-width="7" stroke-linejoin="round"/>`);
      clusters.splice(i, 2, { x: (a.x + b.x) / 2, h: level, c: col });
    }
    out.push(`<path d="M${f(clusters[0].x)} ${f(clusters[0].h)}V${f(clusters[0].h - 80)}" stroke="${B.ink}" stroke-width="7"/>`);
    for (let i = 0; i < leaves; i++) out.push(shape('circle', X0 + ((X1 - X0) * (i + 0.5)) / leaves, Y1 + 40, 30, C[Math.floor(i / 5) % 4]));
    out.push(`<path d="M${X0} ${f(level + 180)}H${X1}" stroke="${B.red}" stroke-width="4" stroke-dasharray="3 16" stroke-linecap="round"/>`);
    return graphPaper(W, H, 50, '#f3f5f8', { width: 2 }) + out.join('');
  },
  violins(r) {
    const out = [axes({ ticks: 5 })];
    const n = 5;
    for (let k = 0; k < n; k++) {
      const cx = X0 + ((X1 - X0) * (k + 0.5)) / n;
      const sd = r.range(90, 150);
      const mu = r.range(Y0 + 3 * sd, Y1 - 3 * sd);
      const left = [];
      const right = [];
      for (let y = mu - 3 * sd; y <= mu + 3 * sd; y += 16) {
        const w = 70 * Math.exp(-((y - mu) ** 2) / (2 * sd * sd)) * (1 + 0.25 * Math.sin(y * 0.02 + k)) + 4;
        left.push([cx - w, y]);
        right.push([cx + w, y]);
      }
      const c = C[k % 4];
      out.push(`<path d="${smoothPath(left)} L${right.reverse().map((p) => `${f(p[0])} ${f(p[1])}`).join(' L')}Z" fill="${c}" opacity="0.9"/>`);
      out.push(`<rect x="${f(cx - 14)}" y="${f(mu - sd * 0.6)}" width="28" height="${f(sd * 1.2)}" rx="10" fill="#ffffff" stroke="${B.ink}" stroke-width="4"/>`);
      out.push(`<circle cx="${f(cx)}" cy="${f(mu)}" r="9" fill="${B.ink}"/>`);
    }
    return out.join('');
  },
  surface(r) {
    const out = [];
    const nx = 34;
    const ny = 34;
    const a = r.range(0.25, 0.4);
    const b = r.range(0.2, 0.35);
    const proj = (i, j) => {
      const x = (i / nx - 0.5) * 900;
      const y = (j / ny - 0.5) * 900;
      const z = 150 * Math.sin(i * a) * Math.cos(j * b) + 120 * Math.exp(-((i - nx * 0.6) ** 2 + (j - ny * 0.4) ** 2) / 40);
      return [W / 2 + (x - y) * 0.62, H * 0.56 + (x + y) * 0.32 - z];
    };
    for (let j = 0; j <= ny; j++) {
      const pts = Array.from({ length: nx + 1 }, (_, i) => proj(i, j));
      out.push(`<path d="M${pts.map((p) => `${f(p[0])} ${f(p[1])}`).join(' L')}" fill="none" stroke="${j % 6 === 0 ? B.blue : '#9db4e2'}" stroke-width="${j % 6 === 0 ? 5 : 2.5}"/>`);
    }
    for (let i = 0; i <= nx; i++) {
      const pts = Array.from({ length: ny + 1 }, (_, j) => proj(i, j));
      out.push(`<path d="M${pts.map((p) => `${f(p[0])} ${f(p[1])}`).join(' L')}" fill="none" stroke="${i % 6 === 0 ? B.red : '#f6a3a3'}" stroke-width="${i % 6 === 0 ? 5 : 2.5}" opacity="0.8"/>`);
    }
    const pk = proj(Math.round(nx * 0.6), Math.round(ny * 0.4));
    out.push(shape('circle', pk[0], pk[1] - 40, 60, B.yellow));
    return out.join('');
  },
  bubbles(r) {
    const out = [];
    const cs = [];
    let tries = 0;
    while (cs.length < 70 && tries++ < 8000) {
      const rad = cs.length < 6 ? r.range(120, 200) : r.range(18, 90);
      const x = r.range(100 + rad, W - 100 - rad);
      const y = r.range(160 + rad, H - 160 - rad);
      if (cs.every((c) => Math.hypot(c.x - x, c.y - y) > c.rad + rad + 10)) cs.push({ x, y, rad, c: r.pick(C) });
    }
    cs.forEach((c, i) => {
      out.push(`<circle cx="${f(c.x)}" cy="${f(c.y)}" r="${f(c.rad)}" fill="${c.c}" opacity="${i < 6 ? 0.95 : 0.8}"/>`);
      if (i < 6) out.push(`<circle cx="${f(c.x)}" cy="${f(c.y)}" r="${f(c.rad * 0.55)}" fill="none" stroke="#fff" stroke-width="6" opacity="0.8"/>`);
    });
    return out.join('');
  },
  flows(r) {
    const cols = [X0, (X0 + X1) / 2, X1];
    const out = [];
    const blocks = cols.map(() => {
      let y = Y0;
      return C.map(() => {
        const h = r.range(120, 260);
        const b = { y, h };
        y += h + 30;
        return b;
      });
    });
    for (let c = 0; c < 2; c++) {
      C.forEach((col, i) => {
        const j = (i + r.int(0, 3)) % 4;
        const a = blocks[c][i];
        const b = blocks[c + 1][j];
        const w = Math.min(a.h, b.h) * 0.6;
        const x0 = cols[c] + 40;
        const x1 = cols[c + 1] - 40;
        const ya = a.y + a.h / 2;
        const yb = b.y + b.h / 2;
        const mx = (x0 + x1) / 2;
        out.push(`<path d="M${f(x0)} ${f(ya - w / 2)}C${f(mx)} ${f(ya - w / 2)} ${f(mx)} ${f(yb - w / 2)} ${f(x1)} ${f(yb - w / 2)}V${f(yb + w / 2)}C${f(mx)} ${f(yb + w / 2)} ${f(mx)} ${f(ya + w / 2)} ${f(x0)} ${f(ya + w / 2)}Z" fill="${col}" opacity="0.35"/>`);
      });
    }
    blocks.forEach((bs, c) => bs.forEach((b, i) => out.push(`<rect x="${f(cols[c] - 40 + (c === 0 ? 40 : c === 2 ? -40 : 0))}" y="${f(b.y)}" width="80" height="${f(b.h)}" rx="14" fill="${C[i]}"/>`)));
    return graphPaper(W, H, 50, '#f3f5f8', { width: 2 }) + out.join('');
  },
  ridgeline(r) {
    const out = [];
    const rows = 16;
    for (let k = 0; k < rows; k++) {
      const base = 260 + k * 62;
      const mu = r.range(0.3, 0.7);
      const pts = [];
      for (let i = 0; i <= 90; i++) {
        const u = i / 90;
        const y = 180 * Math.exp(-((u - mu) ** 2) / 0.012) + 70 * Math.exp(-((u - mu - 0.2) ** 2) / 0.004) * r.range(0.5, 1) + 8 * Math.sin(u * 40 + k);
        pts.push([140 + u * 920, base - Math.max(0, y)]);
      }
      const c = [B.blue, B.green, B.yellow, B.red][Math.floor((k / rows) * 4)];
      out.push(`<path d="M140 ${base}L${pts.map((p) => `${f(p[0])} ${f(p[1])}`).join(' L')}L1060 ${base}Z" fill="#ffffff" stroke="none"/>`);
      out.push(`<path d="M140 ${base}L${pts.map((p) => `${f(p[0])} ${f(p[1])}`).join(' L')}L1060 ${base}Z" fill="${c}" opacity="0.2"/>`);
      out.push(`<path d="M${pts.map((p) => `${f(p[0])} ${f(p[1])}`).join(' L')}" fill="none" stroke="${c}" stroke-width="5" stroke-linejoin="round"/>`);
    }
    return out.join('');
  },
  multiples(r) {
    const out = [];
    const cols = 3;
    const rows = 4;
    const cw = 300;
    const ch = 250;
    const ox = (W - cols * cw - (cols - 1) * 40) / 2;
    const oy = 220;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = ox + i * (cw + 40);
        const y = oy + j * (ch + 40);
        const c = C[(i + j) % 4];
        out.push(`<rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="20" fill="#f7f7f5"/>`);
        let v = r.range(0.3, 0.7);
        const pts = [];
        for (let k = 0; k <= 24; k++) {
          v = Math.min(0.92, Math.max(0.08, v + gauss(r) * 0.08 + (j - 1.5) * 0.004));
          pts.push([x + 20 + ((cw - 40) * k) / 24, y + ch - 20 - v * (ch - 40)]);
        }
        out.push(`<path d="${smoothPath(pts)} L${x + cw - 20} ${y + ch - 20} L${x + 20} ${y + ch - 20}Z" fill="${c}" opacity="0.18"/>`);
        out.push(`<path d="${smoothPath(pts)}" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round"/>`);
        const last = pts[pts.length - 1];
        out.push(`<circle cx="${f(last[0])}" cy="${f(last[1])}" r="11" fill="${B.ink}"/>`);
      }
    }
    return out.join('');
  },
};

const ORDER = [
  'scatterClusters', 'network', 'contours', 'bands', 'bars', 'heatmap', 'histogram', 'flow',
  'radar', 'dendrogram', 'violins', 'surface', 'bubbles', 'flows', 'ridgeline', 'multiples',
];
const ACCENT = {
  scatterClusters: 'blue', network: 'blue', contours: 'green', bands: 'red', bars: 'yellow', heatmap: 'blue', histogram: 'yellow', flow: 'blue',
  radar: 'red', dendrogram: 'green', violins: 'green', surface: 'red', bubbles: 'yellow', flows: 'blue', ridgeline: 'green', multiples: 'red',
};

const args = process.argv.slice(2);
const sheet = args.includes('--sheet') ? args[args.indexOf('--sheet') + 1] : scratch('pub-covers-sheet.png');
const outDir = ensureDir(join(ASSETS, 'pub-covers'));
const items = [];
for (let i = 0; i < ORDER.length; i++) {
  const kind = ORDER[i];
  const id = `pub-cover-${String(i + 1).padStart(2, '0')}`;
  const file = join(outDir, `${id}.jpg`);
  const body = FIG[kind](rng(5000 + i * 104729));
  await sharp(Buffer.from(svgDoc(W, H, '#ffffff', '', body))).jpeg({ quality: 88, mozjpeg: true }).toFile(file);
  items.push({
    id,
    path: rel(file),
    type: 'image',
    mime: 'image/jpeg',
    width: W,
    height: H,
    bytes: bytes(file),
    aspect: '4:5',
    style: kind,
    accent: ACCENT[kind],
    usage: 'publication cover (publications.coverAssetId)',
    credit: 'Procedural figure art, scripts/seed-media/gen-pub-covers.mjs.',
  });
  console.log(`${id} ${kind}`);
}
writeSection('pubCovers', {
  purpose: 'publication-cover',
  note: 'Abstract figure-style covers on white, no text. 4:5.',
  credit: 'Procedural.',
  items,
});
await contactSheet(items.map((it) => join(ASSETS, it.path)), sheet, { cols: 8, cell: 200, aspect: 1.25, bg: '#e9e9e6' });
console.log(`contact sheet: ${sheet}`);
