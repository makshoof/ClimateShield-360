import React, { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

interface DrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  side?: 'right' | 'bottom';
}

export const Drawer: React.FC<DrawerProps> = ({
  open,
  title,
  onClose,
  children,
  side = 'right',
}) => {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const panelClass =
    side === 'bottom'
      ? 'inset-x-0 bottom-0 max-h-[80vh] rounded-t-2xl'
      : 'inset-y-0 right-0 w-full max-w-md rounded-l-2xl';

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70]">
          <motion.button
            type="button"
            aria-label="Close drawer"
            className="absolute inset-0 bg-black/45"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`absolute ${panelClass} cs-glass border border-outline-variant/40 shadow-[var(--cs-shadow-md)] flex flex-col`}
            initial={reduce ? false : side === 'bottom' ? { y: '100%' } : { x: '100%' }}
            animate={side === 'bottom' ? { y: 0 } : { x: 0 }}
            exit={reduce ? undefined : side === 'bottom' ? { y: '100%' } : { x: '100%' }}
            transition={{ duration: 0.25 }}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-outline-variant/30">
              <h2 className="font-display font-semibold text-on-surface truncate">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] min-w-[44px] rounded-xl hover:bg-surface-container"
                aria-label="Close drawer"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
};
