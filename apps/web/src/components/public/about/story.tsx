import type { Blocks } from '@zemi/shared';
import { Character } from '@/components/brand/character';
import { BlocksRenderer, hasBlocks } from '@/components/public/media/blocks-renderer';
import { SectionHeader } from '@/components/public/ui/section-header';
import styles from './about.module.css';

/** The story, straight from the site settings (BlockNote). Hidden when an admin empties it. */
export function Story({ blocks }: { blocks: Blocks }) {
  if (!hasBlocks(blocks)) return null;
  return (
    <section className={styles.section} aria-labelledby="story-title">
      <div className={`container-page ${styles.storyGrid}`}>
        <div className={styles.storyAside}>
          <SectionHeader id="story-title" eyebrow="The story" eyebrowShape="arch" title="The story so far." size="m" />
          <div className="mt-8 flex items-end gap-2" aria-hidden="true">
            <Character shape="square" mood="sleepy" size={62} seed={4} />
            <Character shape="circle" mood="thinking" size={50} seed={5} />
            <Character shape="triangle" size={44} seed={6} />
          </div>
        </div>
        <div className={styles.storyBody}>
          <BlocksRenderer blocks={blocks} size="lg" headingOffset={1} />
        </div>
      </div>
    </section>
  );
}
