// The persistence contract. Both the local fallback and the Supabase adapter
// implement this. Modules NEVER import Supabase directly (FND-003) — they only
// go through the data-access layer (`src/lib/db.ts`), so auth and per-user
// filtering can be added in exactly one place later.

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

export type NewTransaction = Omit<Transaction, 'id' | 'created_at' | 'user_id'>;
export type NewHabit = Omit<Habit, 'id' | 'created_at' | 'user_id'>;
export type NewProject = Omit<Project, 'id' | 'created_at' | 'user_id'>;
export type NewTask = Omit<Task, 'id' | 'created_at' | 'user_id'>;
export type NewBudgetAccount = Omit<BudgetAccount, 'id' | 'created_at' | 'user_id'>;
export type NewBank = Omit<Bank, 'id' | 'created_at' | 'user_id'>;
export type NewTransfer = Omit<Transfer, 'id' | 'created_at' | 'user_id'>;

export interface StorageAdapter {
  readonly name: 'local' | 'supabase';

  /**
   * Scope reads and writes to one user. The local adapter keeps a separate
   * store per user; Supabase does not need this (RLS uses the session).
   */
  setScope?(userId: string | null): void;

  // Transactions
  listTransactions(): Promise<Transaction[]>;
  createTransaction(input: NewTransaction): Promise<Transaction>;
  updateTransaction(id: string, patch: Partial<NewTransaction>): Promise<Transaction>;
  deleteTransaction(id: string): Promise<void>;

  // Transfers between banks.
  listTransfers(): Promise<Transfer[]>;
  createTransfer(input: NewTransfer): Promise<Transfer>;
  updateTransfer(id: string, patch: Partial<NewTransfer>): Promise<Transfer>;
  deleteTransfer(id: string): Promise<void>;

  // Banks. Deleting one unlinks its transactions and transfers (they are kept).
  listBanks(): Promise<Bank[]>;
  createBank(input: NewBank): Promise<Bank>;
  updateBank(id: string, patch: Partial<NewBank>): Promise<Bank>;
  deleteBank(id: string): Promise<void>;

  // Budget accounts. Deleting one unassigns its transactions (they are kept).
  listAccounts(): Promise<BudgetAccount[]>;
  createAccount(input: NewBudgetAccount): Promise<BudgetAccount>;
  updateAccount(id: string, patch: Partial<NewBudgetAccount>): Promise<BudgetAccount>;
  deleteAccount(id: string): Promise<void>;

  // Habits
  listHabits(): Promise<Habit[]>;
  createHabit(input: NewHabit): Promise<Habit>;
  updateHabit(id: string, patch: Partial<NewHabit>): Promise<Habit>;
  deleteHabit(id: string): Promise<void>;

  // Habit completions
  listCompletions(): Promise<HabitCompletion[]>;
  addCompletion(habitId: string, date: string): Promise<HabitCompletion>;
  removeCompletion(habitId: string, date: string): Promise<void>;

  // Projects
  listProjects(): Promise<Project[]>;
  createProject(input: NewProject): Promise<Project>;
  updateProject(id: string, patch: Partial<NewProject>): Promise<Project>;
  deleteProject(id: string): Promise<void>;

  // Tasks
  listTasks(): Promise<Task[]>;
  createTask(input: NewTask): Promise<Task>;
  updateTask(id: string, patch: Partial<NewTask>): Promise<Task>;
  deleteTask(id: string): Promise<void>;
}
