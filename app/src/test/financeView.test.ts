import { describe, expect, it } from 'vitest';
import {
  allocateTicks,
  balanceChange,
  byCategory,
  inMonth,
  shortId,
  spendingSeries,
  toCSV,
} from '../lib/financeView';
import type { Transaction } from '../lib/types';

let n = 0;
function tx(p: Partial<Transaction>): Transaction {
  n++;
  return {
    id: 'id-' + n,
    user_id: null,
    type: 'expense',
    amount: 10,
    category: 'Food',
    date: '2026-03-10',
    note: '',
    created_at: '2026-03-10T00:00:00.000Z',
    ...p,
  };
}

describe('balanceChange', () => {
  it('splits this month net from the balance carried in from earlier months', () => {
    const r = balanceChange(
      [
        tx({ type: 'income', amount: 1000, date: '2026-02-20' }),
        tx({ type: 'expense', amount: 200, date: '2026-02-21' }),
        tx({ type: 'income', amount: 300, date: '2026-03-02' }),
        tx({ type: 'expense', amount: 50, date: '2026-03-05' }),
        tx({ type: 'expense', amount: 999, date: '2026-03-30' }), // future, ignored
      ],
      '2026-03-10',
    );
    expect(r).toEqual({ change: 250, previousBalance: 800 });
  });
});

describe('byCategory', () => {
  it('totals one type per category with percentages, largest first', () => {
    const rows = byCategory(
      [
        tx({ amount: 30, category: 'Food' }),
        tx({ amount: 70, category: 'Housing' }),
        tx({ type: 'income', amount: 500, category: 'Salary' }),
      ],
      'expense',
    );
    expect(rows).toEqual([
      { category: 'Housing', total: 70, pct: 70 },
      { category: 'Food', total: 30, pct: 30 },
    ]);
  });
});

describe('inMonth', () => {
  it('keeps only this calendar month up to today', () => {
    const rows = inMonth(
      [tx({ date: '2026-03-01' }), tx({ date: '2026-02-28' }), tx({ date: '2026-03-11' })],
      '2026-03-10',
    );
    expect(rows.map((r) => r.date)).toEqual(['2026-03-01']);
  });
});

describe('spendingSeries', () => {
  it('builds cumulative curves for the window and the window before it', () => {
    const s = spendingSeries(
      [
        tx({ amount: 5, date: '2026-03-08' }),
        tx({ amount: 10, date: '2026-03-10' }),
        tx({ amount: 4, date: '2026-03-05' }), // previous window, day index 0
        tx({ amount: 6, date: '2026-03-07' }), // previous window, day index 2
        tx({ type: 'income', amount: 100, date: '2026-03-09' }), // income ignored
      ],
      3,
      '2026-03-10',
    );
    expect(s.dates).toEqual(['2026-03-08', '2026-03-09', '2026-03-10']);
    expect(s.current).toEqual([5, 5, 15]);
    expect(s.previous).toEqual([4, 4, 10]);
    expect(s.total).toBe(15);
    expect(s.previousTotal).toBe(10);
    expect(s.changePct).toBe(50);
  });

  it('reports no change percentage when the previous window is empty', () => {
    expect(spendingSeries([tx({ date: '2026-03-10' })], 7, '2026-03-10').changePct).toBeNull();
  });
});

describe('allocateTicks', () => {
  it('distributes ticks proportionally and always sums to the count', () => {
    const t = allocateTicks([50, 30, 20], 10);
    expect(t).toEqual([5, 3, 2]);
    const uneven = allocateTicks([1, 1, 1], 10);
    expect(uneven.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('returns zeros when nothing was spent', () => {
    expect(allocateTicks([0, 0], 10)).toEqual([0, 0]);
  });
});

describe('CSV export', () => {
  it('quotes values and escapes quotes', () => {
    const csv = toCSV([tx({ id: 'abc-123456', note: 'Lunch "with" Sam, Jo', amount: 12.5 })]);
    const [header, row] = csv.split('\r\n');
    expect(header).toBe('"id","date","type","category","amount","note"');
    expect(row).toBe('"TX-123456","2026-03-10","expense","Food","12.50","Lunch ""with"" Sam, Jo"');
  });

  it('neutralises spreadsheet formulas in notes', () => {
    const row = toCSV([tx({ note: '=HYPERLINK("x")' })]).split('\r\n')[1];
    expect(row.endsWith('"\'=HYPERLINK(""x"")"')).toBe(true);
  });

  it('makes short display ids', () => {
    expect(shortId('3f9a2c1e-0000-4abc-9def-12345abcdef0')).toBe('TX-BCDEF0');
  });
});
