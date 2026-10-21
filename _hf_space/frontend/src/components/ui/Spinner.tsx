import React from 'react';

export const Spinner: React.FC<{ size?: 'sm' | 'md' }> = ({ size = 'md' }) => (
  <span
    className={`inline-block rounded-full border-2 border-current border-r-transparent animate-spin ${
      size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'
    }`}
    role="status"
    aria-label="Loading"
  />
);
