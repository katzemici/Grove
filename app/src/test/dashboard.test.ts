import { describe, expect, it } from 'vitest';
import { dailyNet, expenseByCategory } from '../lib/finance';
import { completionRate, longestStreak } from '../lib/streak';
import type { Habit, Transaction } from '../lib/types';

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(),
    user_id: null,
    type: 'expense',
    amount: 0,
    category: 'Other',
    date: '2026-03-10',
    note: '',
    created_at: '2026-03-10T00:00:00.000Z',
    ...partial,
  };
}

describe('expenseByCategory', () => {
  it('groups expenses by category with percentages, descending', () => {
    const rows = expenseByCategory([
      tx({ type: 'expense', amount: 75, category: 'Food' }),
      tx({ type: 'expense', amount: 25, category: 'Food' }),
      tx({ type: 'expense', amount: 150, category: 'Housing' }),
      tx({ type: 'income', amount: 500, category: 'Salary' }), // ignored
    ]);
    expect(rows[0]).toEqual({ category: 'Housing', total: 150, pct: 60 });
    expect(rows[1]).toEqual({ category: 'Food', total: 100, pct: 40 });
  });

  it('returns an empty array when there are no expenses', () => {
    expect(expenseByCategory([tx({ type: 'income', amount: 10 })])).toEqual([]);
  });
});

describe('dailyNet', () => {
  it('buckets income and expense into the correct days', () => {
    const rows = dailyNet(
      [
        tx({ type: 'income', amount: 100, date: '2026-03-10' }),
        tx({ type: 'expense', amount: 40, date: '2026-03-10' }),
        tx({ type: 'expense', amount: 10, date: '2026-03-09' }),
      ],
      3,
      '2026-03-10',
    );
    expect(rows).toHaveLength(3);
    expect(rows[2]).toEqual({ date: '2026-03-10', income: 100, expense: 40 });
    expect(rows[1]).toEqual({ date: '2026-03-09', income: 0, expense: 10 });
    expect(rows[0]).toEqual({ date: '2026-03-08', income: 0, expense: 0 });
  });
});

function daily(): Habit {
  return {
    id: 'h1',
    user_id: null,
    name: 'Daily',
    frequency: { kind: 'daily' },
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('longestStreak', () => {
  it('finds the best run even if the current run is shorter', () => {
    // Best run is the 3-day block 03-01..03-03; current run (03-10) is 1.
    const done = new Set(['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-10']);
    expect(longestStreak(daily(), done, '2026-03-10')).toBe(3);
  });

  it('returns 0 when there are no completions', () => {
    expect(longestStreak(daily(), new Set(), '2026-03-10')).toBe(0);
  });
});

describe('completionRate', () => {
  it('computes percentage of scheduled days completed in the window', () => {
    // Daily habit, 4-day window, 2 of 4 done => 50%.
    const done = new Set(['2026-03-10', '2026-03-08']);
    expect(completionRate(daily(), done, 4, '2026-03-10')).toBe(50);
  });

  it('is 0 with no completions', () => {
    expect(completionRate(daily(), new Set(), 7, '2026-03-10')).toBe(0);
  });
});
