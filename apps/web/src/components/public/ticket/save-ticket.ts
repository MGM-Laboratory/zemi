'use client';

/**
 * Draws the ticket onto a 2D canvas and downloads it as a PNG (no html-to-image dependency).
 * The QR comes from the same-origin rewrite so the canvas is never tainted.
 */
import {
  formatJakarta,
  formatTimeRange,
  SHAPE_COLORS,
  SHAPE_ORDER,
  SHAPE_PATHS_46,
  type Ticket,
} from '@zemi/shared';
import { ACCENT_HEX, asAccent, eventLabel } from '../events/lib';

const W = 1080;
const H = 1720;
const INK = '#0e1116';
const INK2 = '#3b4150';
const INK3 = '#6b7280';

function fontVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('qr failed to load'));
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Wrap text into lines that fit `max` px. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, maxLines = 3): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > max && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    cut[maxLines - 1] = `${cut[maxLines - 1]!.replace(/\s+\S*$/, '')}...`;
    return cut;
  }
  return lines;
}

function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const cell = size / 2;
  const cells: Array<[number, number]> = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ];
  // Mark order: TL circle, TR triangle, BL square, BR arch.
  const order = ['circle', 'triangle', 'square', 'arch'] as const;
  order.forEach((shape, i) => {
    const [cx, cy] = cells[i]!;
    ctx.save();
    ctx.translate(x + cx * cell + cell * 0.08, y + cy * cell + cell * 0.08);
    ctx.scale((cell * 0.84) / 46, (cell * 0.84) / 46);
    ctx.fillStyle = SHAPE_COLORS[shape];
    ctx.fill(new Path2D(SHAPE_PATHS_46[shape]));
    ctx.restore();
  });
}

export async function renderTicketPng(ticket: Ticket): Promise<Blob> {
  await document.fonts?.ready;
  const display = fontVar('--font-recursive', 'ui-sans-serif, system-ui, sans-serif');
  const body = fontVar('--font-atkinson', 'ui-sans-serif, system-ui, sans-serif');
  const mono = 'ui-monospace, SFMono-Regular, Menlo, monospace';
  const accent = ACCENT_HEX[asAccent(ticket.event.accent)];

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');

  // Background: soft ink so the ticket reads as a card.
  ctx.fillStyle = '#f7f7f5';
  ctx.fillRect(0, 0, W, H);

  // Card with graph paper.
  const cx = 60;
  const cy = 60;
  const cw = W - 120;
  const ch = H - 120;
  ctx.save();
  ctx.shadowColor = 'rgba(14,17,22,0.18)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  roundRect(ctx, cx, cy, cw, ch, 56);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, cx, cy, cw, ch, 56);
  ctx.clip();
  ctx.strokeStyle = '#eef1f6';
  ctx.lineWidth = 2;
  for (let x = cx; x < cx + cw; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.lineTo(x, cy + ch);
    ctx.stroke();
  }
  for (let y = cy; y < cy + ch; y += 48) {
    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.lineTo(cx + cw, y);
    ctx.stroke();
  }
  ctx.fillStyle = accent;
  ctx.fillRect(cx, cy, 20, ch);
  ctx.restore();

  const px = cx + 80;
  const inner = cw - 140;
  let y = cy + 90;

  drawMark(ctx, px, y - 10, 64);
  ctx.fillStyle = INK2;
  ctx.font = `700 30px ${mono}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(eventLabel(ticket.event).toUpperCase(), px + 88, y + 22);

  // "Admit one" pill.
  ctx.font = `700 26px ${mono}`;
  const pill = 'ADMIT ONE';
  const pw = ctx.measureText(pill).width + 44;
  roundRect(ctx, px + inner - pw, y - 4, pw, 52, 26);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(pill, px + inner - pw + 22, y + 22);

  // Title.
  y += 130;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK;
  ctx.font = `900 76px ${display}`;
  const titleLines = wrap(ctx, ticket.event.title, inner, 3);
  for (const l of titleLines) {
    ctx.fillText(l, px, y);
    y += 82;
  }

  // When / where.
  y += 24;
  ctx.font = `700 38px ${body}`;
  ctx.fillText(formatJakarta(ticket.event.startsAt, 'date-long'), px, y);
  y += 54;
  ctx.fillStyle = INK2;
  ctx.font = `600 34px ${mono}`;
  ctx.fillText(formatTimeRange(ticket.event.startsAt, ticket.event.endsAt), px, y);
  y += 54;
  ctx.font = `400 32px ${body}`;
  const where =
    ticket.attendanceMode === 'online'
      ? 'Livestream on the event page'
      : [ticket.event.venue, ticket.event.roomNote].filter(Boolean).join('. ');
  for (const l of wrap(ctx, where, inner, 2)) {
    ctx.fillText(l, px, y);
    y += 44;
  }

  // Perforation.
  y += 40;
  ctx.save();
  ctx.setLineDash([18, 14]);
  ctx.strokeStyle = '#d8d8d2';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx + 40, y);
  ctx.lineTo(cx + cw - 40, y);
  ctx.stroke();
  ctx.restore();
  for (const nx of [cx, cx + cw]) {
    ctx.beginPath();
    ctx.arc(nx, y, 30, 0, Math.PI * 2);
    ctx.fillStyle = '#f7f7f5';
    ctx.fill();
  }

  // QR.
  y += 60;
  const qrSize = 520;
  const qrX = cx + (cw - qrSize) / 2;
  roundRect(ctx, qrX - 20, y - 20, qrSize + 40, qrSize + 40, 36);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = '#ececea';
  ctx.lineWidth = 2;
  ctx.stroke();
  try {
    const qr = await loadImage(`/api/v1/public/tickets/${encodeURIComponent(ticket.token)}/qr.png`);
    ctx.drawImage(qr, qrX, y, qrSize, qrSize);
  } catch {
    ctx.fillStyle = INK3;
    ctx.font = `600 30px ${body}`;
    ctx.fillText('Open your ticket link to show the QR', qrX + 20, y + qrSize / 2);
  }
  y += qrSize + 90;

  // Name + code.
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.font = `800 44px ${body}`;
  for (const l of wrap(ctx, ticket.fullName, inner, 2)) {
    ctx.fillText(l, W / 2, y);
    y += 52;
  }
  y += 10;
  ctx.font = `700 52px ${mono}`;
  ctx.fillText(ticket.code, W / 2, y);
  y += 56;
  ctx.fillStyle = INK3;
  ctx.font = `400 28px ${body}`;
  ctx.fillText(
    ticket.attendanceMode === 'online' ? 'Joining online' : 'Joining in the room',
    W / 2,
    y,
  );

  // Footer shapes.
  ctx.textAlign = 'left';
  const fy = cy + ch - 70;
  SHAPE_ORDER.forEach((s, i) => {
    ctx.save();
    ctx.translate(cx + cw / 2 - 86 + i * 44, fy - 16);
    ctx.scale(32 / 46, 32 / 46);
    ctx.fillStyle = SHAPE_COLORS[s];
    ctx.fill(new Path2D(SHAPE_PATHS_46[s]));
    ctx.restore();
  });

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png failed'))), 'image/png'),
  );
}

export async function downloadTicketPng(ticket: Ticket): Promise<void> {
  const blob = await renderTicketPng(ticket);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `zemi-${ticket.event.number ?? 'friday'}-ticket-${ticket.code}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
