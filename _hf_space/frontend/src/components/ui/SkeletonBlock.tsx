import React from 'react';

interface SkeletonBlockProps {
  className?: string;
}

export const SkeletonBlock: React.FC<SkeletonBlockProps> = ({ className = 'h-24 w-full' }) => (
  <div className={`cs-skeleton rounded-xl ${className}`} aria-hidden="true" />
);
