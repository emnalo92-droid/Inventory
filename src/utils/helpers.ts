import { AppState, Item, Row, RowComputed, User, LogEntry, CellNote } from '../types';

export const KEY = 'inv_ledger_v1';
export const V = 6;
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const num = (v: any): number => {
  const n = parseFloat(String(v ?? ''));
  return isNaN(n) ? 0 : n;
};

export const f2 = (v: any): string => {
  return num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const acct = (v: any): string => {
  const n = num(v);
  if (n === 0) return '-';
  if (n < 0) return '-' + f2(-n);
  return f2(n);
};

export const acp = (v: any): string => {
  const n = Math.round(num(v) * 100) / 100;
  if (n === 0) return '-';
  if (n < 0) return `(${f2(-n)})`;
  return f2(n);
};

export const q = (v: any): string => {
  const n = num(v);
  return n === 0 ? '' : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
};

export const raw = (v: any): string | number => {
  return num(v) === 0 ? '' : v;
};

/**
 * Safely evaluates arithmetic expressions (e.g. "=10+5", "=20*3-5", "=(10+5)*2").
 * Supports addition (+), subtraction (-), multiplication (*), division (/), decimals and parentheses.
 * Returns null if the expression is invalid or incomplete.
 */
export function evaluateFormula(expr: any): number | null {
  if (expr === null || expr === undefined) return null;
  const str = String(expr).trim();
  if (!str) return null;

  let clean = str;
  if (clean.startsWith('=')) {
    clean = clean.slice(1).trim();
  } else if (!clean.includes('+') && !clean.includes('-') && !clean.includes('*') && !clean.includes('/')) {
    const n = parseFloat(clean.replace(/,/g, ''));
    return isNaN(n) ? null : n;
  }

  if (!clean) return null;
  if (!/^[0-9+\-*\/().\s]+$/.test(clean)) return null;

  try {
    const tokens = clean.match(/(\d+\.?\d*|\.\d+|[-+*\/()])/g);
    if (!tokens) return null;

    const output: (number | string)[] = [];
    const ops: string[] = [];
    const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };

    const isNum = (t: string) => /^(\d+\.?\d*|\.\d+)$/.test(t);

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (isNum(tok)) {
        output.push(parseFloat(tok));
      } else if (tok === '(') {
        ops.push(tok);
      } else if (tok === ')') {
        while (ops.length && ops[ops.length - 1] !== '(') {
          output.push(ops.pop()!);
        }
        ops.pop();
      } else if (['+', '-', '*', '/'].includes(tok)) {
        if (tok === '-' && (i === 0 || ['+', '-', '*', '/', '('].includes(tokens[i - 1]))) {
          if (i + 1 < tokens.length && isNum(tokens[i + 1])) {
            output.push(-parseFloat(tokens[i + 1]));
            i++;
            continue;
          }
        }
        while (ops.length && prec[ops[ops.length - 1]] >= prec[tok]) {
          output.push(ops.pop()!);
        }
        ops.push(tok);
      }
    }
    while (ops.length) {
      output.push(ops.pop()!);
    }

    const stack: number[] = [];
    for (const item of output) {
      if (typeof item === 'number') {
        stack.push(item);
      } else {
        const b = stack.pop();
        const a = stack.pop();
        if (a === undefined || b === undefined) return null;
        if (item === '+') stack.push(a + b);
        else if (item === '-') stack.push(a - b);
        else if (item === '*') stack.push(a * b);
        else if (item === '/') stack.push(b === 0 ? 0 : a / b);
      }
    }
    if (stack.length !== 1 || isNaN(stack[0])) return null;
    return Math.round(stack[0] * 10000) / 10000;
  } catch {
    return null;
  }
}

export const fd = (d: string): string => {
  if (!d || d.length < 10) return '';
  const day = +d.slice(8);
  const mo = MON[+d.slice(5, 7) - 1];
  const yr = d.slice(2, 4);
  return `${day}-${mo}-${yr}`;
};

export const addDay = (d: string, n: number): string => {
  const t = new Date(d + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

export const today = (): string => new Date().toISOString().slice(0, 10);

export const dcmp = (a?: string, b?: string): number => {
  const x = a || '~';
  const y = b || '~';
  return x < y ? -1 : x > y ? 1 : 0;
};

export const fo = (r: Row): number => (r.fr === 'PM' ? 1 : 0);

export const rnd = (): string => {
  try {
    return [...crypto.getRandomValues(new Uint8Array(8))]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return Math.random().toString(36).slice(2);
  }
};

export async function sha256(text: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // Fallback if subtle crypto isn't available
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return 'fallback_' + Math.abs(hash).toString(16);
  }
}

export const unitCost = (it: Item): number => {
  return num(it.cv) > 0 ? num(it.deliv) / num(it.cv) : 0;
};

export const createInitialItem = (
  no: number,
  code: string,
  sys: string,
  desc: string,
  cat: string,
  srp: number,
  deliv: number,
  conv: number,
  wd: number
): Item => ({
  no,
  code,
  sys,
  desc,
  cat,
  srp,
  loc: 'Pastry',
  vat: 'VAT',
  deliv,
  conv,
  wd,
  cv: 1
});

export const createInitialRow = (no: number | '', date: string, o?: Partial<Row>): Row => ({
  no,
  date,
  loc: 'Commissary Takehome',
  fr: 'AM',
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
  end: '',
  ...o
});

// Exception locations where items with ending inventory carry over directly to next date AM, NOT to PM shift
export const PM_CARRYOVER_EXCEPTION_LOCATIONS: string[] = [
  'Torres Tech Takehome',
  'Commissary Takehome',
  'Logistics Takehome',
  'Malvar Takehome',
  'Cabrini - Takehome & Candy Store',
  'Foodhub - Snacks, Peter Panlaman, Palamig Painit',
  'Zentrum - Takehome & Candy Store'
];

export function isPmCarryoverExceptionLocation(loc: string | undefined | null): boolean {
  if (!loc) return false;
  const target = loc.trim().toLowerCase();
  return PM_CARRYOVER_EXCEPTION_LOCATIONS.some(exc => {
    const excLower = exc.toLowerCase();
    return (
      target === excLower ||
      target.replace(/\s+/g, ' ') === excLower.replace(/\s+/g, ' ') ||
      (target.includes('torres') && target.includes('takehome')) ||
      (target.includes('commissary') && target.includes('takehome')) ||
      (target.includes('logistics') && target.includes('takehome')) ||
      (target.includes('malvar') && target.includes('takehome')) ||
      (target.includes('cabrini') && (target.includes('candy') || target.includes('takehome'))) ||
      (target.includes('foodhub') && (target.includes('peter') || target.includes('snacks') || target.includes('palamig'))) ||
      (target.includes('zentrum') && (target.includes('candy') || target.includes('takehome')))
    );
  });
}

export const DEFAULT_LOCS: string[] = [
  'Torres Tech Takehome',
  'Commissary Takehome',
  'Logistics Takehome',
  'Malvar Takehome',
  'YTMI Takehome',
  'YTP Takehome',
  'Cabrini - Takehome & Candy Store',
  'Foodhub - Snacks, Peter Panlaman, Palamig Painit',
  'Zentrum - Takehome & Candy Store'
];

export function ensureLocations(existingLocs: string[] = []): string[] {
  const set = new Set<string>();
  const result: string[] = [];
  (existingLocs || []).forEach(l => {
    if (l && typeof l === 'string' && l.trim()) {
      const clean = l.trim();
      if (!set.has(clean)) {
        set.add(clean);
        result.push(clean);
      }
    }
  });
  DEFAULT_LOCS.forEach(l => {
    if (!set.has(l)) {
      set.add(l);
      result.push(l);
    }
  });
  return result;
}

export const getSeedState = (): AppState => ({
  v: V,
  log: [],
  locs: DEFAULT_LOCS,
  inv: 'Commissary Takehome',
  start: '2026-10-05',
  cut: '2026-10-31',
  items: [
    createInitialItem(1, 'FGPS00005', 'Pastry Bread - Asado Roll', 'Asado Roll', 'Breads', 10, 5, 5, 3.5),
    createInitialItem(2, 'FGBC00054', 'Pastry Bread - Cheese Custard Cupcake', 'Cheese Custard Cupcake', 'Cakes', 15, 8, 8, 6),
    createInitialItem(3, 'FGPS00005', 'Pastry Bread - Asado Roll', 'Asado Roll', 'Breads', 20, 5, 5, 3.5),
    createInitialItem(4, 'FGBC00054', 'Pastry Bread - Cheese Custard Cupcake', 'Cheese Custard Cupcake', 'Cakes', 25, 8, 8, 6)
  ],
  rows: [
    createInitialRow(1, '2026-10-05', { beg: 25, del: 15, wd: 5, tf: 2, tfl: 'YTMI Takehome', tt: 2, ttl: 'Logistics Takehome', bad: 5, end: 38 }),
    createInitialRow(1, '2026-10-06', { end: 36 }),
    createInitialRow(1, '2026-10-07', { end: 30 }),
    createInitialRow(1, '2026-10-08', { itt: 30 }),
    createInitialRow(2, '2026-10-12', { beg: 10, del: 25, wd: 5, tf: 2, tfl: 'YTP Takehome', tt: 2, ttl: 'Commissary Takehome', bad: 8, end: 30 }),
    createInitialRow(2, '2026-10-13', { end: 27 }),
    createInitialRow(2, '2026-10-14', { end: 23 }),
    createInitialRow(2, '2026-10-15', { itt: 23 }),
    createInitialRow(3, '2026-10-16', { itf: 30, end: 30 }),
    createInitialRow(4, '2026-10-16', { itf: 23, end: 23 })
  ].map(r => ({ ...r, loc: 'Commissary Takehome' })),
  cash: {},
  cashiers: ['Lica Cudiamat', 'Marlyn Maruya', 'Godelyn Roncales'],
  cinfo: {},
  cpay: {},
  users: SEED_USERS,
  notes: {}
});

export const SEED_USERS: User[] = [
  {
    id: 1,
    name: 'Ervin Nalo',
    all: true,
    locs: [],
    acc: ['All'],
    res: [],
    user: 'enalo',
    email: 'em.nalo92@gmail.com',
    isOwner: true,
    role: 'Owner',
    salt: '4a5954c9de285fd9',
    hash: '3bb5f126e581d804065e179f997c3389776ffe5833087d0766a24a8812e7c5bd'
  },
  {
    id: 2,
    name: 'Railyn Perin',
    all: false,
    locs: ['Foodhub - Snacks, Peter Panlaman, Palamig Painit'],
    acc: ['All'],
    res: ['Restrict Profit and Loss', 'Restrict User Access', 'Restrict Google Drive'],
    user: 'rperin',
    salt: 'inv-rperin-c91d40e8',
    hash: 'f6c732ca58c6bfff91f4f56609587599b85be02f11a8e481c1f078eb57eff6a0'
  },
  {
    id: 3,
    name: 'Jennalyn Martinez',
    all: true,
    locs: [],
    acc: ['View Only'],
    res: ['Restrict User Access', 'Restrict Google Drive'],
    user: 'jmartinez',
    salt: 'inv-jmartinez-5be2a7d1',
    hash: 'b0c47e49a5b96df506d905eacba8ace97ea4c7bbe69e1f812d38ebf333f062e9'
  },
  {
    id: 4,
    name: 'Mikay Bruzula',
    all: false,
    locs: ['Zentrum - Takehome & Candy Store'],
    acc: ['All'],
    res: ['Restrict User Access', 'Restrict Google Drive'],
    user: 'mbruzula',
    salt: 'e76c1cacf9d77466',
    hash: 'a6d2f348ae7e96721d251fe587a3351c116d928f68f06a8a80a43f7f6c68e4ff'
  },
  {
    id: 5,
    name: 'Melanie Guanzon',
    all: false,
    locs: ['Cabrini - Takehome & Candy Store', 'Zentrum - Takehome & Candy Store'],
    acc: ['All'],
    res: ['Restrict Profit and Loss', 'Restrict User Access', 'Restrict Google Drive'],
    user: 'mguanzon',
    salt: '24460e4abfc18609',
    hash: '1b0159078fd328de40057d6a1312bc3c0c5db1663580a4b13f1912ffa75e255f'
  },
  {
    id: 6,
    name: 'Arlene Peligones',
    all: false,
    locs: ['Torres Tech Candy Store', 'YTPLC Candy Store', 'Malvar Candy Store', 'Logistics Candy Store', 'Commissary Candy Store', 'Malvar Takehome', 'Logistics Takehome', 'Commissary Takehome', 'Torres Tech Takehome', 'YTPLC Takehome'],
    acc: ['All'],
    res: ['Restrict Profit and Loss', 'Restrict User Access', 'Restrict Google Drive'],
    user: 'apeligones',
    salt: 'c3593e45132c35b6',
    hash: 'fd00bef3244211df41365550cebc632eb03fe25a11f9fd2123293e266fe226db'
  },
  {
    id: 7,
    name: 'Markjoey Juaton',
    all: false,
    locs: ['Rest Area Candy Store'],
    acc: ['All'],
    res: ['Restrict Profit and Loss', 'Restrict User Access', 'Restrict Google Drive'],
    user: 'mjuaton',
    salt: '7f5e1be8b9026fb7',
    hash: '0e8c73e1391d61e68b98d78383d0c59a2dfc5ee8bf76c3780007fc007c345dc7'
  },
  {
    id: 8,
    name: 'Jhona Bermudez',
    all: false,
    locs: ['YTMI Takehome', 'YTP Takehome', 'YTMI Candy Store', 'YTP Candy Store'],
    acc: ['All'],
    res: ['Restrict Profit and Loss', 'Restrict User Access', 'Restrict Google Drive'],
    user: 'jbermudez',
    salt: '47737daca0b7e653',
    hash: '8b89dd29467e768037f1f97c218020df9d1b97e358d15589c485bd026759832e'
  },
  {
    id: 9,
    name: 'Apol Dimaano',
    all: true,
    locs: [],
    acc: ['View Only', 'Inventory Location', 'Cut Off Date', 'Start Date'],
    res: ['Restrict User Access', 'Restrict Google Drive', 'Restrict Profit and Loss'],
    user: 'adimaano',
    salt: '68570489216d67b1',
    hash: '773ce1109418fa74f4bf25ac6297d9d0fe8ee6f4d6fdb1cde333760df7f6b82f'
  },
  {
    id: 10,
    name: 'Roselle Gunnacao',
    all: true,
    locs: [],
    acc: ['All'],
    res: ['Restrict Profit and Loss', 'Restrict Google Drive', 'Restrict User Access'],
    user: 'rgunnacao',
    salt: 'f0488528baee1868',
    hash: 'b19d72f99c3603609915d768233eb40faaa0e28aabcf2d415c5412b4ef0c81c3'
  }
];

export function ensureTenUsers(existingUsers: User[] = []): User[] {
  if (Array.isArray(existingUsers) && existingUsers.length > 0) {
    const updated = existingUsers.map(u => {
      if (
        u.id === 1 ||
        u.user === 'enalo' ||
        u.user === 'admin' ||
        (u.email && u.email.toLowerCase() === 'em.nalo92@gmail.com') ||
        u.isOwner
      ) {
        return {
          ...u,
          name: u.name || 'Ervin Nalo',
          all: true,
          locs: [],
          acc: ['All'],
          res: [],
          user: u.user || 'enalo',
          email: 'em.nalo92@gmail.com',
          isOwner: true,
          role: 'Owner'
        };
      }
      return u;
    });
    const hasAdmin = updated.some(u => u.id === 1 || u.user === 'enalo' || u.user === 'admin' || u.isOwner);
    if (!hasAdmin) {
      return [SEED_USERS[0], ...updated];
    }
    return updated;
  }
  return [...SEED_USERS];
}

export function mergeStates(local: AppState, remote: AppState, clientLoc?: string): AppState {
  if (!remote || typeof remote !== 'object') return local;
  if (!local || typeof local !== 'object') return remote;

  // Remote is the single source of truth for database rows, items, users, and cash
  // This ensures deletions by Super Admin immediately delete for all clients, and additions immediately sync
  return {
    ...remote,
    rows: Array.isArray(remote.rows) ? remote.rows : [],
    items: Array.isArray(remote.items) ? remote.items : [],
    users: ensureTenUsers(remote.users),
    cash: remote.cash || {},
    cinfo: remote.cinfo || {},
    cpay: remote.cpay || {},
    cashiers: Array.isArray(remote.cashiers) && remote.cashiers.length > 0 ? remote.cashiers : local.cashiers,
    locs: ensureLocations(Array.isArray(remote.locs) && remote.locs.length > 0 ? remote.locs : local.locs),
    log: Array.isArray(remote.log) ? remote.log : local.log,
    notes: { ...(local.notes || {}), ...(remote.notes || {}) },
    // Keep this client's active branch location so another user's branch navigation does not hijack this user's screen
    inv: clientLoc || local.inv || remote.inv || 'Commissary Takehome',
    // Keep this client's active viewing date and shift
    vd: local.vd || remote.vd,
    vf: local.vf || remote.vf
  };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const seed = getSeedState();
        // Upgrade check
        if (!parsed.items) parsed.items = seed.items;
        if (!parsed.rows) parsed.rows = seed.rows;
        parsed.locs = ensureLocations(parsed.locs || seed.locs);
        parsed.users = ensureTenUsers(parsed.users || seed.users);
        if (!parsed.cashiers) parsed.cashiers = seed.cashiers;
        if (!parsed.cash) parsed.cash = {};
        if (parsed.cash['Commissary Takehome|2026-10-05'] === 35) {
          delete parsed.cash['Commissary Takehome|2026-10-05'];
        }
        if (!parsed.cinfo) parsed.cinfo = {};
        if (!parsed.cpay) parsed.cpay = {};
        if (!parsed.log) parsed.log = [];
        if (!parsed.notes) parsed.notes = {};
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to parse state from localStorage', e);
  }
  const seed = getSeedState();
  saveState(seed);
  return seed;
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('LocalStorage save failed', e);
  }
}

export const inPeriod = (d: string, start: string, cut: string): boolean => {
  return !!d && d >= start && d <= cut;
};

export const getWeekOf = (d: string, start: string, cut: string): string => {
  if (!d) return '';
  if (inPeriod(d, start, cut)) {
    const w = Math.floor(Math.round((Date.parse(d) - Date.parse(start)) / 864e5) / 7) + 1;
    return `Week ${w}`;
  }
  return 'Other period';
};

export const getWeeksCount = (start: string, cut: string): number => {
  const n = Math.floor((Date.parse(cut) - Date.parse(start)) / 864e5 / 7) + 1;
  return n > 0 ? n : 0;
};

export const cashKey = (loc: string, date: string, shift: 'AM' | 'PM'): string => {
  return `${loc}|${date}${shift === 'PM' ? '|PM' : ''}`;
};

export const parseCashKey = (key: string): { loc: string; date: string; shift: 'AM' | 'PM' } => {
  const isPM = key.endsWith('|PM');
  const clean = isPM ? key.slice(0, -3) : key;
  const lastPipe = clean.lastIndexOf('|');
  const loc = clean.slice(0, lastPipe);
  const date = clean.slice(lastPipe + 1);
  return { loc, date, shift: isPM ? 'PM' : 'AM' };
};

export function computeRows(rows: Row[], items: Item[]): RowComputed[] {
  const itemMap = new Map<number, Item>();
  items.forEach(it => itemMap.set(it.no, it));

  const sortedIndices = rows.map((_, i) => i).sort((a, b) => {
    const rA = rows[a];
    const rB = rows[b];
    return dcmp(rA.date, rB.date) || fo(rA) - fo(rB) || a - b;
  });

  const last: Record<string, { val: number; fromShift: 'AM' | 'PM'; fromDate: string }> = {};
  const out: RowComputed[] = new Array(rows.length);

  sortedIndices.forEach(i => {
    const r = rows[i];
    const key = `${r.loc}|${r.no}`;
    const isException = isPmCarryoverExceptionLocation(r.loc);

    let auto = false;
    let autoBeg = 0;

    if (r.no !== '' && key in last) {
      const prev = last[key];
      if (isException) {
        // Next-Date Carryover Exception locations: carry directly to next date AM, never to PM shift
        if (r.fr === 'AM' && prev.fromDate < r.date) {
          auto = true;
          autoBeg = prev.val;
        }
      } else {
        // Regular locations:
        // PM shift carries over from AM shift of the SAME date:
        if (r.fr === 'PM' && prev.fromShift === 'AM' && prev.fromDate === r.date) {
          auto = true;
          autoBeg = prev.val;
        }
        // AM shift: beginning inventory ONLY shows when item has an ending inventory in PM shift of the immediately preceding date!
        // Strictly addDay(r.date, -1). If there is a date gap (e.g. Oct 5 to Oct 7), it MUST NOT carry over!
        else if (r.fr === 'AM' && prev.fromShift === 'PM' && prev.fromDate === addDay(r.date, -1)) {
          auto = true;
          autoBeg = prev.val;
        }
      }
    }

    const beg = auto ? autoBeg : (r.beg !== '' && r.beg !== undefined ? num(r.beg) : 0);
    const tg = beg + num(r.del) + num(r.tf) + num(r.itf) - num(r.tt) - num(r.itt);
    const sold = tg - num(r.end);
    const itemObj = r.no !== '' ? itemMap.get(r.no as number) : undefined;
    const srp = num(itemObj?.srp);
    const sales = sold * srp;

    out[i] = {
      auto,
      beg,
      tg,
      sold,
      srp,
      sales
    };

    // Update ending inventory tracking for subsequent shifts/dates:
    if (r.no !== '') {
      const hasEnd = r.end !== '' && r.end !== undefined && !isNaN(Number(r.end)) && Number(r.end) >= 0;
      if (hasEnd) {
        last[key] = { val: num(r.end), fromShift: (r.fr === 'PM' ? 'PM' : 'AM'), fromDate: r.date };
      } else {
        // If an item does NOT have an ending inventory in this shift:
        // If tg > 0 and ending is blank, all available stock was sold out (ending is 0)
        if (tg > 0) {
          last[key] = { val: 0, fromShift: (r.fr === 'PM' ? 'PM' : 'AM'), fromDate: r.date };
        } else {
          delete last[key];
        }
      }
    }
  });

  return out;
}

/**
 * Retrieves the ending inventory of an item from the previous date or preceding shift.
 * - If the item was sold out today or on its most recent operating record (ending inventory was 0,
 *   or all available goods were sold), beginning inventory is 0 or blank (returns 0).
 *   It NEVER skips the sold out date to resurrect an older positive ending inventory from before!
 * - Regular locations:
 *   - If current shift is PM: beginning inventory carries over from AM shift ending of the same date.
 *   - If current shift is AM: beginning inventory carries over strictly from previous date's PM shift ending (never across date gaps).
 * - Next-Date Carryover Exception locations (Torres Tech Takehome, Commissary Takehome, Logistics Takehome, Malvar Takehome, Cabrini, Foodhub, Zentrum):
 *   - Ending inventory carries over directly to Next Date AM shift from the preceding operating date's ending inventory (AM or PM).
 */
export function getPreviousEndingInventory(
  itemNo: number | '',
  loc: string,
  currentDate: string,
  currentShift: 'AM' | 'PM',
  rows: Row[]
): number | null {
  if (itemNo === '' || itemNo === undefined || !loc || !currentDate) return null;

  const isException = isPmCarryoverExceptionLocation(loc);

  // Helper to evaluate whether a row was sold out or had ending inventory:
  const evaluateRowEnding = (r: Row): { hasEnding: boolean; endVal: number; isSoldOut: boolean } => {
    // 1. Explicitly entered ending inventory
    if (r.end !== '' && r.end !== undefined && !isNaN(Number(r.end))) {
      const val = num(r.end);
      return { hasEnding: true, endVal: val, isSoldOut: val <= 0 };
    }

    // 2. Ending was left blank: check if it had stock that was sold out
    const beg = num(r.beg);
    const del = num(r.del);
    const tg = beg + del + num(r.tf) + num(r.itf) - num(r.tt) - num(r.itt);
    if (tg > 0) {
      // In this system, when ending is blank, sold = tg, meaning 100% sold out
      return { hasEnding: true, endVal: 0, isSoldOut: true };
    }

    return { hasEnding: false, endVal: 0, isSoldOut: false };
  };

  // 1. If currently in PM shift:
  if (currentShift === 'PM') {
    // For exception locations, items do not show in PM shift
    if (isException) return null;

    // For regular locations, PM beginning inventory comes from same date AM ending
    const amRow = rows.find(r => r.loc === loc && r.date === currentDate && r.fr === 'AM' && r.no === itemNo);
    if (amRow) {
      const evalRes = evaluateRowEnding(amRow);
      if (evalRes.hasEnding) {
        return evalRes.isSoldOut ? 0 : evalRes.endVal;
      }
    }
    return null;
  }

  // 2. Currently in AM shift (Next Date or subsequent dates):
  if (isException) {
    // Next-Date Carryover Exception locations:
    // Find prior rows before currentDate, sorted latest date/shift first
    const priorRows = rows
      .filter(r => r.loc === loc && r.no === itemNo && dcmp(r.date, currentDate) < 0)
      .sort((a, b) => dcmp(b.date, a.date) || (b.fr === 'PM' ? 1 : 0) - (a.fr === 'PM' ? 1 : 0));

    if (priorRows.length === 0) return null;

    // Inspect the MOST RECENT prior record of this item:
    const mostRecent = priorRows[0];
    const evalRes = evaluateRowEnding(mostRecent);

    // If on its most recent prior day the item was sold out (ending was 0 or all stock sold):
    // Beginning inventory on the next day or the other day MUST be 0 (or blank)!
    // It must NEVER skip this date to resurrect an older ending inventory from before!
    if (evalRes.isSoldOut || (evalRes.hasEnding && evalRes.endVal <= 0)) {
      return 0;
    }

    if (evalRes.hasEnding && evalRes.endVal > 0) {
      return evalRes.endVal;
    }

    return null;
  }

  // REGULAR LOCATIONS:
  // "fix the beginning inventory of the items it should be coming from the previous date of pm shift except the locations with carry over exception"
  // It MUST come strictly from the previous date's (yesterday = currentDate - 1 day) PM shift ending inventory:
  // It must NEVER reach back across a date gap (e.g. from Oct 5 to Oct 7)!
  const prevDate = addDay(currentDate, -1);
  const prevDateRows = rows.filter(r => r.loc === loc && r.date === prevDate && r.no === itemNo);
  const pmRow = prevDateRows.find(r => r.fr === 'PM');
  if (pmRow) {
    const evalRes = evaluateRowEnding(pmRow);
    if (evalRes.hasEnding) {
      return evalRes.isSoldOut ? 0 : evalRes.endVal;
    }
  }

  // If item does NOT have an ending inventory in PM shift on the previous date (currentDate - 1 day), beginning inventory is blank (returns null)
  return null;
}

/**
 * Immediately propagates ending inventory to the next shift (PM shift) or next date (AM shift).
 * Exception locations (Cabrini, Foodhub, Zentrum): items with ending inventory NEVER show in PM shift;
 * they carry over directly to Next Date AM shift!
 * If no ending inventory is entered, it will NOT show in the next dates!
 */
export function propagateEndingInventory(
  rows: Row[],
  loc: string,
  itemNo: number | '',
  fromDate: string,
  fromShift: 'AM' | 'PM',
  endingVal: number | ''
): Row[] {
  if (itemNo === '' || !fromDate || !loc) return rows;

  const newRows = [...rows];
  const numEnd = endingVal === '' ? '' : num(endingVal);
  const hasEnding = numEnd !== '' && !isNaN(numEnd as number) && (numEnd as number) >= 0;
  const isException = isPmCarryoverExceptionLocation(loc);

  if (fromShift === 'AM') {
    if (isException) {
      // 1. EXCEPTION LOCATIONS (Torres Tech Takehome, Commissary Takehome, Logistics Takehome, Malvar Takehome, etc.):
      // Items with ending inventory will NOT show in PM shift!
      // If any untouched PM row exists on fromDate, remove or clear it:
      const pmIndex = newRows.findIndex(
        r => r.loc === loc && r.date === fromDate && r.fr === 'PM' && r.no === itemNo
      );
      if (pmIndex !== -1) {
        const r = newRows[pmIndex];
        const isUntouched =
          (r.del === '' || r.del === 0) &&
          (r.tf === '' || r.tf === 0) &&
          (r.tt === '' || r.tt === 0) &&
          (r.bad === '' || r.bad === 0) &&
          (r.end === '' || r.end === undefined);
        if (isUntouched) {
          newRows.splice(pmIndex, 1);
        } else {
          newRows[pmIndex] = { ...r, beg: '' };
        }
      }

      // 2. Instead, propagate directly to Next Date AM Shift!
      const nextDate = addDay(fromDate, 1);
      const nextDateAmIndex = newRows.findIndex(
        r => r.loc === loc && r.date === nextDate && r.fr === 'AM' && r.no === itemNo
      );

      if (hasEnding && (numEnd as number) > 0) {
        if (nextDateAmIndex !== -1) {
          newRows[nextDateAmIndex] = {
            ...newRows[nextDateAmIndex],
            beg: numEnd
          };
        } else {
          newRows.push(
            createInitialRow(itemNo, nextDate, {
              loc,
              fr: 'AM',
              beg: numEnd,
              gen: true
            })
          );
        }
      } else {
        // Ending is 0 (sold out) or blank: beginning on next date should be blank / 0
        if (nextDateAmIndex !== -1) {
          const r = newRows[nextDateAmIndex];
          const isUntouched =
            (r.del === '' || r.del === 0) &&
            (r.tf === '' || r.tf === 0) &&
            (r.tt === '' || r.tt === 0) &&
            (r.bad === '' || r.bad === 0) &&
            (r.end === '' || r.end === undefined);
          if (r.gen && isUntouched) {
            newRows.splice(nextDateAmIndex, 1);
          } else {
            newRows[nextDateAmIndex] = { ...r, beg: '' };
          }
        }
      }

      // 3. Ensure no stray propagation to nextDate + 1
      const afterNextDate = addDay(nextDate, 1);
      const afterNextIndex = newRows.findIndex(
        r => r.loc === loc && r.date === afterNextDate && r.fr === 'AM' && r.no === itemNo
      );
      if (afterNextIndex !== -1 && newRows[afterNextIndex].gen) {
        const r = newRows[afterNextIndex];
        const isUntouched =
          (r.del === '' || r.del === 0) &&
          (r.tf === '' || r.tf === 0) &&
          (r.tt === '' || r.tt === 0) &&
          (r.bad === '' || r.bad === 0) &&
          (r.end === '' || r.end === undefined);
        if (isUntouched) {
          newRows.splice(afterNextIndex, 1);
        }
      }
    } else {
      // REGULAR LOCATIONS:
      // 1. Same Date, PM Shift: Item shows in PM shift with beg = endingVal
      const pmIndex = newRows.findIndex(
        r => r.loc === loc && r.date === fromDate && r.fr === 'PM' && r.no === itemNo
      );

      if (hasEnding) {
        if (pmIndex !== -1) {
          newRows[pmIndex] = {
            ...newRows[pmIndex],
            beg: numEnd
          };
        } else {
          newRows.push(
            createInitialRow(itemNo, fromDate, {
              loc,
              fr: 'PM',
              beg: numEnd,
              gen: true
            })
          );
        }
      } else if (pmIndex !== -1 && newRows[pmIndex].gen) {
        const r = newRows[pmIndex];
        const isUntouched =
          (r.del === '' || r.del === 0) &&
          (r.tf === '' || r.tf === 0) &&
          (r.tt === '' || r.tt === 0) &&
          (r.bad === '' || r.bad === 0) &&
          (r.end === '' || r.end === undefined);
        if (isUntouched) {
          newRows.splice(pmIndex, 1);
        } else {
          newRows[pmIndex] = { ...r, beg: '' };
        }
      }

      // Entering AM ending does NOT propagate to the next date (the PM shift must operate and close first).
      const nextDate = addDay(fromDate, 1);
      const nextDateAmIndex = newRows.findIndex(
        r => r.loc === loc && r.date === nextDate && r.fr === 'AM' && r.no === itemNo
      );
      if (nextDateAmIndex !== -1 && newRows[nextDateAmIndex].gen) {
        const r = newRows[nextDateAmIndex];
        const isUntouched =
          (r.del === '' || r.del === 0) &&
          (r.tf === '' || r.tf === 0) &&
          (r.tt === '' || r.tt === 0) &&
          (r.bad === '' || r.bad === 0) &&
          (r.end === '' || r.end === undefined);
        if (isUntouched) {
          newRows.splice(nextDateAmIndex, 1);
        } else {
          newRows[nextDateAmIndex] = { ...r, beg: '' };
        }
      }
    }
  } else {
    // 2. fromShift === 'PM':
    // Item shows on Next Date AM Shift ONLY IF ending inventory was entered in PM shift!
    // When no ending inventory in PM shift, it will NOT show in the next dates!
    const nextDate = addDay(fromDate, 1);
    const nextDateAmIndex = newRows.findIndex(
      r => r.loc === loc && r.date === nextDate && r.fr === 'AM' && r.no === itemNo
    );

    if (hasEnding && (numEnd as number) > 0) {
      if (nextDateAmIndex !== -1) {
        newRows[nextDateAmIndex] = {
          ...newRows[nextDateAmIndex],
          beg: numEnd
        };
      } else {
        newRows.push(
          createInitialRow(itemNo, nextDate, {
            loc,
            fr: 'AM',
            beg: numEnd,
            gen: true
          })
        );
      }
    } else {
      // Ending is 0 (sold out) or blank: beginning on next date should be blank / 0
      if (nextDateAmIndex !== -1) {
        const r = newRows[nextDateAmIndex];
        const isUntouched =
          (r.del === '' || r.del === 0) &&
          (r.tf === '' || r.tf === 0) &&
          (r.tt === '' || r.tt === 0) &&
          (r.bad === '' || r.bad === 0) &&
          (r.end === '' || r.end === undefined);
        if (r.gen && isUntouched) {
          newRows.splice(nextDateAmIndex, 1);
        } else {
          newRows[nextDateAmIndex] = { ...r, beg: '' };
        }
      }
    }
  }

  return newRows;
}

/**
 * Automatically carries over ending inventory ONLY to the immediately next shift or next date.
 * For exception locations (Cabrini, Foodhub, Zentrum), ending inventory NEVER carries over to PM shift,
 * and carries over directly from preceding date to AM shift.
 * Strictly does NOT show in incoming days unless ending inventory was entered in the preceding shift/date.
 */
export function autoCarryOver(
  state: AppState,
  targetDate: string,
  targetShift: 'AM' | 'PM'
): Row[] {
  if (!targetDate) return state.rows;

  const loc = state.inv;
  const isException = isPmCarryoverExceptionLocation(loc);
  const lastEnding: Record<number, number> = {};

  if (targetShift === 'PM') {
    // 1. For PM shift on targetDate:
    if (isException) {
      // EXCEPTION: Items with ending inventory will NOT show in PM shift for these locations!
      // lastEnding remains empty for PM shift at exception locations.
    } else {
      // Regular locations: Only carry over from AM shift of the SAME targetDate!
      const amRows = state.rows.filter(
        r => r.loc === loc && r.date === targetDate && r.fr === 'AM' && r.no !== '' && r.no !== undefined
      );

      amRows.forEach(r => {
        if (r.end !== '' && r.end !== undefined && !isNaN(Number(r.end)) && Number(r.end) >= 0) {
          lastEnding[r.no as number] = num(r.end);
        }
      });
    }
  } else {
    // 2. For AM shift on targetDate:
    if (isException) {
      // Find the most recent operating date with records before targetDate for this branch
      const priorDates = Array.from(
        new Set(
          state.rows
            .filter(r => r.loc === loc && r.date && dcmp(r.date, targetDate) < 0)
            .map(r => r.date)
        )
      ).sort((a, b) => dcmp(b, a));

      const prevDate = priorDates.length > 0 ? priorDates[0] : addDay(targetDate, -1);
      const prevDayRows = state.rows.filter(
        r => r.loc === loc && r.date === prevDate && r.no !== '' && r.no !== undefined
      );

      // For exception locations, items do NOT show in PM shift.
      // So ending inventory from AM shift (or PM if any entered) on prevDate carries over to targetDate AM!
      prevDayRows.forEach(r => {
        const itemNo = r.no as number;
        if (itemNo in lastEnding) return;

        // If PM shift has an ending inventory, prefer PM ending; otherwise use AM ending!
        const pmRow = prevDayRows.find(pr => pr.no === itemNo && pr.fr === 'PM');
        if (pmRow && pmRow.end !== '' && pmRow.end !== undefined && !isNaN(Number(pmRow.end)) && Number(pmRow.end) >= 0) {
          lastEnding[itemNo] = num(pmRow.end);
        } else {
          const amRow = prevDayRows.find(pr => pr.no === itemNo && pr.fr === 'AM');
          if (amRow && amRow.end !== '' && amRow.end !== undefined && !isNaN(Number(amRow.end)) && Number(amRow.end) >= 0) {
            lastEnding[itemNo] = num(amRow.end);
          }
        }
      });
    } else {
      // Regular locations:
      // "fix the beginning inventory of the items it should be coming from the previous date of pm shift except the locations with carry over exception"
      // Beginning inventory MUST come strictly from previous date (targetDate - 1 day) of PM shift!
      // If targetDate is Oct 7, it strictly inspects Oct 6 (addDay(targetDate, -1)).
      // It must NEVER reach back across a date gap (e.g. from Oct 5 to Oct 7)!
      const prevDate = addDay(targetDate, -1);
      const prevDayRows = state.rows.filter(
        r => r.loc === loc && r.date === prevDate && r.no !== '' && r.no !== undefined
      );
      prevDayRows.forEach(r => {
        const itemNo = r.no as number;
        if (itemNo in lastEnding) return;

        const pmRow = prevDayRows.find(pr => pr.no === itemNo && pr.fr === 'PM');
        if (pmRow && pmRow.end !== '' && pmRow.end !== undefined && !isNaN(Number(pmRow.end)) && Number(pmRow.end) >= 0) {
          lastEnding[itemNo] = num(pmRow.end);
        }
      });
    }
  }

  // First, clean up any stray auto-generated or empty rows on targetDate that do not have a valid ending from preceding shift
  let newRows = state.rows.filter(r => {
    if (r.loc !== loc || r.date !== targetDate || r.fr !== targetShift) return true;
    const isUntouched =
      (r.del === '' || r.del === 0) &&
      (r.tf === '' || r.tf === 0) &&
      (r.tt === '' || r.tt === 0) &&
      (r.bad === '' || r.bad === 0) &&
      (r.end === '' || r.end === undefined);
    if (!isUntouched) return true; // keep rows with user entered data
    if (targetShift === 'PM' && isException) return false; // never keep empty PM rows for exception locations
    if (!r.gen) return true; // keep user-added rows
    return r.no !== '' && r.no in lastEnding; // keep only if valid ending exists
  });

  let changed = newRows.length !== state.rows.length;

  // For any remaining row on targetDate whose item had NO ending inventory in the preceding PM shift:
  // "in data entry if the items doesnt have an ending inventory in the PM shift the beginning inventory of the same item will be blank"
  newRows = newRows.map(r => {
    if (r.loc === loc && r.date === targetDate && r.fr === targetShift && r.no !== '') {
      if (!(r.no in lastEnding)) {
        if (r.beg !== '' && r.beg !== undefined) {
          changed = true;
          return { ...r, beg: '' };
        }
      }
    }
    return r;
  });

  Object.keys(lastEnding)
    .map(Number)
    .forEach(no => {
      const endingVal = lastEnding[no];

      const existingIndex = newRows.findIndex(
        r => r.loc === loc && r.date === targetDate && r.fr === targetShift && r.no === no
      );

      // If item was sold out (endingVal <= 0), ensure beginning inventory is blank / 0 and do not generate new rows
      if (endingVal <= 0) {
        if (existingIndex !== -1) {
          const row = newRows[existingIndex];
          if (row.gen && row.beg !== '' && row.beg !== undefined) {
            newRows[existingIndex] = { ...row, beg: '' };
            changed = true;
          }
        }
        return;
      }

      const ncKey = `${loc}|${targetDate}${targetShift === 'PM' ? '|PM' : ''}|${no}`;
      const dismissed = state.nc && state.nc[ncKey];
      if (dismissed) return;

      if (existingIndex === -1) {
        newRows.push(
          createInitialRow(no, targetDate, {
            loc,
            fr: targetShift,
            beg: endingVal,
            gen: true
          })
        );
        changed = true;
      } else {
        const row = newRows[existingIndex];
        if (row.gen && (row.beg === '' || row.beg === undefined || row.beg !== endingVal)) {
          newRows[existingIndex] = {
            ...row,
            beg: endingVal
          };
          changed = true;
        }
      }
    });

  return changed ? newRows : state.rows;
}

/**
 * Cleans up any stray auto-generated rows on dates where no ending inventory was entered in the preceding shift.
 * For exception locations, automatically purges any generated PM rows.
 */
export function cleanupStrayGeneratedRows(rows: Row[], activeLoc: string): Row[] {
  const isException = isPmCarryoverExceptionLocation(activeLoc);

  return rows
    .filter(r => {
      if (r.loc !== activeLoc) return true;
      const isUntouched =
        (r.del === '' || r.del === 0) &&
        (r.tf === '' || r.tf === 0) &&
        (r.tt === '' || r.tt === 0) &&
        (r.bad === '' || r.bad === 0) &&
        (r.end === '' || r.end === undefined);

      if (r.fr === 'PM' && isException) {
        // For exception locations, items with ending inventory NEVER show in PM shift!
        if (isUntouched) return false;
      }

      if (!r.gen) return true;
      if (!isUntouched) return true;

      const itemNo = r.no;
      if (r.fr === 'PM') {
        // For exception locations, items with ending inventory NEVER show in PM shift!
        if (isException) return false;

        const amRow = rows.find(x => x.loc === r.loc && x.date === r.date && x.fr === 'AM' && x.no === itemNo);
        return Boolean(amRow && amRow.end !== '' && amRow.end !== undefined && !isNaN(Number(amRow.end)));
      } else {
        // r.fr === 'AM':
        const prevDate = addDay(r.date, -1);
        const prevRows = rows.filter(x => x.loc === r.loc && x.date === prevDate && x.no === itemNo);

        if (isException) {
          // Preceding date MUST have a recorded ending inventory in either PM or AM
          const pmRow = prevRows.find(x => x.fr === 'PM');
          if (pmRow && pmRow.end !== '' && pmRow.end !== undefined && !isNaN(Number(pmRow.end))) {
            return true;
          }
          const amRow = prevRows.find(x => x.fr === 'AM');
          return Boolean(amRow && amRow.end !== '' && amRow.end !== undefined && !isNaN(Number(amRow.end)));
        } else {
          const pmRow = prevRows.find(x => x.fr === 'PM');
          if (pmRow) {
            return Boolean(pmRow.end !== '' && pmRow.end !== undefined && !isNaN(Number(pmRow.end)));
          }
          const storeHadPm = rows.some(x => x.loc === r.loc && x.date === prevDate && x.fr === 'PM');
          if (storeHadPm) return false;
          const amRow = prevRows.find(x => x.fr === 'AM');
          return Boolean(amRow && amRow.end !== '' && amRow.end !== undefined && !isNaN(Number(amRow.end)));
        }
      }
    })
    .map(r => {
      if (r.loc !== activeLoc || r.no === '') return r;

      // If on AM shift and preceding date's PM shift had NO ending inventory:
      // "in data entry if the items doesnt have an ending inventory in the PM shift the beginning inventory of the same item will be blank"
      if (r.fr === 'AM') {
        const prevDate = addDay(r.date, -1);
        const prevRows = rows.filter(x => x.loc === r.loc && x.date === prevDate && x.no === r.no);
        if (isException) {
          const pmRow = prevRows.find(x => x.fr === 'PM');
          const hasPmEnd = Boolean(pmRow && pmRow.end !== '' && pmRow.end !== undefined && !isNaN(Number(pmRow.end)));
          const amRow = prevRows.find(x => x.fr === 'AM');
          const hasAmEnd = Boolean(amRow && amRow.end !== '' && amRow.end !== undefined && !isNaN(Number(amRow.end)));
          if (!hasPmEnd && !hasAmEnd && r.beg !== '' && r.beg !== undefined) {
            return { ...r, beg: '' };
          }
        } else {
          const pmRow = prevRows.find(x => x.fr === 'PM');
          if (pmRow) {
            const hasPmEnd = Boolean(pmRow.end !== '' && pmRow.end !== undefined && !isNaN(Number(pmRow.end)));
            if (!hasPmEnd && r.beg !== '' && r.beg !== undefined) {
              return { ...r, beg: '' };
            }
          } else {
            const storeHadPm = rows.some(x => x.loc === r.loc && x.date === prevDate && x.fr === 'PM');
            if (storeHadPm && r.beg !== '' && r.beg !== undefined) {
              return { ...r, beg: '' };
            }
          }
        }
      }
      return r;
    });
}

/**
 * Parses transfer location entries from an optional map and/or string representation.
 * Supports:
 * - Map: { [location]: quantity }
 * - Composite string: "Location A (10), Location B (5)"
 * - Comma-separated: "Location A, Location B"
 * - Single location: "Location A"
 */
export function parseTransferLocations(
  locString?: string,
  locsMap?: Record<string, number>,
  fallbackQty?: number | string
): { loc: string; qty: number }[] {
  // 1. If explicit locsMap exists with valid keys, use it
  if (locsMap && typeof locsMap === 'object' && Object.keys(locsMap).length > 0) {
    const list: { loc: string; qty: number }[] = [];
    Object.entries(locsMap).forEach(([l, q]) => {
      const cleanLoc = l.trim();
      const numQ = Number(q);
      if (cleanLoc && !isNaN(numQ) && numQ > 0) {
        list.push({ loc: cleanLoc, qty: numQ });
      }
    });
    if (list.length > 0) return list;
  }

  // 2. Parse string representation
  if (!locString || !locString.trim()) {
    return [];
  }

  const str = locString.trim();

  // Pattern with quantities: e.g. "YTMI Takehome (10), Commissary Takehome (5)"
  const regex = /([^,(]+?)\s*\(([0-9.]+)\)/g;
  const matches = Array.from(str.matchAll(regex));
  if (matches.length > 0) {
    return matches.map(m => ({
      loc: m[1].trim(),
      qty: parseFloat(m[2]) || 0
    })).filter(e => e.loc && e.qty > 0);
  }

  const parsedFallback = typeof fallbackQty === 'number' ? fallbackQty : parseFloat(String(fallbackQty || ''));
  const fallbackNum = !isNaN(parsedFallback) && parsedFallback > 0 ? parsedFallback : 0;

  // Comma separated locations without quantities:
  if (str.includes(',')) {
    const parts = str.split(',').map(s => s.trim()).filter(Boolean);
    const splitQ = parts.length > 0 && fallbackNum > 0 ? fallbackNum / parts.length : 0;
    return parts.map(l => ({ loc: l, qty: splitQ }));
  }

  // Single location
  return [{ loc: str, qty: fallbackNum }];
}

/**
 * Formats multiple location entries into a consistent data structure:
 * - total: sum of quantities
 * - label: formatted string summary
 * - map: record of location to quantity
 */
export function formatTransferLocations(
  entries: { loc: string; qty: number }[]
): { total: number; label: string; map: Record<string, number> } {
  const cleanEntries = (entries || [])
    .filter(e => e && e.loc && e.loc.trim() && !isNaN(Number(e.qty)) && Number(e.qty) > 0)
    .map(e => ({ loc: e.loc.trim(), qty: Number(e.qty) }));

  if (cleanEntries.length === 0) {
    return { total: 0, label: '', map: {} };
  }

  const map: Record<string, number> = {};
  let total = 0;
  cleanEntries.forEach(e => {
    map[e.loc] = (map[e.loc] || 0) + e.qty;
    total += e.qty;
  });

  const uniqueLocs = Object.keys(map);
  let label = '';
  if (uniqueLocs.length === 1) {
    label = uniqueLocs[0];
  } else {
    label = uniqueLocs.map(l => `${l} (${map[l]})`).join(', ');
  }

  return { total, label, map };
}


