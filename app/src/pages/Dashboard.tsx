import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../lib/db';
import type { Bank, Habit, HabitCompletion, Task, Transaction } from '../lib/types';
import { totalBalance } from '../lib/banks';
import { computeTotals, formatMoney } from '../lib/finance';
import { todayISO } from '../lib/date';
import { isScheduled } from '../lib/streak';
import {
  comparePeriods,
  dailyCounts,
  habitDailyRates,
  leadingCommand,
  parseQuickAdd,
  taskFunnel,
} from '../lib/overview';
import Icon from '../components/Icon';
import FunnelChart from '../components/charts/FunnelChart';
import DotMatrix from '../components/charts/DotMatrix';
import StepLine from '../components/charts/StepLine';
import { InsightCard, StripedBar } from '../components/charts/Bits';
import { ErrorBanner, Loading } from '../components/states';
import { PictureInput } from '../components/ProfileModal';
import { useProfile } from '../lib/session';
import { DEFAULT_INSIGHT_IMAGE } from '../lib/images';

const PERIODS = [7, 14, 30] as const;
type Period = (typeof PERIODS)[number];

export default function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>(14);
  const [copied, setCopied] = useState(false);
  const profile = useProfile();

  const today = todayISO();

  async function load() {
    setError(null);
    try {
      const [t, tx, h, c, b] = await Promise.all([
        db.listTasks(),
        db.listTransactions(),
        db.listHabits(),
        db.listCompletions(),
        db.listBanks().catch(() => [] as Bank[]),
      ]);
      setBanks(b);
      setTasks(t);
      setTransactions(tx);
      setHabits(h);
      setCompletions(c);
    } catch (e) {
      setError((e as Error).message || 'Failed to load your overview.');
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

  const totals = useMemo(() => computeTotals(transactions), [transactions]);
  const balance = useMemo(() => totalBalance(banks, transactions, today), [banks, transactions, today]);
  const funnel = useMemo(() => taskFunnel(tasks), [tasks]);
  const dots = useMemo(() => dailyCounts(transactions, period, today), [transactions, period, today]);
  const compare = useMemo(() => comparePeriods(transactions, period, today), [transactions, period, today]);
  const rates = useMemo(
    () => habitDailyRates(habits, doneByHabit, period, today),
    [habits, doneByHabit, period, today],
  );

  const insight = useMemo(() => {
    const scheduled = habits.filter(
      (h) => h.created_at.slice(0, 10) <= today && isScheduled(h, today),
    );
    if (scheduled.length > 0) {
      const done = scheduled.filter((h) => doneByHabit.get(h.id)?.has(today)).length;
      return {
        stat: Math.round((done / scheduled.length) * 100) + '%',
        caption: `of today's habits done (${done} of ${scheduled.length})`,
      };
    }
    if (tasks.length > 0) {
      const done = tasks.filter((t) => t.status === 'done').length;
      return { stat: Math.round((done / tasks.length) * 100) + '%', caption: 'of your tasks completed' };
    }
    return { stat: '0%', caption: 'Add a habit or task to see your progress' };
  }, [habits, tasks, doneByHabit, today]);

  const flowMax = Math.max(totals.income, totals.expense, 1);
  const savingsRate = totals.income > 0 ? Math.round((totals.balance / totals.income) * 100) : 0;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('Could not copy the link. Your browser blocked clipboard access.');
    }
  }

  return (
    <main className="page">
      <header className="page-head">
        <div className="title-group">
          <h1>Overview</h1>
          <button
            className="btn-icon btn sm"
            onClick={copyLink}
            aria-label={copied ? 'Link copied' : 'Copy link to this view'}
            title={copied ? 'Copied' : 'Copy link'}
          >
            <Icon name={copied ? 'check' : 'link'} size={14} />
          </button>
        </div>

        <div className="date-compare">
          <label className="glass-pill" style={{ paddingRight: 8 }}>
            <Icon name="calendar" size={14} />
            <select
              aria-label="Period"
              value={period}
              onChange={(e) => setPeriod(Number(e.target.value) as Period)}
              style={{
                appearance: 'none',
                border: 'none',
                background: 'transparent',
                font: 'inherit',
                color: 'inherit',
                cursor: 'pointer',
                paddingRight: 2,
              }}
            >
              {PERIODS.map((p) => (
                <option key={p} value={p}>
                  Last {p} days
                </option>
              ))}
            </select>
            <Icon name="chevronDown" size={12} />
          </label>
          <span className="vs">compared to</span>
          <span className="glass-pill">
            <Icon name="calendar" size={14} /> Previous {period} days
          </span>
        </div>
      </header>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {loading ? (
        <div className="card">
          <Loading />
        </div>
      ) : (
        <div className="overview-grid">
          {/* Task flow funnel + quick-add */}
          <section className="card span-8 card-pad" style={{ overflow: 'hidden' }}>
            <div className="panel-head" style={{ marginBottom: 0 }}>
              <h2 className="card-title">Task flow</h2>
              <Link to="/kanban" className="btn btn-icon" aria-label="Open Kanban">
                <Icon name="arrowUpRight" size={16} />
              </Link>
            </div>

            {tasks.length === 0 ? (
              <div className="state" style={{ padding: '56px 16px 88px' }}>
                <div className="emoji">
                  <Icon name="board" size={28} />
                </div>
                <h3>No tasks yet</h3>
                <p>Add one below with /task, or open the Kanban board.</p>
              </div>
            ) : (
              <FunnelChart stages={funnel} unit="tasks" />
            )}

            <QuickAdd onAdded={load} />
          </section>

          {/* Balance with striped breakdown */}
          <section className="card span-4 card-pad" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="panel-head" style={{ marginBottom: 0 }}>
              <h2 className="card-title">Balance</h2>
              <Link to="/finance" className="btn btn-icon" aria-label="Open Finance">
                <Icon name="arrowUpRight" size={16} />
              </Link>
            </div>
            <div
              className="hero-value"
              style={{ marginTop: 20, color: balance < 0 ? 'var(--negative)' : undefined }}
            >
              {formatMoney(balance)}
            </div>
            <div className="metric-label" style={{ marginTop: 6 }}>
              All time · {transactions.length} transactions
            </div>
            <div className="divider" />
            <div className="breakdown">
              <StripedBar
                label="Income"
                value={formatMoney(totals.income)}
                pct={(totals.income / flowMax) * 100}
                colors={['var(--meadow)', 'var(--leaf)']}
              />
              <StripedBar
                label="Expenses"
                value={formatMoney(totals.expense)}
                pct={(totals.expense / flowMax) * 100}
                colors={['var(--sky-deep)', 'var(--sky)']}
              />
              <StripedBar
                label="Savings rate"
                value={savingsRate + '%'}
                pct={savingsRate}
                colors={['var(--ginger)', 'var(--daisy)']}
              />
            </div>
          </section>

          {/* Habit consistency step line */}
          <section className="card span-3 card-pad" style={{ overflow: 'hidden' }}>
            <div className="panel-head" style={{ marginBottom: 0 }}>
              <h2 className="card-title">Habit consistency</h2>
              <Link to="/habits" className="btn btn-icon" aria-label="Open Habits">
                <Icon name="arrowUpRight" size={16} />
              </Link>
            </div>
            {habits.length === 0 ? (
              <p className="secondary" style={{ marginTop: 24 }}>
                Create a habit to track how consistent you are.
              </p>
            ) : (
              <>
                <StepLine
                  values={rates}
                  label={`Daily habit completion over the last ${period} days. Today: ${rates[rates.length - 1]}%`}
                />
                <div className="metric-label" style={{ marginTop: 10 }}>
                  Share of scheduled habits done each day
                </div>
              </>
            )}
          </section>

          {/* Transactions dot matrix */}
          <section className="card span-5 card-pad">
            <div className="panel-head" style={{ marginBottom: 0 }}>
              <h2 className="card-title">Transactions</h2>
              <Link to="/finance" className="btn btn-icon" aria-label="Open Finance">
                <Icon name="arrowUpRight" size={16} />
              </Link>
            </div>
            <div className="tx-body">
              <div className="hero-value">{compare.current}</div>
              <DotMatrix days={dots} />
              <div className="tx-compare">
                <div className="lbl">vs previous {period} days</div>
                <div className="val">
                  {compare.delta > 0 ? '+' : compare.delta < 0 ? '−' : ''}
                  {Math.abs(compare.delta).toLocaleString()}
                </div>
              </div>
            </div>
          </section>

          {/* Insight photo card: the user's own picture, or the default cat */}
          <InsightCard
            className="span-4"
            image={profile?.insight_image_url ?? DEFAULT_INSIGHT_IMAGE}
            alt={
              profile?.insight_image_url
                ? 'Your insight picture'
                : 'Ginger cat resting on grass among daisies'
            }
            stat={insight.stat}
            caption={insight.caption}
            action={
              profile && (
                <PictureInput
                  slot="insight"
                  className="insight-edit"
                  label="Change insight picture"
                  onError={setError}
                >
                  <Icon name="camera" size={15} />
                </PictureInput>
              )
            }
          />
        </div>
      )}
    </main>
  );
}

const COMMAND_LABEL: Record<string, string> = {
  '/task': 'New task',
  '/habit': 'New habit',
  '/expense': 'Expense',
  '/income': 'Income',
};

function QuickAdd({ onAdded }: { onAdded: () => Promise<void> | void }) {
  const [open, setOpen] = useState(true);
  const [text, setText] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const cmd = leadingCommand(text);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseQuickAdd(text);
    if (!parsed.ok) {
      setMessage({ tone: 'error', text: parsed.error });
      return;
    }
    const v = parsed.value;
    setSaving(true);
    try {
      if (v.kind === 'task') {
        await db.createTask({
          title: v.title,
          description: '',
          priority: 'medium',
          due_date: null,
          project_id: null,
          status: 'todo',
        });
        setMessage({ tone: 'ok', text: `Added task "${v.title}" to To Do.` });
      } else if (v.kind === 'habit') {
        await db.createHabit({ name: v.name, frequency: { kind: 'daily' } });
        setMessage({ tone: 'ok', text: `Added daily habit "${v.name}".` });
      } else {
        await db.createTransaction({
          type: v.kind,
          amount: v.amount,
          category: v.category,
          date: todayISO(),
          note: v.note,
        });
        setMessage({
          tone: 'ok',
          text: `Added ${v.kind} of ${formatMoney(v.amount)} in ${v.category}.`,
        });
      }
      setText('');
      await onAdded();
    } catch (err) {
      setMessage({ tone: 'error', text: (err as Error).message || 'Could not save that.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ask-bar">
      <div className="ask-head">
        <span className="lead">
          <Icon name="sparkles" size={14} /> What would you like to add next?
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? 'Collapse quick add' : 'Expand quick add'}
        >
          <Icon name={open ? 'chevronUp' : 'chevronDown'} size={14} />
        </button>
      </div>
      <div className={'ask-collapse' + (open ? '' : ' closed')}>
        <div>
          <form className="ask-input" onSubmit={submit}>
            {cmd && <span className="token">{COMMAND_LABEL[cmd]}</span>}
            <input
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setMessage(null);
              }}
              placeholder="/expense 12.50 Food Lunch"
              aria-label="Quick add"
              aria-describedby="quick-add-hint"
            />
            <button className="btn btn-primary btn-sm" disabled={saving || !text.trim()}>
              <Icon name="plus" size={14} /> Add
            </button>
          </form>
          <div
            id="quick-add-hint"
            className="ask-hint"
            role={message?.tone === 'error' ? 'alert' : 'status'}
            style={
              message
                ? { color: message.tone === 'error' ? 'var(--negative)' : 'var(--positive)' }
                : undefined
            }
          >
            {message?.text ?? 'Try /task, /habit, /expense or /income. Plain text adds a task.'}
          </div>
        </div>
      </div>
    </div>
  );
}
