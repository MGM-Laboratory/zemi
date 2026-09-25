#!/usr/bin/env node
/**
 * Six sample paper PDFs (2 to 4 pages) rendered with Python reportlab through uv (no repo deps).
 *
 *   node scripts/seed-media/gen-pdfs.mjs
 *
 * Needs `uv` on PATH and the pub covers (figures are cropped from them), so run gen-pub-covers.mjs first.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ASSETS, REPO, bytes, ensureDir, rel, scratch, writeSection } from './lib/common.mjs';

// The contract: seeds must pass `publicationInput` (packages/shared), so check the enum values here.
// Needs `pnpm --filter @zemi/shared build` once.
const { PUBLICATION_TYPES, PUBLICATION_STATUSES } = await import(
  pathToFileURL(join(REPO, 'packages', 'shared', 'dist', 'constants.js')).href
);

const out = ensureDir(join(ASSETS, 'pdfs'));
const meta = scratch('pdfs-meta.json');
ensureDir(scratch());
const r = spawnSync(
  'uv',
  ['run', '--no-project', '--with', 'reportlab', '--with', 'pillow', 'python', join(REPO, 'scripts/seed-media/pdfs/gen_pdfs.py'), '--out', out, '--meta', meta],
  { stdio: 'inherit' },
);
if (r.status !== 0) process.exit(r.status ?? 1);
const papers = JSON.parse(readFileSync(meta, 'utf8'));
for (const p of papers) {
  if (!PUBLICATION_TYPES.includes(p.pubType)) throw new Error(`${p.id}: pub_type "${p.pubType}" is not in PUBLICATION_TYPES`);
  if (!PUBLICATION_STATUSES.includes(p.status)) throw new Error(`${p.id}: status "${p.status}" is not in PUBLICATION_STATUSES`);
}
writeSection('pdfs', {
  purpose: 'publication-pdf',
  note: 'Sample papers for publications.pdfAssetId. The publication fields use the publicationInput names and enum values from packages/shared (publicationType, status, containerTitle, publishedYear, authors as manual authors), so seeds can pass them straight through. `pages` is the PDF page count, not the publications.pages range. Every page footer says it is sample content.',
  credit: 'Generated with reportlab from scripts/seed-media/pdfs/papers.py (made-up content).',
  items: papers.map((p) => ({
    id: p.id,
    path: rel(join(out, p.file)),
    type: 'document',
    mime: 'application/pdf',
    bytes: bytes(join(out, p.file)),
    pages: p.pages,
    title: p.title,
    publicationType: p.pubType,
    publicationTypeLabel: p.typeLabel,
    status: p.status,
    containerTitle: p.venue,
    publishedYear: p.year,
    language: 'en',
    authors: p.authors,
    keywords: p.keywords,
    abstract: p.abstract,
    coverSuggestion: `pub-covers/${p.figure}.jpg`,
    usage: 'publication PDF (publications.pdfAssetId)',
    credit: 'Made-up sample paper.',
  })),
});
