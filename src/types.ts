export interface Item {
  no: number;
  code: string;
  sys: string;
  desc: string;
  cat: string;
  srp: number;
  loc: string;
  vat: 'VAT' | 'NVAT';
  deliv: number;
  wd: number;
  conv: number;
  cv: number;
}

export interface Row {
  no: number | '';
  date: string; // YYYY-MM-DD
  loc: string;
  fr: 'AM' | 'PM';
  beg: number | '';
  del: number | '';
  doc?: string;
  wd: number | '';
  tf: number | '';
  tfl?: string;
  tf_locs?: Record<string, number>; // Breakdown of Transfer From by location: { [location]: quantity }
  itf: number | '';
  tt: number | '';
  ttl?: string;
  tt_locs?: Record<string, number>; // Breakdown of Transfer To by location: { [location]: quantity }
  itt: number | '';
  bad: number | '';
  end: number | '';
  gen?: boolean;
  _id?: string;
  _t?: number; // epoch ms of last edit for concurrency resolution
  _u?: string; // author of last edit
}

export interface PresenceUser {
  id: string; // unique session/user id
  userId: number;
  name: string;
  user: string;
  loc: string;
  tab: string;
  shift?: 'AM' | 'PM';
  date?: string;
  lastSeen: number; // epoch ms
  role?: string;
}

export interface User {
  id: number;
  name: string;
  all: boolean;
  locs: string[];
  acc: string[];
  res: string[];
  user: string;
  salt: string;
  hash: string;
  email?: string;
  isOwner?: boolean;
  role?: string;
}

export interface CashierInfo {
  cashier: string;
  shift: string;
}

export interface LogEntry {
  id?: string;
  t: string; // ISO string
  u: string;
  tab: string;
  act: string;
  desc: string;
  date?: string;
  loc?: string;
}

export interface AppState {
  v: number;
  locs: string[];
  inv: string;
  start: string;
  cut: string;
  items: Item[];
  rows: Row[];
  cash: Record<string, number | ''>;
  cinfo: Record<string, CashierInfo>;
  cashiers: string[];
  cpay: Record<string, number>;
  users: User[];
  log: LogEntry[];
  vd?: string;
  vf?: 'AM' | 'PM';
  nc?: Record<string, number>;
  notes?: Record<string, CellNote>;
}

export interface CellNote {
  text: string;
  author: string;
  timestamp: number;
}

export interface RowComputed {
  auto: boolean;
  beg: number;
  tg: number;
  sold: number;
  srp: number;
  sales: number;
}
