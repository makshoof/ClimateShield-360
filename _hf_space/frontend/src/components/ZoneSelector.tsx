import React from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Listbox, Transition } from '@headlessui/react';

export interface ZoneOption {
  id: string;
  name: string;
  shortName: string;
}

export const KARACHI_ZONES: ZoneOption[] = [
  { id: 'all', name: 'All Karachi Zones (18 Towns / Cantt)', shortName: 'All Karachi' },
  { id: 'KHI-EAST', name: 'Karachi East (Gulshan / Jamshed)', shortName: 'East (Gulshan)' },
  { id: 'KHI-SOUTH', name: 'Karachi South (Saddar / Lyari / Clifton)', shortName: 'South (Saddar)' },
  { id: 'KHI-CENTRAL', name: 'Karachi Central (Nazimabad / Liaquatabad)', shortName: 'Central' },
  { id: 'KHI-KORANGI', name: 'Korangi Industrial / Landhi', shortName: 'Korangi' },
  { id: 'KHI-MALIR', name: 'Malir Basin / Gadap', shortName: 'Malir Basin' },
  { id: 'KHI-WEST', name: 'Karachi West (Orangi / Site / Manghopir)', shortName: 'West (Orangi)' },
  { id: 'KHI-KEAMARI', name: 'Keamari & Karachi Port Coastline', shortName: 'Keamari Port' },
];

export const ZoneSelector: React.FC<{ className?: string }> = ({ className = '' }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const currentZoneId = searchParams.get('zone') || searchParams.get('zone_id') || 'all';
  const selectedZone = KARACHI_ZONES.find((z) => z.id === currentZoneId) || KARACHI_ZONES[0];

  const handleSelect = (zone: ZoneOption) => {
    if (location.pathname === '/risk-map') {
      const next = new URLSearchParams(searchParams);
      if (zone.id === 'all') {
        next.delete('zone');
        next.delete('zone_id');
      } else {
        next.set('zone', zone.id);
      }
      setSearchParams(next);
    } else {
      if (zone.id === 'all') {
        navigate('/risk-map');
      } else {
        navigate(`/risk-map?zone=${zone.id}`);
      }
    }
  };

  return (
    <div className={`relative ${className}`}>
      <Listbox value={selectedZone} onChange={handleSelect}>
        {({ open }) => (
          <>
            <Listbox.Button
              className="min-h-[44px] flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-container/70 dark:bg-surface-container-high/60 hover:bg-surface-container dark:hover:bg-surface-container-high text-on-surface text-xs font-medium border border-outline-variant/40 shadow-xs focus:outline-none focus:ring-2 focus:ring-secondary/50 transition-colors w-full max-w-[240px] sm:max-w-[280px]"
              aria-label="Select Municipal Zone"
            >
              <span className="material-symbols-outlined text-[18px] text-secondary shrink-0" aria-hidden="true">
                location_on
              </span>
              <span className="truncate text-left flex-1 font-sans">{selectedZone.name}</span>
              <span
                className={`material-symbols-outlined text-[18px] text-on-surface-variant transition-transform duration-200 shrink-0 ${
                  open ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              >
                expand_more
              </span>
            </Listbox.Button>

            <Transition
              show={open}
              as={React.Fragment}
              leave="transition ease-in duration-100"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Listbox.Options
                static
                className="absolute left-0 top-full mt-1.5 z-50 w-72 sm:w-80 max-h-72 overflow-y-auto rounded-xl bg-surface-container-lowest dark:bg-inverse-surface text-on-surface dark:text-inverse-on-surface p-1.5 shadow-xl border border-outline-variant/40 focus:outline-none text-xs"
              >
                <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-on-surface-variant dark:text-inverse-on-surface/70 border-b border-outline-variant/20 mb-1">
                  Karachi Administrative Zones
                </div>
                {KARACHI_ZONES.map((zone) => (
                  <Listbox.Option
                    key={zone.id}
                    value={zone}
                    className={({ active, selected }) =>
                      `flex items-center justify-between min-h-[40px] px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                        selected
                          ? 'bg-secondary text-on-secondary font-semibold'
                          : active
                          ? 'bg-surface-container dark:bg-surface-container-high'
                          : 'text-on-surface dark:text-inverse-on-surface'
                      }`
                    }
                  >
                    {({ selected }) => (
                      <>
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              zone.id === 'all'
                                ? 'bg-secondary'
                                : zone.id === 'KHI-SOUTH' || zone.id === 'KHI-MALIR' || zone.id === 'KHI-CENTRAL'
                                ? 'bg-error'
                                : 'bg-[#f59e0b]'
                            }`}
                          />
                          <span className="truncate">{zone.name}</span>
                        </div>
                        {selected && (
                          <span className="material-symbols-outlined text-[16px] shrink-0" aria-hidden="true">
                            check
                          </span>
                        )}
                      </>
                    )}
                  </Listbox.Option>
                ))}
              </Listbox.Options>
            </Transition>
          </>
        )}
      </Listbox>
    </div>
  );
};
