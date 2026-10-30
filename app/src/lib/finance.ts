import { formatCurrency, formatCurrencyCompact } from './currency';
// Finance business logic (FIN-004). Pure functions, unit-tested in finance.test.ts.
// Rule: balance = sum(income amounts) − sum(expense amounts).

import type { Transaction } from './types';

export interface FinanceTotals {
  income: number;
  expense: number;
  balance: number;
}

export function computeTotals(transactions: Transaction[]): FinanceTotals {
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (t.type === 'income') income += t.amount;
    else expense += t.amount;
  }
  // Round to cents to avoid floating-point display artifacts.
  income = round2(income);
  expense = round2(expense);
  return { income, expense, balance: round2(income - expense) };
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface CategoryTotal {
  category: string;
  total: number;
  pct: number;
}

/** Expense totals grouped by category, descending, with percentage of spend. */
export function expenseByCategory(transactions: Transaction[]): CategoryTotal[] {
  const map = new Map<string, number>();
  let sum = 0;
  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
    sum += t.amount;
  }
  const rows = Array.from(map.entries()).map(([category, total]) => ({
    category,
    total: round2(total),
    pct: sum > 0 ? Math.round((total / sum) * 100) : 0,
  }));
  return rows.sort((a, b) => b.total - a.total);
}

/** Net amount (income − expense) per day for the last `days` days ending today. */
export function dailyNet(transactions: Transaction[], days: number, today: string): {
  date: string;
  income: number;
  expense: number;
}[] {
  const out: { date: string; income: number; expense: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = shiftISO(today, -i);
    out.push({ date, income: 0, expense: 0 });
  }
  const index = new Map(out.map((d, i) => [d.date, i]));
  for (const t of transactions) {
    const i = index.get(t.date);
    if (i === undefined) continue;
    if (t.type === 'income') out[i].income += t.amount;
    else out[i].expense += t.amount;
  }
  return out;
}

function shiftISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Format an amount in the user's chosen display currency. */
export function formatMoney(n: number): string {
  return formatCurrency(n);
}

/** Short form for chart axes, e.g. Rp 15 jt, $1.2K. */
export function formatMoneyCompact(n: number): string {
  return formatCurrencyCompact(n);
}
