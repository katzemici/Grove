import { describe, expect, it } from 'vitest';
import {
  biggestDropIndex,
  compact,
  comparePeriods,
  dailyCounts,
  dotsFor,
  funnelMetrics,
  habitDailyRates,
  leadingCommand,
  niceMax,
  parseQuickAdd,
  stepPath,
  taskFunnel,
} from '../lib/overview';
import type { Habit, Task, Transaction } from '../lib/types';

function task(partial: Partial<Task>): Task {
  return {
    id: Math.random().toString(),
    user_id: null,
    project_id: null,
    title: 't',
    description: '',
    priority: 'medium',
    due_date: null,
    status: 'todo',
    created_at: '2026-03-01T00:00:00.000Z',
    ...partial,
  };
}

function tx(date: string): Transaction {
  return {
    id: Math.random().toString(),
    user_id: null,
    type: 'expense',
    amount: 1,
    category: 'Other',
    date,
    note: '',
    created_at: date + 'T00:00:00.000Z',
  };
}

describe('funnel', () => {
  it('computes conversion and drop-off against the previous stage', () => {
    const m = funnelMetrics([
      { label: 'a', value: 100 },
      { label: 'b', value: 80 },
      { label: 'c', value: 20 },
    ]);
    expect(m.map((s) => [s.conversion, s.dropOff])).toEqual([
      [100, 0],
      [80, 20],
      [25, 75],
    ]);
    expect(biggestDropIndex(m)).toBe(2);
  });

  it('handles a zero previous stage without dividing by zero', () => {
    const m = funnelMetrics([
      { label: 'a', value: 0 },
      { label: 'b', value: 0 },
    ]);
    expect(m[1]).toMatchObject({ conversion: 0, dropOff: 0 });
  });

  it('builds the task pipeline from statuses', () => {
    const stages = taskFunnel([
      task({ status: 'todo' }),
      task({ status: 'in_progress' }),
      task({ status: 'done', priority: 'high' }),
      task({ status: 'done', priority: 'low' }),
    ]);
    expect(stages.map((s) => s.value)).toEqual([4, 3, 2, 1]);
  });
});

describe('axis formatting', () => {
  it('rounds maxima up to readable ceilings', () => {
    expect(niceMax(0)).toBe(4);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(13)).toBe(20);
    expect(niceMax(22)).toBe(25);
    expect(niceMax(65_200)).toBe(100_000);
  });

  it('formats compact numbers', () => {
    expect(compact(950)).toBe('950');
    expect(compact(48_600)).toBe('48.6k');
    expect(compact(2_000)).toBe('2k');
    expect(compact(1_500_000)).toBe('1.5m');
  });
});

describe('transactions dot matrix', () => {
  it('counts transactions per day, oldest first', () => {
    const rows = dailyCounts([tx('2026-03-10'), tx('2026-03-10'), tx('2026-03-08')], 3, '2026-03-10');
    expect(rows).toEqual([
      { date: '2026-03-08', count: 1 },
      { date: '2026-03-09', count: 0 },
      { date: '2026-03-10', count: 2 },
    ]);
  });

  it('scales dots and keeps at least one for non-zero days', () => {
    expect(dotsFor(0, 10)).toBe(0);
    expect(dotsFor(1, 100)).toBe(1);
    expect(dotsFor(10, 10)).toBe(6);
  });

  it('compares the current period with the previous one', () => {
    const r = comparePeriods(
      [tx('2026-03-10'), tx('2026-03-09'), tx('2026-03-07'), tx('2026-03-01')],
      3,
      '2026-03-10',
    );
    // current: 03-08..03-10 -> 2; previous: 03-05..03-07 -> 1
    expect(r).toEqual({ current: 2, previous: 1, delta: 1 });
  });
});

describe('habit consistency', () => {
  const habit = (id: string, created: string): Habit => ({
    id,
    user_id: null,
    name: id,
    frequency: { kind: 'daily' },
    created_at: created + 'T00:00:00.000Z',
  });

  it('computes the share of scheduled habits done each day', () => {
    const done = new Map([
      ['a', new Set(['2026-03-09', '2026-03-10'])],
      ['b', new Set(['2026-03-10'])],
    ]);
    const rates = habitDailyRates(
      [habit('a', '2026-03-01'), habit('b', '2026-03-01')],
      done,
      2,
      '2026-03-10',
    );
    expect(rates).toEqual([50, 100]);
  });

  it('ignores habits before they were created', () => {
    const rates = habitDailyRates([habit('a', '2026-03-10')], new Map(), 2, '2026-03-10');
    expect(rates).toEqual([0, 0]);
  });

  it('builds a step-after SVG path', () => {
    expect(stepPath([50, 100])).toBe('M0 50 H50 V0 H100');
    expect(stepPath([])).toBe('');
  });
});

describe('quick add parser', () => {
  it('defaults plain text to a task', () => {
    expect(parseQuickAdd('Water the plants')).toEqual({
      ok: true,
      value: { kind: 'task', title: 'Water the plants' },
    });
  });

  it('parses task and habit commands', () => {
    expect(parseQuickAdd('/task Draft proposal')).toEqual({
      ok: true,
      value: { kind: 'task', title: 'Draft proposal' },
    });
    expect(parseQuickAdd('/HABIT Morning walk')).toEqual({
      ok: true,
      value: { kind: 'habit', name: 'Morning walk' },
    });
  });

  it('parses money commands with an optional category', () => {
    expect(parseQuickAdd('/expense 12.50 food Lunch with Sam')).toEqual({
      ok: true,
      value: { kind: 'expense', amount: 12.5, category: 'Food', note: 'Lunch with Sam' },
    });
    expect(parseQuickAdd('/income 500 bonus')).toEqual({
      ok: true,
      value: { kind: 'income', amount: 500, category: 'Other', note: 'bonus' },
    });
  });

  it('rejects invalid input with a message', () => {
    expect(parseQuickAdd('   ').ok).toBe(false);
    expect(parseQuickAdd('/task').ok).toBe(false);
    expect(parseQuickAdd('/habit').ok).toBe(false);
    expect(parseQuickAdd('/expense lunch').ok).toBe(false);
    expect(parseQuickAdd('/expense -4 Food').ok).toBe(false);
    expect(parseQuickAdd('/foo bar').ok).toBe(false);
  });

  it('detects the leading command for the token chip', () => {
    expect(leadingCommand('/expense 4')).toBe('/expense');
    expect(leadingCommand('hello')).toBeNull();
  });
});
