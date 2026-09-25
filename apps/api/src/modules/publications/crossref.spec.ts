import { describe, expect, it } from 'vitest';
import { cleanAbstract, cleanInline, fetchCrossrefWork, mapCrossrefWork, parseDoiInput, type CrossrefWork } from './crossref.js';

// Trimmed from https://api.crossref.org/works/10.1038/nature14539 (2026-09-25).
const nature: CrossrefWork = {
  type: 'journal-article',
  title: ['Deep learning'],
  subtitle: [],
  'container-title': ['Nature'],
  volume: '521',
  issue: '7553',
  page: '436-444',
  publisher: 'Springer Science and Business Media LLC',
  issued: { 'date-parts': [[2015, 5, 27]] },
  ISSN: ['0028-0836', '1476-4687'],
  URL: 'https://doi.org/10.1038/nature14539',
  resource: { primary: { URL: 'https://www.nature.com/articles/nature14539' } },
  language: 'en',
  license: [{ URL: 'https://www.springer.com/tdm', 'content-version': 'tdm' }],
  author: [
    { given: 'Yann', family: 'LeCun', affiliation: [] },
    { given: 'Yoshua', family: 'Bengio', affiliation: [] },
    { given: 'Geoffrey', family: 'Hinton', affiliation: [] },
  ],
};

describe('parseDoiInput', () => {
  it('accepts bare DOIs, doi.org links, doi: prefixes and encoded input', () => {
    expect(parseDoiInput('10.1038/nature14539')).toBe('10.1038/nature14539');
    expect(parseDoiInput(' https://doi.org/10.1038/nature14539 ')).toBe('10.1038/nature14539');
    expect(parseDoiInput('http://dx.doi.org/10.1038/nature14539')).toBe('10.1038/nature14539');
    expect(parseDoiInput('doi:10.1038/nature14539')).toBe('10.1038/nature14539');
    expect(parseDoiInput('10.1038%2Fnature14539')).toBe('10.1038/nature14539');
  });
  it('rejects things that are not DOIs', () => {
    expect(parseDoiInput('hello')).toBeNull();
    expect(parseDoiInput('10.12/x')).toBeNull();
    expect(parseDoiInput('')).toBeNull();
    expect(parseDoiInput('https://example.org/10.1038/nature14539')).toBeNull();
  });
});

describe('mapCrossrefWork', () => {
  it('maps a journal article', () => {
    const r = mapCrossrefWork(nature, '10.1038/nature14539');
    expect(r).toMatchObject({
      type: 'journal-article',
      title: 'Deep learning',
      subtitle: null,
      containerTitle: 'Nature',
      volume: '521',
      issue: '7553',
      pages: '436-444',
      publisher: 'Springer Science and Business Media LLC',
      publishedYear: 2015,
      publishedMonth: 5,
      publishedDay: 27,
      doi: '10.1038/nature14539',
      issn: '0028-0836',
      isbn: null,
      url: 'https://www.nature.com/articles/nature14539',
      language: 'en',
      license: null,
      status: 'published',
    });
    expect(r.authorsRaw).toEqual([
      { fullName: 'Yann LeCun', organization: null, orcid: null },
      { fullName: 'Yoshua Bengio', organization: null, orcid: null },
      { fullName: 'Geoffrey Hinton', organization: null, orcid: null },
    ]);
    expect(r.authors?.[0]).toEqual({ speakerId: null, fullName: 'Yann LeCun', avatarAssetId: null, organization: null, url: null, isCorresponding: false });
  });

  it('maps types, organizations, ORCID, affiliations, CC licenses and falls back through dates', () => {
    const r = mapCrossrefWork(
      {
        type: 'proceedings-article',
        title: ['Graph <i>neural</i> nets &amp; floods'],
        event: { name: 'Zemi Conference 2026' },
        page: '10\u201318',
        issued: { 'date-parts': [[null]] },
        'published-online': { 'date-parts': [[2026, 13]] },
        license: [{ URL: 'http://creativecommons.org/licenses/by-nc/4.0/' }],
        author: [
          { name: 'MGM Laboratory' },
          { given: 'Rina', family: 'Pratiwi', ORCID: 'http://orcid.org/0000-0002-1825-0097', affiliation: [{ name: 'Universitas Brawijaya' }] },
          {},
        ],
      },
      '10.5555/x',
    );
    expect(r.type).toBe('conference-paper');
    expect(r.title).toBe('Graph neural nets & floods');
    expect(r.containerTitle).toBe('Zemi Conference 2026');
    expect(r.pages).toBe('10-18');
    expect(r.publishedYear).toBe(2026);
    expect(r.publishedMonth).toBeNull();
    expect(r.license).toBe('CC BY-NC 4.0');
    expect(r.authorsRaw).toEqual([
      { fullName: 'MGM Laboratory', organization: null, orcid: null },
      { fullName: 'Rina Pratiwi', organization: 'Universitas Brawijaya', orcid: '0000-0002-1825-0097' },
    ]);
    expect(r.authors?.[1]).toMatchObject({ url: 'https://orcid.org/0000-0002-1825-0097' });
    expect(mapCrossrefWork({ type: 'posted-content' }, '10.1/a').type).toBe('preprint');
    expect(mapCrossrefWork({ type: 'posted-content' }, '10.1/a').status).toBe('preprint');
    expect(mapCrossrefWork({ type: 'dissertation', institution: [{ name: 'Universitas Brawijaya' }], publisher: 'Repo' }, '10.1/a')).toMatchObject({
      type: 'thesis',
      publisher: 'Universitas Brawijaya',
    });
    expect(mapCrossrefWork({ type: 'monograph' }, '10.1/a').type).toBe('book');
    expect(mapCrossrefWork({ type: 'book-chapter' }, '10.1/a').type).toBe('book-chapter');
    expect(mapCrossrefWork({ type: 'report' }, '10.1/a').type).toBe('report');
    expect(mapCrossrefWork({ type: 'dataset' }, '10.1/a').type).toBe('dataset');
    expect(mapCrossrefWork({ type: 'peer-review' }, '10.1/a').type).toBe('other');
  });

  it('clamps long fields to the form limits', () => {
    const r = mapCrossrefWork({ type: 'journal-article', title: ['x'.repeat(500)], volume: '1'.repeat(60), ISSN: ['2'.repeat(50)] }, '10.1/a');
    expect(r.title).toHaveLength(400);
    expect(r.volume).toHaveLength(40);
    expect(r.issn).toHaveLength(40);
  });
});

describe('text cleanup', () => {
  it('strips JATS, keeps paragraphs, drops the Abstract heading and dashes', () => {
    const jats =
      '<jats:title>Abstract</jats:title><jats:p>Drones wait\u2014politely\u2014for people.</jats:p>\n<jats:p>Born 1914\u20131940 &amp; <jats:italic>still</jats:italic> flying.</jats:p>';
    expect(cleanAbstract(jats)).toBe('Drones wait - politely - for people.\n\nBorn 1914-1940 & still flying.');
    expect(cleanAbstract('<p>Abstract: short one.</p>')).toBe('short one.');
    expect(cleanInline('A <sub>2</sub> &#x3B1; test')).toBe('A 2 α test');
  });
});

describe('fetchCrossrefWork', () => {
  const fake = (status: number, body: string) =>
    (async () => new Response(body, { status, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;

  it('returns the message and sends our user agent', async () => {
    let seen: RequestInit | undefined;
    let url = '';
    const f = (async (u: string, init?: RequestInit) => {
      url = u;
      seen = init;
      return new Response(JSON.stringify({ status: 'ok', message: nature }), { status: 200 });
    }) as unknown as typeof fetch;
    await expect(fetchCrossrefWork('10.1038/nature14539', f)).resolves.toMatchObject({ title: ['Deep learning'] });
    expect(url).toBe('https://api.crossref.org/works/10.1038%2Fnature14539');
    expect((seen?.headers as Record<string, string>)['User-Agent']).toBe('Zemi (mailto:zemi@labmgm.org)');
  });

  it('maps 404, 5xx, bad JSON and timeouts to friendly errors', async () => {
    await expect(fetchCrossrefWork('10.1/x', fake(404, 'Resource not found.'))).rejects.toMatchObject({ status: 404 });
    await expect(fetchCrossrefWork('10.1/x', fake(503, 'down'))).rejects.toMatchObject({ status: 503 });
    await expect(fetchCrossrefWork('10.1/x', fake(200, 'not json'))).rejects.toMatchObject({ status: 503 });
    const timeout = (async () => {
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    }) as unknown as typeof fetch;
    await expect(fetchCrossrefWork('10.1/x', timeout)).rejects.toMatchObject({ status: 504 });
  });
});
