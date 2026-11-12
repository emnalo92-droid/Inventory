import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Download,
  Upload,
  Trash2,
  Calendar,
  Clock,
  Search,
  AlertTriangle,
  Eye,
  Check,
  Sparkles,
  X,
  Layers,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  CheckCircle2,
  StickyNote
} from 'lucide-react';
import { AppState, Item, Row, User, PresenceUser, CellNote } from '../types';
import {
  acct,
  addDay,
  autoCarryOver,
  cleanupStrayGeneratedRows,
  computeRows,
  dcmp,
  evaluateFormula,
  f2,
  fd,
  formatTransferLocations,
  getPreviousEndingInventory,
  getWeekOf,
  isPmCarryoverExceptionLocation,
  num,
  parseTransferLocations,
  propagateEndingInventory,
  raw,
  rnd,
  today
} from '../utils/helpers';
import { exportDataEntry, parseDataEntryImport } from '../utils/excel';
import { ChangeHistory } from './ChangeHistory';
import * as XLSX from 'xlsx';

interface CalculatorCellInputProps {
  value: any;
  onChange: (val: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  title?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  hasNote?: boolean;
}

export const CalculatorCellInput: React.FC<CalculatorCellInputProps> = ({
  value,
  onChange,
  disabled = false,
  placeholder = '',
  className = '',
  title,
  onKeyDown,
  hasNote = false
}) => {
  const [text, setText] = useState<string>(raw(value) !== '' ? String(raw(value)) : '');
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setText(raw(value) !== '' ? String(raw(value)) : '');
    }
  }, [value, isFocused]);

  const isFormula = text.trim().startsWith('=');
  const preview = isFormula ? evaluateFormula(text) : null;

  const commitValue = (valToCommit: string) => {
    const trimmed = valToCommit.trim();
    if (trimmed.startsWith('=')) {
      const res = evaluateFormula(trimmed);
      if (res !== null) {
        onChange(String(res));
        setText(String(res));
      } else if (trimmed === '=') {
        onChange('');
        setText('');
      } else {
        onChange('');
        setText('');
      }
    } else {
      onChange(trimmed);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    commitValue(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (text.trim().startsWith('=')) {
        e.preventDefault();
        commitValue(text);
        e.currentTarget.blur();
      }
    } else if (e.key === 'Escape') {
      if (text.trim().startsWith('=')) {
        e.preventDefault();
        setText(raw(value) !== '' ? String(raw(value)) : '');
        e.currentTarget.blur();
      }
    }
    if (onKeyDown) onKeyDown(e);
  };

  return (
    <div className="relative w-full flex items-center justify-center">
      <input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={text}
        placeholder={placeholder}
        title={title || (isFormula ? `Formula: ${text}` : undefined)}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        onChange={e => {
          const v = e.target.value;
          setText(v);
          if (!v.trim().startsWith('=')) {
            onChange(v);
          }
        }}
        onKeyDown={handleKeyDown}
        className={`${className} ${
          hasNote
            ? 'bg-transparent! text-slate-900! dark:text-slate-900! font-semibold'
            : ''
        }`}
      />
      {isFocused && isFormula && (
        <div className="absolute z-40 bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 rounded shadow-lg bg-slate-900/95 dark:bg-slate-950/95 text-teal-300 border border-teal-500/60 text-[9.5px] font-mono whitespace-nowrap pointer-events-none flex items-center gap-1 backdrop-blur-xs">
          <span className="font-bold text-amber-400">fx =</span>
          <span className="font-bold text-white">
            {preview !== null ? preview : <span className="text-slate-400">...</span>}
          </span>
          <span className="text-[8px] text-slate-400 ml-0.5">↵ Enter</span>
        </div>
      )}
    </div>
  );
};

interface DataEntryTabProps {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState, actionDescription?: string) => void;
  canEdit: boolean;
  canAdmin: boolean;
  onAskConfirm: (message: string, onConfirm: () => void) => void;
  currentUser?: User | null;
  onlineUsers?: PresenceUser[];
}

export const DataEntryTab: React.FC<DataEntryTabProps> = ({
  state,
  onUpdateState,
  canEdit,
  canAdmin,
  onAskConfirm,
  currentUser,
  onlineUsers = []
}) => {
  const currentDate = state.vd || state.start || today();
  const currentShift: 'AM' | 'PM' = state.vf === 'PM' ? 'PM' : 'AM';

  const [activeItemSearchIndex, setActiveItemSearchIndex] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedItemIndex, setHighlightedItemIndex] = useState(0);
  const [dropdownCoords, setDropdownCoords] = useState<{
    top: number;
    left: number;
    width: number;
    openAbove: boolean;
  } | null>(null);
  const [tableItemSearch, setTableItemSearch] = useState('');
  const [showToolbarSearchPreview, setShowToolbarSearchPreview] = useState(false);
  const [highlightedToolbarIndex, setHighlightedToolbarIndex] = useState(0);
  const [msg, setMsg] = useState('');
  const [multiLocModal, setMultiLocModal] = useState<{
    rowIndex: number;
    type: 'tf' | 'tt';
    itemDesc: string;
    locations: { loc: string; qty: string }[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const activeInputRef = useRef<HTMLInputElement | null>(null);
  const highlightedItemRef = useRef<HTMLDivElement>(null);
  const toolbarSearchRef = useRef<HTMLDivElement>(null);
  const toolbarInputRef = useRef<HTMLInputElement>(null);

  const totalMultiLocQty = useMemo(() => {
    if (!multiLocModal) return 0;
    return multiLocModal.locations.reduce((sum, entry) => {
      const val = parseFloat(entry.qty);
      return sum + (!isNaN(val) && val > 0 ? val : 0);
    }, 0);
  }, [multiLocModal]);

  // Quick Encoding Table state (Header identical to main table, for fast encoding into table below)
  const [encoderOpen, setEncoderOpen] = useState(true);
  const [encoderForm, setEncoderForm] = useState<{
    itemNo: number | '';
    itemSearch: string;
    beg: string;
    del: string;
    doc: string;
    wd: string;
    tf: string;
    tfl: string;
    tf_locs?: Record<string, number>;
    itf: string;
    tt: string;
    ttl: string;
    tt_locs?: Record<string, number>;
    itt: string;
    bad: string;
    end: string;
  }>({
    itemNo: '',
    itemSearch: '',
    beg: '',
    del: '',
    doc: '',
    wd: '',
    tf: '',
    tfl: '',
    itf: '',
    tt: '',
    ttl: '',
    itt: '',
    bad: '',
    end: ''
  });
  const [showEncoderItemDropdown, setShowEncoderItemDropdown] = useState(false);
  const [encoderDropdownCoords, setEncoderDropdownCoords] = useState<{
    top: number;
    left: number;
    width: number;
    openAbove: boolean;
  } | null>(null);
  const [highlightedEncoderItemIdx, setHighlightedEncoderItemIdx] = useState(0);
  const encoderItemInputRef = useRef<HTMLInputElement>(null);
  const encoderDropdownRef = useRef<HTMLDivElement>(null);
  const highlightedEncoderItemRef = useRef<HTMLDivElement>(null);
  const [lastEncodedItemNo, setLastEncodedItemNo] = useState<number | null>(null);

  // Cell Notes state & handlers (all users can add/edit notes to specific cells)
  const [noteModal, setNoteModal] = useState<{
    isOpen: boolean;
    cellKey: string;
    cellLabel: string;
    currentText: string;
    author?: string;
    timestamp?: number;
  } | null>(null);

  const getCellKey = (r: Row, col: string, rowIndex?: number): string => {
    const itemPart = r.no !== '' && r.no !== undefined ? `item_${r.no}` : (r._id || `row_${rowIndex ?? 0}`);
    return `${r.loc || state.inv}|${r.date}|${r.fr}|${itemPart}|${col}`;
  };

  const getCellNote = (cellKey: string): CellNote | undefined => {
    return state.notes?.[cellKey];
  };

  const handleOpenNoteModal = (cellKey: string, cellLabel: string) => {
    const existing = state.notes?.[cellKey];
    setNoteModal({
      isOpen: true,
      cellKey,
      cellLabel,
      currentText: existing ? existing.text : '',
      author: existing?.author,
      timestamp: existing?.timestamp
    });
  };

  const handleSaveNote = (cellKey: string, text: string, cellLabel: string) => {
    const trimmed = text.trim();
    const authorName = currentUser?.name || currentUser?.user || 'Staff';
    onUpdateState(prev => {
      const nextNotes = { ...(prev.notes || {}) };
      if (!trimmed) {
        delete nextNotes[cellKey];
      } else {
        nextNotes[cellKey] = {
          text: trimmed,
          author: authorName,
          timestamp: Date.now()
        };
      }
      return {
        ...prev,
        notes: nextNotes
      };
    }, trimmed ? `Note updated on ${cellLabel}` : `Note removed from ${cellLabel}`);
    setNoteModal(null);
  };

  const handleDeleteNote = (cellKey: string, cellLabel: string) => {
    onUpdateState(prev => {
      const nextNotes = { ...(prev.notes || {}) };
      delete nextNotes[cellKey];
      return {
        ...prev,
        notes: nextNotes
      };
    }, `Note removed from ${cellLabel}`);
    setNoteModal(null);
  };

  const renderCellNoteIndicator = (cellKey: string, cellLabel: string, note?: CellNote) => (
    <>
      {note && (
        <div
          className="absolute top-0 right-0 w-2.5 h-2.5 overflow-hidden pointer-events-none z-10"
          title={`Note by ${note.author} (${new Date(note.timestamp).toLocaleDateString()}): "${note.text}" (Right-click to edit)`}
        >
          <div className="w-3.5 h-3.5 bg-amber-500 rotate-45 -translate-y-2 translate-x-1 shadow-xs" />
        </div>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleOpenNoteModal(cellKey, cellLabel);
        }}
        className={`absolute top-0.5 right-0.5 p-0.5 rounded transition-opacity z-20 cursor-pointer ${
          note
            ? 'opacity-0 group-hover:opacity-100 bg-amber-300 dark:bg-amber-400 text-amber-950 shadow-xs'
            : 'opacity-0 group-hover:opacity-75 bg-slate-200/90 dark:bg-slate-700/90 text-slate-700 dark:text-slate-200 hover:opacity-100'
        }`}
        title={note ? `Note: "${note.text}" by ${note.author}. Click to edit.` : 'Add note to this cell (Right-click or click)'}
      >
        <StickyNote className="w-2.5 h-2.5" />
      </button>
    </>
  );

  // Computations
  const computed = computeRows(state.rows, state.items);

  // Filter rows for current location, date, and shift (with optional toolbar search)
  const isException = isPmCarryoverExceptionLocation(state.inv);

  const currentRowsWithIndex = state.rows
    .map((r, i) => ({ r, i, c: computed[i] }))
    .filter(
      item =>
        item.r.loc === state.inv &&
        item.r.date === currentDate &&
        item.r.fr === currentShift
    )
    .filter(item => {
      // For exception locations, items with ending inventory in AM shift never show in PM shift
      if (currentShift === 'PM' && isException) {
        const isUntouched =
          (item.r.del === '' || item.r.del === 0) &&
          (item.r.tf === '' || item.r.tf === 0) &&
          (item.r.tt === '' || item.r.tt === 0) &&
          (item.r.bad === '' || item.r.bad === 0) &&
          (item.r.end === '' || item.r.end === undefined);
        if (isUntouched) {
          return false;
        }
      }
      return true;
    })
    .filter(item => {
      if (!tableItemSearch.trim()) return true;
      const s = tableItemSearch.toLowerCase().trim();
      const it = state.items.find(x => x.no === item.r.no);
      if (!it) return false;
      return (
        it.desc.toLowerCase().includes(s) ||
        it.code.toLowerCase().includes(s) ||
        it.cat.toLowerCase().includes(s) ||
        String(it.no).includes(s) ||
        String(it.srp).includes(s)
      );
    });

  // Sort rows by Category, then Item Description, then row index
  currentRowsWithIndex.sort((a, b) => {
    const itA = state.items.find(x => x.no === a.r.no);
    const itB = state.items.find(x => x.no === b.r.no);
    const catA = itA?.cat || 'Uncategorized';
    const catB = itB?.cat || 'Uncategorized';
    const catCmp = catA.localeCompare(catB);
    if (catCmp !== 0) return catCmp;
    const descA = itA?.desc || '';
    const descB = itB?.desc || '';
    return descA.localeCompare(descB) || (a.r.no as number) - (b.r.no as number) || a.i - b.i;
  });

  // Group by category
  const categories: { name: string; items: typeof currentRowsWithIndex }[] = [];
  currentRowsWithIndex.forEach(item => {
    const it = state.items.find(x => x.no === item.r.no);
    const catName = it?.cat || 'Uncategorized';
    let group = categories.find(g => g.name === catName);
    if (!group) {
      group = { name: catName, items: [] };
      categories.push(group);
    }
    group.items.push(item);
  });

  // Total sales across all categories for today's shift
  const totalSalesDay = currentRowsWithIndex.reduce((sum, item) => sum + item.c.sales, 0);

  // Cash Details
  const cashKey = `${state.inv}|${currentDate}${currentShift === 'PM' ? '|PM' : ''}`;
  const cashOnHandRaw = state.cash[cashKey];
  const hasCash = cashOnHandRaw !== undefined && cashOnHandRaw !== '';
  const cashOnHandVal = num(cashOnHandRaw);
  const overShortVal = hasCash ? cashOnHandVal - totalSalesDay : 0;
  const currentCashier = state.cinfo[cashKey]?.cashier || '';
  const currentShiftLetter = state.cinfo[cashKey]?.shift || '';

  const updateDropdownCoords = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove = spaceBelow < 320 && rect.top > 320;

    const targetWidth = Math.max(360, Math.min(460, window.innerWidth - 24));
    let targetLeft = rect.left;
    if (targetLeft + targetWidth > window.innerWidth - 12) {
      targetLeft = window.innerWidth - targetWidth - 12;
    }
    if (targetLeft < 12) targetLeft = 12;

    setDropdownCoords({
      top: openAbove ? Math.max(10, rect.top - 6) : rect.bottom + 4,
      left: targetLeft,
      width: targetWidth,
      openAbove
    });
  };

  const updateEncoderDropdownCoords = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove = spaceBelow < 340 && rect.top > 340;

    const targetWidth = Math.max(380, Math.min(480, window.innerWidth - 24));
    let targetLeft = rect.left;
    if (targetLeft + targetWidth > window.innerWidth - 12) {
      targetLeft = window.innerWidth - targetWidth - 12;
    }
    if (targetLeft < 12) targetLeft = 12;

    setEncoderDropdownCoords({
      top: openAbove ? Math.max(10, rect.top - 6) : rect.bottom + 4,
      left: targetLeft,
      width: targetWidth,
      openAbove
    });
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        activeInputRef.current &&
        !activeInputRef.current.contains(target)
      ) {
        setActiveItemSearchIndex(null);
        setDropdownCoords(null);
      }
      if (
        toolbarSearchRef.current &&
        !toolbarSearchRef.current.contains(target) &&
        toolbarInputRef.current &&
        !toolbarInputRef.current.contains(target)
      ) {
        setShowToolbarSearchPreview(false);
      }
      if (
        encoderDropdownRef.current &&
        !encoderDropdownRef.current.contains(target) &&
        encoderItemInputRef.current &&
        !encoderItemInputRef.current.contains(target)
      ) {
        setShowEncoderItemDropdown(false);
        setEncoderDropdownCoords(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-scroll highlighted item in preview dropdown into view
  useEffect(() => {
    if (highlightedItemRef.current) {
      highlightedItemRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedItemIndex]);

  // Auto-scroll highlighted item in encoder preview dropdown into view
  useEffect(() => {
    if (highlightedEncoderItemRef.current) {
      highlightedEncoderItemRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedEncoderItemIdx]);

  // Update dropdown coordinates on window or table scroll
  useEffect(() => {
    if (activeItemSearchIndex === null) return;
    const updatePos = () => {
      if (activeInputRef.current) {
        updateDropdownCoords(activeInputRef.current);
      }
    };
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [activeItemSearchIndex]);

  // Update encoder dropdown coordinates on window or table scroll
  useEffect(() => {
    if (!showEncoderItemDropdown) return;
    const updatePos = () => {
      if (encoderItemInputRef.current) {
        updateEncoderDropdownCoords(encoderItemInputRef.current);
      }
    };
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [showEncoderItemDropdown]);

  // Match highlighter helper
  const highlightMatch = (text: string, query: string) => {
    if (!query || !query.trim()) return <>{text}</>;
    const cleanQ = query.trim();
    const escaped = cleanQ.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const parts = text.split(regex);
    return (
      <>
        {parts.map((part, idx) =>
          part.toLowerCase() === cleanQ.toLowerCase() ? (
            <mark
              key={idx}
              className="bg-amber-200 dark:bg-amber-800/80 text-amber-950 dark:text-amber-100 font-bold px-0.5 rounded"
            >
              {part}
            </mark>
          ) : (
            <span key={idx}>{part}</span>
          )
        )}
      </>
    );
  };

  const handleDateChange = (newDate: string) => {
    onUpdateState(prev => {
      const nextShift = prev.vf === 'PM' ? 'PM' : 'AM';
      const cleaned = cleanupStrayGeneratedRows(prev.rows, prev.inv);
      const rowsWithCarry = autoCarryOver({ ...prev, rows: cleaned, vd: newDate }, newDate, nextShift);
      return {
        ...prev,
        vd: newDate,
        rows: rowsWithCarry
      };
    });
  };

  const handleShiftChange = (newShift: 'AM' | 'PM') => {
    onUpdateState(prev => {
      const activeDate = prev.vd || prev.start || today();
      const cleaned = cleanupStrayGeneratedRows(prev.rows, prev.inv);
      const rowsWithCarry = autoCarryOver({ ...prev, rows: cleaned, vf: newShift }, activeDate, newShift);
      return {
        ...prev,
        vf: newShift,
        rows: rowsWithCarry
      };
    });
  };

  const handlePrevDay = () => {
    handleDateChange(addDay(currentDate, -1));
  };

  const handleNextDay = () => {
    handleDateChange(addDay(currentDate, 1));
  };

  const handleAddRow = () => {
    onUpdateState(
      prev => ({
        ...prev,
        rows: [
          ...prev.rows,
          {
            no: '',
            date: currentDate,
            loc: prev.inv,
            fr: currentShift,
            beg: '',
            del: '',
            doc: '',
            wd: '',
            tf: '',
            tfl: '',
            itf: '',
            tt: '',
            ttl: '',
            itt: '',
            bad: '',
            end: ''
          }
        ]
      }),
      `Blank row added on ${fd(currentDate)} (${currentShift} Shift)`
    );
  };

  const handleCellChange = (rowIndex: number, field: keyof Row, value: any) => {
    onUpdateState(prev => {
      const newRows = [...prev.rows];
      const target: Row = {
        ...newRows[rowIndex],
        [field]: value,
        _t: Date.now(),
        _u: currentUser?.name || currentUser?.user || 'Staff'
      };
      if (field === 'tf') {
        const numVal = typeof value === 'number' ? value : parseFloat(String(value));
        if (!isNaN(numVal) && numVal > 0 && target.tfl && (!target.tf_locs || Object.keys(target.tf_locs).length <= 1)) {
          target.tf_locs = { [target.tfl]: numVal };
        }
      }
      if (field === 'tt') {
        const numVal = typeof value === 'number' ? value : parseFloat(String(value));
        if (!isNaN(numVal) && numVal > 0 && target.ttl && (!target.tt_locs || Object.keys(target.tt_locs).length <= 1)) {
          target.tt_locs = { [target.ttl]: numVal };
        }
      }
      newRows[rowIndex] = target;

      // When ending inventory is entered or updated, automatically propagate to PM shift or next date!
      if (field === 'end' && target.no !== '') {
        const nextRows = propagateEndingInventory(
          newRows,
          target.loc,
          target.no,
          target.date,
          target.fr,
          value
        );
        return { ...prev, rows: nextRows };
      }

      return { ...prev, rows: newRows };
    }, field === 'end'
      ? isPmCarryoverExceptionLocation(state.inv) && currentShift === 'AM'
        ? `Updated AM ending inventory on ${fd(currentDate)} (carries forward to tomorrow AM)`
        : `Updated ending inventory for ${currentShift} shift on ${fd(currentDate)}`
      : undefined);
  };

  const handleNumberInput = (rowIndex: number, field: keyof Row, rawVal: string) => {
    const trimmed = rawVal.trim();
    if (trimmed.startsWith('=')) {
      const res = evaluateFormula(trimmed);
      handleCellChange(rowIndex, field, res !== null ? res : '');
      return;
    }
    const clean = trimmed === '' ? '' : parseFloat(trimmed.replace(/,/g, ''));
    const val = isNaN(clean as number) ? '' : clean;
    handleCellChange(rowIndex, field, val);
  };

  const openMultiLocModal = (rowIndex: number, type: 'tf' | 'tt') => {
    const row = state.rows[rowIndex];
    if (!row) return;
    const itemObj = state.items.find(x => x.no === row.no);
    const itemDesc = itemObj ? itemObj.desc : (row.no !== '' ? `Item #${row.no}` : 'Item');

    const existingLocString = type === 'tf' ? row.tfl : row.ttl;
    const existingLocsMap = type === 'tf' ? row.tf_locs : row.tt_locs;
    const existingTotalQty = type === 'tf' ? row.tf : row.tt;

    const parsed = parseTransferLocations(existingLocString, existingLocsMap, existingTotalQty);
    const defaultLoc = state.locs.find(l => l !== state.inv) || state.locs[0] || '';
    const locations = parsed.length > 0
      ? parsed.map(p => ({ loc: p.loc, qty: String(p.qty) }))
      : [{ loc: defaultLoc, qty: existingTotalQty !== '' && existingTotalQty !== undefined ? String(existingTotalQty) : '' }];

    setMultiLocModal({
      rowIndex,
      type,
      itemDesc,
      locations
    });
  };

  const handleAddModalLocRow = () => {
    if (!multiLocModal) return;
    const unused = state.locs.find(l => l !== state.inv && !multiLocModal.locations.some(e => e.loc === l));
    const fallback = unused || state.locs.find(l => l !== state.inv) || state.locs[0] || '';
    setMultiLocModal(prev => prev ? {
      ...prev,
      locations: [...prev.locations, { loc: fallback, qty: '' }]
    } : null);
  };

  const handleRemoveModalLocRow = (index: number) => {
    if (!multiLocModal) return;
    const fallback = state.locs.find(l => l !== state.inv) || state.locs[0] || '';
    setMultiLocModal(prev => prev ? {
      ...prev,
      locations: prev.locations.length > 1
        ? prev.locations.filter((_, i) => i !== index)
        : [{ loc: fallback, qty: '' }]
    } : null);
  };

  const handleUpdateModalLocEntry = (index: number, field: 'loc' | 'qty', value: string) => {
    if (!multiLocModal) return;
    setMultiLocModal(prev => prev ? {
      ...prev,
      locations: prev.locations.map((entry, i) => i === index ? { ...entry, [field]: value } : entry)
    } : null);
  };

  const handleSaveMultiLocModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!multiLocModal) return;
    const { rowIndex, type, locations, itemDesc } = multiLocModal;

    const validEntries = locations
      .map(entry => ({ loc: entry.loc.trim(), qty: parseFloat(entry.qty) }))
      .filter(entry => entry.loc && !isNaN(entry.qty) && entry.qty > 0);

    const formatted = formatTransferLocations(validEntries);

    if (rowIndex === -1) {
      if (type === 'tf') {
        setEncoderForm(prev => ({
          ...prev,
          tf: formatted.total > 0 ? String(formatted.total) : '',
          tfl: formatted.label,
          tf_locs: formatted.map
        }));
      } else {
        setEncoderForm(prev => ({
          ...prev,
          tt: formatted.total > 0 ? String(formatted.total) : '',
          ttl: formatted.label,
          tt_locs: formatted.map
        }));
      }
      setMultiLocModal(null);
      return;
    }

    onUpdateState(prev => {
      const newRows = [...prev.rows];
      const target = { ...newRows[rowIndex] };

      if (type === 'tf') {
        target.tf = formatted.total > 0 ? formatted.total : '';
        target.tfl = formatted.label;
        if (formatted.map && Object.keys(formatted.map).length > 0) {
          target.tf_locs = formatted.map;
        } else {
          delete target.tf_locs;
        }
      } else {
        target.tt = formatted.total > 0 ? formatted.total : '';
        target.ttl = formatted.label;
        if (formatted.map && Object.keys(formatted.map).length > 0) {
          target.tt_locs = formatted.map;
        } else {
          delete target.tt_locs;
        }
      }

      target._t = Date.now();
      target._u = currentUser?.name || currentUser?.user || 'Staff';
      newRows[rowIndex] = target;

      return { ...prev, rows: newRows };
    }, `Updated ${type === 'tf' ? 'Transfer From' : 'Transfer To'} locations for ${itemDesc}: ${formatted.total} units across ${validEntries.length} location(s)`);

    setMultiLocModal(null);
  };

  const openEncoderMultiLocModal = (type: 'tf' | 'tt') => {
    const itemObj = state.items.find(x => x.no === encoderForm.itemNo);
    const itemDesc = itemObj ? itemObj.desc : (encoderForm.itemNo !== '' ? `Item #${encoderForm.itemNo}` : 'Current Item');

    const existingLocString = type === 'tf' ? encoderForm.tfl : encoderForm.ttl;
    const existingLocsMap = type === 'tf' ? encoderForm.tf_locs : encoderForm.tt_locs;
    const existingTotalQty = type === 'tf' ? encoderForm.tf : encoderForm.tt;

    const parsed = parseTransferLocations(existingLocString, existingLocsMap, existingTotalQty);
    const defaultLoc = state.locs.find(l => l !== state.inv) || state.locs[0] || '';
    const locations = parsed.length > 0
      ? parsed.map(p => ({ loc: p.loc, qty: String(p.qty) }))
      : [{ loc: defaultLoc, qty: existingTotalQty !== '' && existingTotalQty !== undefined ? String(existingTotalQty) : '' }];

    setMultiLocModal({
      rowIndex: -1,
      type,
      itemDesc,
      locations
    });
  };

  const encoderSelected = useMemo(() => {
    if (encoderForm.itemNo === '') return null;
    return state.items.find(x => x.no === encoderForm.itemNo) || null;
  }, [encoderForm.itemNo, state.items]);

  const encoderExisting = useMemo(() => {
    if (encoderForm.itemNo === '') return false;
    return currentRowsWithIndex.some(x => x.r.no === encoderForm.itemNo);
  }, [encoderForm.itemNo, currentRowsWithIndex]);

  const encoderCalculated = useMemo(() => {
    const evalOrFloat = (str: string) => {
      const trimmed = str.trim();
      if (trimmed.startsWith('=')) {
        const res = evaluateFormula(trimmed);
        return res !== null ? res : 0;
      }
      return parseFloat(trimmed.replace(/,/g, '')) || 0;
    };

    const begN = evalOrFloat(encoderForm.beg);
    const delN = evalOrFloat(encoderForm.del);
    const tfN = evalOrFloat(encoderForm.tf);
    const itfN = evalOrFloat(encoderForm.itf);
    const ttN = evalOrFloat(encoderForm.tt);
    const ittN = evalOrFloat(encoderForm.itt);
    const badN = evalOrFloat(encoderForm.bad);
    const wdN = evalOrFloat(encoderForm.wd);
    const endRaw = encoderForm.end.trim();
    const endN = endRaw === '' ? null : (endRaw.startsWith('=') ? evaluateFormula(endRaw) : parseFloat(endRaw.replace(/,/g, '')) || 0);

    const tg = begN + delN + tfN + itfN - ttN - ittN;
    const sold = (tg > 0 || endN !== null) ? Math.max(0, tg - (endN ?? 0) - badN - wdN) : 0;
    const srp = encoderSelected ? encoderSelected.srp : 0;
    const sales = sold * srp;

    return {
      tg,
      sold,
      srp,
      sales
    };
  }, [encoderForm, encoderSelected]);

  const matchingEncoderItems = useMemo(() => {
    // Do not show preview if an item is already chosen or no letters have been typed
    if (encoderForm.itemNo !== '') {
      return [];
    }
    const q = encoderForm.itemSearch.trim().toLowerCase();
    if (!q) {
      return [];
    }
    const filtered = state.items.filter(it =>
      it.desc.toLowerCase().includes(q) ||
      it.code.toLowerCase().includes(q) ||
      it.cat.toLowerCase().includes(q) ||
      String(it.no).includes(q)
    );

    return filtered.sort((a, b) => {
      const aDesc = a.desc.toLowerCase();
      const bDesc = b.desc.toLowerCase();
      const aStarts = aDesc.startsWith(q);
      const bStarts = bDesc.startsWith(q);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;

      // Check if a word in description starts with query
      const aWordStarts = aDesc.split(/\s+/).some(w => w.startsWith(q));
      const bWordStarts = bDesc.split(/\s+/).some(w => w.startsWith(q));
      if (aWordStarts && !bWordStarts) return -1;
      if (!aWordStarts && bWordStarts) return 1;

      return aDesc.localeCompare(bDesc);
    }).slice(0, 40);
  }, [encoderForm.itemSearch, encoderForm.itemNo, state.items]);

  const handleSelectEncoderItem = (itemNo: number) => {
    const itemObj = state.items.find(x => x.no === itemNo);
    if (!itemObj) return;

    // Retrieve previous date/shift ending inventory to show as beginning inventory
    const prevEnding = getPreviousEndingInventory(itemNo, state.inv, currentDate, currentShift, state.rows);

    // Check if item already exists in the current shift/date rows below
    const existingEntry = currentRowsWithIndex.find(x => x.r.no === itemNo);

    if (existingEntry) {
      const r = existingEntry.r;
      // If row has explicit beg, use it; otherwise use computed beg or previous ending inventory
      let initialBeg = '';
      if (r.beg !== '' && r.beg !== undefined) {
        initialBeg = String(r.beg);
      } else if (existingEntry.c.auto) {
        initialBeg = existingEntry.c.beg > 0 ? String(existingEntry.c.beg) : '';
      } else if (prevEnding !== null && prevEnding > 0) {
        initialBeg = String(prevEnding);
      } else {
        initialBeg = '';
      }

      setEncoderForm({
        itemNo,
        itemSearch: itemObj.desc,
        beg: initialBeg,
        del: r.del !== '' && r.del !== undefined ? String(r.del) : '',
        doc: r.doc || '',
        wd: r.wd !== '' && r.wd !== undefined ? String(r.wd) : '',
        tf: r.tf !== '' && r.tf !== undefined ? String(r.tf) : '',
        tfl: r.tfl || '',
        tf_locs: r.tf_locs,
        itf: r.itf !== '' && r.itf !== undefined ? String(r.itf) : '',
        tt: r.tt !== '' && r.tt !== undefined ? String(r.tt) : '',
        ttl: r.ttl || '',
        tt_locs: r.tt_locs,
        itt: r.itt !== '' && r.itt !== undefined ? String(r.itt) : '',
        bad: r.bad !== '' && r.bad !== undefined ? String(r.bad) : '',
        end: r.end !== '' && r.end !== undefined ? String(r.end) : ''
      });
    } else {
      const carryBeg = prevEnding !== null && prevEnding > 0 ? String(prevEnding) : '';
      setEncoderForm({
        itemNo,
        itemSearch: itemObj.desc,
        beg: carryBeg,
        del: '',
        doc: '',
        wd: '',
        tf: '',
        tfl: '',
        itf: '',
        tt: '',
        ttl: '',
        itt: '',
        bad: '',
        end: ''
      });
    }

    setShowEncoderItemDropdown(false);
    setEncoderDropdownCoords(null);
  };

  const handleCommitEncoderRow = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (encoderForm.itemNo === '') {
      setMsg('Please search and select an item first before encoding.');
      if (encoderItemInputRef.current) encoderItemInputRef.current.focus();
      return;
    }

    const itemObj = state.items.find(x => x.no === encoderForm.itemNo);
    const itemDesc = itemObj?.desc || `Item #${encoderForm.itemNo}`;

    const numOrBlank = (val: string) => {
      const trimmed = val.trim();
      if (trimmed === '') return '';
      if (trimmed.startsWith('=')) {
        const res = evaluateFormula(trimmed);
        return res !== null ? res : '';
      }
      const parsed = parseFloat(trimmed.replace(/,/g, ''));
      return isNaN(parsed) ? '' : parsed;
    };

    const newBeg = numOrBlank(encoderForm.beg);
    const newDel = numOrBlank(encoderForm.del);
    const newDoc = encoderForm.doc.trim();
    const newWd = numOrBlank(encoderForm.wd);
    const newTf = numOrBlank(encoderForm.tf);
    const newTfl = encoderForm.tfl.trim();
    const newTfLocs = encoderForm.tf_locs;
    const newItf = numOrBlank(encoderForm.itf);
    const newTt = numOrBlank(encoderForm.tt);
    const newTtl = encoderForm.ttl.trim();
    const newTtLocs = encoderForm.tt_locs;
    const newItt = numOrBlank(encoderForm.itt);
    const newBad = numOrBlank(encoderForm.bad);
    const newEnd = numOrBlank(encoderForm.end);

    onUpdateState(prev => {
      const nextRows = [...prev.rows];
      const existingIdx = nextRows.findIndex(
        r => r.loc === prev.inv && r.date === currentDate && r.fr === currentShift && r.no === encoderForm.itemNo
      );

      if (existingIdx >= 0) {
        const updatedRow: Row = {
          ...nextRows[existingIdx],
          beg: newBeg !== '' ? newBeg : nextRows[existingIdx].beg,
          del: newDel,
          doc: newDoc,
          wd: newWd,
          tf: newTf,
          tfl: newTfl,
          itf: newItf,
          tt: newTt,
          ttl: newTtl,
          itt: newItt,
          bad: newBad,
          end: newEnd,
          _t: Date.now(),
          _u: currentUser?.name || currentUser?.user || 'Staff'
        };

        if (newTfLocs && Object.keys(newTfLocs).length > 0) {
          updatedRow.tf_locs = newTfLocs;
        } else {
          delete updatedRow.tf_locs;
        }

        if (newTtLocs && Object.keys(newTtLocs).length > 0) {
          updatedRow.tt_locs = newTtLocs;
        } else {
          delete updatedRow.tt_locs;
        }

        nextRows[existingIdx] = updatedRow;

        if (newEnd !== '' && newEnd !== undefined) {
          const propagated = propagateEndingInventory(
            nextRows,
            prev.inv,
            encoderForm.itemNo as number,
            currentDate,
            currentShift,
            newEnd
          );
          return { ...prev, rows: propagated };
        }
      } else {
        const newRow: Row = {
          no: encoderForm.itemNo,
          date: currentDate,
          loc: prev.inv,
          fr: currentShift,
          beg: newBeg,
          del: newDel,
          doc: newDoc,
          wd: newWd,
          tf: newTf,
          tfl: newTfl,
          itf: newItf,
          tt: newTt,
          ttl: newTtl,
          itt: newItt,
          bad: newBad,
          end: newEnd,
          _t: Date.now(),
          _u: currentUser?.name || currentUser?.user || 'Staff'
        };

        if (newTfLocs && Object.keys(newTfLocs).length > 0) {
          newRow.tf_locs = newTfLocs;
        }
        if (newTtLocs && Object.keys(newTtLocs).length > 0) {
          newRow.tt_locs = newTtLocs;
        }

        nextRows.push(newRow);

        if (newEnd !== '' && newEnd !== undefined) {
          const propagated = propagateEndingInventory(
            nextRows,
            prev.inv,
            encoderForm.itemNo as number,
            currentDate,
            currentShift,
            newEnd
          );
          return { ...prev, rows: propagated };
        }
      }

      return { ...prev, rows: nextRows };
    }, `Encoded ${itemDesc} into table (${currentShift} Shift)`);

    setLastEncodedItemNo(encoderForm.itemNo as number);
    setMsg(`✓ Successfully encoded "${itemDesc}" into the inventory table below.`);

    // Reset encoder form for next item
    setEncoderForm({
      itemNo: '',
      itemSearch: '',
      beg: '',
      del: '',
      doc: '',
      wd: '',
      tf: '',
      tfl: '',
      itf: '',
      tt: '',
      ttl: '',
      itt: '',
      bad: '',
      end: ''
    });

    setTimeout(() => {
      if (encoderItemInputRef.current) {
        encoderItemInputRef.current.focus();
      }
    }, 60);
  };

  const handleResetEncoder = () => {
    setEncoderForm({
      itemNo: '',
      itemSearch: '',
      beg: '',
      del: '',
      doc: '',
      wd: '',
      tf: '',
      tfl: '',
      itf: '',
      tt: '',
      ttl: '',
      itt: '',
      bad: '',
      end: ''
    });
    if (encoderItemInputRef.current) encoderItemInputRef.current.focus();
  };

  const handleEncoderKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCommitEncoderRow();
    }
  };

  const handleDeleteRow = (rowIndex: number) => {
    const row = state.rows[rowIndex];
    const itemObj = state.items.find(x => x.no === row.no);
    const label = itemObj?.desc || '(unspecified item)';

    onUpdateState(prev => {
      const newRows = [...prev.rows];
      const removed = newRows.splice(rowIndex, 1)[0];
      const nextNc = { ...(prev.nc || {}) };
      if (removed && removed.gen && removed.no) {
        nextNc[`${removed.loc}|${removed.date}${removed.fr === 'PM' ? '|PM' : ''}|${removed.no}`] = 1;
      }
      return {
        ...prev,
        rows: newRows,
        nc: nextNc
      };
    }, `${fd(row.date)} ${row.fr} ${label} row deleted`);
  };

  const handleDeleteAllEntries = () => {
    const count = state.rows.filter(r => r.loc === state.inv).length;
    onAskConfirm(
      `Delete all ${count} entries for ${state.inv} (across every date and shift)?\nThis will also reset cash details for this location.`,
      () => {
        onUpdateState(
          prev => {
            const remainingRows = prev.rows.filter(r => r.loc !== prev.inv);
            const nextCash = { ...prev.cash };
            const nextCinfo = { ...prev.cinfo };
            const nextCpay = { ...prev.cpay };
            const nextNc = { ...(prev.nc || {}) };

            Object.keys(nextCash).forEach(k => {
              if (k.startsWith(prev.inv + '|')) delete nextCash[k];
            });
            Object.keys(nextCinfo).forEach(k => {
              if (k.startsWith(prev.inv + '|')) delete nextCinfo[k];
            });
            Object.keys(nextCpay).forEach(k => {
              if (k.startsWith(prev.inv + '|')) delete nextCpay[k];
            });
            Object.keys(nextNc).forEach(k => {
              if (k.startsWith(prev.inv + '|')) delete nextNc[k];
            });

            return {
              ...prev,
              rows: remainingRows,
              cash: nextCash,
              cinfo: nextCinfo,
              cpay: nextCpay,
              nc: nextNc
            };
          },
          `All ${count} entries for ${state.inv} deleted`
        );
      }
    );
  };

  const handleCashChange = (valStr: string) => {
    const clean = valStr.trim() === '' ? '' : parseFloat(valStr.replace(/,/g, ''));
    const val = isNaN(clean as number) ? '' : clean;
    onUpdateState(prev => ({
      ...prev,
      cash: {
        ...prev.cash,
        [cashKey]: val
      }
    }));
  };

  const handleCashierChange = (field: 'cashier' | 'shift', val: string) => {
    onUpdateState(
      prev => ({
        ...prev,
        cinfo: {
          ...prev.cinfo,
          [cashKey]: {
            cashier: field === 'cashier' ? val : prev.cinfo[cashKey]?.cashier || '',
            shift: field === 'shift' ? val : prev.cinfo[cashKey]?.shift || ''
          }
        }
      }),
      `${fd(currentDate)} ${currentShift} Cashier ${field === 'cashier' ? 'Name' : 'Shift'} updated: ${val}`
    );
  };

  // Filter items for row item autocomplete with real-time preview ranking
  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return state.items;
    const term = searchTerm.toLowerCase().trim();
    return [...state.items]
      .filter(it => {
        return (
          it.desc.toLowerCase().includes(term) ||
          it.code.toLowerCase().includes(term) ||
          it.cat.toLowerCase().includes(term) ||
          it.sys.toLowerCase().includes(term) ||
          String(it.srp).includes(term) ||
          String(it.no).includes(term)
        );
      })
      .sort((a, b) => {
        const aDesc = a.desc.toLowerCase();
        const bDesc = b.desc.toLowerCase();
        const aStarts = aDesc.startsWith(term);
        const bStarts = bDesc.startsWith(term);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        const aIndex = aDesc.indexOf(term);
        const bIndex = bDesc.indexOf(term);
        if (aIndex !== -1 && bIndex !== -1 && aIndex !== bIndex) {
          return aIndex - bIndex;
        }
        return a.no - b.no;
      });
  }, [state.items, searchTerm]);

  // Filter items for toolbar search preview while typing letters or numbers
  const toolbarFilteredItems = useMemo(() => {
    if (!tableItemSearch.trim()) return [];
    const term = tableItemSearch.toLowerCase().trim();
    return [...state.items]
      .filter(it => {
        return (
          it.desc.toLowerCase().includes(term) ||
          it.code.toLowerCase().includes(term) ||
          it.cat.toLowerCase().includes(term) ||
          it.sys.toLowerCase().includes(term) ||
          String(it.srp).includes(term) ||
          String(it.no).includes(term)
        );
      })
      .sort((a, b) => {
        const aDesc = a.desc.toLowerCase();
        const bDesc = b.desc.toLowerCase();
        const aStarts = aDesc.startsWith(term);
        const bStarts = bDesc.startsWith(term);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.no - b.no;
      });
  }, [state.items, tableItemSearch]);

  const selectItemForCurrentRow = (itemNo: number) => {
    if (activeItemSearchIndex === null) return;
    const targetRow = state.rows[activeItemSearchIndex];
    const prevItem = state.items.find(x => x.no === targetRow.no);
    const nextItem = state.items.find(x => x.no === itemNo);
    const prevEnding = getPreviousEndingInventory(itemNo, state.inv, targetRow.date, targetRow.fr, state.rows);

    onUpdateState(
      prev => {
        const nextRows = [...prev.rows];
        const target = { ...nextRows[activeItemSearchIndex] };
        target.no = itemNo;
        if (target.beg === '' || target.beg === undefined) {
          target.beg = prevEnding !== null && prevEnding > 0 ? prevEnding : '';
        }
        target._t = Date.now();
        target._u = currentUser?.name || currentUser?.user || 'Staff';
        nextRows[activeItemSearchIndex] = target;
        return { ...prev, rows: nextRows };
      },
      `${fd(targetRow.date)} ${targetRow.fr} item changed: "${prevItem?.desc || '(blank)'}" → "${nextItem?.desc || ''}"`
    );

    setActiveItemSearchIndex(null);
    setDropdownCoords(null);
    setSearchTerm('');
  };

  // File import
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const data = evt.target?.result;
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const sheetRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        const result = parseDataEntryImport(sheetRows, state);
        if (result.error) {
          setMsg(result.error);
          return;
        }

        onUpdateState(
          prev => ({
            ...prev,
            rows: result.newRows,
            cash: { ...prev.cash, ...result.cashUpdates },
            cinfo: { ...prev.cinfo, ...result.cinfoUpdates }
          }),
          `Imported entries: ${result.added} added, ${result.updated} updated${
            result.skipped ? `, ${result.skipped} skipped` : ''
          }`
        );
        setMsg(`Import complete: ${result.added} added, ${result.updated} updated.`);
      } catch {
        setMsg('Could not process this Excel file. Check format.');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-4">
      {/* Control Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        {/* Left: Date & Shift picker, Prev/Next day */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700">
            <Calendar className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
            <input
              type="date"
              value={currentDate}
              onChange={e => handleDateChange(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700">
            <Clock className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
            <select
              value={currentShift}
              onChange={e => handleShiftChange(e.target.value as 'AM' | 'PM')}
              className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value="AM" className="dark:bg-slate-900">
                AM Shift
              </option>
              <option value="PM" className="dark:bg-slate-900">
                PM Shift
              </option>
            </select>
          </div>

          {isPmCarryoverExceptionLocation(state.inv) && (
            <span
              className="hidden md:inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
              title="Exception Branch: Items with ending inventory carry over directly to tomorrow AM, not PM shift."
            >
              Next-Date Carryover Exception
            </span>
          )}

          <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-0.5">
            <button
              type="button"
              onClick={handlePrevDay}
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              title="Previous Day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleNextDay}
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              title="Next Day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Active branch colleagues indicator */}
          {onlineUsers.filter(u => u.userId !== currentUser?.id && u.loc === state.inv).length > 0 && (
            <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-emerald-50 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>
                {onlineUsers
                  .filter(u => u.userId !== currentUser?.id && u.loc === state.inv)
                  .map(c => c.name.split(' ')[0])
                  .join(', ')}{' '}
                also active on {state.inv.split(' ')[0]}
              </span>
            </div>
          )}
        </div>

        {/* Center: Search Item Description with Real-time Preview while typing */}
        <div className="relative min-w-[220px] sm:min-w-[280px] max-w-sm flex-1">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
            <input
              ref={toolbarInputRef}
              type="text"
              value={tableItemSearch}
              onChange={e => {
                setTableItemSearch(e.target.value);
                setShowToolbarSearchPreview(true);
                setHighlightedToolbarIndex(0);
              }}
              onFocus={() => setShowToolbarSearchPreview(true)}
              onKeyDown={e => {
                if (!showToolbarSearchPreview || toolbarFilteredItems.length === 0) return;
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setHighlightedToolbarIndex(prev => Math.min(prev + 1, toolbarFilteredItems.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setHighlightedToolbarIndex(prev => Math.max(prev - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (toolbarFilteredItems[highlightedToolbarIndex]) {
                    setTableItemSearch(toolbarFilteredItems[highlightedToolbarIndex].desc);
                    setShowToolbarSearchPreview(false);
                  }
                } else if (e.key === 'Escape') {
                  setShowToolbarSearchPreview(false);
                }
              }}
              placeholder="Search item description..."
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-600 focus:bg-white dark:focus:bg-slate-900 transition-colors"
            />
            {tableItemSearch && (
              <button
                type="button"
                onClick={() => {
                  setTableItemSearch('');
                  setShowToolbarSearchPreview(false);
                }}
                className="absolute right-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Toolbar Search Preview Dropdown while typing letters or numbers */}
          {showToolbarSearchPreview && tableItemSearch.trim() && (
            <div
              ref={toolbarSearchRef}
              className="absolute left-0 top-full mt-1.5 z-40 w-full min-w-[320px] max-w-md max-h-72 overflow-y-auto rounded-xl bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 shadow-2xl p-2 text-xs divide-y divide-slate-100 dark:divide-slate-800"
            >
              <div className="pb-1.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span className="font-medium flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span>Item Preview: "{tableItemSearch}"</span>
                </span>
                <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-semibold">
                  {toolbarFilteredItems.length} found
                </span>
              </div>

              <div className="pt-1.5 overflow-y-auto max-h-56 space-y-1">
                {toolbarFilteredItems.length === 0 ? (
                  <div className="py-4 text-center text-slate-500 italic text-xs">
                    No items matching "{tableItemSearch}"
                  </div>
                ) : (
                  toolbarFilteredItems.map((itemChoice, cIdx) => {
                    return (
                      <div
                        key={itemChoice.no}
                        onClick={() => {
                          setTableItemSearch(itemChoice.desc);
                          setShowToolbarSearchPreview(false);
                        }}
                        onMouseEnter={() => setHighlightedToolbarIndex(cIdx)}
                        className={`px-3 py-2 rounded-lg cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                          highlightedToolbarIndex === cIdx
                            ? 'bg-teal-50 dark:bg-teal-900/50 text-teal-950 dark:text-teal-100'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate">
                            {highlightMatch(itemChoice.desc, tableItemSearch)}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="font-bold font-mono text-teal-700 dark:text-teal-400 text-xs">
                            ₱{f2(itemChoice.srp)}
                          </div>
                          <div className="text-[9px] text-slate-400 font-mono">SRP</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Cell Notes highlight indicator info */}
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 shadow-xs"
            title="Right-click or hover any cell to add/edit notes. Cell notes automatically highlight in Light Gray (#ECECEC) in light mode and Light Yellow (#FFFFEB) in dark mode."
          >
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-xs bg-[#ECECEC] dark:bg-[#FFFFEB] border border-amber-400"></span>
              <StickyNote className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span className="font-semibold text-slate-800 dark:text-slate-200">Cell Notes</span>
            </span>
            <span className="text-slate-400 hidden xl:inline">·</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden xl:inline">Right-click any cell to add note</span>
          </div>

          {canEdit && (
            <button
              type="button"
              onClick={handleAddRow}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add row</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => exportDataEntry(state)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export (Download)</span>
          </button>

          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-slate-500" />
                <span>Import (Upload)</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </>
          )}

          {canAdmin && (
            <button
              type="button"
              onClick={handleDeleteAllEntries}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-900 rounded-lg transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete all entries</span>
            </button>
          )}
        </div>
      </div>

      {/* Active Search Filter Banner */}
      {tableItemSearch.trim() && (
        <div className="p-2.5 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 rounded-lg text-xs text-teal-900 dark:text-teal-200 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
            <span>
              Showing {currentRowsWithIndex.length} row(s) matching <strong className="font-mono">"{tableItemSearch}"</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setTableItemSearch('');
              setShowToolbarSearchPreview(false);
            }}
            className="text-xs text-teal-700 hover:text-teal-900 dark:text-teal-400 dark:hover:text-teal-200 underline font-medium cursor-pointer"
          >
            Clear Filter
          </button>
        </div>
      )}

      {msg && (
        <div className="p-2.5 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 rounded-lg text-xs text-teal-800 dark:text-teal-300 flex items-center justify-between">
          <span>{msg}</span>
          <button onClick={() => setMsg('')} className="text-teal-600 hover:text-teal-800 font-bold">
            ×
          </button>
        </div>
      )}

      {/* Quick Encoding Table (Placed directly above the main inventory table for easy encoding) */}
      <div className="relative rounded-xl border border-slate-300 dark:border-teal-500/30 bg-white dark:bg-slate-900 shadow-xs overflow-hidden transition-colors duration-200">
        {/* Header Title Bar */}
        <div className="flex flex-wrap items-center justify-between px-3 py-2 bg-slate-100/90 dark:bg-slate-950/80 border-b border-slate-300 dark:border-slate-800 gap-2 transition-colors duration-200">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-teal-600 text-white font-bold text-[11px] shadow-xs">
              <Sparkles className="w-3 h-3" />
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-100 tracking-wide uppercase">
                Quick Encoding Table
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-100 dark:bg-teal-950/80 text-teal-800 dark:text-teal-300 border border-teal-300 dark:border-teal-700">
                Easy Encoding Bar
              </span>
              {encoderSelected && (
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                  encoderExisting
                    ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                    : 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                }`}>
                  {encoderExisting ? '● Will update existing item in table below' : '+ Will add new item to table below'}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:inline">
              Enter details below · press <kbd className="px-1 py-0.5 text-[9.5px] font-mono bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-700 dark:text-slate-200">Enter</kbd> to add to inventory table
            </span>
            {encoderForm.itemNo !== '' && (
              <button
                type="button"
                onClick={handleResetEncoder}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-200/70 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 rounded border border-slate-300 dark:border-slate-700 cursor-pointer transition-colors"
                title="Clear current encoding inputs"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setEncoderOpen(!encoderOpen)}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-200/70 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded shadow-xs cursor-pointer transition-colors"
            >
              {encoderOpen ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  <span>Collapse</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  <span>Expand Encoder</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* The Encoding Table with Exact Same Header as Main Table */}
        {encoderOpen && (
          <div className="w-full overflow-x-hidden">
            <table className="w-full table-fixed border-collapse text-[10px] sm:text-[11px] 2xl:text-xs leading-tight font-sans transition-colors duration-200">
              <colgroup>
                {['5.6%', '3.5%', '13.5%', '4.5%', '4.4%', '5.0%', '4.4%', '4.3%', '6.0%', '4.4%', '4.3%', '6.0%', '4.4%', '3.9%', '5.0%', '4.5%', '4.8%', '4.5%', '6.5%', '5.0%'].map((w, idx) => (
                  <col key={idx} style={{ width: w }} />
                ))}
              </colgroup>
              <thead className="bg-slate-200/90 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold shadow-xs transition-colors duration-200">
                <tr className="border-b border-slate-300 dark:border-slate-700">
                  <th className="py-2 px-0.5 text-center border-r border-slate-300 dark:border-slate-700">Date</th>
                  <th className="py-2 px-0.5 text-center border-r border-slate-300 dark:border-slate-700">Wk</th>
                  <th className="py-2 px-1 text-left border-r border-slate-300 dark:border-slate-700">Item Description</th>
                  <th className="py-2 px-0.5 text-center border-r border-slate-300 dark:border-slate-700">Beg Inv</th>
                  <th className="py-2 px-0.5 text-center border-r border-slate-300 dark:border-slate-700">Deliv</th>
                  <th className="py-2 px-0.5 text-center border-r border-slate-300 dark:border-slate-700">Doc #</th>
                  <th className="py-2 px-0.5 text-center border-r border-slate-300 dark:border-slate-700">Stock W/D</th>
                  <th className="py-2 px-0.5 text-center border-r border-slate-300 dark:border-slate-700">TF From</th>
                  <th className="py-2 px-0.5 text-center border-r border-slate-300 dark:border-slate-700">From Loc</th>
                  <th className="py-2 px-0.5 text-center border-r border-slate-300 dark:border-slate-700">Int TF (In)</th>
                  <th className="py-2 px-0.5 text-center border-r border-slate-300 dark:border-slate-700">Transfer To</th>
                  <th className="py-2 px-0.5 text-center border-r border-slate-300 dark:border-slate-700">To Loc</th>
                  <th className="py-2 px-0.5 text-center border-r border-slate-300 dark:border-slate-700">Int TT (Out)</th>
                  <th className="py-2 px-0.5 text-center border-r border-slate-300 dark:border-slate-700">Bad Order</th>
                  <th className="py-2 px-0.5 text-center bg-teal-100/90 dark:bg-teal-950/80 text-teal-900 dark:text-teal-200 border-r border-slate-300 dark:border-slate-700 font-semibold">Goods Avail</th>
                  <th className="py-2 px-0.5 text-center border-r border-slate-300 dark:border-slate-700">Ending Inv</th>
                  <th className="py-2 px-0.5 text-center bg-teal-100/90 dark:bg-teal-950/80 text-teal-900 dark:text-teal-200 border-r border-slate-300 dark:border-slate-700 font-semibold">Goods Sold</th>
                  <th className="py-2 px-0.5 text-right border-r border-slate-300 dark:border-slate-700">SRP</th>
                  <th className="py-2 px-1 text-right bg-teal-100/90 dark:bg-teal-950/80 text-teal-900 dark:text-teal-200 font-semibold border-r border-slate-300 dark:border-slate-700">Total Sales</th>
                  <th className="py-2 px-0.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-colors duration-200">
                <tr className="border-b border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-850 transition-colors duration-200">
                  {/* Date */}
                  <td className="py-1.5 px-0.5 text-center font-mono text-[9.5px] 2xl:text-[10.5px] text-slate-700 dark:text-slate-300 border-r border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/40 transition-colors duration-200">
                    <div className="font-semibold text-slate-800 dark:text-slate-200">{fd(currentDate)}</div>
                    <div className="text-[8.5px] text-teal-600 dark:text-teal-400 font-bold">{currentShift}</div>
                  </td>

                  {/* Wk */}
                  <td className="py-1.5 px-0.5 text-center font-mono text-[9px] 2xl:text-[10px] text-slate-600 dark:text-slate-400 border-r border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/40 transition-colors duration-200">
                    {getWeekOf(currentDate, state.start, state.cut)}
                  </td>

                  {/* Item Description Search / Selector */}
                  <td className="p-0.5 border-r border-slate-300 dark:border-slate-700 relative">
                    <div className="relative">
                      <input
                        ref={encoderItemInputRef}
                        type="text"
                        disabled={!canEdit}
                        placeholder="Type letter to preview items..."
                        value={encoderForm.itemSearch}
                        onFocus={e => {
                          if (encoderForm.itemNo === '' && encoderForm.itemSearch.trim().length > 0) {
                            setShowEncoderItemDropdown(true);
                            updateEncoderDropdownCoords(e.currentTarget);
                          } else {
                            setShowEncoderItemDropdown(false);
                          }
                          e.currentTarget.select();
                        }}
                        onChange={e => {
                          const val = e.target.value;
                          const hasLetters = val.trim().length > 0;
                          setEncoderForm(prev => ({ ...prev, itemSearch: val, itemNo: '' }));
                          setShowEncoderItemDropdown(hasLetters);
                          setHighlightedEncoderItemIdx(0);
                          if (hasLetters && encoderItemInputRef.current) {
                            updateEncoderDropdownCoords(encoderItemInputRef.current);
                          }
                        }}
                        onKeyDown={e => {
                          if (e.key === 'ArrowDown') {
                            if (matchingEncoderItems.length > 0) {
                              e.preventDefault();
                              setShowEncoderItemDropdown(true);
                              setHighlightedEncoderItemIdx(prev => Math.min(prev + 1, matchingEncoderItems.length - 1));
                              if (encoderItemInputRef.current) updateEncoderDropdownCoords(encoderItemInputRef.current);
                            }
                          } else if (e.key === 'ArrowUp') {
                            if (matchingEncoderItems.length > 0) {
                              e.preventDefault();
                              setShowEncoderItemDropdown(true);
                              setHighlightedEncoderItemIdx(prev => Math.max(prev - 1, 0));
                              if (encoderItemInputRef.current) updateEncoderDropdownCoords(encoderItemInputRef.current);
                            }
                          } else if (e.key === 'Enter') {
                            if (showEncoderItemDropdown && matchingEncoderItems[highlightedEncoderItemIdx]) {
                              e.preventDefault();
                              handleSelectEncoderItem(matchingEncoderItems[highlightedEncoderItemIdx].no);
                            } else {
                              handleEncoderKeyDown(e);
                            }
                          } else if (e.key === 'Escape') {
                            setShowEncoderItemDropdown(false);
                            setEncoderDropdownCoords(null);
                          }
                        }}
                        className="w-full px-1.5 py-1 text-xs font-medium rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 border border-slate-300 dark:border-slate-700 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none transition-colors duration-200"
                      />
                      {encoderForm.itemSearch !== '' && (
                        <button
                          type="button"
                          onClick={() => {
                            setEncoderForm(prev => ({ ...prev, itemNo: '', itemSearch: '', beg: '' }));
                            setShowEncoderItemDropdown(false);
                            setEncoderDropdownCoords(null);
                            if (encoderItemInputRef.current) {
                              encoderItemInputRef.current.focus();
                            }
                          }}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white text-xs cursor-pointer font-bold"
                          title="Clear search / item"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </td>

                  {/* Beg Inv */}
                  <td className="p-0.5 border-r border-slate-300 dark:border-slate-700">
                    <CalculatorCellInput
                      placeholder="0"
                      disabled={!canEdit}
                      value={encoderForm.beg}
                      onChange={val => setEncoderForm(prev => ({ ...prev, beg: val }))}
                      onKeyDown={handleEncoderKeyDown}
                      className="w-full text-center px-0.5 py-1 text-[10.5px] font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded border border-slate-300 dark:border-slate-700 focus:border-teal-500 focus:outline-none transition-colors duration-200"
                    />
                  </td>

                  {/* Deliv */}
                  <td className="p-0.5 border-r border-slate-300 dark:border-slate-700">
                    <CalculatorCellInput
                      placeholder="0"
                      disabled={!canEdit}
                      value={encoderForm.del}
                      onChange={val => setEncoderForm(prev => ({ ...prev, del: val }))}
                      onKeyDown={handleEncoderKeyDown}
                      className="w-full text-center px-0.5 py-1 text-[10.5px] font-mono font-bold text-teal-700 dark:text-teal-300 bg-white dark:bg-slate-800 placeholder-slate-400 dark:placeholder-slate-500 rounded border border-slate-300 dark:border-slate-700 focus:border-teal-500 focus:outline-none transition-colors duration-200"
                    />
                  </td>

                  {/* Doc # */}
                  <td className="p-0.5 border-r border-slate-300 dark:border-slate-700">
                    <input
                      type="text"
                      placeholder="DR#"
                      disabled={!canEdit}
                      value={encoderForm.doc}
                      onChange={e => setEncoderForm(prev => ({ ...prev, doc: e.target.value }))}
                      onKeyDown={handleEncoderKeyDown}
                      className="w-full text-center px-0.5 py-1 text-[9.5px] bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded border border-slate-300 dark:border-slate-700 focus:border-teal-500 focus:outline-none transition-colors duration-200"
                    />
                  </td>

                  {/* Stock W/D */}
                  <td className="p-0.5 border-r border-slate-300 dark:border-slate-700">
                    <CalculatorCellInput
                      placeholder="0"
                      disabled={!canEdit}
                      value={encoderForm.wd}
                      onChange={val => setEncoderForm(prev => ({ ...prev, wd: val }))}
                      onKeyDown={handleEncoderKeyDown}
                      className="w-full text-center px-0.5 py-1 text-[10.5px] font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded border border-slate-300 dark:border-slate-700 focus:border-teal-500 focus:outline-none transition-colors duration-200"
                    />
                  </td>

                  {/* TF From */}
                  <td className="p-0.5 border-r border-slate-300 dark:border-slate-700">
                    <CalculatorCellInput
                      placeholder="0"
                      disabled={!canEdit}
                      value={encoderForm.tf}
                      onChange={val => setEncoderForm(prev => ({ ...prev, tf: val }))}
                      onKeyDown={handleEncoderKeyDown}
                      className="w-full text-center px-0.5 py-1 text-[10.5px] font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded border border-slate-300 dark:border-slate-700 focus:border-teal-500 focus:outline-none transition-colors duration-200"
                    />
                  </td>

                  {/* From Loc */}
                  <td className="p-0.5 border-r border-slate-300 dark:border-slate-700">
                    {(() => {
                      const parsed = parseTransferLocations(encoderForm.tfl, encoderForm.tf_locs, encoderForm.tf);
                      if (parsed.length > 1) {
                        return (
                          <button
                            type="button"
                            onClick={() => openEncoderMultiLocModal('tf')}
                            className="w-full flex items-center justify-center gap-1 py-1 px-1 rounded text-[9px] font-semibold bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-300 border border-teal-300 dark:border-teal-700 truncate cursor-pointer hover:bg-teal-200 dark:hover:bg-teal-800/80 transition-colors"
                            title={`Multi-Location: ${parsed.map(p => `${p.loc}: ${p.qty}`).join(', ')}`}
                          >
                            <Layers className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate">{parsed.length} Locs</span>
                          </button>
                        );
                      }
                      return (
                        <div className="flex items-center gap-0.5">
                          <select
                            disabled={!canEdit}
                            value={encoderForm.tfl}
                            onChange={e => setEncoderForm(prev => ({ ...prev, tfl: e.target.value }))}
                            className="w-full min-w-0 px-0.5 py-1 text-[9px] 2xl:text-[9.5px] bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded border border-slate-300 dark:border-slate-700 focus:border-teal-500 focus:outline-none truncate transition-colors duration-200"
                          >
                            <option value="">(Select)</option>
                            {state.locs.map(l => (
                              <option key={l} value={l} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                                {l}
                              </option>
                            ))}
                          </select>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => openEncoderMultiLocModal('tf')}
                              className="p-0.5 text-slate-500 hover:text-teal-600 dark:text-slate-400 dark:hover:text-teal-400 rounded cursor-pointer shrink-0 transition-colors"
                              title="Record multiple source branches"
                            >
                              <Layers className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </td>

                  {/* Int TF (In) */}
                  <td className="p-0.5 border-r border-slate-300 dark:border-slate-700">
                    <CalculatorCellInput
                      placeholder="0"
                      disabled={!canEdit}
                      value={encoderForm.itf}
                      onChange={val => setEncoderForm(prev => ({ ...prev, itf: val }))}
                      onKeyDown={handleEncoderKeyDown}
                      className="w-full text-center px-0.5 py-1 text-[10.5px] font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded border border-slate-300 dark:border-slate-700 focus:border-teal-500 focus:outline-none transition-colors duration-200"
                    />
                  </td>

                  {/* Transfer To */}
                  <td className="p-0.5 border-r border-slate-300 dark:border-slate-700">
                    <CalculatorCellInput
                      placeholder="0"
                      disabled={!canEdit}
                      value={encoderForm.tt}
                      onChange={val => setEncoderForm(prev => ({ ...prev, tt: val }))}
                      onKeyDown={handleEncoderKeyDown}
                      className="w-full text-center px-0.5 py-1 text-[10.5px] font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded border border-slate-300 dark:border-slate-700 focus:border-teal-500 focus:outline-none transition-colors duration-200"
                    />
                  </td>

                  {/* To Loc */}
                  <td className="p-0.5 border-r border-slate-300 dark:border-slate-700">
                    {(() => {
                      const parsed = parseTransferLocations(encoderForm.ttl, encoderForm.tt_locs, encoderForm.tt);
                      if (parsed.length > 1) {
                        return (
                          <button
                            type="button"
                            onClick={() => openEncoderMultiLocModal('tt')}
                            className="w-full flex items-center justify-center gap-1 py-1 px-1 rounded text-[9px] font-semibold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800 truncate cursor-pointer hover:bg-rose-200 dark:hover:bg-rose-900/80 transition-colors"
                            title={`Multi-Location: ${parsed.map(p => `${p.loc}: ${p.qty}`).join(', ')}`}
                          >
                            <Layers className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate">{parsed.length} Locs</span>
                          </button>
                        );
                      }
                      return (
                        <div className="flex items-center gap-0.5">
                          <select
                            disabled={!canEdit}
                            value={encoderForm.ttl}
                            onChange={e => setEncoderForm(prev => ({ ...prev, ttl: e.target.value }))}
                            className="w-full min-w-0 px-0.5 py-1 text-[9px] 2xl:text-[9.5px] bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded border border-slate-300 dark:border-slate-700 focus:border-teal-500 focus:outline-none truncate transition-colors duration-200"
                          >
                            <option value="">(Select)</option>
                            {state.locs.map(l => (
                              <option key={l} value={l} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                                {l}
                              </option>
                            ))}
                          </select>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => openEncoderMultiLocModal('tt')}
                              className="p-0.5 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 rounded cursor-pointer shrink-0 transition-colors"
                              title="Record multiple destination branches"
                            >
                              <Layers className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </td>

                  {/* Int TT (Out) */}
                  <td className="p-0.5 border-r border-slate-300 dark:border-slate-700">
                    <CalculatorCellInput
                      placeholder="0"
                      disabled={!canEdit}
                      value={encoderForm.itt}
                      onChange={val => setEncoderForm(prev => ({ ...prev, itt: val }))}
                      onKeyDown={handleEncoderKeyDown}
                      className="w-full text-center px-0.5 py-1 text-[10.5px] font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded border border-slate-300 dark:border-slate-700 focus:border-teal-500 focus:outline-none transition-colors duration-200"
                    />
                  </td>

                  {/* Bad Order */}
                  <td className="p-0.5 border-r border-slate-300 dark:border-slate-700">
                    <CalculatorCellInput
                      placeholder="0"
                      disabled={!canEdit}
                      value={encoderForm.bad}
                      onChange={val => setEncoderForm(prev => ({ ...prev, bad: val }))}
                      onKeyDown={handleEncoderKeyDown}
                      className="w-full text-center px-0.5 py-1 text-[10.5px] font-mono text-rose-600 dark:text-rose-300 bg-white dark:bg-slate-800 placeholder-slate-400 dark:placeholder-slate-500 rounded border border-slate-300 dark:border-slate-700 focus:border-rose-500 focus:outline-none transition-colors duration-200"
                    />
                  </td>

                  {/* Goods Avail */}
                  <td className="py-2 px-0.5 text-center font-mono font-bold text-[10.5px] bg-teal-100/90 dark:bg-teal-950/80 text-teal-900 dark:text-teal-200 border-r border-slate-300 dark:border-slate-700 transition-colors duration-200">
                    {encoderCalculated.tg > 0 ? f2(encoderCalculated.tg) : '-'}
                  </td>

                  {/* Ending Inv */}
                  <td className="p-0.5 border-r border-slate-300 dark:border-slate-700">
                    <CalculatorCellInput
                      placeholder="0"
                      disabled={!canEdit}
                      value={encoderForm.end}
                      onChange={val => setEncoderForm(prev => ({ ...prev, end: val }))}
                      onKeyDown={handleEncoderKeyDown}
                      className="w-full text-center px-0.5 py-1 text-[10.5px] font-mono font-bold bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded border border-slate-300 dark:border-slate-700 focus:border-teal-500 focus:outline-none transition-colors duration-200"
                    />
                  </td>

                  {/* Goods Sold */}
                  <td className="py-2 px-0.5 text-center font-mono font-bold text-[10.5px] bg-teal-100/90 dark:bg-teal-950/80 text-teal-900 dark:text-teal-200 border-r border-slate-300 dark:border-slate-700 transition-colors duration-200">
                    {encoderCalculated.sold > 0 ? f2(encoderCalculated.sold) : '-'}
                  </td>

                  {/* SRP */}
                  <td className="py-2 px-0.5 text-right font-mono text-[10px] text-slate-700 dark:text-slate-300 border-r border-slate-300 dark:border-slate-700 transition-colors duration-200">
                    {encoderCalculated.srp > 0 ? `₱${f2(encoderCalculated.srp)}` : '-'}
                  </td>

                  {/* Total Sales */}
                  <td className="py-2 px-1 text-right font-mono font-bold text-[10.5px] bg-teal-100/90 dark:bg-teal-950/80 text-teal-900 dark:text-teal-200 border-r border-slate-300 dark:border-slate-700 transition-colors duration-200">
                    {encoderCalculated.sales > 0 ? `₱${acct(encoderCalculated.sales)}` : '-'}
                  </td>

                  {/* Action */}
                  <td className="p-1 text-center">
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => handleCommitEncoderRow()}
                      className={`w-full py-1.5 px-1 rounded text-xs font-bold text-white shadow-xs cursor-pointer flex items-center justify-center gap-1 transition-all ${
                        encoderExisting
                          ? 'bg-amber-600 hover:bg-amber-500'
                          : 'bg-teal-600 hover:bg-teal-500'
                      }`}
                      title={encoderExisting ? 'Update existing item below (Enter)' : 'Add new item to table below (Enter)'}
                    >
                      {encoderExisting ? (
                        <>
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">Update</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">Add</span>
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Live Items Preview Section Below the Encoding Table when typing letters */}
            {encoderForm.itemSearch.trim() && encoderForm.itemNo === '' && (
              <div className="p-3 bg-slate-100/70 dark:bg-slate-950/95 border-t border-slate-300 dark:border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs animate-in fade-in duration-150 text-slate-800 dark:text-slate-100 transition-colors duration-200">
                {matchingEncoderItems.length === 0 ? (
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 italic py-1 px-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>No items match "{encoderForm.itemSearch}". Try typing another letter or keyword.</span>
                  </div>
                ) : (
                  <>
                    {/* Top Match Preview Card */}
                    {(() => {
                      const topItem = matchingEncoderItems[0];
                      const topMatchPrevEnd = getPreviousEndingInventory(topItem.no, state.inv, currentDate, currentShift, state.rows);

                      return (
                        <div className="flex-1 flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-teal-500/30 rounded-lg p-2.5 shadow-xs transition-colors duration-200">
                          <div className="w-8 h-8 rounded-lg bg-teal-500/15 dark:bg-teal-500/20 text-teal-600 dark:text-teal-300 flex items-center justify-center shrink-0">
                            <Sparkles className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] uppercase font-bold tracking-wider text-teal-700 dark:text-teal-400">Top Match Preview</span>
                              <span className="text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1.5 py-0.2 rounded font-mono border border-slate-200 dark:border-slate-700">#{topItem.no}</span>
                              <span className="text-[9px] bg-teal-100 dark:bg-teal-950/80 text-teal-800 dark:text-teal-300 border border-teal-300 dark:border-teal-800 px-1.5 py-0.2 rounded font-medium">{topItem.cat}</span>
                              {topMatchPrevEnd !== null && (
                                <span className="text-[9px] bg-sky-100 dark:bg-sky-500/20 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-500/40 px-1.5 py-0.2 rounded font-bold font-mono">
                                  Beg Inv: {topMatchPrevEnd > 0 ? topMatchPrevEnd : '0 (Sold Out)'}
                                </span>
                              )}
                              {currentRowsWithIndex.some(x => x.r.no === topItem.no) && (
                                <span className="text-[9px] bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40 px-1.5 py-0.2 rounded font-semibold">● In table below</span>
                              )}
                            </div>
                            <div className="text-sm font-bold text-slate-900 dark:text-white truncate mt-0.5">
                              {highlightMatch(topItem.desc, encoderForm.itemSearch)}
                            </div>
                          </div>
                          <div className="text-right shrink-0 pr-1">
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">SRP</div>
                            <div className="text-sm font-mono font-bold text-teal-700 dark:text-teal-300">₱{f2(topItem.srp)}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSelectEncoderItem(topItem.no)}
                            className="px-3 py-1.5 rounded-md text-xs font-bold bg-teal-600 hover:bg-teal-500 text-white shadow-xs cursor-pointer flex items-center gap-1 shrink-0 transition-colors"
                          >
                            <span>Select</span>
                            <span className="text-[10px] opacity-80">↵</span>
                          </button>
                        </div>
                      );
                    })()}

                    {/* Quick Suggestions Strip (other matching items) */}
                    {matchingEncoderItems.length > 1 && (
                      <div className="flex-1 max-w-xl">
                        <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                          <span>Other Matching Items ({matchingEncoderItems.length - 1})</span>
                          <span className="text-[9px] text-slate-400 dark:text-slate-500">Click to encode</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto">
                          {matchingEncoderItems.slice(1, 7).map(it => {
                            const inTable = currentRowsWithIndex.some(x => x.r.no === it.no);
                            const itPrevEnd = getPreviousEndingInventory(it.no, state.inv, currentDate, currentShift, state.rows);

                            return (
                              <button
                                key={it.no}
                                type="button"
                                onClick={() => handleSelectEncoderItem(it.no)}
                                className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:border-teal-500 text-left cursor-pointer transition-colors duration-200 text-[11px] group"
                                title={`Select ${it.desc}${itPrevEnd !== null ? ` (Beg Inv: ${itPrevEnd})` : ''}`}
                              >
                                <span className="font-medium text-slate-800 group-hover:text-teal-700 dark:text-slate-200 dark:group-hover:text-teal-300 truncate max-w-[120px]">{it.desc}</span>
                                {itPrevEnd !== null && (
                                  <span className="text-[9px] font-mono text-sky-800 dark:text-sky-300 bg-sky-100 dark:bg-sky-950/70 px-1 py-0.2 rounded border border-sky-300 dark:border-sky-850 shrink-0">
                                    Beg: {itPrevEnd > 0 ? itPrevEnd : '0 (Sold Out)'}
                                  </span>
                                )}
                                <span className="font-mono text-[10px] text-teal-700 dark:text-teal-400 font-bold shrink-0">₱{f2(it.srp)}</span>
                                {inTable && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="In table below" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Ledger Table (Expanded Full Width, No Horizontal Scrollbar) */}
      <div className="relative rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
        <div className="w-full overflow-x-hidden overflow-y-auto max-h-[75vh]">
          <table className="w-full table-fixed border-collapse text-[10px] sm:text-[11px] 2xl:text-xs leading-tight ledger-table font-sans">
            <colgroup>
              {(canAdmin
                ? ['5.8%', '3.6%', '12.8%', '4.6%', '4.5%', '5.2%', '4.5%', '4.4%', '6.2%', '4.5%', '4.4%', '6.2%', '4.5%', '4.0%', '5.2%', '4.6%', '5.0%', '4.6%', '6.8%', '3.4%']
                : ['6.0%', '3.8%', '15.0%', '4.6%', '4.5%', '5.2%', '4.5%', '4.4%', '6.2%', '4.5%', '4.4%', '6.2%', '4.5%', '4.0%', '5.2%', '4.6%', '5.0%', '4.6%', '6.9%']
              ).map((w, idx) => (
                <col key={idx} style={{ width: w }} />
              ))}
            </colgroup>
            <thead className="bg-slate-200/90 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold sticky top-0 z-20 shadow-xs">
              <tr className="border-b border-slate-300 dark:border-slate-700">
                <th className="py-2 px-0.5 text-center border-r border-slate-300 dark:border-slate-700">
                  Date
                </th>
                <th className="py-2 px-0.5 text-center border-r border-slate-300 dark:border-slate-700">
                  Wk
                </th>
                <th className="py-2 px-1 text-left border-r border-slate-300 dark:border-slate-700">
                  Item Description
                </th>
                <th className="py-2 px-0.5 text-center border-r border-slate-300 dark:border-slate-700">
                  Beg Inv
                </th>
                <th className="py-2 px-0.5 text-center border-r border-slate-300 dark:border-slate-700">
                  Deliv
                </th>
                <th className="py-2 px-0.5 text-center border-r border-slate-300 dark:border-slate-700">
                  Doc #
                </th>
                <th className="py-2 px-0.5 text-center border-r border-slate-300 dark:border-slate-700">
                  Stock W/D
                </th>
                <th className="py-2 px-0.5 text-center border-r border-slate-300 dark:border-slate-700">
                  TF From
                </th>
                <th className="py-2 px-0.5 text-center border-r border-slate-300 dark:border-slate-700">
                  From Loc
                </th>
                <th className="py-2 px-0.5 text-center border-r border-slate-300 dark:border-slate-700">
                  Int TF (In)
                </th>
                <th className="py-2 px-0.5 text-center border-r border-slate-300 dark:border-slate-700">
                  Transfer To
                </th>
                <th className="py-2 px-0.5 text-center border-r border-slate-300 dark:border-slate-700">
                  To Loc
                </th>
                <th className="py-2 px-0.5 text-center border-r border-slate-300 dark:border-slate-700">
                  Int TT (Out)
                </th>
                <th className="py-2 px-0.5 text-center border-r border-slate-300 dark:border-slate-700">
                  Bad Order
                </th>
                <th className="py-2 px-0.5 text-center bg-teal-50 dark:bg-teal-950/40 border-r border-slate-300 dark:border-slate-700 font-semibold">
                  Goods Avail
                </th>
                <th className="py-2 px-0.5 text-center border-r border-slate-300 dark:border-slate-700">
                  Ending Inv
                </th>
                <th className="py-2 px-0.5 text-center bg-teal-50 dark:bg-teal-950/40 border-r border-slate-300 dark:border-slate-700 font-semibold">
                  Goods Sold
                </th>
                <th className="py-2 px-0.5 text-right border-r border-slate-300 dark:border-slate-700">
                  SRP
                </th>
                <th className="py-2 px-1 text-right bg-teal-50 dark:bg-teal-950/40 font-semibold border-r border-slate-300 dark:border-slate-700">
                  Total Sales
                </th>
                {canAdmin && <th className="py-2 px-0.5 text-center"></th>}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {currentRowsWithIndex.length === 0 ? (
                <tr>
                  <td colSpan={canAdmin ? 20 : 19} className="py-12 text-center text-slate-500 italic">
                    {currentShift === 'PM' && isPmCarryoverExceptionLocation(state.inv) ? (
                      <div className="space-y-1">
                        <p className="font-semibold text-slate-700 dark:text-slate-300 not-italic">
                          No PM Shift entries on {fd(currentDate)}
                        </p>
                        <p className="text-xs text-amber-700 dark:text-amber-400 font-medium not-italic max-w-lg mx-auto">
                          Exception Branch ({state.inv}): Items with ending inventory carry over directly to tomorrow's AM shift rather than PM shift.
                        </p>
                      </div>
                    ) : (
                      `No ${currentShift} Shift entries on ${fd(currentDate)}. Click "Add row" to record stock movement or import an existing sheet.`
                    )}
                  </td>
                </tr>
              ) : (
                categories.map(cat => {
                  const catTotals = {
                    beg: 0,
                    del: 0,
                    wd: 0,
                    tf: 0,
                    itf: 0,
                    tt: 0,
                    itt: 0,
                    bad: 0,
                    tg: 0,
                    end: 0,
                    sold: 0,
                    sales: 0
                  };

                  cat.items.forEach(it => {
                    catTotals.beg += it.c.beg;
                    catTotals.del += num(it.r.del);
                    catTotals.wd += num(it.r.wd);
                    catTotals.tf += num(it.r.tf);
                    catTotals.itf += num(it.r.itf);
                    catTotals.tt += num(it.r.tt);
                    catTotals.itt += num(it.r.itt);
                    catTotals.bad += num(it.r.bad);
                    catTotals.tg += it.c.tg;
                    catTotals.end += num(it.r.end);
                    catTotals.sold += it.c.sold;
                    catTotals.sales += it.c.sales;
                  });

                  return (
                    <React.Fragment key={cat.name}>
                      {/* Category Header Row */}
                      <tr className="bg-slate-100 dark:bg-slate-800/80 font-bold text-teal-900 dark:text-teal-300">
                        <td
                          colSpan={canAdmin ? 20 : 19}
                          className="py-1 px-3 text-xs tracking-wide uppercase border-y border-slate-200 dark:border-slate-800"
                        >
                          {cat.name}
                        </td>
                      </tr>

                      {/* Rows in this category */}
                      {cat.items.map(({ r, i, c }) => {
                        const itObj = state.items.find(x => x.no === r.no);
                        const isSoldOut = c.tg > 0 && num(r.end) === 0;
                        const isJustEncoded = lastEncodedItemNo !== null && r.no === lastEncodedItemNo;
                        const itemDesc = itObj ? itObj.desc : (r.no !== '' ? `Item #${r.no}` : `Row #${i + 1}`);

                        // Cell Note keys and notes for every cell in this row
                        const descKey = getCellKey(r, 'desc', i);
                        const begKey = getCellKey(r, 'beg', i);
                        const delKey = getCellKey(r, 'del', i);
                        const docKey = getCellKey(r, 'doc', i);
                        const wdKey = getCellKey(r, 'wd', i);
                        const tfKey = getCellKey(r, 'tf', i);
                        const tflKey = getCellKey(r, 'tfl', i);
                        const itfKey = getCellKey(r, 'itf', i);
                        const ttKey = getCellKey(r, 'tt', i);
                        const ttlKey = getCellKey(r, 'ttl', i);
                        const ittKey = getCellKey(r, 'itt', i);
                        const badKey = getCellKey(r, 'bad', i);
                        const tgKey = getCellKey(r, 'tg', i);
                        const endKey = getCellKey(r, 'end', i);
                        const soldKey = getCellKey(r, 'sold', i);
                        const srpKey = getCellKey(r, 'srp', i);
                        const salesKey = getCellKey(r, 'sales', i);

                        const descNote = getCellNote(descKey);
                        const begNote = getCellNote(begKey);
                        const delNote = getCellNote(delKey);
                        const docNote = getCellNote(docKey);
                        const wdNote = getCellNote(wdKey);
                        const tfNote = getCellNote(tfKey);
                        const tflNote = getCellNote(tflKey);
                        const itfNote = getCellNote(itfKey);
                        const ttNote = getCellNote(ttKey);
                        const ttlNote = getCellNote(ttlKey);
                        const ittNote = getCellNote(ittKey);
                        const badNote = getCellNote(badKey);
                        const tgNote = getCellNote(tgKey);
                        const endNote = getCellNote(endKey);
                        const soldNote = getCellNote(soldKey);
                        const srpNote = getCellNote(srpKey);
                        const salesNote = getCellNote(salesKey);

                        return (
                          <tr
                            key={i}
                            className={`transition-colors ${
                              isJustEncoded
                                ? 'bg-teal-50 dark:bg-teal-950/40 ring-1 ring-inset ring-teal-500/50'
                                : 'hover:bg-teal-50/40 dark:hover:bg-teal-950/20'
                            }`}
                          >
                            {/* Date */}
                            <td className="py-1 px-0.5 text-center font-mono text-[9.5px] 2xl:text-[10.5px] text-slate-500 border-r border-slate-200 dark:border-slate-800 truncate">
                              {fd(r.date)}
                            </td>

                            {/* Week */}
                            <td className="py-1 px-0.5 text-center font-mono text-[9px] 2xl:text-[10px] text-slate-500 border-r border-slate-200 dark:border-slate-800 truncate">
                              {getWeekOf(r.date, state.start, state.cut)}
                            </td>

                            {/* Item Description (Interactive with Real-time Preview while typing letters or numbers) */}
                            <td
                              className={`p-0.5 border-r border-slate-200 dark:border-slate-800 relative group ${
                                descNote ? 'bg-[#ECECEC] dark:bg-[#FFFFEB] text-slate-900 dark:text-slate-900 font-semibold' : ''
                              }`}
                              onContextMenu={e => {
                                e.preventDefault();
                                handleOpenNoteModal(descKey, `${itemDesc} - Description`);
                              }}
                              title={descNote ? `Note: "${descNote.text}" (${descNote.author}) - Right-click to edit` : 'Right-click to add note'}
                            >
                              {renderCellNoteIndicator(descKey, `${itemDesc} - Description`, descNote)}
                              <div className="relative flex items-center gap-1">
                                <input
                                  type="text"
                                  disabled={!canEdit}
                                  value={
                                    activeItemSearchIndex === i
                                      ? searchTerm
                                      : itObj
                                      ? `${itObj.desc} (SRP ${f2(itObj.srp)})`
                                      : ''
                                  }
                                  placeholder="Search item description..."
                                  onFocus={e => {
                                    if (!canEdit) return;
                                    setActiveItemSearchIndex(i);
                                    setSearchTerm(itObj ? itObj.desc : '');
                                    setHighlightedItemIndex(0);
                                    activeInputRef.current = e.currentTarget;
                                    updateDropdownCoords(e.currentTarget);
                                    e.currentTarget.select();
                                  }}
                                  onChange={e => {
                                    setSearchTerm(e.target.value);
                                    setHighlightedItemIndex(0);
                                    if (activeInputRef.current) {
                                      updateDropdownCoords(activeInputRef.current);
                                    }
                                  }}
                                  onKeyDown={e => {
                                    if (activeItemSearchIndex !== i) return;
                                    if (e.key === 'ArrowDown') {
                                      e.preventDefault();
                                      setHighlightedItemIndex(prev =>
                                        Math.min(prev + 1, filteredItems.length - 1)
                                      );
                                    } else if (e.key === 'ArrowUp') {
                                      e.preventDefault();
                                      setHighlightedItemIndex(prev => Math.max(prev - 1, 0));
                                    } else if (e.key === 'Enter' || e.key === 'Tab') {
                                      if (filteredItems[highlightedItemIndex]) {
                                        e.preventDefault();
                                        selectItemForCurrentRow(
                                          filteredItems[highlightedItemIndex].no
                                        );
                                      }
                                    } else if (e.key === 'Escape') {
                                      setActiveItemSearchIndex(null);
                                      setDropdownCoords(null);
                                    }
                                  }}
                                  className={`w-full min-w-0 px-1 py-0.5 text-[10px] 2xl:text-[11px] font-medium bg-transparent border rounded focus:outline-none truncate transition-colors ${
                                    descNote
                                      ? 'text-slate-900 dark:text-slate-900 font-bold border-transparent'
                                      : activeItemSearchIndex === i
                                      ? 'bg-white dark:bg-slate-800 border-teal-600 ring-1 ring-teal-500 shadow-xs'
                                      : 'border-transparent hover:border-slate-300 dark:hover:border-slate-600'
                                  }`}
                                />

                                {isJustEncoded && (
                                  <span className="shrink-0 inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[8.5px] font-semibold bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-400/40">
                                    <CheckCircle2 className="w-2.5 h-2.5 text-teal-600 dark:text-teal-400" />
                                    <span>Encoded</span>
                                  </span>
                                )}

                                {/* Live preview badge directly under input when active and typing */}
                                {activeItemSearchIndex === i && filteredItems[0] && searchTerm.trim() && (
                                  <div className="hidden 2xl:flex items-center justify-between gap-1 text-[9px] text-teal-700 dark:text-teal-400 font-medium px-1.5 py-0.5 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 rounded mt-0.5 truncate">
                                    <span className="truncate">{filteredItems[0].desc}</span>
                                    <span className="font-mono font-bold shrink-0">SRP ₱{f2(filteredItems[0].srp)}</span>
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Beginning Inventory */}
                            <td
                              className={`p-0.5 text-center font-mono tabular-nums text-[10px] 2xl:text-[11px] border-r border-slate-200 dark:border-slate-800 relative group ${
                                begNote ? 'bg-[#ECECEC] dark:bg-[#FFFFEB] text-slate-900 dark:text-slate-900 font-semibold' : ''
                              }`}
                              onContextMenu={e => {
                                e.preventDefault();
                                handleOpenNoteModal(begKey, `${itemDesc} - Beg Inv`);
                              }}
                              title={begNote ? `Note: "${begNote.text}" (${begNote.author}) - Right-click to edit` : 'Right-click to add note'}
                            >
                              {renderCellNoteIndicator(begKey, `${itemDesc} - Beg Inv`, begNote)}
                              {c.auto ? (
                                <span className={`font-medium ${begNote ? 'text-slate-900 dark:text-slate-900 font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                                  {raw(c.beg)}
                                </span>
                              ) : (
                                <CalculatorCellInput
                                  disabled={!canEdit}
                                  value={raw(r.beg)}
                                  hasNote={!!begNote}
                                  onChange={val => handleNumberInput(i, 'beg', val)}
                                  className={`w-full min-w-0 text-center px-0.5 py-0.5 bg-transparent border border-transparent hover:border-slate-300 focus:bg-white dark:focus:bg-slate-800 focus:border-teal-600 rounded focus:outline-none ${
                                    begNote ? 'text-slate-900 dark:text-slate-900 font-bold' : ''
                                  }`}
                                />
                              )}
                            </td>

                            {/* Deliveries */}
                            <td
                              className={`p-0.5 text-center font-mono tabular-nums text-[10px] 2xl:text-[11px] border-r border-slate-200 dark:border-slate-800 relative group ${
                                delNote ? 'bg-[#ECECEC] dark:bg-[#FFFFEB] text-slate-900 dark:text-slate-900 font-semibold' : ''
                              }`}
                              onContextMenu={e => {
                                e.preventDefault();
                                handleOpenNoteModal(delKey, `${itemDesc} - Deliveries`);
                              }}
                              title={delNote ? `Note: "${delNote.text}" (${delNote.author}) - Right-click to edit` : 'Right-click to add note'}
                            >
                              {renderCellNoteIndicator(delKey, `${itemDesc} - Deliveries`, delNote)}
                              <CalculatorCellInput
                                disabled={!canEdit}
                                value={raw(r.del)}
                                hasNote={!!delNote}
                                onChange={val => handleNumberInput(i, 'del', val)}
                                className={`w-full min-w-0 text-center px-0.5 py-0.5 bg-transparent border border-transparent hover:border-slate-300 focus:bg-white dark:focus:bg-slate-800 focus:border-teal-600 rounded focus:outline-none ${
                                  delNote ? 'text-slate-900 dark:text-slate-900 font-bold' : 'text-teal-700 dark:text-teal-300 font-medium'
                                }`}
                              />
                            </td>

                            {/* Doc # */}
                            <td
                              className={`p-0.5 border-r border-slate-200 dark:border-slate-800 relative group ${
                                docNote ? 'bg-[#ECECEC] dark:bg-[#FFFFEB] text-slate-900 dark:text-slate-900 font-semibold' : ''
                              }`}
                              onContextMenu={e => {
                                e.preventDefault();
                                handleOpenNoteModal(docKey, `${itemDesc} - Doc #`);
                              }}
                              title={docNote ? `Note: "${docNote.text}" (${docNote.author}) - Right-click to edit` : 'Right-click to add note'}
                            >
                              {renderCellNoteIndicator(docKey, `${itemDesc} - Doc #`, docNote)}
                              <input
                                type="text"
                                disabled={!canEdit}
                                value={r.doc || ''}
                                onChange={e => handleCellChange(i, 'doc', e.target.value)}
                                className={`w-full min-w-0 px-0.5 py-0.5 text-[9.5px] 2xl:text-[10.5px] bg-transparent border border-transparent hover:border-slate-300 focus:bg-white dark:focus:bg-slate-800 focus:border-teal-600 rounded focus:outline-none truncate ${
                                  docNote ? 'text-slate-900 dark:text-slate-900 font-bold' : ''
                                }`}
                              />
                            </td>

                            {/* Stock Withdrawal */}
                            <td
                              className={`p-0.5 text-center font-mono tabular-nums text-[10px] 2xl:text-[11px] border-r border-slate-200 dark:border-slate-800 relative group ${
                                wdNote ? 'bg-[#ECECEC] dark:bg-[#FFFFEB] text-slate-900 dark:text-slate-900 font-semibold' : ''
                              }`}
                              onContextMenu={e => {
                                e.preventDefault();
                                handleOpenNoteModal(wdKey, `${itemDesc} - Stock W/D`);
                              }}
                              title={wdNote ? `Note: "${wdNote.text}" (${wdNote.author}) - Right-click to edit` : 'Right-click to add note'}
                            >
                              {renderCellNoteIndicator(wdKey, `${itemDesc} - Stock W/D`, wdNote)}
                              <CalculatorCellInput
                                disabled={!canEdit}
                                value={raw(r.wd)}
                                hasNote={!!wdNote}
                                onChange={val => handleNumberInput(i, 'wd', val)}
                                className={`w-full min-w-0 text-center px-0.5 py-0.5 bg-transparent border border-transparent hover:border-slate-300 focus:bg-white dark:focus:bg-slate-800 focus:border-teal-600 rounded focus:outline-none ${
                                  wdNote ? 'text-slate-900 dark:text-slate-900 font-bold' : ''
                                }`}
                              />
                            </td>

                            {/* Transfer From */}
                            <td
                              className={`p-0.5 text-center font-mono tabular-nums text-[10px] 2xl:text-[11px] border-r border-slate-200 dark:border-slate-800 relative group ${
                                tfNote ? 'bg-[#ECECEC] dark:bg-[#FFFFEB] text-slate-900 dark:text-slate-900 font-semibold' : ''
                              }`}
                              onContextMenu={e => {
                                e.preventDefault();
                                handleOpenNoteModal(tfKey, `${itemDesc} - Transfer From`);
                              }}
                              title={tfNote ? `Note: "${tfNote.text}" (${tfNote.author}) - Right-click to edit` : 'Right-click to add note'}
                            >
                              {renderCellNoteIndicator(tfKey, `${itemDesc} - Transfer From`, tfNote)}
                              <CalculatorCellInput
                                disabled={!canEdit}
                                value={raw(r.tf)}
                                hasNote={!!tfNote}
                                onChange={val => handleNumberInput(i, 'tf', val)}
                                className={`w-full min-w-0 text-center px-0.5 py-0.5 bg-transparent border border-transparent hover:border-slate-300 focus:bg-white dark:focus:bg-slate-800 focus:border-teal-600 rounded focus:outline-none ${
                                  tfNote ? 'text-slate-900 dark:text-slate-900 font-bold' : ''
                                }`}
                              />
                            </td>

                            {/* Transfer From Location */}
                            <td
                              className={`p-0.5 border-r border-slate-200 dark:border-slate-800 relative group ${
                                tflNote ? 'bg-[#ECECEC] dark:bg-[#FFFFEB] text-slate-900 dark:text-slate-900 font-semibold' : ''
                              }`}
                              onContextMenu={e => {
                                e.preventDefault();
                                handleOpenNoteModal(tflKey, `${itemDesc} - TF From Location`);
                              }}
                              title={tflNote ? `Note: "${tflNote.text}" (${tflNote.author}) - Right-click to edit` : 'Right-click to add note'}
                            >
                              {renderCellNoteIndicator(tflKey, `${itemDesc} - TF From Location`, tflNote)}
                              {(() => {
                                const parsed = parseTransferLocations(r.tfl, r.tf_locs, r.tf);
                                if (parsed.length > 1) {
                                  return (
                                    <div className="flex items-center justify-between gap-0.5 px-0.5">
                                      <button
                                        type="button"
                                        onClick={() => openMultiLocModal(i, 'tf')}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] 2xl:text-[10px] font-semibold bg-teal-100 dark:bg-teal-950/70 text-teal-800 dark:text-teal-300 hover:bg-teal-200 dark:hover:bg-teal-900 border border-teal-300 dark:border-teal-700 cursor-pointer truncate max-w-full"
                                        title={`Multiple Source Branches:\n${parsed.map(p => `• ${p.loc}: ${p.qty} units`).join('\n')}\nClick to view / edit`}
                                      >
                                        <Layers className="w-3 h-3 text-teal-700 dark:text-teal-400 shrink-0" />
                                        <span className="truncate">{parsed.length} Locs</span>
                                      </button>
                                      {canEdit && (
                                        <button
                                          type="button"
                                          onClick={() => openMultiLocModal(i, 'tf')}
                                          className="p-0.5 text-teal-700 hover:text-teal-900 dark:text-teal-300 rounded cursor-pointer shrink-0"
                                          title="Edit source locations"
                                        >
                                          <Plus className="w-2.5 h-2.5" />
                                        </button>
                                      )}
                                    </div>
                                  );
                                }
                                return (
                                  <div className="flex items-center gap-0.5">
                                    <select
                                      disabled={!canEdit}
                                      value={r.tfl || ''}
                                      onChange={e => {
                                        const newLoc = e.target.value;
                                        const qty = typeof r.tf === 'number' ? r.tf : parseFloat(String(r.tf)) || 0;
                                        onUpdateState(prev => {
                                          const newRows = [...prev.rows];
                                          newRows[i] = {
                                            ...newRows[i],
                                            tfl: newLoc,
                                            tf_locs: newLoc && qty > 0 ? { [newLoc]: qty } : undefined,
                                            _t: Date.now(),
                                            _u: currentUser?.name || currentUser?.user || 'Staff'
                                          };
                                          return { ...prev, rows: newRows };
                                        });
                                      }}
                                      className={`w-full min-w-0 px-0.5 py-0.5 text-[9px] 2xl:text-[10px] bg-transparent border border-transparent hover:border-slate-300 focus:bg-white dark:focus:bg-slate-800 focus:border-teal-600 rounded focus:outline-none truncate ${
                                        tflNote ? 'text-slate-900 dark:text-slate-900 font-bold' : ''
                                      }`}
                                    >
                                      <option value=""></option>
                                      {state.locs.map(l => (
                                        <option key={l} value={l} className="dark:bg-slate-900">
                                          {l}
                                        </option>
                                      ))}
                                    </select>
                                    {canEdit && (
                                      <button
                                        type="button"
                                        onClick={() => openMultiLocModal(i, 'tf')}
                                        className="p-0.5 text-slate-400 hover:text-teal-700 dark:hover:text-teal-300 rounded cursor-pointer shrink-0"
                                        title="Split / record multiple source branches for this item"
                                      >
                                        <Layers className="w-2.5 h-2.5" />
                                      </button>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>

                            {/* Internal Transfer From (Price Changes) */}
                            <td
                              className={`p-0.5 text-center font-mono tabular-nums text-[10px] 2xl:text-[11px] border-r border-slate-200 dark:border-slate-800 relative group ${
                                itfNote ? 'bg-[#ECECEC] dark:bg-[#FFFFEB] text-slate-900 dark:text-slate-900 font-semibold' : ''
                              }`}
                              onContextMenu={e => {
                                e.preventDefault();
                                handleOpenNoteModal(itfKey, `${itemDesc} - Int TF`);
                              }}
                              title={itfNote ? `Note: "${itfNote.text}" (${itfNote.author}) - Right-click to edit` : 'Right-click to add note'}
                            >
                              {renderCellNoteIndicator(itfKey, `${itemDesc} - Int TF`, itfNote)}
                              <CalculatorCellInput
                                disabled={!canEdit}
                                value={raw(r.itf)}
                                hasNote={!!itfNote}
                                onChange={val => handleNumberInput(i, 'itf', val)}
                                className={`w-full min-w-0 text-center px-0.5 py-0.5 bg-transparent border border-transparent hover:border-slate-300 focus:bg-white dark:focus:bg-slate-800 focus:border-teal-600 rounded focus:outline-none ${
                                  itfNote ? 'text-slate-900 dark:text-slate-900 font-bold' : ''
                                }`}
                              />
                            </td>

                            {/* Transfer To */}
                            <td
                              className={`p-0.5 text-center font-mono tabular-nums text-[10px] 2xl:text-[11px] border-r border-slate-200 dark:border-slate-800 relative group ${
                                ttNote ? 'bg-[#ECECEC] dark:bg-[#FFFFEB] text-slate-900 dark:text-slate-900 font-semibold' : ''
                              }`}
                              onContextMenu={e => {
                                e.preventDefault();
                                handleOpenNoteModal(ttKey, `${itemDesc} - Transfer To`);
                              }}
                              title={ttNote ? `Note: "${ttNote.text}" (${ttNote.author}) - Right-click to edit` : 'Right-click to add note'}
                            >
                              {renderCellNoteIndicator(ttKey, `${itemDesc} - Transfer To`, ttNote)}
                              <CalculatorCellInput
                                disabled={!canEdit}
                                value={raw(r.tt)}
                                hasNote={!!ttNote}
                                onChange={val => handleNumberInput(i, 'tt', val)}
                                className={`w-full min-w-0 text-center px-0.5 py-0.5 bg-transparent border border-transparent hover:border-slate-300 focus:bg-white dark:focus:bg-slate-800 focus:border-teal-600 rounded focus:outline-none ${
                                  ttNote ? 'text-slate-900 dark:text-slate-900 font-bold' : ''
                                }`}
                              />
                            </td>

                            {/* Transfer To Location */}
                            <td
                              className={`p-0.5 border-r border-slate-200 dark:border-slate-800 relative group ${
                                ttlNote ? 'bg-[#ECECEC] dark:bg-[#FFFFEB] text-slate-900 dark:text-slate-900 font-semibold' : ''
                              }`}
                              onContextMenu={e => {
                                e.preventDefault();
                                handleOpenNoteModal(ttlKey, `${itemDesc} - Transfer To Location`);
                              }}
                              title={ttlNote ? `Note: "${ttlNote.text}" (${ttlNote.author}) - Right-click to edit` : 'Right-click to add note'}
                            >
                              {renderCellNoteIndicator(ttlKey, `${itemDesc} - Transfer To Location`, ttlNote)}
                              {(() => {
                                const parsed = parseTransferLocations(r.ttl, r.tt_locs, r.tt);
                                if (parsed.length > 1) {
                                  return (
                                    <div className="flex items-center justify-between gap-0.5 px-0.5">
                                      <button
                                        type="button"
                                        onClick={() => openMultiLocModal(i, 'tt')}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] 2xl:text-[10px] font-semibold bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 hover:bg-rose-200 dark:hover:bg-rose-900 border border-rose-300 dark:border-rose-700 cursor-pointer truncate max-w-full"
                                        title={`Multiple Destination Branches:\n${parsed.map(p => `• ${p.loc}: ${p.qty} units`).join('\n')}\nClick to view / edit`}
                                      >
                                        <Layers className="w-3 h-3 text-rose-700 dark:text-rose-400 shrink-0" />
                                        <span className="truncate">{parsed.length} Locs</span>
                                      </button>
                                      {canEdit && (
                                        <button
                                          type="button"
                                          onClick={() => openMultiLocModal(i, 'tt')}
                                          className="p-0.5 text-rose-700 hover:text-rose-900 dark:text-rose-300 rounded cursor-pointer shrink-0"
                                          title="Edit destination locations"
                                        >
                                          <Plus className="w-2.5 h-2.5" />
                                        </button>
                                      )}
                                    </div>
                                  );
                                }
                                return (
                                  <div className="flex items-center gap-0.5">
                                    <select
                                      disabled={!canEdit}
                                      value={r.ttl || ''}
                                      onChange={e => {
                                        const newLoc = e.target.value;
                                        const qty = typeof r.tt === 'number' ? r.tt : parseFloat(String(r.tt)) || 0;
                                        onUpdateState(prev => {
                                          const newRows = [...prev.rows];
                                          newRows[i] = {
                                            ...newRows[i],
                                            ttl: newLoc,
                                            tt_locs: newLoc && qty > 0 ? { [newLoc]: qty } : undefined,
                                            _t: Date.now(),
                                            _u: currentUser?.name || currentUser?.user || 'Staff'
                                          };
                                          return { ...prev, rows: newRows };
                                        });
                                      }}
                                      className={`w-full min-w-0 px-0.5 py-0.5 text-[9px] 2xl:text-[10px] bg-transparent border border-transparent hover:border-slate-300 focus:bg-white dark:focus:bg-slate-800 focus:border-teal-600 rounded focus:outline-none truncate ${
                                        ttlNote ? 'text-slate-900 dark:text-slate-900 font-bold' : ''
                                      }`}
                                    >
                                      <option value=""></option>
                                      {state.locs.map(l => (
                                        <option key={l} value={l} className="dark:bg-slate-900">
                                          {l}
                                        </option>
                                      ))}
                                    </select>
                                    {canEdit && (
                                      <button
                                        type="button"
                                        onClick={() => openMultiLocModal(i, 'tt')}
                                        className="p-0.5 text-slate-400 hover:text-rose-700 dark:hover:text-rose-300 rounded cursor-pointer shrink-0"
                                        title="Split / record multiple destination branches for this item"
                                      >
                                        <Layers className="w-2.5 h-2.5" />
                                      </button>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>

                            {/* Internal Transfer To (Price Changes) */}
                            <td
                              className={`p-0.5 text-center font-mono tabular-nums text-[10px] 2xl:text-[11px] border-r border-slate-200 dark:border-slate-800 relative group ${
                                ittNote ? 'bg-[#ECECEC] dark:bg-[#FFFFEB] text-slate-900 dark:text-slate-900 font-semibold' : ''
                              }`}
                              onContextMenu={e => {
                                e.preventDefault();
                                handleOpenNoteModal(ittKey, `${itemDesc} - Int TT`);
                              }}
                              title={ittNote ? `Note: "${ittNote.text}" (${ittNote.author}) - Right-click to edit` : 'Right-click to add note'}
                            >
                              {renderCellNoteIndicator(ittKey, `${itemDesc} - Int TT`, ittNote)}
                              <CalculatorCellInput
                                disabled={!canEdit}
                                value={raw(r.itt)}
                                hasNote={!!ittNote}
                                onChange={val => handleNumberInput(i, 'itt', val)}
                                className={`w-full min-w-0 text-center px-0.5 py-0.5 bg-transparent border border-transparent hover:border-slate-300 focus:bg-white dark:focus:bg-slate-800 focus:border-teal-600 rounded focus:outline-none ${
                                  ittNote ? 'text-slate-900 dark:text-slate-900 font-bold' : ''
                                }`}
                              />
                            </td>

                            {/* Bad Order */}
                            <td
                              className={`p-0.5 text-center font-mono tabular-nums text-[10px] 2xl:text-[11px] border-r border-slate-200 dark:border-slate-800 relative group ${
                                badNote ? 'bg-[#ECECEC] dark:bg-[#FFFFEB] text-slate-900 dark:text-slate-900 font-semibold' : ''
                              }`}
                              onContextMenu={e => {
                                e.preventDefault();
                                handleOpenNoteModal(badKey, `${itemDesc} - Bad Order`);
                              }}
                              title={badNote ? `Note: "${badNote.text}" (${badNote.author}) - Right-click to edit` : 'Right-click to add note'}
                            >
                              {renderCellNoteIndicator(badKey, `${itemDesc} - Bad Order`, badNote)}
                              <CalculatorCellInput
                                disabled={!canEdit}
                                value={raw(r.bad)}
                                hasNote={!!badNote}
                                onChange={val => handleNumberInput(i, 'bad', val)}
                                className={`w-full min-w-0 text-center px-0.5 py-0.5 bg-transparent border border-transparent hover:border-slate-300 focus:bg-white dark:focus:bg-slate-800 focus:border-teal-600 rounded focus:outline-none ${
                                  badNote ? 'text-slate-900 dark:text-slate-900 font-bold' : 'text-rose-600 dark:text-rose-400'
                                }`}
                              />
                            </td>

                            {/* Total Goods Available (Calculated) */}
                            <td
                              className={`p-0.5 text-center font-mono tabular-nums font-semibold text-[10px] 2xl:text-[11px] border-r border-slate-200 dark:border-slate-800 relative group truncate ${
                                tgNote
                                  ? 'bg-[#ECECEC] dark:bg-[#FFFFEB] text-slate-900 dark:text-slate-900 font-semibold'
                                  : 'bg-teal-50/50 dark:bg-teal-950/30'
                              } ${c.tg < 0 && !tgNote ? 'text-rose-600 dark:text-rose-400' : ''}`}
                              onContextMenu={e => {
                                e.preventDefault();
                                handleOpenNoteModal(tgKey, `${itemDesc} - Goods Available`);
                              }}
                              title={tgNote ? `Note: "${tgNote.text}" (${tgNote.author}) - Right-click to edit` : 'Right-click to add note'}
                            >
                              {renderCellNoteIndicator(tgKey, `${itemDesc} - Goods Available`, tgNote)}
                              {raw(c.tg)}
                            </td>

                            {/* Ending Inventory */}
                            <td
                              className={`p-0.5 text-center font-mono tabular-nums text-[10px] 2xl:text-[11px] border-r border-slate-200 dark:border-slate-800 relative group ${
                                endNote ? 'bg-[#ECECEC] dark:bg-[#FFFFEB] text-slate-900 dark:text-slate-900 font-semibold' : ''
                              }`}
                              onContextMenu={e => {
                                e.preventDefault();
                                handleOpenNoteModal(endKey, `${itemDesc} - Ending Inv`);
                              }}
                              title={endNote ? `Note: "${endNote.text}" (${endNote.author}) - Right-click to edit` : 'Right-click to add note'}
                            >
                              {renderCellNoteIndicator(endKey, `${itemDesc} - Ending Inv`, endNote)}
                              <CalculatorCellInput
                                disabled={!canEdit}
                                value={raw(r.end)}
                                hasNote={!!endNote}
                                placeholder={isSoldOut ? 'Sold out' : ''}
                                onChange={val => handleNumberInput(i, 'end', val)}
                                className={`w-full min-w-0 text-center px-0.5 py-0.5 bg-transparent border border-transparent hover:border-slate-300 focus:bg-white dark:focus:bg-slate-800 focus:border-teal-600 rounded focus:outline-none font-bold ${
                                  endNote ? 'text-slate-900 dark:text-slate-900' : 'text-amber-700 dark:text-amber-400'
                                }`}
                              />
                            </td>

                            {/* Total Goods Sold (Calculated) */}
                            <td
                              className={`p-0.5 text-center font-mono tabular-nums font-semibold text-[10px] 2xl:text-[11px] border-r border-slate-200 dark:border-slate-800 relative group truncate ${
                                soldNote
                                  ? 'bg-[#ECECEC] dark:bg-[#FFFFEB] text-slate-900 dark:text-slate-900 font-semibold'
                                  : 'bg-teal-50/50 dark:bg-teal-950/30'
                              } ${c.sold < 0 && !soldNote ? 'text-rose-600 dark:text-rose-400' : ''}`}
                              onContextMenu={e => {
                                e.preventDefault();
                                handleOpenNoteModal(soldKey, `${itemDesc} - Goods Sold`);
                              }}
                              title={soldNote ? `Note: "${soldNote.text}" (${soldNote.author}) - Right-click to edit` : 'Right-click to add note'}
                            >
                              {renderCellNoteIndicator(soldKey, `${itemDesc} - Goods Sold`, soldNote)}
                              {raw(c.sold)}
                            </td>

                            {/* SRP */}
                            <td
                              className={`p-0.5 text-right font-mono tabular-nums text-[10px] 2xl:text-[11px] border-r border-slate-200 dark:border-slate-800 relative group truncate ${
                                srpNote
                                  ? 'bg-[#ECECEC] dark:bg-[#FFFFEB] text-slate-900 dark:text-slate-900 font-semibold'
                                  : 'text-slate-600 dark:text-slate-400'
                              }`}
                              onContextMenu={e => {
                                e.preventDefault();
                                handleOpenNoteModal(srpKey, `${itemDesc} - SRP`);
                              }}
                              title={srpNote ? `Note: "${srpNote.text}" (${srpNote.author}) - Right-click to edit` : 'Right-click to add note'}
                            >
                              {renderCellNoteIndicator(srpKey, `${itemDesc} - SRP`, srpNote)}
                              {acct(c.srp)}
                            </td>

                            {/* Total Sales (Calculated) */}
                            <td
                              className={`p-0.5 px-1 text-right font-mono tabular-nums font-bold text-[10px] 2xl:text-[11px] border-r border-slate-200 dark:border-slate-800 relative group truncate ${
                                salesNote
                                  ? 'bg-[#ECECEC] dark:bg-[#FFFFEB] text-slate-900 dark:text-slate-900 font-semibold'
                                  : 'bg-teal-50/50 dark:bg-teal-950/30'
                              } ${c.sales < 0 && !salesNote ? 'text-rose-600 dark:text-rose-400' : !salesNote ? 'text-teal-900 dark:text-teal-200' : ''}`}
                              onContextMenu={e => {
                                e.preventDefault();
                                handleOpenNoteModal(salesKey, `${itemDesc} - Total Sales`);
                              }}
                              title={salesNote ? `Note: "${salesNote.text}" (${salesNote.author}) - Right-click to edit` : 'Right-click to add note'}
                            >
                              {renderCellNoteIndicator(salesKey, `${itemDesc} - Total Sales`, salesNote)}
                              {acct(c.sales)}
                            </td>

                            {/* Delete Action */}
                            {canAdmin && (
                              <td className="p-0.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRow(i)}
                                  className="text-slate-400 hover:text-rose-600 p-0.5 transition-colors cursor-pointer"
                                  title="Delete row"
                                >
                                  ×
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}

                      {/* Category Subtotal Row */}
                      <tr className="bg-slate-200/60 dark:bg-slate-800/60 font-semibold border-b border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                        <td colSpan={2} className="border-r border-slate-200 dark:border-slate-800"></td>
                        <td className="py-1 px-1 text-left font-bold text-slate-700 dark:text-slate-300 truncate border-r border-slate-200 dark:border-slate-800">
                          {cat.name} Total
                        </td>
                        <td className="py-1 px-0.5 text-center font-mono tabular-nums truncate border-r border-slate-200 dark:border-slate-800">{raw(catTotals.beg)}</td>
                        <td className="py-1 px-0.5 text-center font-mono tabular-nums truncate border-r border-slate-200 dark:border-slate-800">{raw(catTotals.del)}</td>
                        <td className="border-r border-slate-200 dark:border-slate-800"></td>
                        <td className="py-1 px-0.5 text-center font-mono tabular-nums truncate border-r border-slate-200 dark:border-slate-800">{raw(catTotals.wd)}</td>
                        <td className="py-1 px-0.5 text-center font-mono tabular-nums truncate border-r border-slate-200 dark:border-slate-800">{raw(catTotals.tf)}</td>
                        <td className="border-r border-slate-200 dark:border-slate-800"></td>
                        <td
                          className={`py-1 px-0.5 text-center font-mono tabular-nums truncate border-r border-slate-200 dark:border-slate-800 ${
                            catTotals.itf !== catTotals.itt ? 'text-rose-600 dark:text-rose-400 font-bold' : ''
                          }`}
                        >
                          {raw(catTotals.itf)}
                        </td>
                        <td className="py-1 px-0.5 text-center font-mono tabular-nums truncate border-r border-slate-200 dark:border-slate-800">{raw(catTotals.tt)}</td>
                        <td className="border-r border-slate-200 dark:border-slate-800"></td>
                        <td
                          className={`py-1 px-0.5 text-center font-mono tabular-nums truncate border-r border-slate-200 dark:border-slate-800 ${
                            catTotals.itf !== catTotals.itt ? 'text-rose-600 dark:text-rose-400 font-bold' : ''
                          }`}
                        >
                          {raw(catTotals.itt)}
                        </td>
                        <td className="py-1 px-0.5 text-center font-mono tabular-nums truncate border-r border-slate-200 dark:border-slate-800">{raw(catTotals.bad)}</td>
                        <td className="py-1 px-0.5 text-center font-mono tabular-nums bg-teal-100/60 dark:bg-teal-950/60 font-bold truncate border-r border-slate-200 dark:border-slate-800">
                          {raw(catTotals.tg)}
                        </td>
                        <td className="py-1 px-0.5 text-center font-mono tabular-nums truncate border-r border-slate-200 dark:border-slate-800">{raw(catTotals.end)}</td>
                        <td className="py-1 px-0.5 text-center font-mono tabular-nums bg-teal-100/60 dark:bg-teal-950/60 font-bold truncate border-r border-slate-200 dark:border-slate-800">
                          {raw(catTotals.sold)}
                        </td>
                        <td className="border-r border-slate-200 dark:border-slate-800"></td>
                        <td
                          className={`py-1 px-1 text-right font-mono tabular-nums font-bold bg-teal-100/60 dark:bg-teal-950/60 truncate border-r border-slate-200 dark:border-slate-800 ${
                            catTotals.sales < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-teal-950 dark:text-teal-200'
                          }`}
                        >
                          {acct(catTotals.sales)}
                        </td>
                        {canAdmin && <td></td>}
                      </tr>
                    </React.Fragment>
                  );
                })
              )}
            </tbody>

            {/* Grand Total Footer */}
            {currentRowsWithIndex.length > 0 && (
              <tfoot className="bg-slate-200/90 dark:bg-slate-800 font-bold text-slate-900 dark:text-slate-100 border-t border-slate-300 dark:border-slate-700">
                <tr>
                  <td colSpan={2} className="border-r border-slate-200 dark:border-slate-800"></td>
                  <td className="py-1.5 px-1 text-left uppercase tracking-wide truncate border-r border-slate-200 dark:border-slate-800">Grand Total ({currentShift})</td>
                  <td className="py-1.5 px-0.5 text-center font-mono tabular-nums truncate border-r border-slate-200 dark:border-slate-800">
                    {raw(currentRowsWithIndex.reduce((s, it) => s + it.c.beg, 0))}
                  </td>
                  <td className="py-1.5 px-0.5 text-center font-mono tabular-nums truncate border-r border-slate-200 dark:border-slate-800">
                    {raw(currentRowsWithIndex.reduce((s, it) => s + num(it.r.del), 0))}
                  </td>
                  <td className="border-r border-slate-200 dark:border-slate-800"></td>
                  <td className="py-1.5 px-0.5 text-center font-mono tabular-nums truncate border-r border-slate-200 dark:border-slate-800">
                    {raw(currentRowsWithIndex.reduce((s, it) => s + num(it.r.wd), 0))}
                  </td>
                  <td className="py-1.5 px-0.5 text-center font-mono tabular-nums truncate border-r border-slate-200 dark:border-slate-800">
                    {raw(currentRowsWithIndex.reduce((s, it) => s + num(it.r.tf), 0))}
                  </td>
                  <td className="border-r border-slate-200 dark:border-slate-800"></td>
                  <td
                    className={`py-1.5 px-0.5 text-center font-mono tabular-nums truncate border-r border-slate-200 dark:border-slate-800 ${
                      currentRowsWithIndex.reduce((s, it) => s + num(it.r.itf), 0) !==
                      currentRowsWithIndex.reduce((s, it) => s + num(it.r.itt), 0)
                        ? 'text-rose-600 dark:text-rose-400'
                        : ''
                    }`}
                  >
                    {raw(currentRowsWithIndex.reduce((s, it) => s + num(it.r.itf), 0))}
                  </td>
                  <td className="py-1.5 px-0.5 text-center font-mono tabular-nums truncate border-r border-slate-200 dark:border-slate-800">
                    {raw(currentRowsWithIndex.reduce((s, it) => s + num(it.r.tt), 0))}
                  </td>
                  <td className="border-r border-slate-200 dark:border-slate-800"></td>
                  <td
                    className={`py-1.5 px-0.5 text-center font-mono tabular-nums truncate border-r border-slate-200 dark:border-slate-800 ${
                      currentRowsWithIndex.reduce((s, it) => s + num(it.r.itf), 0) !==
                      currentRowsWithIndex.reduce((s, it) => s + num(it.r.itt), 0)
                        ? 'text-rose-600 dark:text-rose-400'
                        : ''
                    }`}
                  >
                    {raw(currentRowsWithIndex.reduce((s, it) => s + num(it.r.itt), 0))}
                  </td>
                  <td className="py-1.5 px-0.5 text-center font-mono tabular-nums truncate border-r border-slate-200 dark:border-slate-800">
                    {raw(currentRowsWithIndex.reduce((s, it) => s + num(it.r.bad), 0))}
                  </td>
                  <td className="py-1.5 px-0.5 text-center font-mono tabular-nums bg-teal-200/50 dark:bg-teal-900/50 truncate border-r border-slate-200 dark:border-slate-800">
                    {raw(currentRowsWithIndex.reduce((s, it) => s + it.c.tg, 0))}
                  </td>
                  <td className="py-1.5 px-0.5 text-center font-mono tabular-nums truncate border-r border-slate-200 dark:border-slate-800">
                    {raw(currentRowsWithIndex.reduce((s, it) => s + num(it.r.end), 0))}
                  </td>
                  <td className="py-1.5 px-0.5 text-center font-mono tabular-nums bg-teal-200/50 dark:bg-teal-900/50 truncate border-r border-slate-200 dark:border-slate-800">
                    {raw(currentRowsWithIndex.reduce((s, it) => s + it.c.sold, 0))}
                  </td>
                  <td className="border-r border-slate-200 dark:border-slate-800"></td>
                  <td className="py-1.5 px-1 text-right font-mono tabular-nums text-xs bg-teal-200/50 dark:bg-teal-900/50 text-teal-950 dark:text-teal-100 truncate border-r border-slate-200 dark:border-slate-800">
                    ₱{f2(totalSalesDay)}
                  </td>
                  {canAdmin && <td></td>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Cash Details Card */}
      <div className="flex flex-wrap items-start gap-4">
        <div className="w-full sm:w-96 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
          <div className="bg-slate-100 dark:bg-slate-800 px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 font-semibold text-xs text-slate-800 dark:text-slate-200 flex items-center justify-between">
            <span>Cash Details ({currentShift} Shift)</span>
            <span className="font-mono text-[11px] text-slate-500">{fd(currentDate)}</span>
          </div>

          <div className="p-3 space-y-2.5 text-xs">
            <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-600 dark:text-slate-400">Should be Sales:</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                ₱{acct(totalSalesDay)}
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
              <label htmlFor="cash-on-hand-input" className="text-slate-600 dark:text-slate-400">
                Cash on Hand:
              </label>
              <div className="flex items-center gap-1">
                <span className="text-slate-400 font-mono">₱</span>
                <input
                  id="cash-on-hand-input"
                  type="text"
                  inputMode="decimal"
                  disabled={!canEdit}
                  value={hasCash ? cashOnHandRaw : ''}
                  onChange={e => handleCashChange(e.target.value)}
                  placeholder=""
                  className="w-28 text-right font-mono tabular-nums font-medium px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
                />
              </div>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-600 dark:text-slate-400 font-medium">Over / Short:</span>
              <span
                className={`font-mono tabular-nums font-bold px-2 py-0.5 rounded ${
                  !hasCash
                    ? 'text-slate-400'
                    : overShortVal < 0
                    ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                    : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                }`}
              >
                {hasCash ? `₱${acct(overShortVal)}` : '—'}
              </span>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label htmlFor="cashier-name-select" className="text-slate-600 dark:text-slate-400">
                Cashier Name:
              </label>
              <select
                id="cashier-name-select"
                disabled={!canEdit}
                value={currentCashier}
                onChange={e => handleCashierChange('cashier', e.target.value)}
                className="w-44 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-600"
              >
                <option value="">(Select Cashier)</option>
                {state.cashiers.map(c => (
                  <option key={c} value={c} className="dark:bg-slate-900">
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between">
              <label htmlFor="shift-letter-select" className="text-slate-600 dark:text-slate-400">
                Shift:
              </label>
              <select
                id="shift-letter-select"
                disabled={!canEdit}
                value={currentShiftLetter}
                onChange={e => handleShiftChangeLetter(e.target.value)}
                className="w-20 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-600"
              >
                <option value=""></option>
                <option value="A">A</option>
                <option value="B">B</option>
              </select>
            </div>
          </div>
        </div>

        {/* Operational guidelines and hints */}
        <div className="flex-1 min-w-[280px] p-4 rounded-xl bg-slate-100/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 leading-relaxed space-y-1.5">
          <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
            <span>Shift & Inventory Carryover Rules</span>
          </div>
          <p>
            • Selecting a Date displays only entries for that date. The Shift selector toggles between AM Shift and PM Shift.
          </p>
          <p>
            • PM Shift Beginning Inventory automatically inherits from the AM Shift's Ending Inventory.
          </p>
          <p>
            • Dates within the period automatically carry over items with positive ending inventory as the next shift's Beginning Inventory.
          </p>
          <p>
            • If Ending Inventory is left blank or zero, the system marks the item as <strong>"Sold out"</strong> (Total Goods Sold = Total Goods Available).
          </p>
        </div>
      </div>

      {/* Change History Audit Log */}
      <ChangeHistory
        logs={state.log || []}
        currentTab="entry"
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

      {/* Floating Real-Time Preview Dropdown for Item Description (Fixed coordinates to avoid overflow clipping) */}
      {activeItemSearchIndex !== null && dropdownCoords && (
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: dropdownCoords.openAbove ? undefined : `${dropdownCoords.top}px`,
            bottom: dropdownCoords.openAbove ? `${window.innerHeight - dropdownCoords.top}px` : undefined,
            left: `${dropdownCoords.left}px`,
            width: `${dropdownCoords.width}px`,
            height: '300px',
            zIndex: 9999
          }}
          className="h-[300px] max-h-[300px] flex flex-col rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 shadow-2xl p-2 text-xs divide-y divide-slate-100 dark:divide-slate-800 animate-in fade-in duration-100"
        >
          {/* Preview Header */}
          <div className="pb-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1.5 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>
                {searchTerm.trim() ? (
                  <>
                    Previewing items matching <span className="font-bold text-slate-900 dark:text-slate-100 font-mono">"{searchTerm}"</span>
                  </>
                ) : (
                  'Type letters or numbers to preview items'
                )}
              </span>
            </div>
            <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded font-semibold">
              {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}
            </span>
          </div>

          {/* Top Match Preview Card when typing letters or numbers */}
          {searchTerm.trim() && filteredItems.length > 0 && (
            <div className="py-2 shrink-0">
              <div
                onClick={() => selectItemForCurrentRow(filteredItems[0].no)}
                className="p-2.5 bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-950/40 dark:to-emerald-950/30 rounded-lg border border-teal-200 dark:border-teal-800 cursor-pointer hover:border-teal-400 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300 flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    <span>Top Match Preview</span>
                  </span>
                  <span className="text-[10px] font-medium bg-teal-100 dark:bg-teal-900 text-teal-800 dark:text-teal-200 px-1.5 py-0.5 rounded">
                    Press Enter ↵
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-slate-100 truncate">
                    {highlightMatch(filteredItems[0].desc, searchTerm)}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-teal-700 dark:text-teal-400 font-mono text-xs sm:text-sm">
                      ₱{f2(filteredItems[0].srp)}
                    </div>
                    <div className="text-[9px] text-slate-400 font-mono">SRP</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Scrollable list of matching preview items */}
          <div className="pt-1.5 overflow-y-auto flex-1 min-h-0 space-y-1">
            {filteredItems.length === 0 ? (
              <div className="py-6 text-center space-y-1.5">
                <AlertTriangle className="w-5 h-5 text-amber-500 mx-auto" />
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  No items match "{searchTerm}"
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Try typing item description or price
                </p>
              </div>
            ) : (
              filteredItems.map((itemChoice, choiceIdx) => {
                const isSelected = highlightedItemIndex === choiceIdx;
                return (
                  <div
                    key={itemChoice.no}
                    ref={isSelected ? highlightedItemRef : null}
                    onClick={() => selectItemForCurrentRow(itemChoice.no)}
                    onMouseEnter={() => setHighlightedItemIndex(choiceIdx)}
                    className={`px-3 py-2 rounded-lg cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-teal-50 dark:bg-teal-900/50 text-teal-950 dark:text-teal-100 ring-1 ring-teal-500/50'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate">
                        {highlightMatch(itemChoice.desc, searchTerm)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold font-mono text-teal-700 dark:text-teal-400 text-xs">
                        ₱{f2(itemChoice.srp)}
                      </div>
                      <div className="text-[9px] text-slate-400 font-mono">SRP</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Tips */}
          <div className="pt-2 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
            <span>↑↓ Navigate · Enter / Tab to select · Esc to close</span>
            <span>{filteredItems.length} items</span>
          </div>
        </div>
      )}

      {/* Floating Real-Time Preview Dropdown for Easy Encoding Bar (Fixed coordinates to avoid overflow clipping) */}
      {showEncoderItemDropdown && encoderDropdownCoords && encoderForm.itemNo === '' && encoderForm.itemSearch.trim().length > 0 && matchingEncoderItems.length > 0 && (
        <div
          ref={encoderDropdownRef}
          style={{
            position: 'fixed',
            top: encoderDropdownCoords.openAbove ? undefined : `${encoderDropdownCoords.top}px`,
            bottom: encoderDropdownCoords.openAbove ? `${window.innerHeight - encoderDropdownCoords.top}px` : undefined,
            left: `${encoderDropdownCoords.left}px`,
            width: `${encoderDropdownCoords.width}px`,
            maxHeight: '340px',
            zIndex: 9999
          }}
          className="flex flex-col rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-teal-500/30 shadow-2xl p-2.5 text-xs divide-y divide-slate-200 dark:divide-slate-800 animate-in fade-in duration-100 text-slate-800 dark:text-slate-100 font-sans transition-colors duration-200"
        >
          {/* Header */}
          <div className="pb-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1.5 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>
                {encoderForm.itemSearch.trim() ? (
                  <>
                    Previewing items matching <span className="font-bold text-teal-700 dark:text-teal-300 font-mono">"{encoderForm.itemSearch}"</span>
                  </>
                ) : (
                  'Type any letter to preview matching items...'
                )}
              </span>
            </div>
            <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 text-teal-700 dark:text-teal-400 border border-slate-300 dark:border-slate-700 px-1.5 py-0.5 rounded font-bold">
              {matchingEncoderItems.length} {matchingEncoderItems.length === 1 ? 'item' : 'items'}
            </span>
          </div>

          {/* Top Match Preview Card */}
          {matchingEncoderItems[0] && (() => {
            const topMatchPrevEnd = getPreviousEndingInventory(matchingEncoderItems[0].no, state.inv, currentDate, currentShift, state.rows);

            return (
              <div className="py-2 shrink-0">
                <div
                  onClick={() => handleSelectEncoderItem(matchingEncoderItems[0].no)}
                  className="p-2.5 bg-slate-50 dark:bg-slate-850 rounded-lg border border-slate-300 dark:border-teal-500/40 cursor-pointer hover:border-teal-500 dark:hover:border-teal-400 transition-colors duration-200"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300 flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      <span>Top Match Preview</span>
                    </span>
                    <span className="text-[10px] font-medium bg-teal-100 dark:bg-teal-900/80 text-teal-800 dark:text-teal-200 border border-teal-300 dark:border-teal-700 px-1.5 py-0.5 rounded">
                      Press Enter ↵
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900 dark:text-white text-xs truncate">
                        {highlightMatch(matchingEncoderItems[0].desc, encoderForm.itemSearch)}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5 mt-0.5">
                        <span className="font-mono">#{matchingEncoderItems[0].no}</span>
                        <span>•</span>
                        <span>{matchingEncoderItems[0].cat}</span>
                        {topMatchPrevEnd !== null && (
                          <>
                            <span>•</span>
                            <span className="text-sky-800 dark:text-sky-300 font-semibold font-mono bg-sky-100 dark:bg-sky-950/70 px-1 py-0.2 rounded border border-sky-300 dark:border-sky-800">
                              Beg Inv: {topMatchPrevEnd > 0 ? topMatchPrevEnd : '0 (Sold Out)'}
                            </span>
                          </>
                        )}
                        {currentRowsWithIndex.some(x => x.r.no === matchingEncoderItems[0].no) && (
                          <>
                            <span>•</span>
                            <span className="text-amber-600 dark:text-amber-400 font-semibold">● In table below</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">SRP</div>
                      <div className="text-xs font-mono font-bold text-teal-700 dark:text-teal-300">
                        ₱{f2(matchingEncoderItems[0].srp)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Scrollable list of items */}
          <div className="pt-1 overflow-y-auto max-h-48 divide-y divide-slate-200 dark:divide-slate-800/80">
            {matchingEncoderItems.length === 0 ? (
              <div className="p-4 text-center text-slate-500 dark:text-slate-400 italic">
                No items match "{encoderForm.itemSearch}"
              </div>
            ) : (
              matchingEncoderItems.map((it, idx) => {
                const isSelected = highlightedEncoderItemIdx === idx;
                const isAlreadyInTable = currentRowsWithIndex.some(x => x.r.no === it.no);
                const itPrevEnd = getPreviousEndingInventory(it.no, state.inv, currentDate, currentShift, state.rows);

                return (
                  <div
                    key={it.no}
                    ref={isSelected ? highlightedEncoderItemRef : undefined}
                    onMouseEnter={() => setHighlightedEncoderItemIdx(idx)}
                    onClick={() => handleSelectEncoderItem(it.no)}
                    className={`p-2 cursor-pointer transition-colors flex items-center justify-between text-xs rounded ${
                      isSelected
                        ? 'bg-teal-100 dark:bg-teal-900/60 text-slate-900 dark:text-white ring-1 ring-teal-500/50'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-semibold truncate text-[11px] text-slate-900 dark:text-white">
                        {highlightMatch(it.desc, encoderForm.itemSearch)}
                      </div>
                      <div className="text-[9px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5 mt-0.5">
                        <span className="font-mono">#{it.no}</span>
                        <span>•</span>
                        <span>{it.cat}</span>
                        {itPrevEnd !== null && (
                          <>
                            <span>•</span>
                            <span className="text-sky-800 dark:text-sky-300 font-semibold font-mono bg-sky-100 dark:bg-sky-950/70 px-1 py-0.2 rounded border border-sky-300 dark:border-sky-850">
                              Beg: {itPrevEnd > 0 ? itPrevEnd : '0 (Sold Out)'}
                            </span>
                          </>
                        )}
                        {isAlreadyInTable && (
                          <span className="text-amber-600 dark:text-amber-400 font-medium">● In table below</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0 font-mono text-[10px] text-teal-700 dark:text-teal-400 font-bold">
                      ₱{f2(it.srp)}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Tips */}
          <div className="pt-2 flex items-center justify-between text-[10px] text-slate-400">
            <span>↑↓ Navigate · Enter to select · Esc to close</span>
            <span>{matchingEncoderItems.length} items</span>
          </div>
        </div>
      )}

      {/* Multi-Location Transfer Manager Modal */}
      {multiLocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="min-w-0 pr-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Layers className={`w-4 h-4 ${multiLocModal.type === 'tf' ? 'text-teal-600' : 'text-rose-600'}`} />
                  <span>
                    {multiLocModal.type === 'tf' ? 'Transfer From (Multiple Sources)' : 'Transfer To (Multiple Destinations)'}
                  </span>
                </h3>
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 truncate mt-0.5" title={multiLocModal.itemDesc}>
                  {multiLocModal.itemDesc}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMultiLocModal(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMultiLocModal} className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {multiLocModal.type === 'tf' ? 'Source Branches & Quantities' : 'Destination Branches & Quantities'}
                </label>
                <button
                  type="button"
                  onClick={handleAddModalLocRow}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/60 rounded border border-teal-200 dark:border-teal-800 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Branch</span>
                </button>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {multiLocModal.locations.map((entry, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-medium text-slate-400 block mb-0.5">
                        {multiLocModal.type === 'tf' ? 'Source' : 'Destination'} Branch #{idx + 1}
                      </span>
                      <select
                        value={entry.loc}
                        onChange={e => handleUpdateModalLocEntry(idx, 'loc', e.target.value)}
                        className="w-full px-2 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-600 truncate"
                      >
                        {state.locs.map(loc => (
                          <option key={loc} value={loc}>
                            {loc} {loc === state.inv ? `(${multiLocModal.type === 'tf' ? 'Receiving' : 'Current'} Store)` : ''}
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
                        placeholder="e.g. 5"
                        value={entry.qty}
                        onChange={e => handleUpdateModalLocEntry(idx, 'qty', e.target.value)}
                        className="w-full px-2 py-1.5 text-xs font-mono font-medium rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-right focus:outline-none focus:ring-1 focus:ring-teal-600"
                      />
                    </div>

                    {multiLocModal.locations.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveModalLocRow(idx)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded cursor-pointer self-end mb-0.5"
                        title="Remove this branch"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Total Summary */}
              <div className={`p-2.5 rounded-lg border flex items-center justify-between text-xs ${
                multiLocModal.type === 'tf'
                  ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800'
              }`}>
                <span className={`font-medium ${multiLocModal.type === 'tf' ? 'text-teal-900 dark:text-teal-200' : 'text-rose-900 dark:text-rose-200'}`}>
                  Total {multiLocModal.type === 'tf' ? 'Transfer From' : 'Transfer To'} ({multiLocModal.locations.filter(l => parseFloat(l.qty) > 0).length} branch{multiLocModal.locations.filter(l => parseFloat(l.qty) > 0).length === 1 ? '' : 'es'}):
                </span>
                <span className={`font-mono font-bold text-sm ${multiLocModal.type === 'tf' ? 'text-teal-800 dark:text-teal-300' : 'text-rose-800 dark:text-rose-300'}`}>
                  {totalMultiLocQty} units
                </span>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="text-[11px] text-slate-500 italic">
                  Updates columns in {multiLocModal.type === 'tf' ? 'Transfer From' : 'Transfer To'} tab automatically.
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMultiLocModal(null)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-700 rounded-lg cursor-pointer shadow-xs"
                  >
                    Apply & Save
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cell Note Modal (Available to all users to add/view/edit/delete cell notes) */}
      {noteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setNoteModal(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-300 dark:border-slate-700 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-4 py-3 bg-slate-100/90 dark:bg-slate-800/90 border-b border-slate-300 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700">
                  <StickyNote className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Cell Note
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-xs" title={noteModal.cellLabel}>
                    {noteModal.cellLabel}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNoteModal(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-3">
              {noteModal.author && noteModal.timestamp && (
                <div className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 text-[11px] text-slate-600 dark:text-slate-300 flex items-center justify-between">
                  <span>
                    By <strong className="text-slate-900 dark:text-white">{noteModal.author}</strong>
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">
                    {new Date(noteModal.timestamp).toLocaleString()}
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Note Text
                </label>
                <textarea
                  autoFocus
                  rows={4}
                  value={noteModal.currentText}
                  onChange={e =>
                    setNoteModal(prev => (prev ? { ...prev, currentText: e.target.value } : null))
                  }
                  onKeyDown={e => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveNote(noteModal.cellKey, noteModal.currentText, noteModal.cellLabel);
                    }
                  }}
                  placeholder="Type your note here... (all users can view and edit notes; cell will highlight automatically)"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none resize-none"
                />
                <div className="mt-1 flex items-center justify-between text-[10.5px] text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2.5 h-2.5 rounded-xs bg-[#ECECEC] dark:bg-[#FFFFEB] border border-amber-400"></span>
                    <span>Highlights: #ECECEC (Light) / #FFFFEB (Dark)</span>
                  </span>
                  <span>Ctrl+Enter to save</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              {noteModal.author ? (
                <button
                  type="button"
                  onClick={() => handleDeleteNote(noteModal.cellKey, noteModal.cellLabel)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Note</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setNoteModal(null)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-750 rounded-lg cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveNote(noteModal.cellKey, noteModal.currentText, noteModal.cellLabel)}
                  className="inline-flex items-center gap-1 px-3.5 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-500 rounded-lg shadow-xs cursor-pointer transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Note</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function handleShiftChangeLetter(val: string) {
    handleCashierChange('shift', val);
  }
};
