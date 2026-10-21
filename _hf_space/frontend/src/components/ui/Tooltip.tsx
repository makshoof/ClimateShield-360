import React, { useState } from 'react';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className="absolute z-40 bottom-full left-1/2 -translate-x-1/2 mb-2 max-w-xs rounded-lg bg-primary-container text-on-primary px-2.5 py-1.5 text-[11px] shadow-lg border border-white/10"
        >
          {content}
        </span>
      )}
    </span>
  );
};
