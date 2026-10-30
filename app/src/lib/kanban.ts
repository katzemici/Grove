// Pure Kanban helpers. Unit-tested in kanban.test.ts.

import type { Task, TaskPriority, TaskStatus } from './types';

export type SortMode = 'manual' | 'priority' | 'due' | 'newest';

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

/** Manual order: by position (tasks without one go last), then by creation time. */
export function manualCompare(a: Task, b: Task): number {
  const pa = a.position ?? Number.POSITIVE_INFINITY;
  const pb = b.position ?? Number.POSITIVE_INFINITY;
  if (pa !== pb) return pa - pb;
  return a.created_at.localeCompare(b.created_at);
}

export function orderTasks(tasks: Task[], mode: SortMode): Task[] {
  const list = tasks.slice();
  switch (mode) {
    case 'priority':
      return list.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || manualCompare(a, b));
    case 'due':
      return list.sort(
        (a, b) => (a.due_date ?? '9999-99-99').localeCompare(b.due_date ?? '9999-99-99') || manualCompare(a, b),
      );
    case 'newest':
      return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    default:
      return list.sort(manualCompare);
  }
}

export interface TaskPatch {
  id: string;
  patch: { status?: TaskStatus; position?: number };
}

/**
 * Plan the updates for dropping `taskId` into `toStatus` at `index` (0-based, counted
 * among the destination column's other tasks in manual order). The destination column
 * is renumbered 0, 1000, 2000... and only rows whose status or position change are returned.
 */
export function planDrop(tasks: Task[], taskId: string, toStatus: TaskStatus, index: number): TaskPatch[] {
  const moving = tasks.find((t) => t.id === taskId);
  if (!moving) return [];
  const column = tasks
    .filter((t) => t.status === toStatus && t.id !== taskId)
    .sort(manualCompare);
  const at = Math.max(0, Math.min(index, column.length));
  column.splice(at, 0, moving);

  const patches: TaskPatch[] = [];
  column.forEach((t, i) => {
    const position = i * 1000;
    const patch: TaskPatch['patch'] = {};
    if (t.position !== position) patch.position = position;
    if (t.id === taskId && t.status !== toStatus) patch.status = toStatus;
    if (Object.keys(patch).length) patches.push({ id: t.id, patch });
  });
  return patches;
}

/** Apply patches locally (used for the optimistic update). */
export function applyPatches(tasks: Task[], patches: TaskPatch[]): Task[] {
  const byId = new Map(patches.map((p) => [p.id, p.patch]));
  return tasks.map((t) => (byId.has(t.id) ? { ...t, ...byId.get(t.id) } : t));
}

/** Position for a new task appended to the end of a column. */
export function nextPosition(tasks: Task[], status: TaskStatus): number {
  const max = Math.max(-1000, ...tasks.filter((t) => t.status === status).map((t) => t.position ?? -1000));
  return max + 1000;
}

export function isOverdue(task: Task, today: string): boolean {
  return !!task.due_date && task.status !== 'done' && task.due_date < today;
}

/** 1-3 signal bars for the priority indicator. */
export function priorityLevel(p: TaskPriority): 1 | 2 | 3 {
  return p === 'high' ? 3 : p === 'medium' ? 2 : 1;
}

/** Index to insert at, given the vertical midpoints of the other cards and the pointer's Y. */
export function insertionIndex(midpoints: number[], pointerY: number): number {
  const i = midpoints.findIndex((m) => pointerY < m);
  return i === -1 ? midpoints.length : i;
}
