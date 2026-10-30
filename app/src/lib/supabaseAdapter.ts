// Supabase persistence adapter. Activated automatically when
// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are present. Implements the exact
// same StorageAdapter contract as LocalAdapter, so swapping is transparent.
//
// Expected tables (see supabase/schema.sql): transactions, habits,
// habit_completions, projects, tasks — each with a user_id column that
// defaults to auth.uid(). RLS limits every query to the signed-in user.

import type { SupabaseClient } from '@supabase/supabase-js';
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

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export class SupabaseAdapter implements StorageAdapter {
  readonly name = 'supabase' as const;
  private sb: SupabaseClient;

  /** Takes the shared client so queries run with the signed-in user's session. */
  constructor(client: SupabaseClient) {
    this.sb = client;
  }

  // ---- Transactions ----
  async listTransactions(): Promise<Transaction[]> {
    return check(
      await this.sb
        .from('transactions')
        .select('*')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }),
    );
  }

  async createTransaction(input: NewTransaction): Promise<Transaction> {
    return check(await this.sb.from('transactions').insert(input).select().single());
  }

  async updateTransaction(id: string, patch: Partial<NewTransaction>): Promise<Transaction> {
    return check(
      await this.sb.from('transactions').update(patch).eq('id', id).select().single(),
    );
  }

  async deleteTransaction(id: string): Promise<void> {
    check(await this.sb.from('transactions').delete().eq('id', id));
  }

  // ---- Banks ----
  async listBanks(): Promise<Bank[]> {
    return check(await this.sb.from('banks').select('*').order('created_at', { ascending: true }));
  }

  async createBank(input: NewBank): Promise<Bank> {
    return check(await this.sb.from('banks').insert(input).select().single());
  }

  async updateBank(id: string, patch: Partial<NewBank>): Promise<Bank> {
    return check(await this.sb.from('banks').update(patch).eq('id', id).select().single());
  }

  async deleteBank(id: string): Promise<void> {
    // transactions.bank_id is ON DELETE SET NULL, so linked transactions are kept.
    check(await this.sb.from('banks').delete().eq('id', id));
  }

  // ---- Transfers ----
  async listTransfers(): Promise<Transfer[]> {
    return check(
      await this.sb
        .from('transfers')
        .select('*')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }),
    );
  }

  async createTransfer(input: NewTransfer): Promise<Transfer> {
    return check(await this.sb.from('transfers').insert(input).select().single());
  }

  async updateTransfer(id: string, patch: Partial<NewTransfer>): Promise<Transfer> {
    return check(await this.sb.from('transfers').update(patch).eq('id', id).select().single());
  }

  async deleteTransfer(id: string): Promise<void> {
    check(await this.sb.from('transfers').delete().eq('id', id));
  }

  // ---- Budget accounts ----
  async listAccounts(): Promise<BudgetAccount[]> {
    return check(
      await this.sb.from('budget_accounts').select('*').order('created_at', { ascending: true }),
    );
  }

  async createAccount(input: NewBudgetAccount): Promise<BudgetAccount> {
    return check(await this.sb.from('budget_accounts').insert(input).select().single());
  }

  async updateAccount(id: string, patch: Partial<NewBudgetAccount>): Promise<BudgetAccount> {
    return check(await this.sb.from('budget_accounts').update(patch).eq('id', id).select().single());
  }

  async deleteAccount(id: string): Promise<void> {
    // transactions.account_id is ON DELETE SET NULL, so charged expenses are kept.
    check(await this.sb.from('budget_accounts').delete().eq('id', id));
  }

  // ---- Habits ----
  async listHabits(): Promise<Habit[]> {
    return check(
      await this.sb.from('habits').select('*').order('created_at', { ascending: true }),
    );
  }

  async createHabit(input: NewHabit): Promise<Habit> {
    return check(await this.sb.from('habits').insert(input).select().single());
  }

  async updateHabit(id: string, patch: Partial<NewHabit>): Promise<Habit> {
    return check(await this.sb.from('habits').update(patch).eq('id', id).select().single());
  }

  async deleteHabit(id: string): Promise<void> {
    check(await this.sb.from('habits').delete().eq('id', id));
  }

  // ---- Completions ----
  async listCompletions(): Promise<HabitCompletion[]> {
    return check(await this.sb.from('habit_completions').select('*'));
  }

  async addCompletion(habitId: string, date: string): Promise<HabitCompletion> {
    return check(
      await this.sb
        .from('habit_completions')
        .upsert({ habit_id: habitId, date }, { onConflict: 'habit_id,date' })
        .select()
        .single(),
    );
  }

  async removeCompletion(habitId: string, date: string): Promise<void> {
    check(
      await this.sb
        .from('habit_completions')
        .delete()
        .eq('habit_id', habitId)
        .eq('date', date),
    );
  }

  // ---- Projects ----
  async listProjects(): Promise<Project[]> {
    return check(
      await this.sb.from('projects').select('*').order('created_at', { ascending: true }),
    );
  }

  async createProject(input: NewProject): Promise<Project> {
    return check(await this.sb.from('projects').insert(input).select().single());
  }

  async updateProject(id: string, patch: Partial<NewProject>): Promise<Project> {
    return check(await this.sb.from('projects').update(patch).eq('id', id).select().single());
  }

  async deleteProject(id: string): Promise<void> {
    check(await this.sb.from('projects').delete().eq('id', id));
  }

  // ---- Tasks ----
  async listTasks(): Promise<Task[]> {
    return check(
      await this.sb.from('tasks').select('*').order('created_at', { ascending: true }),
    );
  }

  async createTask(input: NewTask): Promise<Task> {
    return check(await this.sb.from('tasks').insert(input).select().single());
  }

  async updateTask(id: string, patch: Partial<NewTask>): Promise<Task> {
    return check(await this.sb.from('tasks').update(patch).eq('id', id).select().single());
  }

  async deleteTask(id: string): Promise<void> {
    check(await this.sb.from('tasks').delete().eq('id', id));
  }
}
