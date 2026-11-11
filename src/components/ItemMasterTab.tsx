import React, { useState, useRef, useMemo } from 'react';
import {
  Plus,
  Download,
  Upload,
  Trash2,
  Search,
  FileSpreadsheet,
  AlertCircle,
  Calendar,
  CheckCircle2,
  XCircle,
  Activity,
  Layers,
  Filter
} from 'lucide-react';
import { AppState, Item } from '../types';
import { acct, f2, fd, num, raw, unitCost } from '../utils/helpers';
import { exportItemMaster, parseItemImport } from '../utils/excel';
import { ChangeHistory } from './ChangeHistory';
import * as XLSX from 'xlsx';

interface ItemMasterTabProps {
  state: AppState;
  canEdit: boolean;
  canAdmin: boolean;
  onUpdateState: (updater: (prev: AppState) => AppState, actionDescription?: string) => void;
  onAskConfirm: (message: string, onConfirm: () => void) => void;
}

export const ItemMasterTab: React.FC<ItemMasterTabProps> = ({
  state,
  canEdit,
  canAdmin,
  onUpdateState,
  onAskConfirm
}) => {
  const [search, setSearch] = useState('');
  const [showImportBox, setShowImportBox] = useState(false);
  const [importText, setImportText] = useState('');
  const [msg, setMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Discover available years from state.rows and active period dates
  const availableYears = useMemo(() => {
    const yearSet = new Set<string>();
    if (state.start && state.start.length >= 4) yearSet.add(state.start.slice(0, 4));
    if (state.cut && state.cut.length >= 4) yearSet.add(state.cut.slice(0, 4));
    (state.rows || []).forEach(r => {
      if (r.date && r.date.length >= 4) {
        yearSet.add(r.date.slice(0, 4));
      }
    });
    const currentYear = new Date().getFullYear().toString();
    yearSet.add(currentYear);
    return Array.from(yearSet).sort((a, b) => b.localeCompare(a));
  }, [state.rows, state.start, state.cut]);

  // Default to active ledger start year, e.g. "2026"
  const defaultYear = (state.start && state.start.slice(0, 4)) || availableYears[0] || '2026';
  const [selectedYear, setSelectedYear] = useState<string>(defaultYear);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Compute item activity map based on items encoded Yearly in state.rows
  const itemActivityMap = useMemo(() => {
    const map = new Map<
      number,
      {
        encodedCount: number;
        lastDate?: string;
        lastLoc?: string;
        hasQuantity: boolean;
      }
    >();

    (state.rows || []).forEach(r => {
      if (r.no === '' || r.no === undefined) return;
      const rowYear = r.date ? r.date.slice(0, 4) : '';
      if (selectedYear !== 'all' && rowYear !== selectedYear) return;

      const itemNo = Number(r.no);
      const existing = map.get(itemNo) || {
        encodedCount: 0,
        lastDate: undefined,
        lastLoc: undefined,
        hasQuantity: false
      };

      existing.encodedCount += 1;
      if (!existing.lastDate || r.date > existing.lastDate) {
        existing.lastDate = r.date;
        existing.lastLoc = r.loc;
      }

      if (
        (r.beg !== '' && Number(r.beg) > 0) ||
        (r.del !== '' && Number(r.del) > 0) ||
        (r.wd !== '' && Number(r.wd) > 0) ||
        (r.tf !== '' && Number(r.tf) > 0) ||
        (r.itf !== '' && Number(r.itf) > 0) ||
        (r.tt !== '' && Number(r.tt) > 0) ||
        (r.itt !== '' && Number(r.itt) > 0) ||
        (r.bad !== '' && Number(r.bad) > 0) ||
        (r.end !== '' && Number(r.end) > 0)
      ) {
        existing.hasQuantity = true;
      }

      map.set(itemNo, existing);
    });

    return map;
  }, [state.rows, selectedYear]);

  // Metric counts for summary cards and filter tabs
  const totalItemsCount = state.items.length;
  const activeItemsCount = state.items.filter(it => (itemActivityMap.get(it.no)?.encodedCount || 0) > 0).length;
  const inactiveItemsCount = totalItemsCount - activeItemsCount;
  const activePercentage = totalItemsCount > 0 ? Math.round((activeItemsCount / totalItemsCount) * 100) : 0;

  const filteredItems = state.items.filter(it => {
    const activity = itemActivityMap.get(it.no);
    const isActive = (activity?.encodedCount || 0) > 0;

    // Filter by status tab
    if (statusFilter === 'active' && !isActive) return false;
    if (statusFilter === 'inactive' && isActive) return false;

    // Search query
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    const statusText = isActive ? 'active' : 'inactive';
    return (
      it.desc.toLowerCase().includes(s) ||
      it.code.toLowerCase().includes(s) ||
      it.cat.toLowerCase().includes(s) ||
      it.sys.toLowerCase().includes(s) ||
      String(it.no).includes(s) ||
      statusText.includes(s)
    );
  });

  const handleCellChange = (itemNo: number, field: keyof Item, value: any) => {
    onUpdateState(prev => {
      const newItems = prev.items.map(it => {
        if (it.no === itemNo) {
          return { ...it, [field]: value };
        }
        return it;
      });
      return { ...prev, items: newItems };
    });
  };

  const handleNumberInput = (itemNo: number, field: keyof Item, rawStr: string) => {
    const clean = rawStr.trim() === '' ? '' : parseFloat(rawStr.replace(/,/g, ''));
    const val = isNaN(clean as number) ? 0 : clean;
    handleCellChange(itemNo, field, val);
  };

  const handleAddItem = () => {
    const maxNo = state.items.reduce((m, x) => Math.max(m, x.no), 0);
    const newNo = maxNo + 1;

    const newItem: Item = {
      no: newNo,
      code: '',
      sys: '',
      desc: '',
      cat: '',
      srp: 0,
      loc: 'Pastry',
      vat: 'VAT',
      deliv: 0,
      conv: 0,
      wd: 0,
      cv: 1
    };

    onUpdateState(
      prev => ({
        ...prev,
        items: [...prev.items, newItem]
      }),
      `Line ${newNo} added to Item Master`
    );
  };

  const handleDeleteItem = (itemNo: number) => {
    const it = state.items.find(x => x.no === itemNo);
    const label = it?.desc || it?.code || `Line ${itemNo}`;

    onAskConfirm(
      `Delete line ${itemNo} (${label})?\nData Entry rows using it will become blank.`,
      () => {
        onUpdateState(
          prev => ({
            ...prev,
            items: prev.items.filter(x => x.no !== itemNo)
          }),
          `Line ${itemNo} (${label}, SRP ₱${f2(it?.srp)}) deleted from Item Master`
        );
      }
    );
  };

  const handleDeleteAllItems = () => {
    onAskConfirm(
      `Delete ALL ${state.items.length} items from the Item Master?\nData Entry rows that use them will show blank item names.`,
      () => {
        onUpdateState(
          prev => ({
            ...prev,
            items: []
          }),
          `All ${state.items.length} items deleted from Item Master`
        );
      }
    );
  };

  // Import handler
  const handleImportSubmit = () => {
    if (!importText.trim()) {
      setMsg('Please paste rows into the text box first.');
      return;
    }

    try {
      const lines = importText.trim().split(/\r?\n/).map(line => line.split(/[\t,]/));
      const result = parseItemImport(lines, state.items);
      if (result.error) {
        setMsg(result.error);
        return;
      }

      onUpdateState(
        prev => ({
          ...prev,
          items: result.items
        }),
        `Imported items: ${result.updated} updated, ${result.added} added`
      );
      setMsg(`Imported: ${result.updated} updated, ${result.added} added.`);
      setShowImportBox(false);
      setImportText('');
    } catch {
      setMsg('Error parsing the pasted data.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const data = evt.target?.result;
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const sheetRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        const result = parseItemImport(sheetRows, state.items);
        if (result.error) {
          setMsg(result.error);
          return;
        }

        onUpdateState(
          prev => ({
            ...prev,
            items: result.items
          }),
          `Imported items: ${result.updated} updated, ${result.added} added`
        );
        setMsg(`Import complete: ${result.updated} updated, ${result.added} added.`);
        setShowImportBox(false);
      } catch {
        setMsg('Could not read Excel file.');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-4">
      {/* Yearly Item Master Activity Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Total Registered Items */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-3.5 border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
              Total Catalog Items
            </span>
            <div className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100">
              {totalItemsCount}
            </div>
            <span className="text-[10px] text-slate-400 block">
              Registered in master catalog
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        {/* Active Items */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'active' ? 'all' : 'active')}
          className={`bg-white dark:bg-slate-900 rounded-xl p-3.5 border transition-all cursor-pointer shadow-2xs flex items-center justify-between ${
            statusFilter === 'active'
              ? 'border-emerald-500 ring-2 ring-emerald-500/20'
              : 'border-slate-200 dark:border-slate-800 hover:border-emerald-300'
          }`}
        >
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Active Items ({selectedYear === 'all' ? 'All Time' : selectedYear})
              </span>
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                {activePercentage}%
              </span>
            </div>
            <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 flex items-baseline gap-2">
              <span>{activeItemsCount}</span>
              <span className="text-xs font-normal text-slate-400">of {totalItemsCount}</span>
            </div>
            <span className="text-[10px] text-emerald-700 dark:text-emerald-300 block">
              Encoded in data entry {selectedYear === 'all' ? 'at least once' : `in Year ${selectedYear}`}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* Inactive Items */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'inactive' ? 'all' : 'inactive')}
          className={`bg-white dark:bg-slate-900 rounded-xl p-3.5 border transition-all cursor-pointer shadow-2xs flex items-center justify-between ${
            statusFilter === 'inactive'
              ? 'border-amber-500 ring-2 ring-amber-500/20'
              : 'border-slate-200 dark:border-slate-800 hover:border-amber-300'
          }`}
        >
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Inactive Items ({selectedYear === 'all' ? 'All Time' : selectedYear})
              </span>
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {100 - activePercentage}%
              </span>
            </div>
            <div className="text-xl font-bold font-mono text-slate-600 dark:text-slate-400 flex items-baseline gap-2">
              <span>{inactiveItemsCount}</span>
              <span className="text-xs font-normal text-slate-400">of {totalItemsCount}</span>
            </div>
            <span className="text-[10px] text-slate-400 block">
              Zero records encoded {selectedYear === 'all' ? 'ever' : `in Year ${selectedYear}`}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 dark:text-slate-500">
            <XCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Control bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          {/* Search box */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, code, category..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-600"
            />
          </div>

          {/* Year Filter Selector */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
            <Calendar className="w-3.5 h-3.5 text-teal-600 shrink-0" />
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Year:</span>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
              className="text-xs font-semibold bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              {availableYears.map(yr => (
                <option key={yr} value={yr} className="dark:bg-slate-900">
                  {yr}
                </option>
              ))}
              <option value="all" className="dark:bg-slate-900">
                All Years
              </option>
            </select>
          </div>

          {/* Status Filter Segmented Buttons */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-2xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 font-medium'
              }`}
            >
              All ({totalItemsCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                statusFilter === 'active'
                  ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                  : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 font-medium'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Active ({activeItemsCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('inactive')}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                statusFilter === 'inactive'
                  ? 'bg-slate-600 text-white shadow-2xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              Inactive ({inactiveItemsCount})
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={handleAddItem}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add item</span>
            </button>
          )}

          {canEdit && (
            <button
              type="button"
              onClick={() => setShowImportBox(!showImportBox)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-slate-500" />
              <span>Import (Upload)</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => exportItemMaster(state.items, state.rows, selectedYear)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xs transition-colors cursor-pointer"
            title={`Export Item Master with ${selectedYear === 'all' ? 'All-Time' : selectedYear} Active/Inactive Status`}
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export ({selectedYear === 'all' ? 'All' : selectedYear})</span>
          </button>

          {canAdmin && state.items.length > 0 && (
            <button
              type="button"
              onClick={handleDeleteAllItems}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 border border-rose-200 dark:border-rose-900 rounded-lg transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete all items</span>
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div className="p-2.5 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 rounded-lg text-xs text-teal-800 dark:text-teal-300 flex items-center justify-between">
          <span>{msg}</span>
          <button onClick={() => setMsg('')} className="font-bold text-teal-700 hover:text-teal-900">
            ×
          </button>
        </div>
      )}

      {/* Import dialog card */}
      {showImportBox && (
        <div className="p-4 rounded-xl border border-teal-300 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/30 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-teal-950 dark:text-teal-200 uppercase tracking-wider flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <span>Import Item Master</span>
            </h3>
            <button
              onClick={() => setShowImportBox(false)}
              className="text-xs text-slate-500 hover:text-slate-800 font-bold"
            >
              ×
            </button>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-normal">
            Choose an Excel file (.xlsx, .csv) with the header row, or paste rows copied from Excel.
            Lines matching an existing Line No. will be updated, and new lines will be created automatically.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-teal-700 file:text-white hover:file:bg-teal-800"
            />
          </div>

          <textarea
            rows={4}
            value={importText}
            onChange={e => setImportText(e.target.value)}
            placeholder="Or paste Excel table rows here directly..."
            className="w-full p-2.5 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-600"
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowImportBox(false)}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white dark:bg-slate-800 rounded-lg border border-slate-300 dark:border-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleImportSubmit}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
            >
              Import items
            </button>
          </div>
        </div>
      )}

      {/* Items Table */}
      <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="w-full text-xs border-collapse leading-tight ledger-table font-sans">
            <thead className="bg-slate-200/90 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold sticky top-0 border-b border-slate-300 dark:border-slate-700 z-10">
              <tr>
                <th className="py-2.5 px-2 text-center w-14 border-r border-slate-300 dark:border-slate-700">
                  Line #
                </th>
                <th className="py-2.5 px-2 text-left w-24 border-r border-slate-300 dark:border-slate-700">
                  Item Code
                </th>
                <th className="py-2.5 px-2 text-left min-w-[170px] border-r border-slate-300 dark:border-slate-700">
                  System Description
                </th>
                <th className="py-2.5 px-2 text-left min-w-[170px] border-r border-slate-300 dark:border-slate-700">
                  Item Description
                </th>
                <th className="py-2.5 px-2 text-left w-24 border-r border-slate-300 dark:border-slate-700">
                  Category
                </th>
                {/* Yearly Status Column */}
                <th className="py-2.5 px-2 text-center min-w-[130px] border-r border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80">
                  <div className="flex flex-col items-center justify-center">
                    <span>Yearly Status</span>
                    <span className="text-[9.5px] font-mono text-teal-700 dark:text-teal-400 font-semibold uppercase">
                      {selectedYear === 'all' ? 'All Time' : `Year ${selectedYear}`}
                    </span>
                  </div>
                </th>
                <th className="py-2.5 px-2 text-right w-20 border-r border-slate-300 dark:border-slate-700">
                  SRP (₱)
                </th>
                <th className="py-2.5 px-2 text-left w-24 border-r border-slate-300 dark:border-slate-700">
                  Location
                </th>
                <th className="py-2.5 px-2 text-center w-20 border-r border-slate-300 dark:border-slate-700">
                  Cost Type
                </th>
                <th className="py-2.5 px-2 text-right w-20 border-r border-slate-300 dark:border-slate-700">
                  Delivery Cost
                </th>
                <th className="py-2.5 px-2 text-right w-20 border-r border-slate-300 dark:border-slate-700">
                  Stock W/D
                </th>
                <th className="py-2.5 px-2 text-center w-16 border-r border-slate-300 dark:border-slate-700">
                  Conversion
                </th>
                <th className="py-2.5 px-2 text-right w-20 bg-teal-50 dark:bg-teal-950/40 border-r border-slate-300 dark:border-slate-700 font-semibold">
                  Unit Cost
                </th>
                {canAdmin && <th className="py-2.5 px-1.5 w-10 text-center"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={canAdmin ? 14 : 13} className="py-12 text-center text-slate-500 italic">
                    {search || statusFilter !== 'all'
                      ? `No items match the filter (${statusFilter !== 'all' ? statusFilter : ''} ${search ? `"${search}"` : ''}).`
                      : 'No items yet. Select "Add item" to create one.'}
                  </td>
                </tr>
              ) : (
                filteredItems.map(it => {
                  const uCost = unitCost(it);
                  const activity = itemActivityMap.get(it.no);
                  const isActive = (activity?.encodedCount || 0) > 0;

                  return (
                    <tr key={it.no} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      {/* Line # */}
                      <td className="py-1 px-2 text-center font-mono tabular-nums text-slate-500 border-r border-slate-200 dark:border-slate-800">
                        {it.no}
                      </td>

                      {/* Item Code */}
                      <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                        <input
                          type="text"
                          disabled={!canEdit}
                          value={it.code}
                          onChange={e => handleCellChange(it.no, 'code', e.target.value)}
                          className="w-full px-1.5 py-0.5 text-xs font-mono bg-transparent border border-transparent hover:border-slate-300 focus:bg-white dark:focus:bg-slate-800 focus:border-teal-600 rounded focus:outline-none"
                        />
                      </td>

                      {/* System Description */}
                      <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                        <input
                          type="text"
                          disabled={!canEdit}
                          value={it.sys}
                          onChange={e => handleCellChange(it.no, 'sys', e.target.value)}
                          className="w-full px-1.5 py-0.5 text-xs bg-transparent border border-transparent hover:border-slate-300 focus:bg-white dark:focus:bg-slate-800 focus:border-teal-600 rounded focus:outline-none"
                        />
                      </td>

                      {/* Item Description */}
                      <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                        <input
                          type="text"
                          disabled={!canEdit}
                          value={it.desc}
                          onChange={e => handleCellChange(it.no, 'desc', e.target.value)}
                          className="w-full px-1.5 py-0.5 text-xs font-semibold text-slate-900 dark:text-slate-100 bg-transparent border border-transparent hover:border-slate-300 focus:bg-white dark:focus:bg-slate-800 focus:border-teal-600 rounded focus:outline-none"
                        />
                      </td>

                      {/* Category */}
                      <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                        <input
                          type="text"
                          disabled={!canEdit}
                          value={it.cat}
                          onChange={e => handleCellChange(it.no, 'cat', e.target.value)}
                          className="w-full px-1.5 py-0.5 text-xs bg-transparent border border-transparent hover:border-slate-300 focus:bg-white dark:focus:bg-slate-800 focus:border-teal-600 rounded focus:outline-none"
                        />
                      </td>

                      {/* Yearly Active / Inactive Status */}
                      <td className="py-1.5 px-2 text-center border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
                        {isActive ? (
                          <div className="inline-flex flex-col items-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              <span>Active</span>
                            </span>
                            <span className="text-[9.5px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono whitespace-nowrap">
                              {activity?.encodedCount} {activity?.encodedCount === 1 ? 'record' : 'records'}
                              {activity?.lastDate ? ` · ${fd(activity.lastDate)}` : ''}
                            </span>
                          </div>
                        ) : (
                          <div className="inline-flex flex-col items-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                              <span>Inactive</span>
                            </span>
                            <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5 whitespace-nowrap">
                              Not encoded in {selectedYear === 'all' ? 'any year' : selectedYear}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* SRP */}
                      <td className="p-1 border-r border-slate-200 dark:border-slate-800 text-right">
                        <input
                          type="number"
                          step="any"
                          disabled={!canEdit}
                          value={raw(it.srp)}
                          onChange={e => handleNumberInput(it.no, 'srp', e.target.value)}
                          className="w-full text-right font-mono tabular-nums px-1.5 py-0.5 text-xs bg-transparent border border-transparent hover:border-slate-300 focus:bg-white dark:focus:bg-slate-800 focus:border-teal-600 rounded focus:outline-none font-bold text-teal-900 dark:text-teal-300"
                        />
                      </td>

                      {/* Location */}
                      <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                        <input
                          type="text"
                          disabled={!canEdit}
                          value={it.loc}
                          onChange={e => handleCellChange(it.no, 'loc', e.target.value)}
                          className="w-full px-1.5 py-0.5 text-xs bg-transparent border border-transparent hover:border-slate-300 focus:bg-white dark:focus:bg-slate-800 focus:border-teal-600 rounded focus:outline-none"
                        />
                      </td>

                      {/* Cost Type VAT / NVAT */}
                      <td className="p-1 border-r border-slate-200 dark:border-slate-800 text-center">
                        <select
                          disabled={!canEdit}
                          value={it.vat}
                          onChange={e => handleCellChange(it.no, 'vat', e.target.value)}
                          className="text-xs bg-transparent border border-transparent hover:border-slate-300 focus:bg-white dark:focus:bg-slate-800 focus:border-teal-600 rounded focus:outline-none px-1 py-0.5"
                        >
                          <option value="VAT" className="dark:bg-slate-900">
                            VAT
                          </option>
                          <option value="NVAT" className="dark:bg-slate-900">
                            NVAT
                          </option>
                        </select>
                      </td>

                      {/* Delivery Cost */}
                      <td className="p-1 border-r border-slate-200 dark:border-slate-800 text-right">
                        <input
                          type="number"
                          step="any"
                          disabled={!canEdit}
                          value={raw(it.deliv)}
                          onChange={e => handleNumberInput(it.no, 'deliv', e.target.value)}
                          className="w-full text-right font-mono tabular-nums px-1.5 py-0.5 text-xs bg-transparent border border-transparent hover:border-slate-300 focus:bg-white dark:focus:bg-slate-800 focus:border-teal-600 rounded focus:outline-none"
                        />
                      </td>

                      {/* Stock Withdrawal */}
                      <td className="p-1 border-r border-slate-200 dark:border-slate-800 text-right">
                        <input
                          type="number"
                          step="any"
                          disabled={!canEdit}
                          value={raw(it.wd)}
                          onChange={e => handleNumberInput(it.no, 'wd', e.target.value)}
                          className="w-full text-right font-mono tabular-nums px-1.5 py-0.5 text-xs bg-transparent border border-transparent hover:border-slate-300 focus:bg-white dark:focus:bg-slate-800 focus:border-teal-600 rounded focus:outline-none"
                        />
                      </td>

                      {/* Conversion */}
                      <td className="p-1 border-r border-slate-200 dark:border-slate-800 text-center">
                        <input
                          type="number"
                          step="any"
                          disabled={!canEdit}
                          value={raw(it.cv)}
                          onChange={e => handleNumberInput(it.no, 'cv', e.target.value)}
                          className="w-full text-center font-mono tabular-nums px-1.5 py-0.5 text-xs bg-transparent border border-transparent hover:border-slate-300 focus:bg-white dark:focus:bg-slate-800 focus:border-teal-600 rounded focus:outline-none"
                        />
                      </td>

                      {/* Calculated Unit Cost */}
                      <td className="py-1 px-2 text-right font-mono tabular-nums border-r border-slate-200 dark:border-slate-800 bg-teal-50/50 dark:bg-teal-950/30 font-medium text-slate-800 dark:text-slate-200">
                        {num(it.cv) > 0 ? acct(uCost) : ''}
                      </td>

                      {/* Delete */}
                      {canAdmin && (
                        <td className="p-1 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(it.no)}
                            className="text-slate-400 hover:text-rose-600 p-1 transition-colors cursor-pointer"
                            title="Delete item"
                          >
                            ×
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Explanatory guidelines */}
      <div className="p-4 rounded-xl bg-slate-100/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
        • <strong>Central Item Master:</strong> Shared across all takehome branch locations. Data Entry pulls SRP and item details directly from this master.
        <br />• <strong>Price Changes:</strong> A price change creates a dedicated line (same item code, new SRP). Internal transfers reconcile price adjustments.
        <br />• <strong>Unit Cost:</strong> Automatically calculated as Delivery Cost ÷ Conversion.
      </div>

      {/* Change History Audit Log */}
      <ChangeHistory
        logs={state.log || []}
        currentTab="master"
        currentLoc={state.inv}
        startDate={state.start}
        cutDate={state.cut}
        canAdmin={canAdmin}
        onDeleteOne={id => {
          onUpdateState(prev => ({
            ...prev,
            log: prev.log.filter(x => x.id !== id)
          }));
        }}
        onDeleteAllShown={ids => {
          const idSet = new Set(ids);
          onUpdateState(prev => ({
            ...prev,
            log: prev.log.filter(x => !idSet.has(x.id || ''))
          }));
        }}
      />
    </div>
  );
};
