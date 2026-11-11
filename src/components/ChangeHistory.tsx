import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Clock, Trash2 } from 'lucide-react';
import { LogEntry } from '../types';
import { addDay } from '../utils/helpers';

interface ChangeHistoryProps {
  logs: LogEntry[];
  currentTab: string;
  currentLoc: string;
  startDate: string;
  cutDate: string;
  canAdmin: boolean;
  onDeleteOne: (id: string) => void;
  onDeleteAllShown: (ids: string[]) => void;
}

export const ChangeHistory: React.FC<ChangeHistoryProps> = ({
  logs,
  currentTab,
  currentLoc,
  startDate,
  cutDate,
  canAdmin,
  onDeleteOne,
  onDeleteAllShown
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Filter logs according to the active tab:
  const getFilteredLogs = () => {
    if (currentTab === 'users' || currentTab === 'setup' || currentTab === 'master') {
      return logs.filter(x => x.tab === currentTab);
    }
    if (currentTab === 'entry') {
      return logs.filter(x => x.tab === 'entry' && x.loc === currentLoc);
    }
    if (currentTab === 'cash') {
      return logs.filter(
        x =>
          x.tab === 'cash' ||
          (x.tab === 'entry' && x.loc === currentLoc && x.date && x.date >= startDate && x.date <= cutDate) ||
          x.tab === 'master' ||
          x.tab === 'setup'
      );
    }
    // Weekly or monthly summary tab
    let a = startDate;
    let b = cutDate;
    const m = /^w(\d+)$/.exec(currentTab);
    if (m) {
      const weekIndex = parseInt(m[1]);
      a = addDay(startDate, 7 * (weekIndex - 1));
      b = addDay(a, 6);
      if (b > cutDate) b = cutDate;
    }
    return logs.filter(
      x =>
        (x.tab === 'entry' && x.loc === currentLoc && x.date && x.date >= a && x.date <= b) ||
        x.tab === 'master' ||
        x.tab === 'setup'
    );
  };

  const filtered = getFilteredLogs();
  const sorted = [...filtered].reverse();
  const displayed = sorted.slice(0, 200);

  return (
    <div className="mt-8 border-t border-slate-200 dark:border-slate-800 pt-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors py-1 cursor-pointer"
      >
        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <Clock className="w-3.5 h-3.5 text-slate-400" />
        <span>Change History ({filtered.length})</span>
      </button>

      {isOpen && (
        <div className="mt-3 animate-in fade-in duration-150 space-y-2">
          {filtered.length > 0 && canAdmin && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() =>
                  onDeleteAllShown(
                    filtered.map(x => x.id || '').filter(Boolean)
                  )
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-md border border-rose-200 transition-colors dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                Clear {filtered.length} history entries
              </button>
            </div>
          )}

          {filtered.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-2">No changes recorded yet for this view.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2 px-3 w-40 whitespace-nowrap">Timestamp</th>
                    <th className="py-2 px-3 w-36 whitespace-nowrap">User</th>
                    <th className="py-2 px-3 w-28 whitespace-nowrap">Action</th>
                    <th className="py-2 px-3">Details</th>
                    {canAdmin && <th className="py-2 px-3 w-10 text-center"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-600 dark:text-slate-300">
                  {displayed.map((item, idx) => {
                    const formattedDate = new Date(item.t).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    });
                    return (
                      <tr key={item.id || idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-mono text-[11px] whitespace-nowrap text-slate-500">
                          {formattedDate}
                        </td>
                        <td className="py-2 px-3 font-medium whitespace-nowrap">{item.u}</td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {item.act}
                          </span>
                        </td>
                        <td className="py-2 px-3 break-all text-[11px]">{item.desc}</td>
                        {canAdmin && (
                          <td className="py-2 px-3 text-center">
                            {item.id && (
                              <button
                                type="button"
                                onClick={() => onDeleteOne(item.id!)}
                                className="text-slate-400 hover:text-rose-600 p-1 transition-colors"
                                title="Delete entry"
                              >
                                ×
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length > 200 && (
                <div className="py-2 px-3 text-xs text-slate-500 bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800">
                  Showing latest 200 of {filtered.length} changes.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
