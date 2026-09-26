'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import type { EventCard } from '@zemi/shared';
import { Character } from '@/components/brand/character';
import { useSiteReady } from '@/components/brand/site-loader';
import { CaslHeading } from '@/components/motion/casl-heading';
import { Eyebrow } from '@/components/public/ui/section-header';
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import styles from './contact.module.css';
import { ContactDetails } from './contact-details';
import { ContactForm, type SentMessage } from './contact-form';
import { ContactSuccess } from './contact-success';
import type { PublicContact } from './lib';
import { PlaneDock, PlaneStage, usePlane } from './plane-layer';

export interface ContactViewProps {
  contact: PublicContact;
  initialTopic: string;
  nextEvent: EventCard | null;
}

/** /contact: "Say hi." with the paper plane form and every other way to reach the crew. */
export function ContactView(props: ContactViewProps) {
  return (
    <PlaneStage>
      <ContactInner {...props} />
    </PlaneStage>
  );
}

function ContactInner({ contact, initialTopic, nextEvent }: ContactViewProps) {
  const ready = useSiteReady();
  const plane = usePlane();
  const reduced = useReducedMotion();
  const [sent, setSent] = useState<SentMessage | null>(null);
  const [round, setRound] = useState(0);

  const another = () => {
    setSent(null);
    setRound((r) => r + 1);
    plane.comeBack();
  };

  const fade = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }
    : {
        initial: { opacity: 0, y: 18, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: -12, scale: 0.98 },
        transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const },
      };

  return (
    <section className={cn('container-page', styles.page)} aria-labelledby="contact-title">
      <div className={styles.head}>
        <Eyebrow shape="arch">Contact</Eyebrow>
        <div className="relative w-fit max-w-full pr-[clamp(48px,6vw,96px)]">
          <CaslHeading as="h1" id="contact-title" size="l" reveal={{ play: ready }} className="text-ink">
            {contact.title}
          </CaslHeading>
          <span className={styles.wave} aria-hidden="true">
            <Character shape="circle" mood="happy" size="clamp(40px, 5vw, 76px)" seed={0} />
          </span>
        </div>
        <p className="text-body-l max-w-[34rem] text-ink-2">{contact.intro}</p>
      </div>

      <div className={styles.formCol}>
        <div className={styles.card}>
          <PlaneDock className={styles.dockSpot} />
          <AnimatePresence mode="wait" initial={false}>
            {sent ? (
              <motion.div key="sent" {...fade}>
                <ContactSuccess sent={sent} onAnother={another} />
              </motion.div>
            ) : (
              <motion.div key={`form-${round}`} {...fade}>
                <ContactForm topics={contact.topics} initialTopic={initialTopic} fallbackEmail={contact.email} onSent={setSent} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className={styles.detailsCol}>
        <ContactDetails contact={contact} nextEvent={nextEvent} />
      </div>
    </section>
  );
}
