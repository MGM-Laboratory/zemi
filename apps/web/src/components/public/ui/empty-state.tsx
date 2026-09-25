import type { ReactNode } from 'react';
import type { ShapeName } from '@zemi/shared';
import { Character, type CharacterMood } from '@/components/brand/character';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  shape?: ShapeName;
  mood?: CharacterMood;
  /** A second character for company. */
  friend?: ShapeName;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  inverse?: boolean;
}

const SIZE = { sm: 72, md: 104, lg: 148 };

/**
 * Friendly empty / error / success state with a character.
 * @example <EmptyState shape="square" mood="thinking" title="No Fridays match that." body="Try a different tag?" />
 */
export function EmptyState({ title, body, action, shape = 'circle', mood = 'idle', friend, className, size = 'md', inverse }: EmptyStateProps) {
  const px = SIZE[size];
  return (
    <div className={cn('flex flex-col items-center gap-5 px-4 py-12 text-center', className)}>
      <div className="flex items-end gap-2" aria-hidden="true">
        <Character shape={shape} mood={mood} size={px} seed={1} />
        {friend ? <Character shape={friend} mood={mood === 'sleepy' ? 'sleepy' : 'idle'} size={px * 0.66} seed={4} /> : null}
      </div>
      <div className="flex max-w-[34rem] flex-col items-center gap-2">
        <p
          className={cn('display text-title', inverse ? 'text-ink-inverse' : 'text-ink')}
          style={{ fontVariationSettings: "'CASL' 0.6, 'MONO' 0" }}
        >
          {title}
        </p>
        {body ? <div className={cn('text-body-l', inverse ? 'text-ink-inverse/75' : 'text-ink-2')}>{body}</div> : null}
      </div>
      {action ? <div className="mt-2 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </div>
  );
}

/** What pages show when the API can't be reached. */
export function ApiUnavailable({ className, what = 'this' }: { className?: string; what?: string }) {
  return (
    <EmptyState
      className={className}
      shape="square"
      mood="sleepy"
      friend="circle"
      title="The schedule is taking a nap."
      body={`We couldn't load ${what} right now. Give it a minute and refresh. Fridays still happen at 13:15.`}
    />
  );
}
