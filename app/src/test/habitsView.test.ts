import { describe, expect, it } from 'vitest';
import {
  isDue,
  monthOf,
  monthRates,
  periodLabel,
  periodStats,
  rewards,
  shiftAnchor,
  weekOf,
  yearOf,
} from '../lib/habitsView';
import type { Habit } from '../lib/types';

function habit(id: string, created = '2026-03-01', frequency: Habit['frequency'] = { kind: 'daily' }): Habit {
  return { id, user_id: null, name: id, frequency, created_at: created + 'T00:00:00.000Z' };
}

describe('period ranges', () => {
  it('weeks start on Monday', () => {
    // 2026-03-11 is a Wednesday.
    const w = weekOf('2026-03-11');
    expect(w[0]).toBe('2026-03-09');
    expect(w[6]).toBe('2026-03-15');
  });

  it('months and years cover every day', () => {
    expect(monthOf('2026-02-10')).toHaveLength(28);
    expect(monthOf('2028-02-10')).toHaveLength(29);
    expect(yearOf('2026-06-01')).toHaveLength(365);
  });

  it('shifts the anchor by one period', () => {
    expect(shiftAnchor('weekly', '2026-03-11', 1)).toBe('2026-03-18');
    expect(shiftAnchor('monthly', '2026-01-31', 1)).toBe('2026-02-01');
    expect(shiftAnchor('yearly', '2026-03-11', -1)).toBe('2025-01-01');
  });

  it('labels periods', () => {
    expect(periodLabel('yearly', yearOf('2026-01-01'))).toBe('2026');
  });
});

describe('isDue', () => {
  it('requires the habit to exist and be scheduled', () => {
    const h = habit('a', '2026-03-05', { kind: 'weekly', days: [1] }); // Mondays
    expect(isDue(h, '2026-03-02')).toBe(false); // Monday, before creation
    expect(isDue(h, '2026-03-09')).toBe(true); // Monday
    expect(isDue(h, '2026-03-10')).toBe(false); // Tuesday
  });
});

describe('periodStats', () => {
  it('computes rate, perfect days, done count, and daily average', () => {
    const habits = [habit('a'), habit('b')];
    const done = new Map([
      ['a', new Set(['2026-03-08', '2026-03-09', '2026-03-10'])],
      ['b', new Set(['2026-03-09'])],
    ]);
    const s = periodStats(habits, done, ['2026-03-08', '2026-03-09', '2026-03-10', '2026-03-11'], '2026-03-10');
    // Due: 2 habits x 3 elapsed days = 6; done = 4.
    expect(s.rate).toBe(67);
    expect(s.perfectDays).toBe(1); // only 03-09 had both
    expect(s.habitsDone).toBe(4);
    expect(s.dailyAverage).toBe(1.3);
    expect(s.currentStreak).toBe(3);
  });

  it('is all zeros without habits', () => {
    expect(periodStats([], new Map(), ['2026-03-10'], '2026-03-10')).toEqual({
      rate: 0,
      perfectDays: 0,
      habitsDone: 0,
      dailyAverage: 0,
      currentStreak: 0,
    });
  });
});

describe('monthRates', () => {
  it('returns null for months with nothing due', () => {
    const h = habit('a', '2026-03-01');
    const rates = monthRates(h, new Set(['2026-03-01', '2026-03-02']), 2026, '2026-03-04');
    expect(rates[1]).toBeNull(); // February: before creation
    expect(rates[2]).toBe(50); // March 1-4: 2 of 4
    expect(rates[3]).toBeNull(); // April: future
  });
});

describe('rewards', () => {
  it('unlocks achievements from existing data', () => {
    const days = Array.from({ length: 7 }, (_, i) => `2026-03-0${i + 1}`);
    const r = rewards([habit('a')], new Map([['a', new Set(days)]]), '2026-03-07');
    const by = Object.fromEntries(r.map((x) => [x.id, x]));
    expect(by.starter.unlocked).toBe(true);
    expect(by.perfect.unlocked).toBe(true);
    expect(by.week.unlocked).toBe(true);
    expect(by.month.unlocked).toBe(false);
    expect(by.month.progress).toBe(23); // 7 / 30
    expect(by.collector.progress).toBe(20); // 1 / 5 habits
  });

  it('has nothing unlocked for a fresh user', () => {
    expect(rewards([], new Map(), '2026-03-07').every((x) => !x.unlocked)).toBe(true);
  });
});
