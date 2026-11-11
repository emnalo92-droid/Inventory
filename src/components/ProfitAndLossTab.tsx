import React, { useState } from 'react';
import {
  Download,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Layers,
  Calendar,
  AlertCircle,
  FileSpreadsheet
} from 'lucide-react';
import { AppState } from '../types';
import { acct, f2, fd, q } from '../utils/helpers';
import { getAllPnLData, PnLPeriodData } from '../utils/pnl';
import { exportProfitAndLoss } from '../utils/excel';

interface ProfitAndLossTabProps {
  state: AppState;
  canAdmin: boolean;
}

export const ProfitAndLossTab: React.FC<ProfitAndLossTabProps> = ({
  state,
  canAdmin
}) => {
  const { weeks, monthly } = getAllPnLData(state);
  const allPeriods: PnLPeriodData[] = [...weeks, monthly];

  // View state: 'comparison' (all weeks + monthly side-by-side) or specific period key ('mo', 'w1', 'w2', etc.)
  const [selectedView, setSelectedView] = useState<string>('comparison');

  const activePeriod =
    selectedView === 'comparison'
      ? monthly
      : allPeriods.find(p => p.key === selectedView) || monthly;

  return (
    <div className="space-y-5">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-300 dark:border-slate-700 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-teal-100 dark:bg-teal-950/80 text-teal-800 dark:text-teal-300 rounded-lg">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                Profit and Loss Statement
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Weekly &amp; Monthly Summary computation for{' '}
                <span className="font-semibold text-teal-800 dark:text-teal-400">
                  {state.inv}
                </span>{' '}
                ({fd(state.start)} to {fd(state.cut)})
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Period View Selector */}
          <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setSelectedView('comparison')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                selectedView === 'comparison'
                  ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-300 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Side-by-Side Comparison</span>
            </button>
            {weeks.map(w => (
              <button
                key={w.key}
                type="button"
                onClick={() => setSelectedView(w.key)}
                className={`px-2.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                  selectedView === w.key
                    ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-300 shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {w.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSelectedView('mo')}
              className={`px-2.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                selectedView === 'mo'
                  ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-300 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Month Total
            </button>
          </div>

          {/* Export to Excel */}
          <button
            type="button"
            onClick={() => exportProfitAndLoss(state)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export P&amp;L (Excel)</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Overview Cards for the Monthly / Selected Period */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-300 dark:border-slate-700 shadow-xs">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {selectedView === 'comparison' ? 'Monthly' : activePeriod.label} Sales (Net of VAT)
          </p>
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
            ₱{f2(activePeriod.salesNetOfVat)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Cash Deposited: ₱{f2(activePeriod.cashDeposited)} / 1.12
          </p>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-300 dark:border-slate-700 shadow-xs">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Cost of Goods Sold (COGS)
          </p>
          <p className="text-xl font-bold text-amber-800 dark:text-amber-400 mt-1">
            ₱{f2(activePeriod.totalCogs)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {q(activePeriod.soldQty)} items sold @ unit cost
          </p>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-300 dark:border-slate-700 shadow-xs">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Gross Income
          </p>
          <p
            className={`text-xl font-bold mt-1 ${
              activePeriod.grossIncome >= 0
                ? 'text-teal-800 dark:text-teal-400'
                : 'text-rose-800 dark:text-rose-400'
            }`}
          >
            ₱{f2(activePeriod.grossIncome)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Sales Net of VAT − Total COGS
          </p>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-300 dark:border-slate-700 shadow-xs">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Cash Short / Over
          </p>
          <p
            className={`text-xl font-bold mt-1 ${
              activePeriod.shortOver >= 0
                ? 'text-teal-800 dark:text-teal-400'
                : 'text-rose-800 dark:text-rose-400'
            }`}
          >
            ₱{f2(activePeriod.shortOver)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Cash Deposited − Gross Sales
          </p>
        </div>
      </div>

      {/* Main Content Area */}
      {selectedView === 'comparison' ? (
        /* SIDE-BY-SIDE ALL WEEKS + MONTHLY SUMMARY TABLE */
        <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-300 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-teal-800 dark:text-teal-400" />
                <span>Executive Profit &amp; Loss Comparison</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Weekly progress alongside the Monthly Summary computation
              </p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-teal-100 text-teal-800 dark:bg-teal-950/80 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
              {allPeriods.length - 1} Weeks + Month Total
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-300 dark:border-slate-700">
                <tr className="align-middle">
                  <th className="py-2.5 px-4 min-w-[240px] border-r border-slate-300 dark:border-slate-700">
                    Financial Metric / Account
                  </th>
                  {weeks.map(w => (
                    <th
                      key={w.key}
                      className="py-2.5 px-3 text-center min-w-[120px] border-r border-slate-300 dark:border-slate-700"
                    >
                      <div>{w.label}</div>
                      <div className="text-[10px] font-normal text-slate-500">
                        {fd(w.startDate)} - {fd(w.endDate)}
                      </div>
                    </th>
                  ))}
                  <th className="py-2.5 px-3 text-center min-w-[130px] bg-teal-50 dark:bg-teal-950/50 text-teal-900 dark:text-teal-200 font-bold">
                    <div>Monthly Summary</div>
                    <div className="text-[10px] font-normal text-teal-700 dark:text-teal-400">
                      {fd(monthly.startDate)} - {fd(monthly.endDate)}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {/* 1. PROFIT AND LOSS STATEMENT */}
                <tr className="bg-slate-100/70 dark:bg-slate-800/50 font-bold text-slate-800 dark:text-slate-200">
                  <td
                    colSpan={allPeriods.length + 1}
                    className="py-2 px-4 uppercase tracking-wider text-[11px]"
                  >
                    1. Profit and Loss
                  </td>
                </tr>

                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-2 px-4 font-semibold text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800">
                    Sales - Net of Vat
                  </td>
                  {weeks.map(w => (
                    <td
                      key={w.key}
                      className="py-2 px-3 text-right font-medium border-r border-slate-200 dark:border-slate-800"
                    >
                      {acct(w.salesNetOfVat)}
                    </td>
                  ))}
                  <td className="py-2 px-3 text-right font-bold text-teal-900 dark:text-teal-300 bg-teal-50/40 dark:bg-teal-950/20">
                    {acct(monthly.salesNetOfVat)}
                  </td>
                </tr>

                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-2 px-4 font-semibold text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800">
                    Cost of Goods Sold
                  </td>
                  {weeks.map(w => (
                    <td
                      key={w.key}
                      className="py-2 px-3 text-right font-medium border-r border-slate-200 dark:border-slate-800"
                    >
                      {acct(w.costOfGoodsSold)}
                    </td>
                  ))}
                  <td className="py-2 px-3 text-right font-bold text-slate-900 dark:text-slate-100 bg-teal-50/40 dark:bg-teal-950/20">
                    {acct(monthly.costOfGoodsSold)}
                  </td>
                </tr>

                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-2 px-4 text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800">
                    Beginning Inventory
                  </td>
                  {weeks.map(w => (
                    <td
                      key={w.key}
                      className="py-2 px-3 text-right border-r border-slate-200 dark:border-slate-800"
                    >
                      {acct(w.begInventoryNetVat)}
                    </td>
                  ))}
                  <td className="py-2 px-3 text-right font-medium bg-teal-50/40 dark:bg-teal-950/20">
                    {acct(monthly.begInventoryNetVat)}
                  </td>
                </tr>

                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-400">
                  <td className="py-1.5 pl-8 pr-4 border-r border-slate-200 dark:border-slate-800">
                    Delivery
                  </td>
                  {weeks.map(w => (
                    <td
                      key={w.key}
                      className="py-1.5 px-3 text-right border-r border-slate-200 dark:border-slate-800"
                    >
                      {acct(w.deliveryNetVat)}
                    </td>
                  ))}
                  <td className="py-1.5 px-3 text-right bg-teal-50/40 dark:bg-teal-950/20">
                    {acct(monthly.deliveryNetVat)}
                  </td>
                </tr>

                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-400">
                  <td className="py-1.5 pl-8 pr-4 border-r border-slate-200 dark:border-slate-800">
                    Stock withdrawal
                  </td>
                  {weeks.map(w => (
                    <td
                      key={w.key}
                      className="py-1.5 px-3 text-right border-r border-slate-200 dark:border-slate-800"
                    >
                      {acct(w.stockWithdrawalVal)}
                    </td>
                  ))}
                  <td className="py-1.5 px-3 text-right bg-teal-50/40 dark:bg-teal-950/20">
                    {acct(monthly.stockWithdrawalVal)}
                  </td>
                </tr>

                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-400">
                  <td className="py-1.5 pl-8 pr-4 border-r border-slate-200 dark:border-slate-800">
                    Transfer FROM
                  </td>
                  {weeks.map(w => (
                    <td
                      key={w.key}
                      className="py-1.5 px-3 text-right border-r border-slate-200 dark:border-slate-800"
                    >
                      {acct(w.transferFromNetVat)}
                    </td>
                  ))}
                  <td className="py-1.5 px-3 text-right bg-teal-50/40 dark:bg-teal-950/20">
                    {acct(monthly.transferFromNetVat)}
                  </td>
                </tr>

                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-400">
                  <td className="py-1.5 pl-8 pr-4 border-r border-slate-200 dark:border-slate-800">
                    Transfers TO
                  </td>
                  {weeks.map(w => (
                    <td
                      key={w.key}
                      className="py-1.5 px-3 text-right border-r border-slate-200 dark:border-slate-800"
                    >
                      {acct(w.transfersToNetVat)}
                    </td>
                  ))}
                  <td className="py-1.5 px-3 text-right bg-teal-50/40 dark:bg-teal-950/20">
                    {acct(monthly.transfersToNetVat)}
                  </td>
                </tr>

                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-400">
                  <td className="py-1.5 pl-8 pr-4 border-r border-slate-200 dark:border-slate-800">
                    Bad Order
                  </td>
                  {weeks.map(w => (
                    <td
                      key={w.key}
                      className="py-1.5 px-3 text-right border-r border-slate-200 dark:border-slate-800"
                    >
                      {acct(w.badOrderNetVat)}
                    </td>
                  ))}
                  <td className="py-1.5 px-3 text-right bg-teal-50/40 dark:bg-teal-950/20">
                    {acct(monthly.badOrderNetVat)}
                  </td>
                </tr>

                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 font-semibold bg-slate-50 dark:bg-slate-800/30">
                  <td className="py-2 px-4 text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800">
                    Available
                  </td>
                  {weeks.map(w => (
                    <td
                      key={w.key}
                      className="py-2 px-3 text-right border-r border-slate-200 dark:border-slate-800"
                    >
                      {acct(w.availableNetVat)}
                    </td>
                  ))}
                  <td className="py-2 px-3 text-right font-bold bg-teal-50/40 dark:bg-teal-950/20">
                    {acct(monthly.availableNetVat)}
                  </td>
                </tr>

                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 font-semibold">
                  <td className="py-2 pl-8 pr-4 text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800">
                    Total Cogs
                  </td>
                  {weeks.map(w => (
                    <td
                      key={w.key}
                      className="py-2 px-3 text-right border-r border-slate-200 dark:border-slate-800"
                    >
                      {acct(w.totalCogs)}
                    </td>
                  ))}
                  <td className="py-2 px-3 text-right font-bold bg-teal-50/40 dark:bg-teal-950/20">
                    {acct(monthly.totalCogs)}
                  </td>
                </tr>

                <tr className="bg-amber-50/60 dark:bg-amber-950/30 font-bold border-t border-b border-amber-200 dark:border-amber-800/60">
                  <td className="py-2.5 px-4 text-slate-900 dark:text-slate-100 border-r border-amber-200 dark:border-amber-800/60">
                    Gross Income
                  </td>
                  {weeks.map(w => (
                    <td
                      key={w.key}
                      className={`py-2.5 px-3 text-right border-r border-amber-200 dark:border-amber-800/60 ${
                        w.grossIncome >= 0
                          ? 'text-teal-900 dark:text-teal-300'
                          : 'text-rose-800 dark:text-rose-400'
                      }`}
                    >
                      {acct(w.grossIncome)}
                    </td>
                  ))}
                  <td
                    className={`py-2.5 px-3 text-right font-extrabold ${
                      monthly.grossIncome >= 0
                        ? 'text-teal-900 dark:text-teal-300'
                        : 'text-rose-800 dark:text-rose-400'
                    }`}
                  >
                    {acct(monthly.grossIncome)}
                  </td>
                </tr>

                {/* 2. BEGINNING INVENTORY (@COST) */}
                <tr className="bg-slate-100/70 dark:bg-slate-800/50 font-bold text-slate-800 dark:text-slate-200">
                  <td
                    colSpan={allPeriods.length + 1}
                    className="py-2 px-4 uppercase tracking-wider text-[11px]"
                  >
                    2. Beginning Inventory (@cost)
                  </td>
                </tr>

                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-2 px-4 text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800">
                    Available (Qty / Cost)
                  </td>
                  {weeks.map(w => (
                    <td
                      key={w.key}
                      className="py-2 px-3 text-right border-r border-slate-200 dark:border-slate-800"
                    >
                      <span className="text-slate-500 mr-1">({q(w.availQty)})</span>
                      <span className="font-medium">{acct(w.availCost)}</span>
                    </td>
                  ))}
                  <td className="py-2 px-3 text-right font-bold bg-teal-50/40 dark:bg-teal-950/20">
                    <span className="text-slate-500 mr-1">({q(monthly.availQty)})</span>
                    <span>{acct(monthly.availCost)}</span>
                  </td>
                </tr>

                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-2 px-4 text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800">
                    Qty Sold (Qty / Cost)
                  </td>
                  {weeks.map(w => (
                    <td
                      key={w.key}
                      className="py-2 px-3 text-right border-r border-slate-200 dark:border-slate-800"
                    >
                      <span className="text-slate-500 mr-1">({q(w.soldQty)})</span>
                      <span className="font-medium">{acct(w.soldCost)}</span>
                    </td>
                  ))}
                  <td className="py-2 px-3 text-right font-bold bg-teal-50/40 dark:bg-teal-950/20">
                    <span className="text-slate-500 mr-1">({q(monthly.soldQty)})</span>
                    <span>{acct(monthly.soldCost)}</span>
                  </td>
                </tr>

                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-2 px-4 text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800">
                    Should be Inventory (Qty / Cost)
                  </td>
                  {weeks.map(w => (
                    <td
                      key={w.key}
                      className="py-2 px-3 text-right border-r border-slate-200 dark:border-slate-800"
                    >
                      <span className="text-slate-500 mr-1">({q(w.shouldBeQty)})</span>
                      <span className="font-medium">{acct(w.shouldBeCost)}</span>
                    </td>
                  ))}
                  <td className="py-2 px-3 text-right font-bold bg-teal-50/40 dark:bg-teal-950/20">
                    <span className="text-slate-500 mr-1">({q(monthly.shouldBeQty)})</span>
                    <span>{acct(monthly.shouldBeCost)}</span>
                  </td>
                </tr>

                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-2 px-4 text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800">
                    Actual Ending Inventory (Qty / Cost)
                  </td>
                  {weeks.map(w => (
                    <td
                      key={w.key}
                      className="py-2 px-3 text-right border-r border-slate-200 dark:border-slate-800"
                    >
                      <span className="text-slate-500 mr-1">({q(w.actualEndingQty)})</span>
                      <span className="font-medium">{acct(w.actualEndingCost)}</span>
                    </td>
                  ))}
                  <td className="py-2 px-3 text-right font-bold bg-teal-50/40 dark:bg-teal-950/20">
                    <span className="text-slate-500 mr-1">({q(monthly.actualEndingQty)})</span>
                    <span>{acct(monthly.actualEndingCost)}</span>
                  </td>
                </tr>

                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 font-semibold bg-slate-50/70 dark:bg-slate-800/30">
                  <td className="py-2 px-4 text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800">
                    Variance (Qty / Cost)
                  </td>
                  {weeks.map(w => (
                    <td
                      key={w.key}
                      className={`py-2 px-3 text-right border-r border-slate-200 dark:border-slate-800 ${
                        w.varianceCost !== 0 ? 'text-amber-800 dark:text-amber-400' : ''
                      }`}
                    >
                      <span className="text-slate-500 mr-1">({q(w.varianceQty)})</span>
                      <span>{acct(w.varianceCost)}</span>
                    </td>
                  ))}
                  <td
                    className={`py-2 px-3 text-right font-bold bg-teal-50/40 dark:bg-teal-950/20 ${
                      monthly.varianceCost !== 0 ? 'text-amber-800 dark:text-amber-400' : ''
                    }`}
                  >
                    <span className="text-slate-500 mr-1">({q(monthly.varianceQty)})</span>
                    <span>{acct(monthly.varianceCost)}</span>
                  </td>
                </tr>

                {/* 3. CASH VARIANCE */}
                <tr className="bg-slate-100/70 dark:bg-slate-800/50 font-bold text-slate-800 dark:text-slate-200">
                  <td
                    colSpan={allPeriods.length + 1}
                    className="py-2 px-4 uppercase tracking-wider text-[11px]"
                  >
                    3. Cash Variance
                  </td>
                </tr>

                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-2 px-4 text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800">
                    Cash Deposited (Cash on Hand)
                  </td>
                  {weeks.map(w => (
                    <td
                      key={w.key}
                      className="py-2 px-3 text-right font-medium border-r border-slate-200 dark:border-slate-800"
                    >
                      {acct(w.cashDeposited)}
                    </td>
                  ))}
                  <td className="py-2 px-3 text-right font-bold bg-teal-50/40 dark:bg-teal-950/20">
                    {acct(monthly.cashDeposited)}
                  </td>
                </tr>

                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-2 px-4 text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800">
                    Gross Sales (Should be Sales)
                  </td>
                  {weeks.map(w => (
                    <td
                      key={w.key}
                      className="py-2 px-3 text-right font-medium border-r border-slate-200 dark:border-slate-800"
                    >
                      {acct(w.grossSales)}
                    </td>
                  ))}
                  <td className="py-2 px-3 text-right font-bold bg-teal-50/40 dark:bg-teal-950/20">
                    {acct(monthly.grossSales)}
                  </td>
                </tr>

                <tr className="bg-slate-100/60 dark:bg-slate-800/60 font-bold">
                  <td className="py-2.5 px-4 text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800">
                    Short / Over (Cash Deposited − Gross Sales)
                  </td>
                  {weeks.map(w => (
                    <td
                      key={w.key}
                      className={`py-2.5 px-3 text-right border-r border-slate-200 dark:border-slate-800 ${
                        w.shortOver >= 0
                          ? 'text-teal-900 dark:text-teal-300'
                          : 'text-rose-800 dark:text-rose-400'
                      }`}
                    >
                      {acct(w.shortOver)}
                    </td>
                  ))}
                  <td
                    className={`py-2.5 px-3 text-right font-extrabold ${
                      monthly.shortOver >= 0
                        ? 'text-teal-900 dark:text-teal-300'
                        : 'text-rose-800 dark:text-rose-400'
                    }`}
                  >
                    {acct(monthly.shortOver)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* DETAILED STATEMENT VIEW (Matches user requested breakdown structure exactly) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-teal-800 dark:text-teal-400" />
            <span>
              Detailed Statement — {activePeriod.label} ({fd(activePeriod.startDate)} to {fd(activePeriod.endDate)})
            </span>
          </h3>
          {selectedView === 'comparison' && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Showing Monthly Summary view below. Use buttons above to view specific week.
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Table 1: Profit & Loss Statement (7 cols on lg) */}
          <div className="lg:col-span-7 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            <div className="px-4 py-3 bg-slate-100/90 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold border-b border-slate-300 dark:border-slate-700 flex justify-between items-center text-xs">
              <span className="uppercase tracking-wider">
                {activePeriod.label} — Profit and Loss
              </span>
              <span className="text-slate-500 font-normal">
                {fd(activePeriod.startDate)} to {fd(activePeriod.endDate)}
              </span>
            </div>

            <table className="w-full text-xs text-left border-collapse">
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {/* Sales - Net of Vat */}
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-slate-100">
                    Sales - Net of Vat
                  </td>
                  <td className="py-2.5 px-4 text-right font-bold text-slate-900 dark:text-slate-100">
                    {acct(activePeriod.salesNetOfVat)}
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-500 w-24">
                    {activePeriod.salesNetOfVat !== 0 ? '100%' : '100%'}
                  </td>
                </tr>

                {/* Cost of Goods Sold */}
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-slate-100">
                    Cost of Goods Sold
                  </td>
                  <td className="py-2.5 px-4 text-right font-bold text-slate-900 dark:text-slate-100">
                    {acct(activePeriod.costOfGoodsSold)}
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-500 w-24">
                    {activePeriod.cogsPct !== null
                      ? `${activePeriod.cogsPct.toFixed(1)}%`
                      : ''}
                  </td>
                </tr>

                {/* Beginning Inventory */}
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-4 text-slate-800 dark:text-slate-200">
                    Beginning Inventory
                  </td>
                  <td className="py-2.5 px-4 text-right font-medium">
                    {acct(activePeriod.begInventoryNetVat)}
                  </td>
                  <td className="py-2.5 px-4"></td>
                </tr>

                {/* Delivery */}
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-400">
                  <td className="py-2 pl-8 pr-4">Delivery</td>
                  <td className="py-2 px-4 text-right">{acct(activePeriod.deliveryNetVat)}</td>
                  <td className="py-2 px-4"></td>
                </tr>

                {/* Stock withdrawal */}
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-400">
                  <td className="py-2 pl-8 pr-4">Stock withdrawal</td>
                  <td className="py-2 px-4 text-right">
                    {acct(activePeriod.stockWithdrawalVal)}
                  </td>
                  <td className="py-2 px-4"></td>
                </tr>

                {/* Transfer FROM */}
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-400">
                  <td className="py-2 pl-8 pr-4">Transfer FROM</td>
                  <td className="py-2 px-4 text-right">
                    {acct(activePeriod.transferFromNetVat)}
                  </td>
                  <td className="py-2 px-4"></td>
                </tr>

                {/* Transfers TO */}
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-400">
                  <td className="py-2 pl-8 pr-4">Transfers TO</td>
                  <td className="py-2 px-4 text-right">
                    {acct(activePeriod.transfersToNetVat)}
                  </td>
                  <td className="py-2 px-4"></td>
                </tr>

                {/* Bad Order */}
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-400">
                  <td className="py-2 pl-8 pr-4">Bad Order</td>
                  <td className="py-2 px-4 text-right">
                    {acct(activePeriod.badOrderNetVat)}
                  </td>
                  <td className="py-2 px-4"></td>
                </tr>

                {/* Available */}
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 font-semibold bg-slate-50 dark:bg-slate-800/30">
                  <td className="py-2.5 px-4 text-slate-900 dark:text-slate-100">
                    Available
                  </td>
                  <td className="py-2.5 px-4 text-right font-bold text-slate-900 dark:text-slate-100">
                    {acct(activePeriod.availableNetVat)}
                  </td>
                  <td className="py-2.5 px-4"></td>
                </tr>

                {/* Total Cogs */}
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 font-semibold">
                  <td className="py-2.5 pl-8 pr-4 text-slate-800 dark:text-slate-200">
                    Total Cogs
                  </td>
                  <td className="py-2.5 px-4 text-right font-bold text-slate-900 dark:text-slate-100">
                    {acct(activePeriod.totalCogs)}
                  </td>
                  <td className="py-2.5 px-4"></td>
                </tr>

                {/* Gross Income */}
                <tr className="bg-amber-50/70 dark:bg-amber-950/40 font-bold border-t border-amber-300 dark:border-amber-800">
                  <td className="py-3 px-4 text-slate-900 dark:text-slate-100 text-sm">
                    Gross Income
                  </td>
                  <td
                    className={`py-3 px-4 text-right text-sm ${
                      activePeriod.grossIncome >= 0
                        ? 'text-teal-900 dark:text-teal-300'
                        : 'text-rose-800 dark:text-rose-400'
                    }`}
                  >
                    {acct(activePeriod.grossIncome)}
                  </td>
                  <td className="py-3 px-4 text-right text-xs text-slate-500">
                    {activePeriod.grossIncomePct !== null
                      ? `${activePeriod.grossIncomePct.toFixed(1)}%`
                      : ''}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Right Column: Tables 2 & 3 (5 cols on lg) */}
          <div className="lg:col-span-5 space-y-5">
            {/* Table 2: Beginning Inventory (@cost) */}
            <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
              <div className="px-4 py-3 bg-slate-100/90 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold border-b border-slate-300 dark:border-slate-700 text-xs uppercase tracking-wider">
                Beginning Inventory (@cost)
              </div>

              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2 px-3">Metric</th>
                    <th className="py-2 px-3 text-center w-24">Quantity</th>
                    <th className="py-2 px-3 text-right w-32">Amount (@Cost)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-3 pl-6 text-slate-800 dark:text-slate-200">
                      Available
                    </td>
                    <td className="py-2 px-3 text-center font-medium">
                      {q(activePeriod.availQty)}
                    </td>
                    <td className="py-2 px-3 text-right font-medium">
                      {acct(activePeriod.availCost)}
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-3 pl-6 text-slate-800 dark:text-slate-200">
                      Qty Sold
                    </td>
                    <td className="py-2 px-3 text-center font-medium">
                      {q(activePeriod.soldQty)}
                    </td>
                    <td className="py-2 px-3 text-right font-medium">
                      {acct(activePeriod.soldCost)}
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 font-semibold bg-slate-50/50 dark:bg-slate-800/20">
                    <td className="py-2 px-3 text-slate-900 dark:text-slate-100">
                      Should be Inventory
                    </td>
                    <td className="py-2 px-3 text-center font-bold">
                      {q(activePeriod.shouldBeQty) || '-'}
                    </td>
                    <td className="py-2 px-3 text-right font-bold">
                      {acct(activePeriod.shouldBeCost)}
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-3 pl-6 text-slate-800 dark:text-slate-200">
                      Actual Ending Inventory
                    </td>
                    <td className="py-2 px-3 text-center font-medium">
                      {q(activePeriod.actualEndingQty) || '-'}
                    </td>
                    <td className="py-2 px-3 text-right font-medium">
                      {acct(activePeriod.actualEndingCost)}
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 font-bold bg-amber-50/40 dark:bg-amber-950/20">
                    <td className="py-2.5 px-3 pl-6 text-slate-900 dark:text-slate-100">
                      Variance
                    </td>
                    <td
                      className={`py-2.5 px-3 text-center ${
                        activePeriod.varianceQty !== 0
                          ? 'text-amber-800 dark:text-amber-400'
                          : ''
                      }`}
                    >
                      {q(activePeriod.varianceQty) || '-'}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right ${
                        activePeriod.varianceCost !== 0
                          ? 'text-amber-800 dark:text-amber-400'
                          : ''
                      }`}
                    >
                      {acct(activePeriod.varianceCost)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Table 3: Cash Variance */}
            <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
              <div className="px-4 py-3 bg-slate-100/90 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold border-b border-slate-300 dark:border-slate-700 text-xs uppercase tracking-wider">
                Cash Variance
              </div>

              <table className="w-full text-xs text-left border-collapse">
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-4 pl-6 text-slate-800 dark:text-slate-200">
                      Cash Deposited
                    </td>
                    <td className="py-2.5 px-4 text-right font-medium text-slate-900 dark:text-slate-100">
                      {acct(activePeriod.cashDeposited)}
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-4 pl-6 text-slate-800 dark:text-slate-200">
                      Gross Sales
                    </td>
                    <td className="py-2.5 px-4 text-right font-medium text-slate-900 dark:text-slate-100">
                      {acct(activePeriod.grossSales)}
                    </td>
                  </tr>

                  <tr className="bg-slate-100/70 dark:bg-slate-800/70 font-bold">
                    <td className="py-3 px-4 pl-6 text-slate-900 dark:text-slate-100 text-xs">
                      Short / Over
                    </td>
                    <td
                      className={`py-3 px-4 text-right text-xs ${
                        activePeriod.shortOver >= 0
                          ? 'text-teal-900 dark:text-teal-300'
                          : 'text-rose-800 dark:text-rose-400'
                      }`}
                    >
                      {acct(activePeriod.shortOver)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Formula & Reference Card */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/80 text-[11px] text-slate-600 dark:text-slate-400 space-y-1.5 leading-relaxed">
              <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 mb-1">
                <AlertCircle className="w-3.5 h-3.5 text-teal-800 dark:text-teal-400" />
                <span>Accounting Formulas Applied:</span>
              </div>
              <p>• <strong>Sales - Net of VAT:</strong> Cash Deposited ÷ 1.12</p>
              <p>• <strong>Available:</strong> (Beginning Inv + Del + Stock Wd + TF In) − (TT Out + Bad Order)</p>
              <p>• <strong>Total COGS:</strong> Quantity Sold × Item Unit Cost</p>
              <p>• <strong>Gross Income:</strong> (Sales Net of VAT) − Total COGS</p>
              <p>• <strong>Inventory Variance:</strong> Should Be Inventory − Actual Ending Inv</p>
              <p>• <strong>Short/Over:</strong> Cash Deposited − Gross (Should Be) Sales</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
