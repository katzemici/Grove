import { describe, expect, it } from 'vitest';
import {
  applyPatches,
  insertionIndex,
  isOverdue,
  nextPosition,
  orderTasks,
  planDrop,
  priorityLevel,
} from '../lib/kanban';
import type { Task } from '../lib/types';

function task(id: string, p: Partial<Task> = {}): Task {
  return {
    id,
    user_id: null,
    project_id: null,
    title: id,
    description: '',
    priority: 'medium',
    due_date: null,
    status: 'todo',
    created_at: '2026-03-01T00:00:0' + id.length + '.000Z',
    ...p,
  };
}

describe('orderTasks', () => {
  it('orders manually by position, unpositioned tasks last by creation', () => {
    const list = orderTasks(
      [
        task('c', { created_at: '2026-03-03T00:00:00Z' }),
        task('a', { position: 1000 }),
        task('b', { position: 0 }),
        task('d', { created_at: '2026-03-01T00:00:00Z' }),
      ],
      'manual',
    );
    expect(list.map((t) => t.id)).toEqual(['b', 'a', 'd', 'c']);
  });

  it('sorts by priority and due date', () => {
    const tasks = [
      task('low', { priority: 'low', due_date: '2026-03-01' }),
      task('high', { priority: 'high' }),
      task('med', { priority: 'medium', due_date: '2026-02-01' }),
    ];
    expect(orderTasks(tasks, 'priority').map((t) => t.id)).toEqual(['high', 'med', 'low']);
    expect(orderTasks(tasks, 'due').map((t) => t.id)).toEqual(['med', 'low', 'high']);
  });
});

describe('planDrop', () => {
  const board = [
    task('a', { status: 'todo', position: 0 }),
    task('b', { status: 'todo', position: 1000 }),
    task('x', { status: 'done', position: 0 }),
    task('y', { status: 'done', position: 1000 }),
  ];

  it('moves a card into another column at the given index and renumbers that column', () => {
    const patches = planDrop(board, 'a', 'done', 1);
    expect(patches).toEqual([
      { id: 'a', patch: { position: 1000, status: 'done' } },
      { id: 'y', patch: { position: 2000 } },
    ]);
    const after = applyPatches(board, patches);
    const done = orderTasks(after.filter((t) => t.status === 'done'), 'manual').map((t) => t.id);
    expect(done).toEqual(['x', 'a', 'y']);
  });

  it('reorders within the same column', () => {
    const patches = planDrop(board, 'b', 'todo', 0);
    const after = applyPatches(board, patches);
    expect(orderTasks(after.filter((t) => t.status === 'todo'), 'manual').map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('returns no patches when nothing changes', () => {
    expect(planDrop(board, 'a', 'todo', 0)).toEqual([]);
  });

  it('clamps out-of-range indexes and ignores unknown ids', () => {
    expect(planDrop(board, 'a', 'done', 99)[0]).toEqual({ id: 'a', patch: { position: 2000, status: 'done' } });
    expect(planDrop(board, 'nope', 'done', 0)).toEqual([]);
  });
});

describe('small helpers', () => {
  it('appends new tasks after the last position', () => {
    expect(nextPosition([task('a', { position: 3000 })], 'todo')).toBe(4000);
    expect(nextPosition([], 'todo')).toBe(0);
  });

  it('flags overdue tasks that are not done', () => {
    expect(isOverdue(task('a', { due_date: '2026-03-01' }), '2026-03-02')).toBe(true);
    expect(isOverdue(task('a', { due_date: '2026-03-01', status: 'done' }), '2026-03-02')).toBe(false);
    expect(isOverdue(task('a'), '2026-03-02')).toBe(false);
  });

  it('maps priority to signal bars', () => {
    expect([priorityLevel('low'), priorityLevel('medium'), priorityLevel('high')]).toEqual([1, 2, 3]);
  });

  it('finds the insertion index from card midpoints', () => {
    expect(insertionIndex([100, 200, 300], 50)).toBe(0);
    expect(insertionIndex([100, 200, 300], 250)).toBe(2);
    expect(insertionIndex([100, 200, 300], 999)).toBe(3);
    expect(insertionIndex([], 10)).toBe(0);
  });
});
