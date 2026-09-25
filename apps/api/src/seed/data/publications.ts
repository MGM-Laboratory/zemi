import type { PublicationLinkKind, PublicationStatus, PublicationType } from '@zemi/shared';
import type { Area } from './speakers.js';

/** Authors who are not in the speaker directory. `portrait` points into seed/assets/authors. */
export interface ManualAuthorSeed {
  key: string;
  fullName: string;
  organization: string;
  url?: string;
  portrait?: string;
}

export const MANUAL_AUTHORS: ManualAuthorSeed[] = [
  { key: 'siti', fullName: 'Siti Aminah', organization: 'Faculty of Computer Science, a university in East Java, Indonesia', portrait: 'authors/author-01.jpg' },
  { key: 'andreas', fullName: 'Andreas Wijaya', organization: 'Faculty of Computer Science, a university in East Java, Indonesia', portrait: 'authors/author-02.jpg' },
  { key: 'intan', fullName: 'Intan Permatasari', organization: 'Department of Visual Communication Design, Indonesia', portrait: 'authors/author-03.jpg' },
  { key: 'hendra', fullName: 'Hendra Gunawan', organization: 'Faculty of Computer Science, a university in East Java, Indonesia', portrait: 'authors/author-04.jpg' },
  { key: 'maya', fullName: 'Maya Kusumawardani', organization: 'Faculty of Computer Science, a university in East Java, Indonesia', portrait: 'authors/author-05.jpg' },
  { key: 'yoga', fullName: 'Yoga Firmansyah', organization: 'Coastal Research Group, Indonesia', portrait: 'authors/author-06.jpg' },
  { key: 'hartono', fullName: 'Hartono Wicaksono', organization: 'MGM Laboratory', url: 'https://labmgm.org', portrait: 'authors/author-08.jpg' },
  { key: 'retno', fullName: 'Retno Wahyuningsih', organization: 'Universitas Indonesia' },
  { key: 'hiroshi', fullName: 'Hiroshi Nakamura', organization: 'Kyoto University' },
  { key: 'emma', fullName: 'Emma Jansen', organization: 'TU Delft' },
  { key: 'minjun', fullName: 'Lee Min-jun', organization: 'KAIST' },
  { key: 'priya', fullName: 'Priya Raman', organization: 'National University of Singapore' },
  { key: 'sri', fullName: 'Sri Rahayu', organization: 'BRIN' },
  { key: 'rudi', fullName: 'Rudi Hartanto', organization: 'Institut Teknologi Sepuluh Nopember' },
  { key: 'wulan', fullName: 'Wulan Sari', organization: 'Universitas Gadjah Mada' },
];

export type AbstractParts = { we: string; detail?: string; result: string };

export interface PubSeed {
  key: string;
  type: PublicationType;
  title: string;
  subtitle?: string;
  area: Area;
  year: number;
  month?: number;
  day?: number;
  status: PublicationStatus;
  container?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  publisher?: string;
  isbn?: string;
  issn?: string;
  arxiv?: string;
  lang?: 'en' | 'id';
  license?: string;
  keywords: string[];
  /** Speaker keys, or `m:<manual key>`. A trailing `*` marks the corresponding author. */
  authors: string[];
  /** Full text (used as is) or parts that get wrapped with context sentences. */
  abstract: string | AbstractParts;
  /** Manifest PDF id (seed/assets/pdfs). */
  pdf?: string;
  /** Manifest pub cover id (seed/assets/pub-covers). */
  cover?: string;
  links?: PublicationLinkKind[];
  body?: 'project' | 'software' | 'dataset' | 'article' | 'book';
  visibility?: 'draft' | 'unlisted';
}

/* Manifest abstracts are 70 to 110 words. These extensions bring them past 150 while matching the PDFs. */
const FLOOD =
  'Flash floods in dense tropical cities rise and fall within an hour, which is faster than most hydrological models can be recalibrated. We model the drainage network of a mid-sized Indonesian city as a graph of 4,812 street segments and train a spatio-temporal graph neural network on three rainy seasons of gauge, radar and crowd-reported inundation data. The model predicts water depth per segment 30 to 90 minutes ahead. On a held-out season it reduces mean absolute error by 23 percent compared with a gridded convolutional baseline and flags 81 percent of the flooded segments at least 45 minutes in advance. We release the graph construction code and an anonymized benchmark. ' +
  'Crowd reports turn out to matter most at the edges of the radar footprint, where they recover a third of the missed events. We discuss how the graph can be rebuilt when roads or drains change, and why segment-level forecasts are easier for city operators to act on than gridded maps.';

const ASR =
  'Everyday conversations in East Java mix Javanese and Indonesian inside a single sentence. Commercial recognizers handle Indonesian well but stumble on Javanese words and on the switches. We collect 140 hours of consented, transcribed conversational speech and distill a large multilingual model into a 38 million parameter student that runs in real time on a mid-range phone. The student reaches a 17.8 percent word error rate on code-switched test speech, within 2.1 points of its teacher, and uses a quarter of the memory. ' +
  'Most of the remaining errors sit on Javanese function words and on speech recorded in noisy places such as markets and food stalls. We describe the consent and compensation process for speakers, report results separately for each speech register, and show that a small amount of in-domain data is worth more than a much larger generic corpus. The model and a documented subset of the data are available for research.';

const MANGROVE =
  'Mangrove maps are usually drawn by hand every few years, while coastlines change every season. We train a segmentation model on Sentinel-2 imagery using weak labels from outdated national maps and a small set of 320 carefully checked tiles. A noise-aware loss and seasonal compositing push the F1 score from 0.71 to 0.86 on an independent field survey. The resulting maps show 3.4 percent net canopy loss across the study coast over four years, concentrated around new aquaculture ponds. ' +
  'We examine where the weak labels mislead the model, most often at young restoration sites that the old maps never recorded, and show that a few hundred checked tiles correct most of that bias. The pipeline runs on free imagery and a single GPU, so local agencies can update their maps every season instead of every few years. Code and the checked tiles are shared with the paper.';

const FEDERATED =
  'Small clinics collect valuable data but cannot share it, and each one alone is too small to train a reliable model. We simulate a federation of 24 clinics using de-identified screening records and compare federated averaging, a personalized variant and local training for predicting missed follow-up visits. The personalized federation reaches an AUROC of 0.83, close to a centralized upper bound of 0.85, while the median clinic training alone reaches only 0.71. ' +
  'The gains are largest for the smallest clinics and for clinics whose patients differ most from the average, which are exactly the places that benefit least from a single shared model. We also measure communication cost, the effect of clinics dropping out of training rounds, and how much a simple calibration step helps before predictions reach health workers. The thesis closes with practical guidance for health offices that want to try this with real clinics.';

const BATIK =
  'Batik patterns follow rules: repeating motifs, isen fillers and borders that artisans combine with care. Generic image generators ignore these rules and produce patterns that look right from far away and wrong up close. We condition a diffusion model on a motif layout sketch and a filler vocabulary, trained on 2,300 photographed cloths documented with their makers. In a study with 11 artisans, generated drafts were rated useful as starting points in 64 percent of sessions. ' +
  'Artisans used the drafts mostly to explore unfamiliar combinations and rejected them when fillers crossed motif boundaries, a failure we trace to low-resolution layout sketches. Every cloth in the training data is credited to its maker, and artisans decided which of their motifs could be used at all. We discuss what co-creation with generative tools should and should not look like for living cultural traditions.';

const TRAFFIC =
  'Traffic signal controllers are usually tuned for cars in neat lanes, while many Indonesian intersections are dominated by motorcycles that fill every gap. We extend a microscopic simulator with sub-lane motorcycle behavior calibrated from drone video and train cooperative signal agents on a 12 intersection corridor. Compared with the fixed-time plan in use, the learned controllers cut average delay by 19 percent and queue spillback events by 41 percent in simulation. ' +
  'The improvement holds across weekday and weekend demand, but shrinks when motorcycle shares are misestimated, which makes careful calibration the most important step. We describe how drone footage was turned into trajectories, how agents share information with their neighbors, and which parts of the controller could be deployed on existing signal hardware. The simulator extension is released as open source.';

export const PUBLICATIONS: PubSeed[] = [
  /* ----------------------------------------------------------- family: floods */
  {
    key: 'flood-journal', type: 'journal-article', area: 'sus', year: 2026, month: 3, day: 12, status: 'published',
    title: 'Graph Neural Networks for Street-Level Flood Forecasting in Dense Tropical Cities',
    container: 'Journal of Urban Computing', volume: '12', issue: '2', pages: '145-168', issn: '2950-1142', publisher: 'Urban Computing Society',
    keywords: ['flood forecasting', 'graph neural networks', 'urban drainage', 'rainfall nowcasting'],
    authors: ['nadia*', 'bagus', 'm:siti', 'm:hartono'], abstract: FLOOD, pdf: 'paper-01-flood-gnn', cover: 'pub-cover-02', links: ['code', 'dataset', 'slides'], license: 'CC BY 4.0',
  },
  {
    key: 'flood-preprint', type: 'preprint', area: 'sus', year: 2025, month: 7, day: 8, status: 'preprint',
    title: 'Graph Neural Networks for Street-Level Flood Forecasting in Dense Tropical Cities', subtitle: 'Preprint version',
    container: 'arXiv preprint', arxiv: '2507.04418',
    keywords: ['flood forecasting', 'graph neural networks', 'urban drainage'],
    authors: ['nadia*', 'bagus', 'm:siti', 'm:hartono'], abstract: FLOOD, pdf: 'paper-01-flood-gnn', links: ['code'], license: 'CC BY 4.0',
  },
  {
    key: 'flood-dataset', type: 'dataset', area: 'sus', year: 2026, month: 4, day: 2, status: 'published',
    title: 'StreetFlood: A Street-Segment Benchmark for Flash Flood Forecasting',
    container: 'Zenodo', publisher: 'MGM Laboratory',
    keywords: ['benchmark', 'flood forecasting', 'crowdsourcing', 'open data'],
    authors: ['nadia*', 'bagus', 'm:siti'],
    abstract: {
      we: 'We release StreetFlood, a benchmark of three rainy seasons of water depth observations for 4,812 street segments in a mid-sized Indonesian city, combined with rain gauge, weather radar and crowd-reported inundation data.',
      detail: 'Every segment comes with its drainage connections, elevation and land use, and every crowd report was checked against photos or a second report before inclusion.',
      result: 'We define standard splits by season, reference baselines from persistence to graph neural networks, and evaluation code that scores both depth error and early warning lead time.',
    },
    pdf: 'paper-01-flood-gnn', cover: 'pub-cover-14', links: ['dataset', 'code'], license: 'CC BY 4.0',
  },
  {
    key: 'flood-poster', type: 'poster', area: 'sus', year: 2025, month: 11, day: 20, status: 'published',
    title: 'Forecasting Flash Floods Street by Street',
    container: 'Indonesian Symposium on Urban Informatics',
    keywords: ['flood forecasting', 'graph neural networks', 'poster'],
    authors: ['nadia*', 'bagus'],
    abstract: {
      we: 'This poster summarizes our street-level flood forecasting work for city operators rather than machine learning researchers, with the drainage graph, the forecast horizon and the warning thresholds front and center.',
      detail: 'It walks through three storms from the held-out season and shows, segment by segment, when the model raised a warning and when water actually arrived.',
      result: 'Forecasts flagged most flooded segments at least 45 minutes ahead, and operators in a small feedback session preferred segment-level warnings over gridded maps by a wide margin.',
    },
    pdf: 'paper-01-flood-gnn',
  },

  /* ----------------------------------------------------------- family: speech */
  {
    key: 'asr-conf', type: 'conference-paper', area: 'nlp', year: 2025, month: 6, day: 14, status: 'published',
    title: 'Small but Mighty: Code-Switched Javanese and Indonesian Speech Recognition on a Phone',
    container: 'Workshop on Low-Resource Speech', pages: '88-97', publisher: 'Low-Resource Speech Workshop',
    keywords: ['speech recognition', 'code-switching', 'Javanese', 'on-device models', 'distillation'],
    authors: ['rizky*', 'dewi', 'm:andreas', 'fitri'], abstract: ASR, pdf: 'paper-02-javanese-asr', cover: 'pub-cover-15', links: ['code', 'slides'], license: 'CC BY 4.0',
  },
  {
    key: 'asr-preprint', type: 'preprint', area: 'nlp', year: 2025, month: 3, day: 18, status: 'preprint',
    title: 'Small but Mighty: Code-Switched Javanese and Indonesian Speech Recognition on a Phone', subtitle: 'Preprint version',
    container: 'arXiv preprint', arxiv: '2503.11872',
    keywords: ['speech recognition', 'code-switching', 'Javanese'],
    authors: ['rizky*', 'dewi', 'm:andreas', 'fitri'], abstract: ASR, pdf: 'paper-02-javanese-asr', links: ['code'], license: 'CC BY 4.0',
  },
  {
    key: 'asr-dataset', type: 'dataset', area: 'nlp', year: 2025, month: 9, day: 1, status: 'published',
    title: 'TuturJawa: 140 Hours of Consented Code-Switched Javanese and Indonesian Speech',
    container: 'Zenodo', publisher: 'MGM Laboratory',
    keywords: ['speech corpus', 'Javanese', 'code-switching', 'consent'],
    authors: ['fitri*', 'dewi', 'rizky'],
    abstract: {
      we: 'TuturJawa is a corpus of 140 hours of conversational speech from 212 speakers in East Java, recorded with informed consent and transcribed at the word level with language tags for every token.',
      detail: 'Recordings cover homes, offices, markets and food stalls, and each speaker chose which of their recordings could be shared publicly and which stay available only to vetted researchers.',
      result: 'We provide train, development and test splits balanced by speaker, region and register, along with the transcription guidelines, a data statement and the baseline models used in our recognition experiments.',
    },
    pdf: 'paper-02-javanese-asr', cover: 'pub-cover-07', links: ['dataset'], license: 'CC BY-NC 4.0',
  },
  {
    key: 'asr-report', type: 'report', area: 'nlp', year: 2025, month: 8, day: 5, status: 'published',
    title: 'Consent First: A Data Statement and Collection Protocol for Conversational Speech',
    container: 'MGM Laboratory Technical Report', issue: 'TR-2025-03', publisher: 'MGM Laboratory',
    keywords: ['data statements', 'research ethics', 'speech data', 'consent'],
    authors: ['fitri*', 'dewi', 'm:hartono'],
    abstract: {
      we: 'This report documents how we recruited, compensated and recorded speakers for a code-switched speech corpus, including the consent forms in three languages and the procedure for withdrawing recordings later.',
      detail: 'We describe the problems we ran into, such as consent fatigue in long sessions and bystanders talking in public places, and the changes we made to the protocol because of them.',
      result: 'The report includes a complete data statement, templates other groups can adapt, and a checklist we now use before any new recording campaign starts.',
    },
    pdf: 'paper-02-javanese-asr', license: 'CC BY 4.0',
  },

  /* ----------------------------------------------------------- family: mangroves */
  {
    key: 'mangrove-journal', type: 'journal-article', area: 'cv', year: 2025, month: 10, day: 3, status: 'published',
    title: 'Counting Mangroves from Space: Weakly Supervised Canopy Mapping with Sentinel-2',
    container: 'Remote Sensing Letters', volume: '16', issue: '10', pages: '1021-1033', issn: '2150-7058',
    keywords: ['mangroves', 'Sentinel-2', 'weak supervision', 'semantic segmentation', 'coastal monitoring'],
    authors: ['ayu*', 'm:yoga', 'm:hartono'], abstract: MANGROVE, pdf: 'paper-03-mangrove', cover: 'pub-cover-03', links: ['code'], license: 'CC BY 4.0',
  },
  {
    key: 'mangrove-preprint', type: 'preprint', area: 'cv', year: 2024, month: 12, day: 9, status: 'preprint',
    title: 'Counting Mangroves from Space: Weakly Supervised Canopy Mapping with Sentinel-2', subtitle: 'Preprint version',
    container: 'arXiv preprint', arxiv: '2412.06653',
    keywords: ['mangroves', 'Sentinel-2', 'weak supervision'],
    authors: ['ayu*', 'm:yoga', 'm:hartono'], abstract: MANGROVE, pdf: 'paper-03-mangrove', links: ['code'],
  },
  {
    key: 'mangrove-poster', type: 'poster', area: 'cv', year: 2025, month: 2, day: 22, status: 'published',
    title: 'Weak Labels, Real Mangroves',
    container: 'Indonesian Remote Sensing Symposium',
    keywords: ['mangroves', 'remote sensing', 'poster'],
    authors: ['ayu*', 'm:yoga'],
    abstract: {
      we: 'This poster presents early results of mapping mangrove canopy along the north coast of Java from Sentinel-2 imagery, trained on outdated national maps instead of fresh hand labels.',
      detail: 'It compares three ways of dealing with noisy labels and shows seasonal composites side by side with field photos from the same locations.',
      result: 'Even with labels several years old, a noise-aware loss and a few hundred checked tiles produced maps that matched the field survey far better than the original national map.',
    },
    pdf: 'paper-03-mangrove',
  },

  /* ----------------------------------------------------------- family: federated clinics */
  {
    key: 'fed-thesis', type: 'thesis', area: 'ml', year: 2026, status: 'in-progress',
    title: 'Federated Learning for Rural Clinics: Training Together Without Sharing Patient Records',
    container: "Master's thesis, Informatics", publisher: 'MGM Laboratory',
    keywords: ['federated learning', 'healthcare', 'privacy', 'non-IID data', 'tabular models'],
    authors: ['fadli*', 'ratna', 'm:hendra'], abstract: FEDERATED, pdf: 'paper-04-federated-clinics', cover: 'pub-cover-16',
  },
  {
    key: 'fed-conf', type: 'conference-paper', area: 'ml', year: 2025, month: 11, day: 6, status: 'published',
    title: 'Personalized Federated Learning for Missed Follow-Up Prediction Across 24 Clinics',
    container: 'International Conference on Health Informatics and AI', pages: '211-219',
    keywords: ['federated learning', 'personalization', 'healthcare'],
    authors: ['fadli*', 'ratna', 'm:hendra'], abstract: FEDERATED, pdf: 'paper-04-federated-clinics', links: ['slides'],
  },
  {
    key: 'fed-preprint', type: 'preprint', area: 'ml', year: 2026, month: 2, day: 10, status: 'preprint',
    title: 'Federated Learning for Rural Clinics: Training Together Without Sharing Patient Records', subtitle: 'Preprint of the thesis summary',
    container: 'arXiv preprint', arxiv: '2602.01937',
    keywords: ['federated learning', 'healthcare', 'privacy'],
    authors: ['fadli*', 'ratna', 'm:hendra'], abstract: FEDERATED, pdf: 'paper-04-federated-clinics', links: ['code'],
  },

  /* ----------------------------------------------------------- family: batik */
  {
    key: 'batik-conf', type: 'conference-paper', area: 'hci', year: 2026, month: 6, status: 'accepted',
    title: 'Motif by Motif: Controllable Batik Pattern Generation with Structure-Aware Diffusion',
    container: 'Symposium on Computational Creativity',
    keywords: ['diffusion models', 'batik', 'cultural heritage', 'pattern generation', 'co-creation'],
    authors: ['laras*', 'kevin', 'm:intan'], abstract: BATIK, pdf: 'paper-05-batik-diffusion', cover: 'pub-cover-08', links: ['code', 'slides'], license: 'CC BY 4.0',
  },
  {
    key: 'batik-preprint', type: 'preprint', area: 'hci', year: 2026, month: 1, day: 21, status: 'preprint',
    title: 'Motif by Motif: Controllable Batik Pattern Generation with Structure-Aware Diffusion', subtitle: 'Preprint version',
    container: 'arXiv preprint', arxiv: '2601.08342',
    keywords: ['diffusion models', 'batik', 'cultural heritage'],
    authors: ['laras*', 'kevin', 'm:intan'], abstract: BATIK, pdf: 'paper-05-batik-diffusion', links: ['code'],
  },
  {
    key: 'batik-dataset', type: 'dataset', area: 'hci', year: 2026, month: 5, day: 4, status: 'published',
    title: 'Batik Motif Layouts: 2,300 Documented Cloths with Maker Credits',
    container: 'Zenodo', publisher: 'MGM Laboratory',
    keywords: ['batik', 'dataset', 'cultural heritage', 'attribution'],
    authors: ['laras*', 'kevin', 'm:intan'],
    abstract: {
      we: 'We publish 2,300 photographed batik cloths from workshops in Pekalongan, Solo and Yogyakarta, each annotated with a motif layout sketch, filler labels and the name of the artisan or workshop that made it.',
      detail: 'Artisans reviewed every entry, decided whether their cloths could be used for training generative models, and can ask for removal at any time through a simple request process.',
      result: 'The release includes layout annotations, a filler vocabulary of 48 isen types, a usage license written with the artisans, and the attribution file that every derived work must carry.',
    },
    pdf: 'paper-05-batik-diffusion', cover: 'pub-cover-13', links: ['dataset'], license: 'Custom, artisan approved',
  },

  /* ----------------------------------------------------------- family: traffic */
  {
    key: 'traffic-preprint', type: 'preprint', area: 'robo', year: 2026, month: 8, day: 11, status: 'preprint',
    title: 'Teaching Traffic Lights to Take Turns: Multi-Agent Reinforcement Learning for Mixed Motorcycle Traffic',
    container: 'arXiv preprint', arxiv: '2608.02291',
    keywords: ['reinforcement learning', 'traffic signal control', 'multi-agent systems', 'simulation'],
    authors: ['dimas*', 'wahyu', 'm:maya'], abstract: TRAFFIC, pdf: 'paper-06-traffic-rl', cover: 'pub-cover-04', links: ['code'], license: 'CC BY 4.0',
  },
  {
    key: 'traffic-poster', type: 'poster', area: 'robo', year: 2026, month: 6, day: 19, status: 'published',
    title: 'Teaching Traffic Lights to Take Turns',
    container: 'Intelligent Transportation Systems Workshop',
    keywords: ['traffic signal control', 'motorcycles', 'poster'],
    authors: ['dimas*', 'wahyu'],
    abstract: {
      we: 'This poster shows cooperative signal agents trained on a twelve intersection corridor where motorcycles make up most of the traffic, using a simulator extended with sub-lane motorcycle behavior.',
      detail: 'Side by side animations compare the fixed-time plan in use with the learned controllers during the evening peak, and a small panel explains how drone video became calibration data.',
      result: 'In simulation the learned controllers cut average delay by about a fifth and nearly halved queue spillback, with the largest gains at the two most congested junctions.',
    },
    pdf: 'paper-06-traffic-rl',
  },
  {
    key: 'traffic-report', type: 'report', area: 'robo', year: 2025, month: 12, day: 2, status: 'published',
    title: 'Sub-Lane Motorcycle Behavior: Calibration Notes from Drone Video',
    container: 'MGM Laboratory Technical Report', issue: 'TR-2025-09', publisher: 'MGM Laboratory',
    keywords: ['traffic simulation', 'calibration', 'drones', 'motorcycles'],
    authors: ['wahyu*', 'dimas'],
    abstract: {
      we: 'These notes describe how we turned 38 hours of drone footage over four intersections into motorcycle trajectories and used them to calibrate sub-lane behavior in a microscopic traffic simulator.',
      detail: 'We cover flight planning, permits, stabilization, tracking and the manual checks that caught most tracking errors, along with the parameters we calibrated and the ones we left alone.',
      result: 'Calibrated behavior reproduced observed gap acceptance and queue formation far better than the default settings, and the notes list the remaining mismatches honestly.',
    },
    pdf: 'paper-06-traffic-rl',
  },

  /* ----------------------------------------------------------- everything else */
  {
    key: 'calibration-streets', type: 'conference-paper', area: 'ml', year: 2024, month: 11, day: 5, status: 'published',
    title: 'Confident and Wrong: Calibration of Vision Models on Indonesian Street Scenes',
    container: 'Asian Conference on Machine Learning Workshops', pages: '31-40',
    keywords: ['calibration', 'uncertainty', 'computer vision', 'distribution shift'],
    authors: ['kevin*', 'm:hartono'],
    abstract: {
      we: 'We measure how well popular image classifiers and detectors know what they do not know when they are moved from benchmark data to street scenes recorded in five Indonesian cities.',
      detail: 'The test set covers rain, night, dense motorcycle traffic and street vendors, and every image carries labels checked by two annotators.',
      result: 'Expected calibration error roughly triples under the shift, and simple temperature scaling fitted on only 200 local images recovers most of the lost calibration without changing accuracy.',
    },
    cover: 'pub-cover-01', links: ['code'],
  },
  {
    key: 'ojek-internet', type: 'journal-article', area: 'net', year: 2023, month: 9, day: 18, status: 'published',
    title: 'Measuring Mobile Internet Quality from Moving Motorbikes in Three Indonesian Cities',
    container: 'IEEE Access', volume: '11', pages: '98231-98245', issn: '2169-3536', publisher: 'IEEE',
    keywords: ['network measurement', 'mobile networks', 'crowdsourcing', 'latency'],
    authors: ['hana*', 'dita', 'm:wulan'],
    abstract: {
      we: 'We mounted measurement phones on motorbike taxis in Jakarta, Yogyakarta and Makassar and collected latency, throughput and signal data along 41,000 kilometers of everyday rides over six months.',
      detail: 'The dataset links every measurement to location, speed, time of day and operator, which lets us separate the effects of coverage, congestion and mobility.',
      result: 'Median latency varies by a factor of four between neighborhoods of the same city, and evening congestion, not coverage, explains most of the worst experiences reported by riders.',
    },
    cover: 'pub-cover-06', links: ['dataset'],
  },
  {
    key: 'phishing-staff', type: 'journal-article', area: 'sec', year: 2024, month: 4, day: 2, status: 'published',
    title: 'Phishing Susceptibility Among University Staff: A Field Experiment',
    container: 'Computers and Security', volume: '139', pages: '103712', issn: '0167-4048',
    keywords: ['phishing', 'usable security', 'field experiment', 'security awareness'],
    authors: ['andi*', 'aisyah', 'm:rudi'],
    abstract: {
      we: 'With approval from the university and an ethics board, we sent realistic but harmless phishing emails to 1,860 staff members over eight weeks and followed up with short interviews.',
      detail: 'We varied the sender, the pretext and the timing, and compared staff who had completed the annual awareness training with those who had not.',
      result: 'Pretexts about salary and administrative deadlines worked best, training had a small effect that faded within a month, and a one-click reporting button doubled the number of phishing reports.',
    },
  },
  {
    key: 'tired-annotator', type: 'conference-paper', area: 'hci', year: 2024, month: 5, day: 11, status: 'published',
    title: 'Active Learning with Annotator Fatigue in the Loop',
    container: 'Extended Abstracts of the CHI Conference on Human Factors in Computing Systems', pages: '1-7',
    keywords: ['active learning', 'annotation', 'fatigue', 'human in the loop'],
    authors: ['stefani*', 'meiling', 'm:priya'],
    abstract: {
      we: 'We ran a two-week annotation study in which 24 participants labeled text for an active learning system while we logged response times, corrections and self-reported fatigue.',
      detail: 'The system either chose the most uncertain examples, as usual, or mixed in easier examples when signs of fatigue appeared.',
      result: 'Mixing in easier examples reduced label errors by 18 percent late in sessions and was preferred by most participants, at a small cost in how quickly the model improved.',
    },
    cover: 'pub-cover-13',
  },
  {
    key: 'consensus-queues', type: 'journal-article', area: 'sys', year: 2022, month: 10, day: 30, status: 'published',
    title: 'Consensus Protocols Explained Through Queues: A Teaching Case',
    container: 'Jurnal Ilmu Komputer dan Informasi', volume: '15', issue: '2', pages: '101-112', issn: '2088-7051',
    keywords: ['distributed systems', 'teaching', 'consensus', 'Raft'],
    authors: ['wahyu*', 'm:hartono'],
    abstract: {
      we: 'We present a teaching case that introduces leader election, log replication and failure handling through the everyday example of a busy food stall queue.',
      detail: 'The case includes a role-play activity, a small simulator students can break on purpose, and exercises that move from the analogy to the actual Raft protocol.',
      result: 'Across two semesters, students who used the case scored higher on conceptual questions about failures and reported far less anxiety about the topic than students taught with slides alone.',
    },
  },
  {
    key: 'analitik-pembelajaran', type: 'journal-article', area: 'edu', year: 2024, month: 6, day: 20, status: 'published', lang: 'id',
    title: 'Analitik Pembelajaran untuk Deteksi Dini Mahasiswa Tahun Pertama yang Mengalami Kesulitan',
    container: 'Jurnal Ilmu Komputer dan Informasi', volume: '17', issue: '1', pages: '45-58', issn: '2088-7051',
    keywords: ['analitik pembelajaran', 'deteksi dini', 'mahasiswa tahun pertama', 'etika data'],
    authors: ['rahma*', 'agus'],
    abstract:
      'Banyak mahasiswa tahun pertama mengalami kesulitan tanpa terdeteksi sampai nilai ujian tengah semester keluar, padahal jejak aktivitas di sistem pembelajaran daring sudah menunjukkan tanda-tanda jauh sebelumnya. Penelitian ini menganalisis data aktivitas 2.140 mahasiswa dari tiga program studi selama dua semester, meliputi frekuensi akses materi, keterlambatan pengumpulan tugas, dan pola partisipasi di forum diskusi. Kami membandingkan beberapa model sederhana dan menemukan bahwa kombinasi keterlambatan tugas dan penurunan akses materi pada minggu keempat sudah cukup untuk mengenali sebagian besar mahasiswa yang kemudian gagal di mata kuliah dasar. Model terbaik mencapai recall 0,78 dengan presisi 0,61. Yang tidak kalah penting, kami merancang cara penyampaian hasil yang tidak memberi label kepada mahasiswa. Dosen wali hanya menerima pengingat untuk menyapa mahasiswa tertentu, bukan skor risiko. Wawancara dengan dosen dan mahasiswa menunjukkan bahwa pendekatan ini dianggap membantu dan tidak menghakimi. Kami juga membahas batasan data, risiko bias antar program studi, dan rekomendasi tata kelola data bagi perguruan tinggi yang ingin menerapkan sistem serupa secara bertanggung jawab.',
  },
  {
    key: 'fishing-codesign', type: 'conference-paper', area: 'hci', year: 2023, month: 7, day: 12, status: 'published',
    title: 'Participatory Design with Fishing Communities on the North Coast of Java',
    container: 'Proceedings of the ACM Designing Interactive Systems Conference', pages: '1402-1416', publisher: 'ACM',
    keywords: ['participatory design', 'fishing communities', 'ICT4D', 'co-design'],
    authors: ['sanne*', 'laras', 'm:emma'],
    abstract: {
      we: 'We report on eighteen months of co-design workshops with small-scale fishers, fish traders and their families in two villages, aimed at tools for sharing weather and market information.',
      detail: 'Workshops used paper prototypes, voice notes and role play instead of screens, and participants set the agenda for half of every session.',
      result: 'The resulting tool looks nothing like our initial idea: it is a shared voice message board run by the fishers themselves, and it is still in use a year after the project ended.',
    },
    cover: 'pub-cover-11',
  },
  {
    key: 'cloud-forensics', type: 'journal-article', area: 'sec', year: 2024, month: 9, day: 1, status: 'published',
    title: 'Cloud Forensics After the Breach: What Logs Small Teams Actually Need',
    container: 'Forensic Science International: Digital Investigation', volume: '50', pages: '301795', issn: '2666-2817',
    keywords: ['cloud forensics', 'incident response', 'logging', 'small organizations'],
    authors: ['reza*', 'andi'],
    abstract: {
      we: 'We analyze 37 anonymized cloud incidents handled for small companies and nonprofits and reconstruct which log sources would have answered the key forensic questions in each case.',
      detail: 'For every incident we compare the logs that were available, the logs that were enabled by default, and a minimal set we propose for teams without a security department.',
      result: 'A small set of five log sources, mostly identity and storage access logs, would have answered the key questions in 31 of the 37 incidents at a storage cost of a few dollars per month.',
    },
  },
  {
    key: 'protein-tutorial', type: 'preprint', area: 'bio', year: 2024, month: 10, day: 14, status: 'preprint',
    title: 'Protein Structure Prediction for Non-Biologists: A Practical Tutorial',
    container: 'arXiv preprint', arxiv: '2410.02211',
    keywords: ['protein structure', 'tutorial', 'bioinformatics', 'deep learning'],
    authors: ['lukas*', 'putu'],
    abstract: {
      we: 'This tutorial introduces protein structure prediction to computer scientists with no biology background, from amino acid sequences to the confidence scores produced by modern predictors.',
      detail: 'It includes annotated notebooks that run on a free cloud GPU, a glossary of every acronym we could find, and exercises built around proteins relevant to tropical diseases.',
      result: 'In two workshops, participants went from no background to interpreting predicted structures and their confidence maps within a single afternoon.',
    },
    links: ['code'],
  },
  {
    key: 'rice-drones', type: 'conference-paper', area: 'robo', year: 2023, month: 7, day: 20, status: 'published',
    title: 'Counting Rice Plants from Low-Altitude Drone Imagery',
    container: 'IEEE International Geoscience and Remote Sensing Symposium', pages: '5521-5524', publisher: 'IEEE',
    keywords: ['precision agriculture', 'drones', 'object counting', 'rice'],
    authors: ['arjun*', 'made', 'm:sri'],
    abstract: {
      we: 'We collected low-altitude drone imagery over 42 smallholder rice plots in West and East Java at three growth stages and annotated individual plants in a subset of the images.',
      detail: 'A density-based counting model was trained on the annotated subset and tested on plots from a district it had never seen.',
      result: 'Counts were within 6 percent of manual counts at the tillering stage, which is enough for farmers to decide where replanting is needed.',
    },
    cover: 'pub-cover-05', links: ['code'],
  },
  {
    key: 'fewshot-budgets', type: 'journal-article', area: 'ml', year: 2025, month: 2, day: 14, status: 'published',
    title: 'Few-Shot Learning Under Label Budgets: A Benchmark Study',
    container: 'Pattern Recognition Letters', volume: '189', pages: '54-61', issn: '0167-8655',
    keywords: ['few-shot learning', 'benchmarks', 'label budgets', 'transfer learning'],
    authors: ['jihoon*', 'm:minjun', 'rizky'],
    abstract: {
      we: 'We benchmark twelve few-shot learning methods under realistic label budgets, where labeling cost is counted in money and time rather than in examples per class.',
      detail: 'The benchmark includes image, text and audio tasks collected in Korea and Indonesia, with costs estimated from actual annotation campaigns.',
      result: 'Once cost is accounted for, fine-tuning a strong pretrained model on slightly more labels beats most specialized few-shot methods, which changes the advice we would give to small labs.',
    },
  },
  {
    key: 'tutur-software', type: 'software', area: 'nlp', year: 2025, month: 7, day: 1, status: 'published',
    title: 'tutur: On-Device Speech Recognition for Code-Switched Indonesian',
    container: 'GitHub', publisher: 'MGM Laboratory', license: 'Apache-2.0',
    keywords: ['speech recognition', 'on-device', 'toolkit', 'Android'],
    authors: ['rizky*', 'dewi', 'fitri'],
    abstract: {
      we: 'tutur is an open source toolkit for running code-switched Indonesian and Javanese speech recognition entirely on a phone, without sending audio to a server.',
      detail: 'It packages the distilled recognition model, a streaming decoder, an Android demo app and scripts for fine-tuning on new regional languages with small amounts of data.',
      result: 'On a five year old mid-range phone it transcribes in real time with modest battery use, and several student groups have already adapted it to Sundanese and Balinese.',
    },
    links: ['code'], body: 'software',
  },
  {
    key: 'friday-notes', type: 'book', area: 'edu', year: 2025, month: 9, day: 5, status: 'published',
    title: 'Friday Notes: A Field Guide to Presenting Unfinished Research',
    publisher: 'MGM Laboratory Press', isbn: '978-623-99812-0-4',
    keywords: ['research communication', 'postgraduate education', 'seminars', 'presenting'],
    authors: ['m:hartono*', 'nadia', 'dimas', 'laras'],
    abstract: {
      we: 'Friday Notes collects what a year of weekly seminars taught us about presenting research before it is finished, written by the students and staff who ran and spoke at those Fridays.',
      detail: 'Short chapters cover choosing what to show, making rough slides that still work, handling hard questions, giving feedback that helps, and running a hybrid seminar on a tiny budget.',
      result: 'Every chapter ends with a checklist and a story from a real session, including the ones where the demo failed and the questions saved the day.',
    },
    cover: 'pub-cover-07', body: 'book', license: 'CC BY-NC 4.0',
  },
  {
    key: 'pengantar-ml', type: 'book', area: 'ml', year: 2023, month: 8, day: 1, status: 'published', lang: 'id',
    title: 'Pengantar Pembelajaran Mesin untuk Mahasiswa Indonesia',
    publisher: 'Penerbit Lentera Ilmu', isbn: '978-602-51234-7-9',
    keywords: ['pembelajaran mesin', 'buku ajar', 'pendidikan informatika'],
    authors: ['agus*', 'm:hartono'],
    abstract:
      'Buku ini ditulis untuk mahasiswa yang ingin memahami pembelajaran mesin dari dasar tanpa harus tenggelam dalam notasi matematika sejak halaman pertama. Setiap bab dimulai dengan masalah nyata dari konteks Indonesia, seperti memprediksi harga cabai, mengelompokkan ulasan produk lokal, atau mengenali jenis batik dari foto, lalu memperkenalkan konsep dan algoritma yang dibutuhkan untuk menyelesaikannya. Materi mencakup regresi, klasifikasi, pengelompokan, evaluasi model, dan dasar jaringan saraf, dilengkapi contoh kode Python yang dapat dijalankan di laptop biasa. Kami memberi perhatian khusus pada kesalahan yang sering dilakukan pemula, misalnya kebocoran data dan evaluasi yang terlalu optimistis. Setiap bab juga memuat diskusi etika singkat tentang dampak model terhadap orang yang datanya digunakan. Buku ini telah dipakai di beberapa kelas pengantar selama tiga semester, dan masukan dari mahasiswa membentuk banyak contoh serta latihan di dalamnya. Kami berharap buku ini membantu lebih banyak mahasiswa merasa percaya diri untuk mulai meneliti dengan data mereka sendiri.',
    cover: 'pub-cover-05', body: 'book',
  },
  {
    key: 'honest-charts', type: 'book-chapter', area: 'data', year: 2024, month: 3, status: 'published',
    title: 'Honest Charts for Messy Data',
    container: 'Data Literacy in Southeast Asia', publisher: 'Nusantara Academic Press', pages: '45-68', isbn: '978-623-88120-3-1',
    keywords: ['visualization', 'data literacy', 'uncertainty', 'public data'],
    authors: ['grace*', 'agus'],
    abstract: {
      we: 'This chapter shows how charts built from incomplete public data can mislead without a single wrong number, using examples from Indonesian health, education and transport statistics.',
      detail: 'We walk through missing regions, changing definitions, small denominators and truncated axes, and show a corrected version of every misleading chart.',
      result: 'The chapter ends with a one-page checklist that newsrooms and government data teams have used in training sessions.',
    },
  },
  {
    key: 'robots-elderly', type: 'book-chapter', area: 'robo', year: 2025, month: 5, status: 'published',
    title: 'Social Robots in Elderly Care: Lessons from Long-Term Deployments',
    container: 'Human-Robot Interaction in Asia', publisher: 'Nusantara Academic Press', pages: '201-226', isbn: '978-623-88120-9-3',
    keywords: ['social robots', 'elderly care', 'long-term studies', 'human-robot interaction'],
    authors: ['kenji*', 'm:hiroshi'],
    abstract: {
      we: 'We summarize lessons from companion robots deployed for up to two years in six care homes in Japan and Indonesia, based on logs, staff interviews and observations.',
      detail: 'The chapter follows how residents, families and staff changed their use of the robots over time, from novelty to routine and sometimes to quiet abandonment.',
      result: 'Robots that supported existing routines, such as reminders and group activities, lasted far longer than those designed as conversation partners, and staff involvement predicted success better than any robot feature.',
    },
  },
  {
    key: 'batik-grammar', type: 'book-chapter', area: 'hci', year: 2026, status: 'in-press',
    title: 'Batik as a Design Grammar for Generative Models',
    container: 'Computational Approaches to Cultural Heritage', publisher: 'Nusantara Academic Press', pages: '88-110',
    keywords: ['batik', 'design grammar', 'generative models', 'cultural heritage'],
    authors: ['laras*', 'kevin'],
    abstract: {
      we: 'This chapter describes batik as a design grammar, with motifs, fillers, borders and rules for combining them, and argues that generative models should be built around that grammar instead of raw pixels.',
      detail: 'We draw on interviews with artisans in three batik centers and on our own experiments with layout-conditioned diffusion models.',
      result: 'Treating the grammar as structure makes models easier to steer, easier to credit and easier for artisans to reject when a pattern breaks the rules.',
    },
  },
  {
    key: 'carbon-clusters', type: 'report', area: 'sus', year: 2024, month: 11, day: 25, status: 'published',
    title: 'The Carbon Cost of Training Models in Indonesian University Clusters',
    container: 'MGM Laboratory Technical Report', issue: 'TR-2024-07', publisher: 'MGM Laboratory',
    keywords: ['green AI', 'carbon emissions', 'GPU clusters', 'energy'],
    authors: ['daan*', 'jonathan', 'm:hartono'],
    abstract: {
      we: 'We estimate the energy use and carbon emissions of machine learning training on three university GPU clusters in Indonesia over one academic year, using job logs and power measurements.',
      detail: 'Emissions are computed with the grid intensity of each region and broken down by project type, job length and how often jobs were restarted after failures.',
      result: 'A small number of long hyperparameter searches account for most emissions, and scheduling flexible jobs at night would cut the footprint by about 12 percent at no cost to researchers.',
    },
    cover: 'pub-cover-11',
  },
  {
    key: 'seatrace', type: 'dataset', area: 'data', year: 2024, month: 8, day: 30, status: 'published',
    title: 'SeaTrace: Anonymized GPS Traces from Small Fishing Boats',
    container: 'Zenodo', publisher: 'MGM Laboratory',
    keywords: ['GPS traces', 'fisheries', 'open data', 'anonymization'],
    authors: ['grace*', 'bagus', 'm:sri'],
    abstract: {
      we: 'SeaTrace contains two years of GPS traces from 140 small fishing boats that volunteered to carry low-cost trackers, with trips segmented and labeled by fishing activity.',
      detail: 'Home ports and individual boats are anonymized, positions near the coast are coarsened, and fishers agreed to every use described in the data statement.',
      result: 'We include baseline code for detecting fishing activity and for estimating fuel use per trip, along with guidance on uses the fishers explicitly did not approve.',
    },
    cover: 'pub-cover-08', links: ['dataset'], license: 'CC BY-NC 4.0',
  },
  {
    key: 'accessibility-audit', type: 'project', area: 'hci', year: 2025, status: 'in-progress',
    title: 'Accessibility Audit of Public Service Websites',
    keywords: ['accessibility', 'screen readers', 'government websites', 'audit'],
    authors: ['yohanes*', 'm:wulan'],
    abstract: {
      we: 'This ongoing project audits the accessibility of 120 public service websites together with blind and low vision testers who use them in daily life.',
      detail: 'Each site is tested on common tasks such as renewing documents or registering for services, with screen readers on phones and laptops.',
      result: 'Early results show that most sites fail at the very first step, often a form without labels, and the project publishes fixes that developers can apply in an afternoon.',
    },
    links: ['website'], body: 'project',
  },
  {
    key: 'flood-sensor-kit', type: 'project', area: 'sus', year: 2026, status: 'in-progress',
    title: 'Sensor Kit for Community Flood Monitoring',
    keywords: ['flood monitoring', 'IoT', 'community science', 'open hardware'],
    authors: ['bagus*', 'nadia', 'dita'],
    abstract: {
      we: 'We are building a low-cost water level sensor kit that neighborhood groups can assemble, install and maintain themselves, feeding directly into our street-level flood forecasts.',
      detail: 'The kit uses off-the-shelf parts, a LoRa radio and a solar panel, and comes with an illustrated assembly guide written with volunteers.',
      result: 'Twelve kits have run through one rainy season so far, and the volunteers found installation problems we would never have noticed in the lab.',
    },
    cover: 'pub-cover-14', links: ['code'], body: 'project',
  },
  {
    key: 'bisindo-poster', type: 'poster', area: 'cv', year: 2024, month: 12, day: 10, status: 'published',
    title: 'Recognizing BISINDO Signs from a Webcam',
    container: 'Undergraduate Research Showcase',
    keywords: ['sign language', 'BISINDO', 'pose estimation', 'accessibility'],
    authors: ['bima*', 'm:hartono'],
    abstract: {
      we: 'This poster presents an undergraduate project that recognizes 60 isolated signs from Indonesian Sign Language (BISINDO) using an ordinary laptop webcam.',
      detail: 'Hand and body keypoints from a pose estimator feed a small sequence model trained on recordings from twelve signers, including deaf signers who reviewed every label.',
      result: 'The prototype recognizes the signs with 88 percent accuracy for signers it has seen and 71 percent for new signers, which points to more diverse recordings as the next step.',
    },
  },
  {
    key: 'confident-wrong-article', type: 'article', area: 'ml', year: 2025, month: 1, day: 16, status: 'published',
    title: 'Why Your Model Is Confident and Wrong',
    container: 'MGM Lab Notes', publisher: 'MGM Laboratory',
    keywords: ['calibration', 'explainer', 'machine learning'],
    authors: ['kevin*'],
    abstract: {
      we: 'This article explains calibration for a general audience: why a model that says it is 95 percent sure can be wrong far more often than five percent of the time.',
      detail: 'It uses examples from street scenes, medical images and spam filters, and avoids equations except for one very small one.',
      result: 'The piece ends with three questions anyone can ask before trusting a confidence score, and it became the most read post on the lab blog that year.',
    },
    body: 'article',
  },
  {
    key: 'two-years-article', type: 'article', area: 'edu', year: 2026, month: 9, day: 8, status: 'published',
    title: 'What Two Years of Fridays Taught Us',
    container: 'MGM Lab Notes', publisher: 'MGM Laboratory',
    keywords: ['seminars', 'research culture', 'community'],
    authors: ['m:hartono*', 'nadia'],
    abstract: {
      we: 'Two years after the first Zemi, we look back at almost a hundred Friday sessions and what they changed for the students who presented and the people who came to listen.',
      detail: 'The article draws on attendance numbers, a short survey of regular attendees and conversations with speakers about what happened to their work after their talk.',
      result: 'The biggest effects were not on papers but on people: more cross-lab collaborations, more undergrads joining research groups, and a lot less fear of showing unfinished work.',
    },
    body: 'article',
  },
  {
    key: 'seminar-notes-v1', type: 'other', area: 'edu', year: 2025, month: 9, day: 1, status: 'published',
    title: 'Zemi Seminar Notes, Volume 1: September 2024 to August 2025',
    publisher: 'MGM Laboratory',
    keywords: ['seminar notes', 'research summaries', 'community'],
    authors: ['m:hartono*'],
    abstract: {
      we: 'This collection gathers one-page summaries of every talk given at Zemi during its first year, written by the speakers themselves a week after they presented.',
      detail: 'Each summary lists the question, the method, the current status and the most useful piece of feedback the speaker received from the audience.',
      result: 'The notes make it easy to find who in the lab is working on what, and several collaborations started after people read them.',
    },
  },
  {
    key: 'lms-privacy', type: 'journal-article', area: 'sec', year: 2025, month: 7, day: 22, status: 'published',
    title: 'Differential Privacy for Learning Management System Logs',
    container: 'IEEE Access', volume: '13', pages: '121904-121917', issn: '2169-3536', publisher: 'IEEE',
    keywords: ['differential privacy', 'learning analytics', 'education data', 'privacy engineering'],
    authors: ['aisyah*', 'm:rudi', 'rahma'],
    abstract: {
      we: 'We study how to share learning management system logs for research while protecting students, applying differential privacy to the event streams of 6,300 students.',
      detail: 'We compare several mechanisms on common learning analytics tasks and measure how well the privatized logs support early warning models and course dashboards.',
      result: 'At privacy levels acceptable to the university data office, dashboards remain accurate and early warning recall drops by only four points, while attacks that identify individual students fail.',
    },
  },
  {
    key: 'ecommerce-ranking', type: 'conference-paper', area: 'nlp', year: 2025, month: 7, day: 14, status: 'published',
    title: 'Ranking Indonesian E-Commerce Queries with Typos and Slang',
    container: 'Proceedings of the SIGIR Workshop on eCommerce', pages: '1-9',
    keywords: ['information retrieval', 'e-commerce search', 'Indonesian', 'spelling variation'],
    authors: ['fikri*', 'm:priya'],
    abstract: {
      we: 'We study search queries from an Indonesian marketplace in which more than a third contain typos, slang or regional spellings, and build a ranking pipeline that handles them explicitly.',
      detail: 'The pipeline combines a character-aware query encoder, a slang dictionary built from seller listings and a relevance model fine-tuned on judged query and product pairs.',
      result: 'In an online test, the pipeline improved click-through on messy queries by 9 percent without hurting clean ones.',
    },
    cover: 'pub-cover-12',
  },
  {
    key: 'mesh-coastal', type: 'journal-article', area: 'net', year: 2026, status: 'in-press',
    title: 'Self-Healing Mesh Networks for Coastal Villages',
    container: 'IEEE Transactions on Network and Service Management', volume: '23', issue: '1', issn: '1932-4537', publisher: 'IEEE',
    keywords: ['mesh networks', 'resilience', 'community networks', 'disaster communication'],
    authors: ['dita*', 'hana', 'm:rudi'],
    abstract: {
      we: 'We designed and deployed a solar-powered mesh network in three coastal villages that reroutes traffic automatically when nodes fail during storms or power cuts.',
      detail: 'The routing layer uses link quality measurements and battery levels, and villagers maintain the nodes with a simple repair guide.',
      result: 'Over twelve months the network kept at least one path to the internet during 97 percent of node failures, compared with 62 percent for the static configuration it replaced.',
    },
    cover: 'pub-cover-06',
  },
  {
    key: 'trust-teammate', type: 'conference-paper', area: 'hci', year: 2025, month: 4, day: 26, status: 'published',
    title: 'When to Trust the AI Teammate: Calibrating Reliance in Mixed Teams',
    container: 'Proceedings of the CHI Conference on Human Factors in Computing Systems', pages: '1-15', publisher: 'ACM',
    keywords: ['human-AI teaming', 'trust calibration', 'reliance', 'user study'],
    authors: ['meiling*', 'stefani', 'm:priya'],
    abstract: {
      we: 'We ran a controlled study with 186 participants who worked with an AI teammate on a document review task while we varied how the AI communicated its uncertainty.',
      detail: 'Conditions ranged from no uncertainty information to numeric confidence and to short explanations of what the AI had not checked.',
      result: 'Telling people what the AI had not checked reduced over-reliance the most without making people ignore correct advice, while numeric confidence alone had almost no effect.',
    },
    cover: 'pub-cover-09',
  },
  {
    key: 'exome-budget', type: 'journal-article', area: 'bio', year: 2025, month: 11, day: 17, status: 'published',
    title: 'Exome Analysis for Rare Disease Diagnosis on a Hospital Budget',
    container: 'BMC Bioinformatics', volume: '26', pages: '412', issn: '1471-2105',
    keywords: ['exome sequencing', 'rare diseases', 'variant calling', 'clinical genomics'],
    authors: ['laila*', 'putu', 'm:retno'],
    abstract: {
      we: 'We present an exome analysis pipeline for rare disease diagnosis that runs on a single workstation and is tuned for variants common in Indonesian populations.',
      detail: 'The pipeline was validated on 96 previously diagnosed cases from two hospitals and compared with a commercial cloud service used by one of them.',
      result: 'It reproduced 91 percent of the confirmed diagnoses, found two diagnoses the earlier analysis had missed, and costs a fraction of the cloud service per case.',
    },
    cover: 'pub-cover-10', links: ['code'],
  },
  {
    key: 'landslide-drones', type: 'conference-paper', area: 'robo', year: 2026, month: 5, status: 'accepted',
    title: 'Search and Rescue Drone Coordination After Landslides',
    container: 'IEEE International Conference on Robotics and Automation', publisher: 'IEEE',
    keywords: ['search and rescue', 'multi-robot coordination', 'drones', 'disaster response'],
    authors: ['arjun*', 'dimas'],
    abstract: {
      we: 'We propose a coordination method for small drone teams searching for survivors after landslides, where terrain blocks radio links and battery limits force frequent returns.',
      detail: 'Drones share a coarse map of searched areas when they meet and plan routes that keep at least one relay in range of the base.',
      result: 'In field trials at a disused quarry, the team covered 40 percent more area per battery charge than independent drones and never lost contact with the base station.',
    },
  },
  {
    key: 'rooftop-solar', type: 'journal-article', area: 'sus', year: 2024, month: 5, day: 8, status: 'published',
    title: 'Forecasting Rooftop Solar Output Under Tropical Cloud Cover',
    container: 'Applied Energy', volume: '356', pages: '122401', issn: '0306-2619',
    keywords: ['solar forecasting', 'rooftop PV', 'nowcasting', 'tropical climate'],
    authors: ['daan*', 'taufik', 'm:emma'],
    abstract: {
      we: 'We forecast the output of 310 rooftop solar systems in Surabaya and Jakarta over horizons of 15 minutes to 6 hours using satellite cloud imagery and local weather observations.',
      detail: 'Models are trained across sites so that new systems with little history can be forecast from the start.',
      result: 'Our model cuts forecast error by 21 percent compared with the persistence baseline at one hour ahead, with the largest gains during the fast-changing afternoon clouds typical of the wet season.',
    },
    cover: 'pub-cover-03',
  },
  {
    key: 'slm-government', type: 'preprint', area: 'ml', year: 2026, month: 5, day: 19, status: 'preprint',
    title: 'Small Language Models for Local Government Document Tasks',
    container: 'arXiv preprint', arxiv: '2605.11820',
    keywords: ['small language models', 'public sector', 'Indonesian', 'efficiency'],
    authors: ['jihoon*', 'fikri', 'm:minjun'],
    abstract: {
      we: 'We evaluate small language models on document tasks that local governments actually perform, such as summarizing regulations, filling templates and answering citizen questions in Indonesian.',
      detail: 'All models run on a single laptop GPU or CPU, and tasks were defined together with staff from two district offices.',
      result: 'A fine-tuned 1.5 billion parameter model matches much larger hosted models on template filling and comes close on summarization, while keeping all documents on premises.',
    },
    visibility: 'unlisted',
  },
  {
    key: 'bird-calls', type: 'conference-paper', area: 'bio', year: 2024, month: 4, day: 16, status: 'published',
    title: 'Recognizing Bird Calls in Kalimantan with Low-Cost Recorders',
    container: 'IEEE International Conference on Acoustics, Speech and Signal Processing', pages: '1181-1185', publisher: 'IEEE',
    keywords: ['bioacoustics', 'biodiversity monitoring', 'audio classification', 'low-cost sensors'],
    authors: ['putu*', 'lan'],
    abstract: {
      we: 'We placed 40 low-cost audio recorders in forest plots in Central Kalimantan for six months and trained classifiers to recognize the calls of 58 bird species.',
      detail: 'Training data combined public recordings with 1,900 local clips labeled by ornithologists and local guides.',
      result: 'The classifier detects the ten species of highest conservation interest with an average precision of 0.82, good enough to track seasonal presence across plots.',
    },
  },
  {
    key: 'maluku-thesis', type: 'thesis', area: 'net', year: 2024, month: 2, status: 'published',
    title: 'Measuring Internet Quality on the Outer Islands of Maluku',
    container: "Master's thesis, Universitas Gadjah Mada", publisher: 'Universitas Gadjah Mada',
    keywords: ['network measurement', 'rural connectivity', 'Maluku', 'satellite internet'],
    authors: ['hana*'],
    abstract: {
      we: 'This thesis measures internet quality on eleven islands in Maluku using a mix of volunteer phones, fixed probes and ferry-mounted measurement kits.',
      detail: 'It compares mobile, satellite and community network options and documents how weather, ferry schedules and power cuts shape everyday connectivity.',
      result: 'Satellite links offered the most consistent quality but at prices few households can afford, while community networks delivered the best value where local maintenance was organized.',
    },
  },
  {
    key: 'bisindo-thesis', type: 'thesis', area: 'cv', year: 2025, month: 8, status: 'published',
    title: 'Recognizing Indonesian Sign Language with Pose Estimation',
    container: "Bachelor's thesis, Informatics", publisher: 'MGM Laboratory',
    keywords: ['sign language recognition', 'BISINDO', 'pose estimation', 'accessibility'],
    authors: ['bima*'],
    abstract: {
      we: 'This undergraduate thesis develops a sign language recognition system for BISINDO that works with a plain webcam and runs in a web browser.',
      detail: 'It extends earlier work from 60 to 150 signs, adds recordings from 30 signers across four cities and involves deaf signers in labeling and evaluation.',
      result: 'The browser prototype recognizes isolated signs with 84 percent accuracy for new signers and was rated useful for practice by most deaf and hearing participants.',
    },
  },
  {
    key: 'flood-dissertation', type: 'thesis', area: 'sus', year: 2026, status: 'in-progress',
    title: 'Graph Learning for Street-Level Flood Forecasting',
    container: 'PhD dissertation, Informatics', publisher: 'MGM Laboratory',
    keywords: ['flood forecasting', 'graph neural networks', 'urban computing'],
    authors: ['nadia*'],
    abstract: {
      we: 'This dissertation develops graph learning methods for forecasting flash floods at the level of individual street segments in dense tropical cities.',
      detail: 'It covers building drainage graphs from incomplete city records, combining gauge, radar and crowd data, and communicating forecasts to the people who act on them.',
      result: 'Across three cities, graph models outperform gridded baselines consistently, and a field pilot with a city operations center shows how the forecasts change real decisions.',
    },
  },
  {
    key: 'motosim-software', type: 'software', area: 'robo', year: 2026, month: 8, day: 11, status: 'published',
    title: 'motosim: Sub-Lane Motorcycle Behavior for Traffic Simulators',
    container: 'GitHub', publisher: 'MGM Laboratory', license: 'MIT',
    keywords: ['traffic simulation', 'motorcycles', 'open source'],
    authors: ['dimas*', 'wahyu'],
    abstract: {
      we: 'motosim is an open source extension that adds realistic sub-lane motorcycle behavior to a widely used microscopic traffic simulator.',
      detail: 'It ships with parameters calibrated from drone video at four Indonesian intersections, tools for calibrating new sites and example scenarios.',
      result: 'Several groups outside our lab have used it to study motorcycle-heavy traffic in Vietnam and Thailand, and their calibration results are included as community presets.',
    },
    cover: 'pub-cover-04', links: ['code'], body: 'software',
  },
  {
    key: 'block-coding', type: 'journal-article', area: 'edu', year: 2023, month: 11, day: 20, status: 'published',
    title: 'Block-Based Programming in Bahasa Indonesia for Primary Schools',
    container: 'Jurnal Pendidikan Informatika Indonesia', volume: '8', issue: '2', pages: '77-91', issn: '2549-7472',
    keywords: ['computing education', 'block-based programming', 'localization', 'primary school'],
    authors: ['clara*', 'rahma'],
    abstract: {
      we: 'We localized a block-based programming environment into Bahasa Indonesia and studied its use in four primary schools over one semester.',
      detail: 'Teachers co-designed the lesson plans, and we compared classes using the localized version with classes using the English original.',
      result: 'Students using the localized version completed more exercises and explained their programs more clearly, and the gap was largest for students with little exposure to English.',
    },
  },
  {
    key: 'adversarial-signs', type: 'conference-paper', area: 'sec', year: 2026, status: 'under-review',
    title: 'Adversarial Stickers Against Indonesian Traffic Sign Recognition',
    container: 'Submitted to the IEEE Conference on Secure and Trustworthy Machine Learning',
    keywords: ['adversarial examples', 'traffic signs', 'physical attacks', 'robustness'],
    authors: ['reza*', 'kevin'],
    abstract: {
      we: 'We show that printed stickers designed with a small optimization budget can make common traffic sign recognizers misread Indonesian signs under real outdoor conditions.',
      detail: 'Attacks were tested with phone cameras and dashcams at different distances, angles and times of day on signs installed on a private test road.',
      result: 'Stickers covering less than a tenth of a sign fooled the models in most trials, and standard robustness training helped less than expected against these local sign designs.',
    },
    visibility: 'draft',
  },
];
