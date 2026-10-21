import React, { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

interface SampleBannerProps {
  isSample?: boolean;
}

export const SampleBanner: React.FC<SampleBannerProps> = ({ isSample = false }) => {
  const [dismissed, setDismissed] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  if (!isSample || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        role="status"
        aria-live="polite"
        initial={shouldReduceMotion ? { opacity: 1 } : { height: 0, opacity: 0 }}
        animate={shouldReduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
        exit={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full bg-secondary-fixed/90 dark:bg-primary-container text-on-secondary-fixed dark:text-on-primary border-b border-secondary/20 overflow-hidden"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-1.5 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-[16px] text-secondary shrink-0" aria-hidden="true">
              info
            </span>
            <div className="flex items-center gap-1.5 flex-wrap truncate">
              <span className="font-mono text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-surface-container-lowest dark:bg-black/40 border border-outline-variant/40">
                Sample Data
              </span>
              <span className="text-on-surface-variant dark:text-on-primary-container truncate">
                Operating in demonstration sandbox mode with verified synthetic seeds.
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="w-7 h-7 min-w-[28px] rounded-md hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center transition-colors text-on-surface-variant dark:text-on-primary-container shrink-0"
            title="Dismiss notice"
            aria-label="Dismiss Sample Data Banner"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
