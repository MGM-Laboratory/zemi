'use client';

import { useEffect, useRef } from 'react';
import { SHAPE_COLORS, SHAPE_ORDER, SHAPE_PATHS_46, type ShapeName } from '@zemi/shared';
import { prefersReducedMotion } from '@/lib/hooks/use-reduced-motion';
import type { HomeSpeaker } from '../types';

export interface NetworkCanvasProps {
  people: HomeSpeaker[];
  className?: string;
  /** Called when a click links two people. */
  onConnect?: (a: string, b: string) => void;
  /** performance.now() of the last click that something on top (the cup) already handled. */
  handledAt?: { current: number };
}

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  shape: ShapeName;
  img: HTMLImageElement | null;
  name: string;
  glow: number;
  pop: number;
}

const LINK = 190; // cursor reach in px
const PAIR = 230; // node to node, near the cursor

function smallestWebp(p: HomeSpeaker): string | null {
  const list = p.avatar?.webp ?? [];
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a.width - b.width);
  return (sorted.find((s) => s.width >= 160) ?? sorted[sorted.length - 1])!.url;
}

/**
 * The coffee table as a constellation: faces and shapes drift around, the cursor links whoever
 * is close, and a click introduces the nearest person to their nearest neighbour for good.
 * Canvas 2D (no WebGL), paused offscreen, still under reduced motion. Decorative: aria-hidden.
 */
export function NetworkCanvas({ people, className, onConnect, handledAt }: NetworkCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cb = useRef(onConnect);
  useEffect(() => {
    cb.current = onConnect;
  });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduced = prefersReducedMotion();
    const small = window.matchMedia('(max-width: 767.98px)').matches;
    const count = small ? 14 : 26;
    const faces = people.filter((p) => p.avatar).slice(0, small ? 7 : 13);

    const paths = Object.fromEntries(
      SHAPE_ORDER.map((s) => [s, new Path2D(SHAPE_PATHS_46[s])]),
    ) as Record<ShapeName, Path2D>;
    let w = 0;
    let h = 0;
    let dpr = 1;
    const nodes: Node[] = [];
    const links: Array<[number, number, number]> = []; // a, b, born (ms)
    const cursor = { x: -9999, y: -9999, on: false };
    let raf = 0;
    let visible = false;
    let last = performance.now();

    const rand = (() => {
      let a = 11;
      return () => {
        a = (a * 16807) % 2147483647;
        return (a - 1) / 2147483646;
      };
    })();

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const first = w === 0;
      const ow = w || r.width;
      const oh = h || r.height;
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      if (first) return;
      nodes.forEach((n) => {
        n.x = (n.x / ow) * w;
        n.y = (n.y / oh) * h;
      });
    };
    resize();

    for (let i = 0; i < count; i++) {
      const face = faces[i];
      let img: HTMLImageElement | null = null;
      const url = face ? smallestWebp(face) : null;
      if (url) {
        img = new Image();
        img.decoding = 'async';
        img.src = url;
      }
      nodes.push({
        x: rand() * w,
        y: rand() * h,
        vx: (rand() - 0.5) * 14,
        vy: (rand() - 0.5) * 14,
        r: face ? 18 + rand() * 12 : 7 + rand() * 9,
        shape: SHAPE_ORDER[i % 4]!,
        img,
        name: face?.fullName ?? '',
        glow: 0,
        pop: 0,
      });
    }

    const draw = (now: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Permanent introductions.
      for (const [a, b, born] of links) {
        const A = nodes[a]!;
        const B = nodes[b]!;
        const k = Math.min(1, (now - born) / 500);
        const mx = A.x + (B.x - A.x) * k;
        const my = A.y + (B.y - A.y) * k;
        ctx.strokeStyle = 'rgba(14,17,22,0.55)';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(mx, my);
        ctx.stroke();
        if (k >= 1) {
          ctx.fillStyle = SHAPE_COLORS.arch;
          ctx.beginPath();
          ctx.arc((A.x + B.x) / 2, (A.y + B.y) / 2, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Cursor links.
      if (cursor.on) {
        const near: number[] = [];
        nodes.forEach((n, i) => {
          const d = Math.hypot(n.x - cursor.x, n.y - cursor.y);
          if (d < LINK) near.push(i);
        });
        ctx.setLineDash([4, 6]);
        for (let i = 0; i < near.length; i++) {
          const A = nodes[near[i]!]!;
          for (let j = i + 1; j < near.length; j++) {
            const B = nodes[near[j]!]!;
            const d = Math.hypot(A.x - B.x, A.y - B.y);
            if (d > PAIR) continue;
            ctx.strokeStyle = `rgba(14,17,22,${(0.3 * (1 - d / PAIR)).toFixed(3)})`;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(A.x, A.y);
            ctx.lineTo(B.x, B.y);
            ctx.stroke();
          }
        }
        ctx.setLineDash([]);
        for (const i of near) {
          const n = nodes[i]!;
          const d = Math.hypot(n.x - cursor.x, n.y - cursor.y);
          ctx.strokeStyle = `rgba(58,109,197,${(0.85 * (1 - d / LINK)).toFixed(3)})`;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(cursor.x, cursor.y);
          ctx.lineTo(n.x, n.y);
          ctx.stroke();
        }
      }

      // People.
      for (const n of nodes) {
        const s = 1 + n.glow * 0.18 + Math.sin(n.pop * Math.PI) * 0.35;
        const r = n.r * s;
        if (n.img) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 3, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = SHAPE_COLORS[n.shape];
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.clip();
          if (n.img.complete && n.img.naturalWidth)
            ctx.drawImage(n.img, n.x - r, n.y - r, r * 2, r * 2);
          else {
            ctx.fillStyle = '#f7f7f5';
            ctx.fill();
          }
          ctx.restore();
        } else {
          ctx.save();
          ctx.translate(n.x - r, n.y - r);
          ctx.scale((r * 2) / 46, (r * 2) / 46);
          ctx.fillStyle = SHAPE_COLORS[n.shape];
          ctx.fill(paths[n.shape]);
          ctx.restore();
        }
      }
    };

    const frame = (now: number) => {
      raf = 0;
      if (!visible) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      for (const n of nodes) {
        if (!reduced) {
          n.x += n.vx * dt;
          n.y += n.vy * dt;
          if (n.x < n.r || n.x > w - n.r) n.vx *= -1;
          if (n.y < n.r || n.y > h - n.r) n.vy *= -1;
          n.x = Math.max(n.r, Math.min(w - n.r, n.x));
          n.y = Math.max(n.r, Math.min(h - n.r, n.y));
        }
        const d = cursor.on ? Math.hypot(n.x - cursor.x, n.y - cursor.y) : Infinity;
        n.glow += ((d < LINK ? 1 - d / LINK : 0) - n.glow) * 0.15;
        if (n.pop > 0) n.pop = Math.max(0, n.pop - dt * 2.2);
      }
      draw(now);
      raf = requestAnimationFrame(frame);
    };

    const kick = () => {
      if (!raf && visible) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };

    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      cursor.x = p.x;
      cursor.y = p.y;
      cursor.on = p.x >= 0 && p.y >= 0 && p.x <= w && p.y <= h;
      kick();
    };
    const onLeave = () => {
      cursor.on = false;
    };
    const onClick = (e: PointerEvent) => {
      // Buttons, links and the 3D cup keep their own clicks.
      if ((e.target as Element | null)?.closest?.('a, button, input, label')) return;
      if (handledAt && performance.now() - handledAt.current < 60) return;
      const p = local(e);
      let best = -1;
      let bd = Infinity;
      nodes.forEach((n, i) => {
        const d = Math.hypot(n.x - p.x, n.y - p.y);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      if (best < 0 || bd > 120) return;
      let other = -1;
      let od = Infinity;
      nodes.forEach((n, i) => {
        if (i === best) return;
        if (links.some(([a, b]) => (a === best && b === i) || (a === i && b === best))) return;
        const d = Math.hypot(n.x - nodes[best]!.x, n.y - nodes[best]!.y);
        if (d < od) {
          od = d;
          other = i;
        }
      });
      if (other < 0) return;
      links.push([best, other, performance.now()]);
      if (links.length > 40) links.shift();
      nodes[best]!.pop = 1;
      nodes[other]!.pop = 1;
      cb.current?.(nodes[best]!.name, nodes[other]!.name);
      kick();
    };

    const host = canvas.closest('section') ?? canvas.parentElement ?? canvas;
    host.addEventListener('pointermove', onMove, { passive: true });
    host.addEventListener('pointerdown', onMove, { passive: true });
    host.addEventListener('pointerleave', onLeave);
    host.addEventListener('click', onClick as unknown as EventListener);

    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      kick();
    });
    io.observe(canvas);
    const ro = new ResizeObserver(() => {
      resize();
      kick();
    });
    ro.observe(canvas);

    return () => {
      io.disconnect();
      ro.disconnect();
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerdown', onMove);
      host.removeEventListener('pointerleave', onLeave);
      host.removeEventListener('click', onClick as unknown as EventListener);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [people, handledAt]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
