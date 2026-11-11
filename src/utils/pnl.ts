import { AppState, Row } from '../types';
import {
  computeRows,
  num,
  unitCost,
  parseCashKey,
  addDay,
  getWeeksCount
} from './helpers';

export interface PnLPeriodData {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  isMonthly?: boolean;

  // Section 1: Profit & Loss Statement
  cashDeposited: number;
  salesNetOfVat: number;
  salesPct: number;
  costOfGoodsSold: number;
  begInventoryNetVat: number;
  deliveryNetVat: number;
  stockWithdrawalVal: number;
  transferFromNetVat: number;
  transfersToNetVat: number;
  badOrderNetVat: number;
  availableNetVat: number;
  totalCogs: number;
  grossIncome: number;
  grossIncomePct: number | null;
  cogsPct: number | null;

  // Section 2: Beginning Inventory (@cost)
  availQty: number;
  availCost: number;
  soldQty: number;
  soldCost: number;
  shouldBeQty: number;
  shouldBeCost: number;
  actualEndingQty: number;
  actualEndingCost: number;
  varianceQty: number;
  varianceCost: number;

  // Section 3: Cash Variance
  grossSales: number;
  shortOver: number;
}

export function computePnLPeriod(
  state: AppState,
  startDate: string,
  endDate: string,
  key: string,
  label: string,
  isMonthly: boolean = false
): PnLPeriodData {
  const C = computeRows(state.rows, state.items);

  // 1. Cash Deposited (Same as Cash on Hand for this period & location)
  const cashKeys = Object.keys(state.cash).filter(k => {
    const { loc, date } = parseCashKey(k);
    return loc === state.inv && date >= startDate && date <= endDate && state.cash[k] !== '';
  });
  const cashDeposited = cashKeys.reduce((t, k) => t + num(state.cash[k]), 0);

  // Rule 1: Sales - Net of Vat is Cash Deposited divided by 1.12
  const salesNetOfVat = cashDeposited / 1.12;

  // Filter rows within date range for the active branch
  const rangeRowIndices = state.rows
    .map((r, i) => i)
    .filter(i => {
      const r = state.rows[i];
      return r.loc === state.inv && r.no !== '' && r.date >= startDate && r.date <= endDate;
    })
    .sort((x, y) => state.rows[x].date.localeCompare(state.rows[y].date) || x - y);

  const itemRowMap: Record<number, number[]> = {};
  rangeRowIndices.forEach(i => {
    const no = state.rows[i].no as number;
    (itemRowMap[no] = itemRowMap[no] || []).push(i);
  });

  const lines = Object.keys(itemRowMap).map(Number).sort((x, y) => x - y);

  let begInventoryNetVat = 0;
  let deliveryNetVat = 0;
  let stockWithdrawalVal = 0;
  let transferFromNetVat = 0;
  let transfersToNetVat = 0;
  let badOrderNetVat = 0;
  let totalCogs = 0;
  let grossSales = 0;

  let availQty = 0;
  let availCost = 0;
  let soldQty = 0;
  let soldCost = 0;
  let actualEndingQty = 0;
  let actualEndingCost = 0;

  lines.forEach(no => {
    const rs = itemRowMap[no];
    const sum = (field: keyof Row) => rs.reduce((t, i) => t + num(state.rows[i][field]), 0);
    const it = state.items.find(x => x.no === no);
    const uCost = it ? unitCost(it) : 0;
    const isVat = it?.vat !== 'NVAT';
    const calcNet = (qty: number) => (isVat ? (qty * uCost) / 1.12 : qty * uCost);

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

    // Weekly Cost & Net of VAT computations (Rule 4)
    begInventoryNetVat += calcNet(beg);
    deliveryNetVat += calcNet(del);
    stockWithdrawalVal += wd * num(it?.wd);
    transferFromNetVat += calcNet(tf);
    transfersToNetVat += calcNet(tt);
    badOrderNetVat += calcNet(bad);

    // Rule 6: Total COGS = Items Total Good Sold multiplied by their Unit Cost
    const itemCogs = sold * uCost;
    totalCogs += itemCogs;

    // Gross Sales = Should Be Sales (Rule 3)
    grossSales += sold * srp;

    // Rule 7: Available in Beginning Inventory - Cost is Goods Avail Total and
    // Quantity Sold is Goods Sold Total beside is their Total Item Quantity multiplied by their Cost
    availQty += tg;
    availCost += tg * uCost;
    soldQty += sold;
    soldCost += itemCogs;

    // Rule 9: Actual Ending Inventory is the Ending Inv of the last day of the week
    actualEndingQty += end;
    actualEndingCost += end * uCost;
  });

  // Rule 5: Available formula is (Beginning Inventory+Delivery+Stock Withdrawal+Transfer FROM)-(Transfer TO+Bad Order)
  const availableNetVat =
    begInventoryNetVat +
    deliveryNetVat +
    stockWithdrawalVal +
    transferFromNetVat -
    (transfersToNetVat + badOrderNetVat);

  // Gross Income = (Sales - Net of Vat) - Total COGS
  const grossIncome = salesNetOfVat - totalCogs;

  const grossIncomePct = salesNetOfVat !== 0 ? (grossIncome / salesNetOfVat) * 100 : null;
  const cogsPct = salesNetOfVat !== 0 ? (totalCogs / salesNetOfVat) * 100 : null;

  // Rule 8: Should Be Inventory formula is Available minus Quantity Sold
  const shouldBeQty = availQty - soldQty;
  const shouldBeCost = availCost - soldCost;

  // Rule 10: Variance formula is Should be inventory minus Actual ending Inventory
  const varianceQty = shouldBeQty - actualEndingQty;
  const varianceCost = shouldBeCost - actualEndingCost;

  // Rule 12: Short/Over is Cash Deposited minus Gross Sales
  const shortOver = cashDeposited - grossSales;

  return {
    key,
    label,
    startDate,
    endDate,
    isMonthly,
    cashDeposited,
    salesNetOfVat,
    salesPct: 100,
    costOfGoodsSold: totalCogs,
    begInventoryNetVat,
    deliveryNetVat,
    stockWithdrawalVal,
    transferFromNetVat,
    transfersToNetVat,
    badOrderNetVat,
    availableNetVat,
    totalCogs,
    grossIncome,
    grossIncomePct,
    cogsPct,
    availQty,
    availCost,
    soldQty,
    soldCost,
    shouldBeQty,
    shouldBeCost,
    actualEndingQty,
    actualEndingCost,
    varianceQty,
    varianceCost,
    grossSales,
    shortOver
  };
}

export function getAllPnLData(state: AppState): {
  weeks: PnLPeriodData[];
  monthly: PnLPeriodData;
} {
  const weeksCount = getWeeksCount(state.start, state.cut);
  const weeks: PnLPeriodData[] = [];

  for (let k = 1; k <= weeksCount; k++) {
    const a = addDay(state.start, 7 * (k - 1));
    let b = addDay(a, 6);
    if (b > state.cut) b = state.cut;

    weeks.push(computePnLPeriod(state, a, b, `w${k}`, `Week ${k}`, false));
  }

  const monthly = computePnLPeriod(
    state,
    state.start,
    state.cut,
    'mo',
    'Monthly Summary',
    true
  );

  return { weeks, monthly };
}
