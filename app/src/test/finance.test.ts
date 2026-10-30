import { describe, expect, it } from 'vitest';
import { computeTotals, round2 } from '../lib/finance';
import type { Transaction } from '../lib/types';

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(),
    user_id: null,
    type: 'expense',
    amount: 0,
    category: 'Other',
    date: '2026-01-01',
    note: '',
    created_at: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('computeTotals (QA-002: balance = income − expense)', () => {
  it('returns zeros for an empty list', () => {
    expect(computeTotals([])).toEqual({ income: 0, expense: 0, balance: 0 });
  });

  it('sums income and expense and computes balance', () => {
    const totals = computeTotals([
      tx({ type: 'income', amount: 1000 }),
      tx({ type: 'income', amount: 250.5 }),
      tx({ type: 'expense', amount: 300 }),
      tx({ type: 'expense', amount: 50.25 }),
    ]);
    expect(totals.income).toBe(1250.5);
    expect(totals.expense).toBe(350.25);
    expect(totals.balance).toBe(900.25);
  });

  it('produces a negative balance when expenses exceed income', () => {
    const totals = computeTotals([
      tx({ type: 'income', amount: 100 }),
      tx({ type: 'expense', amount: 175 }),
    ]);
    expect(totals.balance).toBe(-75);
  });

  it('handles floating-point amounts without drift', () => {
    const totals = computeTotals([
      tx({ type: 'income', amount: 0.1 }),
      tx({ type: 'income', amount: 0.2 }),
    ]);
    expect(totals.income).toBe(0.3);
    expect(totals.balance).toBe(0.3);
  });

  it('handles large numbers', () => {
    const totals = computeTotals([
      tx({ type: 'income', amount: 1_000_000_000 }),
      tx({ type: 'expense', amount: 999_999_999.99 }),
    ]);
    expect(totals.balance).toBe(0.01);
  });
});

describe('round2', () => {
  it('rounds to two decimals', () => {
    // Epsilon-based rounding resolves the classic float cases correctly.
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(12.344)).toBe(12.34);
  });
});
