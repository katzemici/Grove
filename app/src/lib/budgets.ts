// Budget accounts ("envelopes"): pure helpers, unit-tested in budgets.test.ts.
//
// Rules
//  - Each account gets its `monthly_budget` every calendar month.
//  - An expense counts toward an account when it is explicitly charged to it
//    (account_id). Otherwise it is matched by category to the first account
//    (oldest first) that lists that category. Income never counts.
//  - "Saved" is what was left over in the previous month (never negative).

import { round2 } from './finance';
import { parseAmount } from './currency';
import type { BudgetAccount, FinanceCategory, Transaction } from './types';

export const ACCOUNT_COLORS = [
  '#6faf5b', // meadow
  '#6fa9d6', // sky
  '#e8a45c', // ginger
  '#c86fa0', // blossom
  '#d9b84a', // daisy
  '#8f9b6d', // sage
  '#b98a6a', // bark
  '#7d8fd6', // dusk
] as const;

export const ACCOUNT_ICONS = [
  'utensils',
  'film',
  'bus',
  'bag',
  'home',
  'zap',
  'heart',
  'gift',
  'plane',
  'piggy',
  'book',
  'sprout',
] as const;

export type AccountIcon = (typeof ACCOUNT_ICONS)[number];

/** Starter presets offered when the user has no accounts yet. */
export const ACCOUNT_PRESETS: { name: string; icon: AccountIcon; color: string; categories: FinanceCategory[]; monthly_budget: number }[] = [
  { name: 'Food', icon: 'utensils', color: '#6faf5b', categories: ['Food'], monthly_budget: 400 },
  { name: 'Entertainment', icon: 'film', color: '#c86fa0', categories: ['Entertainment'], monthly_budget: 120 },
  { name: 'Transport', icon: 'bus', color: '#6fa9d6', categories: ['Transport'], monthly_budget: 100 },
  { name: 'Shopping', icon: 'bag', color: '#e8a45c', categories: ['Shopping'], monthly_budget: 200 },
];

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function previousMonthKey(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Days remaining in the month including today (today = day 1 of what's left). */
export function daysLeftInMonth(today: string): number {
  const [y, m, d] = today.split('-').map(Number);
  return new Date(y, m, 0).getDate() - d + 1;
}

/** The account an expense counts toward, or null. */
export function resolveAccount(tx: Transaction, accounts: BudgetAccount[]): BudgetAccount | null {
  if (tx.type !== 'expense') return null;
  if (tx.account_id) return accounts.find((a) => a.id === tx.account_id) ?? null;
  const ordered = accounts.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  return ordered.find((a) => a.categories.includes(tx.category)) ?? null;
}

export interface AccountUsage {
  account: BudgetAccount;
  /** Spent this month. */
  spent: number;
  /** monthly_budget - spent (negative when over budget). */
  remaining: number;
  /** spent / budget, 0-100+ (can exceed 100). */
  pct: number;
  over: boolean;
  /** Leftover from last month, never negative. */
  savedLastMonth: number;
  /** Suggested spend per remaining day to stay on budget (0 when nothing is left). */
  perDay: number;
  /** Expenses counted this month. */
  count: number;
}

export interface BudgetSummary {
  usage: AccountUsage[];
  budgeted: number;
  spent: number;
  remaining: number;
  /** Income received this month minus the total budgeted (what is left to assign). */
  unassigned: number;
  /** Expenses this month that no account covers. */
  uncovered: number;
  daysLeft: number;
}

export function budgetSummary(
  accounts: BudgetAccount[],
  transactions: Transaction[],
  today: string,
): BudgetSummary {
  const cur = monthKey(today);
  const prev = previousMonthKey(today);
  const spentNow = new Map<string, number>();
  const spentPrev = new Map<string, number>();
  const counts = new Map<string, number>();
  let income = 0;
  let uncovered = 0;

  for (const t of transactions) {
    if (t.date > today) continue;
    const key = monthKey(t.date);
    if (t.type === 'income') {
      if (key === cur) income += t.amount;
      continue;
    }
    const acct = resolveAccount(t, accounts);
    if (key === cur) {
      if (acct) {
        spentNow.set(acct.id, (spentNow.get(acct.id) ?? 0) + t.amount);
        counts.set(acct.id, (counts.get(acct.id) ?? 0) + 1);
      } else uncovered += t.amount;
    } else if (key === prev && acct) {
      spentPrev.set(acct.id, (spentPrev.get(acct.id) ?? 0) + t.amount);
    }
  }

  const daysLeft = daysLeftInMonth(today);
  const usage = accounts.map((account) => {
    const spent = round2(spentNow.get(account.id) ?? 0);
    const remaining = round2(account.monthly_budget - spent);
    const existedLastMonth = monthKey(account.created_at.slice(0, 10)) <= prev;
    const prevSpent = spentPrev.get(account.id) ?? 0;
    return {
      account,
      spent,
      remaining,
      pct: account.monthly_budget > 0 ? Math.round((spent / account.monthly_budget) * 100) : 0,
      over: remaining < 0,
      savedLastMonth: existedLastMonth ? round2(Math.max(0, account.monthly_budget - prevSpent)) : 0,
      perDay: remaining > 0 ? round2(remaining / daysLeft) : 0,
      count: counts.get(account.id) ?? 0,
    };
  });

  const budgeted = round2(accounts.reduce((s, a) => s + a.monthly_budget, 0));
  const spent = round2(usage.reduce((s, u) => s + u.spent, 0));
  return {
    usage,
    budgeted,
    spent,
    remaining: round2(budgeted - spent),
    unassigned: round2(income - budgeted),
    uncovered: round2(uncovered),
    daysLeft,
  };
}

export interface AccountDraft {
  name: string;
  monthly_budget: string;
  color: string;
  icon: string;
  categories: FinanceCategory[];
}

export type AccountErrors = Partial<Record<'name' | 'monthly_budget' | 'categories', string>>;

/** Validate the account form. `others` are the other existing accounts (for duplicate checks). */
export function validateAccount(draft: AccountDraft, others: BudgetAccount[]): AccountErrors {
  const errors: AccountErrors = {};
  const name = draft.name.trim();
  if (!name) errors.name = 'Name is required.';
  else if (name.length > 40) errors.name = 'Keep the name under 40 characters.';
  else if (others.some((a) => a.name.trim().toLowerCase() === name.toLowerCase())) {
    errors.name = 'You already have an account with this name.';
  }

  const amount = parseAmount(draft.monthly_budget);
  if (draft.monthly_budget.trim() === '' || Number.isNaN(amount)) errors.monthly_budget = 'Enter a valid amount.';
  else if (amount <= 0) errors.monthly_budget = 'Budget must be greater than 0.';
  else if (amount > 1_000_000_000) errors.monthly_budget = 'That amount is too large.';

  const clash = draft.categories.find((c) => others.some((a) => a.categories.includes(c)));
  if (clash) errors.categories = `${clash} already belongs to another account.`;
  return errors;
}
