// Pure helpers that turn app data into chart-ready numbers for the Overview page.
// No React, no I/O: everything here is unit-tested in overview.test.ts.

import { addDays, dayOfWeek } from './date';
import { isScheduled } from './streak';
import { parseAmount, roundMoney } from './currency';
import {
  FINANCE_CATEGORIES,
  type FinanceCategory,
  type Habit,
  type Task,
  type Transaction,
} from './types';

// ---------------------------------------------------------------------------
// Funnel
// ---------------------------------------------------------------------------

export interface FunnelStage {
  label: string;
  value: number;
}

export interface FunnelStageMetrics extends FunnelStage {
  /** value / previous stage value, 0-100. The first stage is 100. */
  conversion: number;
  /** 100 - conversion. The first stage is 0. */
  dropOff: number;
}

export function funnelMetrics(stages: FunnelStage[]): FunnelStageMetrics[] {
  return stages.map((s, i) => {
    if (i === 0) return { ...s, conversion: 100, dropOff: 0 };
    const prev = stages[i - 1].value;
    const conversion = prev > 0 ? Math.round((s.value / prev) * 100) : 0;
    return { ...s, conversion, dropOff: prev > 0 ? 100 - conversion : 0 };
  });
}

/** Index of the stage with the largest drop-off (the most useful one to highlight). */
export function biggestDropIndex(metrics: FunnelStageMetrics[]): number {
  if (metrics.length <= 1) return 0;
  let best = 1;
  for (let i = 2; i < metrics.length; i++) {
    if (metrics[i].dropOff > metrics[best].dropOff) best = i;
  }
  return best;
}

/** Task pipeline: every task is created; started = in progress or done; completed = done. */
export function taskFunnel(tasks: Task[]): FunnelStage[] {
  const started = tasks.filter((t) => t.status !== 'todo').length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const highDone = tasks.filter((t) => t.status === 'done' && t.priority === 'high').length;
  return [
    { label: 'Tasks created', value: tasks.length },
    { label: 'Started', value: started },
    { label: 'Completed', value: done },
    { label: 'High priority done', value: highDone },
  ];
}

/** Round a maximum up to a readable axis ceiling (1, 2, 2.5, 5, or 10 x 10^n). */
export function niceMax(max: number): number {
  if (max <= 0) return 4;
  const exp = Math.floor(Math.log10(max));
  const base = Math.pow(10, exp);
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (max <= step * base) return step * base;
  }
  return 10 * base;
}

/** Compact number for axis ticks and stage values: 950, 1.2k, 48.6k, 1.5m. */
export function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return trim(n / 1_000_000) + 'm';
  if (abs >= 1_000) return trim(n / 1_000) + 'k';
  return String(Math.round(n));
}

function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '');
}

// ---------------------------------------------------------------------------
// Transactions dot matrix
// ---------------------------------------------------------------------------

export interface DayCount {
  date: string;
  count: number;
}

/** Number of transactions per day for the `days` days ending on `today` (oldest first). */
export function dailyCounts(transactions: Transaction[], days: number, today: string): DayCount[] {
  const out: DayCount[] = [];
  for (let i = days - 1; i >= 0; i--) out.push({ date: addDays(today, -i), count: 0 });
  const index = new Map(out.map((d, i) => [d.date, i]));
  for (const t of transactions) {
    const i = index.get(t.date);
    if (i !== undefined) out[i].count++;
  }
  return out;
}

/** Number of dots to draw for a day. Any non-zero day shows at least 1 dot. */
export function dotsFor(count: number, max: number, cap = 6): number {
  if (count <= 0 || max <= 0) return 0;
  return Math.max(1, Math.round((count / max) * cap));
}

export interface PeriodComparison {
  current: number;
  previous: number;
  delta: number;
}

/** Transaction count in the last `days` days vs. the `days` days before that. */
export function comparePeriods(
  transactions: Transaction[],
  days: number,
  today: string,
): PeriodComparison {
  const curStart = addDays(today, -(days - 1));
  const prevStart = addDays(today, -(2 * days - 1));
  let current = 0;
  let previous = 0;
  for (const t of transactions) {
    if (t.date >= curStart && t.date <= today) current++;
    else if (t.date >= prevStart && t.date < curStart) previous++;
  }
  return { current, previous, delta: current - previous };
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function weekdayName(iso: string): string {
  return WEEKDAY_NAMES[dayOfWeek(iso)];
}

// ---------------------------------------------------------------------------
// Habit consistency (step line) and today's progress
// ---------------------------------------------------------------------------

/**
 * Percent of scheduled habits completed on each of the `days` days ending today
 * (oldest first). A habit only counts from the day it was created.
 */
export function habitDailyRates(
  habits: Habit[],
  doneByHabit: Map<string, Set<string>>,
  days: number,
  today: string,
): number[] {
  const out: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const iso = addDays(today, -i);
    let scheduled = 0;
    let done = 0;
    for (const h of habits) {
      if (h.created_at.slice(0, 10) > iso) continue;
      if (!isScheduled(h, iso)) continue;
      scheduled++;
      if (doneByHabit.get(h.id)?.has(iso)) done++;
    }
    out.push(scheduled === 0 ? 0 : Math.round((done / scheduled) * 100));
  }
  return out;
}

/**
 * SVG path for a step-after line in a 0-100 x 0-100 viewBox.
 * Each value holds flat across its slot, then steps to the next value.
 */
export function stepPath(values: number[]): string {
  if (values.length === 0) return '';
  const w = 100 / values.length;
  const y = (v: number) => 100 - Math.max(0, Math.min(100, v));
  let d = `M0 ${y(values[0])}`;
  values.forEach((v, i) => {
    if (i > 0) d += ` V${y(v)}`;
    d += ` H${round(w * (i + 1))}`;
  });
  return d;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Quick-add bar ("What would you like to add next?")
// ---------------------------------------------------------------------------

export type QuickAdd =
  | { kind: 'task'; title: string }
  | { kind: 'habit'; name: string }
  | {
      kind: 'income' | 'expense';
      amount: number;
      category: FinanceCategory;
      note: string;
    };

export type QuickAddResult = { ok: true; value: QuickAdd } | { ok: false; error: string };

export const QUICK_COMMANDS = ['/task', '/habit', '/expense', '/income'] as const;

/** The slash command at the start of the input, if it is a known one. */
export function leadingCommand(input: string): (typeof QUICK_COMMANDS)[number] | null {
  const first = input.trimStart().split(/\s+/)[0]?.toLowerCase() ?? '';
  return (QUICK_COMMANDS as readonly string[]).includes(first)
    ? (first as (typeof QUICK_COMMANDS)[number])
    : null;
}

/**
 * Parse the quick-add input.
 *   "/task Draft proposal"          -> task
 *   "/habit Morning walk"           -> daily habit
 *   "/expense 12.50 Food Lunch"     -> expense, category matched case-insensitively
 *   "/income 500 Salary"            -> income
 *   "Water the plants"              -> task (no command defaults to a task)
 */
export function parseQuickAdd(input: string): QuickAddResult {
  const text = input.trim();
  if (!text) return { ok: false, error: 'Type something to add.' };

  const cmd = leadingCommand(text);
  const rest = cmd ? text.slice(text.toLowerCase().indexOf(cmd) + cmd.length).trim() : text;

  if (!cmd || cmd === '/task') {
    if (cmd && text.startsWith('/') && !rest) return { ok: false, error: 'Add a task title.' };
    if (!cmd && text.startsWith('/')) {
      return { ok: false, error: `Unknown command. Try ${QUICK_COMMANDS.join(', ')}.` };
    }
    return { ok: true, value: { kind: 'task', title: rest } };
  }

  if (cmd === '/habit') {
    if (!rest) return { ok: false, error: 'Add a habit name.' };
    return { ok: true, value: { kind: 'habit', name: rest } };
  }

  // /expense and /income
  const [amountText, ...words] = rest.split(/\s+/);
  const amount = amountText ? parseAmount(amountText) : NaN;
  if (!amountText || Number.isNaN(amount)) {
    return { ok: false, error: `Start with an amount, e.g. ${cmd} 12.50 Food Lunch` };
  }
  if (amount <= 0) return { ok: false, error: 'Amount must be greater than 0.' };

  let category: FinanceCategory = 'Other';
  let noteWords = words;
  const match = FINANCE_CATEGORIES.find((c) => c.toLowerCase() === words[0]?.toLowerCase());
  if (match) {
    category = match;
    noteWords = words.slice(1);
  }
  return {
    ok: true,
    value: {
      kind: cmd === '/income' ? 'income' : 'expense',
      amount: roundMoney(amount),
      category,
      note: noteWords.join(' '),
    },
  };
}
