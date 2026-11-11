import React, { useState, useMemo } from 'react';
import { Download, Calendar, DollarSign, Package, ArrowLeftRight, ArrowRightLeft, ArrowRight } from 'lucide-react';
import { AppState, Row } from '../types';
import {
  acct,
  computeRows,
  dcmp,
  f2,
  fd,
  num,
  parseCashKey,
  q,
  raw,
  unitCost
} from '../utils/helpers';
import { exportSummaryRange } from '../utils/excel';
import { ChangeHistory } from './ChangeHistory';

interface SummaryViewTabProps {
  state: AppState;
  title: string;
  startDate: string;
  endDate: string;
  tabKey: string;
  canAdmin: boolean;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
  onSelectTab?: (tabId: string) => void;
}

export const SummaryViewTab: React.FC<SummaryViewTabProps> = ({
  state,
  title,
  startDate,
  endDate,
  tabKey,
  canAdmin,
  onUpdateState,
  onSelectTab
}) => {
  const C = computeRows(state.rows, state.items);

  // Filter rows within date range and matching active location
  const rangeRowIndices = state.rows
    .map((r, i) => i)
    .filter(i => {
      const r = state.rows[i];
      return r.loc === state.inv && r.no !== '' && r.date >= startDate && r.date <= endDate;
    })
    .sort((x, y) => state.rows[x].date.localeCompare(state.rows[y].date) || x - y);

  // Group row indices by item no
  const itemRowMap: Record<number, number[]> = {};
  rangeRowIndices.forEach(i => {
    const no = state.rows[i].no as number;
    (itemRowMap[no] = itemRowMap[no] || []).push(i);
  });

  const lines = Object.keys(itemRowMap).map(Number).sort((x, y) => x - y);
  const getCatOfItem = (no: number) => state.items.find(x => x.no === no)?.cat || 'Uncategorized';

  const categories: string[] = [];
  lines.forEach(no => {
    const cat = getCatOfItem(no);
    if (!categories.includes(cat)) categories.push(cat);
  });
  categories.sort((x, y) => x.localeCompare(y));

  // Grand summary values
  let grandTotalSales = 0;

  // Cash Details computation
  const cashKeys = Object.keys(state.cash).filter(k => {
    const { loc, date } = parseCashKey(k);
    return loc === state.inv && date >= startDate && date <= endDate && state.cash[k] !== '';
  });
  const totalCashOnHand = cashKeys.reduce((t, k) => t + num(state.cash[k]), 0);
  const [viewMode, setViewMode] = useState<'all' | 'inventory' | 'cost'>('all');

  // Transfer From Breakdown by Location (matches Transfer From Tab)
  const transferFromSummary = useMemo(() => {
    const locMap: Record<string, { qty: number; netCost: number }> = {};
    let totalQty = 0;
    let totalCost = 0;

    rangeRowIndices.forEach(i => {
      const r = state.rows[i];
      const qty = num(r.tf);
      if (qty > 0) {
        const srcLoc = (r.tfl || 'Unspecified').trim();
        const it = state.items.find(x => x.no === r.no);
        const uCost = it ? unitCost(it) : 0;
        const isVat = it?.vat !== 'NVAT';
        const cost = isVat ? (qty * uCost) / 1.12 : qty * uCost;

        if (!locMap[srcLoc]) locMap[srcLoc] = { qty: 0, netCost: 0 };
        locMap[srcLoc].qty += qty;
        locMap[srcLoc].netCost += cost;
        totalQty += qty;
        totalCost += cost;
      }
    });

    return {
      locations: Object.entries(locMap).sort((a, b) => b[1].netCost - a[1].netCost),
      totalQty,
      totalCost
    };
  }, [rangeRowIndices, state.rows, state.items]);

  // Transfer TO & Bad Order Breakdown by Location (matches Transfer TO Tab)
  const transferToSummary = useMemo(() => {
    const locMap: Record<string, { qty: number; netCost: number }> = {};
    let totalTtQty = 0;
    let totalTtCost = 0;
    let totalBadQty = 0;
    let totalBadCost = 0;

    rangeRowIndices.forEach(i => {
      const r = state.rows[i];
      const tt = num(r.tt);
      const bad = num(r.bad);
      const it = state.items.find(x => x.no === r.no);
      const uCost = it ? unitCost(it) : 0;
      const isVat = it?.vat !== 'NVAT';
      const calcNet = (qty: number) => (isVat ? (qty * uCost) / 1.12 : qty * uCost);

      if (tt > 0) {
        const destLoc = (r.ttl || 'Unspecified').trim();
        const cost = calcNet(tt);
        if (!locMap[destLoc]) locMap[destLoc] = { qty: 0, netCost: 0 };
        locMap[destLoc].qty += tt;
        locMap[destLoc].netCost += cost;
        totalTtQty += tt;
        totalTtCost += cost;
      }

      if (bad > 0) {
        totalBadQty += bad;
        totalBadCost += calcNet(bad);
      }
    });

    return {
      locations: Object.entries(locMap).sort((a, b) => b[1].netCost - a[1].netCost),
      totalTtQty,
      totalTtCost,
      totalBadQty,
      totalBadCost
    };
  }, [rangeRowIndices, state.rows, state.items]);

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span>{title}</span>
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
              ({fd(startDate)} to {fd(endDate)})
            </span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Branch Location: <span className="font-semibold text-teal-800 dark:text-teal-400">{state.inv}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View toggle */}
          <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('all')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                viewMode === 'all'
                  ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              All Tables
            </button>
            <button
              type="button"
              onClick={() => setViewMode('inventory')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                viewMode === 'inventory'
                  ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Inventory &amp; Sales
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cost')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                viewMode === 'cost'
                  ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Cost &amp; Net of VAT
            </button>
          </div>

          <button
            type="button"
            onClick={() => exportSummaryRange(state, startDate, endDate, title)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export (Download)</span>
          </button>
        </div>
      </div>

      {/* Tables grouped by Category */}
      {categories.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 italic">
          No entries recorded for {state.inv} between {fd(startDate)} and {fd(endDate)}.
        </div>
      ) : (
        <div className="space-y-4">
          {categories.map(cat => {
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
              .filter(no => getCatOfItem(no) === cat)
              .sort((x, y) => {
                const itX = state.items.find(it => it.no === x);
                const itY = state.items.find(it => it.no === y);
                return (itX?.desc || '').localeCompare(itY?.desc || '') || x - y;
              });

            const rowsData = catLines.map(no => {
              const rs = itemRowMap[no];
              const sum = (field: keyof Row) => rs.reduce((t, i) => t + num(state.rows[i][field]), 0);
              const it = state.items.find(x => x.no === no);
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

              (['del', 'wd', 'tf', 'itf', 'tt', 'itt', 'bad'] as const).forEach(col => {
                T[col] += sum(col);
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

              return {
                no,
                desc: it?.desc || '(no description)',
                beg,
                del,
                wd,
                tf,
                itf,
                tt,
                itt,
                bad,
                tg,
                end,
                sold,
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
              };
            });

            grandTotalSales += T.sales;
            const priceTransferMismatch = T.itf !== T.itt;

            return (
              <div key={cat} className="space-y-4">
                {/* 1. Inventory & Sales Table */}
                {(viewMode === 'all' || viewMode === 'inventory') && (
                  <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
                    <div className="bg-slate-100 dark:bg-slate-800 px-4 py-2 border-b border-slate-200 dark:border-slate-700 font-bold text-xs uppercase tracking-wider text-teal-900 dark:text-teal-300 flex items-center justify-between">
                      <span>{cat} — Inventory &amp; Sales</span>
                    </div>

                    <div className="overflow-x-auto w-full pb-2">
                      <table className="w-full min-w-[1000px] text-[11px] border-collapse leading-tight ledger-table font-sans">
                        <thead className="bg-slate-200/90 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-300 dark:border-slate-700">
                          <tr className="align-middle">
                            <th className="py-2 px-3 text-center min-w-[200px] border-r border-slate-300 dark:border-slate-700">
                              Item Description
                            </th>
                            <th className="py-2 px-2 text-center w-24 border-r border-slate-300 dark:border-slate-700">
                              Beginning Inv
                            </th>
                            <th className="py-2 px-2 text-center w-24 border-r border-slate-300 dark:border-slate-700">
                              Deliveries
                            </th>
                            <th className="py-2 px-2 text-center w-24 border-r border-slate-300 dark:border-slate-700">
                              Stock Withdr
                            </th>
                            <th className="py-2 px-2 text-center w-24 border-r border-slate-300 dark:border-slate-700">
                              Transfer From
                            </th>
                            <th className="py-2 px-2 text-center w-24 border-r border-slate-300 dark:border-slate-700">
                              Int TF (In)
                            </th>
                            <th className="py-2 px-2 text-center w-24 border-r border-slate-300 dark:border-slate-700">
                              Transfer To
                            </th>
                            <th className="py-2 px-2 text-center w-24 border-r border-slate-300 dark:border-slate-700">
                              Int TT (Out)
                            </th>
                            <th className="py-2 px-2 text-center w-24 border-r border-slate-300 dark:border-slate-700">
                              Bad Order
                            </th>
                            <th className="py-2 px-2 text-center w-24 border-r border-slate-300 dark:border-slate-700 bg-teal-50 dark:bg-teal-950/40">
                              Goods Avail
                            </th>
                            <th className="py-2 px-2 text-center w-24 border-r border-slate-300 dark:border-slate-700">
                              Ending Inv
                            </th>
                            <th className="py-2 px-2 text-center w-24 border-r border-slate-300 dark:border-slate-700 bg-teal-50 dark:bg-teal-950/40">
                              Goods Sold
                            </th>
                            <th className="py-2 px-2 text-center w-24 border-r border-slate-300 dark:border-slate-700">
                              SRP
                            </th>
                            <th className="py-2 px-3 text-center w-30 bg-teal-50 dark:bg-teal-950/40">
                              Total Sales
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {rowsData.map(r => (
                            <tr key={r.no} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <td className="py-1.5 px-3 font-medium text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800">
                                {r.desc}
                              </td>
                              <td className="py-1.5 px-2 text-center font-mono tabular-nums border-r border-slate-200 dark:border-slate-800">
                                {q(r.beg)}
                              </td>
                              <td className="py-1.5 px-2 text-center font-mono tabular-nums border-r border-slate-200 dark:border-slate-800">
                                {q(r.del)}
                              </td>
                              <td className="py-1.5 px-2 text-center font-mono tabular-nums border-r border-slate-200 dark:border-slate-800">
                                {q(r.wd)}
                              </td>
                              <td className="py-1.5 px-2 text-center font-mono tabular-nums border-r border-slate-200 dark:border-slate-800">
                                {q(r.tf)}
                              </td>
                              <td className="py-1.5 px-2 text-center font-mono tabular-nums border-r border-slate-200 dark:border-slate-800">
                                {q(r.itf)}
                              </td>
                              <td className="py-1.5 px-2 text-center font-mono tabular-nums border-r border-slate-200 dark:border-slate-800">
                                {q(r.tt)}
                              </td>
                              <td className="py-1.5 px-2 text-center font-mono tabular-nums border-r border-slate-200 dark:border-slate-800">
                                {q(r.itt)}
                              </td>
                              <td className="py-1.5 px-2 text-center font-mono tabular-nums border-r border-slate-200 dark:border-slate-800">
                                {q(r.bad)}
                              </td>
                              <td className="py-1.5 px-2 text-center font-mono tabular-nums font-semibold border-r border-slate-200 dark:border-slate-800 bg-teal-50/50 dark:bg-teal-950/30">
                                {q(r.tg)}
                              </td>
                              <td className="py-1.5 px-2 text-center font-mono tabular-nums border-r border-slate-200 dark:border-slate-800">
                                {q(r.end)}
                              </td>
                              <td className="py-1.5 px-2 text-center font-mono tabular-nums font-semibold border-r border-slate-200 dark:border-slate-800 bg-teal-50/50 dark:bg-teal-950/30">
                                {q(r.sold)}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800">
                                {acct(r.srp)}
                              </td>
                              <td
                                className={`py-1.5 px-3 text-right font-mono tabular-nums font-bold bg-teal-50/50 dark:bg-teal-950/30 ${
                                  r.sales < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-teal-950 dark:text-teal-200'
                                }`}
                              >
                                {acct(r.sales)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-200/80 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-200 border-t border-slate-300 dark:border-slate-700">
                          <tr>
                            <td className="py-2 px-3 text-left border-r border-slate-200 dark:border-slate-800">Total</td>
                            <td className="py-2 px-2 text-center font-mono tabular-nums border-r border-slate-200 dark:border-slate-800">{q(T.beg)}</td>
                            <td className="py-2 px-2 text-center font-mono tabular-nums border-r border-slate-200 dark:border-slate-800">{q(T.del)}</td>
                            <td className="py-2 px-2 text-center font-mono tabular-nums border-r border-slate-200 dark:border-slate-800">{q(T.wd)}</td>
                            <td className="py-2 px-2 text-center font-mono tabular-nums border-r border-slate-200 dark:border-slate-800">{q(T.tf)}</td>
                            <td
                              className={`py-2 px-2 text-center font-mono tabular-nums border-r border-slate-200 dark:border-slate-800 ${
                                priceTransferMismatch ? 'text-rose-600 dark:text-rose-400 font-bold' : ''
                              }`}
                            >
                              {q(T.itf)}
                            </td>
                            <td className="py-2 px-2 text-center font-mono tabular-nums border-r border-slate-200 dark:border-slate-800">{q(T.tt)}</td>
                            <td
                              className={`py-2 px-2 text-center font-mono tabular-nums border-r border-slate-200 dark:border-slate-800 ${
                                priceTransferMismatch ? 'text-rose-600 dark:text-rose-400 font-bold' : ''
                              }`}
                            >
                              {q(T.itt)}
                            </td>
                            <td className="py-2 px-2 text-center font-mono tabular-nums border-r border-slate-200 dark:border-slate-800">{q(T.bad)}</td>
                            <td className="py-2 px-2 text-center font-mono tabular-nums bg-teal-100/60 dark:bg-teal-950/60 border-r border-slate-200 dark:border-slate-800">
                              {q(T.tg)}
                            </td>
                            <td className="py-2 px-2 text-center font-mono tabular-nums border-r border-slate-200 dark:border-slate-800">{q(T.end)}</td>
                            <td className="py-2 px-2 text-center font-mono tabular-nums bg-teal-100/60 dark:bg-teal-950/60 border-r border-slate-200 dark:border-slate-800">
                              {q(T.sold)}
                            </td>
                            <td className="border-r border-slate-200 dark:border-slate-800"></td>
                            <td
                              className={`py-2 px-3 text-right font-mono tabular-nums text-xs bg-teal-100/60 dark:bg-teal-950/60 ${
                                T.sales < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-teal-950 dark:text-teal-200'
                              }`}
                            >
                              {acct(T.sales)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* 2. Cost & Net of VAT Table */}
                {(viewMode === 'all' || viewMode === 'cost') && (
                  <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
                    <div className="bg-slate-100 dark:bg-slate-800 px-4 py-2 border-b border-slate-200 dark:border-slate-700 font-bold text-xs uppercase tracking-wider text-teal-900 dark:text-teal-300 flex items-center justify-between">
                      <span>{cat} — Cost &amp; Net of VAT</span>
                    </div>

                    <div className="overflow-x-auto w-full pb-2">
                      <table className="w-full min-w-[1450px] text-[11px] border-collapse leading-tight ledger-table font-sans">
                        <thead className="bg-slate-200/90 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-300 dark:border-slate-700">
                          <tr className="align-middle">
                            <th className="py-2 px-3 text-center min-w-[200px] border-r border-slate-300 dark:border-slate-700">
                              Item Description
                            </th>
                            <th className="py-2 px-2 text-center w-32 border-r border-slate-300 dark:border-slate-700 whitespace-normal break-words leading-tight">
                              Unit Cost
                            </th>
                            <th className="py-2 px-2 text-center w-32 border-r border-slate-300 dark:border-slate-700 whitespace-normal break-words leading-tight">
                              Total Inv. Amount at Cost
                            </th>
                            <th className="py-2 px-2 text-center w-32 border-r border-slate-300 dark:border-slate-700 whitespace-normal break-words leading-tight">
                              Total Net of VAT Inventory
                            </th>
                            <th className="py-2 px-2 text-center w-32 border-r border-slate-300 dark:border-slate-700 whitespace-normal break-words leading-tight">
                              Total Net of VAT Beginning Inventory
                            </th>
                            <th className="py-2 px-2 text-center w-32 border-r border-slate-300 dark:border-slate-700 whitespace-normal break-words leading-tight">
                              Total Net of VAT Deliveries
                            </th>
                            <th className="py-2 px-2 text-center w-32 border-r border-slate-300 dark:border-slate-700 whitespace-normal break-words leading-tight">
                              Total Stock Withdrawal
                            </th>
                            <th className="py-2 px-2 text-center w-32 border-r border-slate-300 dark:border-slate-700 whitespace-normal break-words leading-tight">
                              Total Net of VAT Transfers FROM
                            </th>
                            <th className="py-2 px-2 text-center w-32 border-r border-slate-300 dark:border-slate-700 whitespace-normal break-words leading-tight">
                              Total Net of VAT Transfers TO
                            </th>
                            <th className="py-2 px-2 text-center w-32 border-r border-slate-300 dark:border-slate-700 whitespace-normal break-words leading-tight">
                              Total Net of VAT Bad Order
                            </th>
                            <th className="py-2 px-2 text-center w-32 bg-teal-50 dark:bg-teal-950/40 whitespace-normal break-words leading-tight">
                              Total Net of VAT Total Good Sold
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {rowsData.map(r => (
                            <tr key={r.no} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <td className="py-1.5 px-3 font-medium text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800">
                                {r.desc}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400 w-32 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                                {acct(r.uCost)}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 w-32 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                                {acct(r.invCost)}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 w-32 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                                {acct(r.netVatInv)}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 w-32 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                                {acct(r.netVatBeg)}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 w-32 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                                {acct(r.netVatDel)}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 w-32 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                                {acct(r.totStockWd)}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 w-32 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                                {acct(r.netVatTf)}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 w-32 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                                {acct(r.netVatTt)}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 w-32 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                                {acct(r.netVatBad)}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono tabular-nums font-semibold text-teal-950 dark:text-teal-200 w-32 bg-teal-50/50 dark:bg-teal-950/30 whitespace-nowrap">
                                {acct(r.netVatSold)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-200/80 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-200 border-t border-slate-300 dark:border-slate-700">
                          <tr>
                            <td className="py-2 px-3 text-left border-r border-slate-200 dark:border-slate-800">Total</td>
                            <td className="w-32 border-r border-slate-200 dark:border-slate-800"></td>
                            <td className="py-2 px-2 text-right font-mono tabular-nums w-32 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                              {acct(T.invCost)}
                            </td>
                            <td className="py-2 px-2 text-right font-mono tabular-nums w-32 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                              {acct(T.netVatInv)}
                            </td>
                            <td className="py-2 px-2 text-right font-mono tabular-nums w-32 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                              {acct(T.netVatBeg)}
                            </td>
                            <td className="py-2 px-2 text-right font-mono tabular-nums w-32 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                              {acct(T.netVatDel)}
                            </td>
                            <td className="py-2 px-2 text-right font-mono tabular-nums w-32 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                              {acct(T.totStockWd)}
                            </td>
                            <td className="py-2 px-2 text-right font-mono tabular-nums w-32 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                              {acct(T.netVatTf)}
                            </td>
                            <td className="py-2 px-2 text-right font-mono tabular-nums w-32 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                              {acct(T.netVatTt)}
                            </td>
                            <td className="py-2 px-2 text-right font-mono tabular-nums w-32 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                              {acct(T.netVatBad)}
                            </td>
                            <td className="py-2 px-2 text-right font-mono tabular-nums font-bold w-32 bg-teal-100/60 dark:bg-teal-950/60 text-teal-950 dark:text-teal-200 whitespace-nowrap">
                              {acct(T.netVatSold)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Summary Reconciliations & Cash Details */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
            {/* Cash Details for Summary */}
            <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
              <div className="bg-slate-100 dark:bg-slate-800 px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 font-semibold text-xs text-slate-800 dark:text-slate-200">
                Cash Details Summary
              </div>
              <div className="p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-600 dark:text-slate-400">Should be Sales:</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                    ₱{acct(grandTotalSales)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-600 dark:text-slate-400">Cash on Hand:</span>
                  <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                    {cashKeys.length ? `₱${acct(totalCashOnHand)}` : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-600 dark:text-slate-400 font-medium">Over / Short:</span>
                  <span
                    className={`font-mono tabular-nums font-bold px-2 py-0.5 rounded ${
                      !cashKeys.length
                        ? 'text-slate-400'
                        : totalCashOnHand - grandTotalSales < 0
                        ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                        : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                    }`}
                  >
                    {cashKeys.length ? `₱${acct(totalCashOnHand - grandTotalSales)}` : '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Transfer From Breakdown by Location */}
            <div className="rounded-xl border border-teal-200 dark:border-teal-900/60 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
              <div className="bg-teal-50 dark:bg-teal-950/60 px-4 py-2.5 border-b border-teal-200 dark:border-teal-900/60 font-semibold text-xs text-teal-900 dark:text-teal-200 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ArrowLeftRight className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                  <span>Transfer From (By Location)</span>
                </div>
                {onSelectTab && (
                  <button
                    type="button"
                    onClick={() => onSelectTab('tf')}
                    className="text-[11px] text-teal-700 dark:text-teal-300 hover:text-teal-900 dark:hover:text-teal-100 font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>Open Tab</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="p-3 space-y-2 text-xs">
                {transferFromSummary.locations.length === 0 ? (
                  <p className="text-slate-400 italic py-2 text-center">
                    No transfers received by {state.inv}.
                  </p>
                ) : (
                  <>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {transferFromSummary.locations.map(([loc, data]) => (
                        <div key={loc} className="flex items-center justify-between py-1.5">
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {loc}:
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                              {q(data.qty)}u
                            </span>
                            <span className="font-mono tabular-nums font-semibold text-teal-800 dark:text-teal-300 min-w-[65px] text-right">
                              ₱{acct(data.netCost)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800 font-bold">
                      <span className="text-teal-950 dark:text-teal-200">
                        Total Net Cost:
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-slate-600 dark:text-slate-300">
                          {q(transferFromSummary.totalQty)}u
                        </span>
                        <span className="font-mono tabular-nums text-teal-700 dark:text-teal-300 min-w-[65px] text-right">
                          ₱{acct(transferFromSummary.totalCost)}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Transfer TO & Bad Order Breakdown by Location */}
            <div className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
              <div className="bg-rose-50 dark:bg-rose-950/60 px-4 py-2.5 border-b border-rose-200 dark:border-rose-900/60 font-semibold text-xs text-rose-900 dark:text-rose-200 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ArrowRightLeft className="w-3.5 h-3.5 text-rose-700 dark:text-rose-400" />
                  <span>Transfer TO &amp; Bad Order</span>
                </div>
                {onSelectTab && (
                  <button
                    type="button"
                    onClick={() => onSelectTab('tt')}
                    className="text-[11px] text-rose-700 dark:text-rose-300 hover:text-rose-900 dark:hover:text-rose-100 font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>Open Tab</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="p-3 space-y-2 text-xs">
                {transferToSummary.locations.length === 0 && transferToSummary.totalBadQty === 0 ? (
                  <p className="text-slate-400 italic py-2 text-center">
                    No transfers to or bad orders recorded.
                  </p>
                ) : (
                  <>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {transferToSummary.locations.map(([loc, data]) => (
                        <div key={loc} className="flex items-center justify-between py-1.5">
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {loc}:
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                              {q(data.qty)}u
                            </span>
                            <span className="font-mono tabular-nums font-semibold text-teal-800 dark:text-teal-300 min-w-[65px] text-right">
                              ₱{acct(data.netCost)}
                            </span>
                          </div>
                        </div>
                      ))}
                      {transferToSummary.totalBadQty > 0 && (
                        <div className="flex items-center justify-between py-1.5 text-rose-700 dark:text-rose-400">
                          <span className="font-medium">
                            Bad Order:
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono">
                              {q(transferToSummary.totalBadQty)}u
                            </span>
                            <span className="font-mono tabular-nums font-semibold min-w-[65px] text-right">
                              ₱{acct(transferToSummary.totalBadCost)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800 font-bold">
                      <span className="text-slate-900 dark:text-slate-100">
                        Total TO + Bad:
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-slate-600 dark:text-slate-300">
                          {q(transferToSummary.totalTtQty + transferToSummary.totalBadQty)}u
                        </span>
                        <span className="font-mono tabular-nums text-rose-700 dark:text-rose-400 min-w-[65px] text-right">
                          ₱{acct(transferToSummary.totalTtCost + transferToSummary.totalBadCost)}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Change History Audit Log */}
      <ChangeHistory
        logs={state.log || []}
        currentTab={tabKey}
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
