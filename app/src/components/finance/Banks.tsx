import { useState } from 'react';
import { db } from '../../lib/db';
import { formatMoney } from '../../lib/finance';
import { amountPlaceholder, currencySymbol, parseAmount, roundMoney } from '../../lib/currency';
import {
  BANK_COLORS,
  BANK_KIND_INFO,
  transferPreview,
  validateBank,
  validateTransfer,
  type BankBalance,
  type BankErrors,
  type TransferErrors,
} from '../../lib/banks';
import { BANK_KINDS, type Bank, type BankKind, type Transfer } from '../../lib/types';
import Icon, { type IconName } from '../Icon';
import Modal from '../Modal';
import ConfirmDialog from '../ConfirmDialog';

/** Compact list of banks with balances. Click a row to edit it. */
export function BankList({
  balances,
  onAdd,
  onEdit,
}: {
  balances: BankBalance[];
  onAdd: () => void;
  onEdit: (bank: Bank) => void;
}) {
  if (balances.length === 0) {
    return (
      <button type="button" className="bank-add empty" onClick={onAdd}>
        <Icon name="plus" size={15} /> Add a bank or wallet
      </button>
    );
  }
  return (
    <ul className="bank-list">
      {balances.map(({ bank, balance }) => (
        <li key={bank.id}>
          <button
            type="button"
            className="bank-row"
            style={{ ['--bank' as string]: bank.color }}
            onClick={() => onEdit(bank)}
            aria-label={`${bank.name}, ${formatMoney(balance)}. Edit`}
          >
            <span className="bank-icon" aria-hidden>
              <Icon name={BANK_KIND_INFO[bank.kind].icon as IconName} size={15} />
            </span>
            <span className="bank-name">{bank.name}</span>
            <span className={'bank-bal' + (balance < 0 ? ' neg' : '')}>{formatMoney(balance)}</span>
          </button>
        </li>
      ))}
      <li>
        <button type="button" className="bank-add" onClick={onAdd}>
          <Icon name="plus" size={14} /> Add bank
        </button>
      </li>
    </ul>
  );
}

export function BankForm({
  initial,
  others,
  linkedCount,
  onClose,
  onSaved,
  onError,
}: {
  initial: Bank | null;
  others: Bank[];
  /** Transactions and transfers linked to this bank (shown in the delete confirmation). */
  linkedCount: number;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [kind, setKind] = useState<BankKind>(initial?.kind ?? 'savings');
  const [name, setName] = useState(initial?.name ?? '');
  const [opening, setOpening] = useState(initial ? String(initial.opening_balance) : '');
  const [color, setColor] = useState<string>(initial?.color ?? BANK_COLORS[others.length % BANK_COLORS.length]);
  const [errors, setErrors] = useState<BankErrors>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateBank({ name, opening_balance: opening }, others);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const payload = {
      name: name.trim(),
      kind,
      color,
      opening_balance: opening.trim() ? roundMoney(parseAmount(opening)) : 0,
    };
    setSaving(true);
    try {
      if (initial) await db.updateBank(initial.id, payload);
      else await db.createBank(payload);
      onSaved();
    } catch (err) {
      onError((err as Error).message || 'Failed to save the bank.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!initial) return;
    try {
      await db.deleteBank(initial.id);
      onSaved();
    } catch (err) {
      onError((err as Error).message || 'Failed to delete the bank.');
    }
  }

  return (
    <Modal title={initial ? 'Edit bank' : 'Add bank'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="kind-grid" role="radiogroup" aria-label="Type">
          {BANK_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              className={'kind-pick' + (kind === k ? ' on' : '')}
              style={{ ['--bank' as string]: color }}
              onClick={() => setKind(k)}
            >
              <Icon name={BANK_KIND_INFO[k].icon as IconName} size={18} />
              {BANK_KIND_INFO[k].label}
            </button>
          ))}
        </div>

        <div className="form-grid" style={{ marginTop: 16 }}>
          <div className="field">
            <label htmlFor="bank-name">Name</label>
            <input
              id="bank-name"
              className={'input' + (errors.name ? ' invalid' : '')}
              placeholder="e.g. BCA, Savings, Cash"
              value={name}
              maxLength={40}
              autoFocus
              onChange={(e) => {
                setName(e.target.value);
                setErrors(({ name: _n, ...rest }) => rest);
              }}
              aria-invalid={!!errors.name}
            />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>
          <div className="field">
            <label htmlFor="bank-opening">{initial ? 'Starting balance' : 'Current balance'}</label>
            <div className={'money-input' + (errors.opening_balance ? ' invalid' : '')}>
              <span aria-hidden>{currencySymbol()}</span>
              <input
                id="bank-opening"
                inputMode="decimal"
                placeholder={amountPlaceholder()}
                value={opening}
                onChange={(e) => {
                  setOpening(e.target.value);
                  setErrors(({ opening_balance: _o, ...rest }) => rest);
                }}
                aria-invalid={!!errors.opening_balance}
              />
            </div>
            {errors.opening_balance && <span className="field-error">{errors.opening_balance}</span>}
          </div>
        </div>

        <div className="swatch-row" role="radiogroup" aria-label="Color" style={{ marginTop: 16 }}>
          {BANK_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={`Color ${c}`}
              className={'swatch' + (color === c ? ' on' : '')}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>

        <div className="form-actions">
          {initial && (
            <button type="button" className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={15} /> Delete
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save' : 'Add bank'}
          </button>
        </div>
      </form>

      {confirmDelete && initial && (
        <ConfirmDialog
          title={`Delete ${initial.name}?`}
          message={
            linkedCount > 0
              ? `${linkedCount} linked record${linkedCount === 1 ? '' : 's'} will stay, without this bank.`
              : 'This bank will be removed.'
          }
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </Modal>
  );
}


/** Move money between two banks. Creates or edits a Transfer. */
export function TransferForm({
  initial,
  banks,
  balances,
  today,
  onClose,
  onSaved,
  onError,
}: {
  initial: Transfer | null;
  banks: Bank[];
  balances: BankBalance[];
  today: string;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const live = (id: string | null | undefined) => (id && banks.some((b) => b.id === id) ? id : '');
  const [from, setFrom] = useState(() => live(initial?.from_bank_id) || balances.slice().sort((a, b) => b.balance - a.balance)[0]?.bank.id || '');
  const [to, setTo] = useState(() => live(initial?.to_bank_id) || banks.find((b) => b.id !== from)?.id || '');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [date, setDate] = useState(initial?.date ?? today);
  const [note, setNote] = useState(initial?.note ?? '');
  const [errors, setErrors] = useState<TransferErrors>({});
  const [saving, setSaving] = useState(false);
  const [spin, setSpin] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const balanceMap = new Map(balances.map((b) => [b.bank.id, b.balance]));
  const amt = parseAmount(amount);
  const preview =
    !Number.isNaN(amt) && amt > 0 ? transferPreview(balanceMap, from, to, roundMoney(amt), initial, today) : null;

  function swap() {
    setFrom(to);
    setTo(from);
    setSpin((s) => s + 1);
    setErrors({});
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateTransfer({ from, to, amount, date }, banks);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const payload = { from_bank_id: from, to_bank_id: to, amount: roundMoney(amt), date, note: note.trim() };
    setSaving(true);
    try {
      if (initial) await db.updateTransfer(initial.id, payload);
      else await db.createTransfer(payload);
      onSaved();
    } catch (err) {
      onError((err as Error).message || 'Failed to save the transfer.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!initial) return;
    try {
      await db.deleteTransfer(initial.id);
      onSaved();
    } catch (err) {
      onError((err as Error).message || 'Failed to delete the transfer.');
    }
  }

  const option = (b: BankBalance) => (
    <option key={b.bank.id} value={b.bank.id}>
      {b.bank.name} · {formatMoney(b.balance)}
    </option>
  );

  return (
    <Modal title={initial ? 'Edit transfer' : 'Transfer'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="transfer-pair">
          <div className="field">
            <label htmlFor="tr-from">From</label>
            <select
              id="tr-from"
              className={'select' + (errors.from ? ' invalid' : '')}
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setErrors(({ from: _f, to: _t, ...rest }) => rest);
              }}
            >
              {!from && <option value="">Choose a bank</option>}
              {balances.map(option)}
            </select>
            {errors.from ? (
              <span className="field-error">{errors.from}</span>
            ) : (
              preview?.from != null && (
                <span className={'muted small' + (preview.from < 0 ? ' neg' : '')}>After: {formatMoney(preview.from)}</span>
              )
            )}
          </div>

          <button
            type="button"
            className="btn btn-icon swap-btn"
            onClick={swap}
            aria-label="Swap from and to"
            style={{ ['--turn' as string]: spin * 180 + 'deg' }}
          >
            <Icon name="swap" size={16} />
          </button>

          <div className="field">
            <label htmlFor="tr-to">To</label>
            <select
              id="tr-to"
              className={'select' + (errors.to ? ' invalid' : '')}
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setErrors(({ to: _t, ...rest }) => rest);
              }}
            >
              {!to && <option value="">Choose a bank</option>}
              {balances.map(option)}
            </select>
            {errors.to ? (
              <span className="field-error">{errors.to}</span>
            ) : (
              preview?.to != null && <span className="muted small">After: {formatMoney(preview.to)}</span>
            )}
          </div>
        </div>

        <div className="form-grid" style={{ marginTop: 16 }}>
          <div className="field">
            <label htmlFor="tr-amount">Amount</label>
            <div className={'money-input' + (errors.amount ? ' invalid' : '')}>
              <span aria-hidden>{currencySymbol()}</span>
              <input
                id="tr-amount"
                inputMode="decimal"
                placeholder={amountPlaceholder()}
                value={amount}
                autoFocus
                onChange={(e) => {
                  setAmount(e.target.value);
                  setErrors(({ amount: _a, ...rest }) => rest);
                }}
                aria-invalid={!!errors.amount}
              />
            </div>
            {errors.amount && <span className="field-error">{errors.amount}</span>}
          </div>
          <div className="field">
            <label htmlFor="tr-date">Date</label>
            <input
              id="tr-date"
              type="date"
              className={'input' + (errors.date ? ' invalid' : '')}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            {errors.date && <span className="field-error">{errors.date}</span>}
          </div>
        </div>

        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="tr-note">Note (optional)</label>
          <input
            id="tr-note"
            className="input"
            placeholder="e.g. Monthly savings"
            value={note}
            maxLength={120}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="form-actions">
          {initial && (
            <button type="button" className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={15} /> Delete
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save' : 'Transfer'}
          </button>
        </div>
      </form>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this transfer?"
          message="Both bank balances go back to how they were."
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </Modal>
  );
}
