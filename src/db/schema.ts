import { pgTable, serial, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

// Users table linking Firebase Auth UID and local store credentials
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID or username identifier
  email: text('email').notNull(),
  name: text('name'),
  role: text('role').default('Staff'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Main shared inventory ledger state and branch configuration
export const inventoryLedger = pgTable('inventory_ledger', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(), // e.g. 'shared_ledger'
  inv: text('inv').notNull(), // Active store branch/location
  startDate: text('start_date').notNull(),
  cutDate: text('cut_date').notNull(),
  stateData: jsonb('state_data').notNull(), // Complete AppState payload
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedBy: text('updated_by'),
});

// Audit log table for real-time inventory tracking
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  timestamp: text('timestamp').notNull(),
  username: text('username').notNull(),
  tab: text('tab').notNull(),
  action: text('action').notNull(),
  description: text('description').notNull(),
  date: text('date'),
  location: text('location'),
  createdAt: timestamp('created_at').defaultNow(),
});
