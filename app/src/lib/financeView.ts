// Pure helpers for the Finance page. Unit-tested in financeView.test.ts.

import { addDays } from './date';
import { round2 } from './finance';
import type { Transaction, TransactionType } from './types';

/** 'YYYY-MM' for an ISO date. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export interface BalanceChange {
  /** Net (income - expense) during the current calendar month. */
  change: number;
  /** Balance at the end of last month, used as the comparison base. */
  previousBalance: number;
}

/** How much the balance moved during the current month compared with the end of last month. */
export function balanceChange(transactions: Transaction[], today: string): BalanceChange {
  const current = monthKey(today);
  let change = 0;
  let previousBalance = 0;
  for (const t of transactions) {
    if (t.date > today) continue;
    const signed = t.type === 'income' ? t.amount : -t.amount;
    if (monthKey(t.date) === current) change += signed;
    else if (monthKey(t.date) < current) previousBalance += signed;
  }
  return { change: round2(change), previousBalance: round2(previousBalance) };
}

export interface CategoryShare {
  category: string;
  total: number;
  /** Share of this type's total, 0-100, rounded. */
  pct: number;
}

/** Totals per category for one transaction type, largest first (ties keep first-seen order). */
export function byCategory(transactions: Transaction[], type: TransactionType): CategoryShare[] {
  const map = new Map<string, number>();
  let sum = 0;
  for (const t of transactions) {
    if (t.type !== type) continue;
    map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
    sum += t.amount;
  }
  return Array.from(map, ([category, total]) => ({
    category,
    total: round2(total),
    pct: sum > 0 ? Math.round((total / sum) * 100) : 0,
  })).sort((a, b) => b.total - a.total);
}

/** Transactions dated within the current calendar month (up to today). */
export function inMonth(transactions: Transaction[], today: string): Transaction[] {
  const key = monthKey(today);
  return transactions.filter((t) => monthKey(t.date) === key && t.date <= today);
}

export interface SpendingSeries {
  /** ISO date for each point of the current window, oldest first. */
  dates: string[];
  /** Cumulative spending for the current window. */
  current: number[];
  /** Cumulative spending for the previous window of the same length, aligned by day index. */
  previous: number[];
  total: number;
  previousTotal: number;
  /** Percent change vs the previous window, or null when the previous window is empty. */
  changePct: number | null;
}

/** Cumulative expense curves for the last `days` days and the `days` days before that. */
export function spendingSeries(transactions: Transaction[], days: number, today: string): SpendingSeries {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) dates.push(addDays(today, -i));
  const prevStart = addDays(dates[0], -days);

  const curDaily = new Array<number>(days).fill(0);
  const prevDaily = new Array<number>(days).fill(0);
  const curIndex = new Map(dates.map((d, i) => [d, i]));

  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    const ci = curIndex.get(t.date);
    if (ci !== undefined) {
      curDaily[ci] += t.amount;
      continue;
    }
    if (t.date >= prevStart && t.date < dates[0]) {
      const pi = daysBetween(prevStart, t.date);
      prevDaily[pi] += t.amount;
    }
  }

  const current = cumulative(curDaily);
  const previous = cumulative(prevDaily);
  const total = current[current.length - 1] ?? 0;
  const previousTotal = previous[previous.length - 1] ?? 0;
  return {
    dates,
    current,
    previous,
    total,
    previousTotal,
    changePct: previousTotal > 0 ? round2(((total - previousTotal) / previousTotal) * 100) : null,
  };
}

function cumulative(values: number[]): number[] {
  let run = 0;
  return values.map((v) => (run = round2(run + v)));
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** Short, stable display id, e.g. "TX-3F9A2C". */
export function shortId(id: string): string {
  return 'TX-' + id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
}

/** Distribute `count` tick marks across category shares (largest remainder), so they sum to `count`. */
export function allocateTicks(shares: number[], count: number): number[] {
  const sum = shares.reduce((a, b) => a + b, 0);
  if (sum <= 0 || count <= 0) return shares.map(() => 0);
  const exact = shares.map((s) => (s / sum) * count);
  const base = exact.map(Math.floor);
  let left = count - base.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, r: e - Math.floor(e) }))
    .sort((x, y) => y.r - x.r);
  for (const { i } of order) {
    if (left <= 0) break;
    base[i]++;
    left--;
  }
  return base;
}

/** RFC 4180 CSV for the given transactions. Values are quoted; formula-like cells are neutralised. */
export function toCSV(transactions: Transaction[]): string {
  const header = ['id', 'date', 'type', 'category', 'amount', 'note'];
  const rows = transactions.map((t) => [
    shortId(t.id),
    t.date,
    t.type,
    t.category,
    t.amount.toFixed(2),
    t.note,
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

function csvCell(value: string): string {
  // Prevent spreadsheet formula injection from user-entered notes.
  const safe = /^[=+\-@\t\r]/.test(value) && !/^-?\d/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}
