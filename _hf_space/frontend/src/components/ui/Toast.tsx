import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

interface ToastItem {
  id: number;
  message: string;
  tone: 'ok' | 'warn' | 'danger';
}

interface ToastContextValue {
  push: (message: string, tone?: ToastItem['tone']) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast requires ToastProvider');
  return ctx;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const reduce = useReducedMotion();

  const push = useCallback((message: string, tone: ToastItem['tone'] = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 3200);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-20 sm:bottom-6 right-4 z-[90] flex flex-col gap-2 max-w-sm">
        <AnimatePresence>
          {items.map((item) => (
            <motion.div
              key={item.id}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className={`rounded-xl border px-3 py-2 text-sm shadow-lg cs-glass ${
                item.tone === 'danger'
                  ? 'border-error/40 text-error'
                  : item.tone === 'warn'
                    ? 'border-amber-500/40 text-amber-800 dark:text-amber-200'
                    : 'border-emerald-500/40 text-emerald-800 dark:text-emerald-200'
              }`}
            >
              {item.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};
