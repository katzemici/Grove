// Pure helpers for the Habits page. Unit-tested in habitsView.test.ts.

import { addDays, dayOfWeek, toISODate } from './date';
import { currentStreak, isScheduled, longestStreak } from './streak';
import type { Habit } from './types';

export type HabitPeriod = 'weekly' | 'monthly' | 'yearly';

/** Monday-first week containing `iso` (7 ISO dates). */
export function weekOf(iso: string): string[] {
  const offset = (dayOfWeek(iso) + 6) % 7; // Mon=0 .. Sun=6
  const monday = addDays(iso, -offset);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** All dates of the calendar month containing `iso`. */
export function monthOf(iso: string): string[] {
  const [y, m] = iso.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  return Array.from({ length: days }, (_, i) => toISODate(new Date(y, m - 1, i + 1)));
}

/** All dates of the year containing `iso`. */
export function yearOf(iso: string): string[] {
  const y = Number(iso.slice(0, 4));
  const out: string[] = [];
  for (let d = new Date(y, 0, 1); d.getFullYear() === y; d.setDate(d.getDate() + 1)) {
    out.push(toISODate(d));
  }
  return out;
}

export function periodDays(period: HabitPeriod, anchor: string): string[] {
  if (period === 'weekly') return weekOf(anchor);
  if (period === 'monthly') return monthOf(anchor);
  return yearOf(anchor);
}

/** Move the anchor one period forward (+1) or back (-1). */
export function shiftAnchor(period: HabitPeriod, anchor: string, dir: 1 | -1): string {
  if (period === 'weekly') return addDays(anchor, 7 * dir);
  const [y, m] = anchor.split('-').map(Number);
  if (period === 'monthly') return toISODate(new Date(y, m - 1 + dir, 1));
  return toISODate(new Date(y + dir, 0, 1));
}

/** True when the habit existed and was scheduled on `iso`. */
export function isDue(habit: Habit, iso: string): boolean {
  return habit.created_at.slice(0, 10) <= iso && isScheduled(habit, iso);
}

export interface PeriodStats {
  /** Completed scheduled check-ins / scheduled check-ins, 0-100. */
  rate: number;
  /** Days where every due habit was completed (and at least one was due). */
  perfectDays: number;
  /** Completed check-ins on due days. */
  habitsDone: number;
  /** habitsDone / elapsed days in the period, one decimal. */
  dailyAverage: number;
  /** Best current streak across all habits. */
  currentStreak: number;
}

export function periodStats(
  habits: Habit[],
  doneByHabit: Map<string, Set<string>>,
  days: string[],
  today: string,
): PeriodStats {
  let due = 0;
  let done = 0;
  let perfect = 0;
  let elapsed = 0;
  for (const iso of days) {
    if (iso > today) continue;
    elapsed++;
    let dueToday = 0;
    let doneToday = 0;
    for (const h of habits) {
      if (!isDue(h, iso)) continue;
      dueToday++;
      if (doneByHabit.get(h.id)?.has(iso)) doneToday++;
    }
    due += dueToday;
    done += doneToday;
    if (dueToday > 0 && doneToday === dueToday) perfect++;
  }
  const streak = Math.max(
    0,
    ...habits.map((h) => currentStreak(h, doneByHabit.get(h.id) ?? new Set(), today)),
  );
  return {
    rate: due > 0 ? Math.round((done / due) * 100) : 0,
    perfectDays: perfect,
    habitsDone: done,
    dailyAverage: elapsed > 0 ? Math.round((done / elapsed) * 10) / 10 : 0,
    currentStreak: streak,
  };
}

/** Completion rate (0-100) for each month of `year`. Months with nothing due yet are null. */
export function monthRates(
  habit: Habit,
  done: Set<string>,
  year: number,
  today: string,
): (number | null)[] {
  const rates: (number | null)[] = [];
  for (let m = 0; m < 12; m++) {
    const days = monthOf(toISODate(new Date(year, m, 1)));
    let due = 0;
    let hit = 0;
    for (const iso of days) {
      if (iso > today || !isDue(habit, iso)) continue;
      due++;
      if (done.has(iso)) hit++;
    }
    rates.push(due === 0 ? null : Math.round((hit / due) * 100));
  }
  return rates;
}

export interface Reward {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  /** 0-100 progress towards unlocking. */
  progress: number;
}

/** Achievements derived from existing data (nothing extra is stored). */
export function rewards(
  habits: Habit[],
  doneByHabit: Map<string, Set<string>>,
  today: string,
): Reward[] {
  const total = Array.from(doneByHabit.values()).reduce((n, s) => n + s.size, 0);
  const best = Math.max(
    0,
    ...habits.map((h) => longestStreak(h, doneByHabit.get(h.id) ?? new Set(), today)),
  );
  const firstCompletion = habits.length
    ? habits.map((h) => doneByHabit.get(h.id)?.size ?? 0).some((n) => n > 0)
    : false;
  const perfect = habits.length
    ? periodStats(habits, doneByHabit, Array.from({ length: 365 }, (_, i) => addDays(today, -i)), today)
        .perfectDays
    : 0;

  const make = (id: string, title: string, description: string, value: number, goal: number): Reward => ({
    id,
    title,
    description,
    unlocked: value >= goal,
    progress: Math.min(100, Math.round((value / goal) * 100)),
  });

  return [
    make('starter', 'Starter win', 'Complete a habit for the first time', firstCompletion ? 1 : 0, 1),
    make('perfect', 'Perfect day', 'Finish every habit due on one day', perfect, 1),
    make('week', 'One week hero', 'Reach a 7-day streak', best, 7),
    make('collector', 'Gardener', 'Track 5 habits at once', habits.length, 5),
    make('month', 'Monthly master', 'Reach a 30-day streak', best, 30),
    make('century', 'Century', 'Log 100 completions', total, 100),
  ];
}

/** Human label for a period window, e.g. "Oct 26 – Nov 1, 2026", "October 2026", "2026". */
export function periodLabel(period: HabitPeriod, days: string[]): string {
  const first = days[0];
  const last = days[days.length - 1];
  const d = (iso: string, opts: Intl.DateTimeFormatOptions) => {
    const [y, m, day] = iso.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString(undefined, opts);
  };
  if (period === 'yearly') return first.slice(0, 4);
  if (period === 'monthly') return d(first, { month: 'long', year: 'numeric' });
  return `${d(first, { month: 'short', day: 'numeric' })} – ${d(last, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}
