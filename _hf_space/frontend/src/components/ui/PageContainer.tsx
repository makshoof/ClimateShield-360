import React from 'react';

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
}

/** Shared page shell: 12-column friendly container, consistent padding. */
export const PageContainer: React.FC<PageContainerProps> = ({
  children,
  className = '',
  wide = false,
}) => (
  <div
    className={`w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 flex-1 flex flex-col gap-5 min-h-0 ${
      wide ? 'max-w-[1600px]' : 'max-w-7xl'
    } ${className}`}
  >
    {children}
  </div>
);
