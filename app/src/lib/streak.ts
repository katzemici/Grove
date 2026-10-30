// Habit streak business logic (HAB-005). Pure functions, unit-tested in habits.test.ts.
//
// Streak definition:
//  - DAILY habit: the current streak is the number of consecutive days, ending
//    at today (or yesterday, if today isn't done yet), that are all completed.
//    A missed day breaks the streak. Today being incomplete does NOT break a
//    streak that ran through yesterday — it just hasn't been extended yet.
//  - WEEKLY habit (specific weekdays): only "scheduled" days count. The streak
//    is the number of consecutive scheduled occurrences, walking backwards from
//    the most recent scheduled day that is due, that were all completed. A
//    scheduled day in the past that was missed breaks the streak. The current
//    scheduled day not yet completed does not break the prior run.

import type { Habit } from './types';
import { addDays, dayOfWeek, todayISO } from './date';

export function isScheduled(habit: Habit, iso: string): boolean {
  if (habit.frequency.kind === 'daily') return true;
  return habit.frequency.days.includes(dayOfWeek(iso));
}

/**
 * Compute the current streak for a habit given the set of completed dates.
 * @param today override for testing; defaults to the real today.
 */
export function currentStreak(
  habit: Habit,
  completedDates: Set<string>,
  today: string = todayISO(),
): number {
  if (habit.frequency.kind === 'daily') {
    return dailyStreak(completedDates, today);
  }
  return weeklyStreak(habit.frequency.days, completedDates, today);
}

function dailyStreak(done: Set<string>, today: string): number {
  // Start from today if done, otherwise from yesterday (today is still "open").
  let cursor = done.has(today) ? today : addDays(today, -1);
  let streak = 0;
  // Safety bound to prevent pathological loops.
  for (let i = 0; i < 100000; i++) {
    if (done.has(cursor)) {
      streak++;
      cursor = addDays(cursor, -1);
    } else {
      break;
    }
  }
  return streak;
}

function weeklyStreak(days: number[], done: Set<string>, today: string): number {
  if (days.length === 0) return 0;
  const scheduled = (iso: string) => days.includes(dayOfWeek(iso));

  // Find the most recent scheduled day on or before today.
  let cursor = today;
  let guard = 0;
  while (!scheduled(cursor)) {
    cursor = addDays(cursor, -1);
    if (++guard > 7) return 0;
  }

  // If the most recent scheduled day is today and it's not done yet, the streak
  // is "open" — evaluate from the previous scheduled day instead of breaking.
  if (cursor === today && !done.has(cursor)) {
    cursor = prevScheduled(cursor, scheduled);
  }

  let streak = 0;
  for (let i = 0; i < 100000; i++) {
    if (done.has(cursor)) {
      streak++;
      cursor = prevScheduled(cursor, scheduled);
    } else {
      break;
    }
  }
  return streak;
}

function prevScheduled(iso: string, scheduled: (iso: string) => boolean): string {
  let cursor = addDays(iso, -1);
  let guard = 0;
  while (!scheduled(cursor)) {
    cursor = addDays(cursor, -1);
    if (++guard > 7) break;
  }
  return cursor;
}

/**
 * Longest streak ever achieved for a habit, scanning from its first completion
 * (or creation) up to today. Uses the same frequency rules as currentStreak.
 */
export function longestStreak(
  habit: Habit,
  completedDates: Set<string>,
  today: string = todayISO(),
): number {
  if (completedDates.size === 0) return 0;
  const dates = Array.from(completedDates).sort();
  const start = dates[0];

  const scheduledFn = (iso: string) =>
    habit.frequency.kind === 'daily' ? true : habit.frequency.days.includes(dayOfWeek(iso));

  let best = 0;
  let run = 0;
  let cursor = start;
  let guard = 0;
  while (cursor <= today && guard++ < 100000) {
    if (scheduledFn(cursor)) {
      if (completedDates.has(cursor)) {
        run++;
        best = Math.max(best, run);
      } else {
        run = 0;
      }
    } else if (completedDates.has(cursor)) {
      // An unscheduled completion still counts as a day done.
      run++;
      best = Math.max(best, run);
    }
    cursor = addDays(cursor, 1);
  }
  return best;
}

/** Completion rate (0–100) over the last `windowDays` scheduled days. */
export function completionRate(
  habit: Habit,
  completedDates: Set<string>,
  windowDays: number,
  today: string = todayISO(),
): number {
  let scheduled = 0;
  let done = 0;
  for (let i = 0; i < windowDays; i++) {
    const iso = addDays(today, -i);
    if (isScheduled(habit, iso)) {
      scheduled++;
      if (completedDates.has(iso)) done++;
    }
  }
  if (scheduled === 0) return 0;
  return Math.round((done / scheduled) * 100);
}
