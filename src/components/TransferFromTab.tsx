import React, { useState, useMemo } from 'react';
import {
  ArrowLeftRight,
  Download,
  Search,
  Plus,
  ArrowRight,
  DollarSign,
  Package,
  Building2,
  X
} from 'lucide-react';
import { AppState, Item, Row } from '../types';
import {
  acct,
  f2,
  fd,
  formatTransferLocations,
  num,
  parseTransferLocations,
  q,
  unitCost,
  today,
  createInitialRow
} from '../utils/helpers';
import { exportTransferFromData } from '../utils/excel';

interface TransferFromTabProps {
  state: AppState;
  canEdit: boolean;
  canAdmin: boolean;
  onUpdateState: (updater: (prev: AppState) => AppState, actionDescription?: string) => void;
  onNavigateToMonthlySummary?: () => void;
}

export const TransferFromTab: React.FC<TransferFromTabProps> = ({
  state,
  canEdit,
  canAdmin,
  onUpdateState,
  onNavigateToMonthlySummary
}) => {
  const [startDate, setStartDate] = useState<string>(state.start);
  const [endDate, setEndDate] = useState<string>(state.cut);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showOnlyTransfers, setShowOnlyTransfers] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'both' | 'qty' | 'cost'>('both');

  // Multi-location Quick Add / Edit Transfer Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState<{
    date: string;
    itemNo: number | '';
    shift: 'AM' | 'PM';
    locations: { loc: string; qty: string }[];
  }>({
    date: state.vd || today(),
    itemNo: state.items.length > 0 ? state.items[0].no : '',
    shift: state.vf || 'AM',
    locations: [{ loc: state.locs.find(l => l !== state.inv) || state.locs[0] || '', qty: '' }]
  });

  // Available locations: all configured locations plus any found in tfl and tf_locs
  const allLocations = useMemo(() => {
    const locSet = new Set<string>(state.locs);
    state.rows.forEach(r => {
      if (r.tf_locs && typeof r.tf_locs === 'object') {
        Object.keys(r.tf_locs).forEach(l => {
          if (l.trim()) locSet.add(l.trim());
        });
      }
      if (r.tfl && r.tfl.trim()) {
        const parsed = parseTransferLocations(r.tfl, r.tf_locs, r.tf);
        parsed.forEach(p => {
          if (p.loc) locSet.add(p.loc);
        });
      }
    });
    return Array.from(locSet).sort((a, b) => a.localeCompare(b));
  }, [state.locs, state.rows]);

  // Filter rows belonging to the active inventory location within selected date range
  const activeRows = useMemo(() => {
    return state.rows
      .map((r, i) => ({ row: r, index: i }))
      .filter(
        ({ row: r }) =>
          r.loc === state.inv &&
          r.no !== '' &&
          r.date >= startDate &&
          r.date <= endDate
      );
  }, [state.rows, state.inv, startDate, endDate]);

  // Aggregate transfer quantities by item and by source location (supports multiple locations per item)
  const {
    itemLocQtyMap,
    itemTotalDescQtyMap,
    colTotalsQty
  } = useMemo(() => {
    const map: Record<number, Record<string, number>> = {};
    const descMap: Record<number, number> = {};
    const colTot: Record<string, number> = {};
    allLocations.forEach(l => {
      colTot[l] = 0;
    });
    colTot['Unassigned'] = 0;

    activeRows.forEach(({ row: r }) => {
      const no = r.no as number;
      if (!map[no]) map[no] = {};

      const parsed = parseTransferLocations(r.tfl, r.tf_locs, r.tf);
      if (parsed.length > 0) {
        let rowSum = 0;
        parsed.forEach(({ loc, qty }) => {
          if (qty > 0) {
            map[no][loc] = (map[no][loc] || 0) + qty;
            colTot[loc] = (colTot[loc] || 0) + qty;
            rowSum += qty;
          }
        });
        descMap[no] = (descMap[no] || 0) + rowSum;
      } else {
        const qty = num(r.tf);
        descMap[no] = (descMap[no] || 0) + qty;
        if (qty > 0) {
          map[no]['Unassigned'] = (map[no]['Unassigned'] || 0) + qty;
          colTot['Unassigned'] = (colTot['Unassigned'] || 0) + qty;
        }
      }
    });

    return {
      itemLocQtyMap: map,
      itemTotalDescQtyMap: descMap,
      colTotalsQty: colTot
    };
  }, [activeRows, allLocations]);

  // 1. DONT SHOW THE LOCATION JUST SHOW THE LOCATION WITH TRANSFERS:
  // Only include locations where total transfer quantity in this period > 0
  const locationsWithTransfers = useMemo(() => {
    const list = allLocations.filter(loc => (colTotalsQty[loc] || 0) > 0);
    if ((colTotalsQty['Unassigned'] || 0) > 0) {
      list.push('Unassigned');
    }
    return list;
  }, [allLocations, colTotalsQty]);

  // Unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    state.items.forEach(it => {
      if (it.cat) set.add(it.cat);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [state.items]);

  // Filter items based on search and selected category
  const filteredItemsByCategory = useMemo(() => {
    const map: Record<string, Item[]> = {};
    const catsToInclude = selectedCategory === 'all' ? categories : [selectedCategory];

    catsToInclude.forEach(cat => {
      const catItems = state.items
        .filter(item => {
          if (item.cat !== cat) return false;
          if (searchTerm) {
            const s = searchTerm.toLowerCase();
            const matchDesc = item.desc.toLowerCase().includes(s);
            const matchCode = (item.code || '').toLowerCase().includes(s);
            if (!matchDesc && !matchCode) return false;
          }
          if (showOnlyTransfers) {
            const locsSum = locationsWithTransfers.reduce(
              (sum, loc) => sum + (itemLocQtyMap[item.no]?.[loc] || 0),
              0
            );
            if (locsSum === 0) return false;
          }
          return true;
        })
        .sort((a, b) => a.desc.localeCompare(b.desc) || a.no - b.no);

      if (catItems.length > 0) {
        map[cat] = catItems;
      }
    });

    return map;
  }, [state.items, selectedCategory, categories, searchTerm, showOnlyTransfers, locationsWithTransfers, itemLocQtyMap]);

  // Categories that have items to display
  const activeCategories = useMemo(() => {
    return Object.keys(filteredItemsByCategory).sort((a, b) => a.localeCompare(b));
  }, [filteredItemsByCategory]);

  // Grand summary values across all categories
  const grandSummary = useMemo(() => {
    let grandQty = 0;
    let grandNetCost = 0;
    const locGrandQty: Record<string, number> = {};
    const locGrandCost: Record<string, number> = {};

    locationsWithTransfers.forEach(l => {
      locGrandQty[l] = 0;
      locGrandCost[l] = 0;
    });

    state.items.forEach(it => {
      const rowQtys = itemLocQtyMap[it.no] || {};
      const uCost = unitCost(it);
      const isVat = it.vat !== 'NVAT';
      const calcNet = (qty: number) => (isVat ? (qty * uCost) / 1.12 : qty * uCost);

      locationsWithTransfers.forEach(loc => {
        const qVal = rowQtys[loc] || 0;
        if (qVal > 0) {
          grandQty += qVal;
          locGrandQty[loc] = (locGrandQty[loc] || 0) + qVal;
          const costVal = calcNet(qVal);
          grandNetCost += costVal;
          locGrandCost[loc] = (locGrandCost[loc] || 0) + costVal;
        }
      });
    });

    return {
      grandQty,
      grandNetCost,
      locGrandQty,
      locGrandCost
    };
  }, [state.items, itemLocQtyMap, locationsWithTransfers]);

  // Helper to load existing transfer entries for a given item, date, and shift
  const loadExistingTransfersForItem = (itemNo: number | '', date: string, shift: 'AM' | 'PM') => {
    if (itemNo === '') {
      return [{ loc: state.locs.find(l => l !== state.inv) || state.locs[0] || '', qty: '' }];
    }
    const existingRow = state.rows.find(
      r => r.loc === state.inv && r.date === date && r.fr === shift && r.no === itemNo
    );
    if (existingRow) {
      const parsed = parseTransferLocations(existingRow.tfl, existingRow.tf_locs, existingRow.tf);
      if (parsed.length > 0) {
        return parsed.map(p => ({ loc: p.loc, qty: String(p.qty) }));
      }
    }
    return [{ loc: state.locs.find(l => l !== state.inv) || state.locs[0] || '', qty: '' }];
  };

  const handleOpenAddModal = (targetItemNo?: number) => {
    const itemNo = targetItemNo !== undefined ? targetItemNo : (state.items.length > 0 ? state.items[0].no : '');
    const date = state.vd || today();
    const shift = state.vf || 'AM';
    const locs = loadExistingTransfersForItem(itemNo, date, shift);
    setAddForm({
      date,
      shift,
      itemNo,
      locations: locs
    });
    setIsAddModalOpen(true);
  };

  const handleAddLocationRow = () => {
    const unused = allLocations.find(l => l !== state.inv && !addForm.locations.some(entry => entry.loc === l));
    const fallback = unused || allLocations.find(l => l !== state.inv) || allLocations[0] || '';
    setAddForm(prev => ({
      ...prev,
      locations: [...prev.locations, { loc: fallback, qty: '' }]
    }));
  };

  const handleRemoveLocationRow = (index: number) => {
    setAddForm(prev => ({
      ...prev,
      locations: prev.locations.length > 1 ? prev.locations.filter((_, i) => i !== index) : [{ loc: allLocations.find(l => l !== state.inv) || allLocations[0] || '', qty: '' }]
    }));
  };

  const handleUpdateLocationEntry = (index: number, field: 'loc' | 'qty', value: string) => {
    setAddForm(prev => ({
      ...prev,
      locations: prev.locations.map((entry, i) =>
        i === index ? { ...entry, [field]: value } : entry
      )
    }));
  };

  const totalModalQty = useMemo(() => {
    return addForm.locations.reduce((sum, entry) => {
      const val = parseFloat(entry.qty);
      return sum + (!isNaN(val) && val > 0 ? val : 0);
    }, 0);
  }, [addForm.locations]);

  // Handle saving multi-location transfer from modal
  const handleSaveTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (addForm.itemNo === '') return;

    const validEntries = addForm.locations
      .map(entry => ({ loc: entry.loc.trim(), qty: parseFloat(entry.qty) }))
      .filter(entry => entry.loc && !isNaN(entry.qty) && entry.qty > 0);

    const targetItem = state.items.find(x => x.no === addForm.itemNo);
    const itemDesc = targetItem ? targetItem.desc : `Item #${addForm.itemNo}`;

    const formatted = formatTransferLocations(validEntries);

    onUpdateState(prev => {
      const existingRowIdx = prev.rows.findIndex(
        r =>
          r.loc === prev.inv &&
          r.date === addForm.date &&
          r.fr === addForm.shift &&
          r.no === addForm.itemNo
      );

      const nextRows = [...prev.rows];
      if (existingRowIdx >= 0) {
        nextRows[existingRowIdx] = {
          ...nextRows[existingRowIdx],
          tf: formatted.total > 0 ? formatted.total : '',
          tfl: formatted.label,
          tf_locs: formatted.map
        };
      } else if (formatted.total > 0) {
        nextRows.push(
          createInitialRow(addForm.itemNo, addForm.date, {
            loc: prev.inv,
            fr: addForm.shift,
            tf: formatted.total,
            tfl: formatted.label,
            tf_locs: formatted.map
          })
        );
      }

      return {
        ...prev,
        rows: nextRows
      };
    }, `Recorded Transfer From for ${itemDesc} (${fd(addForm.date)}): ${formatted.total} units across ${validEntries.length} source location(s)`);

    setIsAddModalOpen(false);
  };

  return (
    <div className="space-y-5">
      {/* Top Header Card */}
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-300 dark:border-slate-800 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-teal-100 dark:bg-teal-950/80 text-teal-800 dark:text-teal-300 rounded-xl">
                <ArrowLeftRight className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                  Transfer From
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Receiving Branch:{' '}
                  <span className="font-semibold text-teal-800 dark:text-teal-400">
                    {state.inv}
                  </span>{' '}
                  &bull; Period:{' '}
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {fd(startDate)} to {fd(endDate)}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions & View Toggle */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* View Mode Toggle */}
            <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('both')}
                className={`px-2.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                  viewMode === 'both'
                    ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-300 shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Both Tables
              </button>
              <button
                type="button"
                onClick={() => setViewMode('qty')}
                className={`px-2.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                  viewMode === 'qty'
                    ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-300 shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Quantity Matrix
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cost')}
                className={`px-2.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                  viewMode === 'cost'
                    ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-300 shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Net of VAT Cost
              </button>
            </div>

            {canEdit && (
              <button
                type="button"
                onClick={() => handleOpenAddModal()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-700 rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Record Transfer</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => exportTransferFromData(state, startDate, endDate, locationsWithTransfers)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xs transition-colors cursor-pointer"
              title="Download Excel spreadsheet"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export</span>
            </button>
          </div>
        </div>

        {/* Filters and Date Bar */}
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search item description..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-600 focus:border-teal-600"
            />
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-600 focus:border-teal-600"
            >
              <option value="all">All Categories ({categories.length})</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Picker */}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-600"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-600"
            />
          </div>

          {/* Filter options */}
          <div className="flex items-center justify-between sm:justify-end gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showOnlyTransfers}
                onChange={e => setShowOnlyTransfers(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-teal-600 border-slate-300 dark:border-slate-700 focus:ring-teal-500"
              />
              <span>Only with Transfers</span>
            </label>

            {(startDate !== state.start || endDate !== state.cut) && (
              <button
                type="button"
                onClick={() => {
                  setStartDate(state.start);
                  setEndDate(state.cut);
                }}
                className="text-[11px] text-teal-700 dark:text-teal-400 hover:underline font-medium cursor-pointer"
              >
                Reset Period
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Quantity */}
        <div className="p-4 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Quantity Transferred
            </div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {q(grandSummary.grandQty) || '0'} <span className="text-xs font-normal text-slate-500">units</span>
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Across {locationsWithTransfers.length} transfer location{locationsWithTransfers.length === 1 ? '' : 's'}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 flex items-center justify-center shrink-0">
            <Package className="w-5 h-5" />
          </div>
        </div>

        {/* Monthly Summary Pickup - Total Net of VAT Cost */}
        <div className="p-4 rounded-xl border border-teal-200 dark:border-teal-900/60 bg-teal-50/70 dark:bg-teal-950/30 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-teal-800 dark:text-teal-400 flex items-center gap-1">
              <span>Picked Up in Monthly Summary</span>
            </div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-teal-950 dark:text-teal-200">
              ₱{acct(grandSummary.grandNetCost)}
            </div>
            <div className="mt-1 text-xs text-teal-700 dark:text-teal-400 leading-tight">
              Total Net of VAT Transfers FROM
            </div>
          </div>
          <div className="p-2.5 bg-teal-200/80 dark:bg-teal-900/60 text-teal-800 dark:text-teal-300 rounded-xl shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        {/* Source Locations with Transfers */}
        <div className="p-4 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Locations with Transfers
            </div>
            <div className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">
              {locationsWithTransfers.length === 0
                ? 'None'
                : `${locationsWithTransfers.length} Branch${locationsWithTransfers.length === 1 ? '' : 'es'}`}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate max-w-[220px]">
              {locationsWithTransfers.length > 0 ? locationsWithTransfers.join(', ') : 'No transfers recorded'}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* When no locations have transfers */}
      {locationsWithTransfers.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-800 text-slate-500 italic shadow-xs space-y-2">
          <p className="font-semibold text-slate-700 dark:text-slate-300 text-sm">
            No transfer from locations with recorded transfers.
          </p>
          <p className="text-xs">
            There are no transfer records for <strong>{state.inv}</strong> between {fd(startDate)} and {fd(endDate)}.
          </p>
          {canEdit && (
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer mt-2"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record a Transfer Now</span>
            </button>
          )}
        </div>
      ) : activeCategories.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-800 text-slate-500 italic shadow-xs">
          No items match the current search or filter criteria.
        </div>
      ) : (
        /* Render separate tables for each category */
        <div className="space-y-6">
          {activeCategories.map(cat => {
            const items = filteredItemsByCategory[cat] || [];

            // Compute category-level column totals
            const catColTotalsQty: Record<string, number> = {};
            const catColTotalsCost: Record<string, number> = {};
            locationsWithTransfers.forEach(l => {
              catColTotalsQty[l] = 0;
              catColTotalsCost[l] = 0;
            });

            items.forEach(it => {
              const rowQtys = itemLocQtyMap[it.no] || {};
              const uCost = unitCost(it);
              const isVat = it.vat !== 'NVAT';
              const calcNet = (qty: number) => (isVat ? (qty * uCost) / 1.12 : qty * uCost);

              locationsWithTransfers.forEach(loc => {
                const qVal = rowQtys[loc] || 0;
                catColTotalsQty[loc] = (catColTotalsQty[loc] || 0) + qVal;
                catColTotalsCost[loc] = (catColTotalsCost[loc] || 0) + calcNet(qVal);
              });
            });

            return (
              <div key={cat} className="space-y-4">
                {/* 1. QUANTITY TABLE FOR THIS CATEGORY */}
                {(viewMode === 'both' || viewMode === 'qty') && (
                  <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
                    <div className="bg-slate-100 dark:bg-slate-800 px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                      <span className="font-bold text-xs uppercase tracking-wider text-teal-900 dark:text-teal-300">
                        {cat} — Transfer From (Quantity)
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {items.length} item{items.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    <div className="overflow-x-auto w-full pb-2">
                      <table className="w-full text-[11px] border-collapse leading-tight font-sans">
                        <thead className="bg-slate-200/90 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-300 dark:border-slate-700">
                          <tr className="align-middle">
                            {/* Just Item Description */}
                            <th className="py-2 px-3 text-left min-w-[240px] border-r border-slate-300 dark:border-slate-700">
                              Item Description
                            </th>
                            {/* Only Locations with Transfers */}
                            {locationsWithTransfers.map(loc => (
                              <th
                                key={loc}
                                className="py-2 px-3 text-center min-w-[140px] border-r border-slate-300 dark:border-slate-700 last:border-r-0"
                              >
                                {loc}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {items.map(it => {
                            const rowQtys = itemLocQtyMap[it.no] || {};
                            return (
                              <tr
                                key={it.no}
                                className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                              >
                                {/* Just Item Description */}
                                <td className="py-1.5 px-3 font-medium text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800 group">
                                  <div className="flex items-center justify-between gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenAddModal(it.no)}
                                      className="text-left font-medium hover:text-teal-700 dark:hover:text-teal-400 hover:underline cursor-pointer"
                                      title="Click to view or record transfers from multiple locations for this item"
                                    >
                                      {it.desc}
                                    </button>
                                    {canEdit && (
                                      <button
                                        type="button"
                                        onClick={() => handleOpenAddModal(it.no)}
                                        className="opacity-0 group-hover:opacity-100 p-1 text-[10px] text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/50 rounded transition-opacity cursor-pointer shrink-0"
                                        title="Add / Edit locations for this item"
                                      >
                                        <Plus className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </td>

                                {/* Quantities by Location */}
                                {locationsWithTransfers.map(loc => {
                                  const val = rowQtys[loc] || 0;
                                  return (
                                    <td
                                      key={loc}
                                      className={`py-1.5 px-3 text-center font-mono tabular-nums border-r border-slate-200 dark:border-slate-800 last:border-r-0 ${
                                        val > 0
                                          ? 'font-bold text-teal-800 dark:text-teal-300'
                                          : 'text-slate-300 dark:text-slate-600'
                                      }`}
                                    >
                                      {val > 0 ? q(val) : '-'}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-slate-200/90 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-200 border-t-2 border-slate-300 dark:border-slate-700">
                          <tr>
                            <td className="py-2 px-3 text-left border-r border-slate-300 dark:border-slate-700 uppercase text-[10px] tracking-wider">
                              Total
                            </td>
                            {locationsWithTransfers.map(loc => {
                              const total = catColTotalsQty[loc] || 0;
                              return (
                                <td
                                  key={loc}
                                  className="py-2 px-3 text-center font-mono tabular-nums border-r border-slate-300 dark:border-slate-700 last:border-r-0 text-teal-900 dark:text-teal-300"
                                >
                                  {total > 0 ? q(total) : '-'}
                                </td>
                              );
                            })}
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* 2. NET OF VAT COST TABLE FOR THIS CATEGORY */}
                {(viewMode === 'both' || viewMode === 'cost') && (
                  <div className="rounded-xl border border-teal-200 dark:border-teal-900/60 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
                    <div className="bg-teal-50 dark:bg-teal-950/60 px-4 py-2.5 border-b border-teal-200 dark:border-teal-900/60 flex items-center justify-between">
                      <span className="font-bold text-xs uppercase tracking-wider text-teal-950 dark:text-teal-200 flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                        <span>{cat} — Transfer From (Net of VAT Cost)</span>
                      </span>
                      <span className="text-[10px] text-teal-700 dark:text-teal-400">
                        Picked up in Monthly Summary
                      </span>
                    </div>

                    <div className="overflow-x-auto w-full pb-2">
                      <table className="w-full text-[11px] border-collapse leading-tight font-sans">
                        <thead className="bg-slate-200/90 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-300 dark:border-slate-700">
                          <tr className="align-middle">
                            {/* Just Item Description */}
                            <th className="py-2 px-3 text-left min-w-[240px] border-r border-slate-300 dark:border-slate-700">
                              Item Description
                            </th>
                            {/* Only Locations with Transfers */}
                            {locationsWithTransfers.map(loc => (
                              <th
                                key={loc}
                                className="py-2 px-3 text-center min-w-[140px] border-r border-slate-300 dark:border-slate-700 last:border-r-0"
                              >
                                {loc}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {items.map(it => {
                            const rowQtys = itemLocQtyMap[it.no] || {};
                            const uCost = unitCost(it);
                            const isVat = it.vat !== 'NVAT';
                            const calcNet = (qty: number) => (isVat ? (qty * uCost) / 1.12 : qty * uCost);

                            return (
                              <tr
                                key={it.no}
                                className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                              >
                                {/* Just Item Description */}
                                <td className="py-1.5 px-3 font-medium text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800 group">
                                  <div className="flex items-center justify-between gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenAddModal(it.no)}
                                      className="text-left font-medium hover:text-teal-700 dark:hover:text-teal-400 hover:underline cursor-pointer"
                                      title="Click to view or record transfers from multiple locations for this item"
                                    >
                                      {it.desc}
                                    </button>
                                    {canEdit && (
                                      <button
                                        type="button"
                                        onClick={() => handleOpenAddModal(it.no)}
                                        className="opacity-0 group-hover:opacity-100 p-1 text-[10px] text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/50 rounded transition-opacity cursor-pointer shrink-0"
                                        title="Add / Edit locations for this item"
                                      >
                                        <Plus className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </td>

                                {/* Net of VAT Cost by Location */}
                                {locationsWithTransfers.map(loc => {
                                  const qVal = rowQtys[loc] || 0;
                                  const cost = calcNet(qVal);
                                  return (
                                    <td
                                      key={loc}
                                      className={`py-1.5 px-3 text-right font-mono tabular-nums border-r border-slate-200 dark:border-slate-800 last:border-r-0 ${
                                        cost > 0
                                          ? 'font-bold text-teal-800 dark:text-teal-300'
                                          : 'text-slate-300 dark:text-slate-600'
                                      }`}
                                    >
                                      {cost > 0 ? acct(cost) : '-'}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-teal-100/70 dark:bg-teal-950/80 font-bold text-slate-800 dark:text-slate-200 border-t-2 border-teal-300 dark:border-teal-800">
                          <tr>
                            <td className="py-2 px-3 text-left border-r border-teal-200 dark:border-teal-800 uppercase text-[10px] tracking-wider text-teal-950 dark:text-teal-200">
                              Total Net of VAT Cost
                            </td>
                            {locationsWithTransfers.map(loc => {
                              const totalCost = catColTotalsCost[loc] || 0;
                              return (
                                <td
                                  key={loc}
                                  className="py-2 px-3 text-right font-mono tabular-nums border-r border-teal-200 dark:border-teal-800 last:border-r-0 text-teal-950 dark:text-teal-200"
                                >
                                  {totalCost > 0 ? acct(totalCost) : '-'}
                                </td>
                              );
                            })}
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Grand Summary Across All Categories */}
          {activeCategories.length > 1 && (
            <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                <span className="font-bold text-xs uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Grand Total Summary (All Categories)
                </span>
                {onNavigateToMonthlySummary && (
                  <button
                    type="button"
                    onClick={onNavigateToMonthlySummary}
                    className="text-xs text-teal-700 dark:text-teal-300 hover:text-teal-900 dark:hover:text-teal-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>View in Monthly Summary</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {locationsWithTransfers.map(loc => (
                  <div
                    key={loc}
                    className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1"
                  >
                    <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 truncate" title={loc}>
                      {loc}
                    </div>
                    <div className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                      {q(grandSummary.locGrandQty[loc])} <span className="text-xs font-normal text-slate-500">units</span>
                    </div>
                    <div className="text-xs font-mono font-semibold text-teal-800 dark:text-teal-400">
                      ₱{acct(grandSummary.locGrandCost[loc])} Net of VAT
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Record Multi-Location Transfer Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-800 shadow-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <ArrowLeftRight className="w-4 h-4 text-teal-600" />
                  <span>Record Transfer From (Multiple Locations)</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Record 1 item received from multiple source locations or branches simultaneously.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTransfer} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Transfer Date
                  </label>
                  <input
                    type="date"
                    required
                    value={addForm.date}
                    onChange={e => {
                      const newDate = e.target.value;
                      const newLocs = loadExistingTransfersForItem(addForm.itemNo, newDate, addForm.shift);
                      setAddForm(prev => ({ ...prev, date: newDate, locations: newLocs }));
                    }}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Shift
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const newLocs = loadExistingTransfersForItem(addForm.itemNo, addForm.date, 'AM');
                        setAddForm(prev => ({ ...prev, shift: 'AM', locations: newLocs }));
                      }}
                      className={`py-1.5 text-xs font-semibold rounded-lg border cursor-pointer transition-colors ${
                        addForm.shift === 'AM'
                          ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-600 text-teal-800 dark:text-teal-300'
                          : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      AM Shift
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const newLocs = loadExistingTransfersForItem(addForm.itemNo, addForm.date, 'PM');
                        setAddForm(prev => ({ ...prev, shift: 'PM', locations: newLocs }));
                      }}
                      className={`py-1.5 text-xs font-semibold rounded-lg border cursor-pointer transition-colors ${
                        addForm.shift === 'PM'
                          ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-600 text-teal-800 dark:text-teal-300'
                          : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      PM Shift
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Item Description
                </label>
                <select
                  value={addForm.itemNo}
                  onChange={e => {
                    const newItemNo = Number(e.target.value);
                    const newLocs = loadExistingTransfersForItem(newItemNo, addForm.date, addForm.shift);
                    setAddForm(prev => ({ ...prev, itemNo: newItemNo, locations: newLocs }));
                  }}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-600 font-medium"
                >
                  {state.items.map(it => (
                    <option key={it.no} value={it.no}>
                      {it.desc} ({it.cat})
                    </option>
                  ))}
                </select>
              </div>

              {/* Multiple Source Locations Section */}
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Source Branches & Quantities
                  </label>
                  <button
                    type="button"
                    onClick={handleAddLocationRow}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/60 rounded border border-teal-200 dark:border-teal-800 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Another Location</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {addForm.locations.map((entry, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-medium text-slate-400 block mb-0.5">
                          Source Location #{idx + 1}
                        </span>
                        <select
                          value={entry.loc}
                          onChange={e => handleUpdateLocationEntry(idx, 'loc', e.target.value)}
                          className="w-full px-2 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-600 truncate"
                        >
                          {allLocations.map(loc => (
                            <option key={loc} value={loc}>
                              {loc} {loc === state.inv ? '(Receiving Store)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="w-28 shrink-0">
                        <span className="text-[10px] font-medium text-slate-400 block mb-0.5">
                          Qty (units)
                        </span>
                        <input
                          type="number"
                          step="any"
                          min="0.01"
                          placeholder="e.g. 10"
                          value={entry.qty}
                          onChange={e => handleUpdateLocationEntry(idx, 'qty', e.target.value)}
                          className="w-full px-2 py-1.5 text-xs font-mono font-medium rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-right focus:outline-none focus:ring-1 focus:ring-teal-600"
                        />
                      </div>

                      {addForm.locations.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLocationRow(idx)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded cursor-pointer self-end mb-0.5"
                          title="Remove this location"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Real-time Total Transfer Quantity */}
                <div className="p-2.5 rounded-lg bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 flex items-center justify-between text-xs">
                  <span className="text-teal-900 dark:text-teal-200 font-medium">
                    Total Transfer From ({addForm.locations.filter(l => parseFloat(l.qty) > 0).length} source branch{addForm.locations.filter(l => parseFloat(l.qty) > 0).length === 1 ? '' : 'es'}):
                  </span>
                  <span className="font-mono font-bold text-teal-800 dark:text-teal-300 text-sm">
                    {totalModalQty} units
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="text-[11px] text-slate-500 italic">
                  Changes automatically update all source branch columns in Transfer From.
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-700 rounded-lg cursor-pointer shadow-xs"
                  >
                    Save Multi-Location Transfer
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
