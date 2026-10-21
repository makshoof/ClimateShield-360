import React, { useMemo, useState } from 'react';

export interface TableColumn<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render: (row: T) => React.ReactNode;
  className?: string;
}

interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: React.ReactNode;
}

export function Table<T>({ columns, rows, rowKey, empty }: TableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [asc, setAsc] = useState(true);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = String((a as Record<string, unknown>)[sortKey] ?? '');
      const bv = String((b as Record<string, unknown>)[sortKey] ?? '');
      return asc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return copy;
  }, [rows, sortKey, asc]);

  if (rows.length === 0) return <>{empty}</>;

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-outline-variant/30">
      <table className="w-full text-left text-sm min-w-[560px]">
        <thead className="sticky top-0 z-10 bg-surface-container text-on-surface-variant">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={`px-3 py-2.5 font-semibold text-xs ${col.className || ''}`}>
                {col.sortable ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 min-h-[32px]"
                    onClick={() => {
                      if (sortKey === col.key) setAsc(!asc);
                      else {
                        setSortKey(col.key);
                        setAsc(true);
                      }
                    }}
                  >
                    {col.header}
                    <span className="material-symbols-outlined text-[14px]">
                      {sortKey === col.key ? (asc ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                    </span>
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={rowKey(row)} className="border-t border-outline-variant/20 hover:bg-surface-container/50">
              {columns.map((col) => (
                <td key={col.key} className={`px-3 py-2.5 align-top ${col.className || ''}`}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
