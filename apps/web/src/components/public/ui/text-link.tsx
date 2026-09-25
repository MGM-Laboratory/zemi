import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TextLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  /** Opens in a new tab with safe rel and a small arrow. Auto for absolute http(s) URLs. */
  external?: boolean;
  /** 'blue' inline link (default) or 'ink' for nav-ish lists, 'paper' on dark. */
  tone?: 'blue' | 'ink' | 'paper';
}

const TONE = {
  blue: 'text-blue-600 decoration-blue/35 hover:decoration-blue',
  ink: 'text-ink decoration-ink/25 hover:decoration-ink',
  paper: 'text-white decoration-white/35 hover:decoration-white',
};

/**
 * Inline text link with an underline that thickens on hover.
 * @example <TextLink href="https://labmgm.org">MGM Lab</TextLink>
 */
export function TextLink({ href, children, className, external, tone = 'blue' }: TextLinkProps) {
  const isExternal = external ?? /^https?:\/\//.test(href);
  const cls = cn(
    'font-semibold underline decoration-[0.08em] underline-offset-[0.2em] transition-[text-decoration-color,text-decoration-thickness] duration-200 hover:decoration-[0.14em]',
    TONE[tone],
    className,
  );
  if (isExternal || href.startsWith('mailto:') || href.startsWith('tel:')) {
    return (
      <a href={href} className={cls} {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : null)}>
        {children}
        {isExternal ? <ArrowUpRight className="ml-0.5 inline size-[0.9em] align-[-0.1em]" aria-hidden="true" /> : null}
        {isExternal ? <span className="sr-only"> (opens in a new tab)</span> : null}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}
