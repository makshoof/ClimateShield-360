import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from './ui/Modal';

const ROUTES = [
  { path: '/', label: 'Overview' },
  { path: '/risk-map', label: 'Risk Map' },
  { path: '/forecast', label: 'Heat & Rain Forecast' },
  { path: '/eight-impacts', label: 'Eight-Impact Analysis' },
  { path: '/data-quality', label: 'Data Quality Center' },
  { path: '/ai-assistant', label: 'AI Climate Assistant' },
  { path: '/emergency-planner', label: 'Emergency Action Planner' },
  { path: '/system-health', label: 'Automation & System Health' },
  { path: '/methodology', label: 'Data Sources & Methodology' },
];

export const CommandPalette: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ROUTES;
    return ROUTES.filter((route) => route.label.toLowerCase().includes(q) || route.path.includes(q));
  }, [query]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:inline-flex items-center gap-2 min-h-[40px] px-3 rounded-xl border border-outline-variant/40 bg-surface-container/60 text-xs text-on-surface-variant hover:text-on-surface"
        aria-label="Open command palette"
      >
        <span className="material-symbols-outlined text-[16px]">search</span>
        Jump to page
        <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-container-highest">Ctrl+K</kbd>
      </button>
      <Modal
        open={open}
        title="Command palette"
        onClose={() => {
          setOpen(false);
          setQuery('');
        }}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a page name"
          className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2.5 text-sm mb-3"
        />
        <ul className="max-h-64 overflow-y-auto space-y-1">
          {filtered.map((route) => (
            <li key={route.path}>
              <button
                type="button"
                className="w-full text-left rounded-xl px-3 py-2.5 min-h-[44px] hover:bg-surface-container text-sm"
                onClick={() => {
                  navigate(route.path);
                  setOpen(false);
                  setQuery('');
                }}
              >
                {route.label}
                <span className="ml-2 font-mono text-[10px] text-on-surface-variant">{route.path}</span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-on-surface-variant">No matching page.</li>
          )}
        </ul>
      </Modal>
    </>
  );
};
