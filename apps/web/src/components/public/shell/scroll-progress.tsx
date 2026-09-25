'use client';

import { motion, useScroll, useSpring, useTransform } from 'motion/react';
import styles from './shell.module.css';

/**
 * 3px reading progress along the top edge, striped in the four brand colors.
 * Invisible at the very top so it never competes with the hero.
 */
export function ScrollProgress({ className }: { className?: string }) {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 220, damping: 34, restDelta: 0.001 });
  const opacity = useTransform(scrollYProgress, [0, 0.02], [0, 1]);
  return <motion.div className={`${styles.progress} ${className ?? ''}`} style={{ scaleX, opacity }} aria-hidden="true" />;
}
