import { describe, expect, it } from 'vitest';
import { balanceAfter, bankBalances, defaultBankId, rememberBank, totalBalance, validateBank } from '../lib/banks';
import { LocalAdapter, createMemoryStore } from '../lib/localAdapter';
import type { Bank, Transaction } from '../lib/types';

function bank(id: string, opening: number, p: Partial<Bank> = {}): Bank {
  return { id, user_id: null, name: id, kind: 'bank', color: '#6fa9d6', opening_balance: opening, created_at: '2026-01-01T00:00:00Z', ...p };
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
    created_at: '2026-03-10T00:00:00Z',
    ...p,
  };
}

const today = '2026-03-10';
const banks = [bank('bca', 1000), bank('cash', 200)];
const transactions = [
  tx({ amount: 150, bank_id: 'bca' }),
  tx({ type: 'income', amount: 500, category: 'Salary', bank_id: 'bca' }),
  tx({ amount: 50, bank_id: 'cash' }),
  tx({ amount: 30 }), // not linked to a bank
  tx({ amount: 999, bank_id: 'bca', date: '2026-03-20' }), // future
];

describe('bankBalances', () => {
  it('applies linked expenses and income to each bank', () => {
    const rows = bankBalances(banks, transactions, today);
    expect(rows.map((r) => [r.bank.id, r.balance])).toEqual([
      ['bca', 1350],
      ['cash', 150],
    ]);
    expect(rows.map((r) => r.share)).toEqual([90, 10]);
  });

  it('can go negative and then has no share', () => {
    const [row] = bankBalances([bank('x', 10)], [tx({ amount: 25, bank_id: 'x' })], today);
    expect(row).toMatchObject({ balance: -15, share: 0 });
  });
});

describe('totalBalance', () => {
  it('includes opening balances and unlinked transactions, but not future ones', () => {
    // 1000 + 200 opening, +500 income, -150 -50 -30 expenses.
    expect(totalBalance(banks, transactions, today)).toBe(1470);
  });

  it('equals plain income minus expense without banks', () => {
    expect(totalBalance([], [tx({ amount: 40 }), tx({ type: 'income', amount: 100 })], today)).toBe(60);
  });
});

describe('balanceAfter', () => {
  it('previews the result of a new expense or income', () => {
    expect(balanceAfter(100, 30, 'expense')).toBe(70);
    expect(balanceAfter(100, 30, 'income')).toBe(130);
  });

  it('undoes the previous effect when editing', () => {
    // Editing a 20 expense into a 50 expense on a bank currently at 80.
    expect(balanceAfter(80, 50, 'expense', -20)).toBe(50);
  });
});

describe('validateBank', () => {
  it('requires a unique name and a valid balance', () => {
    expect(validateBank({ name: 'BCA', opening_balance: '1,000' }, [])).toEqual({});
    expect(validateBank({ name: '', opening_balance: '' }, []).name).toBeTruthy();
    expect(validateBank({ name: 'bca', opening_balance: '' }, [bank('b', 0, { name: 'BCA' })]).name).toBeTruthy();
    expect(validateBank({ name: 'X', opening_balance: 'abc' }, []).opening_balance).toBeTruthy();
  });
});

describe('default bank', () => {
  it('prefers the last used bank, then the first', () => {
    rememberBank('cash');
    expect(defaultBankId(banks)).toBe('cash');
    rememberBank('gone');
    expect(defaultBankId(banks)).toBe('bca');
    expect(defaultBankId([])).toBe('');
  });
});

describe('LocalAdapter banks', () => {
  it('creates, updates and deletes banks, unlinking transactions', async () => {
    const db = new LocalAdapter(createMemoryStore());
    const b = await db.createBank({ name: 'BCA', kind: 'savings', color: '#6fa9d6', opening_balance: 500 });
    await db.updateBank(b.id, { opening_balance: 600 });
    expect((await db.listBanks())[0].opening_balance).toBe(600);
    const t = await db.createTransaction({ type: 'expense', amount: 5, category: 'Food', date: today, note: '', bank_id: b.id });
    await db.deleteBank(b.id);
    expect(await db.listBanks()).toEqual([]);
    expect((await db.listTransactions()).find((x) => x.id === t.id)?.bank_id).toBeNull();
  });
});
