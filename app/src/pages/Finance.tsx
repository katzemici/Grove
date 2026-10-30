import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../lib/db';
import type { NewTransaction } from '../lib/adapter';
import {
  FINANCE_CATEGORIES,
  type Bank,
  type BudgetAccount,
  type Transfer,
  type FinanceCategory,
  type Transaction,
  type TransactionType,
} from '../lib/types';
import { formatMoney } from '../lib/finance';
import {
  CURRENCIES,
  amountPlaceholder,
  currencySymbol,
  getCurrency,
  parseAmount,
  roundMoney,
  setCurrency,
} from '../lib/currency';
import { balanceAfter, bankBalances, defaultBankId, rememberBank, totalBalance } from '../lib/banks';
import { BankForm, BankList, TransferForm } from '../components/finance/Banks';

const TRANSFER_FILTER = '__transfers';

type ActivityRow =
  | { kind: 'tx'; id: string; date: string; created_at: string; tx: Transaction }
  | { kind: 'transfer'; id: string; date: string; created_at: string; tr: Transfer };
import { formatDateHuman, todayISO } from '../lib/date';
import {
  allocateTicks,
  balanceChange,
  byCategory,
  inMonth,
  shortId,
  spendingSeries,
  toCSV,
} from '../lib/financeView';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import Icon from '../components/Icon';
import Ring from '../components/Ring';
import SpendingChart from '../components/charts/SpendingChart';
import BudgetAccounts from '../components/finance/BudgetAccounts';
import { budgetSummary, resolveAccount } from '../lib/budgets';
import { LiquidCheck, LiquidTabs, Menu } from '../components/Liquid';
import { EmptyState, ErrorBanner, Loading } from '../components/states';

// Moodboard accents used for category rings and the tick bar.
const PALETTE = ['#e8a45c', '#6fa9d6', '#6faf5b', '#c86fa0', '#d9b84a', '#8f9b6d', '#b98a6a'];
const TICKS = 56;
const RECENT_LIMIT = 8;

type SpendWindow = 7 | 30 | 90;
type CategoryMode = 'totals' | 'percent';

export default function Finance() {
  const [items, setItems] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<BudgetAccount[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankForm, setBankForm] = useState<{ bank: Bank | null } | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [transferForm, setTransferForm] = useState<{ transfer: Transfer | null } | null>(null);
  const [accountFilter, setAccountFilter] = useState<string | null>(null);
  const activityRef = useRef<HTMLElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [editing, setEditing] = useState<Transaction | null>(null);
  const [formType, setFormType] = useState<TransactionType>('expense');
  const [showForm, setShowForm] = useState(false);
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showAll, setShowAll] = useState(false);

  const [spendWindow, setSpendWindow] = useState<SpendWindow>(30);
  const [catMode, setCatMode] = useState<CategoryMode>('totals');

  const today = todayISO();

  async function load() {
    setError(null);
    try {
      const schemaHint = (what: string) => (e: Error) => {
        setError(`${what} could not be loaded: ${e.message}. If you use Supabase, re-run supabase/schema.sql.`);
        return [];
      };
      const [tx, acc, bk, tr] = await Promise.all([
        db.listTransactions(),
        db.listAccounts().catch(schemaHint('Budgets') as (e: Error) => BudgetAccount[]),
        db.listBanks().catch(schemaHint('Banks') as (e: Error) => Bank[]),
        db.listTransfers().catch(schemaHint('Transfers') as (e: Error) => Transfer[]),
      ]);
      setItems(tx);
      setAccounts(acc);
      setBanks(bk);
      setTransfers(tr);
    } catch (e) {
      setError((e as Error).message || 'Failed to load transactions.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  // ---- Derived data ----
  const total = useMemo(() => totalBalance(banks, items, today), [banks, items, today]);
  const balances = useMemo(() => bankBalances(banks, items, today, transfers), [banks, items, today, transfers]);
  const bankName = (id: string | null) => (id ? banks.find((b) => b.id === id)?.name ?? 'Deleted bank' : 'Deleted bank');
  const canTransfer = banks.length >= 2;
  const change = useMemo(() => balanceChange(items, today), [items, today]);
  const monthItems = useMemo(() => inMonth(items, today), [items, today]);
  const monthSpend = useMemo(() => byCategory(monthItems, 'expense'), [monthItems]);
  const monthSpendTotal = monthSpend.reduce((s, c) => s + c.total, 0);
  const dayOfMonth = Number(today.slice(8));
  const budget = useMemo(() => budgetSummary(accounts, items, today), [accounts, items, today]);
  // With budgets, the tick bar shows spent (colored by category) against the total budget (grey).
  const ticks = useMemo(() => {
    const scale = budget.budgeted > monthSpendTotal ? budget.budgeted : monthSpendTotal;
    const filled = scale > 0 ? Math.round((monthSpendTotal / scale) * TICKS) : 0;
    const counts = allocateTicks(monthSpend.map((c) => c.total), filled);
    return counts.flatMap((n, i) => Array.from({ length: n }, () => PALETTE[i % PALETTE.length]));
  }, [monthSpend, monthSpendTotal, budget.budgeted]);
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const series = useMemo(() => spendingSeries(items, spendWindow, today), [items, spendWindow, today]);

  const filteredTx = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (catFilter === TRANSFER_FILTER) return [];
    return items.filter((t) => {
      if (catFilter !== 'all' && t.category !== catFilter) return false;
      if (accountFilter && resolveAccount(t, accounts)?.id !== accountFilter) return false;
      if (fromDate && t.date < fromDate) return false;
      if (toDate && t.date > toDate) return false;
      if (q && !`${t.note} ${t.category} ${shortId(t.id)} ${t.type}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, query, catFilter, fromDate, toDate, accountFilter, accounts]);

  // Activity = transactions + transfers, newest first. Transfers have no category or budget.
  const filtered = useMemo<ActivityRow[]>(() => {
    const q = query.trim().toLowerCase();
    const showTransfers = (catFilter === 'all' || catFilter === TRANSFER_FILTER) && !accountFilter;
    const trRows: ActivityRow[] = showTransfers
      ? transfers
          .filter((tr) => {
            if (fromDate && tr.date < fromDate) return false;
            if (toDate && tr.date > toDate) return false;
            const text = `${tr.note} transfer ${bankName(tr.from_bank_id)} ${bankName(tr.to_bank_id)}`;
            return !q || text.toLowerCase().includes(q);
          })
          .map((tr) => ({ kind: 'transfer', id: tr.id, date: tr.date, created_at: tr.created_at, tr }))
      : [];
    const txRows: ActivityRow[] = filteredTx.map((tx) => ({ kind: 'tx', id: tx.id, date: tx.date, created_at: tx.created_at, tx }));
    return [...txRows, ...trRows].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
    // bankName reads `banks`, listed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTx, transfers, catFilter, accountFilter, fromDate, toDate, query, banks]);
  const visible = showAll ? filtered : filtered.slice(0, RECENT_LIMIT);
  const transferIds = useMemo(() => new Set(transfers.map((tr) => tr.id)), [transfers]);
  const filtersOn = catFilter !== 'all' || !!fromDate || !!toDate || !!query || !!accountFilter;

  function filterByAccount(id: string | null) {
    setAccountFilter(id);
    setShowAll(false);
    if (id) activityRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const allVisibleSelected = visible.length > 0 && visible.every((t) => selected.has(t.id));

  // ---- Actions ----
  function openForm(type: TransactionType, tx: Transaction | null = null) {
    setFormType(type);
    setEditing(tx);
    setShowForm(true);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((t) => next.delete(t.id));
      else visible.forEach((t) => next.add(t.id));
      return next;
    });
  }

  async function confirmDelete() {
    if (!deleteIds) return;
    try {
      for (const id of deleteIds) {
        if (transferIds.has(id)) await db.deleteTransfer(id);
        else await db.deleteTransaction(id);
      }
      setSelected((prev) => {
        const next = new Set(prev);
        deleteIds.forEach((id) => next.delete(id));
        return next;
      });
      setDeleteIds(null);
      await load();
    } catch (e) {
      setError((e as Error).message || 'Failed to delete.');
      setDeleteIds(null);
    }
  }

  function exportCSV(rows: Transaction[]) {
    const blob = new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const changeUp = change.change >= 0;
  const spendUp = (series.changePct ?? 0) > 0;

  return (
    <main className="page">
      <header className="page-head compact">
        <div>
          <h1>Finance</h1>

        </div>
        <div className="head-actions">
          <Menu
            label="Currency"
            trigger={
              <>
                <span className="cur-symbol">{currencySymbol()}</span> {getCurrency()}
                <Icon name="chevronDown" size={13} />
              </>
            }
            items={CURRENCIES.map((c) => ({
              label: `${c.code} · ${currencySymbol(c.code)}  ${c.name}`,
              checked: c.code === getCurrency(),
              onSelect: () => setCurrency(c.code),
            }))}
          />
          <button className="btn btn-secondary" onClick={() => exportCSV(items)} disabled={items.length === 0}>
            <Icon name="download" size={16} /> Export
          </button>
          <button className="btn btn-primary" onClick={() => openForm('expense')}>
            <Icon name="plus" size={16} /> Add transaction
          </button>
        </div>
      </header>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {loading ? (
        <div className="card">
          <Loading />
        </div>
      ) : (
        <div className="fin-grid">
          {/* ------------------------------------------------ Total balance */}
          <section className="card fin-cell rise" style={{ ['--i' as string]: 0 }}>
            <div className="cell-head">
              <h2 className="cell-title">Total balance</h2>
              <Menu
                label="Balance options"
                items={[
                  { label: 'Add bank', onSelect: () => setBankForm({ bank: null }) },
                  { label: 'Transfer', onSelect: () => setTransferForm({ transfer: null }), disabled: !canTransfer },
                  { label: 'Add expense', onSelect: () => openForm('expense') },
                  { label: 'Record income', onSelect: () => openForm('income') },
                  { label: 'Export CSV', onSelect: () => exportCSV(items), disabled: !items.length },
                ]}
              />
            </div>
            <div className={'big-money' + (total < 0 ? ' neg' : '')}>{formatMoney(total)}</div>
            <div className="delta-line">
              <span className={changeUp ? 'pos' : 'neg'}>
                {changeUp ? '+' : '−'}
                {formatMoney(Math.abs(change.change))}
                <Icon name={changeUp ? 'trendUp' : 'trendDown'} size={13} />
              </span>
              <span className="muted">this month</span>
            </div>

            <div className="sub-label">Banks</div>
            <BankList
              balances={balances}
              onAdd={() => setBankForm({ bank: null })}
              onEdit={(bank) => setBankForm({ bank })}
            />

            <div className="cta-row">
              <button className="btn btn-accent grow" onClick={() => openForm('expense')}>
                <Icon name="send" size={15} /> Add expense
              </button>
              <button className="btn btn-outline grow" onClick={() => openForm('income')}>
                <Icon name="plus" size={15} /> Record income
              </button>
              {canTransfer && (
                <button
                  className="btn btn-outline btn-icon-label"
                  onClick={() => setTransferForm({ transfer: null })}
                  aria-label="Transfer between banks"
                  title="Transfer between banks"
                >
                  <Icon name="swap" size={15} />
                </button>
              )}
            </div>
          </section>

          {/* ------------------------------------------------ Spending by category */}
          <section className="card fin-cell rise" style={{ ['--i' as string]: 1 }}>
            <div className="cell-head">
              <h2 className="cell-title">Spending this month</h2>
              <LiquidTabs
                size="sm"
                label="Category display"
                value={catMode}
                onChange={setCatMode}
                options={[
                  { value: 'totals', label: 'Totals' },
                  { value: 'percent', label: 'Percent' },
                ]}
              />
            </div>
            <div className="split-line">
              <div>
                <div className="big-money sm">{formatMoney(monthSpendTotal)}</div>
                <div className="muted small">Across {monthSpend.length} categories</div>
              </div>
              <div className="right">
                {budget.budgeted > 0 ? (
                  <>
                    <b>{formatMoney(budget.budgeted)}</b>
                    <span className="muted small"> budgeted this month</span>
                  </>
                ) : (
                  <>
                    <b>{formatMoney(dayOfMonth ? monthSpendTotal / dayOfMonth : 0)}</b>
                    <span className="muted small"> per day so far</span>
                  </>
                )}
              </div>
            </div>

            <div className="tick-bar" role="img" aria-label="Share of this month's spending by category">
              {Array.from({ length: TICKS }, (_, i) => (
                <i
                  key={i + ':' + (ticks[i] ?? 'x')}
                  style={{ background: ticks[i] ?? undefined, ['--d' as string]: i * 9 + 'ms' }}
                  className={ticks[i] ? 'on' : ''}
                />
              ))}
            </div>

            {monthSpend.length === 0 ? (
              <p className="muted small">No spending recorded this month.</p>
            ) : (
              <ul className="ring-list">
                {monthSpend.slice(0, 5).map((c, i) => (
                  <li key={c.category}>
                    <Ring pct={c.pct} color={PALETTE[i % PALETTE.length]} dashed />
                    <span className="name">{c.category}</span>
                    {catMode === 'totals' ? (
                      <span className="amt">{formatMoney(c.total)}</span>
                    ) : (
                      <span className="amt">{c.pct}%</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ------------------------------------------------ Budget accounts */}
          <BudgetAccounts
            accounts={accounts}
            summary={budget}
            activeAccount={accountFilter}
            onFilter={filterByAccount}
            onChanged={load}
            onError={setError}
          />

          {/* ------------------------------------------------ Spending chart */}
          <section className="card fin-cell wide rise" style={{ ['--i' as string]: 2 }}>
            <div className="cell-head">
              <h2 className="cell-title">Spending</h2>
              <div className="head-actions">
                <button
                  className={'btn btn-icon sm' + (refreshing ? ' spinning' : '')}
                  onClick={refresh}
                  aria-label="Refresh"
                >
                  <Icon name="refresh" size={15} />
                </button>
                <LiquidTabs
                  size="sm"
                  label="Spending window"
                  value={spendWindow}
                  onChange={setSpendWindow}
                  options={[
                    { value: 7, label: '7 days' },
                    { value: 30, label: '30 days' },
                    { value: 90, label: '3 months' },
                  ]}
                />
              </div>
            </div>
            <div className="split-line">
              <div className="delta-line big">
                <span className="big-money sm">{formatMoney(series.total)}</span>
                {series.changePct !== null && (
                  <span className={spendUp ? 'neg' : 'pos'}>
                    {spendUp ? '+' : ''}
                    {series.changePct}%
                    <Icon name={spendUp ? 'trendUp' : 'trendDown'} size={13} />
                  </span>
                )}
                <span className="muted">vs. the {spendWindow} days before</span>
              </div>
              <div className="legend">
                <span>
                  <span className="ring-dot cur" /> This period
                </span>
                <span>
                  <span className="ring-dot prev" /> Period before
                </span>
              </div>
            </div>
            <SpendingChart series={series} />
          </section>

          {/* ------------------------------------------------ Recent activity */}
          <section
            className="card fin-cell wide rise activity"
            style={{ ['--i' as string]: 4 }}
            ref={activityRef}
          >
            <div className="cell-head wrap">
              <h2 className="cell-title">Recent activity</h2>
              <div className="head-actions wrap">
                <label className="search-field">
                  <Icon name="search" size={15} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search..."
                    aria-label="Search transactions"
                  />
                </label>
                <select
                  className="select sm"
                  value={catFilter}
                  onChange={(e) => setCatFilter(e.target.value)}
                  aria-label="Filter by category"
                >
                  <option value="all">All categories</option>
                  {transfers.length > 0 && <option value={TRANSFER_FILTER}>Transfers</option>}
                  {FINANCE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {accounts.length > 0 && (
                  <select
                    className="select sm"
                    value={accountFilter ?? ''}
                    onChange={(e) => setAccountFilter(e.target.value || null)}
                    aria-label="Filter by budget account"
                  >
                    <option value="">All accounts</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  type="date"
                  className="input sm"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  aria-label="From date"
                />
                <input
                  type="date"
                  className="input sm"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  aria-label="To date"
                />
                {filtersOn && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setQuery('');
                      setCatFilter('all');
                      setFromDate('');
                      setToDate('');
                      setAccountFilter(null);
                    }}
                  >
                    Clear
                  </button>
                )}
                {filtered.length > RECENT_LIMIT && (
                  <button className="btn btn-outline btn-sm" onClick={() => setShowAll((s) => !s)}>
                    {showAll ? 'Show less' : `See all (${filtered.length})`}
                  </button>
                )}
                <Menu
                  label="Activity options"
                  items={[
                    {
                      label: `Delete selected (${selected.size})`,
                      onSelect: () => setDeleteIds(Array.from(selected)),
                      disabled: selected.size === 0,
                      danger: true,
                    },
                    { label: 'Export filtered CSV', onSelect: () => exportCSV(filteredTx), disabled: !filteredTx.length },
                  ]}
                />
              </div>
            </div>

            {items.length === 0 && transfers.length === 0 ? (
              <EmptyState icon="wallet" title="No transactions yet" hint="Add your first income or expense to get started." />
            ) : filtered.length === 0 ? (
              <EmptyState icon="search" title="No matches" hint="Try adjusting your search or filters." />
            ) : (
              <div className="table-wrap">
                <table className="tx-table">
                  <thead>
                    <tr>
                      <th className="c-check">
                        <LiquidCheck checked={allVisibleSelected} onChange={toggleAllVisible} label="Select all shown" />
                      </th>
                      <th className="c-id">ID</th>
                      <th>Description</th>
                      <th>Category</th>
                      {accounts.length > 0 && <th className="c-acct">Account</th>}
                      <th>Date</th>
                      {banks.length > 0 && <th className="c-bank">Bank</th>}
                      <th className="c-amt">Amount</th>
                      <th className="c-act" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((row, i) => {
                      if (row.kind === 'transfer') {
                        const tr = row.tr;
                        const from = banks.find((b) => b.id === tr.from_bank_id);
                        const to = banks.find((b) => b.id === tr.to_bank_id);
                        return (
                          <tr
                            key={tr.id}
                            className={'rise-row is-transfer' + (selected.has(tr.id) ? ' sel' : '')}
                            style={{ ['--i' as string]: i }}
                            onClick={() => setTransferForm({ transfer: tr })}
                          >
                            <td className="c-check">
                              <LiquidCheck
                                checked={selected.has(tr.id)}
                                onChange={() => toggleSelect(tr.id)}
                                label={`Select transfer ${tr.note}`}
                              />
                            </td>
                            <td className="c-id mono">{shortId(tr.id).replace('TX-', 'TR-')}</td>
                            <td className="strong">{tr.note || 'Transfer'}</td>
                            <td>
                              <span className="cat-chip transfer">
                                <Icon name="swap" size={12} /> Transfer
                              </span>
                            </td>
                            {accounts.length > 0 && (
                              <td className="c-acct">
                                <span className="muted">-</span>
                              </td>
                            )}
                            <td className="muted">{formatDateHuman(tr.date)}</td>
                            {banks.length > 0 && (
                              <td className="c-bank">
                                <span className="transfer-route">
                                  <span className="acct-chip" style={{ ['--acct' as string]: from?.color ?? '#a2ac87' }}>
                                    <span className="dot" />
                                    {from?.name ?? 'Deleted'}
                                  </span>
                                  <Icon name="arrowRight" size={12} />
                                  <span className="acct-chip" style={{ ['--acct' as string]: to?.color ?? '#a2ac87' }}>
                                    <span className="dot" />
                                    {to?.name ?? 'Deleted'}
                                  </span>
                                </span>
                              </td>
                            )}
                            <td className="c-amt amount transfer">{formatMoney(tr.amount)}</td>
                            <td className="c-act" onClick={(e) => e.stopPropagation()}>
                              <Menu
                                label={`Options for transfer ${tr.note}`}
                                items={[
                                  { label: 'Edit', onSelect: () => setTransferForm({ transfer: tr }) },
                                  { label: 'Delete', onSelect: () => setDeleteIds([tr.id]), danger: true },
                                ]}
                              />
                            </td>
                          </tr>
                        );
                      }
                      const t = row.tx;
                      return (
                      <tr
                        key={t.id}
                        className={'rise-row' + (selected.has(t.id) ? ' sel' : '')}
                        style={{ ['--i' as string]: i }}
                        onClick={() => openForm(t.type, t)}
                      >
                        <td className="c-check">
                          <LiquidCheck
                            checked={selected.has(t.id)}
                            onChange={() => toggleSelect(t.id)}
                            label={`Select ${t.note || t.category}`}
                          />
                        </td>
                        <td className="c-id mono">{shortId(t.id)}</td>
                        <td className="strong">{t.note || t.category}</td>
                        <td>
                          <span className="cat-chip">
                            <Icon name="tag" size={12} /> {t.category}
                          </span>
                        </td>
                        {accounts.length > 0 && (
                          <td className="c-acct">
                            {(() => {
                              const a = resolveAccount(t, accounts);
                              return a ? (
                                <span className="acct-chip" style={{ ['--acct' as string]: a.color }}>
                                  <span className="dot" />
                                  {a.name}
                                </span>
                              ) : (
                                <span className="muted">-</span>
                              );
                            })()}
                          </td>
                        )}
                        <td className="muted">{formatDateHuman(t.date)}</td>
                        {banks.length > 0 && (
                          <td className="c-bank">
                            {(() => {
                              const b = t.bank_id ? banks.find((x) => x.id === t.bank_id) : undefined;
                              return b ? (
                                <span className="acct-chip" style={{ ['--acct' as string]: b.color }}>
                                  <span className="dot" />
                                  {b.name}
                                </span>
                              ) : (
                                <span className="muted">-</span>
                              );
                            })()}
                          </td>
                        )}
                        <td className={'c-amt amount ' + t.type}>
                          {t.type === 'income' ? '+' : '−'}
                          {formatMoney(t.amount)}
                        </td>
                        <td className="c-act" onClick={(e) => e.stopPropagation()}>
                          <Menu
                            label={`Options for ${t.note || t.category}`}
                            items={[
                              { label: 'Edit', onSelect: () => openForm(t.type, t) },
                              { label: 'Delete', onSelect: () => setDeleteIds([t.id]), danger: true },
                            ]}
                          />
                        </td>
                      </tr>
                    
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {showForm && (
        <TransactionForm
          initial={editing}
          defaultType={formType}
          accounts={accounts}
          accountById={accountById}
          banks={banks}
          balances={balances}
          onClose={() => setShowForm(false)}
          onSaved={async () => {
            setShowForm(false);
            await load();
          }}
          onError={(m) => setError(m)}
        />
      )}

      {transferForm && (
        <TransferForm
          initial={transferForm.transfer}
          banks={banks}
          balances={balances}
          today={today}
          onClose={() => setTransferForm(null)}
          onSaved={async () => {
            setTransferForm(null);
            await load();
          }}
          onError={(m) => setError(m)}
        />
      )}

      {bankForm && (
        <BankForm
          initial={bankForm.bank}
          others={banks.filter((b) => b.id !== bankForm.bank?.id)}
          linkedCount={
            bankForm.bank
              ? items.filter((t) => t.bank_id === bankForm.bank!.id).length +
                transfers.filter((tr) => tr.from_bank_id === bankForm.bank!.id || tr.to_bank_id === bankForm.bank!.id).length
              : 0
          }
          onClose={() => setBankForm(null)}
          onSaved={async () => {
            setBankForm(null);
            await load();
          }}
          onError={(m) => setError(m)}
        />
      )}

      {deleteIds && (
        <ConfirmDialog
          message={
            deleteIds.length === 1
              ? transferIds.has(deleteIds[0])
                ? 'This transfer will be removed. Both bank balances go back.'
                : 'This transaction will be permanently removed and totals will update.'
              : `${deleteIds.length} items will be permanently removed.`
          }
          onConfirm={confirmDelete}
          onCancel={() => setDeleteIds(null)}
        />
      )}
    </main>
  );
}

function TransactionForm({
  initial,
  defaultType,
  accounts,
  accountById,
  banks,
  balances,
  onClose,
  onSaved,
  onError,
}: {
  initial: Transaction | null;
  defaultType: TransactionType;
  accounts: BudgetAccount[];
  accountById: Map<string, BudgetAccount>;
  banks: Bank[];
  balances: { bank: Bank; balance: number }[];
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [type, setType] = useState<TransactionType>(initial?.type ?? defaultType);
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [category, setCategory] = useState<FinanceCategory>(
    initial?.category ?? (defaultType === 'income' ? 'Salary' : 'Food'),
  );
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [note, setNote] = useState(initial?.note ?? '');
  // '' = assign automatically by category.
  const [accountId, setAccountId] = useState<string>(
    initial?.account_id && accountById.has(initial.account_id) ? initial.account_id : '',
  );
  const [bankId, setBankId] = useState<string>(() => {
    if (initial) return initial.bank_id && banks.some((b) => b.id === initial.bank_id) ? initial.bank_id : '';
    return defaultBankId(banks);
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const autoAccount = accounts
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .find((a) => a.categories.includes(category));

  // Preview of the chosen bank's balance after saving (undoing this transaction's old effect when editing).
  const bankAfter = (() => {
    if (!bankId) return null;
    const row = balances.find((b) => b.bank.id === bankId);
    const amt = parseAmount(amount);
    if (!row || Number.isNaN(amt) || amt <= 0) return null;
    const prevEffect =
      initial && initial.bank_id === bankId && initial.date <= todayISO()
        ? initial.type === 'income'
          ? initial.amount
          : -initial.amount
        : 0;
    return balanceAfter(row.balance, roundMoney(amt), type, prevEffect);
  })();

  function validate(): NewTransaction | null {
    const errs: Record<string, string> = {};
    const amt = parseAmount(amount);
    if (amount.trim() === '' || Number.isNaN(amt)) errs.amount = 'Enter a valid number.';
    else if (amt <= 0) errs.amount = 'Amount must be greater than 0.';
    if (!date) errs.date = 'Date is required.';
    if (!category) errs.category = 'Category is required.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return null;
    return {
      type,
      amount: roundMoney(amt),
      category,
      date,
      note: note.trim(),
      account_id: type === 'expense' && accountId ? accountId : null,
      bank_id: bankId || null,
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = validate();
    if (!payload) return;
    setSaving(true);
    try {
      if (initial) await db.updateTransaction(initial.id, payload);
      else await db.createTransaction(payload);
      rememberBank(payload.bank_id ?? null);
      onSaved();
    } catch (err) {
      onError((err as Error).message || 'Failed to save transaction.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? 'Edit transaction' : type === 'income' ? 'Record income' : 'Add expense'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field" style={{ marginBottom: 16 }}>
          <LiquidTabs
            label="Transaction type"
            value={type}
            onChange={setType}
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
            ]}
          />
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="amount">Amount</label>
            <div className={'money-input' + (errors.amount ? ' invalid' : '')}>
              <span aria-hidden>{currencySymbol()}</span>
              <input
                id="amount"
                inputMode="decimal"
                placeholder={amountPlaceholder()}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </div>
            {errors.amount && <span className="field-error">{errors.amount}</span>}
          </div>
          <div className="field">
            <label htmlFor="category">Category</label>
            <select
              id="category"
              className="select"
              value={category}
              onChange={(e) => setCategory(e.target.value as FinanceCategory)}
            >
              {FINANCE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="date">Date</label>
            <input
              id="date"
              type="date"
              className={'input' + (errors.date ? ' invalid' : '')}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            {errors.date && <span className="field-error">{errors.date}</span>}
          </div>
        </div>

        {banks.length > 0 && (
          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="bank">{type === 'income' ? 'Into' : 'From'}</label>
            <select id="bank" className="select" value={bankId} onChange={(e) => setBankId(e.target.value)}>
              {balances.map(({ bank, balance }) => (
                <option key={bank.id} value={bank.id}>
                  {bank.name} · {formatMoney(balance)}
                </option>
              ))}
              <option value="">No bank</option>
            </select>
            {bankAfter !== null && (
              <span className={'muted small' + (bankAfter < 0 ? ' neg' : '')}>
                After: {formatMoney(bankAfter)}
              </span>
            )}
          </div>
        )}

        {type === 'expense' && accounts.length > 0 && (
          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="account">Budget</label>
            <select id="account" className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">
                {autoAccount ? `Auto · ${autoAccount.name}` : 'None'}
              </option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="note">Note (optional)</label>
          <input
            id="note"
            className="input"
            placeholder="e.g. Groceries at the market"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Add'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
