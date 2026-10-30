import { describe, expect, it } from 'vitest';
import {
  budgetSummary,
  daysLeftInMonth,
  previousMonthKey,
  resolveAccount,
  validateAccount,
} from '../lib/budgets';
import { LocalAdapter, createMemoryStore } from '../lib/localAdapter';
import type { BudgetAccount, Transaction } from '../lib/types';

function account(id: string, p: Partial<BudgetAccount> = {}): BudgetAccount {
  return {
    id,
    user_id: null,
    name: id,
    color: '#6faf5b',
    icon: 'utensils',
    monthly_budget: 100,
    categories: [],
    created_at: '2026-01-01T00:00:00.000Z',
    ...p,
  };
}

let n = 0;
function tx(p: Partial<Transaction>): Transaction {
  n++;
  return {
    id: 't' + n,
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

describe('resolveAccount', () => {
  const food = account('food', { categories: ['Food'] });
  const fun = account('fun', { categories: ['Entertainment'], created_at: '2026-02-01T00:00:00Z' });

  it('uses the explicit account first', () => {
    expect(resolveAccount(tx({ category: 'Food', account_id: 'fun' }), [food, fun])?.id).toBe('fun');
  });

  it('falls back to category matching', () => {
    expect(resolveAccount(tx({ category: 'Entertainment' }), [food, fun])?.id).toBe('fun');
    expect(resolveAccount(tx({ category: 'Housing' }), [food, fun])).toBeNull();
  });

  it('never assigns income', () => {
    expect(resolveAccount(tx({ type: 'income', category: 'Food' }), [food])).toBeNull();
  });

  it('treats a deleted account id as unassigned', () => {
    expect(resolveAccount(tx({ category: 'Housing', account_id: 'gone' }), [food])).toBeNull();
  });
});

describe('budgetSummary', () => {
  const today = '2026-03-10';
  const food = account('food', { categories: ['Food'], monthly_budget: 200 });
  const fun = account('fun', { monthly_budget: 50 });

  const transactions = [
    tx({ amount: 30, category: 'Food' }), // food, this month
    tx({ amount: 20, category: 'Food', date: '2026-03-02' }), // food, this month
    tx({ amount: 60, category: 'Housing', account_id: 'fun' }), // fun, explicit, over budget
    tx({ amount: 15, category: 'Housing' }), // uncovered
    tx({ amount: 120, category: 'Food', date: '2026-02-15' }), // food, last month
    tx({ amount: 999, category: 'Food', date: '2026-03-20' }), // future, ignored
    tx({ type: 'income', amount: 1000, category: 'Salary' }),
  ];

  const s = budgetSummary([food, fun], transactions, today);
  const byId = Object.fromEntries(s.usage.map((u) => [u.account.id, u]));

  it('totals each account for the current month', () => {
    expect(byId.food).toMatchObject({ spent: 50, remaining: 150, pct: 25, over: false, count: 2 });
    expect(byId.fun).toMatchObject({ spent: 60, remaining: -10, pct: 120, over: true, perDay: 0 });
  });

  it('computes leftover savings from last month', () => {
    expect(byId.food.savedLastMonth).toBe(80);
    expect(byId.fun.savedLastMonth).toBe(50);
  });

  it('suggests a daily pace for the rest of the month', () => {
    // 22 days left including today (March has 31 days).
    expect(s.daysLeft).toBe(22);
    expect(byId.food.perDay).toBe(6.82);
  });

  it('summarises budgeted, spent, unassigned and uncovered amounts', () => {
    expect(s).toMatchObject({ budgeted: 250, spent: 110, remaining: 140, unassigned: 750, uncovered: 15 });
  });

  it('does not report savings for months before the account existed', () => {
    const fresh = account('new', { categories: ['Food'], created_at: '2026-03-05T00:00:00Z' });
    expect(budgetSummary([fresh], transactions, today).usage[0].savedLastMonth).toBe(0);
  });
});

describe('date helpers', () => {
  it('finds the previous month across a year boundary', () => {
    expect(previousMonthKey('2026-01-15')).toBe('2025-12');
  });

  it('counts days left including today', () => {
    expect(daysLeftInMonth('2026-02-28')).toBe(1);
    expect(daysLeftInMonth('2026-03-01')).toBe(31);
  });
});

describe('validateAccount', () => {
  const others = [account('Food', { name: 'Food', categories: ['Food'] })];
  const draft = { name: 'Fun', monthly_budget: '50', color: '#6faf5b', icon: 'film', categories: [] };

  it('accepts a valid draft', () => {
    expect(validateAccount(draft, others)).toEqual({});
  });

  it('requires a unique name', () => {
    expect(validateAccount({ ...draft, name: '  ' }, others).name).toBeTruthy();
    expect(validateAccount({ ...draft, name: 'food' }, others).name).toMatch(/already/);
  });

  it('requires a positive budget', () => {
    expect(validateAccount({ ...draft, monthly_budget: '' }, others).monthly_budget).toBeTruthy();
    expect(validateAccount({ ...draft, monthly_budget: 'abc' }, others).monthly_budget).toBeTruthy();
    expect(validateAccount({ ...draft, monthly_budget: '0' }, others).monthly_budget).toBeTruthy();
  });

  it('rejects categories already owned by another account', () => {
    expect(validateAccount({ ...draft, categories: ['Food'] }, others).categories).toMatch(/Food/);
  });
});

describe('LocalAdapter budget accounts', () => {
  it('creates, updates and deletes accounts, unassigning their transactions', async () => {
    const db = new LocalAdapter(createMemoryStore());
    const a = await db.createAccount({
      name: 'Food',
      color: '#6faf5b',
      icon: 'utensils',
      monthly_budget: 300,
      categories: ['Food'],
    });
    expect(a.user_id).toBeNull();
    expect(await db.listAccounts()).toHaveLength(1);

    const updated = await db.updateAccount(a.id, { monthly_budget: 350 });
    expect(updated.monthly_budget).toBe(350);

    const t = await db.createTransaction({
      type: 'expense',
      amount: 12,
      category: 'Food',
      date: '2026-03-10',
      note: '',
      account_id: a.id,
    });
    await db.deleteAccount(a.id);
    expect(await db.listAccounts()).toHaveLength(0);
    const kept = (await db.listTransactions()).find((x) => x.id === t.id);
    expect(kept?.account_id).toBeNull();
  });

  it('reads data saved before accounts existed', async () => {
    const store = createMemoryStore();
    store.setItem('aio-productivity:v1', JSON.stringify({ transactions: [], habits: [], completions: [], projects: [], tasks: [] }));
    expect(await new LocalAdapter(store).listAccounts()).toEqual([]);
  });
});
