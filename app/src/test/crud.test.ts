import { beforeEach, describe, expect, it } from 'vitest';
import { LocalAdapter, createMemoryStore } from '../lib/localAdapter';

let db: LocalAdapter;

beforeEach(() => {
  db = new LocalAdapter(createMemoryStore());
});

describe('Transactions CRUD (QA-004)', () => {
  it('creates, reads, updates and deletes', async () => {
    const created = await db.createTransaction({
      type: 'income',
      amount: 500,
      category: 'Salary',
      date: '2026-02-01',
      note: 'Paycheck',
    });
    expect(created.id).toBeTruthy();
    expect(created.user_id).toBeNull(); // nullable user_id stays null in MVP

    let all = await db.listTransactions();
    expect(all).toHaveLength(1);

    const updated = await db.updateTransaction(created.id, { amount: 550 });
    expect(updated.amount).toBe(550);

    await db.deleteTransaction(created.id);
    all = await db.listTransactions();
    expect(all).toHaveLength(0);
  });

  it('sorts transactions newest-first (FIN-005)', async () => {
    await db.createTransaction({ type: 'expense', amount: 10, category: 'Food', date: '2026-01-01', note: 'old' });
    await db.createTransaction({ type: 'expense', amount: 20, category: 'Food', date: '2026-03-01', note: 'new' });
    const all = await db.listTransactions();
    expect(all[0].note).toBe('new');
    expect(all[1].note).toBe('old');
  });
});

describe('Habits + completions CRUD (QA-004)', () => {
  it('manages habits and toggles completions idempotently', async () => {
    const habit = await db.createHabit({ name: 'Read', frequency: { kind: 'daily' } });
    expect((await db.listHabits())).toHaveLength(1);

    await db.addCompletion(habit.id, '2026-02-01');
    await db.addCompletion(habit.id, '2026-02-01'); // duplicate is a no-op
    expect(await db.listCompletions()).toHaveLength(1);

    await db.removeCompletion(habit.id, '2026-02-01');
    expect(await db.listCompletions()).toHaveLength(0);
  });

  it('deleting a habit cascades its completions', async () => {
    const habit = await db.createHabit({ name: 'Run', frequency: { kind: 'daily' } });
    await db.addCompletion(habit.id, '2026-02-01');
    await db.deleteHabit(habit.id);
    expect(await db.listHabits()).toHaveLength(0);
    expect(await db.listCompletions()).toHaveLength(0);
  });
});

describe('Projects + tasks CRUD (QA-004)', () => {
  it('creates tasks, assigns to project, and moves across columns', async () => {
    const project = await db.createProject({ name: 'Launch', description: '' });
    const task = await db.createTask({
      project_id: project.id,
      title: 'Write copy',
      description: '',
      priority: 'high',
      due_date: null,
      status: 'todo',
    });
    expect(task.project_id).toBe(project.id);
    expect(task.status).toBe('todo');

    const moved = await db.updateTask(task.id, { status: 'in_progress' });
    expect(moved.status).toBe('in_progress');

    const done = await db.updateTask(task.id, { status: 'done' });
    expect(done.status).toBe('done');
  });

  it('detaches tasks when their project is deleted', async () => {
    const project = await db.createProject({ name: 'Temp', description: '' });
    const task = await db.createTask({
      project_id: project.id,
      title: 'Orphan me',
      description: '',
      priority: 'low',
      due_date: null,
      status: 'todo',
    });
    await db.deleteProject(project.id);
    const tasks = await db.listTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe(task.id);
    expect(tasks[0].project_id).toBeNull();
  });

  it('persists across adapter instances sharing a store (DAT-001)', async () => {
    const store = createMemoryStore();
    const first = new LocalAdapter(store);
    await first.createTask({
      project_id: null,
      title: 'Survive reload',
      description: '',
      priority: 'medium',
      due_date: null,
      status: 'todo',
    });
    // Simulate a page refresh: a brand-new adapter over the same storage.
    const second = new LocalAdapter(store);
    const tasks = await second.listTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Survive reload');
  });
});
