// Local persistence adapter backed by a Storage-like object (localStorage in the
// browser, an in-memory stub in tests). Lets the whole app run end-to-end with
// no Supabase credentials, while satisfying DAT-001 (data survives refresh).

import type {
  Transfer,
  Bank,
  BudgetAccount,
  Habit,
  HabitCompletion,
  Project,
  Task,
  Transaction,
} from './types';
import type {
  NewTransfer,
  NewBank,
  NewBudgetAccount,
  NewHabit,
  NewProject,
  NewTask,
  NewTransaction,
  StorageAdapter,
} from './adapter';

interface KVStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = 'aio-productivity:v1';
/** Set once the pre-login (single user) data has been handed to the first account. */
const LEGACY_CLAIMED = KEY + ':legacy-claimed';

/** Storage key holding one user's data. */
export function userDataKey(userId: string): string {
  return `${KEY}:user:${userId}`;
}

interface DBShape {
  transactions: Transaction[];
  accounts: BudgetAccount[];
  banks: Bank[];
  transfers: Transfer[];
  habits: Habit[];
  completions: HabitCompletion[];
  projects: Project[];
  tasks: Task[];
}

const empty = (): DBShape => ({
  transactions: [],
  accounts: [],
  banks: [],
  transfers: [],
  habits: [],
  completions: [],
  projects: [],
  tasks: [],
});

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function now(): string {
  return new Date().toISOString();
}

export class LocalAdapter implements StorageAdapter {
  readonly name = 'local' as const;
  private store: KVStore;
  private key = KEY;

  constructor(store?: KVStore) {
    this.store =
      store ??
      (typeof localStorage !== 'undefined'
        ? localStorage
        : createMemoryStore());
  }

  /**
   * Switch to one user's data. The first account to sign in inherits data
   * created before accounts existed (copied, the original is left in place).
   */
  setScope(userId: string | null): void {
    if (!userId) {
      this.key = KEY;
      return;
    }
    this.key = userDataKey(userId);
    if (this.store.getItem(this.key) !== null) return;
    const legacy = this.store.getItem(KEY);
    if (legacy !== null && this.store.getItem(LEGACY_CLAIMED) === null) {
      this.store.setItem(this.key, legacy);
      this.store.setItem(LEGACY_CLAIMED, userId);
    }
  }

  private read(): DBShape {
    const raw = this.store.getItem(this.key);
    if (!raw) return empty();
    try {
      return { ...empty(), ...(JSON.parse(raw) as Partial<DBShape>) };
    } catch {
      return empty();
    }
  }

  private write(db: DBShape): void {
    this.store.setItem(this.key, JSON.stringify(db));
  }

  // ---- Transactions ----
  async listTransactions(): Promise<Transaction[]> {
    return sortByDateDesc(this.read().transactions);
  }

  async createTransaction(input: NewTransaction): Promise<Transaction> {
    const db = this.read();
    const row: Transaction = { id: uid(), user_id: null, created_at: now(), ...input };
    db.transactions.push(row);
    this.write(db);
    return row;
  }

  async updateTransaction(id: string, patch: Partial<NewTransaction>): Promise<Transaction> {
    const db = this.read();
    const row = db.transactions.find((t) => t.id === id);
    if (!row) throw new Error('Transaction not found');
    Object.assign(row, patch);
    this.write(db);
    return row;
  }

  async deleteTransaction(id: string): Promise<void> {
    const db = this.read();
    db.transactions = db.transactions.filter((t) => t.id !== id);
    this.write(db);
  }

  // ---- Banks ----
  async listBanks(): Promise<Bank[]> {
    return this.read().banks.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async createBank(input: NewBank): Promise<Bank> {
    const db = this.read();
    const row: Bank = { id: uid(), user_id: null, created_at: now(), ...input };
    db.banks.push(row);
    this.write(db);
    return row;
  }

  async updateBank(id: string, patch: Partial<NewBank>): Promise<Bank> {
    const db = this.read();
    const row = db.banks.find((b) => b.id === id);
    if (!row) throw new Error('Bank not found');
    Object.assign(row, patch);
    this.write(db);
    return row;
  }

  async deleteBank(id: string): Promise<void> {
    const db = this.read();
    db.banks = db.banks.filter((b) => b.id !== id);
    db.transactions = db.transactions.map((t) => (t.bank_id === id ? { ...t, bank_id: null } : t));
    // Mirrors ON DELETE SET NULL: the other side of each transfer is kept.
    db.transfers = db.transfers.map((t) => ({
      ...t,
      from_bank_id: t.from_bank_id === id ? null : t.from_bank_id,
      to_bank_id: t.to_bank_id === id ? null : t.to_bank_id,
    }));
    this.write(db);
  }

  // ---- Transfers ----
  async listTransfers(): Promise<Transfer[]> {
    return this.read().transfers.slice().sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
  }

  async createTransfer(input: NewTransfer): Promise<Transfer> {
    const db = this.read();
    const row: Transfer = { id: uid(), user_id: null, created_at: now(), ...input };
    db.transfers.push(row);
    this.write(db);
    return row;
  }

  async updateTransfer(id: string, patch: Partial<NewTransfer>): Promise<Transfer> {
    const db = this.read();
    const row = db.transfers.find((t) => t.id === id);
    if (!row) throw new Error('Transfer not found');
    Object.assign(row, patch);
    this.write(db);
    return row;
  }

  async deleteTransfer(id: string): Promise<void> {
    const db = this.read();
    db.transfers = db.transfers.filter((t) => t.id !== id);
    this.write(db);
  }

  // ---- Budget accounts ----
  async listAccounts(): Promise<BudgetAccount[]> {
    return this.read().accounts.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async createAccount(input: NewBudgetAccount): Promise<BudgetAccount> {
    const db = this.read();
    const row: BudgetAccount = { id: uid(), user_id: null, created_at: now(), ...input };
    db.accounts.push(row);
    this.write(db);
    return row;
  }

  async updateAccount(id: string, patch: Partial<NewBudgetAccount>): Promise<BudgetAccount> {
    const db = this.read();
    const row = db.accounts.find((a) => a.id === id);
    if (!row) throw new Error('Account not found');
    Object.assign(row, patch);
    this.write(db);
    return row;
  }

  async deleteAccount(id: string): Promise<void> {
    const db = this.read();
    db.accounts = db.accounts.filter((a) => a.id !== id);
    // Keep the transactions; just unassign them (mirrors ON DELETE SET NULL).
    db.transactions = db.transactions.map((t) => (t.account_id === id ? { ...t, account_id: null } : t));
    this.write(db);
  }

  // ---- Habits ----
  async listHabits(): Promise<Habit[]> {
    return this.read().habits.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async createHabit(input: NewHabit): Promise<Habit> {
    const db = this.read();
    const row: Habit = { id: uid(), user_id: null, created_at: now(), ...input };
    db.habits.push(row);
    this.write(db);
    return row;
  }

  async updateHabit(id: string, patch: Partial<NewHabit>): Promise<Habit> {
    const db = this.read();
    const row = db.habits.find((h) => h.id === id);
    if (!row) throw new Error('Habit not found');
    Object.assign(row, patch);
    this.write(db);
    return row;
  }

  async deleteHabit(id: string): Promise<void> {
    const db = this.read();
    db.habits = db.habits.filter((h) => h.id !== id);
    db.completions = db.completions.filter((c) => c.habit_id !== id);
    this.write(db);
  }

  // ---- Completions ----
  async listCompletions(): Promise<HabitCompletion[]> {
    return this.read().completions.slice();
  }

  async addCompletion(habitId: string, date: string): Promise<HabitCompletion> {
    const db = this.read();
    const existing = db.completions.find((c) => c.habit_id === habitId && c.date === date);
    if (existing) return existing;
    const row: HabitCompletion = {
      id: uid(),
      user_id: null,
      habit_id: habitId,
      date,
      created_at: now(),
    };
    db.completions.push(row);
    this.write(db);
    return row;
  }

  async removeCompletion(habitId: string, date: string): Promise<void> {
    const db = this.read();
    db.completions = db.completions.filter(
      (c) => !(c.habit_id === habitId && c.date === date),
    );
    this.write(db);
  }

  // ---- Projects ----
  async listProjects(): Promise<Project[]> {
    return this.read().projects.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async createProject(input: NewProject): Promise<Project> {
    const db = this.read();
    const row: Project = { id: uid(), user_id: null, created_at: now(), ...input };
    db.projects.push(row);
    this.write(db);
    return row;
  }

  async updateProject(id: string, patch: Partial<NewProject>): Promise<Project> {
    const db = this.read();
    const row = db.projects.find((p) => p.id === id);
    if (!row) throw new Error('Project not found');
    Object.assign(row, patch);
    this.write(db);
    return row;
  }

  async deleteProject(id: string): Promise<void> {
    const db = this.read();
    db.projects = db.projects.filter((p) => p.id !== id);
    // Orphan tasks: keep them but detach from the deleted project.
    db.tasks = db.tasks.map((t) => (t.project_id === id ? { ...t, project_id: null } : t));
    this.write(db);
  }

  // ---- Tasks ----
  async listTasks(): Promise<Task[]> {
    return this.read().tasks.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async createTask(input: NewTask): Promise<Task> {
    const db = this.read();
    const row: Task = { id: uid(), user_id: null, created_at: now(), ...input };
    db.tasks.push(row);
    this.write(db);
    return row;
  }

  async updateTask(id: string, patch: Partial<NewTask>): Promise<Task> {
    const db = this.read();
    const row = db.tasks.find((t) => t.id === id);
    if (!row) throw new Error('Task not found');
    Object.assign(row, patch);
    this.write(db);
    return row;
  }

  async deleteTask(id: string): Promise<void> {
    const db = this.read();
    db.tasks = db.tasks.filter((t) => t.id !== id);
    this.write(db);
  }
}

function sortByDateDesc(rows: Transaction[]): Transaction[] {
  return rows.slice().sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.created_at.localeCompare(a.created_at);
  });
}

export function createMemoryStore(): KVStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}
