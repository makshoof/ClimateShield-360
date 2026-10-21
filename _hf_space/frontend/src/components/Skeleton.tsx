import React from 'react';

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    className={`animate-pulse rounded-lg bg-surface-container-high/60 ${className}`}
    aria-hidden="true"
  />
);

export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    className={`p-5 rounded-2xl bg-surface-container-lowest/70 border border-outline-variant/30 flex flex-col gap-3 shadow-sm ${className}`}
    aria-hidden="true"
  >
    <div className="flex items-center justify-between">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-5 w-16 rounded-full" />
    </div>
    <Skeleton className="h-9 w-36" />
    <Skeleton className="h-3 w-48" />
  </div>
);
