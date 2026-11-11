import { User } from '../types';

export interface TabPermissionDef {
  id: string; // Internal tab identifier, e.g. 'entry', 'w1', 'mo', 'cash', etc.
  name: string; // Friendly display name, e.g. 'Data Entry'
  category: 'daily' | 'reports' | 'system';
  description: string;
}

export const SYSTEM_TABS: TabPermissionDef[] = [
  // Daily Store Operations
  {
    id: 'entry',
    name: 'Data Entry',
    category: 'daily',
    description: 'Daily AM/PM inventory movement, deliveries, sales and ending balance ledger'
  },
  {
    id: 'cash',
    name: 'Cash Details Summary',
    category: 'daily',
    description: 'Cashier shift collections, denomination breakdown, pay-in/out and short/over'
  },
  {
    id: 'tf',
    name: 'Transfer From',
    category: 'daily',
    description: 'Outbound inventory transfers to other branch locations'
  },
  {
    id: 'tt',
    name: 'Transfer To',
    category: 'daily',
    description: 'Inbound inventory transfers from other branches and damaged/bad order returns'
  },

  // Financial & Variance Reports
  {
    id: 'weekly',
    name: 'Weekly Summaries',
    category: 'reports',
    description: 'Week 1 through Week 5 period sales summaries, stock movement and cost analysis'
  },
  {
    id: 'mo',
    name: 'Monthly Summary',
    category: 'reports',
    description: 'Consolidated cycle monthly sales totals, inventory valuation and cost variances'
  },
  {
    id: 'pnl',
    name: 'Profit and Loss',
    category: 'reports',
    description: 'Financial income statement, sales net of VAT, cost of goods sold, and gross margin'
  },
  {
    id: 'soldout',
    name: 'Items Sold Out Summary',
    category: 'reports',
    description: 'Weekly and monthly summary of quantities sold out and monthly averages sorted by sales velocity'
  },

  // System Catalog & Administration
  {
    id: 'master',
    name: 'Item Master',
    category: 'system',
    description: 'Product master database, item codes, categories, retail prices (SRP) and VAT'
  },
  {
    id: 'drive',
    name: 'Google Drive',
    category: 'system',
    description: 'Cloud backups to Google Drive, automatic file synchronization and Excel export'
  },
  {
    id: 'users',
    name: 'User Access',
    category: 'system',
    description: 'Employee profiles, access rights, tab permissions, passwords and security restrictions'
  },
  {
    id: 'setup',
    name: 'Setup',
    category: 'system',
    description: 'Store branch locations, cashier directory, and cycle start/cutoff date configurations'
  }
];

// Tab Access choices for the User Access management tab
export const TAB_ACCESS_OPTIONS: { name: string; category: string; description: string }[] = [
  { name: 'All', category: 'Full System', description: 'Unrestricted access to all current and future tabs' },
  { name: 'Data Entry', category: 'Daily Operations', description: 'Daily inventory sales & ledger entry' },
  { name: 'Weekly Summaries', category: 'Reports', description: 'Week 1 to Week 5 summaries' },
  { name: 'Monthly Summary', category: 'Reports', description: 'Consolidated monthly summary report' },
  { name: 'Cash Details Summary', category: 'Daily Operations', description: 'Cashier shifts & cash denomination counts' },
  { name: 'Profit and Loss', category: 'Reports', description: 'P&L income statement & margin breakdown' },
  { name: 'Transfer From', category: 'Daily Operations', description: 'Outbound inventory transfer processing' },
  { name: 'Transfer To', category: 'Daily Operations', description: 'Inbound inventory transfer & bad orders' },
  { name: 'Items Sold Out Summary', category: 'Reports', description: 'Weekly & monthly sold out quantities and average' },
  { name: 'Item Master', category: 'Administration', description: 'Catalog items, prices and VAT status' },
  { name: 'Google Drive', category: 'Administration', description: 'Cloud backups & Google Drive operations' },
  { name: 'User Access', category: 'Administration', description: 'Manage employee accounts and credentials' },
  { name: 'Setup', category: 'Administration', description: 'Branch locations & cashier directory setup' },
  { name: 'View Only', category: 'Operational Flags', description: 'Enforce read-only browsing mode across permitted tabs' },
  { name: 'Inventory Location', category: 'Operational Flags', description: 'Authorize selecting or switching active branch' },
  { name: 'Start Date', category: 'Operational Flags', description: 'Authorize setting accounting cycle start date' },
  { name: 'Cut Off Date', category: 'Operational Flags', description: 'Authorize setting accounting cycle cutoff date' }
];

// Available Restriction choices for the User Access management tab
export interface RestrictionOptionDef {
  key: string;
  category: 'tabs' | 'actions' | 'settings';
  label: string;
  description: string;
}

export const RESTRICTION_OPTIONS: RestrictionOptionDef[] = [
  // Tab-level restriction blocks
  {
    key: 'Restrict Profit and Loss',
    category: 'tabs',
    label: 'Restrict Profit & Loss',
    description: 'Hide sensitive company revenues, cost of goods, and net profit margins'
  },
  {
    key: 'Restrict Cash Details',
    category: 'tabs',
    label: 'Restrict Cash Details',
    description: 'Block viewing or editing cash collections, cashier registers, and denomination counts'
  },
  {
    key: 'Restrict User Access',
    category: 'tabs',
    label: 'Restrict User Access',
    description: 'Disallow viewing or modifying user accounts, roles, and password management'
  },
  {
    key: 'Restrict Setup',
    category: 'tabs',
    label: 'Restrict Setup',
    description: 'Disallow modifying branch directory, cashier lists, or accounting period parameters'
  },
  {
    key: 'Restrict Item Master',
    category: 'tabs',
    label: 'Restrict Item Master',
    description: 'Block access to product master catalog, SKU configurations, and price lists'
  },
  {
    key: 'Restrict Google Drive',
    category: 'tabs',
    label: 'Restrict Google Drive',
    description: 'Disallow manual cloud backups, ledger restores, and Google Drive file sync'
  },
  {
    key: 'Restrict Transfer From',
    category: 'tabs',
    label: 'Restrict Transfer Out (From)',
    description: 'Block creating or modifying outbound stock transfers to other branches'
  },
  {
    key: 'Restrict Transfer To',
    category: 'tabs',
    label: 'Restrict Transfer In (To)',
    description: 'Block receiving inbound stock transfers and logging damaged/bad orders'
  },
  {
    key: 'Restrict Data Entry',
    category: 'tabs',
    label: 'Restrict Data Entry',
    description: 'Disallow accessing the daily AM/PM inventory entry ledger'
  },
  {
    key: 'Restrict Weekly Summaries',
    category: 'tabs',
    label: 'Restrict Weekly Summaries',
    description: 'Block viewing Week 1 to Week 5 operational and variance reports'
  },
  {
    key: 'Restrict Monthly Summary',
    category: 'tabs',
    label: 'Restrict Monthly Summary',
    description: 'Block viewing consolidated monthly sales summary'
  },
  {
    key: 'Restrict Items Sold Out Summary',
    category: 'tabs',
    label: 'Restrict Items Sold Out Summary',
    description: 'Block viewing weekly and monthly items sold out quantities'
  },

  // Operational Action safeguards
  {
    key: 'Read-Only (No Edits)',
    category: 'actions',
    label: 'Read-Only Mode (No Edits)',
    description: 'User can view permitted tabs but cannot modify, add, or save data'
  },
  {
    key: 'Disallow Delete Rows',
    category: 'actions',
    label: 'Disallow Delete Rows',
    description: 'Prevent deleting inventory rows, ledger entries, or items'
  },
  {
    key: 'Disallow Price / SRP Edits',
    category: 'actions',
    label: 'Disallow Price / SRP Edits',
    description: 'Prevent editing selling retail prices (SRP) or unit costs'
  },
  {
    key: 'Disallow Adding Items',
    category: 'actions',
    label: 'Disallow Adding Items',
    description: 'Prevent creating new catalog items in Item Master'
  },
  {
    key: 'Disallow Cash Adjustments',
    category: 'actions',
    label: 'Disallow Cash Adjustments',
    description: 'Prevent modifying cashier shift payments or denomination totals'
  },

  // System Parameter safeguards
  {
    key: 'Inventory Location',
    category: 'settings',
    label: 'Disallow Branch Switching',
    description: 'Lock user to their assigned branch; prevent changing active inventory location'
  },
  {
    key: 'Start Date',
    category: 'settings',
    label: 'Disallow Start Date Change',
    description: 'Lock accounting period start date from being altered'
  },
  {
    key: 'Cut Off Date',
    category: 'settings',
    label: 'Disallow Cut-Off Date Change',
    description: 'Lock accounting period cut-off date from being altered'
  }
];

// Pre-packaged Role Templates for 1-click configuration
export interface RolePreset {
  id: string;
  name: string;
  badge: string;
  description: string;
  allLocs: boolean;
  acc: string[];
  res: string[];
}

export const ROLE_PRESETS: RolePreset[] = [
  {
    id: 'admin',
    name: 'Administrator',
    badge: 'Full Access',
    description: 'Unrestricted access to all branches, all tabs, and zero operational restrictions.',
    allLocs: true,
    acc: ['All'],
    res: []
  },
  {
    id: 'manager',
    name: 'Store / Branch Manager',
    badge: 'Branch Lead',
    description: 'Full store operations, weekly & monthly summaries, cash reconciliation, transfers, and setup. Restricted from User Management and sensitive Profit & Loss.',
    allLocs: false,
    acc: [
      'Data Entry',
      'Weekly Summaries',
      'Monthly Summary',
      'Cash Details Summary',
      'Transfer From',
      'Transfer To',
      'Item Master',
      'Setup',
      'Inventory Location'
    ],
    res: ['Restrict Profit and Loss', 'Restrict User Access']
  },
  {
    id: 'cashier',
    name: 'Cashier / Floor Staff',
    badge: 'Operations',
    description: 'Focused daily shift tools: Data Entry and Cash Details Summary only. All sensitive reports, configurations, and administrative tools blocked.',
    allLocs: false,
    acc: ['Data Entry', 'Cash Details Summary'],
    res: [
      'Restrict Profit and Loss',
      'Restrict User Access',
      'Restrict Setup',
      'Restrict Item Master',
      'Restrict Google Drive',
      'Restrict Transfer From',
      'Restrict Transfer To',
      'Restrict Weekly Summaries',
      'Restrict Monthly Summary',
      'Disallow Delete Rows',
      'Disallow Price / SRP Edits',
      'Inventory Location',
      'Start Date',
      'Cut Off Date'
    ]
  },
  {
    id: 'auditor',
    name: 'Auditor / Accountant',
    badge: 'Audit & Review',
    description: 'Read-only access across all locations, summaries, cash records, and financial P&L. Strictly cannot delete rows or alter prices.',
    allLocs: true,
    acc: [
      'Data Entry',
      'Weekly Summaries',
      'Monthly Summary',
      'Cash Details Summary',
      'Profit and Loss',
      'Transfer From',
      'Transfer To',
      'View Only'
    ],
    res: [
      'Read-Only (No Edits)',
      'Disallow Delete Rows',
      'Disallow Price / SRP Edits',
      'Restrict Setup',
      'Restrict User Access',
      'Restrict Google Drive'
    ]
  },
  {
    id: 'inventory',
    name: 'Inventory Custodian',
    badge: 'Stock Keeper',
    description: 'Manages physical stocks: Data Entry, Transfers In/Out, and Item Master. Blocked from financial statements, cash drawer counts, and system setup.',
    allLocs: false,
    acc: ['Data Entry', 'Transfer From', 'Transfer To', 'Item Master'],
    res: [
      'Restrict Profit and Loss',
      'Restrict Cash Details',
      'Restrict Setup',
      'Restrict User Access',
      'Restrict Google Drive',
      'Disallow Price / SRP Edits',
      'Start Date',
      'Cut Off Date'
    ]
  }
];

// Helper to determine if a user has access to a specific tab
export function canUserAccessTab(user: User | null, tabId: string): boolean {
  if (!user) return false;

  const acc = Array.isArray(user.acc) ? user.acc : [];
  const res = Array.isArray(user.res) ? user.res : [];

  // Super-admin / Project Owner bypass
  if (
    user.isOwner ||
    user.user === 'admin' ||
    user.user === 'enalo' ||
    user.email === 'em.nalo92@gmail.com' ||
    user.id === 1 ||
    user.id === 999
  ) {
    return true;
  }

  // Normalize tab ID to tab name and restriction keys
  let tabName = '';
  let restrictKey = '';

  if (tabId === 'entry') {
    tabName = 'Data Entry';
    restrictKey = 'Restrict Data Entry';
  } else if (tabId.startsWith('w')) {
    tabName = 'Weekly Summaries';
    restrictKey = 'Restrict Weekly Summaries';
  } else if (tabId === 'mo') {
    tabName = 'Monthly Summary';
    restrictKey = 'Restrict Monthly Summary';
  } else if (tabId === 'cash') {
    tabName = 'Cash Details Summary';
    restrictKey = 'Restrict Cash Details';
  } else if (tabId === 'pnl') {
    tabName = 'Profit and Loss';
    restrictKey = 'Restrict Profit and Loss';
  } else if (tabId === 'tf') {
    tabName = 'Transfer From';
    restrictKey = 'Restrict Transfer From';
  } else if (tabId === 'tt') {
    tabName = 'Transfer To';
    restrictKey = 'Restrict Transfer To';
  } else if (tabId === 'soldout') {
    tabName = 'Items Sold Out Summary';
    restrictKey = 'Restrict Items Sold Out Summary';
  } else if (tabId === 'master') {
    tabName = 'Item Master';
    restrictKey = 'Restrict Item Master';
  } else if (tabId === 'drive') {
    tabName = 'Google Drive';
    restrictKey = 'Restrict Google Drive';
  } else if (tabId === 'users') {
    tabName = 'User Access';
    restrictKey = 'Restrict User Access';
  } else if (tabId === 'setup') {
    tabName = 'Setup';
    restrictKey = 'Restrict Setup';
  }

  // 1. Check if explicitly restricted in user.res
  if (
    res.includes(restrictKey) ||
    res.includes(tabName) ||
    res.includes(tabId)
  ) {
    return false;
  }

  // Special security rule: User Access tab is restricted unless user is an Administrator or explicitly granted 'User Access' or 'All'
  if (tabId === 'users') {
    const hasAdminAccess = acc.includes('All') || acc.includes('User Access');
    return hasAdminAccess && !res.includes('Restrict User Access');
  }

  // 2. Check tab access privileges in user.acc
  if (acc.includes('All')) {
    return true;
  }

  // Allow access to Items Sold Out Summary if user has access to Weekly or Monthly summaries
  if (tabId === 'soldout' && (acc.includes('Weekly Summaries') || acc.includes('Monthly Summary'))) {
    return true;
  }

  return acc.includes(tabName) || acc.includes(tabId);
}

// Helper to determine if a user can edit data
export function canUserEditData(user: User | null): boolean {
  if (!user) return true;
  const acc = user.acc || [];
  const res = user.res || [];

  if (res.includes('Read-Only (No Edits)') || res.includes('View Only')) {
    return false;
  }
  if (acc.includes('View Only')) {
    return false;
  }
  return true;
}

// Helper to determine if user can delete rows/items
export function canUserDeleteRows(user: User | null): boolean {
  if (!user) return true;
  const res = user.res || [];
  if (!canUserEditData(user)) return false;
  return !res.includes('Disallow Delete Rows');
}

// Helper to determine if user can edit prices/costs
export function canUserEditPrices(user: User | null): boolean {
  if (!user) return true;
  const res = user.res || [];
  if (!canUserEditData(user)) return false;
  return !res.includes('Disallow Price / SRP Edits');
}

// Helper to determine if user can adjust cash counts
export function canUserAdjustCash(user: User | null): boolean {
  if (!user) return true;
  const res = user.res || [];
  if (!canUserEditData(user)) return false;
  return !res.includes('Disallow Cash Adjustments');
}
