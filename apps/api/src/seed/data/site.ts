import type { LinkItem, VenueKind } from '@zemi/shared';

/* ------------------------------------------------------------------ venues */

export interface VenueSeed {
  key: string;
  name: string;
  kind: VenueKind;
  building: string | null;
  floor: string | null;
  capacity: number | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  /** Shown on events in this room (events.roomNote). */
  roomNote: string | null;
}

const CAMPUS = 'Faculty of Computer Science, Kampus Depok, West Java 16424, Indonesia';

export const VENUES: VenueSeed[] = [
  { key: 'c312', name: 'Classroom 3.12', kind: 'classroom', building: 'Building A', floor: '3', capacity: 60, address: `Building A, ${CAMPUS}`, lat: -6.36462, lng: 106.82878, notes: 'Good projector, bad air conditioning. Bring a fan in April.', roomNote: 'Third floor, left of the stairs. The room with the good projector.' },
  { key: 'c314', name: 'Classroom 3.14', kind: 'classroom', building: 'Building A', floor: '3', capacity: 60, address: `Building A, ${CAMPUS}`, lat: -6.36466, lng: 106.82891, notes: 'HDMI only. Keep the adapter bag in the drawer.', roomNote: 'Third floor, end of the corridor, next to the water dispenser.' },
  { key: 'c401', name: 'Classroom 4.01', kind: 'classroom', building: 'Building A', floor: '4', capacity: 80, address: `Building A, ${CAMPUS}`, lat: -6.36459, lng: 106.82869, notes: 'Biggest classroom in the building. Mic battery drawer is behind the lectern.', roomNote: 'Fourth floor, right out of the lift. Big room, big windows.' },
  { key: 'c407', name: 'Classroom 4.07', kind: 'classroom', building: 'Building A', floor: '4', capacity: 45, address: `Building A, ${CAMPUS}`, lat: -6.36471, lng: 106.82885, notes: 'Cozy. Fills up fast.', roomNote: 'Fourth floor, the small room at the end. Come early, it fills up.' },
  { key: 'lab', name: 'MGM Lab', kind: 'lab', building: 'Building C', floor: '2', capacity: 30, address: `Building C, ${CAMPUS}`, lat: -6.36511, lng: 106.82947, notes: 'Our home. Whiteboards on every wall, coffee machine by the door.', roomNote: 'Building C, second floor. Follow the smell of coffee.' },
  { key: 'thA', name: 'Theater A', kind: 'theater', building: 'Main Building', floor: '1', capacity: 150, address: `Main Building, ${CAMPUS}`, lat: -6.36402, lng: 106.82812, notes: 'Tiered seating. Book through the faculty office two weeks ahead.', roomNote: 'Main Building, ground floor. Enter through the big glass doors.' },
  { key: 'thB', name: 'Theater B (Auditorium)', kind: 'theater', building: 'Main Building', floor: '1', capacity: 320, address: `Main Building, ${CAMPUS}`, lat: -6.36389, lng: 106.82797, notes: 'For the big Fridays. Needs an AV technician on site.', roomNote: 'Main Building auditorium. The big one. Seats are first come, first served.' },
  { key: 'sr2', name: 'Seminar Room 2', kind: 'other', building: 'Library Building', floor: '2', capacity: 40, address: `Library Building, ${CAMPUS}`, lat: -6.36552, lng: 106.83021, notes: 'Quiet floor. Remind people to keep the hallway chat short.', roomNote: 'Library Building, second floor. Quiet zone outside, chaos inside.' },
  { key: 'online', name: 'Online only', kind: 'online', building: null, floor: null, capacity: null, address: null, lat: null, lng: null, notes: 'Livestream only, no room booked.', roomNote: null },
];

export const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

/* ------------------------------------------------------------------ FAQ */

export const FAQS: Array<{ question: string; answer: string; visibility?: 'published' | 'draft' }> = [
  {
    question: 'Do I need to register?',
    answer: 'Please do. It is free and takes thirty seconds. It helps us pick a room that fits and gives you a ticket with a QR code, so checking in at the door is quick. Walk-ins are welcome too, we just can not promise a seat.',
  },
  {
    question: 'Is it really free?',
    answer: 'Yes. No fees, no catch, no membership. MGM Laboratory covers the room and the coffee. If you want to give something back, present one day.',
  },
  {
    question: 'I am an undergrad. Can I come?',
    answer: 'Absolutely. Undergrads are a big part of Zemi. You will see what research looks like before the polish, and some of the best questions come from the back row. Nobody will quiz you.',
  },
  {
    question: 'What if I am late?',
    answer: 'Slip in quietly and grab a seat. Doors open at 13:15 and the first talk starts around 13:25. Your ticket works any time during the session.',
  },
  {
    question: 'Can I watch online?',
    answer: 'Yes. Every hybrid session is livestreamed on its event page from 13:15 WIB. You can ask questions in the chat and we read them out loud. No extra link needed.',
  },
  {
    question: 'Are sessions recorded?',
    answer: 'Most of them. Recordings go up on the event page after the session, with chapters for each talk. Speakers can ask us to keep parts private, for example unpublished results.',
  },
  {
    question: 'How do I find the room?',
    answer: 'The room changes from week to week, so check the event page. It has the room name, directions and a map link. If you get lost, follow the people carrying coffee.',
  },
  {
    question: 'Can I present my research?',
    answer: 'Please do. Master’s and PhD students are our main speakers, but undergrads and visiting researchers present too. Send us a message on the contact page with a working title. It does not need to be finished. That is kind of the point.',
  },
  {
    question: 'What language are the talks in?',
    answer: 'Mostly English, because we often have guests from other countries. Questions in Bahasa Indonesia are always fine, and someone will happily translate.',
  },
  {
    question: 'Is there really coffee?',
    answer: 'There is really coffee. Usually snacks too. The coffee machine in the lab is famous for being slow, so the good stuff comes from the table outside the room.',
  },
];

/* ------------------------------------------------------------------ team */

export interface TeamSeed {
  name: string;
  role: string;
  bio: string;
  links: LinkItem[];
  /** Portrait in seed/assets/authors (never a speaker face). */
  portrait: string;
}

export const TEAM: TeamSeed[] = [
  {
    name: 'Hartono Wicaksono',
    role: 'Faculty advisor, head of MGM Laboratory',
    bio: 'Started Zemi because his students were not talking to each other enough. These days he is mostly in charge of the coffee budget and the hardest question of the day.',
    links: [{ kind: 'website', url: 'https://labmgm.org', label: 'MGM Laboratory' }, { kind: 'scholar', url: 'https://scholar.google.com/citations?user=hWicaksono01', label: null }],
    portrait: 'authors/author-08.jpg',
  },
  {
    name: 'Aulia Rahmadani',
    role: 'Lead organizer, PhD candidate',
    bio: 'Keeps the Friday calendar full and the speakers calm. Knows which rooms have working projectors, and which ones only pretend to.',
    links: [{ kind: 'linkedin', url: 'https://www.linkedin.com/in/auliarahmadani', label: null }, { kind: 'x', url: 'https://x.com/auliarahmadani', label: null }],
    portrait: 'authors/author-07.jpg',
  },
  {
    name: 'Rendy Kurniawan',
    role: 'Program chair',
    bio: 'Finds the speakers, chases the titles and writes the event blurbs. If you want to present, he is the one who will say yes very quickly.',
    links: [{ kind: 'linkedin', url: 'https://www.linkedin.com/in/rendykurniawan', label: null }, { kind: 'github', url: 'https://github.com/rendyk', label: null }],
    portrait: 'authors/author-10.jpg',
  },
  {
    name: 'Sekar Ayuningtyas',
    role: 'Stream and AV lead',
    bio: 'Runs OBS, the cameras and the microphones. Has a sixth sense for a dying clip-on battery. Wave at her on the livestream.',
    links: [{ kind: 'instagram', url: 'https://www.instagram.com/sekar.av', label: null }, { kind: 'youtube', url: 'https://www.youtube.com/@zemi-seminar', label: 'Zemi on YouTube' }],
    portrait: 'authors/author-09.jpg',
  },
  {
    name: 'Gilang Ramadhan',
    role: 'Door and community',
    bio: 'The friendly face with the QR scanner. Also runs the group chat, remembers everyone’s name and makes sure first timers find a seat.',
    links: [{ kind: 'instagram', url: 'https://www.instagram.com/gilang.rmdhn', label: null }],
    portrait: 'authors/author-12.jpg',
  },
  {
    name: 'Nabila Zahra',
    role: 'Design and web',
    bio: 'Designed the four shapes, the posters and most of this website. Will fix your slide template if you ask nicely before Thursday.',
    links: [{ kind: 'website', url: 'https://nabilazahra.design', label: 'Portfolio' }, { kind: 'github', url: 'https://github.com/nabilazahra', label: null }],
    portrait: 'authors/author-11.jpg',
  },
];

/* ------------------------------------------------------------------ inbox */

export interface MessageSeed {
  name: string;
  email: string;
  topic: string;
  message: string;
  status: 'new' | 'read' | 'replied' | 'archived';
  /** Days before now. */
  daysAgo: number;
  hour: number;
}

export const MESSAGES: MessageSeed[] = [
  { name: 'Rina Maharani', email: 'rina.maharani@ui.ac.id', topic: 'I want to present', status: 'new', daysAgo: 0, hour: 19, message: 'Hi Zemi crew!\n\nI am a second year Master’s student working on sign language recognition for BISINDO. I have early results and a lot of questions. Could I present sometime in November? Any Friday works except the 13th.\n\nThanks,\nRina' },
  { name: 'Arif Budiman', email: 'arif.budiman@gmail.com', topic: 'A question', status: 'new', daysAgo: 1, hour: 10, message: 'Is the session on 2 October in Theater A or the usual classroom? The event page says Theater A but my friend says 3.12. Also, is parking available for motorbikes near the Main Building?' },
  { name: 'Dr. Maria Sitorus', email: 'maria.sitorus@itb.ac.id', topic: 'Collaboration', status: 'new', daysAgo: 2, hour: 14, message: 'Hello, I lead a small group working on flood early warning in Bandung. We saw the recording of the flood forecasting talk and would love to compare notes. Could someone connect us with Nadia? We have gauge data that might be useful for the benchmark.' },
  { name: 'Kevin Tanoto', email: 'kevin.tanoto@binus.ac.id', topic: 'Something else', status: 'new', daysAgo: 3, hour: 21, message: 'Random question: can students from other universities come in person? I am at Binus, happy to take the train. Also, great website. The little shapes with eyes made my day.' },
  { name: 'Siti Nurhaliza Putri', email: 'siti.nputri@yahoo.co.id', topic: 'A question', status: 'new', daysAgo: 4, hour: 8, message: 'Selamat pagi. I registered for last Friday but could not come because of a family thing. Is the recording available? I could not find it on the event page.' },
  { name: 'Bayu Prakoso', email: 'bayu.prakoso@gmail.com', topic: 'I want to present', status: 'read', daysAgo: 6, hour: 16, message: 'Hi! I am a PhD student in civil engineering working with LiDAR data for landslide monitoring. Would a talk from outside computer science be welcome? I can make it very visual.' },
  { name: 'Emma Jansen', email: 'e.jansen@tudelft.nl', topic: 'Collaboration', status: 'read', daysAgo: 9, hour: 15, message: 'Dear Zemi team, Sanne told me about your seminar series. We run a similar weekly format in Delft and would love to try a joint online session next semester. Who would be the right person to talk to?' },
  { name: 'Yoga Pratama', email: 'yoga.pratama@its.ac.id', topic: 'A question', status: 'read', daysAgo: 12, hour: 11, message: 'Is there a limit on how many times one person can present? Asking for a friend. The friend is me. I have a follow up to my talk in June.' },
  { name: 'Putri Anggraini', email: 'putri.anggraini@ugm.ac.id', topic: 'Something else', status: 'read', daysAgo: 15, hour: 20, message: 'Just wanted to say thank you. I presented my messy thesis results in August and the questions helped me restructure chapter four. My supervisor noticed the difference.' },
  { name: 'Hendra Susanto', email: 'hendra.susanto@samudradata.co.id', topic: 'Collaboration', status: 'replied', daysAgo: 19, hour: 13, message: 'Hi, I work at a data consultancy in Jakarta. We would be happy to sponsor snacks for a few sessions, no strings attached. We would also love to give a talk on data cleaning at scale at some point.' },
  { name: 'Nabila Putri', email: 'nabila.putri@gmail.com', topic: 'I want to present', status: 'replied', daysAgo: 24, hour: 9, message: 'Hello! Undergrad here, final year. I built a small tool that turns lecture recordings into study notes, offline. Would that fit a demo day?' },
  { name: 'Ahmad Zulkarnain', email: 'ahmad.zulkarnain@brin.go.id', topic: 'A question', status: 'replied', daysAgo: 30, hour: 10, message: 'Do you share the slides after each session? Our team at BRIN follows the livestream and would like to cite one of the talks in an internal report.' },
  { name: 'Lina Hartati', email: 'lina.hartati@outlook.com', topic: 'Something else', status: 'replied', daysAgo: 38, hour: 17, message: 'The livestream audio was very quiet last week, just letting you know. The slides looked great though. Maybe the clip-on mic battery?' },
  { name: 'Marketing Team', email: 'promo@seo-rocket-agency.biz', topic: 'Something else', status: 'archived', daysAgo: 45, hour: 3, message: 'Dear website owner, we can get your site to page one of Google in 7 days guaranteed. Reply now for a special discount on our premium backlink package.' },
  { name: 'Dimas Arya', email: 'dimas.arya@gmail.com', topic: 'A question', status: 'archived', daysAgo: 58, hour: 22, message: 'Testing the contact form. Please ignore. Also, the confetti after sending is excellent.' },
];

/* ------------------------------------------------------------------ admins */

export type AdminRole = 'door-crew' | 'stream-operator' | 'content-manager' | 'viewer' | 'program-chair' | 'old-door-crew';

export interface AdminSeed {
  role: AdminRole;
  name: string;
  note: string;
  /** Used outside production only. In production a fresh passphrase is generated and printed. */
  devPassphrase: string;
}

/** Marker in `admins.note` so re-runs find (and update) the demo admins instead of adding more. */
export const SEED_ADMIN_TAG = '[demo admin, created by the seeder]';

export const ADMINS: AdminSeed[] = [
  { role: 'door-crew', name: 'Gilang (door crew)', note: 'Scans tickets at the door next Friday. Access ends that evening.', devPassphrase: 'zemi-door-crew-dev' },
  { role: 'stream-operator', name: 'Sekar (stream operator)', note: 'Runs OBS for the next three Fridays.', devPassphrase: 'zemi-stream-operator-dev' },
  { role: 'content-manager', name: 'Nabila (content manager)', note: 'Owns speakers, publications and the site pages. No registrant data.', devPassphrase: 'zemi-content-manager-dev' },
  { role: 'program-chair', name: 'Rendy (program chair)', note: 'Creates new Fridays and edits the upcoming ones.', devPassphrase: 'zemi-program-chair-dev' },
  { role: 'viewer', name: 'Pak Hartono (viewer)', note: 'Read-only look at everything. No personal data.', devPassphrase: 'zemi-viewer-dev' },
  { role: 'old-door-crew', name: 'Tika (door crew, last semester)', note: 'Helped at the door in June. Access has expired.', devPassphrase: 'zemi-old-door-crew-dev' },
];
