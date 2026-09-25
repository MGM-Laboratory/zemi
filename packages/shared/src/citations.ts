/**
 * Citation formatters. Implemented by the publications workstream.
 * Contract: pure functions over CitationSource. Output plain text (or BibTeX/RIS text).
 */
export type CitationFormat = 'apa' | 'ieee' | 'mla' | 'chicago' | 'harvard' | 'vancouver' | 'bibtex' | 'ris' | 'text';

export const CITATION_FORMATS: Array<{ key: CitationFormat; label: string }> = [
  { key: 'apa', label: 'APA 7' },
  { key: 'ieee', label: 'IEEE' },
  { key: 'mla', label: 'MLA 9' },
  { key: 'chicago', label: 'Chicago' },
  { key: 'harvard', label: 'Harvard' },
  { key: 'vancouver', label: 'Vancouver' },
  { key: 'bibtex', label: 'BibTeX' },
  { key: 'ris', label: 'RIS' },
  { key: 'text', label: 'Plain text' },
];

export interface CitationSource {
  type: string;
  title: string;
  subtitle?: string | null;
  authors: string[]; // "Given Family" full names, in order
  containerTitle?: string | null;
  volume?: string | null;
  issue?: string | null;
  pages?: string | null;
  publisher?: string | null;
  year?: number | null;
  month?: number | null;
  day?: number | null;
  doi?: string | null;
  url?: string | null;
  isbn?: string | null;
  issn?: string | null;
  arxivId?: string | null;
  citationKey?: string | null;
  accessedAt?: string | null;
}

export function formatCitation(format: CitationFormat, src: CitationSource): string {
  // Minimal fallback; the publications workstream replaces this with full implementations.
  const authors = src.authors.join(', ');
  const year = src.year ?? 'n.d.';
  const doi = src.doi ? ` https://doi.org/${src.doi}` : src.url ? ` ${src.url}` : '';
  if (format === 'bibtex') {
    const key = src.citationKey ?? 'zemi';
    return `@article{${key},\n  title = {${src.title}},\n  author = {${src.authors.join(' and ')}},\n  year = {${year}}\n}`;
  }
  return `${authors} (${year}). ${src.title}.${src.containerTitle ? ` ${src.containerTitle}.` : ''}${doi}`;
}
