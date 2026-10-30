import { describe, expect, it } from 'vitest';
import { currentStreak, isScheduled } from '../lib/streak';
import type { Habit } from '../lib/types';

function daily(): Habit {
  return {
    id: 'h1',
    user_id: null,
    name: 'Daily',
    frequency: { kind: 'daily' },
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function weekly(days: number[]): Habit {
  return {
    id: 'h2',
    user_id: null,
    name: 'Weekly',
    frequency: { kind: 'weekly', days },
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

const set = (...d: string[]) => new Set(d);

describe('daily streaks (QA-003)', () => {
  const today = '2026-03-10'; // Tuesday

  it('is 0 with no completions', () => {
    expect(currentStreak(daily(), set(), today)).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    expect(currentStreak(daily(), set('2026-03-08', '2026-03-09', '2026-03-10'), today)).toBe(3);
  });

  it('stays alive when today is not yet done but yesterday was', () => {
    // Today incomplete should not break a run through yesterday.
    expect(currentStreak(daily(), set('2026-03-08', '2026-03-09'), today)).toBe(2);
  });

  it('breaks on a gap', () => {
    // Missing 2026-03-09 breaks the streak; only today counts.
    expect(currentStreak(daily(), set('2026-03-07', '2026-03-08', '2026-03-10'), today)).toBe(1);
  });

  it('is 0 when neither today nor yesterday are done', () => {
    expect(currentStreak(daily(), set('2026-03-01'), today)).toBe(0);
  });
});

describe('weekly streaks (QA-003)', () => {
  // Mon/Wed/Fri habit. 2026-03-13 is a Friday.
  const habit = weekly([1, 3, 5]);

  it('counts only scheduled occurrences', () => {
    // Fri 03-13, Wed 03-11, Mon 03-09 completed => streak 3.
    const done = set('2026-03-09', '2026-03-11', '2026-03-13');
    expect(currentStreak(habit, done, '2026-03-13')).toBe(3);
  });

  it('ignores completions on non-scheduled days', () => {
    // Completing Tue 03-10 (not scheduled) does not extend the streak.
    const done = set('2026-03-13', '2026-03-10');
    expect(currentStreak(habit, done, '2026-03-13')).toBe(1);
  });

  it('stays open when the current scheduled day is not done yet', () => {
    // Today Fri 03-13 not done, but Wed 03-11 and Mon 03-09 done => streak 2.
    const done = set('2026-03-09', '2026-03-11');
    expect(currentStreak(habit, done, '2026-03-13')).toBe(2);
  });

  it('breaks when a past scheduled day was missed', () => {
    // Missing Wed 03-11; Fri 03-13 done => streak 1.
    const done = set('2026-03-09', '2026-03-13');
    expect(currentStreak(habit, done, '2026-03-13')).toBe(1);
  });

  it('evaluated on a non-scheduled day uses the most recent scheduled day', () => {
    // Today is Sun 03-15 (not scheduled). Most recent scheduled is Fri 03-13.
    const done = set('2026-03-09', '2026-03-11', '2026-03-13');
    expect(currentStreak(habit, done, '2026-03-15')).toBe(3);
  });

  it('returns 0 when no days are configured', () => {
    expect(currentStreak(weekly([]), set('2026-03-13'), '2026-03-13')).toBe(0);
  });
});

describe('isScheduled', () => {
  it('daily habits are scheduled every day', () => {
    expect(isScheduled(daily(), '2026-03-10')).toBe(true);
  });
  it('weekly habits are scheduled only on configured weekdays', () => {
    const habit = weekly([1, 3, 5]); // Mon/Wed/Fri
    expect(isScheduled(habit, '2026-03-13')).toBe(true); // Friday
    expect(isScheduled(habit, '2026-03-14')).toBe(false); // Saturday
  });
});
