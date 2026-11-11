import * as XLSX from 'xlsx';
import { AppState, Item, Row } from '../types';
import {
  acct,
  acp,
  addDay,
  computeRows,
  dcmp,
  f2,
  fd,
  getWeekOf,
  getWeeksCount,
  num,
  parseCashKey,
  parseTransferLocations,
  raw,
  unitCost
} from './helpers';

export function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename);
}

// ----------------- ITEM MASTER EXPORT / IMPORT -----------------

export const MC = [
  'Line No.',
  'Item Code',
  'System Description',
  'Item Description',
  'Category',
  'SRP',
  'Item Location',
  'Cost Type VAT/NVAT',
  'Delivery Cost',
  'Stock Withdrawal Cost',
  'Conversion',
  'Unit Cost'
];

export const MK = [
  'no',
  'code',
  'sys',
  'desc',
  'cat',
  'srp',
  'loc',
  'vat',
  'deliv',
  'wd',
  'cv'
] as const;

export function exportItemMaster(items: Item[], rows?: Row[], selectedYear?: string): void {
  const hasRows = Array.isArray(rows) && rows.length > 0;
  const yearLabel = selectedYear && selectedYear !== 'all' ? selectedYear : 'All Years';

  const headers = hasRows
    ? [
        'Line No.',
        'Item Code',
        'System Description',
        'Item Description',
        'Category',
        `Status (${yearLabel})`,
        'Encoded Rows Count',
        'Last Encoded Date',
        'SRP',
        'Item Location',
        'Cost Type VAT/NVAT',
        'Delivery Cost',
        'Stock Withdrawal Cost',
        'Conversion',
        'Unit Cost'
      ]
    : MC;

  const activityMap = new Map<number, { count: number; lastDate: string }>();
  if (hasRows) {
    rows.forEach(r => {
      if (r.no === '' || r.no === undefined) return;
      const rowYear = r.date ? r.date.slice(0, 4) : '';
      if (selectedYear && selectedYear !== 'all' && rowYear !== selectedYear) return;
      const itemNo = Number(r.no);
      const curr = activityMap.get(itemNo) || { count: 0, lastDate: '' };
      curr.count += 1;
      if (!curr.lastDate || r.date > curr.lastDate) {
        curr.lastDate = r.date;
      }
      activityMap.set(itemNo, curr);
    });
  }

  const aoa: any[][] = [
    headers,
    ...items.map(it => {
      const act = activityMap.get(it.no);
      const isActive = (act?.count || 0) > 0;
      if (hasRows) {
        return [
          it.no,
          it.code,
          it.sys,
          it.desc,
          it.cat,
          isActive ? 'Active' : 'Inactive',
          act?.count || 0,
          act?.lastDate || 'None',
          it.srp,
          it.loc,
          it.vat,
          it.deliv,
          it.wd,
          it.cv,
          unitCost(it)
        ];
      }
      return [
        it.no,
        it.code,
        it.sys,
        it.desc,
        it.cat,
        it.srp,
        it.loc,
        it.vat,
        it.deliv,
        it.wd,
        it.cv,
        unitCost(it)
      ];
    })
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = hasRows
    ? [6, 12, 34, 26, 14, 14, 16, 14, 10, 14, 12, 13, 18, 11, 11].map(w => ({ wch: w }))
    : [6, 12, 34, 26, 12, 10, 14, 12, 13, 18, 11, 11].map(w => ({ wch: w }));

  // Set number formats
  items.forEach((_, i) => {
    const srpCol = hasRows ? 8 : 5;
    const delivCol = hasRows ? 11 : 8;
    const wdCol = hasRows ? 12 : 9;
    const uCostCol = hasRows ? 14 : 11;
    [srpCol, delivCol, wdCol, uCostCol].forEach(c => {
      const cellRef = XLSX.utils.encode_cell({ r: i + 1, c });
      if (ws[cellRef]) ws[cellRef].z = '#,##0.00';
    });
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Item Master');
  downloadWorkbook(wb, `item-master-${yearLabel.toLowerCase().replace(/\s+/g, '-')}.xlsx`);
}

const HK: Record<string, string> = {
  lineno: 'no',
  itemcode: 'code',
  systemdescription: 'sys',
  itemdescription: 'desc',
  category: 'cat',
  srp: 'srp',
  itemlocation: 'loc',
  costtypevatnvat: 'vat',
  costtype: 'vat',
  deliverycost: 'deliv',
  stockwithdrawalcost: 'wd',
  conversion: 'cv'
};

export function parseItemImport(
  sheetRows: any[][],
  currentItems: Item[]
): { updated: number; added: number; items: Item[]; error?: string } {
  const rows = sheetRows.filter(r => r.some(x => String(x ?? '').trim() !== ''));
  if (!rows.length) {
    return { updated: 0, added: 0, items: currentItems, error: 'File is empty.' };
  }

  let cols = rows[0].map(h => HK[String(h ?? '').toLowerCase().replace(/[^a-z]/g, '')]);
  let st = 1;
  if (!cols.some(Boolean)) {
    cols = [...MK];
    st = 0;
  }

  if (!cols.includes('desc') && !cols.includes('code')) {
    return {
      updated: 0,
      added: 0,
      items: currentItems,
      error: 'The header row needs an Item Code or Item Description column.'
    };
  }

  let up = 0;
  let add = 0;
  const newItems = [...currentItems];

  for (const r of rows.slice(st)) {
    const o: any = {};
    cols.forEach((k, j) => {
      if (k && r[j] !== undefined) o[k] = String(r[j]).trim();
    });

    if (!(o.code || o.desc || o.sys)) continue;

    ['srp', 'deliv', 'conv', 'wd', 'cv'].forEach(k => {
      if (k in o) {
        const n = parseFloat(String(o[k]).replace(/[^0-9.-]/g, ''));
        o[k] = isNaN(n) ? 0 : n;
      }
    });

    if (o.vat) {
      o.vat = /^n/i.test(o.vat) ? 'NVAT' : 'VAT';
    }

    const ln = parseInt(o.no);
    delete o.no;
    const ex = isNaN(ln) ? null : newItems.find(x => x.no === ln);

    if (ex) {
      Object.assign(ex, o);
      up++;
    } else {
      const maxNo = newItems.reduce((m, x) => Math.max(m, x.no), 0);
      const no = ln > 0 && !newItems.some(x => x.no === ln) ? ln : maxNo + 1;
      newItems.push({
        no,
        code: '',
        sys: '',
        desc: '',
        cat: '',
        srp: 0,
        loc: '',
        vat: 'VAT',
        deliv: 0,
        conv: 0,
        wd: 0,
        cv: 1,
        ...o
      });
      add++;
    }
  }

  newItems.sort((a, b) => a.no - b.no);
  return { updated: up, added: add, items: newItems };
}

// ----------------- DATA ENTRY EXPORT / IMPORT -----------------

export const EH = [
  'Date',
  'Month Week Number',
  'Item Description',
  'Beginning Inventory',
  'Deliveries',
  'Document Number',
  'Stock Withdrawal',
  'Transfer from',
  'Transfer from Location',
  'Internal Transfer From (Price Changes)',
  'Transfer To',
  'Transfer To Location',
  'Internal Transfer To (Price Changes)',
  'Bad Order',
  'Total Goods Available',
  'Ending Inventory',
  'Total Goods Sold',
  'SRP',
  'Total Sales',
  'Shift'
];

export function exportDataEntry(state: AppState): void {
  const C = computeRows(state.rows, state.items);
  const Z = (v: any) => (num(v) === 0 ? '' : num(v));
  const aoa: any[][] = [[...EH]];
  const G = { del: 0, wd: 0, tf: 0, itf: 0, tt: 0, itt: 0, bad: 0, sold: 0, sales: 0 };
  const X: (keyof typeof G)[] = ['del', 'wd', 'tf', 'itf', 'tt', 'itt', 'bad'];

  const vis = state.rows
    .map((r, i) => i)
    .filter(i => state.rows[i].loc === state.inv)
    .sort((a, b) => {
      const rA = state.rows[a];
      const rB = state.rows[b];
      return dcmp(rA.date, rB.date) || (rA.fr === 'PM' ? 1 : 0) - (rB.fr === 'PM' ? 1 : 0);
    });

  const nd = () => ({
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
  });

  const tot = (l: string, D: ReturnType<typeof nd>) => [
    '',
    '',
    l,
    Z(D.beg),
    Z(D.del),
    '',
    Z(D.wd),
    Z(D.tf),
    '',
    Z(D.itf),
    Z(D.tt),
    '',
    Z(D.itt),
    Z(D.bad),
    Z(D.tg),
    Z(D.end),
    Z(D.sold),
    '',
    D.sales
  ];

  let k = 0;
  while (k < vis.length) {
    let e = k;
    const d = state.rows[vis[k]].date;
    const fr = state.rows[vis[k]].fr === 'PM' ? 'PM' : 'AM';
    const secs: { c: string; ids: number[] }[] = [];
    const DD = nd();
    const st = aoa.length;

    while (
      e < vis.length &&
      state.rows[vis[e]].date === d &&
      (state.rows[vis[e]].fr === 'PM' ? 'PM' : 'AM') === fr
    ) {
      e++;
    }

    vis.slice(k, e).forEach(i => {
      const it = state.items.find(x => x.no === state.rows[i].no);
      const c = it?.cat || 'Uncategorized';
      const l = secs[secs.length - 1];
      if (l && l.c === c) l.ids.push(i);
      else secs.push({ c, ids: [i] });
    });

    secs.forEach(x => {
      const SD = nd();
      if (x.c) aoa.push([x.c]);
      x.ids.forEach(i => {
        const r = state.rows[i];
        const c = C[i];
        const it = state.items.find(itemObj => itemObj.no === r.no);
        aoa.push([
          fd(r.date),
          getWeekOf(r.date, state.start, state.cut),
          it?.desc || '',
          Z(c.beg),
          Z(r.del),
          r.doc || '',
          Z(r.wd),
          Z(r.tf),
          r.tfl || '',
          Z(r.itf),
          Z(r.tt),
          r.ttl || '',
          Z(r.itt),
          Z(r.bad),
          Z(c.tg),
          Z(r.end),
          Z(c.sold),
          c.srp,
          c.sales
        ]);
        [SD, DD].forEach(D => {
          D.beg += c.beg;
          D.tg += c.tg;
          D.end += num(r.end);
          D.sold += c.sold;
          D.sales += c.sales;
          X.forEach(y => {
            D[y] += num(r[y as keyof Row]);
          });
        });
        X.forEach(y => {
          G[y] += num(r[y as keyof Row]);
        });
        G.sold += c.sold;
        G.sales += c.sales;
      });
      if (d && x.c) aoa.push(tot('Total', SD));
    });

    if (d && (secs.length > 1 || secs.every(x => !x.c))) aoa.push(tot('Day Total', DD));

    if (d) {
      const cashK = `${state.inv}|${d}${fr === 'PM' ? '|PM' : ''}`;
      const ck = state.cash[cashK];
      const has = ck !== undefined && ck !== '';
      const cr = (l: string, v: any) => {
        const r = Array(20).fill('');
        r[2] = l;
        r[18] = v;
        return r;
      };
      aoa.push(
        cr('Cash Details', ''),
        cr('Should be Sales', DD.sales),
        cr('Cash on Hand', has ? num(ck) : ''),
        cr('Over/Short', has ? num(ck) - DD.sales : ''),
        cr('Cashier Name', state.cinfo[cashK]?.cashier || ''),
        cr('Shift', state.cinfo[cashK]?.shift || '')
      );
    }

    for (let z = st; z < aoa.length; z++) {
      const a = aoa[z];
      while (a.length < 19) a.push('');
      a[19] = fr;
    }
    aoa.push([]);
    k = e;
  }

  aoa.push([
    '',
    '',
    'Grand Total',
    '',
    Z(G.del),
    '',
    Z(G.wd),
    Z(G.tf),
    '',
    Z(G.itf),
    Z(G.tt),
    '',
    Z(G.itt),
    Z(G.bad),
    '',
    '',
    Z(G.sold),
    '',
    G.sales
  ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [10, 10, 26, 11, 10, 14, 10, 10, 20, 12, 10, 20, 12, 9, 11, 11, 11, 9, 12, 10].map(
    w => ({ wch: w })
  );

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:T1');
  for (let r = 0; r <= range.e.r; r++) {
    [17, 18].forEach(c => {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      if (ws[cellRef] && typeof ws[cellRef].v === 'number') {
        ws[cellRef].z = '#,##0.00;-#,##0.00;"-"';
      }
    });
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data Entry');
  downloadWorkbook(wb, 'data-entry.xlsx');
}

const DK = (h: any): string => {
  const k = String(h ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (k === 'date') return 'date';
  if (k === 'itemdescription') return 'desc';
  if (/^beg/.test(k)) return 'beg';
  if (/^deliver/.test(k)) return 'del';
  if (/^document/.test(k)) return 'doc';
  if (/^stockwith/.test(k)) return 'wd';
  if (k === 'transferfromlocation') return 'tfl';
  if (k === 'transfertolocation') return 'ttl';
  if (/^internaltransferfrom/.test(k)) return 'itf';
  if (/^internaltransferto/.test(k)) return 'itt';
  if (k === 'transferfrom') return 'tf';
  if (k === 'transferto') return 'tt';
  if (/^bad/.test(k)) return 'bad';
  if (/^ending/.test(k)) return 'end';
  if (k === 'srp') return 'srp';
  if (/^timeframe|shift/.test(k)) return 'frame';
  if (k === 'totalsales') return 'sales';
  return '';
};

const pad = (x: any) => String(x).padStart(2, '0');

export function parseExcelDate(v: any, baseYear = 2026): string {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000) {
    return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
  }
  const t = String(v ?? '').trim();
  if (!t) return '';
  const m1 = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m1) return `${m1[1]}-${pad(m1[2])}-${pad(m1[3])}`;
  const m2 = t.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[a-z]*(?:[-\s](\d{2,4}))?$/);
  if (m2) {
    const MON_LIST = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mo = MON_LIST.findIndex(x => x.toLowerCase() === m2[2].toLowerCase());
    if (mo >= 0) {
      let y = m2[3] ? +m2[3] : baseYear;
      if (y < 100) y += 2000;
      return `${y}-${pad(mo + 1)}-${pad(m2[1])}`;
    }
  }
  const m3 = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m3) {
    let y = +m3[3];
    if (y < 100) y += 2000;
    return `${y}-${pad(m3[1])}-${pad(m3[2])}`;
  }
  return '';
}

export function parseDataEntryImport(
  sheetRows: any[][],
  state: AppState
): {
  updated: number;
  added: number;
  skipped: number;
  newRows: Row[];
  cashUpdates: Record<string, number | ''>;
  cinfoUpdates: Record<string, { cashier: string; shift: string }>;
  error?: string;
} {
  const rows = sheetRows.filter(r => r.some(x => String(x ?? '').trim() !== ''));
  if (!rows.length) {
    return {
      updated: 0,
      added: 0,
      skipped: 0,
      newRows: state.rows,
      cashUpdates: {},
      cinfoUpdates: {},
      error: 'Empty sheet'
    };
  }

  const cols = rows[0].map(DK);
  if (!cols.includes('date') || !cols.includes('desc')) {
    return {
      updated: 0,
      added: 0,
      skipped: 0,
      newRows: state.rows,
      cashUpdates: {},
      cinfoUpdates: {},
      error: 'The header row needs Date and Item Description columns.'
    };
  }

  let add = 0;
  let up = 0;
  let skip = 0;
  let curD = '';
  let curF: 'AM' | 'PM' = 'AM';
  const newRows = [...state.rows];
  const cashUpdates: Record<string, number | ''> = {};
  const cinfoUpdates: Record<string, { cashier: string; shift: string }> = {};

  const baseYear = parseInt(state.start.slice(0, 4)) || 2026;

  rows.slice(1).forEach(r => {
    const o: any = {};
    cols.forEach((k, j) => {
      if (k && r[j] !== undefined && r[j] !== '') o[k] = r[j];
    });

    const desc = String(o.desc ?? '').trim();
    const fq = String(o.frame ?? '').trim();
    const fr: 'AM' | 'PM' = /^pm/i.test(fq) ? 'PM' : /^am/i.test(fq) ? 'AM' : curF;

    if (/^cash on hand/i.test(desc) && curD) {
      const n = parseFloat(String(o.sales ?? '').replace(/[^0-9.-]/g, ''));
      if (!isNaN(n)) {
        const key = `${state.inv}|${curD}${fr === 'PM' ? '|PM' : ''}`;
        cashUpdates[key] = n;
      }
      return;
    }

    if (/^(cashier name|shift)$/i.test(desc) && curD) {
      const key = `${state.inv}|${curD}${fr === 'PM' ? '|PM' : ''}`;
      cinfoUpdates[key] = cinfoUpdates[key] || { cashier: '', shift: '' };
      const isS = /^shift/i.test(desc);
      const v = String(o.sales ?? '').trim();
      if (isS) {
        cinfoUpdates[key].shift = /^[ab]$/i.test(v) ? v.toUpperCase() : '';
      } else {
        cinfoUpdates[key].cashier = v;
      }
      return;
    }

    if (!desc || /^((grand |day )?total|cash details|should be sales|over\/short)/i.test(desc)) {
      return;
    }

    const date = parseExcelDate(o.date, baseYear);
    const cands = state.items.filter(x => String(x.desc).trim().toLowerCase() === desc.toLowerCase());
    const srp = o.srp !== undefined ? parseFloat(String(o.srp).replace(/[^0-9.-]/g, '')) : NaN;
    const it = (!isNaN(srp) && cands.find(x => num(x.srp) === srp)) || cands[0];

    if (!date || !it) {
      skip++;
      return;
    }

    curD = date;
    curF = fr;

    const nr: Row = {
      no: it.no,
      date,
      loc: state.inv,
      fr,
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
    };

    (['beg', 'del', 'wd', 'tf', 'itf', 'tt', 'itt', 'bad', 'end'] as const).forEach(k => {
      if (o[k] !== undefined) {
        const n = parseFloat(String(o[k]).replace(/,/g, ''));
        nr[k] = isNaN(n) ? '' : n;
      }
    });

    if (o.doc !== undefined) nr.doc = String(o.doc).trim();
    if (o.tfl) nr.tfl = String(o.tfl).trim();
    if (o.ttl) nr.ttl = String(o.ttl).trim();

    const exIndex = newRows.findIndex(
      x => x.loc === state.inv && x.date === date && x.fr === fr && x.no === it.no
    );

    if (exIndex >= 0) {
      newRows[exIndex] = { ...newRows[exIndex], ...nr };
      up++;
    } else {
      newRows.push(nr);
      add++;
    }
  });

  return {
    updated: up,
    added: add,
    skipped: skip,
    newRows,
    cashUpdates,
    cinfoUpdates
  };
}

// ----------------- SUMMARY EXPORT -----------------

export function exportSummaryRange(
  state: AppState,
  startDate: string,
  endDate: string,
  title: string
): void {
  const C = computeRows(state.rows, state.items);
  const ids = state.rows
    .map((r, i) => i)
    .filter(i => {
      const r = state.rows[i];
      return r.loc === state.inv && r.no !== '' && r.date >= startDate && r.date <= endDate;
    })
    .sort((x, y) => state.rows[x].date.localeCompare(state.rows[y].date) || x - y);

  const g: Record<number, number[]> = {};
  ids.forEach(i => {
    const no = state.rows[i].no as number;
    (g[no] = g[no] || []).push(i);
  });

  const lines = Object.keys(g).map(Number).sort((x, y) => x - y);
  const catOf = (no: number) => state.items.find(x => x.no === no)?.cat || 'Uncategorized';
  const cats: string[] = [];
  lines.forEach(no => {
    const c = catOf(no);
    if (!cats.includes(c)) cats.push(c);
  });
  cats.sort((x, y) => x.localeCompare(y));

  const SH = [
    'Item Description',
    'Beginning Inventory',
    'Deliveries',
    'Stock Withdrawal',
    'Transfer from',
    'Internal Transfer From (Price Changes)',
    'Transfer To',
    'Internal Transfer To (Price Changes)',
    'Bad Order',
    'Total Goods Available',
    'Ending Inventory',
    'Total Goods Sold',
    'SRP',
    'Total Sales',
    'Unit Cost',
    'Total Inventory Amount at Cost',
    'Total Net of VAT - Inventory',
    'Total Net of VAT - Beginning Inventory',
    'Total Net of VAT - Deliveries',
    'Total Stock Withdrawal',
    'Total Net of VAT - Transfers FROM',
    'Total Net of VAT - Transfers TO',
    'Total Net of VAT - Bad Order',
    'Total Net of VAT - Total Good Sold'
  ];

  const aoa: any[][] = [
    [title],
    [`${fd(startDate)} to ${fd(endDate)}  |  ${state.inv}`],
    [],
    SH
  ];

  let grandSales = 0;

  cats.forEach(cat => {
    aoa.push([cat]);
    const T = {
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
      sales: 0,
      invCost: 0,
      netVatInv: 0,
      netVatBeg: 0,
      netVatDel: 0,
      totStockWd: 0,
      netVatTf: 0,
      netVatTt: 0,
      netVatBad: 0,
      netVatSold: 0
    };

    const catLines = lines
      .filter(no => catOf(no) === cat)
      .sort((x, y) => {
        const dX = state.items.find(it => it.no === x)?.desc || '';
        const dY = state.items.find(it => it.no === y)?.desc || '';
        return dX.localeCompare(dY) || x - y;
      });

    catLines.forEach(no => {
      const rs = g[no];
      const sum = (col: keyof Row) => rs.reduce((t, i) => t + num(state.rows[i][col]), 0);
      const it = state.items.find(itemObj => itemObj.no === no);
      const beg = C[rs[0]].beg;
      const end = num(state.rows[rs[rs.length - 1]].end);
      const tg = beg + sum('del') + sum('tf') + sum('itf') - sum('tt') - sum('itt');
      const sold = tg - end;
      const srp = num(it?.srp);
      const sales = sold * srp;

      const del = sum('del');
      const wd = sum('wd');
      const tf = sum('tf');
      const itf = sum('itf');
      const tt = sum('tt');
      const itt = sum('itt');
      const bad = sum('bad');

      const uCost = it ? unitCost(it) : 0;
      const isVat = it?.vat !== 'NVAT';
      const calcNet = (qty: number) => (isVat ? (qty * uCost) / 1.12 : qty * uCost);

      const invCost = end * uCost;
      const netVatInv = calcNet(end);
      const netVatBeg = calcNet(beg);
      const netVatDel = calcNet(del);
      const totStockWd = wd * num(it?.wd);
      const netVatTf = calcNet(tf);
      const netVatTt = calcNet(tt);
      const netVatBad = calcNet(bad);
      const netVatSold = calcNet(sold);

      (['del', 'wd', 'tf', 'itf', 'tt', 'itt', 'bad'] as const).forEach(c => {
        T[c] += sum(c);
      });
      T.beg += beg;
      T.tg += tg;
      T.end += end;
      T.sold += sold;
      T.sales += sales;
      T.invCost += invCost;
      T.netVatInv += netVatInv;
      T.netVatBeg += netVatBeg;
      T.netVatDel += netVatDel;
      T.totStockWd += totStockWd;
      T.netVatTf += netVatTf;
      T.netVatTt += netVatTt;
      T.netVatBad += netVatBad;
      T.netVatSold += netVatSold;

      aoa.push([
        it?.desc || '',
        beg || '',
        del || '',
        wd || '',
        tf || '',
        itf || '',
        tt || '',
        itt || '',
        bad || '',
        tg || '',
        end || '',
        sold || '',
        srp,
        sales,
        uCost,
        invCost,
        netVatInv,
        netVatBeg,
        netVatDel,
        totStockWd,
        netVatTf,
        netVatTt,
        netVatBad,
        netVatSold
      ]);
    });

    grandSales += T.sales;
    aoa.push([
      'Total',
      T.beg || '',
      T.del || '',
      T.wd || '',
      T.tf || '',
      T.itf || '',
      T.tt || '',
      T.itt || '',
      T.bad || '',
      T.tg || '',
      T.end || '',
      T.sold || '',
      '',
      T.sales,
      '',
      T.invCost,
      T.netVatInv,
      T.netVatBeg,
      T.netVatDel,
      T.totStockWd,
      T.netVatTf,
      T.netVatTt,
      T.netVatBad,
      T.netVatSold
    ]);
    aoa.push([]);
  });

  // Cash Details
  const ks = Object.keys(state.cash).filter(k => {
    const { loc, date } = parseCashKey(k);
    return loc === state.inv && date >= startDate && date <= endDate && state.cash[k] !== '';
  });
  const totalCash = ks.reduce((t, k) => t + num(state.cash[k]), 0);

  aoa.push(
    ['Cash Details'],
    ['Should be Sales', grandSales],
    ['Cash on Hand', ks.length ? totalCash : ''],
    ['Over/Short', ks.length ? totalCash - grandSales : '']
  );

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [30, 11, 10, 11, 11, 14, 10, 14, 9, 12, 11, 11, 10, 12].map(w => ({ wch: w }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31));
  const cleanFilename = title.toLowerCase().replace(/\s+/g, '-') + '.xlsx';
  downloadWorkbook(wb, cleanFilename);
}

// ----------------- CASH DETAILS SUMMARY EXPORT -----------------

export function exportCashDetailsSummary(state: AppState): void {
  const weeksCount = getWeeksCount(state.start, state.cut);
  const C = computeRows(state.rows, state.items);

  const lines: Record<number, number[]> = {};
  state.rows.forEach((r, i) => {
    if (r.loc === state.inv && r.no !== '' && r.date) {
      (lines[r.no as number] = lines[r.no as number] || []).push(i);
    }
  });

  const cols: any[] = [];
  for (let k = 1; k <= weeksCount; k++) {
    const a = addDay(state.start, 7 * (k - 1));
    let b = addDay(a, 6);
    if (b > state.cut) b = state.cut;

    let beg = 0;
    let end = 0;
    Object.keys(lines).forEach(noStr => {
      const no = Number(noStr);
      const ids = lines[no];
      const it = state.items.find(x => x.no === no);
      const srp = num(it?.srp);
      const before = ids.filter(i => state.rows[i].date < a);
      const inW = ids.filter(i => state.rows[i].date >= a && state.rows[i].date <= b);
      const upto = ids.filter(i => state.rows[i].date <= b);

      const begQty = before.length
        ? num(state.rows[before[before.length - 1]].end)
        : inW.length
        ? C[inW[0]].beg
        : 0;
      beg += begQty * srp;

      const endQty = upto.length ? num(state.rows[upto[upto.length - 1]].end) : 0;
      end += endQty * srp;
    });

    const inR = state.rows.filter(r => r.loc === state.inv && r.no !== '' && r.date >= a && r.date <= b);
    const val = (f: keyof Row) =>
      inR.reduce((t, r) => {
        const it = state.items.find(x => x.no === r.no);
        return t + num(r[f]) * num(it?.srp);
      }, 0);

    const ks = Object.keys(state.cash).filter(q2 => {
      const { loc, date } = parseCashKey(q2);
      return loc === state.inv && date >= a && date <= b && state.cash[q2] !== '';
    });

    // range sales
    const g: Record<number, number[]> = {};
    state.rows.forEach((r, i) => {
      if (r.loc === state.inv && r.no !== '' && r.date >= a && r.date <= b) {
        (g[r.no as number] = g[r.no as number] || []).push(i);
      }
    });
    const weekSales = Object.keys(g).reduce((t, noStr) => {
      const no = Number(noStr);
      const rs = g[no].sort((x, y) => dcmp(state.rows[x].date, state.rows[y].date) || x - y);
      const sm = (c: keyof Row) => rs.reduce((q2, i) => q2 + num(state.rows[i][c]), 0);
      const tg = C[rs[0]].beg + sm('del') + sm('tf') + sm('itf') - sm('tt') - sm('itt');
      const sold = tg - num(state.rows[rs[rs.length - 1]].end);
      const it = state.items.find(x => x.no === no);
      return t + sold * num(it?.srp);
    }, 0);

    const weekCash = ks.reduce((t, q2) => t + num(state.cash[q2]), 0);
    const pay = num(state.cpay[`${state.inv}|${a}`]);

    cols.push({
      a,
      b,
      beg,
      del: val('del'),
      wd: val('wd'),
      tf: val('tf'),
      tt: val('tt'),
      bad: val('bad'),
      end,
      sales: weekSales,
      cash: weekCash,
      pay
    });
  }

  const T = (f: string) => cols.reduce((t, c) => t + (c[f] || 0), 0);
  const sum = {
    beg: cols.length ? cols[0].beg : 0,
    del: T('del'),
    wd: T('wd'),
    tf: T('tf'),
    tt: T('tt'),
    bad: T('bad'),
    end: cols.length ? cols[cols.length - 1].end : 0,
    sales: T('sales'),
    cash: T('cash'),
    pay: T('pay')
  };

  [...cols, sum].forEach(c => {
    const ta = c.beg + c.del + c.wd + c.tf;
    const td = c.tt + c.bad;
    const vr = c.cash - c.sales;
    c.d = { ta, td, net: ta - td, vr, bal: vr + c.pay };
  });

  const CROWS: [string, (c: any) => number][] = [
    ['Beginning Inventory', c => c.beg],
    ['Deliveries (+)', c => c.del],
    ['Stock Withdrawal (+)', c => c.wd],
    ['Transfer FROM (+)', c => c.tf],
    ['Total Available', c => c.d.ta],
    ['Transfer TO (-)', c => c.tt],
    ['Bad Order (-)', c => c.bad],
    ['Total to be deducted', c => c.d.td],
    ['Total Net Available Invty', c => c.d.net],
    ['Actual Ending Inventory', c => c.end],
    ['Should be - Sales', c => c.sales],
    ['Cash on Hand', c => c.cash],
    ['Variances (over/short)', c => c.d.vr]
  ];

  const all = [...cols, sum];
  const aoa: any[][] = [
    [state.inv],
    [`${fd(state.start)} to ${fd(state.cut)}`],
    [],
    ['', ...cols.map((_, i) => `Week ${i + 1}`), 'Summary'],
    ...CROWS.map(([l, f]) => [l, ...all.map(c => Math.round(f(c) * 100) / 100)]),
    ['Cashier Payment', ...all.map(c => c.pay)],
    ['Balance', ...all.map(c => Math.round(c.d.bal * 100) / 100)]
  ];

  // Over / Short model
  const salesMap: Record<string, number> = {};
  state.rows.forEach((r, i) => {
    if (r.loc === state.inv && r.no !== '' && r.date) {
      const k = `${r.date}|${r.fr === 'PM' ? 'PM' : 'AM'}`;
      salesMap[k] = (salesMap[k] || 0) + C[i].sales;
    }
  });

  const t0 = Date.parse(state.start + 'T00:00:00Z');
  const t1 = Date.parse(state.cut + 'T00:00:00Z');
  const osRows: { d: string; fr: 'AM' | 'PM'; os: number | null; cashier: string }[] = [];
  const osWeeks = Array.from({ length: weeksCount }, () => ({ over: 0, short: 0, n: 0 }));
  const osTot = { over: 0, short: 0, n: 0 };

  if (!isNaN(t0) && !isNaN(t1)) {
    for (let t = t0; t <= t1; t += 864e5) {
      const d = new Date(t).toISOString().slice(0, 10);
      const w = Math.floor((t - t0) / 864e5 / 7);
      (['AM', 'PM'] as const).forEach(fr => {
        const k = `${state.inv}|${d}${fr === 'PM' ? '|PM' : ''}`;
        const ck = state.cash[k];
        const has = ck !== undefined && ck !== '';
        const os = has ? Math.round((num(ck) - (salesMap[`${d}|${fr}`] || 0)) * 100) / 100 : null;
        const cashier = state.cinfo[k]?.cashier || '';
        osRows.push({ d, fr, os, cashier });
        if (has && osWeeks[w]) {
          [osWeeks[w], osTot].forEach(x => {
            x.n++;
            if (os !== null) {
              if (os > 0) x.over += os;
              else if (os < 0) x.short += os;
            }
          });
        }
      });
    }
  }

  const mx = Math.max(osRows.length, osWeeks.length + 1);
  aoa.push(
    [],
    ['Over/Short Breakdown', '', '', '', '', 'Summary'],
    ['Date', 'Shift', 'Over/Short', 'Cashier Name', '', 'Week', 'Over', 'Short']
  );

  for (let i = 0; i < mx; i++) {
    const a = osRows[i];
    const w = osWeeks[i];
    const r: any[] = a
      ? [a.fr === 'AM' ? fd(a.d) : '', a.fr, a.os ?? '', a.cashier, '']
      : ['', '', '', '', ''];
    if (w) {
      r.push(`Week ${i + 1}`, w.over || '', w.short || '');
    } else if (i === osWeeks.length) {
      r.push('Total', osTot.over || '', osTot.short || '');
    }
    aoa.push(r);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [28, ...Array(Math.max(cols.length + 1, 7)).fill({ wch: 15 })];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cash Details Summary');
  downloadWorkbook(wb, 'cash-details-summary.xlsx');
}

// ----------------- PROFIT AND LOSS EXPORT -----------------

export function exportProfitAndLoss(state: AppState): void {
  const weeksCount = getWeeksCount(state.start, state.cut);
  const periods: { label: string; a: string; b: string }[] = [];

  for (let k = 1; k <= weeksCount; k++) {
    const a = addDay(state.start, 7 * (k - 1));
    let b = addDay(a, 6);
    if (b > state.cut) b = state.cut;
    periods.push({ label: `Week ${k}`, a, b });
  }
  periods.push({ label: 'Monthly Summary', a: state.start, b: state.cut });

  const C = computeRows(state.rows, state.items);

  // Compute metrics for each period
  const pData = periods.map(p => {
    const cashKeys = Object.keys(state.cash).filter(k => {
      const { loc, date } = parseCashKey(k);
      return loc === state.inv && date >= p.a && date <= p.b && state.cash[k] !== '';
    });
    const cashDeposited = cashKeys.reduce((t, k) => t + num(state.cash[k]), 0);
    const salesNetOfVat = cashDeposited / 1.12;

    const rangeRowIndices = state.rows
      .map((r, i) => i)
      .filter(i => {
        const r = state.rows[i];
        return r.loc === state.inv && r.no !== '' && r.date >= p.a && r.date <= p.b;
      })
      .sort((x, y) => state.rows[x].date.localeCompare(state.rows[y].date) || x - y);

    const itemRowMap: Record<number, number[]> = {};
    rangeRowIndices.forEach(i => {
      const no = state.rows[i].no as number;
      (itemRowMap[no] = itemRowMap[no] || []).push(i);
    });

    let begNet = 0;
    let delNet = 0;
    let wdVal = 0;
    let tfNet = 0;
    let ttNet = 0;
    let badNet = 0;
    let totalCogs = 0;
    let grossSales = 0;

    let availQty = 0;
    let availCost = 0;
    let soldQty = 0;
    let soldCost = 0;
    let endQty = 0;
    let endCost = 0;

    Object.keys(itemRowMap).forEach(noStr => {
      const no = Number(noStr);
      const rs = itemRowMap[no];
      const sum = (field: keyof Row) => rs.reduce((t, i) => t + num(state.rows[i][field]), 0);
      const it = state.items.find(x => x.no === no);
      const uCost = it ? unitCost(it) : 0;
      const isVat = it?.vat !== 'NVAT';
      const calcNet = (q: number) => (isVat ? (q * uCost) / 1.12 : q * uCost);

      const beg = C[rs[0]].beg;
      const end = num(state.rows[rs[rs.length - 1]].end);
      const del = sum('del');
      const wd = sum('wd');
      const tf = sum('tf') + sum('itf');
      const tt = sum('tt') + sum('itt');
      const bad = sum('bad');
      const tg = beg + del + tf - tt;
      const sold = tg - end;
      const srp = num(it?.srp);

      begNet += calcNet(beg);
      delNet += calcNet(del);
      wdVal += wd * num(it?.wd);
      tfNet += calcNet(tf);
      ttNet += calcNet(tt);
      badNet += calcNet(bad);

      const itemCogs = sold * uCost;
      totalCogs += itemCogs;
      grossSales += sold * srp;

      availQty += tg;
      availCost += tg * uCost;
      soldQty += sold;
      soldCost += itemCogs;

      endQty += end;
      endCost += end * uCost;
    });

    const availNet = begNet + delNet + wdVal + tfNet - (ttNet + badNet);
    const grossIncome = salesNetOfVat - totalCogs;
    const shouldBeQty = availQty - soldQty;
    const shouldBeCost = availCost - soldCost;
    const varQty = shouldBeQty - endQty;
    const varCost = shouldBeCost - endCost;
    const shortOver = cashDeposited - grossSales;

    return {
      label: p.label,
      range: `${fd(p.a)} - ${fd(p.b)}`,
      cashDeposited,
      salesNetOfVat,
      totalCogs,
      begNet,
      delNet,
      wdVal,
      tfNet,
      ttNet,
      badNet,
      availNet,
      grossIncome,
      availQty,
      availCost,
      soldQty,
      soldCost,
      shouldBeQty,
      shouldBeCost,
      endQty,
      endCost,
      varQty,
      varCost,
      grossSales,
      shortOver
    };
  });

  const headers = ['Financial Metric / Account', ...pData.map(d => d.label)];
  const dateSubHeaders = ['Period Range', ...pData.map(d => d.range)];

  const aoa: any[][] = [
    ['PROFIT AND LOSS STATEMENT'],
    ['Branch Location:', state.inv],
    ['Period Covered:', `${fd(state.start)} to ${fd(state.cut)}`],
    [],
    headers,
    dateSubHeaders,
    ['1. PROFIT AND LOSS STATEMENT'],
    ['Sales - Net of Vat', ...pData.map(d => d.salesNetOfVat)],
    ['Cost of Goods Sold', ...pData.map(d => d.totalCogs)],
    ['Beginning Inventory', ...pData.map(d => d.begNet)],
    ['  Delivery', ...pData.map(d => d.delNet)],
    ['  Stock withdrawal', ...pData.map(d => d.wdVal)],
    ['  Transfer FROM', ...pData.map(d => d.tfNet)],
    ['  Transfers TO', ...pData.map(d => d.ttNet)],
    ['  Bad Order', ...pData.map(d => d.badNet)],
    ['Available (Net of VAT)', ...pData.map(d => d.availNet)],
    ['Total Cogs', ...pData.map(d => d.totalCogs)],
    ['Gross Income', ...pData.map(d => d.grossIncome)],
    [],
    ['2. BEGINNING INVENTORY (@COST) RECONCILIATION'],
    ['Available - Qty', ...pData.map(d => d.availQty)],
    ['Available - Amount (@Cost)', ...pData.map(d => d.availCost)],
    ['Qty Sold - Qty', ...pData.map(d => d.soldQty)],
    ['Qty Sold - Amount (@Cost)', ...pData.map(d => d.soldCost)],
    ['Should be Inventory - Qty', ...pData.map(d => d.shouldBeQty)],
    ['Should be Inventory - Amount (@Cost)', ...pData.map(d => d.shouldBeCost)],
    ['Actual Ending Inventory - Qty', ...pData.map(d => d.endQty)],
    ['Actual Ending Inventory - Amount (@Cost)', ...pData.map(d => d.endCost)],
    ['Variance - Qty', ...pData.map(d => d.varQty)],
    ['Variance - Amount (@Cost)', ...pData.map(d => d.varCost)],
    [],
    ['3. CASH VARIANCE'],
    ['Cash Deposited', ...pData.map(d => d.cashDeposited)],
    ['Gross Sales (Should be Sales)', ...pData.map(d => d.grossSales)],
    ['Short / Over', ...pData.map(d => d.shortOver)]
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 38 }, ...Array(pData.length).fill({ wch: 18 })];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Profit & Loss');
  downloadWorkbook(wb, `Profit_and_Loss_${state.inv.replace(/\s+/g, '_')}_${state.start}.xlsx`);
}

// ----------------- TRANSFER FROM EXPORT -----------------

export function exportTransferFromData(
  state: AppState,
  startDate: string,
  endDate: string,
  locations: string[]
): void {
  // Filter active location rows
  const activeRows = state.rows.filter(
    r => r.loc === state.inv && r.no !== '' && r.date >= startDate && r.date <= endDate
  );

  // Group transfer quantities by item and source location (supports multi-location breakdown)
  const itemQtyMap: Record<number, Record<string, number>> = {};
  activeRows.forEach(r => {
    const no = r.no as number;
    if (!itemQtyMap[no]) itemQtyMap[no] = {};
    const parsed = parseTransferLocations(r.tfl, r.tf_locs, r.tf);
    if (parsed.length > 0) {
      parsed.forEach(({ loc, qty }) => {
        if (qty > 0) {
          itemQtyMap[no][loc] = (itemQtyMap[no][loc] || 0) + qty;
        }
      });
    } else {
      const qty = num(r.tf);
      if (qty > 0) {
        const srcLoc = (r.tfl || 'Unspecified').trim();
        itemQtyMap[no][srcLoc] = (itemQtyMap[no][srcLoc] || 0) + qty;
      }
    }
  });

  // Extract categories
  const catSet = new Set<string>();
  state.items.forEach(it => {
    if (it.cat) catSet.add(it.cat);
  });
  const cats = Array.from(catSet).sort((a, b) => a.localeCompare(b));

  // Sheet 1: Quantity by Category
  const qtyHeader = ['Item Description', ...locations];
  const qtyAoa: any[][] = [
    ['TRANSFER FROM — QUANTITY BY LOCATION MATRIX'],
    [`Branch: ${state.inv}  |  Period: ${fd(startDate)} to ${fd(endDate)}`],
    []
  ];

  const grandColTotalsQty: Record<string, number> = {};
  locations.forEach(l => { grandColTotalsQty[l] = 0; });

  cats.forEach(cat => {
    const catItems = state.items
      .filter(it => it.cat === cat)
      .sort((a, b) => a.desc.localeCompare(b.desc) || a.no - b.no);

    if (catItems.length === 0) return;

    qtyAoa.push([`CATEGORY: ${cat.toUpperCase()}`]);
    qtyAoa.push(qtyHeader);

    const catTotalsQty: Record<string, number> = {};
    locations.forEach(l => { catTotalsQty[l] = 0; });

    catItems.forEach(it => {
      const rowQtys = itemQtyMap[it.no] || {};
      const locValues = locations.map(l => {
        const v = rowQtys[l] || 0;
        catTotalsQty[l] = (catTotalsQty[l] || 0) + v;
        grandColTotalsQty[l] = (grandColTotalsQty[l] || 0) + v;
        return v === 0 ? '' : v;
      });
      qtyAoa.push([it.desc, ...locValues]);
    });

    qtyAoa.push(['Total', ...locations.map(l => (catTotalsQty[l] === 0 ? '' : catTotalsQty[l]))]);
    qtyAoa.push([]);
  });

  qtyAoa.push(['GRAND TOTAL', ...locations.map(l => (grandColTotalsQty[l] === 0 ? '' : grandColTotalsQty[l]))]);

  // Sheet 2: Net of VAT Cost by Category
  const costHeader = ['Item Description', ...locations];
  const costAoa: any[][] = [
    ['TRANSFER FROM — NET OF VAT COST MATRIX (PICKED UP IN MONTHLY SUMMARY)'],
    [`Branch: ${state.inv}  |  Period: ${fd(startDate)} to ${fd(endDate)}`],
    []
  ];

  const grandColTotalsCost: Record<string, number> = {};
  locations.forEach(l => { grandColTotalsCost[l] = 0; });

  cats.forEach(cat => {
    const catItems = state.items
      .filter(it => it.cat === cat)
      .sort((a, b) => a.desc.localeCompare(b.desc) || a.no - b.no);

    if (catItems.length === 0) return;

    costAoa.push([`CATEGORY: ${cat.toUpperCase()}`]);
    costAoa.push(costHeader);

    const catTotalsCost: Record<string, number> = {};
    locations.forEach(l => { catTotalsCost[l] = 0; });

    catItems.forEach(it => {
      const rowQtys = itemQtyMap[it.no] || {};
      const uCost = unitCost(it);
      const isVat = it.vat !== 'NVAT';
      const calcNet = (qty: number) => (isVat ? (qty * uCost) / 1.12 : qty * uCost);

      const locCostValues = locations.map(l => {
        const qVal = rowQtys[l] || 0;
        const c = calcNet(qVal);
        catTotalsCost[l] = (catTotalsCost[l] || 0) + c;
        grandColTotalsCost[l] = (grandColTotalsCost[l] || 0) + c;
        return c === 0 ? '' : Number(c.toFixed(2));
      });

      costAoa.push([it.desc, ...locCostValues]);
    });

    costAoa.push(['Total Net of VAT Cost', ...locations.map(l => (catTotalsCost[l] === 0 ? '' : Number(catTotalsCost[l].toFixed(2))))]);
    costAoa.push([]);
  });

  costAoa.push(['GRAND TOTAL NET OF VAT COST', ...locations.map(l => (grandColTotalsCost[l] === 0 ? '' : Number(grandColTotalsCost[l].toFixed(2))))]);

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(qtyAoa);
  const ws2 = XLSX.utils.aoa_to_sheet(costAoa);

  ws1['!cols'] = [{ wch: 32 }, ...locations.map(() => ({ wch: 20 }))];
  ws2['!cols'] = [{ wch: 32 }, ...locations.map(() => ({ wch: 20 }))];

  XLSX.utils.book_append_sheet(wb, ws1, 'Transfer From (Qty)');
  XLSX.utils.book_append_sheet(wb, ws2, 'Transfer From (Net Cost)');

  downloadWorkbook(wb, `Transfer_From_${state.inv.replace(/\s+/g, '_')}_${startDate}_to_${endDate}.xlsx`);
}

// ----------------- TRANSFER TO EXPORT -----------------

export function exportTransferToData(
  state: AppState,
  startDate: string,
  endDate: string,
  locations: string[]
): void {
  // Filter active location rows
  const activeRows = state.rows.filter(
    r => r.loc === state.inv && r.no !== '' && r.date >= startDate && r.date <= endDate
  );

  // Group transfer to quantities by item and destination location, plus bad order
  const itemQtyMap: Record<number, Record<string, number>> = {};
  const itemBadMap: Record<number, number> = {};

  activeRows.forEach(r => {
    const no = r.no as number;
    const badQty = num(r.bad);
    if (!itemQtyMap[no]) itemQtyMap[no] = {};

    const parsed = parseTransferLocations(r.ttl, r.tt_locs, r.tt);
    if (parsed.length > 0) {
      parsed.forEach(({ loc, qty }) => {
        if (qty > 0) {
          itemQtyMap[no][loc] = (itemQtyMap[no][loc] || 0) + qty;
        }
      });
    } else {
      const ttQty = num(r.tt);
      if (ttQty > 0) {
        const destLoc = (r.ttl || 'Unspecified').trim();
        itemQtyMap[no][destLoc] = (itemQtyMap[no][destLoc] || 0) + ttQty;
      }
    }

    if (badQty > 0) {
      itemBadMap[no] = (itemBadMap[no] || 0) + badQty;
    }
  });

  // Extract categories
  const catSet = new Set<string>();
  state.items.forEach(it => {
    if (it.cat) catSet.add(it.cat);
  });
  const cats = Array.from(catSet).sort((a, b) => a.localeCompare(b));

  // Sheet 1: Quantity by Category with Bad Order in last column
  const qtyHeader = ['Item Description', ...locations, 'Bad Order'];
  const qtyAoa: any[][] = [
    ['TRANSFER TO & BAD ORDER — QUANTITY BY LOCATION MATRIX'],
    [`Branch: ${state.inv}  |  Period: ${fd(startDate)} to ${fd(endDate)}`],
    []
  ];

  const grandColTotalsQty: Record<string, number> = {};
  locations.forEach(l => { grandColTotalsQty[l] = 0; });
  let grandTotalBadQty = 0;

  cats.forEach(cat => {
    const catItems = state.items
      .filter(it => it.cat === cat)
      .sort((a, b) => a.desc.localeCompare(b.desc) || a.no - b.no);

    if (catItems.length === 0) return;

    qtyAoa.push([`CATEGORY: ${cat.toUpperCase()}`]);
    qtyAoa.push(qtyHeader);

    const catTotalsQty: Record<string, number> = {};
    locations.forEach(l => { catTotalsQty[l] = 0; });
    let catBadQty = 0;

    catItems.forEach(it => {
      const rowQtys = itemQtyMap[it.no] || {};
      const badQ = itemBadMap[it.no] || 0;
      catBadQty += badQ;
      grandTotalBadQty += badQ;

      const locValues = locations.map(l => {
        const v = rowQtys[l] || 0;
        catTotalsQty[l] = (catTotalsQty[l] || 0) + v;
        grandColTotalsQty[l] = (grandColTotalsQty[l] || 0) + v;
        return v === 0 ? '' : v;
      });
      qtyAoa.push([it.desc, ...locValues, badQ === 0 ? '' : badQ]);
    });

    qtyAoa.push(['Total', ...locations.map(l => (catTotalsQty[l] === 0 ? '' : catTotalsQty[l])), catBadQty === 0 ? '' : catBadQty]);
    qtyAoa.push([]);
  });

  qtyAoa.push(['GRAND TOTAL', ...locations.map(l => (grandColTotalsQty[l] === 0 ? '' : grandColTotalsQty[l])), grandTotalBadQty === 0 ? '' : grandTotalBadQty]);

  // Sheet 2: Net of VAT Cost by Category with Bad Order in last column
  const costHeader = ['Item Description', ...locations, 'Bad Order'];
  const costAoa: any[][] = [
    ['TRANSFER TO & BAD ORDER — NET OF VAT COST MATRIX (PICKED UP IN MONTHLY SUMMARY)'],
    [`Branch: ${state.inv}  |  Period: ${fd(startDate)} to ${fd(endDate)}`],
    []
  ];

  const grandColTotalsCost: Record<string, number> = {};
  locations.forEach(l => { grandColTotalsCost[l] = 0; });
  let grandTotalBadCost = 0;

  cats.forEach(cat => {
    const catItems = state.items
      .filter(it => it.cat === cat)
      .sort((a, b) => a.desc.localeCompare(b.desc) || a.no - b.no);

    if (catItems.length === 0) return;

    costAoa.push([`CATEGORY: ${cat.toUpperCase()}`]);
    costAoa.push(costHeader);

    const catTotalsCost: Record<string, number> = {};
    locations.forEach(l => { catTotalsCost[l] = 0; });
    let catBadCost = 0;

    catItems.forEach(it => {
      const rowQtys = itemQtyMap[it.no] || {};
      const badQ = itemBadMap[it.no] || 0;
      const uCost = unitCost(it);
      const isVat = it.vat !== 'NVAT';
      const calcNet = (qty: number) => (isVat ? (qty * uCost) / 1.12 : qty * uCost);

      const locCostValues = locations.map(l => {
        const qVal = rowQtys[l] || 0;
        const c = calcNet(qVal);
        catTotalsCost[l] = (catTotalsCost[l] || 0) + c;
        grandColTotalsCost[l] = (grandColTotalsCost[l] || 0) + c;
        return c === 0 ? '' : Number(c.toFixed(2));
      });

      const badCost = calcNet(badQ);
      catBadCost += badCost;
      grandTotalBadCost += badCost;

      costAoa.push([it.desc, ...locCostValues, badCost === 0 ? '' : Number(badCost.toFixed(2))]);
    });

    costAoa.push([
      'Total Net of VAT Cost',
      ...locations.map(l => (catTotalsCost[l] === 0 ? '' : Number(catTotalsCost[l].toFixed(2)))),
      catBadCost === 0 ? '' : Number(catBadCost.toFixed(2))
    ]);
    costAoa.push([]);
  });

  costAoa.push([
    'GRAND TOTAL NET OF VAT COST',
    ...locations.map(l => (grandColTotalsCost[l] === 0 ? '' : Number(grandColTotalsCost[l].toFixed(2)))),
    Number(grandTotalBadCost.toFixed(2))
  ]);

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(qtyAoa);
  const ws2 = XLSX.utils.aoa_to_sheet(costAoa);

  ws1['!cols'] = [{ wch: 32 }, ...locations.map(() => ({ wch: 20 })), { wch: 20 }];
  ws2['!cols'] = [{ wch: 32 }, ...locations.map(() => ({ wch: 20 })), { wch: 20 }];

  XLSX.utils.book_append_sheet(wb, ws1, 'Transfer To (Qty)');
  XLSX.utils.book_append_sheet(wb, ws2, 'Transfer To (Net Cost)');

  downloadWorkbook(wb, `Transfer_To_${state.inv.replace(/\s+/g, '_')}_${startDate}_to_${endDate}.xlsx`);
}

// ----------------- ITEMS SOLD OUT SUMMARY EXPORT -----------------

export interface SoldOutExportItem {
  no: number;
  code: string;
  desc: string;
  cat: string;
  weeklyQty: number[];
  monthlySummary: number;
  monthlyAverage: number;
}

export interface SoldOutWeekDef {
  weekNum: number;
  label: string;
  startDate: string;
  endDate: string;
}

export function exportItemsSoldOutSummary(
  items: SoldOutExportItem[],
  weeks: SoldOutWeekDef[],
  loc: string,
  startDate: string,
  endDate: string
): void {
  const aoa: any[][] = [];

  // Title section
  aoa.push(['CANDY STORE & TAKEHOME']);
  aoa.push(['ITEMS SOLD OUT SUMMARY']);
  aoa.push([`Branch Location: ${loc}`]);
  aoa.push([`Accounting Period: ${fd(startDate)} to ${fd(endDate)} (${weeks.length} Weeks)`]);
  aoa.push([]);

  // Table Headers
  const headerRow = [
    'Line No.',
    'Item Code',
    'Item Description',
    'Category',
    ...weeks.map(w => `${w.label} (${fd(w.startDate)} - ${fd(w.endDate)})`),
    'Monthly Summary',
    'Monthly Average'
  ];
  aoa.push(headerRow);

  // Totals accumulators
  const weekTotals = new Array(weeks.length).fill(0);
  let grandMonthlySummary = 0;

  items.forEach((it, idx) => {
    it.weeklyQty.forEach((q, wIdx) => {
      weekTotals[wIdx] += q;
    });
    grandMonthlySummary += it.monthlySummary;

    aoa.push([
      idx + 1,
      it.code,
      it.desc,
      it.cat,
      ...it.weeklyQty.map(q => (q === 0 ? '' : q)),
      it.monthlySummary === 0 ? '' : it.monthlySummary,
      it.monthlyAverage === 0 ? '' : Number(it.monthlyAverage.toFixed(2))
    ]);
  });

  const grandMonthlyAverage = weeks.length > 0 ? grandMonthlySummary / weeks.length : 0;

  // Grand Total Row
  aoa.push([]);
  aoa.push([
    'TOTAL',
    '',
    'GRAND TOTAL QUANTITY SOLD OUT',
    '',
    ...weekTotals.map(t => (t === 0 ? '' : t)),
    grandMonthlySummary === 0 ? '' : grandMonthlySummary,
    grandMonthlyAverage === 0 ? '' : Number(grandMonthlyAverage.toFixed(2))
  ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 10 },
    { wch: 14 },
    { wch: 36 },
    { wch: 18 },
    ...weeks.map(() => ({ wch: 22 })),
    { wch: 18 },
    { wch: 18 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sold Out Summary');
  const filename = `Items_Sold_Out_Summary_${loc.replace(/\s+/g, '_')}_${startDate}_to_${endDate}.xlsx`;
  downloadWorkbook(wb, filename);
}

