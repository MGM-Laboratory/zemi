"""Content for the six sample papers. Made up for seeding. No em or en dashes anywhere."""

LAB = "MGM Laboratory, Department of Informatics"
UNI = "Faculty of Computer Science, a university in East Java, Indonesia"

PAPERS = [
    {
        "id": "paper-01-flood-gnn",
        # slug from PUBLICATION_TYPES / PUBLICATION_STATUSES (packages/shared), for seeding; "type" is the printed label
        "pub_type": "journal-article",
        "status": "published",
        "type": "Journal article",
        "venue": "Journal of Urban Computing",
        "year": 2026,
        "title": "Graph Neural Networks for Street-Level Flood Forecasting in Dense Tropical Cities",
        "authors": [
            {"name": "Nadia Putri Rahmawati", "affil": 1, "corresponding": True},
            {"name": "Bagus Adi Nugroho", "affil": 1},
            {"name": "Siti Aminah", "affil": 2},
        ],
        "affiliations": [LAB, UNI],
        "keywords": ["flood forecasting", "graph neural networks", "urban drainage", "rainfall nowcasting"],
        "abstract": (
            "Flash floods in dense tropical cities rise and fall within an hour, which is faster than most "
            "hydrological models can be recalibrated. We model the drainage network of a mid-sized Indonesian "
            "city as a graph of 4,812 street segments and train a spatio-temporal graph neural network on three "
            "rainy seasons of gauge, radar and crowd-reported inundation data. The model predicts water depth "
            "per segment 30 to 90 minutes ahead. On a held-out season it reduces mean absolute error by 23 percent "
            "compared with a gridded convolutional baseline and flags 81 percent of the flooded segments at least "
            "45 minutes in advance. We release the graph construction code and an anonymized benchmark."
        ),
        "sections": [
            ("Introduction", [
                "Every rainy season, short and intense storms turn a handful of streets into rivers. Residents know "
                "which corners flood first, but city dashboards usually show rainfall, not consequences. The gap "
                "between a radar image and a flooded street is exactly where a street-level forecast is useful.",
                "Physically based models capture this well but need detailed channel geometry and slow calibration. "
                "Data-driven models are fast but often ignore how water actually moves along the network. We try to "
                "keep the best of both by letting the drainage topology shape the model itself [1, 2].",
            ]),
            ("Method", [
                "We build a directed graph where nodes are street segments and edges follow the dominant drainage "
                "direction derived from a 1 m digital elevation model. Each node carries static features (slope, "
                "impervious fraction, distance to the nearest channel) and dynamic features (radar rainfall over "
                "the last three hours, upstream gauge levels).",
                "The forecaster stacks three graph attention layers with a gated temporal convolution in between. "
                "Training uses a depth-weighted loss so that the rare deep floods matter more than the many dry "
                "segments. We train on two seasons and test on the third, with no spatial leakage between splits.",
            ]),
            ("Results", [
                "The graph model beats both the persistence baseline and the gridded convolutional network on all "
                "lead times. Gains grow with lead time, which suggests the topology helps the model reason about "
                "water that has not arrived yet (Table 1). Most remaining errors come from blocked culverts, which "
                "no input feature can see.",
            ]),
            ("Discussion", [
                "Crowd reports are noisy but surprisingly valuable: removing them costs 6 points of recall. We also "
                "found that a simple rule that suppresses alerts on segments with fewer than three historical floods "
                "cuts false alarms by a third without hurting recall much.",
            ]),
            ("Conclusion", [
                "Letting the drainage graph structure the network is a cheap, strong prior for flood forecasting. "
                "Next we want to test transfer to a second city with only one season of labels.",
            ]),
        ],
        "figure": "pub-cover-02",
        "figure_caption": "Figure 1. The drainage graph. Node size shows upstream catchment area and highlighted edges show the main flow paths into the lowest segment.",
        "table": [
            ["Model", "MAE 30 min", "MAE 60 min", "Recall at 45 min"],
            ["Persistence", "7.9 cm", "12.4 cm", "0.42"],
            ["Gridded CNN", "5.1 cm", "8.8 cm", "0.69"],
            ["Graph model (ours)", "4.2 cm", "6.6 cm", "0.81"],
        ],
        "table_caption": "Table 1. Water depth error and early warning recall on the held-out season.",
        "references": [
            "Kipf, T. N. and Welling, M. Semi-supervised classification with graph convolutional networks. ICLR, 2017.",
            "Velickovic, P. et al. Graph attention networks. ICLR, 2018.",
            "Wu, Z. et al. Graph WaveNet for deep spatial-temporal graph modeling. IJCAI, 2019.",
            "Rahmawati, N. P. Crowd reports as ground truth for urban inundation. Zemi working notes, 2025.",
            "Nugroho, B. A. and Aminah, S. Building drainage graphs from open elevation data. Preprint, 2025.",
            "Bates, P. D. et al. A simple inertial formulation of the shallow water equations. Journal of Hydrology, 2010.",
        ],
    },
    {
        "id": "paper-02-javanese-asr",
        # slug from PUBLICATION_TYPES / PUBLICATION_STATUSES (packages/shared), for seeding; "type" is the printed label
        "pub_type": "conference-paper",
        "status": "published",
        "type": "Conference paper",
        "venue": "Workshop on Low-Resource Speech",
        "year": 2025,
        "title": "Small but Mighty: Code-Switched Javanese and Indonesian Speech Recognition on a Phone",
        "authors": [
            {"name": "Rizky Pratama", "affil": 1, "corresponding": True},
            {"name": "Dewi Lestari", "affil": 1},
            {"name": "Andreas Wijaya", "affil": 2},
            {"name": "Fitri Handayani", "affil": 1},
        ],
        "affiliations": [LAB, UNI],
        "keywords": ["speech recognition", "code-switching", "Javanese", "on-device models", "distillation"],
        "abstract": (
            "Everyday conversations in East Java mix Javanese and Indonesian inside a single sentence. "
            "Commercial recognizers handle Indonesian well but stumble on Javanese words and on the switches. "
            "We collect 140 hours of consented, transcribed conversational speech and distill a large "
            "multilingual model into a 38 million parameter student that runs in real time on a mid-range phone. "
            "The student reaches a 17.8 percent word error rate on code-switched test speech, within 2.1 points "
            "of its teacher, and uses a quarter of the memory."
        ),
        "sections": [
            ("Introduction", [
                "If you record a lab meeting in Malang, you will hear sentences that start in Indonesian, borrow a "
                "Javanese verb, and end with an English acronym. Speech tools rarely expect this, so people who "
                "switch languages naturally get worse transcripts.",
                "We focus on the practical question: how small can a model get before code-switched accuracy falls "
                "apart, and which training tricks keep it honest [1, 3]?",
            ]),
            ("Method", [
                "Speakers recorded casual conversations about daily topics with a consent form in both languages. "
                "Two annotators transcribed each clip and marked the language of every word. We keep speakers "
                "disjoint across the train, development and test splits.",
                "The teacher is a pretrained multilingual encoder decoder fine-tuned on our data. The student is a "
                "streaming conformer trained with sequence-level distillation plus a language tag auxiliary loss, "
                "which nudges it to notice when the language changes.",
            ]),
            ("Results", [
                "Distillation alone closes most of the gap, and the auxiliary loss helps exactly where we hoped: "
                "the words right after a switch (Table 1). Latency stays under 200 ms per chunk on the test phone.",
            ]),
            ("Discussion", [
                "Errors cluster on Javanese speech levels, where the same meaning uses different words depending "
                "on who you talk to. More polite register data would probably help more than a bigger model.",
            ]),
            ("Conclusion", [
                "A phone-sized recognizer can handle real code-switched speech if the training data sounds like "
                "real people. We plan to release the evaluation set with speaker consent.",
            ]),
        ],
        "figure": "pub-cover-15",
        "figure_caption": "Figure 1. Posterior activity of the language tag head across 16 test utterances. Peaks mark detected switches.",
        "table": [
            ["System", "WER all", "WER near switch", "Size"],
            ["Commercial API", "31.4%", "44.9%", "n/a"],
            ["Teacher", "15.7%", "22.3%", "1.5 B"],
            ["Student (ours)", "17.8%", "25.1%", "38 M"],
        ],
        "table_caption": "Table 1. Word error rates on the code-switched test set.",
        "references": [
            "Gulati, A. et al. Conformer: convolution-augmented transformer for speech recognition. Interspeech, 2020.",
            "Kim, Y. and Rush, A. M. Sequence-level knowledge distillation. EMNLP, 2016.",
            "Pratama, R. and Lestari, D. Annotating language switches in conversational speech. Preprint, 2025.",
            "Radford, A. et al. Robust speech recognition via large-scale weak supervision. ICML, 2023.",
            "Wijaya, A. Streaming recognition on commodity phones. Zemi talk notes, 2025.",
        ],
    },
    {
        "id": "paper-03-mangrove",
        # slug from PUBLICATION_TYPES / PUBLICATION_STATUSES (packages/shared), for seeding; "type" is the printed label
        "pub_type": "journal-article",
        "status": "published",
        "type": "Journal article",
        "venue": "Remote Sensing Letters",
        "year": 2025,
        "title": "Counting Mangroves from Space: Weakly Supervised Canopy Mapping with Sentinel-2",
        "authors": [
            {"name": "Ayu Kartika Sari", "affil": 1, "corresponding": True},
            {"name": "Yoga Firmansyah", "affil": 2},
        ],
        "affiliations": [LAB, "Coastal Research Group, Indonesia"],
        "keywords": ["mangroves", "Sentinel-2", "weak supervision", "semantic segmentation", "coastal monitoring"],
        "abstract": (
            "Mangrove maps are usually drawn by hand every few years, while coastlines change every season. "
            "We train a segmentation model on Sentinel-2 imagery using weak labels from outdated national maps "
            "and a small set of 320 carefully checked tiles. A noise-aware loss and seasonal compositing push the "
            "F1 score from 0.71 to 0.86 on an independent field survey. The resulting maps show 3.4 percent net "
            "canopy loss across the study coast over four years, concentrated around new aquaculture ponds."
        ),
        "sections": [
            ("Introduction", [
                "Mangroves protect coasts, store carbon and feed fisheries, yet the maps we use to protect them are "
                "often older than the ponds that replaced them. Satellites see the coast every five days; the labels "
                "are the bottleneck.",
            ]),
            ("Method", [
                "We composite cloud-free median images per season and compute a few classic indices next to the raw "
                "bands. Old maps provide cheap but noisy labels. A small clean set lets us estimate how noisy they "
                "are, and a forward-corrected loss downweights pixels the old maps probably got wrong [2].",
                "The network is a compact U-Net that fits on a single consumer GPU, so regional agencies can run it.",
            ]),
            ("Results", [
                "Noise-aware training gives the largest single improvement, and seasonal composites help mostly in "
                "cloudy estuaries (Table 1). Change maps agree with field notes at 17 of 20 visited sites.",
            ]),
            ("Discussion", [
                "The model still confuses young mangroves with other coastal shrubs. Adding radar backscatter is "
                "the obvious next step because it sees structure, not only color.",
            ]),
            ("Conclusion", [
                "Weak labels plus a small clean set are enough for useful, repeatable mangrove maps.",
            ]),
        ],
        "figure": "pub-cover-03",
        "figure_caption": "Figure 1. Canopy probability contours for one estuary. Warm lines mark high confidence mangrove canopy.",
        "table": [
            ["Training setup", "Precision", "Recall", "F1"],
            ["Old maps only", "0.74", "0.68", "0.71"],
            ["+ clean tiles", "0.81", "0.77", "0.79"],
            ["+ noise-aware loss (ours)", "0.87", "0.85", "0.86"],
        ],
        "table_caption": "Table 1. Accuracy against the independent field survey.",
        "references": [
            "Ronneberger, O. et al. U-Net: convolutional networks for biomedical image segmentation. MICCAI, 2015.",
            "Patrini, G. et al. Making deep neural networks robust to label noise. CVPR, 2017.",
            "Giri, C. et al. Status and distribution of mangrove forests of the world. Global Ecology and Biogeography, 2011.",
            "Sari, A. K. Seasonal compositing for cloudy coasts. Zemi working notes, 2024.",
        ],
    },
    {
        "id": "paper-04-federated-clinics",
        # slug from PUBLICATION_TYPES / PUBLICATION_STATUSES (packages/shared), for seeding; "type" is the printed label
        "pub_type": "thesis",
        "status": "in-progress",
        "type": "Thesis chapter",
        "venue": "Master's thesis, Informatics",
        "year": 2026,
        "title": "Federated Learning for Rural Clinics: Training Together Without Sharing Patient Records",
        "authors": [
            {"name": "Muhammad Fadli", "affil": 1, "corresponding": True},
            {"name": "Ratna Wulandari", "affil": 1},
            {"name": "Hendra Gunawan", "affil": 2},
        ],
        "affiliations": [LAB, UNI],
        "keywords": ["federated learning", "healthcare", "privacy", "non-IID data", "tabular models"],
        "abstract": (
            "Small clinics collect valuable data but cannot share it, and each one alone is too small to train a "
            "reliable model. We simulate a federation of 24 clinics using de-identified screening records and "
            "compare federated averaging, a personalized variant and local training for predicting missed "
            "follow-up visits. The personalized federation reaches an AUROC of 0.83, close to a centralized upper "
            "bound of 0.85, while the median clinic training alone reaches only 0.71."
        ),
        "sections": [
            ("Introduction", [
                "A patient who misses a follow-up is easy to spot in hindsight and hard to predict in advance. A "
                "clinic with a few hundred records does not have enough examples to learn the pattern.",
                "Federated learning lets clinics train a shared model while the records stay on their own machines "
                "[1]. The catch is that clinics differ a lot, which is where naive averaging struggles.",
            ]),
            ("Method", [
                "We split de-identified records by clinic and keep each clinic's size and label balance as they are, "
                "so the federation is realistically uneven. Models are gradient boosted trees for the local baseline "
                "and small neural networks for the federated runs.",
                "The personalized variant keeps a shared body and a small clinic-specific head, fine-tuned locally "
                "after each round [3]. Communication is limited to 40 rounds to match a weekly sync schedule.",
            ]),
            ("Results", [
                "Personalization matters most for the smallest clinics, which gain up to 0.15 AUROC over local "
                "training (Table 1). Plain averaging helps the median clinic but hurts two clinics with unusual "
                "patient populations.",
            ]),
            ("Discussion", [
                "The honest limitation is that this is a simulation. A real deployment has flaky internet, "
                "different record formats and staff time. We describe a lightweight sync tool in Appendix A.",
            ]),
            ("Conclusion", [
                "Clinics can get most of the benefit of pooled data without pooling it, as long as the model is "
                "allowed to be a little different at each site.",
            ]),
        ],
        "figure": "pub-cover-16",
        # a 4x3 grid of small multiples: show the whole cover, a 4:3 crop would cut rows in half
        "figure_fit": True,
        "figure_caption": "Figure 1. Validation AUROC per round for twelve representative clinics. Dots mark the final round.",
        "table": [
            ["Approach", "AUROC median clinic", "AUROC smallest", "Data shared"],
            ["Local only", "0.71", "0.62", "none"],
            ["Federated averaging", "0.79", "0.70", "weights"],
            ["Personalized (ours)", "0.83", "0.77", "weights"],
        ],
        "table_caption": "Table 1. Missed follow-up prediction across the simulated federation.",
        "references": [
            "McMahan, B. et al. Communication-efficient learning of deep networks from decentralized data. AISTATS, 2017.",
            "Kairouz, P. et al. Advances and open problems in federated learning. Foundations and Trends in ML, 2021.",
            "Collins, L. et al. Exploiting shared representations for personalized federated learning. ICML, 2021.",
            "Fadli, M. A weekly sync tool for clinic federations. Zemi talk notes, 2026.",
            "Chen, T. and Guestrin, C. XGBoost: a scalable tree boosting system. KDD, 2016.",
        ],
    },
    {
        "id": "paper-05-batik-diffusion",
        # slug from PUBLICATION_TYPES / PUBLICATION_STATUSES (packages/shared), for seeding; "type" is the printed label
        "pub_type": "conference-paper",
        "status": "accepted",
        "type": "Conference paper",
        "venue": "Symposium on Computational Creativity",
        "year": 2026,
        "title": "Motif by Motif: Controllable Batik Pattern Generation with Structure-Aware Diffusion",
        "authors": [
            {"name": "Larasati Anindya", "affil": 1, "corresponding": True},
            {"name": "Kevin Santoso", "affil": 1},
            {"name": "Intan Permatasari", "affil": 2},
        ],
        "affiliations": [LAB, "Department of Visual Communication Design, Indonesia"],
        "keywords": ["diffusion models", "batik", "cultural heritage", "pattern generation", "co-creation"],
        "abstract": (
            "Batik patterns follow rules: repeating motifs, isen fillers and borders that artisans combine with "
            "care. Generic image generators ignore these rules and produce patterns that look right from far "
            "away and wrong up close. We condition a diffusion model on a motif layout sketch and a filler "
            "vocabulary, trained on 2,300 photographed cloths documented with their makers. In a study with 11 "
            "artisans, generated drafts were rated useful as starting points in 64 percent of sessions."
        ),
        "sections": [
            ("Introduction", [
                "We did not want a machine that replaces artisans. We wanted a sketchbook that speaks their "
                "vocabulary, so a designer can say put a kawung field here and a parang border there and get a "
                "draft worth arguing about.",
            ]),
            ("Method", [
                "Each training cloth is annotated with a coarse layout map: motif regions, filler regions and "
                "borders. The diffusion model receives the layout as extra channels and a filler vocabulary token "
                "per region. We tile generation with overlap so repeats line up at the seams [1, 2].",
                "Every photographed cloth was documented with the maker's permission and credited in the dataset card.",
            ]),
            ("Results", [
                "Layout conditioning improves motif fidelity as judged by artisans and keeps repeats seamless "
                "(Table 1). Artisans mostly edited fillers and kept the generated layouts.",
            ]),
            ("Discussion", [
                "Several artisans asked for the opposite tool: take a finished cloth and suggest new fillers. That "
                "inversion is our next study. Questions about ownership of generated drafts came up in every session.",
            ]),
            ("Conclusion", [
                "Structure-aware conditioning turns a generic generator into a useful co-design partner for batik.",
            ]),
        ],
        "figure": "pub-cover-08",
        "figure_caption": "Figure 1. Flow of the layout field used to align repeating motifs across tile seams.",
        "table": [
            ["Model", "Motif fidelity (1 to 5)", "Seam errors", "Useful drafts"],
            ["Unconditioned", "2.3", "31%", "18%"],
            ["Text prompt only", "2.9", "22%", "37%"],
            ["Layout conditioned (ours)", "4.1", "4%", "64%"],
        ],
        "table_caption": "Table 1. Artisan ratings and seam checks over 44 sessions.",
        "references": [
            "Ho, J. et al. Denoising diffusion probabilistic models. NeurIPS, 2020.",
            "Zhang, L. et al. Adding conditional control to text-to-image diffusion models. ICCV, 2023.",
            "Anindya, L. Documenting batik with its makers. Zemi talk notes, 2025.",
            "Rombach, R. et al. High-resolution image synthesis with latent diffusion models. CVPR, 2022.",
        ],
    },
    {
        "id": "paper-06-traffic-rl",
        # slug from PUBLICATION_TYPES / PUBLICATION_STATUSES (packages/shared), for seeding; "type" is the printed label
        "pub_type": "preprint",
        "status": "preprint",
        "type": "Preprint",
        "venue": "arXiv preprint",
        "year": 2026,
        "title": "Teaching Traffic Lights to Take Turns: Multi-Agent Reinforcement Learning for Mixed Motorcycle Traffic",
        "authors": [
            {"name": "Dimas Arya Saputra", "affil": 1, "corresponding": True},
            {"name": "Wahyu Hidayat", "affil": 1},
            {"name": "Maya Kusumawardani", "affil": 2},
        ],
        "affiliations": [LAB, UNI],
        "keywords": ["reinforcement learning", "traffic signal control", "multi-agent systems", "simulation"],
        "abstract": (
            "Traffic signal controllers are usually tuned for cars in neat lanes, while many Indonesian "
            "intersections are dominated by motorcycles that fill every gap. We extend a microscopic simulator "
            "with sub-lane motorcycle behavior calibrated from drone video and train cooperative signal agents "
            "on a 12 intersection corridor. Compared with the fixed-time plan in use, the learned controllers "
            "cut average delay by 19 percent and queue spillback events by 41 percent in simulation."
        ),
        "sections": [
            ("Introduction", [
                "Anyone who has waited at a red light in a sea of motorcycles knows the timing plan was not written "
                "for this. Motorcycles queue differently, start faster and squeeze into space that a car model "
                "treats as empty.",
            ]),
            ("Method", [
                "We calibrate sub-lane movement from 6 hours of drone video at three intersections, then train one "
                "agent per intersection with a shared critic that sees its neighbors. Rewards combine delay and a "
                "penalty for queues that spill into the upstream intersection [1, 4].",
                "To avoid learning tricks that only work in simulation, we randomize demand, driver aggressiveness "
                "and sensor dropouts during training.",
            ]),
            ("Results", [
                "Cooperative agents beat both the fixed plan and independent agents, especially at peak hours "
                "(Table 1). The learned policies mostly shorten cycles when motorcycles dominate the queue.",
            ]),
            ("Discussion", [
                "Simulation gains rarely transfer one to one. We are talking with the city transport office about a "
                "shadow mode trial where the agent suggests timings but a person decides.",
            ]),
            ("Conclusion", [
                "Modeling motorcycles properly changes what a good signal plan looks like, and learning helps find it.",
            ]),
        ],
        "figure": "pub-cover-04",
        "figure_caption": "Figure 1. Average delay per episode during training with the spread across five seeds shaded.",
        "table": [
            ["Controller", "Avg delay", "Spillbacks per hour", "Throughput"],
            ["Fixed-time plan", "74 s", "9.6", "baseline"],
            ["Independent agents", "66 s", "7.1", "+4%"],
            ["Cooperative agents (ours)", "60 s", "5.7", "+7%"],
        ],
        "table_caption": "Table 1. Corridor performance at the evening peak in simulation.",
        "references": [
            "Wei, H. et al. IntelliLight: a reinforcement learning approach for intelligent traffic light control. KDD, 2018.",
            "Lopez, P. A. et al. Microscopic traffic simulation using SUMO. ITSC, 2018.",
            "Saputra, D. A. Calibrating sub-lane motorcycle behavior from drone video. Zemi working notes, 2025.",
            "Lowe, R. et al. Multi-agent actor-critic for mixed cooperative-competitive environments. NeurIPS, 2017.",
            "Chu, T. et al. Multi-agent deep reinforcement learning for large-scale traffic signal control. IEEE T-ITS, 2019.",
        ],
    },
]
