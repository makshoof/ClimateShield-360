import React from 'react';

interface EmptyStateBoxProps {
  icon?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export const EmptyStateBox: React.FC<EmptyStateBoxProps> = ({
  icon = 'inbox',
  title,
  description,
  action,
}) => (
  <div className="rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-low/60 px-5 py-8 text-center">
    <span className="material-symbols-outlined text-3xl text-on-surface-variant" aria-hidden>
      {icon}
    </span>
    <h3 className="mt-2 font-display font-semibold text-on-surface">{title}</h3>
    <p className="mt-1 text-sm text-on-surface-variant max-w-md mx-auto">{description}</p>
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>
);
