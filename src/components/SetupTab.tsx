import React, { useState, useEffect } from 'react';
import {
  Calendar,
  MapPin,
  Users2,
  RotateCcw,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Check,
  Star,
  X,
  Server,
  Download,
  Terminal,
  ExternalLink,
  FileText,
  Printer
} from 'lucide-react';
import { AppState } from '../types';
import { fd, getSeedState } from '../utils/helpers';
import { ChangeHistory } from './ChangeHistory';

interface SetupTabProps {
  state: AppState;
  canAdmin: boolean;
  canChangeLoc: boolean;
  canChangeStart: boolean;
  canChangeCut: boolean;
  onUpdateState: (updater: (prev: AppState) => AppState, actionDescription?: string) => void;
  onAskConfirm: (message: string, onConfirm: () => void) => void;
}

export const SetupTab: React.FC<SetupTabProps> = ({
  state,
  canAdmin,
  canChangeLoc,
  canChangeStart,
  canChangeCut,
  onUpdateState,
  onAskConfirm
}) => {
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  // Controlled draft state for smooth editing without unmount/focus race conditions
  const [locsDraft, setLocsDraft] = useState<string[]>(() =>
    Array.isArray(state.locs) ? [...state.locs] : ['Main Store']
  );
  const [cashiersDraft, setCashiersDraft] = useState<string[]>(() =>
    Array.isArray(state.cashiers) ? [...state.cashiers] : []
  );

  // New location and new cashier input states
  const [newLocName, setNewLocName] = useState('');
  const [newCashierName, setNewCashierName] = useState('');

  // Synchronize drafts when remote state changes
  useEffect(() => {
    if (Array.isArray(state.locs)) {
      setLocsDraft([...state.locs]);
    }
  }, [state.locs]);

  useEffect(() => {
    if (Array.isArray(state.cashiers)) {
      setCashiersDraft([...state.cashiers]);
    }
  }, [state.cashiers]);

  const showFeedback = (text: string, isError = false) => {
    setMsg({ text, error: isError });
    setTimeout(() => {
      setMsg(null);
    }, 4000);
  };

  const canEditLocsAndCashiers = canAdmin || canChangeLoc;

  // Active inventory location selector
  const handleInvLocationChange = (newLoc: string) => {
    onUpdateState(
      prev => ({ ...prev, inv: newLoc }),
      `Active Branch changed to "${newLoc}"`
    );
    showFeedback(`Active branch set to "${newLoc}"`);
  };

  const handleStartDateChange = (newStart: string) => {
    onUpdateState(
      prev => ({ ...prev, start: newStart }),
      `Start Date changed to ${fd(newStart)}`
    );
    showFeedback(`Start date updated to ${fd(newStart)}`);
  };

  const handleCutDateChange = (newCut: string) => {
    onUpdateState(
      prev => ({ ...prev, cut: newCut }),
      `Cut Off Date changed to ${fd(newCut)}`
    );
    showFeedback(`Cut off date updated to ${fd(newCut)}`);
  };

  // --- BRANCH LOCATIONS MANAGEMENT ---
  const handleAddNewLocation = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = newLocName.trim();
    if (!clean) {
      showFeedback('Please enter a branch location name.', true);
      return;
    }

    const currentLocs = Array.isArray(state.locs) ? state.locs : [];
    if (currentLocs.some(l => l.toLowerCase() === clean.toLowerCase())) {
      showFeedback(`Branch location "${clean}" already exists.`, true);
      return;
    }

    const updated = [...currentLocs, clean];
    setLocsDraft(updated);
    setNewLocName('');

    onUpdateState(
      prev => ({
        ...prev,
        locs: updated,
        inv: prev.inv || clean
      }),
      `New branch added: "${clean}"`
    );
    showFeedback(`Branch location "${clean}" added and saved!`);
  };

  const handleSaveRenameLocation = (index: number) => {
    const oldName = state.locs[index];
    const draftName = locsDraft[index] || '';
    const clean = draftName.trim();

    if (!clean) {
      showFeedback('Branch name cannot be empty.', true);
      setLocsDraft(state.locs);
      return;
    }

    if (clean === oldName) {
      return;
    }

    // Check duplicate
    const isDuplicate = state.locs.some(
      (l, idx) => idx !== index && l.toLowerCase() === clean.toLowerCase()
    );
    if (isDuplicate) {
      showFeedback(`Another branch with name "${clean}" already exists.`, true);
      setLocsDraft(state.locs);
      return;
    }

    onUpdateState(prev => {
      const updatedLocs = [...prev.locs];
      updatedLocs[index] = clean;

      // Propagate location rename across entire ledger
      const updatedRows = (prev.rows || []).map(r => ({
        ...r,
        loc: r.loc === oldName ? clean : r.loc,
        tfl: r.tfl === oldName ? clean : r.tfl,
        ttl: r.ttl === oldName ? clean : r.ttl
      }));

      const updatedCash: Record<string, number | ''> = {};
      Object.keys(prev.cash || {}).forEach(k => {
        if (k.startsWith(oldName + '|')) {
          updatedCash[clean + '|' + k.slice(oldName.length + 1)] = prev.cash[k];
        } else {
          updatedCash[k] = prev.cash[k];
        }
      });

      const updatedCinfo: Record<string, any> = {};
      Object.keys(prev.cinfo || {}).forEach(k => {
        if (k.startsWith(oldName + '|')) {
          updatedCinfo[clean + '|' + k.slice(oldName.length + 1)] = prev.cinfo[k];
        } else {
          updatedCinfo[k] = prev.cinfo[k];
        }
      });

      const updatedCpay: Record<string, number> = {};
      Object.keys(prev.cpay || {}).forEach(k => {
        if (k.startsWith(oldName + '|')) {
          updatedCpay[clean + '|' + k.slice(oldName.length + 1)] = prev.cpay[k];
        } else {
          updatedCpay[k] = prev.cpay[k];
        }
      });

      const updatedUsers = (prev.users || []).map(u => ({
        ...u,
        locs: (u.locs || []).map(l => (l === oldName ? clean : l))
      }));

      return {
        ...prev,
        locs: updatedLocs,
        inv: prev.inv === oldName ? clean : prev.inv,
        rows: updatedRows,
        cash: updatedCash,
        cinfo: updatedCinfo,
        cpay: updatedCpay,
        users: updatedUsers
      };
    }, `Branch renamed: "${oldName}" → "${clean}"`);

    showFeedback(`Branch renamed to "${clean}" and synchronized!`);
  };

  const handleDeleteLocation = (index: number) => {
    const loc = state.locs[index];
    if (state.locs.length <= 1) {
      showFeedback('At least one branch location must remain in the system.', true);
      return;
    }

    onAskConfirm(`Remove branch location "${loc}"? All records will preserve history, but the location will be removed from future selection.`, () => {
      onUpdateState(
        prev => {
          const newLocs = prev.locs.filter((_, i) => i !== index);
          return {
            ...prev,
            locs: newLocs,
            inv: prev.inv === loc ? newLocs[0] || 'Main Store' : prev.inv,
            users: (prev.users || []).map(u => ({
              ...u,
              locs: (u.locs || []).filter(l => l !== loc)
            }))
          };
        },
        `Branch location removed: "${loc}"`
      );
      showFeedback(`Branch location "${loc}" removed.`);
    });
  };

  // --- CASHIER DIRECTORY MANAGEMENT ---
  const handleAddNewCashier = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = newCashierName.trim();
    if (!clean) {
      showFeedback('Please enter cashier full name.', true);
      return;
    }

    const currentCashiers = Array.isArray(state.cashiers) ? state.cashiers : [];
    if (currentCashiers.some(c => c.toLowerCase() === clean.toLowerCase())) {
      showFeedback(`Cashier "${clean}" is already in the directory.`, true);
      return;
    }

    const updated = [...currentCashiers, clean];
    setCashiersDraft(updated);
    setNewCashierName('');

    onUpdateState(
      prev => ({
        ...prev,
        cashiers: updated
      }),
      `Cashier added: "${clean}"`
    );
    showFeedback(`Cashier "${clean}" added to directory and saved!`);
  };

  const handleSaveRenameCashier = (index: number) => {
    const oldName = state.cashiers[index];
    const draftName = cashiersDraft[index] || '';
    const clean = draftName.trim();

    if (!clean) {
      showFeedback('Cashier name cannot be empty.', true);
      setCashiersDraft(state.cashiers);
      return;
    }

    if (clean === oldName) {
      return;
    }

    // Check duplicate
    const isDuplicate = state.cashiers.some(
      (c, idx) => idx !== index && c.toLowerCase() === clean.toLowerCase()
    );
    if (isDuplicate) {
      showFeedback(`Cashier "${clean}" already exists in the directory.`, true);
      setCashiersDraft(state.cashiers);
      return;
    }

    onUpdateState(prev => {
      const nextCashiers = [...prev.cashiers];
      nextCashiers[index] = clean;

      const nextCinfo = { ...(prev.cinfo || {}) };
      Object.keys(nextCinfo).forEach(k => {
        if (nextCinfo[k]?.cashier === oldName) {
          nextCinfo[k] = { ...nextCinfo[k], cashier: clean };
        }
      });

      return {
        ...prev,
        cashiers: nextCashiers,
        cinfo: nextCinfo
      };
    }, `Cashier renamed: "${oldName}" → "${clean}"`);

    showFeedback(`Cashier renamed to "${clean}" and synchronized!`);
  };

  const handleDeleteCashier = (index: number) => {
    const name = state.cashiers[index];
    onAskConfirm(`Remove cashier "${name}" from directory?`, () => {
      onUpdateState(
        prev => ({
          ...prev,
          cashiers: (prev.cashiers || []).filter((_, i) => i !== index)
        }),
        `Cashier removed: "${name}"`
      );
      showFeedback(`Cashier "${name}" removed.`);
    });
  };

  const handleRestoreSampleData = () => {
    onAskConfirm(
      'Replace all settings, locations, cashiers, item master, and data entries with the default sample data?\n(Existing change logs will be retained).',
      () => {
        const seed = getSeedState();
        onUpdateState(
          prev => ({
            ...seed,
            log: [
              ...(prev.log || []),
              {
                t: new Date().toISOString(),
                u: 'Admin',
                tab: 'setup',
                act: 'Restored sample data',
                desc: 'All settings and records reset to default sample dataset',
                loc: seed.inv
              }
            ]
          }),
          'Sample data restored'
        );
        showFeedback('Sample data has been restored successfully.');
      }
    );
  };

  const currentLocsList = Array.isArray(state.locs) ? state.locs : [];
  const currentCashiersList = Array.isArray(state.cashiers) ? state.cashiers : [];

  return (
    <div className="space-y-6">
      {/* Toast Feedback Banner */}
      {msg && (
        <div
          className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between gap-3 shadow-xs transition-all ${
            msg.error
              ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-900'
              : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {msg.error ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            )}
            <span>{msg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setMsg(null)}
            className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-md cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* Inventory Period Card */}
        <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold text-sm pb-2 border-b border-slate-200 dark:border-slate-800">
            <Calendar className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            <span>Inventory Period & Active Branch</span>
          </div>

          <div className="space-y-3.5 text-xs">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                Active Store / Branch Location:
              </label>
              <select
                disabled={!canChangeLoc}
                value={state.inv}
                onChange={e => handleInvLocationChange(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 cursor-pointer shadow-2xs"
              >
                {currentLocsList.map(l => (
                  <option key={l} value={l} className="dark:bg-slate-900 font-medium">
                    {l}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Start Date:
                </label>
                <input
                  type="date"
                  disabled={!canChangeStart}
                  value={state.start}
                  onChange={e => handleStartDateChange(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono font-medium bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 cursor-pointer shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Cut Off Date:
                </label>
                <input
                  type="date"
                  disabled={!canChangeCut}
                  value={state.cut}
                  onChange={e => handleCutDateChange(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono font-medium bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 cursor-pointer shadow-2xs"
                />
              </div>
            </div>
          </div>
        </div>

        {/* System & Data Management Card */}
        <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold text-sm pb-2 border-b border-slate-200 dark:border-slate-800">
            <RotateCcw className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            <span>Sample Data & Factory Reset</span>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Need to test standard records or reset changes? Restoring sample data populates official sample
            items, past shift records, and standard branch locations.
          </p>

          {canAdmin && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleRestoreSampleData}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg border border-slate-300 dark:border-slate-700 transition-colors cursor-pointer shadow-2xs"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Restore Sample Data</span>
              </button>
            </div>
          )}
        </div>

        {/* Branch Locations Card */}
        <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold text-sm">
              <MapPin className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <span>Branch Locations ({currentLocsList.length})</span>
            </div>
          </div>

          {/* Dedicated Add Location Form */}
          {canEditLocsAndCashiers && (
            <form onSubmit={handleAddNewLocation} className="flex gap-2">
              <input
                type="text"
                value={newLocName}
                onChange={e => setNewLocName(e.target.value)}
                placeholder="Enter new branch name (e.g. YTMI Branch 2)..."
                className="flex-1 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 font-medium"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-2xs transition-colors cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Branch</span>
              </button>
            </form>
          )}

          {/* Locations List */}
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {currentLocsList.map((loc, i) => {
              const draftVal = locsDraft[i] !== undefined ? locsDraft[i] : loc;
              const hasDraftChanges = draftVal.trim() !== loc && draftVal.trim().length > 0;
              const isActive = state.inv === loc;

              return (
                <div
                  key={i}
                  className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${
                    isActive
                      ? 'bg-teal-50/50 dark:bg-teal-950/20 border-teal-300 dark:border-teal-800'
                      : 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/80'
                  }`}
                >
                  <MapPin className={`w-4 h-4 shrink-0 ${isActive ? 'text-teal-700 dark:text-teal-400' : 'text-slate-400'}`} />

                  {/* Controlled input */}
                  <input
                    type="text"
                    disabled={!canEditLocsAndCashiers}
                    value={draftVal}
                    onChange={e => {
                      const updated = [...locsDraft];
                      updated[i] = e.target.value;
                      setLocsDraft(updated);
                    }}
                    onBlur={() => {
                      if (hasDraftChanges) handleSaveRenameLocation(i);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveRenameLocation(i);
                      }
                    }}
                    placeholder="Branch name"
                    className="flex-1 min-w-0 px-2.5 py-1 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-600"
                  />

                  {/* Save button if dirty */}
                  {hasDraftChanges && (
                    <button
                      type="button"
                      onClick={() => handleSaveRenameLocation(i)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded shadow-xs cursor-pointer shrink-0"
                      title="Save branch name change"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Save</span>
                    </button>
                  )}

                  {/* Active Branch indicator or button */}
                  {isActive ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200 shrink-0">
                      <Star className="w-3 h-3 fill-current" />
                      <span>Active</span>
                    </span>
                  ) : (
                    canChangeLoc && (
                      <button
                        type="button"
                        onClick={() => handleInvLocationChange(loc)}
                        className="px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-400 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-slate-700 rounded border border-slate-200 dark:border-slate-700 shrink-0 cursor-pointer transition-colors"
                        title="Set as active store location"
                      >
                        Set Active
                      </button>
                    )
                  )}

                  {/* Delete button */}
                  {canEditLocsAndCashiers && currentLocsList.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteLocation(i)}
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition-colors cursor-pointer shrink-0"
                      title={`Delete "${loc}"`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Cashier Directory Card */}
        <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold text-sm">
              <Users2 className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <span>Cashier Directory ({currentCashiersList.length})</span>
            </div>
          </div>

          {/* Dedicated Add Cashier Form */}
          {canEditLocsAndCashiers && (
            <form onSubmit={handleAddNewCashier} className="flex gap-2">
              <input
                type="text"
                value={newCashierName}
                onChange={e => setNewCashierName(e.target.value)}
                placeholder="Enter cashier full name (e.g. Maria Santos)..."
                className="flex-1 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 font-medium"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-2xs transition-colors cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Cashier</span>
              </button>
            </form>
          )}

          {/* Cashiers List */}
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {currentCashiersList.map((cashier, i) => {
              const draftVal = cashiersDraft[i] !== undefined ? cashiersDraft[i] : cashier;
              const hasDraftChanges = draftVal.trim() !== cashier && draftVal.trim().length > 0;

              return (
                <div
                  key={i}
                  className="flex items-center gap-2 p-2 rounded-lg border bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/80 transition-all"
                >
                  <Users2 className="w-4 h-4 text-slate-400 shrink-0" />

                  {/* Controlled input */}
                  <input
                    type="text"
                    disabled={!canEditLocsAndCashiers}
                    value={draftVal}
                    onChange={e => {
                      const updated = [...cashiersDraft];
                      updated[i] = e.target.value;
                      setCashiersDraft(updated);
                    }}
                    onBlur={() => {
                      if (hasDraftChanges) handleSaveRenameCashier(i);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveRenameCashier(i);
                      }
                    }}
                    placeholder="Cashier name"
                    className="flex-1 min-w-0 px-2.5 py-1 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-600"
                  />

                  {/* Save button if dirty */}
                  {hasDraftChanges && (
                    <button
                      type="button"
                      onClick={() => handleSaveRenameCashier(i)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded shadow-xs cursor-pointer shrink-0"
                      title="Save cashier name change"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Save</span>
                    </button>
                  )}

                  {/* Delete button */}
                  {canEditLocsAndCashiers && (
                    <button
                      type="button"
                      onClick={() => handleDeleteCashier(i)}
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition-colors cursor-pointer shrink-0"
                      title={`Delete "${cashier}"`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}

            {currentCashiersList.length === 0 && (
              <p className="text-xs text-slate-400 py-3 text-center italic">
                No cashiers registered yet. Add one above.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Windows Host Server Station Card */}
      <div className="rounded-xl border border-teal-300 dark:border-teal-750 bg-gradient-to-br from-white to-teal-50/40 dark:from-slate-900 dark:to-teal-950/20 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-teal-200 dark:border-teal-800">
          <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold text-sm">
            <Server className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            <span>Windows Host Server & Local Network Station</span>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 border border-teal-300 dark:border-teal-800">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Local Port 3000 Active</span>
          </span>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          Run your Windows computer as the <strong>Central Server</strong> for the store. All cashier terminals, tablets, and mobile phones on the same store Wi-Fi can connect simultaneously to record shifts and inventory.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <a
            href="/start-windows-server.bat"
            download="start-windows-server.bat"
            className="p-3.5 rounded-xl border border-teal-200 dark:border-teal-800 bg-white dark:bg-slate-900 hover:bg-teal-50 dark:hover:bg-teal-950/40 text-left transition-colors cursor-pointer flex flex-col justify-between group shadow-2xs"
          >
            <div>
              <span className="font-bold text-xs text-teal-700 dark:text-teal-400 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5" />
                start-windows-server.bat
              </span>
              <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-1">
                Starts server, detects Wi-Fi IP address, and launches the app.
              </p>
            </div>
            <span className="text-[10.5px] text-teal-600 dark:text-teal-400 font-semibold flex items-center gap-1 mt-3 group-hover:underline">
              <Download className="w-3.5 h-3.5" /> Download Script
            </span>
          </a>

          <a
            href="/setup-windows.bat"
            download="setup-windows.bat"
            className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer flex flex-col justify-between group shadow-2xs"
          >
            <div>
              <span className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5" />
                setup-windows.bat
              </span>
              <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-1">
                Installs dependencies, builds assets & creates Desktop shortcuts.
              </p>
            </div>
            <span className="text-[10.5px] text-slate-600 dark:text-slate-400 font-semibold flex items-center gap-1 mt-3 group-hover:underline">
              <Download className="w-3.5 h-3.5" /> Download Setup
            </span>
          </a>

          <a
            href="/launch-desktop-app.bat"
            download="launch-desktop-app.bat"
            className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer flex flex-col justify-between group shadow-2xs"
          >
            <div>
              <span className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" />
                launch-desktop-app.bat
              </span>
              <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-1">
                Launches the app in standalone native Windows desktop mode.
              </p>
            </div>
            <span className="text-[10.5px] text-slate-600 dark:text-slate-400 font-semibold flex items-center gap-1 mt-3 group-hover:underline">
              <Download className="w-3.5 h-3.5" /> Download App Window
            </span>
          </a>
        </div>

        {/* Word Document & PDF Manual Download Banner */}
        <div className="pt-2 border-t border-teal-200/80 dark:border-teal-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <FileText className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
            <span>Complete Windows Server Installation & Cashier Network Manual</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
            <a
              href="/WINDOWS-SERVER-INSTALLATION-WALKTHROUGH.doc"
              download="Candy-Store-Server-Installation-Walkthrough.doc"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium text-xs transition-colors shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Word Doc (.doc)</span>
            </a>
            <a
              href="/WINDOWS-SERVER-INSTALLATION-WALKTHROUGH.html"
              target="_blank"
              rel="noreferrer"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium text-xs text-slate-700 dark:text-slate-200 transition-colors shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>Print / Save as PDF</span>
            </a>
          </div>
        </div>
      </div>

      {/* Change History Audit Log */}
      <ChangeHistory
        logs={state.log || []}
        currentTab="setup"
        currentLoc={state.inv}
        startDate={state.start}
        cutDate={state.cut}
        canAdmin={canAdmin}
        onDeleteOne={id => {
          onUpdateState(prev => ({
            ...prev,
            log: (prev.log || []).filter(x => x.id !== id)
          }));
        }}
        onDeleteAllShown={ids => {
          const idSet = new Set(ids);
          onUpdateState(prev => ({
            ...prev,
            log: (prev.log || []).filter(x => !idSet.has(x.id || ''))
          }));
        }}
      />
    </div>
  );
};
