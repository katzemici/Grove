import { useState } from 'react';
import { db } from '../../lib/db';
import { formatMoney } from '../../lib/finance';
import { amountPlaceholder, currencySymbol, parseAmount, roundMoney } from '../../lib/currency';
import {
  ACCOUNT_COLORS,
  ACCOUNT_ICONS,
  ACCOUNT_PRESETS,
  validateAccount,
  type AccountErrors,
  type BudgetSummary,
} from '../../lib/budgets';
import { FINANCE_CATEGORIES, type BudgetAccount, type FinanceCategory } from '../../lib/types';
import Icon, { type IconName } from '../Icon';
import Modal from '../Modal';
import ConfirmDialog from '../ConfirmDialog';
import { Menu } from '../Liquid';

type Preset = (typeof ACCOUNT_PRESETS)[number];

export default function BudgetAccounts({
  accounts,
  summary,
  activeAccount,
  onFilter,
  onChanged,
  onError,
}: {
  accounts: BudgetAccount[];
  summary: BudgetSummary;
  activeAccount: string | null;
  onFilter: (accountId: string | null) => void;
  onChanged: () => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState<{ account: BudgetAccount | null; preset?: Preset } | null>(null);
  const [deleting, setDeleting] = useState<BudgetAccount | null>(null);

  const taken = new Set(accounts.map((a) => a.name.trim().toLowerCase()));
  const presets = ACCOUNT_PRESETS.filter((p) => !taken.has(p.name.toLowerCase()));

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await db.deleteAccount(deleting.id);
      if (activeAccount === deleting.id) onFilter(null);
      setDeleting(null);
      await onChanged();
    } catch (e) {
      onError((e as Error).message || 'Failed to delete the budget.');
      setDeleting(null);
    }
  }

  const usedPct = summary.budgeted > 0 ? Math.min(100, (summary.spent / summary.budgeted) * 100) : 0;

  return (
    <section className="card fin-cell wide rise budgets" style={{ ['--i' as string]: 2 }} aria-labelledby="budgets-title">
      <div className="cell-head">
        <h2 className="cell-title" id="budgets-title">
          Budgets
        </h2>
        <button className="btn btn-icon sm" onClick={() => setForm({ account: null })} aria-label="New budget">
          <Icon name="plus" size={15} />
        </button>
      </div>

      {accounts.length === 0 ? (
        <div className="preset-row">
          {presets.map((p) => (
            <button key={p.name} className="chip" onClick={() => setForm({ account: null, preset: p })}>
              <Icon name={p.icon as IconName} size={14} /> {p.name}
            </button>
          ))}
          <button className="chip" onClick={() => setForm({ account: null })}>
            <Icon name="plus" size={14} /> Custom
          </button>
        </div>
      ) : (
        <>
          <div className="budget-total">
            <span className={'big-money sm' + (summary.remaining < 0 ? ' neg' : '')}>{formatMoney(summary.remaining)}</span>
            <span className="muted">/ {formatMoney(summary.budgeted)}</span>
          </div>
          <span className="lq-bar budget-total-bar" aria-hidden>
            <span className="fill" style={{ width: usedPct + '%' }} />
          </span>

          <ul className="account-grid">
            {summary.usage.map((u, i) => {
              const a = u.account;
              const active = activeAccount === a.id;
              return (
                <li
                  key={a.id}
                  className={'account-card rise' + (u.over ? ' over' : '') + (active ? ' active' : '')}
                  style={{ ['--i' as string]: i, ['--acct' as string]: a.color }}
                >
                  <div className="acct-top">
                    <span className="acct-icon" aria-hidden>
                      <Icon name={a.icon as IconName} size={16} />
                    </span>
                    <span className="acct-name">{a.name}</span>
                    <Menu
                      label={`Options for ${a.name}`}
                      items={[
                        { label: active ? 'Show all activity' : 'Show activity', onSelect: () => onFilter(active ? null : a.id) },
                        { label: 'Edit', onSelect: () => setForm({ account: a }) },
                        { label: 'Delete', onSelect: () => setDeleting(a), danger: true },
                      ]}
                    />
                  </div>
                  <button
                    type="button"
                    className="acct-body"
                    onClick={() => onFilter(active ? null : a.id)}
                    aria-pressed={active}
                    aria-label={`${a.name}: ${formatMoney(u.remaining)} left of ${formatMoney(a.monthly_budget)}`}
                  >
                    <span className={'big-money xs' + (u.over ? ' neg' : '')}>{formatMoney(u.remaining)}</span>
                    <span className="lq-bar" aria-hidden>
                      <span className="fill" style={{ width: Math.min(100, u.pct) + '%' }} />
                    </span>
                    <span className="acct-meta">
                      <span>{formatMoney(u.spent)}</span>
                      <span>{formatMoney(a.monthly_budget)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {form && (
        <AccountForm
          initial={form.account}
          preset={form.preset}
          others={accounts.filter((a) => a.id !== form.account?.id)}
          onClose={() => setForm(null)}
          onSaved={async () => {
            setForm(null);
            await onChanged();
          }}
          onError={onError}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          message="Its expenses are kept."
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </section>
  );
}

function AccountForm({
  initial,
  preset,
  others,
  onClose,
  onSaved,
  onError,
}: {
  initial: BudgetAccount | null;
  preset?: Preset;
  others: BudgetAccount[];
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const seed = initial ?? preset;
  const takenCategories = new Map(others.flatMap((a) => a.categories.map((c) => [c, a.name] as const)));
  const [name, setName] = useState(seed?.name ?? '');
  const [budget, setBudget] = useState(initial ? String(initial.monthly_budget) : '');
  const [color, setColor] = useState<string>(seed?.color ?? ACCOUNT_COLORS[others.length % ACCOUNT_COLORS.length]);
  const [icon, setIcon] = useState<string>(seed?.icon ?? 'piggy');
  const [categories, setCategories] = useState<FinanceCategory[]>(
    (seed?.categories ?? []).filter((c) => !takenCategories.has(c)),
  );
  const [errors, setErrors] = useState<AccountErrors>({});
  const [saving, setSaving] = useState(false);

  function toggleCategory(c: FinanceCategory) {
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateAccount({ name, monthly_budget: budget, color, icon, categories }, others);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const payload = {
      name: name.trim(),
      monthly_budget: roundMoney(parseAmount(budget)),
      color,
      icon,
      categories,
    };
    setSaving(true);
    try {
      if (initial) await db.updateAccount(initial.id, payload);
      else await db.createAccount(payload);
      onSaved();
    } catch (err) {
      onError((err as Error).message || 'Failed to save the budget.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? 'Edit budget' : 'New budget'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="acct-name">Name</label>
            <input
              id="acct-name"
              className={'input' + (errors.name ? ' invalid' : '')}
              placeholder="e.g. Food"
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
            <label htmlFor="acct-budget">Per month</label>
            <div className={'money-input' + (errors.monthly_budget ? ' invalid' : '')}>
              <span aria-hidden>{currencySymbol()}</span>
              <input
                id="acct-budget"
                inputMode="decimal"
                placeholder={amountPlaceholder()}
                value={budget}
                onChange={(e) => {
                  setBudget(e.target.value);
                  setErrors(({ monthly_budget: _b, ...rest }) => rest);
                }}
                aria-invalid={!!errors.monthly_budget}
              />
            </div>
            {errors.monthly_budget && <span className="field-error">{errors.monthly_budget}</span>}
          </div>
        </div>

        <div className="icon-grid" role="radiogroup" aria-label="Icon" style={{ marginTop: 16 }}>
          {ACCOUNT_ICONS.map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={icon === key}
              aria-label={key}
              className={'icon-pick' + (icon === key ? ' on' : '')}
              style={{ ['--acct' as string]: color }}
              onClick={() => setIcon(key)}
            >
              <Icon name={key as IconName} size={18} />
            </button>
          ))}
        </div>

        <div className="swatch-row" role="radiogroup" aria-label="Color" style={{ marginTop: 14 }}>
          {ACCOUNT_COLORS.map((c) => (
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

        <fieldset className="field picker">
          <legend>Categories</legend>
          <div className="preset-row">
            {FINANCE_CATEGORIES.filter((c) => !['Salary', 'Business', 'Investment'].includes(c)).map((c) => {
              const owner = takenCategories.get(c);
              const on = categories.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  className={'chip' + (on ? ' active' : '')}
                  aria-pressed={on}
                  disabled={!!owner}
                  title={owner ? `Used by ${owner}` : undefined}
                  onClick={() => toggleCategory(c)}
                >
                  {c}
                </button>
              );
            })}
          </div>
          {errors.categories && <span className="field-error">{errors.categories}</span>}
        </fieldset>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
