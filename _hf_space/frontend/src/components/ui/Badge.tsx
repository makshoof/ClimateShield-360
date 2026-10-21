import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'info';
  className?: string;
}

const tones: Record<NonNullable<BadgeProps['tone']>, string> = {
  neutral: 'bg-surface-container text-on-surface-variant border-outline-variant/40',
  ok: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  warn: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30',
  danger: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
  info: 'bg-cyan-500/15 text-cyan-800 dark:text-cyan-300 border-cyan-500/30',
};

export const Badge: React.FC<BadgeProps> = ({ children, tone = 'neutral', className = '' }) => (
  <span
    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wide border ${tones[tone]} ${className}`}
  >
    {children}
  </span>
);
