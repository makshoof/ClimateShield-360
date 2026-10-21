import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  glass?: boolean;
  hairline?: boolean;
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const padMap = {
  none: '',
  sm: 'p-3',
  md: 'p-4 sm:p-5',
  lg: 'p-5 sm:p-6',
};

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  glass = true,
  hairline = false,
  hover = false,
  padding = 'md',
}) => {
  const reduce = useReducedMotion();
  return (
    <motion.div
      whileHover={hover && !reduce ? { y: -2 } : undefined}
      transition={{ duration: 0.18 }}
      className={`relative rounded-2xl border border-outline-variant/30 ${
        glass ? 'cs-glass' : 'bg-surface-container-lowest'
      } shadow-[var(--cs-shadow-sm)] ${padMap[padding]} ${className}`}
    >
      {hairline && <div className="cs-hairline absolute inset-x-0 top-0 rounded-t-2xl" aria-hidden />}
      {children}
    </motion.div>
  );
};
