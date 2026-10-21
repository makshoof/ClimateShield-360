import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { ToastProvider, Skeleton } from './components/ui';
import { api } from './api/client';
import { ThemeProvider } from './context/ThemeContext';

const Overview = lazy(() => import('./pages/Overview').then((m) => ({ default: m.Overview })));
const RiskMap = lazy(() => import('./pages/RiskMap').then((m) => ({ default: m.RiskMap })));
const Forecast = lazy(() => import('./pages/Forecast').then((m) => ({ default: m.Forecast })));
const EightImpacts = lazy(() => import('./pages/EightImpacts').then((m) => ({ default: m.EightImpacts })));
const DataQuality = lazy(() => import('./pages/DataQuality').then((m) => ({ default: m.DataQuality })));
const InsightAgent = lazy(() => import('./pages/InsightAgent').then((m) => ({ default: m.InsightAgent })));
const EmergencyPlanner = lazy(() =>
  import('./pages/EmergencyPlanner').then((m) => ({ default: m.EmergencyPlanner }))
);
const PipelineFreshness = lazy(() =>
  import('./pages/PipelineFreshness').then((m) => ({ default: m.PipelineFreshness }))
);
const AboutLimits = lazy(() => import('./pages/AboutLimits').then((m) => ({ default: m.AboutLimits })));

// Match final app: data endpoints refresh on a live cadence; Risk Map zones use 120s.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      refetchInterval: 120000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchIntervalInBackground: false,
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

const PageFallback = () => (
  <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
    <Skeleton className="h-10 w-64" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Skeleton className="h-28" />
      <Skeleton className="h-28" />
      <Skeleton className="h-28" />
    </div>
    <Skeleton className="h-64 w-full" />
  </div>
);

const AppRoutes: React.FC = () => {
  const { data: metaResponse, isLoading } = useQuery({
    queryKey: ['meta'],
    queryFn: api.getMeta,
    refetchInterval: 60000,
  });

  const meta = metaResponse?.data || null;
  const isSample = metaResponse?.is_sample ?? false;

  return (
    <Routes>
      <Route path="/" element={<Layout meta={meta} isLoadingMeta={isLoading} />}>
        <Route
          index
          element={
            <Suspense fallback={<PageFallback />}>
              <Overview isSample={isSample} />
            </Suspense>
          }
        />
        <Route
          path="risk-map"
          element={
            <Suspense fallback={<PageFallback />}>
              <RiskMap isSample={isSample} />
            </Suspense>
          }
        />
        <Route
          path="forecast"
          element={
            <Suspense fallback={<PageFallback />}>
              <Forecast isSample={isSample} />
            </Suspense>
          }
        />
        <Route
          path="eight-impacts"
          element={
            <Suspense fallback={<PageFallback />}>
              <EightImpacts isSample={isSample} />
            </Suspense>
          }
        />
        <Route
          path="data-quality"
          element={
            <Suspense fallback={<PageFallback />}>
              <DataQuality isSample={isSample} />
            </Suspense>
          }
        />
        <Route
          path="ai-assistant"
          element={
            <Suspense fallback={<PageFallback />}>
              <InsightAgent isSample={isSample} />
            </Suspense>
          }
        />
        <Route
          path="emergency-planner"
          element={
            <Suspense fallback={<PageFallback />}>
              <EmergencyPlanner isSample={isSample} />
            </Suspense>
          }
        />
        <Route
          path="system-health"
          element={
            <Suspense fallback={<PageFallback />}>
              <PipelineFreshness isSample={isSample} />
            </Suspense>
          }
        />
        <Route
          path="methodology"
          element={
            <Suspense fallback={<PageFallback />}>
              <AboutLimits isSample={isSample} />
            </Suspense>
          }
        />
        <Route path="insight-agent" element={<Navigate to="/ai-assistant" replace />} />
        <Route path="pipeline-freshness" element={<Navigate to="/system-health" replace />} />
        <Route path="about-limits" element={<Navigate to="/methodology" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
};

export const App: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
