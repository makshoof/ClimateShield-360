import React, { useEffect, useState } from 'react';
import { useIsFetching } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';

export const RouteProgress: React.FC = () => {
  const location = useLocation();
  const fetching = useIsFetching();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 350);
    return () => window.clearTimeout(timer);
  }, [location.pathname]);

  useEffect(() => {
    if (fetching > 0) setVisible(true);
    else {
      const timer = window.setTimeout(() => setVisible(false), 200);
      return () => window.clearTimeout(timer);
    }
  }, [fetching]);

  if (!visible) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-0.5 overflow-hidden pointer-events-none">
      <div className="h-full w-1/3 cs-progress-bar bg-[rgb(var(--cs-accent))]" />
    </div>
  );
};
