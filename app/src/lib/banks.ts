// Banks (savings, bank accounts, cash, e-wallets): pure helpers, tested in banks.test.ts.
//
// Rules
//  - A bank's balance = opening_balance + linked income - linked expenses
//    + transfers in - transfers out.
//  - Transfers never change the total balance (money only moves between banks).
//  - Transactions dated in the future are ignored until their date.
//  - Total balance = every bank's opening balance + all income - all expenses
//    (transactions not linked to a bank still count toward the total).

import { round2 } from './finance';
import { parseAmount } from './currency';
import type { Bank, BankKind, Transaction, Transfer } from './types';

export const BANK_KIND_INFO: Record<BankKind, { label: string; icon: string }> = {
  savings: { label: 'Savings', icon: 'piggy' },
  bank: { label: 'Bank', icon: 'wallet' },
  cash: { label: 'Cash', icon: 'cash' },
  ewallet: { label: 'E-wallet', icon: 'phone' },
};

export const BANK_COLORS = ['#6fa9d6', '#6faf5b', '#e8a45c', '#c86fa0', '#d9b84a', '#7d8fd6', '#8f9b6d', '#b98a6a'] as const;

export interface BankBalance {
  bank: Bank;
  balance: number;
  /** Share of the combined positive bank balances, 0-100. */
  share: number;
}

export function bankBalances(
  banks: Bank[],
  transactions: Transaction[],
  today: string,
  transfers: Transfer[] = [],
): BankBalance[] {
  const net = new Map<string, number>();
  const add = (id: string | null | undefined, v: number) => {
    if (id) net.set(id, (net.get(id) ?? 0) + v);
  };
  for (const t of transactions) {
    if (t.date > today) continue;
    add(t.bank_id, t.type === 'income' ? t.amount : -t.amount);
  }
  for (const tr of transfers) {
    if (tr.date > today) continue;
    add(tr.from_bank_id, -tr.amount);
    add(tr.to_bank_id, tr.amount);
  }
  const rows = banks.map((bank) => ({ bank, balance: round2(bank.opening_balance + (net.get(bank.id) ?? 0)) }));
  const positive = rows.reduce((s, r) => s + Math.max(0, r.balance), 0);
  return rows.map((r) => ({ ...r, share: positive > 0 ? Math.round((Math.max(0, r.balance) / positive) * 100) : 0 }));
}

/** Total balance including every bank's opening balance. */
export function totalBalance(banks: Bank[], transactions: Transaction[], today: string): number {
  let sum = banks.reduce((s, b) => s + b.opening_balance, 0);
  for (const t of transactions) {
    if (t.date > today) continue;
    sum += t.type === 'income' ? t.amount : -t.amount;
  }
  return round2(sum);
}

/** Balance a bank would have after saving a transaction (for the form preview). */
export function balanceAfter(
  current: number,
  amount: number,
  type: Transaction['type'],
  /** The same transaction's previous effect on this bank when editing, to avoid double counting. */
  previousEffect = 0,
): number {
  return round2(current - previousEffect + (type === 'income' ? amount : -amount));
}

export interface BankDraft {
  name: string;
  opening_balance: string;
}

export type BankErrors = Partial<Record<'name' | 'opening_balance', string>>;

export function validateBank(draft: BankDraft, others: Bank[]): BankErrors {
  const errors: BankErrors = {};
  const name = draft.name.trim();
  if (!name) errors.name = 'Name is required.';
  else if (name.length > 40) errors.name = 'Keep it under 40 characters.';
  else if (others.some((b) => b.name.trim().toLowerCase() === name.toLowerCase())) errors.name = 'Name already used.';

  const text = draft.opening_balance.trim();
  if (text !== '') {
    const n = parseAmount(text);
    if (Number.isNaN(n)) errors.opening_balance = 'Enter a valid amount.';
    else if (Math.abs(n) > 1e13) errors.opening_balance = 'That amount is too large.';
  }
  return errors;
}

const LAST_BANK_KEY = 'grove:last-bank';

/** The bank to preselect for a new transaction: last used if it still exists, else the first one. */
export function defaultBankId(banks: Bank[]): string {
  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST_BANK_KEY);
  } catch {
    last = null;
  }
  if (last && banks.some((b) => b.id === last)) return last;
  return banks[0]?.id ?? '';
}

export function rememberBank(id: string | null): void {
  try {
    if (id) localStorage.setItem(LAST_BANK_KEY, id);
  } catch {
    // Storage unavailable: preselection just falls back to the first bank.
  }
}

export interface TransferDraft {
  from: string;
  to: string;
  amount: string;
  date: string;
}

export type TransferErrors = Partial<Record<'from' | 'to' | 'amount' | 'date', string>>;

export function validateTransfer(draft: TransferDraft, banks: Bank[]): TransferErrors {
  const errors: TransferErrors = {};
  const ids = new Set(banks.map((b) => b.id));
  if (!draft.from || !ids.has(draft.from)) errors.from = 'Choose where the money comes from.';
  if (!draft.to || !ids.has(draft.to)) errors.to = 'Choose where it goes.';
  else if (draft.to === draft.from) errors.to = 'Pick a different bank.';
  const n = parseAmount(draft.amount);
  if (draft.amount.trim() === '' || Number.isNaN(n)) errors.amount = 'Enter a valid amount.';
  else if (n <= 0) errors.amount = 'Amount must be greater than 0.';
  else if (n > 1e13) errors.amount = 'That amount is too large.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) errors.date = 'Date is required.';
  return errors;
}

/**
 * Balances of the two banks after saving a transfer. When editing, the transfer's
 * current effect is undone first so it is not counted twice.
 */
export function transferPreview(
  balances: Map<string, number>,
  from: string,
  to: string,
  amount: number,
  editing: Transfer | null,
  today: string,
): { from: number | null; to: number | null } {
  const undo = (id: string) => {
    if (!editing || editing.date > today) return 0;
    let v = 0;
    if (editing.from_bank_id === id) v += editing.amount;
    if (editing.to_bank_id === id) v -= editing.amount;
    return v;
  };
  const value = (id: string, delta: number) =>
    balances.has(id) ? round2((balances.get(id) ?? 0) + undo(id) + delta) : null;
  return { from: from ? value(from, -amount) : null, to: to ? value(to, amount) : null };
}
