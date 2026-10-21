import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { HourlyUpdateCountdown, StatusBar } from './StatusBar';
import { SampleBanner } from './SampleBanner';
import { ZoneSelector } from './ZoneSelector';
import { CommandPalette } from './CommandPalette';
import { Badge, RouteProgress } from './ui';
import { useTheme } from '../context/ThemeContext';
import { api, formatPKT } from '../api/client';
import { MetaData } from '../types';

interface LayoutProps {
  meta?: MetaData | null;
  isLoadingMeta?: boolean;
}

interface NavItem {
  path: string;
  labelKey: string;
  defaultLabel: string;
  icon: string;
  group: 'monitor' | 'analyse' | 'ops';
}

const NAV_ITEMS: NavItem[] = [
  { path: '/', labelKey: 'nav.overview', defaultLabel: 'Overview', icon: 'dashboard', group: 'monitor' },
  { path: '/risk-map', labelKey: 'nav.riskMap', defaultLabel: 'Risk Map', icon: 'radar', group: 'monitor' },
  { path: '/forecast', labelKey: 'nav.forecast', defaultLabel: 'Heat & Rain Forecast', icon: 'cyclone', group: 'monitor' },
  { path: '/eight-impacts', labelKey: 'nav.eightImpacts', defaultLabel: 'Eight-Impact Analysis', icon: 'grid_view', group: 'analyse' },
  { path: '/data-quality', labelKey: 'nav.dataQuality', defaultLabel: 'Data Quality Center', icon: 'verified_user', group: 'analyse' },
  { path: '/ai-assistant', labelKey: 'nav.aiAssistant', defaultLabel: 'AI Climate Assistant', icon: 'auto_awesome', group: 'analyse' },
  { path: '/emergency-planner', labelKey: 'nav.emergencyPlanner', defaultLabel: 'Emergency Action Planner', icon: 'emergency', group: 'ops' },
  { path: '/system-health', labelKey: 'nav.systemHealth', defaultLabel: 'Automation & System Health', icon: 'health_and_safety', group: 'ops' },
  { path: '/methodology', labelKey: 'nav.methodology', defaultLabel: 'Data Sources & Methodology', icon: 'library_books', group: 'ops' },
];

const MOBILE_PRIMARY = ['/', '/risk-map', '/forecast', '/ai-assistant', '/emergency-planner'];

const GROUP_LABEL: Record<NavItem['group'], string> = {
  monitor: 'Monitor',
  analyse: 'Analyse',
  ops: 'Operate',
};

export const Layout: React.FC<LayoutProps> = ({ meta, isLoadingMeta = false }) => {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const shouldReduceMotion = useReducedMotion();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('cs-sidebar-collapsed') === '1';
    } catch {
      return false;
    }
  });
  const [moreOpen, setMoreOpen] = useState(false);

  const { data: statusRes } = useQuery({
    queryKey: ['pipeline-status'],
    queryFn: api.getStatus,
    refetchInterval: 60000,
  });

  const status = statusRes?.data;
  const indicator = status?.status_indicator || 'unknown';
  const lastRun = status?.latest_successful_run?.started_at || meta?.last_run?.started_at || null;
  // Prefer /api/meta is_live (source freshness); fall back to pipeline status.
  const isLive = meta?.is_live === true || (meta?.is_live !== false && indicator === 'ok');

  useEffect(() => {
    try {
      localStorage.setItem('cs-sidebar-collapsed', collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const toggleLanguage = () => {
    const nextLang = i18n.language === 'ur' ? 'en' : 'ur';
    i18n.changeLanguage(nextLang);
    document.documentElement.dir = nextLang === 'ur' ? 'rtl' : 'ltr';
    document.documentElement.lang = nextLang;
  };

  const isRtl = i18n.language === 'ur';
  const isRiskMap = location.pathname.startsWith('/risk-map');
  const isAssistant = location.pathname.startsWith('/ai-assistant');
  const isImmersive = isRiskMap || isAssistant;
  const pageTitle =
    NAV_ITEMS.find((item) =>
      item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
    )?.defaultLabel || 'ClimateShield 360';

  const grouped = useMemo(() => {
    const map: Record<NavItem['group'], NavItem[]> = { monitor: [], analyse: [], ops: [] };
    NAV_ITEMS.forEach((item) => map[item.group].push(item));
    return map;
  }, []);

  const sidebarWidth = collapsed ? 'sm:w-[72px]' : 'sm:w-[72px] lg:w-[250px]';

  return (
    <div
      className={`${
        isImmersive ? 'h-dvh max-h-dvh overflow-hidden' : 'min-h-screen'
      } bg-background text-on-surface flex flex-col cs-page-grid cs-noise ${
        isRtl ? 'font-urdu' : 'font-sans'
      } antialiased`}
    >
      <RouteProgress />

      <aside
        className={`hidden sm:flex fixed top-0 bottom-0 ${
          isRtl ? 'right-0' : 'left-0'
        } ${sidebarWidth} cs-sidebar-glow text-white z-50 flex-col justify-between border-r border-white/10 transition-[width] duration-200`}
        aria-label="Main Navigation"
      >
        <div className="flex flex-col min-h-0">
          <div className="h-16 px-3 flex items-center gap-2.5 border-b border-white/10">
            <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-white text-[22px]" aria-hidden>
                shield
              </span>
            </div>
            {!collapsed && (
              <div className="hidden lg:flex flex-col min-w-0">
                <span className="font-display font-bold text-sm text-white truncate">ClimateShield 360</span>
                <span className="font-mono text-[10px] text-white uppercase truncate">
                  Sindh PDMA / KMC
                </span>
              </div>
            )}
          </div>

          <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4" aria-label="Console modules">
            {(Object.keys(grouped) as NavItem['group'][]).map((group) => (
              <div key={group}>
                {!collapsed && (
                  <div className="hidden lg:block font-mono text-[10px] uppercase tracking-wider text-white px-2 mb-1">
                    {GROUP_LABEL[group]}
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  {grouped[group].map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.path === '/'}
                      title={item.defaultLabel}
                      className={({ isActive }) =>
                        `relative flex items-center gap-2.5 px-3 py-2.5 rounded-xl min-h-[44px] transition-colors text-white ${
                          collapsed ? 'justify-center' : 'lg:justify-start justify-center'
                        } ${
                          isActive
                            ? 'bg-secondary font-semibold'
                            : 'hover:bg-white/5'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <motion.span
                              layoutId={shouldReduceMotion ? undefined : 'cs-nav-active'}
                              className={`absolute ${isRtl ? 'right-0' : 'left-0'} top-2 bottom-2 w-1 rounded-full bg-cyan-300`}
                            />
                          )}
                          <span className="material-symbols-outlined text-[20px] shrink-0 text-white" aria-hidden>
                            {item.icon}
                          </span>
                          {!collapsed && (
                            <span className="hidden lg:inline truncate text-xs text-white">
                              {t(item.labelKey, item.defaultLabel)}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>

        <div className="p-2 border-t border-white/10 space-y-2 text-white">
          <button
            type="button"
            className="w-full min-h-[44px] rounded-xl hover:bg-white/5 flex items-center justify-center gap-2 text-xs text-white"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span className="material-symbols-outlined text-[18px]">
              {collapsed ? 'keyboard_double_arrow_right' : 'keyboard_double_arrow_left'}
            </span>
            {!collapsed && <span className="hidden lg:inline">Collapse</span>}
          </button>
          <div className={`flex items-center gap-2 px-2 py-1.5 rounded-xl bg-black/25 ${collapsed ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 rounded-full bg-secondary text-white flex items-center justify-center text-xs font-bold">
              DU
            </div>
            {!collapsed && (
              <div className="hidden lg:flex flex-col min-w-0">
                <span className="text-xs font-semibold text-white truncate">Demo user</span>
                <span className="text-[10px] text-white">Read-only console</span>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div
        className={`flex-1 flex flex-col min-w-0 min-h-0 ${
          isImmersive ? 'h-full overflow-hidden' : 'min-h-screen'
        } ${
          isRtl ? (collapsed ? 'sm:mr-[72px]' : 'sm:mr-[72px] lg:mr-[250px]') : collapsed ? 'sm:ml-[72px]' : 'sm:ml-[72px] lg:ml-[250px]'
        }`}
      >
        <header className="sticky top-0 z-40 cs-glass border-b border-outline-variant/30 cs-header-glow">
          <div className="px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-mono uppercase tracking-wider text-on-surface-variant">Climate command centre</p>
                <h1 className="font-display text-sm sm:text-base font-semibold text-on-surface truncate">{pageTitle}</h1>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-end">
              <CommandPalette />
              <div className="hidden lg:block">
                <ZoneSelector />
              </div>
              <HourlyUpdateCountdown />
              <Badge tone={indicator === 'failed' ? 'danger' : indicator === 'late' ? 'warn' : isLive ? 'ok' : 'neutral'}>
                {isLive ? 'Live' : indicator === 'late' ? 'Late' : indicator === 'failed' ? 'Failed' : 'Status'}
              </Badge>
              <button
                type="button"
                onClick={toggleTheme}
                className="min-h-[44px] min-w-[44px] rounded-xl border border-outline-variant/40 bg-surface-container/60"
                aria-label="Toggle theme"
              >
                <span className="material-symbols-outlined text-[20px]">{theme === 'dark' ? 'light_mode' : 'dark_mode'}</span>
              </button>
              <button
                type="button"
                onClick={toggleLanguage}
                className="min-h-[44px] px-3 rounded-xl border border-outline-variant/40 bg-surface-container/60 text-xs font-semibold"
              >
                {i18n.language === 'ur' ? 'EN' : 'اردو'}
              </button>
              <div className="min-h-[44px] flex items-center gap-2 px-2 rounded-xl bg-surface-container/60 border border-outline-variant/30 text-xs">
                <div className="w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center text-[11px] font-bold">
                  DU
                </div>
                <span className="hidden md:inline">Demo user</span>
              </div>
            </div>
          </div>
          <div className="px-4 sm:px-6 lg:px-8 pb-2 overflow-x-auto no-scrollbar">
            <StatusBar meta={meta} isLoading={isLoadingMeta} />
          </div>
          <SampleBanner isSample={meta?.is_sample} />
        </header>

        <main
          className={`w-full flex-1 flex flex-col min-h-0 ${
            isImmersive ? 'overflow-hidden pb-0' : 'pb-4 sm:pb-6'
          }`}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className={`w-full flex-1 flex flex-col min-h-0 ${isImmersive ? 'overflow-hidden' : ''}`}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>

        <footer
          className={`w-full bg-surface-container-high dark:bg-primary-container border-t border-outline-variant/30 py-3 px-4 sm:px-6 lg:px-8 mt-auto mb-14 sm:mb-0 relative z-20 ${
            isImmersive ? 'shrink-0' : ''
          } ${isAssistant ? 'hidden sm:block' : ''}`}
        >
          <div className="max-w-7xl mx-auto flex flex-col gap-1.5 text-xs text-on-surface-variant">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-error text-[18px] shrink-0" aria-hidden>
                warning
              </span>
              <p>
                Information only, not professional advice. In an emergency contact official services (Sindh PDMA 1736 | Rescue 1122).
              </p>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px]">
              <span>v{meta?.version || '0.1.0'}</span>
              <span>Source: Open-Meteo + DuckDB warehouse</span>
              <span>Last refresh: {lastRun ? formatPKT(lastRun) : 'n/a'}</span>
            </div>
          </div>
        </footer>
      </div>

      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-50 h-14 bg-primary-container text-on-primary border-t border-primary flex items-center justify-around px-1 pb-[env(safe-area-inset-bottom)]"
        aria-label="Mobile bottom navigation"
      >
        {NAV_ITEMS.filter((item) => MOBILE_PRIMARY.includes(item.path)).map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 h-full min-h-[44px] text-[10px] ${
                isActive ? 'text-secondary-container font-bold' : 'text-on-primary-container'
              }`
            }
          >
            <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
            <span className="truncate max-w-[64px]">{item.defaultLabel.split(' ')[0]}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className="flex flex-col items-center justify-center flex-1 h-full min-h-[44px] text-[10px] text-on-primary-container"
          onClick={() => setMoreOpen(true)}
        >
          <span className="material-symbols-outlined text-[20px]">more_horiz</span>
          More
        </button>
      </nav>

      {moreOpen && (
        <div className="sm:hidden fixed inset-0 z-[60]">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close more menu" onClick={() => setMoreOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl cs-glass border border-outline-variant/40 p-4 pb-20 space-y-1">
            <p className="text-xs font-semibold text-on-surface mb-2">More pages</p>
            {NAV_ITEMS.filter((item) => !MOBILE_PRIMARY.includes(item.path)).map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-2 min-h-[44px] px-3 rounded-xl hover:bg-surface-container text-sm"
              >
                <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                {item.defaultLabel}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
