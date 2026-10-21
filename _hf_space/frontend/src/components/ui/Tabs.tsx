import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export interface TabItem {
  id: string;
  label: string;
}

interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({ items, value, onChange, className = '' }) => {
  const reduce = useReducedMotion();
  return (
    <div
      role="tablist"
      className={`relative inline-flex flex-wrap gap-1 p-1 rounded-xl bg-surface-container-high ${className}`}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={`relative z-10 min-h-[40px] px-3 rounded-lg text-xs font-semibold transition-colors ${
              active ? 'text-on-secondary' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {active && (
              <motion.span
                layoutId={reduce ? undefined : 'cs-tab-indicator'}
                className="absolute inset-0 rounded-lg bg-secondary shadow-sm"
                transition={{ duration: 0.2 }}
              />
            )}
            <span className="relative">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};
