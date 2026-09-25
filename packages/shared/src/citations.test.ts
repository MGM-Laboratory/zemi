import { describe, expect, it } from 'vitest';
import {
  CITATION_FORMATS,
  citationFileName,
  formatAllCitations,
  formatCitation,
  inferThesisKind,
  makeCitationKey,
  normalizeDoi,
  parseCitationName,
  publicationToCitationSource,
  type CitationSource,
} from './citations.js';
import type { PublicationDetail } from './schemas/publications.js';

const journal: CitationSource = {
  type: 'journal-article',
  title: 'Deep learning',
  authors: ['Yann LeCun', 'Yoshua Bengio', 'Geoffrey Hinton'],
  containerTitle: 'Nature',
  volume: '521',
  issue: '7553',
  pages: '436\u2013444', // Crossref sometimes sends an en dash; output must not
  publisher: 'Springer Science and Business Media LLC',
  year: 2015,
  month: 5,
  day: 27,
  doi: 'https://doi.org/10.1038/nature14539',
  url: 'https://www.nature.com/articles/nature14539',
  issn: '0028-0836',
};

const conference: CitationSource = {
  type: 'conference-paper',
  title: 'Attention is all you need',
  authors: [
    'Ashish Vaswani',
    'Noam Shazeer',
    'Niki Parmar',
    'Jakob Uszkoreit',
    'Llion Jones',
    'Aidan N. Gomez',
    'Łukasz Kaiser',
    'Illia Polosukhin',
  ],
  containerTitle: 'Advances in Neural Information Processing Systems 30',
  pages: '5998-6008',
  publisher: 'Curran Associates',
  year: 2017,
  url: 'https://papers.nips.cc/paper/7181-attention-is-all-you-need',
};

const thesis: CitationSource = {
  type: 'thesis',
  title: 'Klasifikasi citra daun padi dengan CNN ringan',
  authors: ['Rina Ayu Pratiwi'],
  publisher: 'Universitas Brawijaya',
  year: 2024,
  url: 'https://repository.ub.ac.id/id/eprint/12345',
  thesisKind: 'masters',
};

const book: CitationSource = {
  type: 'book',
  title: 'Deep Learning',
  authors: ['Ian Goodfellow', 'Yoshua Bengio', 'Aaron Courville'],
  publisher: 'MIT Press',
  year: 2016,
  isbn: '9780262035613',
  url: 'https://www.deeplearningbook.org',
};

const software: CitationSource = {
  type: 'software',
  title: 'Zemi seminar platform',
  authors: ['{MGM Laboratory}'],
  volume: '1.2.0',
  publisher: 'GitHub',
  year: 2026,
  url: 'https://github.com/labmgm/zemi',
};

describe('names', () => {
  it('parses natural, inverted, particles, suffixes, honorifics and degrees', () => {
    expect(parseCitationName('Yann LeCun')).toMatchObject({ given: 'Yann', family: 'LeCun', literal: false });
    expect(parseCitationName('LeCun, Yann')).toMatchObject({ given: 'Yann', family: 'LeCun' });
    expect(parseCitationName('Jan van der Berg')).toMatchObject({ given: 'Jan', particle: 'van der', family: 'Berg' });
    expect(parseCitationName('van der Berg, Jan')).toMatchObject({ given: 'Jan', particle: 'van der', family: 'Berg' });
    expect(parseCitationName('Martin Luther King Jr.')).toMatchObject({ given: 'Martin Luther', family: 'King', suffix: 'Jr.' });
    expect(parseCitationName('Dr. Budi Santoso, M.Kom.')).toMatchObject({ given: 'Budi', family: 'Santoso' });
    expect(parseCitationName('Prof. Dr. Ir. Siti Aminah, S.T., M.T., Ph.D.')).toMatchObject({ given: 'Siti', family: 'Aminah' });
    expect(parseCitationName('Sukarno')).toMatchObject({ given: '', family: 'Sukarno', literal: false });
    expect(parseCitationName('MGM Laboratory')).toMatchObject({ family: 'MGM Laboratory', literal: true });
    expect(parseCitationName('{Tim Riset Zemi}')).toMatchObject({ family: 'Tim Riset Zemi', literal: true });
  });

  it('abbreviates hyphenated and initialled given names', () => {
    const src: CitationSource = { type: 'book', title: 'Being and nothingness', authors: ['Jean-Paul Sartre', 'J.R.R. Tolkien'], year: 1943 };
    expect(formatCitation('apa', src)).toBe('Sartre, J.-P., & Tolkien, J. R. R. (1943). Being and nothingness.');
    expect(formatCitation('vancouver', src)).toBe('Sartre JP, Tolkien JRR. Being and nothingness. 1943.');
  });

  it('never inverts single names', () => {
    const src: CitationSource = { type: 'article', title: 'Indonesia menggugat', authors: ['Sukarno'], year: 1930 };
    expect(formatCitation('apa', src)).toBe('Sukarno. (1930). Indonesia menggugat.');
    expect(formatCitation('ieee', src)).toBe('Sukarno, "Indonesia menggugat," 1930.');
    expect(formatCitation('bibtex', src)).toBe('@misc{sukarno1930indonesia,\n  author = {Sukarno},\n  title  = {Indonesia menggugat},\n  year   = {1930}\n}');
  });
});

describe('journal article with DOI', () => {
  it('APA 7', () => {
    expect(formatCitation('apa', journal)).toBe(
      'LeCun, Y., Bengio, Y., & Hinton, G. (2015). Deep learning. Nature, 521(7553), 436-444. https://doi.org/10.1038/nature14539',
    );
  });

  it('BibTeX', () => {
    expect(formatCitation('bibtex', journal)).toBe(
      [
        '@article{lecun2015deep,',
        '  author    = {LeCun, Yann and Bengio, Yoshua and Hinton, Geoffrey},',
        '  title     = {Deep learning},',
        '  journal   = {Nature},',
        '  year      = {2015},',
        '  month     = may,',
        '  volume    = {521},',
        '  number    = {7553},',
        '  pages     = {436--444},',
        '  publisher = {Springer Science and Business Media LLC},',
        '  issn      = {0028-0836},',
        '  doi       = {10.1038/nature14539},',
        '  url       = {https://www.nature.com/articles/nature14539}',
        '}',
      ].join('\n'),
    );
  });

  it('IEEE, MLA, Chicago, Harvard, Vancouver, text', () => {
    expect(formatCitation('ieee', journal)).toBe(
      'Y. LeCun, Y. Bengio, and G. Hinton, "Deep learning," Nature, vol. 521, no. 7553, pp. 436-444, May 2015, doi: 10.1038/nature14539.',
    );
    expect(formatCitation('mla', journal)).toBe(
      'LeCun, Yann, et al. "Deep learning." Nature, vol. 521, no. 7553, 27 May 2015, pp. 436-44, https://doi.org/10.1038/nature14539.',
    );
    expect(formatCitation('chicago', journal)).toBe(
      'LeCun, Yann, Yoshua Bengio, and Geoffrey Hinton. 2015. "Deep learning." Nature 521 (7553): 436-444. https://doi.org/10.1038/nature14539.',
    );
    expect(formatCitation('harvard', journal)).toBe(
      "LeCun, Y., Bengio, Y. and Hinton, G. (2015) 'Deep learning', Nature, 521(7553), pp. 436-444. Available at: https://doi.org/10.1038/nature14539.",
    );
    expect(formatCitation('vancouver', journal)).toBe(
      'LeCun Y, Bengio Y, Hinton G. Deep learning. Nature. 2015 May 27;521(7553):436-44. doi:10.1038/nature14539',
    );
    expect(formatCitation('text', journal)).toBe(
      'Yann LeCun, Yoshua Bengio, and Geoffrey Hinton. 2015. Deep learning. Nature 521(7553), 436-444. https://doi.org/10.1038/nature14539',
    );
  });

  it('RIS', () => {
    expect(formatCitation('ris', journal)).toBe(
      [
        'TY  - JOUR',
        'AU  - LeCun, Yann',
        'AU  - Bengio, Yoshua',
        'AU  - Hinton, Geoffrey',
        'TI  - Deep learning',
        'T2  - Nature',
        'PY  - 2015',
        'DA  - 2015/05/27/',
        'VL  - 521',
        'IS  - 7553',
        'SP  - 436',
        'EP  - 444',
        'PB  - Springer Science and Business Media LLC',
        'SN  - 0028-0836',
        'DO  - 10.1038/nature14539',
        'UR  - https://www.nature.com/articles/nature14539',
        'ER  - ',
        '',
      ].join('\r\n'),
    );
  });
});

describe('conference paper with 8 authors', () => {
  it('APA lists everyone, IEEE and Vancouver switch to et al.', () => {
    expect(formatCitation('apa', conference)).toBe(
      'Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., Kaiser, Ł., & Polosukhin, I. (2017). Attention is all you need. In Advances in Neural Information Processing Systems 30 (pp. 5998-6008). Curran Associates. https://papers.nips.cc/paper/7181-attention-is-all-you-need',
    );
    expect(formatCitation('ieee', conference)).toBe(
      'A. Vaswani et al., "Attention is all you need," in Advances in Neural Information Processing Systems 30, 2017, pp. 5998-6008. [Online]. Available: https://papers.nips.cc/paper/7181-attention-is-all-you-need',
    );
    expect(formatCitation('vancouver', conference)).toBe(
      'Vaswani A, Shazeer N, Parmar N, Uszkoreit J, Jones L, Gomez AN, et al. Attention is all you need. In: Advances in Neural Information Processing Systems 30. Curran Associates; 2017. p. 5998-6008. Available from: https://papers.nips.cc/paper/7181-attention-is-all-you-need',
    );
    expect(formatCitation('mla', conference)).toBe(
      'Vaswani, Ashish, et al. "Attention is all you need." Advances in Neural Information Processing Systems 30, Curran Associates, 2017, pp. 5998-6008, papers.nips.cc/paper/7181-attention-is-all-you-need.',
    );
    expect(formatCitation('harvard', conference)).toBe(
      "Vaswani, A. et al. (2017) 'Attention is all you need', in Advances in Neural Information Processing Systems 30. Curran Associates, pp. 5998-6008. Available at: https://papers.nips.cc/paper/7181-attention-is-all-you-need.",
    );
  });

  it('BibTeX uses inproceedings with booktitle', () => {
    expect(formatCitation('bibtex', conference)).toBe(
      [
        '@inproceedings{vaswani2017attention,',
        '  author    = {Vaswani, Ashish and Shazeer, Noam and Parmar, Niki and Uszkoreit, Jakob and Jones, Llion and Gomez, Aidan N. and Kaiser, Łukasz and Polosukhin, Illia},',
        '  title     = {Attention is all you need},',
        '  booktitle = {Advances in Neural Information Processing Systems 30},',
        '  year      = {2017},',
        '  pages     = {5998--6008},',
        '  publisher = {Curran Associates},',
        '  url       = {https://papers.nips.cc/paper/7181-attention-is-all-you-need}',
        '}',
      ].join('\n'),
    );
    expect(formatCitation('ris', conference).split('\r\n')[0]).toBe('TY  - CONF');
  });
});

describe('thesis', () => {
  it('APA and BibTeX for a master thesis', () => {
    expect(formatCitation('apa', thesis)).toBe(
      "Pratiwi, R. A. (2024). Klasifikasi citra daun padi dengan CNN ringan [Master's thesis, Universitas Brawijaya]. https://repository.ub.ac.id/id/eprint/12345",
    );
    expect(formatCitation('bibtex', thesis)).toBe(
      [
        '@mastersthesis{pratiwi2024klasifikasi,',
        '  author = {Pratiwi, Rina Ayu},',
        '  title  = {Klasifikasi citra daun padi dengan {CNN} ringan},',
        '  school = {Universitas Brawijaya},',
        '  year   = {2024},',
        '  url    = {https://repository.ub.ac.id/id/eprint/12345}',
        '}',
      ].join('\n'),
    );
    expect(formatCitation('ieee', thesis)).toBe(
      'R. A. Pratiwi, "Klasifikasi citra daun padi dengan CNN ringan," M.S. thesis, Universitas Brawijaya, 2024. [Online]. Available: https://repository.ub.ac.id/id/eprint/12345',
    );
    expect(formatCitation('mla', thesis)).toBe(
      "Pratiwi, Rina Ayu. Klasifikasi citra daun padi dengan CNN ringan. 2024. Universitas Brawijaya, Master's thesis. repository.ub.ac.id/id/eprint/12345.",
    );
    expect(formatCitation('ris', thesis)).toContain('TY  - THES\r\n');
    expect(formatCitation('ris', thesis)).toContain("M3  - Master's thesis\r\n");
  });

  it('defaults to doctoral and uses phdthesis', () => {
    const phd = { ...thesis, thesisKind: null };
    expect(formatCitation('apa', phd)).toContain('[Doctoral dissertation, Universitas Brawijaya]');
    expect(formatCitation('bibtex', phd).startsWith('@phdthesis{pratiwi2024klasifikasi,')).toBe(true);
    expect(formatCitation('vancouver', phd)).toBe(
      'Pratiwi RA. Klasifikasi citra daun padi dengan CNN ringan [dissertation]. Universitas Brawijaya; 2024. Available from: https://repository.ub.ac.id/id/eprint/12345',
    );
  });

  it('guesses the degree from nearby words', () => {
    expect(inferThesisKind(['Tesis Magister Ilmu Komputer'])).toBe('masters');
    expect(inferThesisKind(['Disertasi Doktor'])).toBe('phd');
    expect(inferThesisKind(['Skripsi'])).toBe('bachelors');
    expect(inferThesisKind(['Universitas Brawijaya'])).toBeNull();
  });
});

describe('book', () => {
  it('APA and BibTeX', () => {
    expect(formatCitation('apa', book)).toBe(
      'Goodfellow, I., Bengio, Y., & Courville, A. (2016). Deep Learning. MIT Press. https://www.deeplearningbook.org',
    );
    expect(formatCitation('bibtex', book)).toBe(
      [
        '@book{goodfellow2016deep,',
        '  author    = {Goodfellow, Ian and Bengio, Yoshua and Courville, Aaron},',
        '  title     = {Deep Learning},',
        '  year      = {2016},',
        '  publisher = {MIT Press},',
        '  isbn      = {9780262035613},',
        '  url       = {https://www.deeplearningbook.org}',
        '}',
      ].join('\n'),
    );
    expect(formatCitation('ieee', book)).toBe(
      'I. Goodfellow, Y. Bengio, and A. Courville, Deep Learning. MIT Press, 2016. [Online]. Available: https://www.deeplearningbook.org',
    );
    expect(formatCitation('chicago', book)).toBe(
      'Goodfellow, Ian, Yoshua Bengio, and Aaron Courville. 2016. Deep Learning. MIT Press. https://www.deeplearningbook.org.',
    );
    expect(formatCitation('ris', book)).toContain('SN  - 9780262035613\r\n');
  });
});

describe('software', () => {
  it('APA and BibTeX with an organization author', () => {
    expect(formatCitation('apa', software)).toBe(
      'MGM Laboratory. (2026). Zemi seminar platform (Version 1.2.0) [Computer software]. GitHub. https://github.com/labmgm/zemi',
    );
    expect(formatCitation('bibtex', software)).toBe(
      [
        '@software{mgm2026zemi,',
        '  author    = {{MGM Laboratory}},',
        '  title     = {Zemi seminar platform},',
        '  year      = {2026},',
        '  version   = {1.2.0},',
        '  publisher = {GitHub},',
        '  url       = {https://github.com/labmgm/zemi}',
        '}',
      ].join('\n'),
    );
    expect(formatCitation('ris', software)).toContain('TY  - COMP\r\nAU  - MGM Laboratory\r\n');
    expect(formatCitation('ris', software)).toContain('ET  - 1.2.0\r\n');
  });
});

describe('edge cases', () => {
  it('APA: two authors, 21+ authors, no authors, no year, in press', () => {
    const two: CitationSource = { type: 'journal-article', title: 'A', authors: ['Ada Lovelace', 'Charles Babbage'], containerTitle: 'J', year: 1843 };
    expect(formatCitation('apa', two)).toBe('Lovelace, A., & Babbage, C. (1843). A. J.');
    const many = Array.from({ length: 22 }, (_, i) => `Person${String.fromCharCode(65 + i)} Author${String.fromCharCode(65 + i)}`);
    const apa = formatCitation('apa', { type: 'report', title: 'Big team', authors: many, year: 2020 });
    expect(apa.startsWith('AuthorA, P., AuthorB, P.,')).toBe(true);
    expect(apa).toContain('AuthorS, P., . . . AuthorV, P. (2020). Big team.');
    expect(apa).not.toContain('AuthorT');
    expect(formatCitation('apa', { type: 'other', title: 'Nobody wrote this', authors: [], year: 2021, publisher: 'Zemi' })).toBe(
      'Nobody wrote this. (2021). Zemi.',
    );
    expect(formatCitation('apa', { type: 'journal-article', title: 'Soon', authors: ['Rina Pratiwi'], status: 'in-press' })).toBe(
      'Pratiwi, R. (in press). Soon.',
    );
    expect(formatCitation('chicago', { type: 'book', title: 'Undated', authors: ['Rina Pratiwi'] })).toBe('Pratiwi, Rina. n.d. Undated.');
  });

  it('MLA with two authors, IEEE with seven', () => {
    const two: CitationSource = { type: 'book', title: 'Pair', authors: ['Ada Lovelace', 'Charles Babbage'], publisher: 'P', year: 1843 };
    expect(formatCitation('mla', two)).toBe('Lovelace, Ada, and Charles Babbage. Pair. P, 1843.');
    expect(formatCitation('ieee', two)).toBe('A. Lovelace and C. Babbage, Pair. P, 1843.');
    expect(formatCitation('text', two)).toBe('Ada Lovelace and Charles Babbage. 1843. Pair. P.');
    const seven = ['A One', 'B Two', 'C Three', 'D Four', 'E Five', 'F Six', 'G Seven'];
    expect(formatCitation('ieee', { type: 'book', title: 'T', authors: seven, year: 2000 })).toBe('A. One et al., T. 2000.');
    expect(formatCitation('ieee', { type: 'book', title: 'T', authors: seven.slice(0, 6), year: 2000 })).toBe(
      'A. One, B. Two, C. Three, D. Four, E. Five, and F. Six, T. 2000.',
    );
  });

  it('escapes BibTeX specials and protects acronyms', () => {
    const src: CitationSource = { type: 'report', title: 'R&D at 100% for C_1 {fun} #1 ~ok^ via GPU', authors: ['Ana O\'Neil'], year: 2022, publisher: 'Lab & Co' };
    const bib = formatCitation('bibtex', src);
    expect(bib).toContain('title       = {{R\\&D} at 100\\% for C\\_1 \\{fun\\} \\#1 \\textasciitilde{}ok\\textasciicircum{} via {GPU}},');
    expect(bib).toContain('institution = {Lab \\& Co}');
    expect(bib.startsWith('@techreport{oneil2022rd,')).toBe(true);
  });

  it('preprint with arXiv id', () => {
    const src: CitationSource = { type: 'preprint', title: 'Very deep convolutional networks', authors: ['Karen Simonyan', 'Andrew Zisserman'], year: 2014, arxivId: 'arXiv:1409.1556' };
    expect(formatCitation('apa', src)).toBe(
      'Simonyan, K., & Zisserman, A. (2014). Very deep convolutional networks. arXiv. https://arxiv.org/abs/1409.1556',
    );
    const bib = formatCitation('bibtex', src);
    expect(bib).toContain('eprint        = {1409.1556}');
    expect(bib).toContain('archiveprefix = {arXiv}');
    expect(bib.startsWith('@misc{simonyan2014very,')).toBe(true);
  });

  it('Harvard adds the access date for URL-only works', () => {
    const src: CitationSource = { type: 'article', title: 'Friday notes', authors: ['Rina Pratiwi'], containerTitle: 'Zemi blog', year: 2026, month: 9, day: 25, url: 'https://zemi.labmgm.org/notes', accessedAt: '2026-09-26' };
    expect(formatCitation('harvard', src)).toBe(
      "Pratiwi, R. (2026) 'Friday notes', Zemi blog, 25 September. Available at: https://zemi.labmgm.org/notes (Accessed: 26 September 2026).",
    );
    expect(formatCitation('apa', src)).toBe('Pratiwi, R. (2026, September 25). Friday notes. Zemi blog. https://zemi.labmgm.org/notes');
  });

  it('never outputs en or em dashes', () => {
    for (const src of [journal, conference, thesis, book, software]) {
      for (const { key } of CITATION_FORMATS) {
        expect(formatCitation(key, src)).not.toMatch(/[\u2013\u2014]/);
      }
    }
  });
});

describe('helpers', () => {
  it('makes keys, file names and normalizes DOIs', () => {
    expect(makeCitationKey(journal)).toBe('lecun2015deep');
    expect(makeCitationKey({ authors: ['Jan van der Berg'], year: null, title: 'On the Álgebra of things' })).toBe('berg' + 'nd' + 'algebra');
    expect(makeCitationKey({ authors: [], year: 2020, title: 'Sebuah studi' })).toBe('anon2020studi');
    expect(citationFileName('bibtex', journal)).toBe('lecun2015deep.bib');
    expect(citationFileName('ris', { ...journal, citationKey: 'my:key' })).toBe('my-key.ris');
    expect(citationFileName('apa', journal)).toBe('lecun2015deep.txt');
    expect(normalizeDoi(' doi:10.1000/XYZ ')).toBe('10.1000/XYZ');
    expect(normalizeDoi('https://dx.doi.org/10.1000/abc')).toBe('10.1000/abc');
    expect(Object.keys(formatAllCitations(book))).toEqual(CITATION_FORMATS.map((f) => f.key));
  });

  it('maps a PublicationDetail', () => {
    const detail = {
      id: 'p1',
      slug: 'deep-learning',
      type: 'thesis',
      title: 'Lightweight CNNs',
      subtitle: null,
      containerTitle: null,
      publishedYear: 2025,
      status: 'published',
      cover: null,
      authors: [{ fullName: 'Rina Pratiwi', avatar: null, speakerSlug: 'rina' }],
      keywords: ['cnn'],
      doi: null,
      hasPdf: false,
      abstract: 'Short.',
      body: [],
      volume: null,
      issue: null,
      pages: null,
      publisher: 'Universitas Brawijaya',
      publishedMonth: null,
      publishedDay: null,
      isbn: null,
      issn: null,
      arxivId: null,
      url: null,
      links: [{ kind: 'publisher', label: 'Link', url: 'https://example.org/thesis' }],
      language: 'en',
      license: null,
      citationKey: null,
      pdf: null,
      authorsFull: [
        { id: 'a1', speaker: null, fullName: 'Rina Pratiwi', avatar: null, organization: null, url: null, isCorresponding: true },
      ],
      events: [],
      updatedAt: '2026-09-25T00:00:00.000Z',
    } satisfies PublicationDetail;
    const src = publicationToCitationSource({ ...detail, keywords: ['tesis magister'] });
    expect(src).toMatchObject({ authors: ['Rina Pratiwi'], year: 2025, url: 'https://example.org/thesis', thesisKind: 'masters' });
    expect(publicationToCitationSource({ ...detail, links: [] }, { fallbackUrl: 'https://zemi.labmgm.org/publications/x' }).url).toBe(
      'https://zemi.labmgm.org/publications/x',
    );
    expect(formatCitation('apa', src)).toBe(
      "Pratiwi, R. (2025). Lightweight CNNs [Master's thesis, Universitas Brawijaya]. https://example.org/thesis",
    );
  });
});
