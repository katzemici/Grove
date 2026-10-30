// Domain types. Every entity carries a nullable `user_id` from day one
// (per the product plan's future-proofing decision). In MVP it stays null;
// when auth is added we populate it and enable Row Level Security without
// any schema restructuring.

export type ID = string;
export type ISODate = string; // 'YYYY-MM-DD'
export type ISOTimestamp = string;

export type TransactionType = 'income' | 'expense';

export const FINANCE_CATEGORIES = [
  'Salary',
  'Business',
  'Investment',
  'Gift',
  'Food',
  'Transport',
  'Housing',
  'Utilities',
  'Health',
  'Entertainment',
  'Shopping',
  'Other',
] as const;
export type FinanceCategory = (typeof FINANCE_CATEGORIES)[number];

export interface Transaction {
  id: ID;
  user_id: string | null;
  type: TransactionType;
  amount: number; // always positive; sign is derived from `type`
  category: FinanceCategory;
  date: ISODate;
  note: string;
  /** Budget account this expense is charged to. Null means "assign by category". */
  account_id?: ID | null;
  /** Bank or wallet the money moved in or out of. Null means not linked to a bank. */
  bank_id?: ID | null;
  created_at: ISOTimestamp;
}

export const BANK_KINDS = ['savings', 'bank', 'cash', 'ewallet'] as const;
export type BankKind = (typeof BANK_KINDS)[number];

/**
 * A place where money actually sits: a savings account, bank account, cash, or e-wallet.
 * Balance = opening_balance + linked income - linked expenses.
 */
export interface Bank {
  id: ID;
  user_id: string | null;
  name: string;
  kind: BankKind;
  /** Hex color, e.g. '#6fa9d6'. */
  color: string;
  /** Balance when the bank was added to the app. */
  opening_balance: number;
  created_at: ISOTimestamp;
}

/**
 * Money moved between two banks. Not income or spending: it changes the two
 * bank balances and leaves the total balance, budgets and spending untouched.
 * A side becomes null if that bank is deleted (the other side is kept).
 */
export interface Transfer {
  id: ID;
  user_id: string | null;
  from_bank_id: ID | null;
  to_bank_id: ID | null;
  amount: number;
  date: ISODate;
  note: string;
  created_at: ISOTimestamp;
}

/**
 * A user-defined budget account (an "envelope"), e.g. Food or Entertainment.
 * Each month it gets `monthly_budget`; expenses charged to it count against that.
 * Expenses without an explicit account are matched by `categories`.
 */
export interface BudgetAccount {
  id: ID;
  user_id: string | null;
  name: string;
  /** Hex color, e.g. '#6faf5b'. */
  color: string;
  /** Icon key from the app's icon set. */
  icon: string;
  monthly_budget: number;
  categories: FinanceCategory[];
  created_at: ISOTimestamp;
}

export type HabitFrequency =
  | { kind: 'daily' }
  | { kind: 'weekly'; days: number[] }; // days: 0=Sun .. 6=Sat

export interface Habit {
  id: ID;
  user_id: string | null;
  name: string;
  frequency: HabitFrequency;
  created_at: ISOTimestamp;
}

export interface HabitCompletion {
  id: ID;
  user_id: string | null;
  habit_id: ID;
  date: ISODate;
  created_at: ISOTimestamp;
}

export interface Project {
  id: ID;
  user_id: string | null;
  name: string;
  description: string;
  created_at: ISOTimestamp;
}

export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export const TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done'];

export interface Task {
  id: ID;
  user_id: string | null;
  project_id: ID | null;
  title: string;
  description: string;
  priority: TaskPriority;
  due_date: ISODate | null;
  status: TaskStatus;
  /** Manual order inside a column (lower first). Optional: older rows have none. */
  position?: number | null;
  created_at: ISOTimestamp;
}
