import { useEffect, useMemo, useState } from 'react';
import { db } from '../lib/db';
import type { NewHabit } from '../lib/adapter';
import type { Habit, HabitCompletion, HabitFrequency } from '../lib/types';
import { dayOfWeek, formatDateHuman, todayISO } from '../lib/date';
import { currentStreak, isScheduled } from '../lib/streak';
import {
  isDue,
  monthRates,
  periodDays,
  periodLabel,
  periodStats,
  rewards,
  shiftAnchor,
  type HabitPeriod,
} from '../lib/habitsView';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import Icon, { type IconName } from '../components/Icon';
import Ring from '../components/Ring';
import { LiquidCheck, LiquidTabs, Menu } from '../components/Liquid';
import { EmptyState, ErrorBanner, Loading } from '../components/states';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const PAGE_SIZE = 4;

const PERIOD_OPTIONS: { value: HabitPeriod; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

/** Pick an icon from the habit's name; falls back to a sprout. */
function habitIcon(name: string): IconName {
  const n = name.toLowerCase();
  if (/water|drink|hydrat/.test(n)) return 'droplet';
  if (/read|book|study|learn/.test(n)) return 'book';
  if (/sleep|bed|nap/.test(n)) return 'moon';
  if (/run|gym|workout|lift|stretch|yoga|exercise/.test(n)) return 'dumbbell';
  if (/meditat|breath|calm|gratitude|journal/.test(n)) return 'heart';
  if (/walk|sun|outside|garden/.test(n)) return 'sun';
  return 'sprout';
}

const REWARD_ICONS: Record<string, IconName> = {
  starter: 'sprout',
  perfect: 'sun',
  week: 'flame',
  collector: 'leaf',
  month: 'trophy',
  century: 'medal',
};

export default function Habits() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const today = todayISO();
  const [page, setPage] = useState(0);
  const [trackPeriod, setTrackPeriod] = useState<HabitPeriod>('weekly');
  const [anchor, setAnchor] = useState(today);
  const [statPeriod, setStatPeriod] = useState<HabitPeriod>('monthly');
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [h, c] = await Promise.all([db.listHabits(), db.listCompletions()]);
      setHabits(h);
      setCompletions(c);
    } catch (e) {
      setError((e as Error).message || 'Failed to load habits.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const doneByHabit = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const c of completions) {
      if (!map.has(c.habit_id)) map.set(c.habit_id, new Set());
      map.get(c.habit_id)!.add(c.date);
    }
    return map;
  }, [completions]);

  // Today's list: habits scheduled today first, then the rest.
  const todayList = useMemo(
    () =>
      habits
        .slice()
        .sort((a, b) => Number(isScheduled(b, today)) - Number(isScheduled(a, today))),
    [habits, today],
  );
  const pages = Math.max(1, Math.ceil(todayList.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const pageItems = todayList.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const doneToday = habits.filter((h) => doneByHabit.get(h.id)?.has(today)).length;

  const trackDays = useMemo(() => periodDays(trackPeriod, anchor), [trackPeriod, anchor]);
  const statDays = useMemo(() => periodDays(statPeriod, today), [statPeriod, today]);
  const stats = useMemo(
    () => periodStats(habits, doneByHabit, statDays, today),
    [habits, doneByHabit, statDays, today],
  );
  const rewardList = useMemo(() => rewards(habits, doneByHabit, today), [habits, doneByHabit, today]);
  const canGoForward = trackDays[trackDays.length - 1] < today;

  async function toggle(habit: Habit, date: string) {
    if (date > today) return;
    const key = habit.id + date;
    if (busy === key) return;
    setBusy(key);
    const done = doneByHabit.get(habit.id)?.has(date) ?? false;
    // Optimistic update so the liquid fill animates immediately.
    setCompletions((prev) =>
      done
        ? prev.filter((c) => !(c.habit_id === habit.id && c.date === date))
        : [...prev, { id: 'tmp-' + key, user_id: null, habit_id: habit.id, date, created_at: new Date().toISOString() }],
    );
    try {
      if (done) await db.removeCompletion(habit.id, date);
      else await db.addCompletion(habit.id, date);
      await load();
    } catch (e) {
      setError((e as Error).message || 'Failed to update completion.');
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await db.deleteHabit(deleteId);
      setDeleteId(null);
      await load();
    } catch (e) {
      setError((e as Error).message || 'Failed to delete habit.');
      setDeleteId(null);
    }
  }

  function openForm(h: Habit | null) {
    setEditing(h);
    setShowForm(true);
  }

  return (
    <main className="page">
      <header className="page-head compact">
        <div>
          <div className="kicker">Hello,</div>
          <h1 className="h-bold">Your habits</h1>
        </div>
        <button className="btn btn-peach" onClick={() => openForm(null)}>
          <Icon name="plus" size={16} /> Add new habit
        </button>
      </header>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {loading ? (
        <div className="card">
          <Loading />
        </div>
      ) : habits.length === 0 ? (
        <div className="card">
          <EmptyState icon="sprout" title="No habits yet" hint="Add a habit and start building momentum today." />
        </div>
      ) : (
        <div className="hab-grid">
          {/* ------------------------------------------------ Today's habits */}
          <section className="hab-today rise" style={{ ['--i' as string]: 0 }}>
            <div className="cell-head">
              <h2 className="cell-title lg">Today&apos;s habits</h2>
              <span className="muted small">
                {doneToday} of {habits.length} done
              </span>
            </div>
            <ul className="todo-list">
              {pageItems.map((h, i) => {
                const done = doneByHabit.get(h.id)?.has(today) ?? false;
                const streak = currentStreak(h, doneByHabit.get(h.id) ?? new Set(), today);
                const due = isScheduled(h, today);
                return (
                  <li
                    key={h.id}
                    className={'todo glass-tile rise' + (done ? ' done' : '') + (due ? '' : ' off')}
                    style={{ ['--i' as string]: i + 1 }}
                  >
                    <span className="todo-icon" aria-hidden>
                      <Icon name={habitIcon(h.name)} size={20} />
                    </span>
                    <div className="grow">
                      <div className="todo-name">
                        <span className="strike">{h.name}</span>
                      </div>
                      <div className="todo-sub">
                        {due ? describeFrequency(h.frequency) : 'Not scheduled today'}
                        {streak > 0 && (
                          <span className="streak-badge sm">
                            <Icon name="flame" size={12} /> {streak}
                          </span>
                        )}
                      </div>
                    </div>
                    <Menu
                      label={`Options for ${h.name}`}
                      items={[
                        { label: 'Edit', onSelect: () => openForm(h) },
                        { label: 'Delete', onSelect: () => setDeleteId(h.id), danger: true },
                      ]}
                    />
                    <LiquidCheck
                      checked={done}
                      onChange={() => toggle(h, today)}
                      label={`${h.name} done today`}
                    />
                  </li>
                );
              })}
            </ul>
            {pages > 1 && (
              <div className="pager">
                <span className="muted small">
                  {safePage + 1} / {pages}
                </span>
                <button
                  className="btn btn-icon sm"
                  onClick={() => setPage(Math.max(0, safePage - 1))}
                  disabled={safePage === 0}
                  aria-label="Previous habits"
                >
                  <Icon name="left" size={14} />
                </button>
                <button
                  className="btn btn-icon sm solid"
                  onClick={() => setPage(Math.min(pages - 1, safePage + 1))}
                  disabled={safePage >= pages - 1}
                  aria-label="Next habits"
                >
                  <Icon name="right" size={14} />
                </button>
              </div>
            )}

            <figure className="quote-card">
              <blockquote>
                &ldquo;Small wins build big changes. Today&apos;s effort is tomorrow&apos;s success.&rdquo;
              </blockquote>
              <figcaption>
                <img src="/img/cat-sea.webp" alt="" aria-hidden />
                Grove
              </figcaption>
            </figure>
          </section>

          {/* ------------------------------------------------ Tracker matrix */}
          <section className="card hab-cell rise" style={{ ['--i' as string]: 1 }}>
            <div className="cell-head">
              <LiquidTabs
                label="Tracker period"
                value={trackPeriod}
                onChange={(p) => {
                  setTrackPeriod(p);
                  setAnchor(today);
                }}
                options={PERIOD_OPTIONS}
                size="sm"
              />
            </div>
            <div className="range-row">
              <span className="range-label">{periodLabel(trackPeriod, trackDays)}</span>
              <div className="head-actions">
                <button
                  className="btn btn-icon sm"
                  onClick={() => setAnchor(shiftAnchor(trackPeriod, anchor, -1))}
                  aria-label="Previous period"
                >
                  <Icon name="left" size={14} />
                </button>
                <button
                  className="btn btn-icon sm solid"
                  onClick={() => setAnchor(shiftAnchor(trackPeriod, anchor, 1))}
                  disabled={!canGoForward}
                  aria-label="Next period"
                >
                  <Icon name="right" size={14} />
                </button>
              </div>
            </div>

            <div className="matrix-scroll" key={trackPeriod + trackDays[0]}>
              <table className={'matrix ' + trackPeriod}>
                <thead>
                  <tr>
                    <th />
                    {trackPeriod === 'yearly'
                      ? MONTHS.map((m, i) => <th key={i}>{m}</th>)
                      : trackDays.map((d) => (
                          <th key={d} className={d === today ? 'is-today' : ''}>
                            {trackPeriod === 'weekly' ? WEEKDAYS[dayOfWeek(d)] : Number(d.slice(8))}
                          </th>
                        ))}
                  </tr>
                </thead>
                <tbody>
                  {habits.map((h, row) => {
                    const done = doneByHabit.get(h.id) ?? new Set<string>();
                    if (trackPeriod === 'yearly') {
                      const rates = monthRates(h, done, Number(trackDays[0].slice(0, 4)), today);
                      return (
                        <tr key={h.id}>
                          <th scope="row">{h.name}</th>
                          {rates.map((r, m) => (
                            <td key={m}>
                              <span
                                className={'matrix-cell heat' + (r === null ? ' none' : '')}
                                style={{ ['--a' as string]: r === null ? 0 : 0.15 + (r / 100) * 0.85, ['--i' as string]: row + m }}
                                title={r === null ? 'Nothing due' : `${r}% done`}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    }
                    return (
                      <tr key={h.id}>
                        <th scope="row">{h.name}</th>
                        {trackDays.map((d, col) => {
                          const isDone = done.has(d);
                          const future = d > today;
                          const due = isDue(h, d);
                          return (
                            <td key={d}>
                              <button
                                type="button"
                                className={
                                  'matrix-cell' +
                                  (isDone ? ' on' : '') +
                                  (due ? '' : ' off') +
                                  (d === today ? ' today' : '')
                                }
                                style={{ ['--i' as string]: row + col }}
                                disabled={future}
                                onClick={() => toggle(h, d)}
                                aria-pressed={isDone}
                                aria-label={`${h.name}, ${formatDateHuman(d)}: ${isDone ? 'done' : 'not done'}`}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* ------------------------------------------------ Stats */}
          <section className="card hab-cell rise" style={{ ['--i' as string]: 2 }}>
            <div className="cell-head">
              <LiquidTabs label="Statistics period" value={statPeriod} onChange={setStatPeriod} options={PERIOD_OPTIONS} size="sm" />
            </div>
            <div className="stats-body">
              <div className="donut-wrap">
                <Ring
                  pct={stats.rate}
                  color="var(--sage-700)"
                  size={148}
                  stroke={22}
                  track="rgba(255,255,255,0.75)"
                  label={`${stats.rate}% of due habits completed this ${statPeriod.replace('ly', '')}`}
                >
                  <span className="donut-num">{stats.rate}%</span>
                </Ring>
                <img className="donut-cat" src="/img/cat-daisies.webp" alt="" aria-hidden />
              </div>
              <dl className="stat-grid">
                <div>
                  <dt>Current streak</dt>
                  <dd>
                    {stats.currentStreak} <small>days</small>
                  </dd>
                </div>
                <div>
                  <dt>Perfect days</dt>
                  <dd>{stats.perfectDays}</dd>
                </div>
                <div>
                  <dt>Habits done</dt>
                  <dd>{stats.habitsDone}</dd>
                </div>
                <div>
                  <dt>Daily average</dt>
                  <dd>
                    {stats.dailyAverage} <small>/ day</small>
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          {/* ------------------------------------------------ Rewards */}
          <section className="card hab-cell rise" style={{ ['--i' as string]: 3 }}>
            <div className="cell-head">
              <h2 className="cell-title lg">Rewards</h2>
              <span className="muted small">
                {rewardList.filter((r) => r.unlocked).length} of {rewardList.length} unlocked
              </span>
            </div>
            <ul className="reward-grid">
              {rewardList.map((r, i) => (
                <li
                  key={r.id}
                  className={'reward' + (r.unlocked ? ' unlocked' : '')}
                  style={{ ['--i' as string]: i }}
                  title={r.description}
                  tabIndex={0}
                  aria-label={`${r.title}: ${r.description}. ${r.unlocked ? 'Unlocked' : `${r.progress}% there`}`}
                >
                  <Ring pct={r.progress} color="var(--ginger)" size={64} stroke={3} track="rgba(255,255,255,0.7)">
                    <span className="reward-badge">
                      <Icon name={r.unlocked ? REWARD_ICONS[r.id] : 'lock'} size={22} />
                    </span>
                  </Ring>
                  <span className="reward-title">{r.title}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {showForm && (
        <HabitForm
          initial={editing}
          onClose={() => setShowForm(false)}
          onSaved={async () => {
            setShowForm(false);
            await load();
          }}
          onError={(m) => setError(m)}
        />
      )}

      {deleteId && (
        <ConfirmDialog
          message="This habit and all its completion history will be removed."
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </main>
  );
}

function describeFrequency(f: HabitFrequency): string {
  if (f.kind === 'daily') return 'Every day';
  if (f.days.length === 0) return 'No days selected';
  return f.days.slice().sort((a, b) => a - b).map((d) => WEEKDAY_NAMES[d]).join(', ');
}

function HabitForm({
  initial,
  onClose,
  onSaved,
  onError,
}: {
  initial: Habit | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<'daily' | 'weekly'>(initial?.frequency.kind ?? 'daily');
  const [days, setDays] = useState<number[]>(
    initial?.frequency.kind === 'weekly' ? initial.frequency.days : [1, 2, 3, 4, 5],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function toggleDay(d: number) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Name is required.';
    if (kind === 'weekly' && days.length === 0) errs.days = 'Pick at least one day.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const frequency: HabitFrequency =
      kind === 'daily' ? { kind: 'daily' } : { kind: 'weekly', days: days.slice().sort((a, b) => a - b) };
    const payload: NewHabit = { name: name.trim(), frequency };

    setSaving(true);
    try {
      if (initial) await db.updateHabit(initial.id, payload);
      else await db.createHabit(payload);
      onSaved();
    } catch (err) {
      onError((err as Error).message || 'Failed to save habit.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? 'Edit habit' : 'New habit'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="hname">Name</label>
          <input
            id="hname"
            className={'input' + (errors.name ? ' invalid' : '')}
            placeholder="e.g. Drink water"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          {errors.name && <span className="field-error">{errors.name}</span>}
        </div>

        <div className="field" style={{ marginTop: 16 }}>
          <label>Frequency</label>
          <LiquidTabs
            label="Frequency"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Specific days' },
            ]}
          />
        </div>

        {kind === 'weekly' && (
          <div className="field" style={{ marginTop: 16 }}>
            <label>Days of the week</label>
            <div className="weekday-picker">
              {WEEKDAYS.map((label, d) => (
                <button
                  key={d}
                  type="button"
                  className={'day-dot' + (days.includes(d) ? ' done' : '')}
                  onClick={() => toggleDay(d)}
                  aria-pressed={days.includes(d)}
                  aria-label={WEEKDAY_NAMES[d]}
                >
                  {label}
                </button>
              ))}
            </div>
            {errors.days && <span className="field-error">{errors.days}</span>}
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
