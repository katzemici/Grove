import { describe, expect, it } from 'vitest';
import { bankBalances, totalBalance, transferPreview, validateTransfer } from '../lib/banks';
import { LocalAdapter, createMemoryStore } from '../lib/localAdapter';
import type { Bank, Transfer } from '../lib/types';

const today = '2026-03-10';
const bank = (id: string, opening: number): Bank => ({
  id,
  user_id: null,
  name: id.toUpperCase(),
  kind: 'bank',
  color: '#6fa9d6',
  opening_balance: opening,
  created_at: '2026-01-01T00:00:00Z',
});
const transfer = (p: Partial<Transfer>): Transfer => ({
  id: 'tr' + Math.random(),
  user_id: null,
  from_bank_id: 'bca',
  to_bank_id: 'sav',
  amount: 100,
  date: today,
  note: '',
  created_at: today + 'T00:00:00Z',
  ...p,
});
const banks = [bank('bca', 1000), bank('sav', 0)];

describe('transfers and balances', () => {
  it('move money from one bank to the other', () => {
    const rows = bankBalances(banks, [], today, [transfer({ amount: 300 })]);
    expect(rows.map((r) => r.balance)).toEqual([700, 300]);
  });

  it('never change the total balance', () => {
    expect(totalBalance(banks, [], today)).toBe(1000);
    // totalBalance ignores transfers by design; bank balances still sum to the same total.
    const rows = bankBalances(banks, [], today, [transfer({ amount: 300 })]);
    expect(rows.reduce((s, r) => s + r.balance, 0)).toBe(1000);
  });

  it('wait until their date', () => {
    const rows = bankBalances(banks, [], today, [transfer({ date: '2026-03-20' })]);
    expect(rows.map((r) => r.balance)).toEqual([1000, 0]);
  });

  it('keep the remaining side when one bank was deleted', () => {
    const rows = bankBalances([bank('sav', 0)], [], today, [transfer({ from_bank_id: null })]);
    expect(rows[0].balance).toBe(100);
  });
});

describe('validateTransfer', () => {
  const ok = { from: 'bca', to: 'sav', amount: '250', date: today };

  it('accepts a valid transfer', () => {
    expect(validateTransfer(ok, banks)).toEqual({});
  });

  it('rejects same bank, missing banks, bad amounts and dates', () => {
    expect(validateTransfer({ ...ok, to: 'bca' }, banks).to).toBeTruthy();
    expect(validateTransfer({ ...ok, from: '' }, banks).from).toBeTruthy();
    expect(validateTransfer({ ...ok, to: 'gone' }, banks).to).toBeTruthy();
    expect(validateTransfer({ ...ok, amount: '0' }, banks).amount).toBeTruthy();
    expect(validateTransfer({ ...ok, amount: 'x' }, banks).amount).toBeTruthy();
    expect(validateTransfer({ ...ok, date: '' }, banks).date).toBeTruthy();
  });
});

describe('transferPreview', () => {
  const balances = new Map([
    ['bca', 700],
    ['sav', 300],
  ]);

  it('shows both balances after a new transfer', () => {
    expect(transferPreview(balances, 'bca', 'sav', 200, null, today)).toEqual({ from: 500, to: 500 });
  });

  it('undoes the old amount when editing', () => {
    // The 300 transfer already happened; editing it to 50 means bca 950, sav 50.
    const editing = transfer({ amount: 300 });
    expect(transferPreview(balances, 'bca', 'sav', 50, editing, today)).toEqual({ from: 950, to: 50 });
  });

  it('handles editing a transfer into the reverse direction', () => {
    const editing = transfer({ amount: 300 });
    // Undo (bca 1000, sav 0), then sav -> bca 100: sav -100, bca 1100.
    expect(transferPreview(balances, 'sav', 'bca', 100, editing, today)).toEqual({ from: -100, to: 1100 });
  });
});

describe('LocalAdapter transfers', () => {
  it('creates, updates, deletes, and survives bank deletion', async () => {
    const db = new LocalAdapter(createMemoryStore());
    const a = await db.createBank({ name: 'BCA', kind: 'bank', color: '#6fa9d6', opening_balance: 1000 });
    const b = await db.createBank({ name: 'Savings', kind: 'savings', color: '#6faf5b', opening_balance: 0 });
    const tr = await db.createTransfer({ from_bank_id: a.id, to_bank_id: b.id, amount: 200, date: today, note: 'Save' });
    await db.updateTransfer(tr.id, { amount: 250 });
    expect((await db.listTransfers())[0].amount).toBe(250);

    await db.deleteBank(a.id);
    const [kept] = await db.listTransfers();
    expect(kept).toMatchObject({ from_bank_id: null, to_bank_id: b.id, amount: 250 });

    await db.deleteTransfer(tr.id);
    expect(await db.listTransfers()).toEqual([]);
  });
});
