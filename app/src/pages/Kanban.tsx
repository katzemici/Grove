import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { db } from '../lib/db';
import type { NewProject, NewTask } from '../lib/adapter';
import {
  TASK_STATUSES,
  type Project,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from '../lib/types';
import { formatDateHuman, todayISO } from '../lib/date';
import {
  applyPatches,
  insertionIndex,
  isOverdue,
  nextPosition,
  orderTasks,
  planDrop,
  priorityLevel,
  type SortMode,
  type TaskPatch,
} from '../lib/kanban';
import { flip, prefersReducedMotion, type RectMap } from '../lib/liquid';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import Icon from '../components/Icon';
import { LiquidCheck, LiquidTabs, Menu, type MenuItem } from '../components/Liquid';
import { EmptyState, ErrorBanner, Loading } from '../components/states';

const COLUMN_LABELS: Record<TaskStatus, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
};

const COLUMN_COLORS: Record<TaskStatus, string> = {
  todo: 'var(--sky-deep)',
  in_progress: 'var(--ginger)',
  done: 'var(--meadow)',
};

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  high: '#d0663a',
  medium: '#d9a52e',
  low: '#5b9bd0',
};

const AVATAR_COLORS = ['#6faf5b', '#6fa9d6', '#e8a45c', '#c86fa0', '#8f9b6d', '#d9b84a'];

const SORT_LABELS: Record<SortMode, string> = {
  manual: 'Manual',
  priority: 'Priority',
  due: 'Due date',
  newest: 'Newest',
};

type ViewMode = 'board' | 'list';
type PriorityFilter = 'all' | TaskPriority;

interface DragState {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  offX: number;
  offY: number;
  w: number;
  h: number;
  x: number;
  y: number;
  active: boolean;
  over: TaskStatus;
  index: number;
}

function colorFor(id: string | null): string {
  if (!id) return '#a2ac87';
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export default function Kanban() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entering, setEntering] = useState(true);

  const [activeProject, setActiveProject] = useState<string | 'all'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('board');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('manual');
  const [query, setQuery] = useState('');

  const [taskForm, setTaskForm] = useState<{ task: Task | null; status: TaskStatus } | null>(null);
  const [projectForm, setProjectForm] = useState<{ project: Project | null } | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);

  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const columnRefs = useRef<Partial<Record<TaskStatus, HTMLElement | null>>>({});
  const prevPos = useRef<RectMap>(new Map());
  const settle = useRef<{ id: string; left: number; top: number } | null>(null);
  const frame = useRef(0);
  const justDragged = useRef(false);
  const today = todayISO();

  async function load() {
    setError(null);
    try {
      const [p, t] = await Promise.all([db.listProjects(), db.listTasks()]);
      setProjects(p);
      setTasks(t);
    } catch (e) {
      setError((e as Error).message || 'Failed to load board.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // The staggered entrance only plays once, right after the first load.
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => setEntering(false), 1400);
    return () => clearTimeout(t);
  }, [loading]);

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const visibleTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = activeProject === 'all' ? tasks : tasks.filter((t) => t.project_id === activeProject);
    if (priorityFilter !== 'all') list = list.filter((t) => t.priority === priorityFilter);
    if (q) {
      list = list.filter((t) =>
        `${t.title} ${t.description} ${projectById.get(t.project_id ?? '')?.name ?? ''}`.toLowerCase().includes(q),
      );
    }
    return orderTasks(list, sortMode);
  }, [tasks, activeProject, priorityFilter, query, sortMode, projectById]);

  const byStatus = (s: TaskStatus) => visibleTasks.filter((t) => t.status === s);

  // FLIP: after every render, glide cards from where they were to where they are now.
  useLayoutEffect(() => {
    prevPos.current = flip(boardRef.current, prevPos.current);
    const s = settle.current;
    if (s && boardRef.current) {
      settle.current = null;
      const el = boardRef.current.querySelector<HTMLElement>(`[data-flip-id="${s.id}"]`);
      if (el && !prefersReducedMotion()) {
        const r = el.getBoundingClientRect();
        el.animate(
          [
            { transform: `translate(${s.left - r.left}px, ${s.top - r.top}px) rotate(3deg) scale(1.04)`, boxShadow: 'var(--shadow-lift)' },
            { transform: 'translate(0, 0) rotate(-0.6deg) scale(0.99)', offset: 0.75 },
            { transform: 'none' },
          ],
          { duration: 460, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
        );
        el.classList.add('just-dropped');
        setTimeout(() => el.classList.remove('just-dropped'), 700);
      }
    }
  });

  // ---- Persisting moves ----
  async function persist(patches: TaskPatch[]) {
    if (!patches.length) return;
    setTasks((prev) => applyPatches(prev, patches));
    try {
      for (const p of patches) await db.updateTask(p.id, p.patch);
    } catch (e) {
      setError((e as Error).message || 'Failed to move task.');
      await load();
    }
  }

  function moveTo(task: Task, status: TaskStatus, index?: number) {
    if (sortMode === 'manual') {
      const target = index ?? tasks.filter((t) => t.status === status && t.id !== task.id).length;
      void persist(planDrop(tasks, task.id, status, target));
    } else if (task.status !== status) {
      void persist([{ id: task.id, patch: { status, position: nextPosition(tasks, status) } }]);
    }
  }

  // ---- Pointer drag (lift, tilt, follow, drop with spring settle) ----
  function hitTest(x: number, y: number, d: DragState): { over: TaskStatus; index: number } {
    let over = d.over;
    for (const s of TASK_STATUSES) {
      const el = columnRefs.current[s];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right) {
        over = s;
        break;
      }
    }
    const col = columnRefs.current[over];
    const cards = col
      ? Array.from(col.querySelectorAll<HTMLElement>('[data-card-id]')).filter((c) => c.dataset.cardId !== d.id)
      : [];
    const mids = cards.map((c) => {
      const r = c.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    return { over, index: insertionIndex(mids, y) };
  }

  function onCardPointerDown(e: React.PointerEvent<HTMLElement>, task: Task) {
    if (e.button !== 0 || viewMode !== 'board') return;
    const target = e.target as HTMLElement;
    const onGrip = !!target.closest('.tc-grip');
    if (!onGrip && target.closest('button, a, input, select, textarea, [role="menu"]')) return;
    if (e.pointerType === 'touch' && !onGrip) return; // touch scrolls; drag with the grip
    const r = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      id: task.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      offX: e.clientX - r.left,
      offY: e.clientY - r.top,
      w: r.width,
      h: r.height,
      x: e.clientX,
      y: e.clientY,
      active: false,
      over: task.status,
      index: 0,
    };
    if (onGrip) e.preventDefault();
  }

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      if (!d.active) {
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 6) return;
        d.active = true;
        document.body.classList.add('is-dragging');
      }
      e.preventDefault();
      d.x = e.clientX;
      d.y = e.clientY;
      const hit = hitTest(e.clientX, e.clientY, d);
      d.over = hit.over;
      d.index = hit.index;
      if (e.clientY < 70) window.scrollBy(0, -14);
      else if (e.clientY > window.innerHeight - 70) window.scrollBy(0, 14);
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => setDrag({ ...d }));
    }

    function finish(commit: boolean) {
      const d = dragRef.current;
      dragRef.current = null;
      cancelAnimationFrame(frame.current);
      document.body.classList.remove('is-dragging');
      if (!d || !d.active) return;
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), 80);
      settle.current = { id: d.id, left: d.x - d.offX, top: d.y - d.offY };
      setDrag(null);
      const task = tasks.find((t) => t.id === d.id);
      if (commit && task) moveTo(task, d.over, d.index);
    }

    const onUp = (e: PointerEvent) => {
      if (dragRef.current && e.pointerId === dragRef.current.pointerId) finish(true);
    };
    const onCancel = (e: PointerEvent) => {
      if (dragRef.current && e.pointerId === dragRef.current.pointerId) finish(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dragRef.current?.active) finish(false);
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
    };
    // moveTo/hitTest read the latest tasks through this closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, sortMode]);

  // ---- Deletes ----
  async function handleDeleteTask() {
    if (!deleteTaskId) return;
    try {
      await db.deleteTask(deleteTaskId);
      setDeleteTaskId(null);
      await load();
    } catch (e) {
      setError((e as Error).message || 'Failed to delete task.');
      setDeleteTaskId(null);
    }
  }

  async function handleDeleteProject() {
    if (!deleteProjectId) return;
    try {
      await db.deleteProject(deleteProjectId);
      if (activeProject === deleteProjectId) setActiveProject('all');
      setDeleteProjectId(null);
      await load();
    } catch (e) {
      setError((e as Error).message || 'Failed to delete project.');
      setDeleteProjectId(null);
    }
  }

  function cardMenu(t: Task): MenuItem[] {
    return [
      { label: 'Edit', onSelect: () => setTaskForm({ task: t, status: t.status }) },
      ...TASK_STATUSES.filter((s) => s !== t.status).map((s) => ({
        label: `Move to ${COLUMN_LABELS[s]}`,
        onSelect: () => moveTo(t, s),
      })),
      { label: 'Delete', onSelect: () => setDeleteTaskId(t.id), danger: true },
    ];
  }

  const activeProjectObj = activeProject === 'all' ? null : projectById.get(activeProject) ?? null;
  const filtersOn = priorityFilter !== 'all' || !!query;

  return (
    <main className="page">
      <header className="page-head compact">
        <div>
          <h1>Kanban</h1>
          <p className="subtitle">Drag cards between columns, or open one to edit it.</p>
        </div>
        <div className="head-actions">
          <button className="btn btn-secondary" onClick={() => setProjectForm({ project: null })}>
            <Icon name="plus" size={16} /> Project
          </button>
          <button className="btn btn-primary" onClick={() => setTaskForm({ task: null, status: 'todo' })}>
            <Icon name="plus" size={16} /> New task
          </button>
        </div>
      </header>

      {error && <ErrorBanner message={error} onRetry={load} />}

      <div className="project-tabs">
        <button
          className={'project-tab' + (activeProject === 'all' ? ' active' : '')}
          onClick={() => setActiveProject('all')}
        >
          All tasks <span className="tab-count">{tasks.length}</span>
        </button>
        {projects.map((p) => (
          <button
            key={p.id}
            className={'project-tab' + (activeProject === p.id ? ' active' : '')}
            onClick={() => setActiveProject(p.id)}
          >
            <span className="tab-dot" style={{ background: colorFor(p.id) }} />
            {p.name}
            <span className="tab-count">{tasks.filter((t) => t.project_id === p.id).length}</span>
          </button>
        ))}
        {activeProjectObj && (
          <Menu
            label={`Options for ${activeProjectObj.name}`}
            items={[
              { label: 'Edit project', onSelect: () => setProjectForm({ project: activeProjectObj }) },
              { label: 'Delete project', onSelect: () => setDeleteProjectId(activeProjectObj.id), danger: true },
            ]}
          />
        )}
      </div>

      <div className="kb-toolbar">
        <label className="search-field">
          <Icon name="search" size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks" aria-label="Search tasks" />
        </label>
        <LiquidTabs
          size="sm"
          label="View"
          value={viewMode}
          onChange={setViewMode}
          options={[
            {
              value: 'list',
              label: (
                <>
                  <Icon name="list" size={14} /> List
                </>
              ),
            },
            {
              value: 'board',
              label: (
                <>
                  <Icon name="board" size={14} /> Board
                </>
              ),
            },
          ]}
        />
        <span className="spacer" />
        <Menu
          label="Filter by priority"
          trigger={
            <>
              <Icon name="filter" size={14} /> {priorityFilter === 'all' ? 'Filter' : `Priority: ${priorityFilter}`}
            </>
          }
          items={(['all', 'high', 'medium', 'low'] as PriorityFilter[]).map((p) => ({
            label: p === 'all' ? 'All priorities' : p[0].toUpperCase() + p.slice(1),
            checked: priorityFilter === p,
            onSelect: () => setPriorityFilter(p),
          }))}
        />
        <Menu
          label="Sort tasks"
          trigger={
            <>
              <Icon name="sort" size={14} /> Sort: {SORT_LABELS[sortMode]}
            </>
          }
          items={(Object.keys(SORT_LABELS) as SortMode[]).map((m) => ({
            label: SORT_LABELS[m],
            checked: sortMode === m,
            onSelect: () => setSortMode(m),
          }))}
        />
      </div>
      {sortMode !== 'manual' && viewMode === 'board' && (
        <p className="hint-line">Sorted by {SORT_LABELS[sortMode].toLowerCase()}. Switch to Manual to reorder cards inside a column.</p>
      )}

      {loading ? (
        <div className="card">
          <Loading />
        </div>
      ) : tasks.length === 0 ? (
        <div className="card">
          <EmptyState icon="board" title="Your board is empty" hint="Create a task to see it appear in the To Do column." />
        </div>
      ) : viewMode === 'board' ? (
        <div className={'board' + (entering ? ' board-enter' : '')} ref={boardRef}>
          {TASK_STATUSES.map((status, ci) => {
            const colTasks = byStatus(status).filter((t) => !(drag?.active && t.id === drag.id));
            const isOver = !!drag?.active && drag.over === status;
            const items: (Task | 'placeholder')[] = colTasks.slice();
            if (isOver) items.splice(Math.min(drag!.index, items.length), 0, 'placeholder');
            return (
              <section
                key={status}
                className={'column' + (isOver ? ' drop-target' : '')}
                style={{ ['--col' as string]: ci, ['--accent-col' as string]: COLUMN_COLORS[status] }}
                ref={(el) => {
                  columnRefs.current[status] = el;
                }}
                aria-label={`${COLUMN_LABELS[status]}, ${byStatus(status).length} tasks`}
              >
                <header className="column-head">
                  <span className="col-grip" aria-hidden>
                    <Icon name="grip" size={14} />
                  </span>
                  <span className="col-pill" style={{ background: COLUMN_COLORS[status] }}>
                    {COLUMN_LABELS[status]}
                  </span>
                  <span className="count">{byStatus(status).length}</span>
                  <span className="spacer" />
                  <button
                    className="btn btn-icon sm ghost-icon"
                    onClick={() => setTaskForm({ task: null, status })}
                    aria-label={`Add task to ${COLUMN_LABELS[status]}`}
                  >
                    <Icon name="plus" size={15} />
                  </button>
                </header>

                <div className="column-body">
                  {items.map((t, i) =>
                    t === 'placeholder' ? (
                      <div key="placeholder" className="card-placeholder" style={{ height: drag!.h }} aria-hidden />
                    ) : (
                      <TaskCard
                        key={t.id}
                        task={t}
                        project={projectById.get(t.project_id ?? '') ?? null}
                        today={today}
                        menu={cardMenu(t)}
                        index={ci * 2 + i}
                        onPointerDown={(e) => onCardPointerDown(e, t)}
                        onOpen={() => {
                          if (!justDragged.current) setTaskForm({ task: t, status: t.status });
                        }}
                      />
                    ),
                  )}
                  {items.length === 0 && (
                    <div className="empty-col">{filtersOn ? 'No matching tasks' : 'Drop tasks here'}</div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="card klist">
          {TASK_STATUSES.map((status) => {
            const colTasks = byStatus(status);
            return (
              <div className="klist-group" key={status}>
                <div className="klist-group-head">
                  <span className="col-pill" style={{ background: COLUMN_COLORS[status] }}>
                    {COLUMN_LABELS[status]}
                  </span>
                  <span className="count">{colTasks.length}</span>
                </div>
                <div className="klist-rows">
                  {colTasks.length === 0 ? (
                    <div className="klist-empty">No tasks</div>
                  ) : (
                    colTasks.map((t, i) => {
                      const project = projectById.get(t.project_id ?? '') ?? null;
                      return (
                        <div
                          className={'klist-row rise-row' + (t.status === 'done' ? ' is-done' : '')}
                          key={t.id}
                          style={{ ['--i' as string]: i }}
                        >
                          <LiquidCheck
                            shape="round"
                            checked={t.status === 'done'}
                            onChange={() => moveTo(t, t.status === 'done' ? 'todo' : 'done')}
                            label={`Mark ${t.title} ${t.status === 'done' ? 'not done' : 'done'}`}
                          />
                          <button className="klist-title" onClick={() => setTaskForm({ task: t, status: t.status })}>
                            <span className="strike">{t.title}</span>
                            {t.description && <span className="muted small">{t.description}</span>}
                          </button>
                          <PriorityChip priority={t.priority} />
                          {project && (
                            <span className="tc-chip">
                              <span className="tab-dot" style={{ background: colorFor(project.id) }} />
                              {project.name}
                            </span>
                          )}
                          {t.due_date && (
                            <span className={'tc-due' + (isOverdue(t, today) ? ' overdue' : '')}>
                              <Icon name="calendar" size={13} /> {formatDateHuman(t.due_date)}
                            </span>
                          )}
                          <select
                            className="status-select"
                            value={t.status}
                            onChange={(e) => moveTo(t, e.target.value as TaskStatus)}
                            aria-label="Change status"
                          >
                            {TASK_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {COLUMN_LABELS[s]}
                              </option>
                            ))}
                          </select>
                          <Menu label={`Options for ${t.title}`} items={cardMenu(t)} />
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* The card that follows the pointer while dragging. */}
      {drag?.active && (
        <div
          className="drag-float"
          style={{ left: drag.x - drag.offX, top: drag.y - drag.offY, width: drag.w }}
          aria-hidden
        >
          {(() => {
            const t = tasks.find((x) => x.id === drag.id);
            return t ? (
              <TaskCard
                task={t}
                project={projectById.get(t.project_id ?? '') ?? null}
                today={today}
                menu={[]}
                index={0}
                floating
              />
            ) : null;
          })()}
        </div>
      )}

      {taskForm && (
        <TaskForm
          initial={taskForm.task}
          defaultStatus={taskForm.status}
          projects={projects}
          defaultProject={activeProject === 'all' ? null : activeProject}
          positionFor={(s) => nextPosition(tasks, s)}
          onClose={() => setTaskForm(null)}
          onSaved={async () => {
            setTaskForm(null);
            await load();
          }}
          onError={(m) => setError(m)}
        />
      )}

      {projectForm && (
        <ProjectForm
          initial={projectForm.project}
          onClose={() => setProjectForm(null)}
          onSaved={async () => {
            setProjectForm(null);
            await load();
          }}
          onError={(m) => setError(m)}
        />
      )}

      {deleteTaskId && (
        <ConfirmDialog
          message="This task will be permanently removed."
          onConfirm={handleDeleteTask}
          onCancel={() => setDeleteTaskId(null)}
        />
      )}
      {deleteProjectId && (
        <ConfirmDialog
          message="The project will be deleted. Its tasks are kept but detached from the project."
          onConfirm={handleDeleteProject}
          onCancel={() => setDeleteProjectId(null)}
        />
      )}
    </main>
  );
}

function PriorityChip({ priority }: { priority: TaskPriority }) {
  const level = priorityLevel(priority);
  return (
    <span className="tc-chip">
      <span className="bars" aria-hidden>
        {[1, 2, 3].map((b) => (
          <i key={b} style={{ height: 3 + b * 3, background: b <= level ? PRIORITY_COLORS[priority] : undefined }} />
        ))}
      </span>
      {priority[0].toUpperCase() + priority.slice(1)}
    </span>
  );
}

function TaskCard({
  task,
  project,
  today,
  menu,
  index,
  floating = false,
  onPointerDown,
  onOpen,
}: {
  task: Task;
  project: Project | null;
  today: string;
  menu: MenuItem[];
  index: number;
  floating?: boolean;
  onPointerDown?: (e: React.PointerEvent<HTMLElement>) => void;
  onOpen?: () => void;
}) {
  const overdue = isOverdue(task, today);
  return (
    <article
      className={'task-card' + (floating ? ' floating' : '') + (task.status === 'done' ? ' is-done' : '')}
      data-flip-id={floating ? undefined : task.id}
      data-card-id={floating ? undefined : task.id}
      style={{ ['--i' as string]: index }}
      onPointerDown={onPointerDown}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button, a, [role="menu"]')) return;
        onOpen?.();
      }}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault();
          onOpen?.();
        }
      }}
      tabIndex={floating ? -1 : 0}
      aria-label={`${task.title}, ${task.priority} priority${task.due_date ? `, due ${formatDateHuman(task.due_date)}` : ''}`}
    >
      <div className="tc-top">
        <span className="tc-avatar" style={{ background: colorFor(project?.id ?? null) }} aria-hidden>
          {project ? project.name.slice(0, 1).toUpperCase() : ''}
        </span>
        <span className="tc-project">{project?.name ?? 'No project'}</span>
        {!floating && <Menu label={`Options for ${task.title}`} items={menu} />}
      </div>
      <div className="tc-title">{task.title}</div>
      {task.description && <p className="tc-desc">{task.description}</p>}
      {task.due_date && (
        <div className={'tc-due' + (overdue ? ' overdue' : '')}>
          <Icon name="calendar" size={13} /> {overdue ? 'Overdue · ' : 'Due '}
          {formatDateHuman(task.due_date)}
        </div>
      )}
      <div className="tc-foot">
        <PriorityChip priority={task.priority} />
        <button type="button" className="tc-grip" aria-label="Drag to move (touch)" tabIndex={-1}>
          <Icon name="grip" size={14} />
        </button>
      </div>
    </article>
  );
}

function TaskForm({
  initial,
  defaultStatus,
  projects,
  defaultProject,
  positionFor,
  onClose,
  onSaved,
  onError,
}: {
  initial: Task | null;
  defaultStatus: TaskStatus;
  projects: Project[];
  defaultProject: string | null;
  positionFor: (s: TaskStatus) => number;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [priority, setPriority] = useState<TaskPriority>(initial?.priority ?? 'medium');
  const [dueDate, setDueDate] = useState(initial?.due_date ?? '');
  const [projectId, setProjectId] = useState<string>(initial?.project_id ?? defaultProject ?? '');
  const [status, setStatus] = useState<TaskStatus>(initial?.status ?? defaultStatus);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = 'Title is required.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const payload: NewTask = {
      title: title.trim(),
      description: description.trim(),
      priority,
      due_date: dueDate || null,
      project_id: projectId || null,
      status,
    };
    // New tasks, or tasks moved to another column, go to the end of that column.
    if (!initial || initial.status !== status) payload.position = positionFor(status);
    setSaving(true);
    try {
      if (initial) await db.updateTask(initial.id, payload);
      else await db.createTask(payload);
      onSaved();
    } catch (err) {
      onError((err as Error).message || 'Failed to save task.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? 'Edit task' : 'New task'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="ttitle">Title</label>
          <input
            id="ttitle"
            className={'input' + (errors.title ? ' invalid' : '')}
            placeholder="e.g. Draft the proposal"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          {errors.title && <span className="field-error">{errors.title}</span>}
        </div>

        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="tdesc">Description</label>
          <textarea
            id="tdesc"
            className="textarea"
            placeholder="Optional details."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="field" style={{ marginTop: 16 }}>
          <label>Status</label>
          <LiquidTabs
            label="Status"
            value={status}
            onChange={setStatus}
            options={TASK_STATUSES.map((s) => ({ value: s, label: COLUMN_LABELS[s] }))}
          />
        </div>

        <div className="form-grid" style={{ marginTop: 16 }}>
          <div className="field">
            <label htmlFor="tpriority">Priority</label>
            <select
              id="tpriority"
              className="select"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="tdue">Due date</label>
            <input id="tdue" type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="tproject">Project</label>
            <select id="tproject" className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ProjectForm({
  initial,
  onClose,
  onSaved,
  onError,
}: {
  initial: Project | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setErrors({ name: 'Name is required.' });
      return;
    }
    const payload: NewProject = { name: name.trim(), description: description.trim() };
    setSaving(true);
    try {
      if (initial) await db.updateProject(initial.id, payload);
      else await db.createProject(payload);
      onSaved();
    } catch (err) {
      onError((err as Error).message || 'Failed to save project.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? 'Edit project' : 'New project'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="pname">Name</label>
          <input
            id="pname"
            className={'input' + (errors.name ? ' invalid' : '')}
            placeholder="e.g. Garden refresh"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          {errors.name && <span className="field-error">{errors.name}</span>}
        </div>
        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="pdesc">Description</label>
          <textarea
            id="pdesc"
            className="textarea"
            placeholder="Optional."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
