import React from 'react';
import { useReducedMotion } from 'framer-motion';
import { RiskLevel } from '../types';

interface RiskBadgeProps {
  level: RiskLevel;
  label?: string;
  value?: string | number;
  className?: string;
}

const RISK_CONFIG: Record<
  RiskLevel,
  {
    bg: string;
    text: string;
    border: string;
    icon: string;
    defaultLabel: string;
  }
> = {
  Low: {
    bg: 'bg-[#ECFDF5] dark:bg-[#064E3B]/30',
    text: 'text-[#059669] dark:text-[#34D399]',
    border: 'border-[#A7F3D0] dark:border-[#059669]/50',
    icon: 'check_circle',
    defaultLabel: 'Low (Green)',
  },
  Moderate: {
    bg: 'bg-[#FEF3C7] dark:bg-[#78350F]/30',
    text: 'text-[#B45309] dark:text-[#FBBF24]',
    border: 'border-[#FDE68A] dark:border-[#B45309]/50',
    icon: 'warning',
    defaultLabel: 'Moderate (Yellow)',
  },
  High: {
    bg: 'bg-[#FFEDD5] dark:bg-[#7C2D12]/30',
    text: 'text-[#C2410C] dark:text-[#FB923C]',
    border: 'border-[#FED7AA] dark:border-[#C2410C]/50',
    icon: 'warning',
    defaultLabel: 'High (Orange)',
  },
  Severe: {
    bg: 'bg-[#FEE2E2] dark:bg-[#7F1D1D]/30',
    text: 'text-[#B91C1C] dark:text-[#F87171]',
    border: 'border-[#FECACA] dark:border-[#B91C1C]/50',
    icon: 'crisis_alert',
    defaultLabel: 'Severe (Red)',
  },
};

export const RiskBadge: React.FC<RiskBadgeProps> = ({
  level,
  label,
  value,
  className = '',
}) => {
  const shouldReduceMotion = useReducedMotion();
  const config = RISK_CONFIG[level] || RISK_CONFIG.Low;
  const displayLabel = label || config.defaultLabel;
  const isSevere = level === 'Severe';

  return (
    <span
      className={`relative inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold font-mono border ${config.bg} ${config.text} ${config.border} shadow-xs select-none transition-transform hover:scale-[1.02] ${className}`}
      role="status"
      aria-label={`Risk Level: ${level}`}
    >
      {/* Animated pulse ping ONLY for Severe (Rule 9 & 10) */}
      {isSevere && !shouldReduceMotion && (
        <span className="relative flex h-2 w-2 mr-0.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#B91C1C] opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#B91C1C]" />
        </span>
      )}

      <span
        className="material-symbols-outlined text-[14px] leading-none shrink-0"
        aria-hidden="true"
      >
        {config.icon}
      </span>
      <span className="truncate">{displayLabel}</span>
      {value !== undefined && (
        <span className="font-bold border-l pl-1 border-current opacity-90 tabular-nums">
          {value}
        </span>
      )}
    </span>
  );
};
