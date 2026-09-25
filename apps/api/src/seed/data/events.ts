import type { Area } from './speakers.js';

/** [talk title, area, pinned speaker key?] */
export type TalkDef = [title: string, area: Area, speaker?: string];

export interface EventTheme {
  title: string;
  summary: string;
  tags: string[];
  talks: TalkDef[];
  /** Online only (guest far away). */
  online?: true;
  /** Needs the big room. */
  big?: true;
  /** A thesis clinic or workshop: small room. */
  small?: true;
}

const t = (title: string, summary: string, tags: string, talks: TalkDef[], extra: Partial<EventTheme> = {}): EventTheme => ({
  title,
  summary,
  tags: tags.split(',').map((s) => s.trim()).filter(Boolean),
  talks,
  ...extra,
});

/**
 * One theme per Friday, in order, starting with the first Friday of September 2024. When the seeder
 * runs later and needs more Fridays, it wraps around with an "Encore" title.
 * Summaries stay short and casual. No em or en dashes.
 */
export const EVENT_THEMES: EventTheme[] = [
  /* 1  2024-09-06 */ t('Hello, Friday', 'The very first Zemi. Two talks, one projector that almost cooperated, and way too much coffee.', 'kickoff, machine learning, speech', [
    ['Why your model is confident and wrong', 'ml'],
    ['Teaching a phone to understand Javanese', 'nlp', 'rizky'],
  ]),
  /* 2 */ t('Floods move faster than models', 'Flash floods rise and fall within an hour. Can a graph of every street keep up? An early look at forecasting water depth block by block.', 'floods, graphs, cities', [
    ['Street-level flood forecasting with graphs, first attempt', 'sus', 'nadia'],
  ]),
  /* 3 */ t('Pixels from space', "Satellites see a lot, just not everything. Mapping mangroves from orbit and the blind spots of remote sensing.", 'remote sensing, mangroves, computer vision', [
    ['Counting mangroves from orbit', 'cv', 'ayu'],
    ["What satellites can't see", 'sus'],
  ]),
  /* 4 */ t('The attack surface is a person', 'Most breaches start with a click, not a zero-day. We talk phishing, passwords and the people behind both.', 'security, usability', [
    ['Phishing is a UX problem', 'sec'],
    ['Passwords my parents actually use', 'sec'],
  ]),
  /* 5 */ t('Proteins, but make it fold', 'Protein structure prediction explained for people who skipped biochem. Yes, there will be ribbon diagrams.', 'bioinformatics, proteins', [
    ['Protein structure for people who skipped biochem', 'bio'],
  ]),
  /* 6 */ t('Robots in rice fields', 'Drones, soil sensors and what happens when hardware meets mud.', 'robotics, agriculture, iot', [
    ['Drones that count rice plants', 'robo'],
    ['Soil sensors on a student budget', 'sus', 'bagus'],
  ]),
  /* 7 */ t('Learning analytics without the creepy part', 'What clickstreams can tell us about struggling students, and what they should never be used for.', 'education, learning analytics, privacy', [
    ['What clickstreams say about struggling students', 'edu'],
    ['Dashboards teachers actually open', 'hci'],
  ]),
  /* 8 */ t('Latency is a feeling', 'Measuring mobile internet quality the hard way: on the back of a motorbike, across three cities.', 'networks, measurement, mobile', [
    ['Measuring mobile internet from the back of an ojek', 'net'],
  ]),
  /* 9 */ t('Small data, big feelings', 'Labels are expensive and annotators get tired. Two talks on learning well from very little.', 'machine learning, few-shot learning, active learning', [
    ['Few-shot learning when labels cost a fortune', 'ml'],
    ['Active learning with a tired annotator', 'ml'],
  ]),
  /* 10 */ t('Speech in the wild', 'Real conversations switch languages mid-sentence. What that does to speech recognition, and how to collect data people agreed to share.', 'speech, datasets, javanese', [
    ['Collecting consented speech data, the slow way', 'nlp', 'fitri'],
    ['Code-switching breaks everything', 'nlp', 'dewi'],
  ]),
  /* 11 */ t('Your dashboard is lying to you', 'Charts can mislead without a single wrong number. A friendly tour of honest visualization.', 'visualization, data science', [
    ['Honest charts for messy data', 'data'],
    ['The map that made a minister angry', 'data'],
  ]),
  /* 12 */ t('Consensus, explained with a warung queue', 'Distributed systems ideas like leader election and Raft, told through the most Indonesian queue there is.', 'distributed systems, consensus', [
    ['Consensus protocols and the warung queue', 'sys'],
  ]),
  /* 13 */ t('Who is this AI for?', 'Designing technology with communities instead of for them. Stories from fishing villages and consent forms nobody reads.', 'hci, participatory design, ethics', [
    ['Participatory design with fishing communities', 'hci', 'sanne'],
    ['Consent forms nobody reads', 'hci'],
  ]),
  /* 14 */ t('Can a model respect a motif?', 'Batik has rules that generic image generators ignore. A first look at teaching a model the grammar of a pattern.', 'generative models, batik, cultural heritage', [
    ['Batik motifs as a design grammar', 'cv', 'laras'],
  ]),
  /* 15 */ t('Logs you wish you had kept', 'Cloud forensics after a breach, and the boring logging decisions that save you later.', 'security, cloud, forensics', [
    ['Cloud forensics after the breach', 'sec', 'reza'],
    ['Logging decisions that save you later', 'sec'],
  ]),
  /* 16 2024-12-20 */ t('Year-end show and tell', 'Last Friday of the year. Three short talks, zero pressure, one slightly burnt cake.', 'show and tell, mixed', [
    ['Five failed experiments and one that worked', 'ml'],
    ['A chatbot for campus admin questions', 'nlp'],
    ['My first dataset paper', 'data'],
  ]),
  /* 17 2025-01-10 */ t('Traffic lights that take turns', 'Most signal controllers assume cars in neat lanes. Our intersections are mostly motorcycles filling every gap.', 'reinforcement learning, traffic, simulation', [
    ['Reinforcement learning for motorcycle traffic', 'robo', 'dimas'],
  ]),
  /* 18 */ t('Tiny models, big phones', 'Distillation and quantization for people who want models on a mid-range phone, not a data center.', 'on-device, distillation, efficiency', [
    ['Distillation for people in a hurry', 'ml', 'rizky'],
    ['Quantization without tears', 'ml'],
  ]),
  /* 19 */ t('Serious games, seriously', 'Educational games that kids do not hate, and why measuring fun is a research problem.', 'education, games, hci', [
    ["Educational games that kids don't hate", 'edu', 'clara'],
    ['Measuring fun is harder than it looks', 'hci'],
  ]),
  /* 20 2025-01-31: cancelled */ t('Sign language, one gesture at a time', 'Recognizing BISINDO signs from a plain webcam, presented by one of our undergrads.', 'sign language, computer vision, accessibility', [
    ['Recognizing BISINDO signs on a webcam', 'cv', 'bima'],
  ]),
  /* 21 */ t('Wireless everywhere, reliable nowhere', 'LoRa networks for flood sensors, and a gentle investigation into why the campus wifi hates you.', 'networks, iot, wireless', [
    ['LoRa networks for flood sensors', 'net'],
    ['Why the campus wifi hates you', 'net'],
  ]),
  /* 22 */ t('Seeing in the dark', 'Low-light video understanding and the many lies of night-time traffic cameras.', 'computer vision, video', [
    ['Low-light video understanding', 'cv'],
    ['Night-time traffic cams and their many lies', 'cv'],
  ]),
  /* 23 */ t('Privacy is a team sport', 'Clinics cannot share patient records, but they can share what they learn. Federated learning and differential privacy in plain words.', 'privacy, federated learning, health', [
    ["Federated learning for clinics that can't share", 'ml', 'fadli'],
    ['Differential privacy in plain words', 'sec'],
  ]),
  /* 24 */ t('Maps of who gets left behind', 'Accessibility maps for wheelchair users and the open data that is somehow still closed.', 'open data, accessibility, maps', [
    ['Accessibility maps for wheelchair users', 'data'],
    ['Open data, closed doors', 'data'],
  ]),
  /* 25 */ t('The human in the loop is tired', 'Annotation tools that respect people, and how to live with the label noise they inevitably produce.', 'annotation, label noise, hci', [
    ['Annotation tools that respect people', 'hci'],
    ['Label noise and how to live with it', 'ml'],
  ]),
  /* 26 */ t('Thesis clinic: method sections', 'A hands-on session on writing a method section a reviewer can actually follow. Bring your draft.', 'thesis, writing, research methods', [
    ['Method sections a reviewer can follow', 'edu'],
    ['Threats to validity, the friendly version', 'edu'],
  ], { small: true }),
  /* 27 */ t('Microbes and machine learning', 'Predicting antibiotic resistance from DNA sequences, and why the hard part is the data, not the model.', 'bioinformatics, genomics, health', [
    ['Predicting antibiotic resistance from sequences', 'bio'],
  ]),
  /* 28 2025-04-11 */ t('Robots that read the room', 'Social robots in elderly care, and a list of things robots should never say out loud.', 'robotics, human robot interaction, elderly care', [
    ['Social robots in elderly care', 'robo', 'kenji'],
    ['What robots should never say', 'hci'],
  ], { online: true }),
  /* 29 */ t('Search is a conversation now', 'Ranking for Indonesian e-commerce search, and evaluating chatbots with something better than vibes.', 'search, nlp, evaluation', [
    ['Ranking for Indonesian e-commerce search', 'nlp', 'fikri'],
    ['Evaluating chatbots without vibes', 'nlp'],
  ]),
  /* 30 */ t('Carbon, compute and conscience', 'Training big models has a carbon bill. Who pays it, and how to schedule GPUs a little greener.', 'sustainability, green ai, gpu', [
    ['The carbon cost of training models', 'sus'],
    ['Green scheduling for GPU clusters', 'sys'],
  ]),
  /* 31 */ t('Packets with feelings', 'Network quality measured from ten thousand phones, and congestion control for rural links.', 'networks, measurement', [
    ['Measuring network quality from 10,000 phones', 'net', 'hana'],
    ['Congestion control for rural links', 'net'],
  ]),
  /* 32 */ t('Evidence, not vibes', 'A/B testing in classrooms and the statistics mistakes we all make at least once.', 'statistics, education, experiments', [
    ['A/B testing in classrooms', 'edu'],
    ['Statistics mistakes we all make', 'data', 'agus'],
  ]),
  /* 33 */ t('Weak labels, strong opinions', 'Training segmentation models on outdated maps, and what to do when the ground truth is wrong.', 'weak supervision, remote sensing, computer vision', [
    ['Training with outdated national maps', 'cv', 'ayu'],
    ['When the ground truth is wrong', 'ml'],
  ]),
  /* 34 */ t('Security for small businesses', 'Threat models for warung owners, online sellers and anyone who cannot afford a security team.', 'security, small business', [
    ['Threat models for warung owners', 'sec'],
  ]),
  /* 35 */ t('Do language models speak Sundanese?', 'Evaluating large language models on regional languages, and building a benchmark together with native speakers.', 'llm, regional languages, benchmarks', [
    ['Evaluating LLMs on regional languages', 'nlp'],
    ['Building a benchmark with the community', 'nlp'],
  ]),
  /* 36 */ t('Simulation all the way down', 'Agent-based models of a city market, and calibrating a traffic simulator with drone video.', 'simulation, multi-agent systems, traffic', [
    ['Agent-based models of a city market', 'sys', 'wahyu'],
    ['Calibrating a simulator with drone video', 'robo', 'dimas'],
  ]),
  /* 37 */ t('Designing for slow internet', 'Offline-first apps for village health workers and web apps that still work on 2G.', 'hci, offline-first, health', [
    ['Offline-first apps for village health workers', 'hci'],
    ['Progressive web apps on 2G', 'net'],
  ]),
  /* 38 */ t('Graph neural networks, gently', 'Message passing without the math panic. A friendly intro with floods, roads and a few too many arrows.', 'graph neural networks, tutorial', [
    ['Message passing without the math panic', 'ml', 'nadia'],
  ]),
  /* 39 */ t('Cells, images and patience', 'Microscopy segmentation for small labs, and counting cells so humans do not have to.', 'bioimaging, segmentation', [
    ['Microscopy segmentation for tiny labs', 'bio'],
    ["Counting cells so humans don't have to", 'cv'],
  ]),
  /* 40 */ t('Your first paper review', 'What reviewers actually look for, and a survival guide for Reviewer 2.', 'peer review, writing', [
    ['What reviewers actually look for', 'edu'],
    ['Surviving Reviewer 2', 'edu'],
  ], { small: true }),
  /* 41 */ t('Coastlines and code', 'Monitoring coastal erosion with public data, plus what fishing boat GPS traces reveal about the sea.', 'coastal monitoring, sustainability, gps', [
    ['Monitoring coastal erosion with public data', 'sus'],
    ['Fish, boats and GPS traces', 'data'],
  ]),
  /* 42 */ t('Explainable, but to whom?', 'Explanations doctors trust, and why saliency maps are not the explanation you think they are.', 'explainability, health, computer vision', [
    ['Explanations doctors actually trust', 'ml', 'ratna'],
    ['Saliency maps are not explanations', 'cv'],
  ]),
  /* 43 */ t('Private 5G in a lecture hall', 'What it takes to run a private 5G network on campus, and what it is actually good for.', '5g, networks', [
    ['Private 5G networks on campus', 'net', 'dita'],
  ]),
  /* 44 */ t('Midyear demo day', 'Three quick demos from students who built something this semester. Live demos, so pray with us.', 'demo day, mixed', [
    ['A drone that follows farmers around', 'robo'],
    ['An app that reads bus schedules aloud', 'hci'],
    ['A tiny search engine for theses', 'nlp'],
  ]),
  /* 45 2025-08-15 */ t('Merdeka week: open research', 'Independence week special. Where open science stands in Indonesia, and how to publish your code without shame.', 'open science, reproducibility, independence week', [
    ['Open science in Indonesia, where we are', 'edu'],
    ['Publishing your code without shame', 'sys'],
  ]),
  /* 46 */ t('Generative models with manners', 'Controllable image generation for designers, and watermarks for everything these models make.', 'generative models, watermarking', [
    ['Controllable image generation for designers', 'cv', 'kevin'],
    ['Watermarks for generated images', 'sec'],
  ]),
  /* 47 */ t('Data journalism with students', 'Teaching data journalism to computer science students, and scraping responsibly.', 'data journalism, education, ethics', [
    ['Teaching data journalism to CS students', 'edu'],
    ['Scraping responsibly', 'data', 'grace'],
  ]),
  /* 48 2025-09-05 */ t('One year of Fridays', 'Zemi turns one. A look back at a year of half-finished research, plus cryptography you can explain at dinner.', 'anniversary, security', [
    ['What a year of Fridays taught us', 'edu'],
    ['Zero-knowledge proofs, explained with durian', 'sec'],
  ], { big: true }),
  /* 49 */ t('Wearables and wellbeing', 'Sleep tracking for night-shift nurses and notifications that are gentle for once.', 'wearables, health, hci', [
    ['Sleep tracking for night-shift nurses', 'bio'],
    ['Designing gentle notifications', 'hci'],
  ]),
  /* 50 */ t("Recommenders that don't trap you", 'Diversity in recommendation and filter bubbles in local news apps.', 'recommender systems, news', [
    ['Diversity in recommendation', 'ml'],
    ['Filter bubbles in local news apps', 'data'],
  ]),
  /* 51 */ t('The robot arm that learned to fold', 'Imitation learning from thirty demonstrations and one very patient human.', 'robotics, imitation learning', [
    ['Imitation learning from 30 demos', 'robo'],
  ]),
  /* 52 */ t('Back to school, back to questions', 'New semester, new students. How to get into research without drowning in papers.', 'onboarding, research skills', [
    ['Onboarding new research students', 'edu'],
    ["A reading list that doesn't hurt", 'edu'],
  ]),
  /* 53 */ t('Speech on a budget', 'Distilling speech recognition for phones, and staying robust when the audio was recorded next to a blender.', 'speech, distillation, javanese', [
    ['Distilling speech recognition for phones', 'nlp', 'rizky'],
    ['Noise robustness in warung audio', 'nlp', 'dewi'],
  ]),
  /* 54 */ t('Anomalies in the power grid', 'Detecting electricity theft with machine learning, and a field guide to time series anomalies.', 'energy, anomaly detection, time series', [
    ['Detecting electricity theft with ML', 'sus'],
    ['Time series anomalies, a field guide', 'ml'],
  ]),
  /* 55 */ t('Securing the Internet of Things', 'Firmware updates for cheap sensors and botnets made of smart lamps.', 'iot, security', [
    ['Firmware updates for cheap sensors', 'sec'],
    ['Botnets made of smart lamps', 'net'],
  ]),
  /* 56 */ t('Visualizing uncertainty', 'Error bars people understand, and what weather apps get wrong about rain.', 'visualization, uncertainty', [
    ['Error bars people understand', 'data'],
    ['Uncertainty in weather apps', 'hci'],
  ]),
  /* 57 */ t('Federated, personalized, practical', 'Twenty four simulated clinics, three training strategies, one question: can small clinics train together without sharing records?', 'federated learning, health, privacy', [
    ['Personalized federated learning for 24 clinics', 'ml', 'fadli'],
  ]),
  /* 58 */ t('Mangroves, one year later', 'What changed along the coast in four years, and the seasonal compositing tricks that made the maps possible.', 'mangroves, remote sensing, climate', [
    ['What changed on the coast in four years', 'sus', 'ayu'],
    ['Seasonal compositing tricks', 'cv'],
  ]),
  /* 59 */ t('Serverless, stateless, clueless?', 'When serverless costs more than you think, and cold starts measured properly.', 'cloud, serverless, systems', [
    ['When serverless costs more', 'sys'],
    ['Cold starts, measured properly', 'sys', 'jonathan'],
  ], { online: true }),
  /* 60 */ t('Designing with artisans', 'Co-creation sessions with batik makers, and crediting the humans behind every dataset.', 'co-design, batik, cultural heritage', [
    ['Co-creation sessions with batik makers', 'hci', 'laras'],
    ['Crediting the humans behind datasets', 'hci'],
  ]),
  /* 61 */ t('What protein language models learn', 'Language models trained on proteins instead of text. What do they pick up, and can we trust it?', 'proteins, language models, bioinformatics', [
    ['What protein language models learn', 'bio', 'lukas'],
  ], { online: true }),
  /* 62 */ t('Accessible by default', 'Screen readers versus government websites, and why color contrast is a moral issue.', 'accessibility, web', [
    ['Screen readers and government websites', 'hci', 'yohanes'],
    ['Color contrast is a moral issue', 'hci'],
  ]),
  /* 63 2025-12-19 */ t('Year-end show and tell, part two', 'The last Friday of 2025. Three short talks, a group photo, and the traditional burnt cake.', 'show and tell, mixed', [
    ['Batik drafts the artisans actually liked', 'cv', 'laras'],
    ['A year of speech data in numbers', 'nlp', 'fitri'],
    ['The simulator that ate my GPU', 'sys'],
  ]),
  /* 64 2026-01-09 */ t('Plan, then ignore the plan', 'Research roadmaps for the chaotic among us. Start the year with a plan you are allowed to break.', 'planning, research skills', [
    ['Research roadmaps for the chaotic', 'edu'],
  ], { small: true }),
  /* 65 */ t('Traffic, again, but smarter', 'Cooperative signal agents on a twelve intersection corridor, trained on motorcycles calibrated from drone video.', 'reinforcement learning, traffic, multi-agent systems', [
    ['Multi-agent signals on a 12 intersection corridor', 'robo', 'dimas'],
    ['From drone video to trajectories', 'cv'],
  ]),
  /* 66 */ t('Chatbots for campus', 'A chatbot that answers thesis formatting questions at 2 AM, and guardrails that actually hold.', 'chatbots, llm, safety', [
    ['A chatbot for thesis formatting questions', 'nlp'],
    ['Guardrails that actually hold', 'nlp', 'stefani'],
  ]),
  /* 67 */ t('Adversarial stickers', 'Attacks on vision models with a sticker and a printer, and why robustness benchmarks are too easy.', 'adversarial ml, security, computer vision', [
    ['Adversarial stickers on traffic signs', 'sec'],
    ['Robustness benchmarks are too easy', 'cv'],
  ]),
  /* 68 */ t('Learning from logs', 'Mining developer logs for bugs, and log anomaly detection that survives production.', 'systems, logs, anomaly detection', [
    ['Mining developer logs for bugs', 'sys'],
    ['Log anomaly detection in production', 'ml'],
  ]),
  /* 69 */ t('Floods, the sequel', 'Three rainy seasons of data later: a benchmark for flash floods and what crowd reports add to the picture.', 'floods, graphs, crowdsourcing', [
    ['A benchmark for flash floods', 'sus', 'nadia'],
    ['Crowd-reported inundation data', 'data', 'bagus'],
  ]),
  /* 70 */ t('Kids, code and curiosity', 'Teaching programming in primary schools, and block-based coding in Bahasa Indonesia.', 'computing education, kids', [
    ['Teaching programming in primary schools', 'edu'],
    ['Block-based coding in Bahasa Indonesia', 'edu', 'clara'],
  ]),
  /* 71 */ t('Genomics for rare diseases', 'Diagnosing rare diseases with exome data, and explaining genetic variants to families.', 'genomics, health', [
    ['Rare disease diagnosis with exome data', 'bio', 'laila'],
    ['Explaining variants to families', 'hci'],
  ]),
  /* 72 */ t('Structure-aware diffusion, accepted', 'The batik work got accepted. The full story of conditioning a diffusion model on motif layouts and filler vocabularies.', 'diffusion models, batik, generative models', [
    ['Structure-aware diffusion for batik patterns', 'cv', 'laras'],
  ]),
  /* 73 */ t('Satellites and smallholders', 'Predicting crop yield from space, and treating farmers as data partners instead of data points.', 'agriculture, remote sensing', [
    ['Predicting crop yield from space', 'sus'],
    ['Farmers as data partners', 'hci'],
  ]),
  /* 74 2026-03-27 */ t('Edge computing on the bus', 'Running inference on city buses and deciding what to offload when the network keeps dropping.', 'edge computing, networks, systems', [
    ['Edge inference for city buses', 'sys'],
    ['Offloading decisions on shaky networks', 'net'],
  ]),
  /* 75 */ t('The ethics clinic', 'When not to build the model at all, and ethics reviews that work for student projects.', 'ethics, ai', [
    ['When not to build the model', 'ml'],
    ['Ethics reviews for student projects', 'edu'],
  ], { small: true }),
  /* 76 */ t('Robots after the landslide', 'Search and rescue drones after landslides, and mapping debris with lidar.', 'robotics, disaster response, lidar', [
    ['Search and rescue drones after landslides', 'robo', 'arjun'],
    ['Mapping debris with lidar', 'cv'],
  ]),
  /* 77 */ t('Language, identity, data', 'Dialects in Indonesian hate speech detection, and why annotator disagreement is signal, not noise.', 'nlp, hate speech, annotation', [
    ['Dialects in hate speech detection', 'nlp'],
    ['Annotator disagreement is signal', 'nlp'],
  ]),
  /* 78 2026-05-08 */ t('Clinical AI in the real world', 'Deploying a triage model in a puskesmas, and monitoring models after launch day.', 'health, deployment, mlops', [
    ['Deploying a triage model in a puskesmas', 'bio', 'ratna'],
    ['Monitoring models after launch', 'ml'],
  ]),
  /* 79 */ t('Quantum for the rest of us', 'Quantum computing with honest expectations. No hype, some math, one cat.', 'quantum computing', [
    ['Quantum computing, honest expectations', 'sys'],
  ]),
  /* 80 */ t('Networks that heal themselves', 'Self-healing mesh networks, and how to measure outage recovery without breaking things on purpose. Mostly.', 'mesh networks, resilience', [
    ['Self-healing mesh networks', 'net', 'dita'],
    ['Measuring outage recovery', 'net'],
  ]),
  /* 81 */ t('Visual search for museums', 'Image search for heritage collections, and what museum visitors actually do with their phones.', 'computer vision, museums, cultural heritage', [
    ['Image search for heritage collections', 'cv', 'yuki'],
    ['Museum visitors and their phones', 'hci'],
  ]),
  /* 82 */ t('Thesis clinic: defense rehearsal', "A Master's student rehearses their defense out loud. The room plays the committee. Be kind, be tough.", 'thesis, defense', [
    ["Rehearsing a Master's defense out loud", 'ml', 'fadli'],
  ], { small: true }),
  /* 83 */ t('Secure by design, tested by students', 'Bug bounty programs for universities, and capture the flag as a teaching tool.', 'security, education, ctf', [
    ['Bug bounty programs for universities', 'sec', 'reza'],
    ['Capture the flag as a teaching tool', 'edu'],
  ]),
  /* 84 */ t('Water, data and cities', 'Leak detection in water pipes, and cleaning sensor data at scale.', 'water, sensors, data science', [
    ['Leak detection in water pipes', 'sus'],
    ['Sensor data cleaning at scale', 'data'],
  ]),
  /* 85 */ t('The small models strike back', 'Small language models for local tasks, and benchmarks that fit on a laptop.', 'small language models, efficiency', [
    ['Small language models for local tasks', 'ml', 'jihoon'],
    ['Benchmarks that fit on a laptop', 'ml'],
  ], { online: true }),
  /* 86 */ t('Human and AI teammates', 'When to trust the AI teammate, and designing clean handoffs between people and models.', 'human ai interaction, trust', [
    ['When to trust the AI teammate', 'hci', 'meiling'],
    ['Handoffs between people and models', 'hci'],
  ]),
  /* 87 */ t('Listening to forests', 'Recognizing bird calls in Kalimantan with cheap recorders and expensive patience.', 'bioacoustics, biodiversity', [
    ['Recognizing bird calls in Kalimantan', 'bio', 'putu'],
    ['Cheap recorders, expensive insights', 'sus'],
  ]),
  /* 88 */ t('Education data, handled with care', 'Student privacy in learning management system logs, and predicting dropouts without labeling kids.', 'education, privacy', [
    ['Student data privacy in LMS logs', 'sec', 'aisyah'],
    ['Predicting dropouts without labeling kids', 'edu', 'rahma'],
  ]),
  /* 89 */ t('Maps that update themselves', 'Road extraction from drone imagery, and the students who volunteer for OpenStreetMap.', 'mapping, drones, openstreetmap', [
    ['Road extraction from drone imagery', 'cv'],
    ['OpenStreetMap and student volunteers', 'data'],
  ]),
  /* 90 2026-08-07 */ t('Midyear demo day, round three', "Three live demos from this semester's projects. Something will break. That's the fun part.", 'demo day, mixed', [
    ['A sign language tutor in the browser', 'cv', 'bima'],
    ['Voice notes to meeting minutes, offline', 'nlp'],
    ['A tiny robot that waters plants', 'robo'],
  ]),
  /* 91 2026-08-14 */ t('Merdeka week: research for the islands', 'Independence week special on connecting the outer islands: satellite internet measurements and telemedicine that works offline.', 'connectivity, health, independence week', [
    ['Satellite internet on the outer islands', 'net', 'hana'],
    ['Telemedicine that works offline', 'hci'],
  ]),
  /* 92 */ t('Distributed training on a student budget', "Training across three universities' GPUs, and pipelines that survive being preempted at 3 AM.", 'distributed training, systems', [
    ["Training across three universities' GPUs", 'sys', 'jonathan'],
    ['Pipelines that survive preemption', 'sys'],
  ]),
  /* 93 */ t('Speech for health', 'Detecting stress from voice, and the limits of voice biomarkers.', 'speech, health', [
    ['Detecting stress from voice', 'nlp', 'lan'],
    ['Voice biomarkers and their limits', 'bio'],
  ]),
  /* 94 2026-09-04 */ t('Two years of Fridays', 'Zemi turns two. The numbers behind the coffee, what changed, and graph learning for supply chains.', 'anniversary, graphs', [
    ['What two years of Zemi taught us', 'edu'],
    ['The numbers behind the coffee', 'data', 'grace'],
    ['Graph learning for supply chains', 'ml'],
  ], { big: true }),
  /* 95 */ t('Energy communities', 'Forecasting rooftop solar in a cloudy city, and what happens when neighbors share batteries.', 'energy, solar, forecasting', [
    ['Forecasting rooftop solar in a cloudy city', 'sus', 'daan'],
    ['Batteries, prices and neighbors', 'sus'],
  ]),
  /* 96 */ t('Traffic lights, the preprint', 'The traffic signal work is finally a preprint. What made it in, what got cut, and what the reviewers will probably ask.', 'reinforcement learning, traffic', [
    ['Multi-agent RL for mixed motorcycle traffic', 'robo', 'dimas'],
    ['Simulators we trust, and why', 'sys', 'wahyu'],
  ]),
  /* 97 2026-09-25 */ t('Participatory AI, for real this time', 'Beyond consultation: what it means to build AI with communities, not just ask them for data.', 'participatory design, ai ethics', [
    ['Participatory AI beyond consultation', 'hci', 'sanne'],
    ['Fishing communities, two years later', 'hci'],
  ]),
  /* 98 2026-10-02 */ t('Robots, rice fields and the stuff in between', 'Field robotics for smallholder farms: drones that scout pests and a rover that learned to avoid irrigation ditches.', 'robotics, agriculture, drones', [
    ['Drones that scout pests before farmers do', 'robo', 'arjun'],
    ['A rover that respects irrigation ditches', 'robo', 'made'],
  ]),
  /* 99 */ t('Security folklore', 'The security advice everyone repeats and nobody checks. We check some of it.', 'security, usability', [
    ['Security advice, fact checked', 'sec', 'seoyeon'],
    ['Password rules that make things worse', 'sec', 'andi'],
  ]),
  /* 100 2026-10-16 */ t('Zemi #100: the big one', 'One hundred Fridays. Three talks, a bigger room, a group photo we will try to take properly this time, and cake that is not burnt. Probably.', 'milestone, mixed', [
    ['Flash floods, from hunch to journal', 'sus', 'nadia'],
    ['What Javanese taught our speech models', 'nlp', 'dewi'],
    ['Batik, diffusion and the artisans who shaped it', 'hci', 'laras'],
  ], { big: true }),
  /* 101 */ t('Seeing time', 'Video understanding that cares about when things happen, not just what.', 'computer vision, video', [
    ['Temporal reasoning in video models', 'cv', 'yuki'],
  ]),
  /* 102 2026-10-30: unlisted */ t('Thesis defense rehearsal, invite only', 'A closed rehearsal before a PhD defense. If you have the link, you are on the committee. Be kind, be tough.', 'thesis, defense', [
    ['PhD defense rehearsal: graph learning for urban floods', 'ml', 'nadia'],
  ], { small: true }),
  /* 103 */ t('Networks for the next billion', 'Community networks, cheap backhaul, and what connectivity means when the nearest tower is two islands away.', 'networks, connectivity', [
    ['Community networks on the outer islands', 'net', 'hana'],
    ['Cheap backhaul that holds up', 'net', 'dita'],
  ]),
  /* 104: draft */ t('Proteins and the people who fold them', 'Working title. A bioinformatics double feature on protein design and lab automation.', 'bioinformatics, proteins', [
    ['Protein design for small labs', 'bio', 'lukas'],
    ['Lab automation with a Raspberry Pi', 'bio', 'putu'],
  ]),
  /* 105: draft */ t('Learning, with feelings', 'Working title. Affective computing in classrooms, and what emotion recognition should never be used for.', 'education, affective computing', [
    ['Emotion recognition in classrooms, carefully', 'edu', 'clara'],
    ['What affective computing should never do', 'hci', 'stefani'],
  ]),
];

/** Fridays with no Zemi (public holidays and collective leave). Jakarta dates. */
export const HOLIDAY_FRIDAYS: Record<string, string> = {
  '2024-12-27': 'Christmas break',
  '2025-01-03': 'New Year break',
  '2025-03-28': 'Nyepi collective leave',
  '2025-04-04': 'Idul Fitri collective leave',
  '2025-04-18': 'Good Friday',
  '2025-12-26': 'Christmas break',
  '2026-01-02': 'New Year break',
  '2026-03-20': 'Idul Fitri',
  '2026-04-03': 'Good Friday',
  '2026-05-01': 'Labour Day',
  '2026-05-15': 'Ascension Day collective leave',
};

/** The first Friday of September 2024: Zemi #1. */
export const FIRST_FRIDAY = '2024-09-06';

/** Theme index (0-based) of the Friday that got rained out. */
export const CANCELLED_THEME = 19;
export const CANCEL_REASON =
  'Heavy rain flooded the roads around campus overnight, so we called it off to keep everyone safe. The talk moves to a later Friday. Stay dry out there.';
