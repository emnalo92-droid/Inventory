import React, { useState } from 'react';
import { Download, Coins, ArrowRightLeft, DollarSign } from 'lucide-react';
import { AppState, Row } from '../types';
import {
  acp,
  addDay,
  computeRows,
  dcmp,
  f2,
  fd,
  getWeeksCount,
  num,
  parseCashKey
} from '../utils/helpers';
import { exportCashDetailsSummary } from '../utils/excel';
import { ChangeHistory } from './ChangeHistory';

interface CashDetailsSummaryTabProps {
  state: AppState;
  canEdit: boolean;
  canAdmin: boolean;
  onUpdateState: (updater: (prev: AppState) => AppState, actionDescription?: string) => void;
}

export const CashDetailsSummaryTab: React.FC<CashDetailsSummaryTabProps> = ({
  state,
  canEdit,
  canAdmin,
  onUpdateState
}) => {
  const [msg, setMsg] = useState('');
  const weeksCount = getWeeksCount(state.start, state.cut);

  // Compute model
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

    // Range sales
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

  const CROWS: [string, (c: any) => number, boolean?][] = [
    ['Beginning Inventory', c => c.beg],
    ['Deliveries (+)', c => c.del],
    ['Stock Withdrawal (+)', c => c.wd],
    ['Transfer FROM (+)', c => c.tf],
    ['Total Available', c => c.d.ta, true],
    ['Transfer TO (-)', c => c.tt],
    ['Bad Order (-)', c => c.bad],
    ['Total to be deducted', c => c.d.td, true],
    ['Total Net Available Invty', c => c.d.net, true],
    ['Actual Ending Inventory', c => c.end],
    ['Should be - Sales', c => c.sales],
    ['Cash on Hand', c => c.cash],
    ['Variances (over/short)', c => c.d.vr, true]
  ];

  const allColumns = [...cols, sum];

  const handlePaymentChange = (weekStartDate: string, rawVal: string) => {
    const trimmed = rawVal.trim().replace(/,/g, '');
    onUpdateState(prev => {
      const nextCpay = { ...prev.cpay };
      const k = `${prev.inv}|${weekStartDate}`;
      if (trimmed === '') {
        delete nextCpay[k];
      } else {
        const clean = parseFloat(trimmed);
        if (isNaN(clean) || clean === 0) {
          delete nextCpay[k];
        } else {
          nextCpay[k] = clean;
        }
      }
      return {
        ...prev,
        cpay: nextCpay
      };
    });
  };

  // Over/Short daily breakdown model
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

  return (
    <div className="space-y-6">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span>Cash Details Summary</span>
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
              ({fd(state.start)} to {fd(state.cut)})
            </span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Branch Location: <span className="font-semibold text-teal-800 dark:text-teal-400">{state.inv}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            exportCashDetailsSummary(state);
            setMsg('Cash Details Summary exported.');
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xs transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-slate-500" />
          <span>Export (Download)</span>
        </button>
      </div>

      {msg && (
        <div className="p-2.5 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 rounded-lg text-xs text-teal-800 dark:text-teal-300 flex items-center justify-between">
          <span>{msg}</span>
          <button onClick={() => setMsg('')} className="font-bold text-teal-700 hover:text-teal-900">
            ×
          </button>
        </div>
      )}

      {/* Main Multi-Week Table */}
      <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse leading-relaxed ledger-table font-sans">
            <thead className="bg-slate-200/90 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold border-b border-slate-300 dark:border-slate-700">
              <tr>
                <th className="py-2.5 px-3 text-left min-w-[220px] border-r border-slate-300 dark:border-slate-700">
                  Financial Ledger Metric
                </th>
                {cols.map((_, i) => (
                  <th
                    key={i}
                    className="py-2.5 px-3 text-right min-w-[120px] border-r border-slate-300 dark:border-slate-700"
                  >
                    Week {i + 1}
                  </th>
                ))}
                <th className="py-2.5 px-3 text-right min-w-[130px] bg-teal-100/70 dark:bg-teal-950/70 font-bold">
                  Summary
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {CROWS.map(([label, getValue, isHeader]) => (
                <tr
                  key={label}
                  className={`${
                    isHeader
                      ? 'bg-slate-100 dark:bg-slate-800/80 font-bold text-slate-900 dark:text-slate-100'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 font-medium">
                    {label}
                  </td>
                  {allColumns.map((col, idx) => {
                    const val = getValue(col);
                    const isNeg = Math.round(val * 100) < 0;
                    const isSummaryCol = idx === allColumns.length - 1;

                    return (
                      <td
                        key={idx}
                        className={`py-2 px-3 text-right font-mono tabular-nums ${
                          isSummaryCol
                            ? 'bg-teal-50/70 dark:bg-teal-950/40 font-bold border-l border-slate-200 dark:border-slate-800'
                            : 'border-r border-slate-200 dark:border-slate-800'
                        } ${isNeg ? 'text-rose-600 dark:text-rose-400' : ''}`}
                      >
                        ₱{acp(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* Cashier Payment Row */}
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800">
                <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 font-medium text-slate-800 dark:text-slate-200">
                  Cashier Payment
                </td>
                {cols.map((col, idx) => (
                  <td
                    key={idx}
                    className="p-1 border-r border-slate-200 dark:border-slate-800 text-right"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-slate-400 font-mono text-[10px]">₱</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        disabled={!canEdit}
                        value={col.pay && col.pay !== 0 ? f2(col.pay) : ''}
                        onChange={e => handlePaymentChange(col.a, e.target.value)}
                        placeholder=""
                        className="w-24 text-right font-mono tabular-nums px-1.5 py-1 text-xs bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:bg-white dark:focus:bg-slate-800 rounded focus:outline-none focus:ring-1 focus:ring-teal-600"
                      />
                    </div>
                  </td>
                ))}
                <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold border-l border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
                  {sum.pay > 0 ? `₱${f2(sum.pay)}` : '—'}
                </td>
              </tr>

              {/* Balance Row */}
              <tr className="bg-teal-100/60 dark:bg-teal-950/60 font-bold text-slate-900 dark:text-slate-100 border-t border-slate-300 dark:border-slate-700">
                <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 uppercase tracking-wide">
                  Balance (Variances + Payment)
                </td>
                {allColumns.map((col, idx) => {
                  const bal = col.d.bal;
                  const isNeg = Math.round(bal * 100) < 0;
                  const isSummaryCol = idx === allColumns.length - 1;

                  return (
                    <td
                      key={idx}
                      className={`py-2 px-3 text-right font-mono tabular-nums text-sm ${
                        isSummaryCol ? 'bg-teal-200/60 dark:bg-teal-900/60 font-black' : 'border-r border-slate-200 dark:border-slate-800'
                      } ${isNeg ? 'text-rose-600 dark:text-rose-400' : 'text-teal-950 dark:text-teal-100'}`}
                    >
                      ₱{acp(bal)}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Over / Short Breakdown and Summary */}
      <div className="flex flex-wrap lg:flex-nowrap gap-6 items-start">
        {/* Left: Over/Short Daily Breakdown */}
        <div className="w-fit max-w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
          <div className="bg-slate-100 dark:bg-slate-800 px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 font-bold text-xs uppercase tracking-wider text-slate-800 dark:text-slate-200">
            Over / Short Breakdown (By Shift)
          </div>

          <div className="overflow-x-auto max-h-96">
            <table className="w-auto text-xs border-collapse ledger-table font-sans">
              <thead className="bg-slate-200/90 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold sticky top-0 border-b border-slate-300 dark:border-slate-700">
                <tr>
                  <th className="py-2 px-3 text-left w-32 min-w-[110px] whitespace-nowrap border-r border-slate-300 dark:border-slate-700">Date</th>
                  <th className="py-2 px-2 text-center w-16 whitespace-nowrap border-r border-slate-300 dark:border-slate-700">Shift</th>
                  <th className="py-2 px-3 text-right w-28 whitespace-nowrap border-r border-slate-300 dark:border-slate-700">Over / Short</th>
                  <th className="py-2 px-3 text-left w-[200px] min-w-[110px] whitespace-nowrap">Cashier Name</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {osRows.map((r, idx) => {
                  const sg = (v: number) => (v < 0 ? '-' + f2(-v) : f2(v));
                  const isNeg = r.os !== null && r.os < 0;

                  return (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-1.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap border-r border-slate-200 dark:border-slate-800">
                        {r.fr === 'AM' ? fd(r.d) : ''}
                      </td>
                      <td className="py-1.5 px-2 text-center font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap border-r border-slate-200 dark:border-slate-800">
                        {r.fr}
                      </td>
                      <td
                        className={`py-1.5 px-3 text-right font-mono tabular-nums font-semibold whitespace-nowrap border-r border-slate-200 dark:border-slate-800 ${
                          isNeg ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {r.os !== null && r.os !== 0 ? `₱${sg(r.os)}` : '—'}
                      </td>
                      <td className="py-1.5 px-3 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {r.cashier}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Weekly Over/Short Summary */}
        <div className="w-full sm:w-80 lg:w-96 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
          <div className="bg-slate-100 dark:bg-slate-800 px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 font-bold text-xs uppercase tracking-wider text-slate-800 dark:text-slate-200">
            Weekly Variance Totals
          </div>

          <table className="w-full text-xs border-collapse ledger-table font-sans">
            <thead className="bg-slate-200/90 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-300 dark:border-slate-700">
              <tr>
                <th className="py-2 px-3 text-left border-r border-slate-300 dark:border-slate-700">Week</th>
                <th className="py-2 px-3 text-right border-r border-slate-300 dark:border-slate-700">Over</th>
                <th className="py-2 px-3 text-right">Short</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {osWeeks.map((w, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800">
                    Week {i + 1}
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400 border-r border-slate-200 dark:border-slate-800">
                    {w.over ? `₱${f2(w.over)}` : '—'}
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-rose-600 dark:text-rose-400">
                    {w.short ? `-₱${f2(-w.short)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-200/80 dark:bg-slate-800 font-bold text-slate-900 dark:text-slate-100 border-t border-slate-300 dark:border-slate-700">
              <tr>
                <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800">Total</td>
                <td className="py-2 px-3 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-300 border-r border-slate-200 dark:border-slate-800">
                  {osTot.over ? `₱${f2(osTot.over)}` : '—'}
                </td>
                <td className="py-2 px-3 text-right font-mono tabular-nums text-rose-700 dark:text-rose-300">
                  {osTot.short ? `-₱${f2(-osTot.short)}` : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Explanatory guidelines */}
      <div className="p-4 rounded-xl bg-slate-100/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
        <strong>Accounting Formula Reference:</strong> All values are calculated in pesos (quantity × SRP).
        Beginning Inventory = previous week's Ending Inventory.
        Total Available = Beginning + Deliveries + Stock Withdrawal + Transfer FROM.
        Total to be deducted = Transfer TO + Bad Order.
        Total Net Available = Total Available − Total to be deducted.
        Variances (over/short) = Cash on Hand − Should be Sales.
        Balance = Variances + Cashier Payment.
      </div>

      {/* Change History Audit Log */}
      <ChangeHistory
        logs={state.log || []}
        currentTab="cash"
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
