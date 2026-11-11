import React, { useState, useMemo } from 'react';
import {
  ShoppingBag,
  Download,
  Printer,
  Search,
  Filter,
  TrendingUp,
  BarChart2,
  Package,
  Layers,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Building2,
  Calendar,
  Sparkles,
  Info
} from 'lucide-react';
import { AppState, Item, Row } from '../types';
import {
  addDay,
  computeRows,
  dcmp,
  fd,
  getWeeksCount,
  num,
  q
} from '../utils/helpers';
import {
  exportItemsSoldOutSummary,
  SoldOutExportItem,
  SoldOutWeekDef
} from '../utils/excel';

interface ItemsSoldOutSummaryTabProps {
  state: AppState;
  canAdmin?: boolean;
  canChangeLoc?: boolean;
  onSelectLoc?: (loc: string) => void;
  onNavigateToTab?: (tabId: string) => void;
}

export interface ItemSoldStats {
  no: number;
  code: string;
  desc: string;
  cat: string;
  weeklyQty: number[];
  monthlySummary: number;
  monthlyAverage: number;
}

type SortField = 'rank' | 'code' | 'desc' | 'cat' | 'monthlySummary' | 'monthlyAverage' | number; // number is weekIndex

export const ItemsSoldOutSummaryTab: React.FC<ItemsSoldOutSummaryTabProps> = ({
  state,
  canChangeLoc,
  onSelectLoc,
  onNavigateToTab
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'sold' | 'zero'>('all');
  const [viewMode, setViewMode] = useState<'flat' | 'grouped'>('flat');
  const [sortField, setSortField] = useState<SortField>('monthlyAverage');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Active branch
  const activeLoc = state.inv;

  // Weeks calculation based on Start Date and Cutoff Date
  const weeksCount = getWeeksCount(state.start, state.cut);
  const weeksDef: SoldOutWeekDef[] = useMemo(() => {
    const list: SoldOutWeekDef[] = [];
    for (let k = 1; k <= weeksCount; k++) {
      const wStart = addDay(state.start, 7 * (k - 1));
      let wEnd = addDay(wStart, 6);
      if (wEnd > state.cut) wEnd = state.cut;
      list.push({
        weekNum: k,
        label: `Week ${k}`,
        startDate: wStart,
        endDate: wEnd
      });
    }
    return list;
  }, [state.start, state.cut, weeksCount]);

  // Precompute row-level metrics (beg, del, end, sold)
  const C = useMemo(() => computeRows(state.rows, state.items), [state.rows, state.items]);

  // Compute sold out quantities for every item in catalog across weeks and monthly summary
  const allItemStats: ItemSoldStats[] = useMemo(() => {
    // Filter active location rows in entire cycle
    const cycleRows = state.rows
      .map((r, i) => i)
      .filter(i => {
        const r = state.rows[i];
        return r.loc === activeLoc && r.no !== '' && r.date >= state.start && r.date <= state.cut;
      })
      .sort((a, b) => dcmp(state.rows[a].date, state.rows[b].date) || a - b);

    // Group rows by item no and by week index
    const itemWeekRows: Record<number, Record<number, number[]>> = {};
    const itemAllRows: Record<number, number[]> = {};

    cycleRows.forEach(i => {
      const r = state.rows[i];
      const no = r.no as number;
      (itemAllRows[no] = itemAllRows[no] || []).push(i);

      // Find week index
      const diffDays = Math.round((Date.parse(r.date) - Date.parse(state.start)) / 864e5);
      const wIdx = Math.floor(diffDays / 7);
      if (wIdx >= 0 && wIdx < weeksCount) {
        if (!itemWeekRows[no]) itemWeekRows[no] = {};
        if (!itemWeekRows[no][wIdx]) itemWeekRows[no][wIdx] = [];
        itemWeekRows[no][wIdx].push(i);
      }
    });

    // Helper to calculate sold in a specific slice of rows
    const calcSliceSold = (rs: number[] | undefined): number => {
      if (!rs || rs.length === 0) return 0;
      const sum = (field: keyof Row) => rs.reduce((t, i) => t + num(state.rows[i][field]), 0);
      const beg = C[rs[0]].beg;
      const end = num(state.rows[rs[rs.length - 1]].end);
      const tg = beg + sum('del') + sum('tf') + sum('itf') - sum('tt') - sum('itt');
      const sold = tg - end;
      return sold;
    };

    return state.items.map(it => {
      const weeklyQty: number[] = [];
      for (let w = 0; w < weeksCount; w++) {
        const rs = itemWeekRows[it.no]?.[w];
        const sold = calcSliceSold(rs);
        weeklyQty.push(sold);
      }

      // Monthly summary is the sum of weekly sold quantities
      const monthlySummary = weeklyQty.reduce((sum, q) => sum + q, 0);
      const monthlyAverage = weeksCount > 0 ? monthlySummary / weeksCount : 0;

      return {
        no: it.no,
        code: it.code || `ITM-${it.no}`,
        desc: it.desc || '(no description)',
        cat: it.cat || 'Uncategorized',
        weeklyQty,
        monthlySummary,
        monthlyAverage
      };
    });
  }, [state.items, state.rows, activeLoc, state.start, state.cut, weeksCount, C]);

  // Overall metric stats
  const metrics = useMemo<{
    totalMonthlySold: number;
    averageWeeklySold: number;
    activeSoldCount: number;
    catalogCount: number;
    weeklyTotals: number[];
    topItem: ItemSoldStats | null;
  }>(() => {
    let totalMonthlySold = 0;
    const weeklyTotals = new Array(weeksCount).fill(0);
    let activeSoldCount = 0;
    let topItem: ItemSoldStats | null = null;

    for (const item of allItemStats) {
      totalMonthlySold += item.monthlySummary;
      if (item.monthlySummary > 0) activeSoldCount++;

      item.weeklyQty.forEach((q, wIdx) => {
        weeklyTotals[wIdx] += q;
      });

      if (!topItem || item.monthlyAverage > topItem.monthlyAverage) {
        if (item.monthlyAverage > 0) {
          topItem = item;
        }
      }
    }

    const averageWeeklySold = weeksCount > 0 ? totalMonthlySold / weeksCount : 0;

    return {
      totalMonthlySold,
      averageWeeklySold,
      activeSoldCount,
      catalogCount: allItemStats.length,
      weeklyTotals,
      topItem
    };
  }, [allItemStats, weeksCount]);

  // Unique categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    allItemStats.forEach(it => set.add(it.cat));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allItemStats]);

  // Filtered and sorted items
  const filteredAndSortedItems = useMemo(() => {
    let list = allItemStats.filter(item => {
      // Search term filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesCode = item.code.toLowerCase().includes(term);
        const matchesDesc = item.desc.toLowerCase().includes(term);
        const matchesCat = item.cat.toLowerCase().includes(term);
        if (!matchesCode && !matchesDesc && !matchesCat) return false;
      }

      // Category filter
      if (selectedCategory !== 'all' && item.cat !== selectedCategory) {
        return false;
      }

      // Status filter
      if (statusFilter === 'sold' && item.monthlySummary <= 0) {
        return false;
      }
      if (statusFilter === 'zero' && item.monthlySummary > 0) {
        return false;
      }

      return true;
    });

    // Sort items
    list.sort((a, b) => {
      let comparison = 0;

      if (typeof sortField === 'number') {
        const qtyA = a.weeklyQty[sortField] || 0;
        const qtyB = b.weeklyQty[sortField] || 0;
        comparison = qtyA - qtyB;
      } else {
        switch (sortField) {
          case 'code':
            comparison = a.code.localeCompare(b.code);
            break;
          case 'desc':
            comparison = a.desc.localeCompare(b.desc);
            break;
          case 'cat':
            comparison = a.cat.localeCompare(b.cat);
            break;
          case 'monthlySummary':
            comparison = a.monthlySummary - b.monthlySummary;
            break;
          case 'monthlyAverage':
          default:
            comparison = a.monthlyAverage - b.monthlyAverage;
            break;
        }
      }

      // Secondary tie-breaker: sort by monthly average then description
      if (comparison === 0) {
        comparison = a.monthlyAverage - b.monthlyAverage;
        if (comparison === 0) {
          comparison = a.desc.localeCompare(b.desc);
        }
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return list;
  }, [allItemStats, searchTerm, selectedCategory, statusFilter, sortField, sortOrder]);

  // Grouped by Category structure
  const groupedByCategory = useMemo(() => {
    if (viewMode !== 'grouped') return [];
    const map: Record<string, typeof filteredAndSortedItems> = {};

    filteredAndSortedItems.forEach(item => {
      if (!map[item.cat]) map[item.cat] = [];
      map[item.cat].push(item);
    });

    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredAndSortedItems, viewMode]);

  // Handle header sort click
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      // For numerical metrics default to descending, for text default to ascending
      if (field === 'code' || field === 'desc' || field === 'cat') {
        setSortOrder('asc');
      } else {
        setSortOrder('desc');
      }
    }
  };

  // Export to Excel handler
  const handleExportExcel = () => {
    exportItemsSoldOutSummary(
      filteredAndSortedItems,
      weeksDef,
      activeLoc,
      state.start,
      state.cut
    );
  };

  // Print handler
  const handlePrint = () => {
    window.print();
  };

  // Helper to render sort indicator
  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 inline ml-1" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 inline ml-1" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 inline ml-1" />
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Header Card */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-400 flex items-center justify-center border border-teal-200 dark:border-teal-800/80 shadow-xs">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>Items Sold Out Summary</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-300">
                  {weeksCount} Weeks
                </span>
              </h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                  <Building2 className="w-3.5 h-3.5 text-teal-600" />
                  Branch: <strong className="text-teal-800 dark:text-teal-300">{activeLoc}</strong>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Period: <strong>{fd(state.start)}</strong> to <strong>{fd(state.cut)}</strong>
                </span>
                <span>•</span>
                <span className="text-slate-500">
                  Sorted by: <strong className="text-slate-700 dark:text-slate-200">
                    {sortField === 'monthlyAverage'
                      ? 'Monthly Average (Highest First)'
                      : sortField === 'monthlySummary'
                      ? 'Monthly Summary'
                      : typeof sortField === 'number'
                      ? `Week ${sortField + 1}`
                      : String(sortField).toUpperCase()}
                  </strong>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons & Branch Switching */}
        <div className="flex flex-wrap items-center gap-2">
          {canChangeLoc && onSelectLoc && state.locs.length > 1 && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">Location:</span>
              <select
                value={activeLoc}
                onChange={e => onSelectLoc(e.target.value)}
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 shadow-xs focus:ring-2 focus:ring-teal-500 cursor-pointer"
                title="Select Branch Location"
              >
                {state.locs.map(l => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 text-white shadow-xs transition-colors cursor-pointer"
            title="Download Sold Out Summary Excel spreadsheet"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export to Excel</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-xs transition-colors cursor-pointer"
            title="Print this report"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Print</span>
          </button>
        </div>
      </div>

      {/* Metric Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">
            <span>Total Units Sold Out</span>
            <Package className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
            {metrics.totalMonthlySold > 0 ? q(metrics.totalMonthlySold) : '0'}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Full monthly accounting cycle
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">
            <span>Weekly Average Movement</span>
            <BarChart2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-emerald-700 dark:text-emerald-400">
            {metrics.averageWeeklySold > 0 ? metrics.averageWeeklySold.toFixed(1) : '0.0'}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1">units/wk</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Based on {weeksCount} accounting weeks
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">
            <span>Active Selling SKUs</span>
            <TrendingUp className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
            {metrics.activeSoldCount}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1.5">
              / {metrics.catalogCount} items ({metrics.catalogCount > 0 ? Math.round((metrics.activeSoldCount / metrics.catalogCount) * 100) : 0}%)
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {metrics.catalogCount - metrics.activeSoldCount} items with zero sales
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">
            <span>Top Sales Velocity SKU</span>
            <Sparkles className="w-4 h-4 text-amber-500" />
          </div>
          {metrics.topItem ? (
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate" title={metrics.topItem.desc}>
                {metrics.topItem.desc}
              </div>
              <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-1.5">
                <span>Avg: {metrics.topItem.monthlyAverage.toFixed(1)}/wk</span>
                <span>•</span>
                <span>Total: {q(metrics.topItem.monthlySummary)}</span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-400 italic">No sales recorded yet</div>
          )}
        </div>
      </div>

      {/* Control Bar: Search, Category Filter, Status Filter, View Mode */}
      <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative min-w-[200px] sm:min-w-[260px] flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search item code or description..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-1.5 text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-teal-500 cursor-pointer"
          >
            <option value="all">All Categories ({allItemStats.length})</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter Buttons */}
        <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-300 shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            All Items
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('sold')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              statusFilter === 'sold'
                ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-300 shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Sold Out Only ({metrics.activeSoldCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('zero')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              statusFilter === 'zero'
                ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-300 shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Zero Sales ({metrics.catalogCount - metrics.activeSoldCount})
          </button>
        </div>

        {/* View Mode Toggle: Flat vs Grouped */}
        <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setViewMode('flat')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1 ${
              viewMode === 'flat'
                ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-300 shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
            title="Flat table ranked by average"
          >
            <BarChart2 className="w-3 h-3" />
            <span>Ranked List</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grouped')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1 ${
              viewMode === 'grouped'
                ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-300 shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
            title="Grouped by Category with subtotals"
          >
            <Layers className="w-3 h-3" />
            <span>By Category</span>
          </button>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              {/* Main Column Headers */}
              <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[11px] uppercase tracking-wider font-semibold">
                <th
                  scope="col"
                  onClick={() => handleSort('monthlyAverage')}
                  className="py-3 px-2 sm:px-3 text-center w-12 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 select-none"
                  title="Rank based on sales average"
                >
                  #
                </th>
                <th
                  scope="col"
                  onClick={() => handleSort('code')}
                  className="py-3 px-3 min-w-[100px] cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 select-none"
                >
                  <span>Item Code</span>
                  {renderSortIcon('code')}
                </th>
                <th
                  scope="col"
                  onClick={() => handleSort('desc')}
                  className="py-3 px-3 min-w-[220px] cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 select-none"
                >
                  <span>Item Description</span>
                  {renderSortIcon('desc')}
                </th>
                <th
                  scope="col"
                  onClick={() => handleSort('cat')}
                  className="py-3 px-3 min-w-[120px] cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 select-none"
                >
                  <span>Category</span>
                  {renderSortIcon('cat')}
                </th>

                {/* Dynamic Week Headers */}
                {weeksDef.map((w, wIdx) => (
                  <th
                    key={w.weekNum}
                    scope="col"
                    onClick={() => handleSort(wIdx)}
                    className="py-2.5 px-3 text-right min-w-[95px] cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 select-none"
                    title={`Click to sort by ${w.label} quantity`}
                  >
                    <div className="flex items-center justify-end">
                      <span>{w.label}</span>
                      {renderSortIcon(wIdx)}
                    </div>
                    <div className="text-[10px] font-normal text-slate-400 dark:text-slate-500 lowercase">
                      {fd(w.startDate).slice(0, 6)} - {fd(w.endDate).slice(0, 6)}
                    </div>
                  </th>
                ))}

                {/* Monthly Summary Header */}
                <th
                  scope="col"
                  onClick={() => handleSort('monthlySummary')}
                  className="py-2.5 px-3 text-right min-w-[110px] bg-teal-50/70 dark:bg-teal-950/40 text-teal-900 dark:text-teal-300 cursor-pointer hover:bg-teal-100 dark:hover:bg-teal-950 select-none border-l border-slate-200 dark:border-slate-700 font-bold"
                  title="Click to sort by total monthly sold out quantity"
                >
                  <div className="flex items-center justify-end">
                    <span>Monthly Summary</span>
                    {renderSortIcon('monthlySummary')}
                  </div>
                  <div className="text-[10px] font-normal text-teal-700 dark:text-teal-400 lowercase">
                    Total Qty Sold
                  </div>
                </th>

                {/* Monthly Average Header (Default Sorted) */}
                <th
                  scope="col"
                  onClick={() => handleSort('monthlyAverage')}
                  className="py-2.5 px-3 text-right min-w-[110px] bg-emerald-50/80 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-300 cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-950 select-none border-l border-emerald-200 dark:border-emerald-800 font-bold"
                  title="Sorted based on average (Click to toggle)"
                >
                  <div className="flex items-center justify-end">
                    <span>Monthly Average</span>
                    {renderSortIcon('monthlyAverage')}
                  </div>
                  <div className="text-[10px] font-normal text-emerald-700 dark:text-emerald-400 lowercase">
                    Avg Qty / Wk
                  </div>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredAndSortedItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={4 + weeksCount + 2}
                    className="py-12 px-4 text-center text-slate-500 dark:text-slate-400"
                  >
                    <Info className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-sm font-medium">No items match your filter criteria.</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Try clearing your search query or selecting &quot;All Items&quot;.
                    </p>
                  </td>
                </tr>
              ) : viewMode === 'grouped' ? (
                // Grouped By Category View
                groupedByCategory.map(([cat, itemsInCat]) => {
                  const catWeekTotals = new Array(weeksCount).fill(0);
                  let catMonthlySummary = 0;

                  itemsInCat.forEach(it => {
                    it.weeklyQty.forEach((q, wIdx) => {
                      catWeekTotals[wIdx] += q;
                    });
                    catMonthlySummary += it.monthlySummary;
                  });

                  const catMonthlyAverage = weeksCount > 0 ? catMonthlySummary / weeksCount : 0;

                  return (
                    <React.Fragment key={cat}>
                      {/* Category Header Row */}
                      <tr className="bg-slate-100/90 dark:bg-slate-800/90 font-bold text-slate-800 dark:text-slate-200">
                        <td
                          colSpan={4 + weeksCount + 2}
                          className="py-2 px-3 text-xs uppercase tracking-wide border-t border-b border-slate-300 dark:border-slate-700 bg-slate-200/50 dark:bg-slate-800"
                        >
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-teal-600"></span>
                              {cat}
                              <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400 lowercase">
                                ({itemsInCat.length} items)
                              </span>
                            </span>
                            <span className="text-xs font-semibold text-teal-800 dark:text-teal-400">
                              Subtotal: {catMonthlySummary > 0 ? q(catMonthlySummary) : '0'} sold
                            </span>
                          </div>
                        </td>
                      </tr>

                      {/* Items in Category */}
                      {itemsInCat.map((item, idx) => {
                        const isSold = item.monthlySummary > 0;
                        return (
                          <tr
                            key={item.no}
                            className={`hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${
                              isSold ? '' : 'text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            <td className="py-2 px-2 sm:px-3 text-center text-slate-400 font-mono text-[11px]">
                              {idx + 1}
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-700 dark:text-slate-300">
                              {item.code}
                            </td>
                            <td className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100">
                              {item.desc}
                            </td>
                            <td className="py-2 px-3 text-slate-500 dark:text-slate-400">
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                {item.cat}
                              </span>
                            </td>

                            {/* Weekly Quantities */}
                            {item.weeklyQty.map((qty, wIdx) => (
                              <td
                                key={wIdx}
                                className={`py-2 px-3 text-right font-medium ${
                                  qty > 0
                                    ? 'text-slate-900 dark:text-slate-100 font-semibold'
                                    : 'text-slate-300 dark:text-slate-600'
                                }`}
                              >
                                {qty > 0 ? q(qty) : '-'}
                              </td>
                            ))}

                            {/* Monthly Summary */}
                            <td
                              className={`py-2 px-3 text-right font-bold border-l border-slate-200 dark:border-slate-800 bg-teal-50/30 dark:bg-teal-950/20 ${
                                item.monthlySummary > 0
                                  ? 'text-teal-900 dark:text-teal-200'
                                  : 'text-slate-300 dark:text-slate-600 font-normal'
                              }`}
                            >
                              {item.monthlySummary > 0 ? q(item.monthlySummary) : '-'}
                            </td>

                            {/* Monthly Average */}
                            <td
                              className={`py-2 px-3 text-right font-bold border-l border-emerald-200/50 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 ${
                                item.monthlyAverage > 0
                                  ? 'text-emerald-800 dark:text-emerald-300'
                                  : 'text-slate-300 dark:text-slate-600 font-normal'
                              }`}
                            >
                              {item.monthlyAverage > 0 ? item.monthlyAverage.toFixed(1) : '-'}
                            </td>
                          </tr>
                        );
                      })}

                      {/* Category Subtotal Row */}
                      <tr className="bg-teal-50/40 dark:bg-teal-950/30 font-bold border-b-2 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-[11px]">
                        <td colSpan={4} className="py-2 px-3 text-right uppercase tracking-wider text-teal-900 dark:text-teal-300">
                          {cat} Subtotal:
                        </td>
                        {catWeekTotals.map((tot, wIdx) => (
                          <td key={wIdx} className="py-2 px-3 text-right text-slate-800 dark:text-slate-200 font-bold">
                            {tot > 0 ? q(tot) : '-'}
                          </td>
                        ))}
                        <td className="py-2 px-3 text-right text-teal-900 dark:text-teal-300 font-extrabold border-l border-slate-200 dark:border-slate-700 bg-teal-100/50 dark:bg-teal-900/40">
                          {catMonthlySummary > 0 ? q(catMonthlySummary) : '0'}
                        </td>
                        <td className="py-2 px-3 text-right text-emerald-900 dark:text-emerald-300 font-extrabold border-l border-emerald-200 dark:border-emerald-800 bg-emerald-100/50 dark:bg-emerald-900/40">
                          {catMonthlyAverage > 0 ? catMonthlyAverage.toFixed(1) : '0.0'}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })
              ) : (
                // Flat Ranked List View (Sorted strictly by chosen field / average)
                filteredAndSortedItems.map((item, idx) => {
                  const isSold = item.monthlySummary > 0;
                  const isTop3 = idx < 3 && sortField === 'monthlyAverage' && sortOrder === 'desc' && isSold;

                  return (
                    <tr
                      key={item.no}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${
                        isSold ? '' : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {/* Rank Column */}
                      <td className="py-2 px-2 sm:px-3 text-center">
                        {isTop3 ? (
                          <span
                            className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold ${
                              idx === 0
                                ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200 border border-amber-300 dark:border-amber-700'
                                : idx === 1
                                ? 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600'
                                : 'bg-orange-100 text-orange-900 dark:bg-orange-900/60 dark:text-orange-200 border border-orange-300 dark:border-orange-700'
                            }`}
                          >
                            {idx + 1}
                          </span>
                        ) : (
                          <span className="font-mono text-[11px] text-slate-400">{idx + 1}</span>
                        )}
                      </td>

                      <td className="py-2 px-3 font-mono text-slate-700 dark:text-slate-300">
                        {item.code}
                      </td>
                      <td className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100">
                        {item.desc}
                      </td>
                      <td className="py-2 px-3 text-slate-500 dark:text-slate-400">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {item.cat}
                        </span>
                      </td>

                      {/* Weekly Quantities */}
                      {item.weeklyQty.map((qty, wIdx) => (
                        <td
                          key={wIdx}
                          className={`py-2 px-3 text-right font-medium ${
                            qty > 0
                              ? 'text-slate-900 dark:text-slate-100 font-semibold'
                              : 'text-slate-300 dark:text-slate-600'
                          }`}
                        >
                          {qty > 0 ? q(qty) : '-'}
                        </td>
                      ))}

                      {/* Monthly Summary */}
                      <td
                        className={`py-2 px-3 text-right font-bold border-l border-slate-200 dark:border-slate-800 bg-teal-50/30 dark:bg-teal-950/20 ${
                          item.monthlySummary > 0
                            ? 'text-teal-900 dark:text-teal-200'
                            : 'text-slate-300 dark:text-slate-600 font-normal'
                        }`}
                      >
                        {item.monthlySummary > 0 ? q(item.monthlySummary) : '-'}
                      </td>

                      {/* Monthly Average */}
                      <td
                        className={`py-2 px-3 text-right font-bold border-l border-emerald-200/50 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 ${
                          item.monthlyAverage > 0
                            ? 'text-emerald-800 dark:text-emerald-300'
                            : 'text-slate-300 dark:text-slate-600 font-normal'
                        }`}
                      >
                        {item.monthlyAverage > 0 ? item.monthlyAverage.toFixed(1) : '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Grand Total Footer */}
            {filteredAndSortedItems.length > 0 && (
              <tfoot>
                <tr className="bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold border-t-2 border-slate-400 dark:border-slate-600 text-xs">
                  <td colSpan={4} className="py-3 px-3 uppercase tracking-wider text-right font-extrabold">
                    Grand Total Quantity Sold Out:
                  </td>

                  {/* Weekly Grand Totals */}
                  {weeksDef.map((_, wIdx) => {
                    const totalW = filteredAndSortedItems.reduce(
                      (acc, it) => acc + (it.weeklyQty[wIdx] || 0),
                      0
                    );
                    return (
                      <td key={wIdx} className="py-3 px-3 text-right font-extrabold">
                        {totalW > 0 ? q(totalW) : '0'}
                      </td>
                    );
                  })}

                  {/* Monthly Summary Grand Total */}
                  <td className="py-3 px-3 text-right font-black border-l border-slate-300 dark:border-slate-700 bg-teal-100 dark:bg-teal-900/70 text-teal-950 dark:text-teal-100 text-sm">
                    {(() => {
                      const totalM = filteredAndSortedItems.reduce(
                        (acc, it) => acc + it.monthlySummary,
                        0
                      );
                      return totalM > 0 ? q(totalM) : '0';
                    })()}
                  </td>

                  {/* Monthly Average Grand Total */}
                  <td className="py-3 px-3 text-right font-black border-l border-emerald-300 dark:border-emerald-700 bg-emerald-100 dark:bg-emerald-900/70 text-emerald-950 dark:text-emerald-100 text-sm">
                    {(() => {
                      const totalM = filteredAndSortedItems.reduce(
                        (acc, it) => acc + it.monthlySummary,
                        0
                      );
                      const avg = weeksCount > 0 ? totalM / weeksCount : 0;
                      return avg > 0 ? avg.toFixed(1) : '0.0';
                    })()}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
