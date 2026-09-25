import type { Area } from './speakers.js';

/** Short, casual lines used to build event descriptions and bios. No em or en dashes. */

export const AREA_LABEL: Record<Area, string> = {
  cv: 'computer vision',
  nlp: 'language and speech',
  ml: 'machine learning',
  hci: 'human-computer interaction',
  net: 'networks',
  sec: 'security and privacy',
  bio: 'bioinformatics and health',
  edu: 'education technology',
  sus: 'sustainability',
  sys: 'systems',
  data: 'data science',
  robo: 'robotics',
};

/** One of these follows each talk in an event description. */
export const AREA_HOOKS: Record<Area, string[]> = {
  cv: [
    'Expect before and after images, a confusion matrix or two, and an honest look at where the model still squints.',
    'There will be pictures. Lots of them. Some of them are the model getting it very wrong, which is the fun part.',
    'The pipeline, the failure cases, and the one augmentation trick that mattered more than the architecture.',
  ],
  nlp: [
    'Real examples from real conversations, including the ones that make the model give up.',
    'Tokenizers, datasets and the humans who labeled them. Bring your favorite weird sentence.',
    'We will hear a few audio clips. Headphones optional, curiosity required.',
  ],
  ml: [
    'The idea, the math you actually need, and the experiments that did not make it into the paper.',
    'Plots with error bars, a baseline that is annoyingly hard to beat, and lessons learned the slow way.',
    'Expect a whiteboard moment. Nobody expects the derivation to be clean.',
  ],
  hci: [
    'Stories from the field, quotes from participants, and what changed in the design because of them.',
    'Less about the interface, more about the people using it. Some findings are uncomfortable. Good.',
    'Sketches, prototypes, and a study that did not go as planned but taught everyone something.',
  ],
  net: [
    'Latency charts, packet traces, and at least one story about a router in a very strange place.',
    'How the measurements were collected, what broke along the way, and what the numbers really say.',
    'The kind of networking talk where the map of the setup is half the fun.',
  ],
  sec: [
    'Threat models, real incidents with the names removed, and practical advice you can use on Monday.',
    'A demo, a scary slide, and then a calmer slide about what to actually do.',
    'Security from the point of view of the people who have to live with it, not just the attackers.',
  ],
  bio: [
    'No biology degree needed. The speaker promises to explain every acronym, at least once.',
    'Data from the lab and the clinic, and the careful steps between a model and a decision about a person.',
    'Expect sequences, a pipeline diagram, and a very honest section on data quality.',
  ],
  edu: [
    'Practical, a little personal, and full of things you can try in your own research this week.',
    'Classroom stories, a few numbers, and a lot of respect for the students on the other side of the data.',
    'Bring a pen. People always want to write things down in this one.',
  ],
  sus: [
    'Maps, time series and field photos, plus the uncomfortable question of who benefits from the results.',
    'Data from sensors, satellites and people on the ground, stitched together with a lot of patience.',
    'Climate, cities and the tools we can build with what we already have.',
  ],
  sys: [
    'Architecture diagrams, benchmarks with honest error bars, and one production incident story.',
    'The design, the trade-offs, and the moment the whole thing fell over at 3 AM.',
    'Expect graphs of latency, graphs of cost, and a graph of how much coffee the debugging took.',
  ],
  data: [
    'Charts, maps and the cleaning steps nobody usually shows. All of them, this time.',
    'What the data says, what it does not say, and how to tell the difference out loud.',
    'Open data, messy data and the questions you should ask before you trust a chart.',
  ],
  robo: [
    'Videos of robots doing the thing. Also videos of robots not doing the thing.',
    'Hardware, software and a field test that involved more mud than planned.',
    'From simulation to the real world, and the gap in between that everyone underestimates.',
  ],
};

export const INTRO_BY_COUNT = [
  'One speaker, one long talk, and plenty of room for questions.',
  'Two talks, one coffee break, zero perfect slides.',
  'Three shorter talks this time, so the questions have to be quick. Or not.',
];

export const BRING_BULLETS = [
  'A question you have been sitting on for weeks',
  'Your laptop, if you want to follow along with the notebook',
  'A friend from another lab. Cross-pollination is the whole point',
  'Your own half-finished idea, for the coffee break',
  'Curiosity. The coffee is on us',
  'Business cards, if you are old school',
  'An empty stomach. Somebody always brings snacks',
  'Your supervisor, if you are brave',
];

export const LEAVE_BULLETS = [
  'A method you can try on your own data next week',
  'At least one new person to email',
  'A clearer idea of what to ask your supervisor',
  'Slides, shared after the session',
  'A reading list that is actually short',
  'The recording, if you want to rewatch the tricky part',
];

export const QUOTES = [
  'Nobody expects slides to be perfect. We expect questions.',
  'The model was right. The labels were wrong.',
  'If it worked on the first try, you did not measure it properly.',
  'Bring the messy version. That is the one worth talking about.',
  'Every dataset is a story about the people who made it.',
  'The best question today came from the back row. It always does.',
  'Negative results are still results. They are just shy.',
  'We changed the title three times this week. That is progress.',
  'The baseline is embarrassingly strong. Respect the baseline.',
  'It is not a bug in the data. It is a feature of the world.',
  'Half of research is knowing which half to ignore.',
  'Write it down before the coffee break or it is gone.',
];

export const VENUE_LINES = {
  hybrid: 'Come in person or join the livestream on this page. Questions from the chat get read out loud.',
  online: 'This one is online only. The player opens on this page when we go live at 13:15 WIB.',
  offline: 'In person only this time. No livestream, but the slides get shared afterwards.',
};

export const ONLINE_NOTE = {
  hybrid: 'The livestream starts right here at 13:15 WIB. Drop questions in the chat and we will read them out.',
  online: 'Online only. The player opens on this page when we go live. No link hunting needed.',
};

/** Captions for documentation photos, keyed by the manifest `scene`. */
export const CAPTIONS: Record<string, string[]> = {
  presentation: ['Slides were not finished. Talk was great anyway.', 'Pointing at the chart that made it all worth it.', 'That moment when the demo works.'],
  'q-and-a': ['The question that made everyone go "ooh".', 'Mic check, one two, is this a question or a comment?', 'Q and A got spicy, in a good way.'],
  coffee: ['Coffee, the good part.', 'Half the collaborations start right here.', 'Snacks disappeared in four minutes.'],
  'group-photo': ['Everyone who stayed until the end.', 'We did try to get everyone to look at the camera.'],
  detail: ['Notes from the back row.', 'Somebody is going to try this on their own data tonight.'],
  panel: ['Three stools, three opinions.', 'A panel that actually disagreed. Finally.'],
  audience: ['The back row, leaning in.', 'Undergrads asking the best questions again.', 'A full room on a rainy Friday.'],
  'check-in': ['Door crew doing the QR dance.', 'Scan, smile, find a seat.'],
  livestream: ['Behind the scenes of the livestream.', 'Somebody has to watch the audio levels.'],
  discussion: ['Whiteboard session after the talk.', 'The hallway conversation that turned into a project.'],
  wide: ['The theater, nearly full.', 'Wide shot for the grant report.'],
  networking: ['Swapping contacts the modern way.', 'New collaborators, found by the door.'],
  setup: ['13:05. Cables everywhere. It will be fine.', 'Setting up the room, testing the clicker.'],
  hybrid: ['Waving at the livestream crowd.', 'Online and in the room, same conversation.'],
  default: ['Another Friday at Zemi.'],
};

/* --------------------------------------------------------------------------- abstracts */

/** Area context sentences that open an abstract. */
export const ABSTRACT_CONTEXT: Record<Area, string[]> = {
  cv: [
    'Computer vision systems are increasingly deployed in settings that look very different from the benchmarks they were trained on.',
    'Visual data collected in Indonesian cities, coasts and villages is abundant, but labeled data that matches local conditions remains scarce.',
  ],
  nlp: [
    'Language technologies still serve a handful of languages well and leave hundreds of regional languages behind.',
    'Indonesian speakers routinely mix Indonesian, regional languages and English, which breaks the assumptions of most language processing pipelines.',
  ],
  ml: [
    'Machine learning models are often evaluated on clean, balanced datasets that rarely resemble the data they meet after deployment.',
    'Many practical learning problems come with few labels, shifting distributions and strict limits on compute.',
  ],
  hci: [
    'Interactive systems are shaped as much by the people who use them as by the people who design them.',
    'Technology built for communities without their involvement often fails in ways that are predictable in hindsight.',
  ],
  net: [
    'Network performance in archipelagic regions varies widely, yet most measurement studies focus on dense urban areas.',
    'Networks deployed outside well-funded cities have to cope with unreliable power, limited backhaul and changing demand.',
  ],
  sec: [
    'Security incidents increasingly begin with ordinary people and ordinary tools rather than exotic exploits.',
    'Security and privacy guidance is plentiful, but little of it is tested against how people actually behave.',
  ],
  bio: [
    'Biological and clinical data are growing faster than the capacity of small labs and hospitals to analyze them.',
    'Computational methods in biology and health promise a lot, but their value depends on data quality and careful validation.',
  ],
  edu: [
    'Digital learning platforms record detailed traces of student activity, raising both opportunities and ethical concerns.',
    'Research training at the postgraduate level relies heavily on informal practices that are rarely studied or written down.',
  ],
  sus: [
    'Rapid urbanization and a changing climate put pressure on infrastructure and ecosystems across Southeast Asia.',
    'Environmental monitoring often depends on data that arrives too late, too coarse or too expensive for local decisions.',
  ],
  sys: [
    'Modern computing systems are expected to scale smoothly while running on shared, failure-prone and sometimes preemptible hardware.',
    'The cost and reliability of computing infrastructure increasingly shape which research questions can be explored at all.',
  ],
  data: [
    'Public data is becoming easier to access, but turning it into trustworthy insight still takes considerable care.',
    'Decisions in cities and institutions increasingly rely on dashboards whose data and design choices are rarely examined.',
  ],
  robo: [
    'Robots that leave the lab have to deal with mud, noise, people and conditions that no simulator fully captures.',
    'Autonomous systems for agriculture, transport and disaster response must operate reliably under uncertainty and limited connectivity.',
  ],
};

export const ABSTRACT_GAP = [
  'Existing approaches tend to assume clean data and stable conditions, which rarely hold in practice.',
  'Prior work has focused on settings with abundant resources, leaving low-resource contexts largely unexplored.',
  'Few studies examine how these methods behave once they meet real users and real constraints.',
  'Most available tools were designed elsewhere and transfer poorly to local conditions.',
  'Evaluation practices in this area often overstate performance because test data resembles training data too closely.',
  'The gap between promising prototypes and dependable systems remains wide and poorly documented.',
];

export const ABSTRACT_EVAL = [
  'We further analyze failure cases in detail and report where the approach should not be trusted.',
  'Ablation studies show which design choices matter most and which can be safely simplified.',
  'We also examine robustness under distribution shift, including data collected in a different season and location.',
  'A qualitative analysis with domain experts complements the quantitative results.',
  'Results are stable across random seeds, and we report confidence intervals for every headline number.',
  'We compare against strong and simple baselines, which turn out to be harder to beat than expected.',
];

export const ABSTRACT_IMPACT = [
  'These findings suggest practical steps for teams working with limited data and budgets.',
  'The work offers a template that other groups can adapt to their own regions and communities.',
  'Our results point to concrete design recommendations for practitioners and policy makers.',
  'Beyond the specific application, the study highlights the value of involving local stakeholders from the start.',
  'We hope the findings encourage more evaluation in realistic, messy conditions.',
  'The approach is lightweight enough to run on commodity hardware, which lowers the barrier for adoption.',
];

export const ABSTRACT_RELEASE = [
  'Code, trained models and documentation are publicly available to support replication.',
  'We release the data collection protocol and analysis scripts alongside this paper.',
  'An anonymized version of the dataset is available to researchers on request.',
  'All materials needed to reproduce the experiments are openly shared.',
];
