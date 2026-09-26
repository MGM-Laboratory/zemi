'use client';

import { Accordion } from 'radix-ui';
import { useState } from 'react';
import type { Faq as FaqItem, ShapeName } from '@zemi/shared';
import { Character } from '@/components/brand/character';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { SectionHeader } from '@/components/public/ui/section-header';
import { TextLink } from '@/components/public/ui/text-link';
import styles from './about.module.css';

const SHAPES: ShapeName[] = ['circle', 'triangle', 'square', 'arch'];

/** Frequently asked, answered casually. One open at a time; Q looks thoughtful until one is. */
export function Faq({ faqs }: { faqs: FaqItem[] }) {
  const [open, setOpen] = useState<string>('');
  if (!faqs.length) return null;
  const openIndex = faqs.findIndex((f) => f.id === open);

  return (
    <section className={styles.section} aria-labelledby="faq-title">
      <div className={`container-page ${styles.faqGrid}`}>
        <div className={styles.faqAside}>
          <SectionHeader
            id="faq-title"
            eyebrow="Questions"
            eyebrowShape="circle"
            title="You asked. Probably."
            size="m"
            description={
              <>
                Still wondering? <TextLink href="/contact?topic=question">Ask us anything</TextLink>.
              </>
            }
          />
          <div className={styles.faqBuddy} aria-hidden="true">
            <Character
              shape={openIndex >= 0 ? SHAPES[openIndex % 4]! : 'circle'}
              mood={openIndex >= 0 ? 'happy' : 'thinking'}
              size="clamp(72px, 9vw, 120px)"
              key={openIndex >= 0 ? SHAPES[openIndex % 4] : 'none'}
            />
          </div>
        </div>
        <Accordion.Root type="single" collapsible value={open} onValueChange={setOpen} className={styles.faqList}>
          {faqs.map((f, i) => (
            <Accordion.Item key={f.id} value={f.id} className={styles.faqItem}>
              <Accordion.Header asChild>
                <h3>
                  <Accordion.Trigger className={styles.faqTrigger}>
                    <ShapeIcon shape={SHAPES[i % 4]!} size="0.8em" className={styles.faqShape} />
                    <span className="flex-1 text-left">{f.question}</span>
                    <span className={styles.faqPlus} aria-hidden="true" />
                  </Accordion.Trigger>
                </h3>
              </Accordion.Header>
              <Accordion.Content className={styles.faqContent}>
                <p className="max-w-[46rem] whitespace-pre-line pb-6 pl-[calc(0.8em+14px)] text-ink-2">{f.answer}</p>
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      </div>
      <script
        type="application/ld+json"
        // Structured data for search engines. Text only, from the published FAQ.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: faqs.map((f) => ({
              '@type': 'Question',
              name: f.question,
              acceptedAnswer: { '@type': 'Answer', text: f.answer },
            })),
          }).replace(/</g, '\\u003c'),
        }}
      />
    </section>
  );
}
