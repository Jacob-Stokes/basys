import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import TaskEditModal from '../components/TaskEditModal';

// ── Types ──────────────────────────────────────────────────────────

interface Column {
  id: string;
  title: string;
  position: number;
  is_done_column: number;
}

interface Task {
  id: string;
  title: string;
  done: number;
  priority: number;
  task_type: string | null;
  assignee_username: string | null;
  assignee_name: string | null;
  bucket_id: string | null;
  position: number;
  project_title: string | null;
  project_color: string | null;
}

interface Sprint {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  sprint_number: number | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  project_mode?: string;
}

type ViewMode = 'kanban' | 'list';

// ── Task type badge colors ─────────────────────────────────────────

const typeColors: Record<string, string> = {
  task: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300',
  bug: 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300',
  feature: 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-300',
  chore: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
};

const statusColors: Record<string, string> = {
  planned: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  active: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300',
  completed: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300',
};

const priorityDots: Record<number, string> = {
  0: '',
  1: 'bg-gray-400',
  2: 'bg-yellow-400',
  3: 'bg-orange-500',
  4: 'bg-red-500',
};

// ── TaskCard ───────────────────────────────────────────────────────

function TaskCard({ task, onDragStart, onClick }: {
  task: Task;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
  onClick: () => void;
}) {
  const assignee = task.assignee_username || task.assignee_name;
  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, task.id)}
      onClick={onClick}
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow"
    >
      <div className="flex items-start gap-2">
        {task.priority > 0 && priorityDots[task.priority] && (
          <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${priorityDots[task.priority]}`} />
        )}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${task.done ? 'line-through text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
            {task.title}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {task.task_type && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${typeColors[task.task_type] || typeColors.task}`}>
                {task.task_type}
              </span>
            )}
            {assignee && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                {assignee}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── KanbanColumn ───────────────────────────────────────────────────

function KanbanColumn({ column, tasks, onDragStart, onDrop, onTaskClick, onAddTask, onRenameColumn, onDeleteColumn, onToggleDoneColumn }: {
  column: Column;
  tasks: Task[];
  onDragStart: (e: React.DragEvent, taskId: string) => void;
  onDrop: (columnId: string) => void;
  onTaskClick: (task: Task) => void;
  onAddTask: (columnId: string, title: string) => void;
  onRenameColumn?: (columnId: string, title: string) => void;
  onDeleteColumn?: (columnId: string) => void;
  onToggleDoneColumn?: (columnId: string, isDone: boolean) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameTitle, setRenameTitle] = useState(column.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingTask && inputRef.current) inputRef.current.focus();
  }, [addingTask]);

  useEffect(() => {
    if (renaming && renameRef.current) { renameRef.current.focus(); renameRef.current.select(); }
  }, [renaming]);

  const handleSubmit = () => {
    if (newTitle.trim()) {
      onAddTask(column.id, newTitle.trim());
      setNewTitle('');
      setAddingTask(false);
    }
  };

  const handleRename = () => {
    if (renameTitle.trim() && renameTitle.trim() !== column.title) {
      onRenameColumn?.(column.id, renameTitle.trim());
    }
    setRenaming(false);
  };

  return (
    <div
      className={`flex flex-col w-72 flex-shrink-0 rounded-lg transition-colors ${
        dragOver ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-gray-50 dark:bg-gray-900/50'
      }`}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); onDrop(column.id); }}
    >
      {/* Column header */}
      <div className="px-3 py-2.5 flex items-center justify-between group">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {renaming ? (
            <input
              ref={renameRef}
              type="text"
              value={renameTitle}
              onChange={e => setRenameTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setRenaming(false); setRenameTitle(column.title); } }}
              onBlur={handleRename}
              className="text-sm font-semibold bg-white dark:bg-gray-800 border border-blue-400 rounded px-1.5 py-0.5 text-gray-700 dark:text-gray-300 outline-none w-full"
            />
          ) : (
            <span
              className="text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer truncate"
              onDoubleClick={() => { setRenaming(true); setRenameTitle(column.title); }}
              title="Double-click to rename"
            >
              {column.title}
              {column.is_done_column ? ' ✓' : ''}
            </span>
          )}
          <span className="text-xs text-gray-400 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded-full flex-shrink-0">
            {tasks.length}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setAddingTask(true)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg leading-none"
          >
            +
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-gray-700 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 z-20 py-1">
                  <button onClick={() => { setRenaming(true); setRenameTitle(column.title); setMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600">
                    Rename
                  </button>
                  <button onClick={() => { onToggleDoneColumn?.(column.id, !column.is_done_column); setMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600">
                    {column.is_done_column ? 'Unmark as Done column' : 'Mark as Done column'}
                  </button>
                  <button onClick={() => { if (confirm(`Delete column "${column.title}"? Tasks will be unassigned.`)) { onDeleteColumn?.(column.id); } setMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
                    Delete Column
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="px-2 pb-2 flex-1 overflow-y-auto space-y-2 min-h-[100px]">
        {tasks.map(t => (
          <TaskCard key={t.id} task={t} onDragStart={onDragStart} onClick={() => onTaskClick(t)} />
        ))}
        {addingTask && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2">
            <input
              ref={inputRef}
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSubmit();
                if (e.key === 'Escape') { setAddingTask(false); setNewTitle(''); }
              }}
              onBlur={() => { if (!newTitle.trim()) { setAddingTask(false); setNewTitle(''); } }}
              placeholder="Task title..."
              className="w-full text-sm border-none outline-none bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400"
            />
            <div className="flex justify-end gap-1 mt-1">
              <button onClick={() => { setAddingTask(false); setNewTitle(''); }} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-0.5">
                Cancel
              </button>
              <button onClick={handleSubmit} disabled={!newTitle.trim()} className="text-xs bg-blue-600 text-white rounded px-2 py-0.5 disabled:opacity-50">
                Add
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── ListSection ────────────────────────────────────────────────────

function ListSection({ column, tasks, onTaskClick, onToggleTask, onAddTask }: {
  column: Column;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onToggleTask: (taskId: string) => void;
  onAddTask?: (columnId: string, title: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingTask && inputRef.current) inputRef.current.focus();
  }, [addingTask]);

  const handleSubmit = () => {
    if (newTitle.trim() && onAddTask) {
      onAddTask(column.id, newTitle.trim());
      setNewTitle('');
      setAddingTask(false);
    }
  };

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
      <div className="w-full px-4 py-2.5 flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
        <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-2 flex-1">
          <svg
            className={`w-3.5 h-3.5 text-gray-400 transition-transform ${collapsed ? '' : 'rotate-90'}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{column.title}</span>
          <span className="text-xs text-gray-400">{tasks.length}</span>
        </button>
        {onAddTask && (
          <button
            onClick={() => { setAddingTask(true); setCollapsed(false); }}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg leading-none"
          >
            +
          </button>
        )}
      </div>
      {!collapsed && (
        <div>
          {tasks.map(t => {
            const assignee = t.assignee_username || t.assignee_name;
            return (
              <div
                key={t.id}
                onClick={() => onTaskClick(t)}
                className="px-4 py-2 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer border-t border-gray-100 dark:border-gray-800"
              >
                <button
                  onClick={e => { e.stopPropagation(); onToggleTask(t.id); }}
                  className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                    t.done
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                  }`}
                >
                  {t.done ? (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : null}
                </button>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  {t.priority > 0 && priorityDots[t.priority] && (
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityDots[t.priority]}`} />
                  )}
                  <span className={`text-sm truncate ${t.done ? 'line-through text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
                    {t.title}
                  </span>
                  {t.task_type && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${typeColors[t.task_type] || typeColors.task}`}>
                      {t.task_type}
                    </span>
                  )}
                </div>
                {assignee && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex-shrink-0">
                    {assignee}
                  </span>
                )}
              </div>
            );
          })}
          {addingTask && (
            <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSubmit();
                  if (e.key === 'Escape') { setAddingTask(false); setNewTitle(''); }
                }}
                onBlur={() => { if (!newTitle.trim()) { setAddingTask(false); setNewTitle(''); } }}
                placeholder="Task title..."
                className="flex-1 text-sm border border-gray-300 dark:border-gray-600 rounded px-2.5 py-1.5 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button onClick={() => { setAddingTask(false); setNewTitle(''); }} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-0.5">
                Cancel
              </button>
              <button onClick={handleSubmit} disabled={!newTitle.trim()} className="text-xs bg-blue-600 text-white rounded px-2.5 py-1 disabled:opacity-50">
                Add
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Local TaskEditModal and TaskRelationsInline replaced by shared TaskEditModal component

// ── Main SprintBoard Component ─────────────────────────────────────

export default function SprintBoard() {
  const { sprintId } = useParams<{ sprintId: string }>();
  const navigate = useNavigate();

  const [sprint, setSprint] = useState<Sprint | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [backlog, setBacklog] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [backlogCollapsed, setBacklogCollapsed] = useState(false);
  const [headerAddingTask, setHeaderAddingTask] = useState(false);
  const [headerNewTitle, setHeaderNewTitle] = useState('');
  const headerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (headerAddingTask && headerInputRef.current) headerInputRef.current.focus();
  }, [headerAddingTask]);

  const loadSprint = async () => {
    if (!sprintId) return;
    try {
      const data = await api.getSprint(sprintId);
      setSprint(data);
      setColumns(data.columns || []);
      setTasks(data.tasks || []);
      setBacklog(data.backlog || []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  };

  useEffect(() => { loadSprint(); }, [sprintId]);

  const handleDragStart = (_e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
  };

  const handleDrop = async (columnId: string) => {
    if (!draggedTaskId) return;
    // Find the task (could be in tasks or backlog)
    const task = tasks.find(t => t.id === draggedTaskId) || backlog.find(t => t.id === draggedTaskId);
    if (!task) return;

    // Optimistic update
    const prevTasks = [...tasks];
    const prevBacklog = [...backlog];

    if (backlog.find(t => t.id === draggedTaskId)) {
      // Moving from backlog to sprint
      setBacklog(prev => prev.filter(t => t.id !== draggedTaskId));
      setTasks(prev => [...prev, { ...task, bucket_id: columnId, sprint_id: sprintId } as any]);
    } else {
      // Moving between columns
      setTasks(prev => prev.map(t => t.id === draggedTaskId ? { ...t, bucket_id: columnId } : t));
    }

    setDraggedTaskId(null);

    try {
      await api.updateTask(draggedTaskId, { bucket_id: columnId, sprint_id: sprintId });
    } catch {
      // Revert on failure
      setTasks(prevTasks);
      setBacklog(prevBacklog);
    }
  };

  const handleBacklogDrop = async () => {
    if (!draggedTaskId || !sprint) return;
    const task = tasks.find(t => t.id === draggedTaskId);
    if (!task) return;

    // Optimistic: move to backlog
    setTasks(prev => prev.filter(t => t.id !== draggedTaskId));
    setBacklog(prev => [...prev, { ...task, bucket_id: null, sprint_id: null } as any]);
    setDraggedTaskId(null);

    try {
      await api.updateTask(draggedTaskId, { bucket_id: null, sprint_id: null });
    } catch {
      loadSprint(); // Reload on failure
    }
  };

  const handleAddTask = async (columnId: string, title: string) => {
    if (!sprint) return;
    const isSpecial = columnId.startsWith('__');
    try {
      await api.createTask({
        title,
        project_id: sprint.project_id,
        sprint_id: columnId === '__backlog' ? null : sprint.id,
        bucket_id: isSpecial ? null : columnId,
      });
      await loadSprint();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleEditTask = async (taskId: string, data: any) => {
    try {
      await api.updateTask(taskId, data);
      await loadSprint();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleToggleTask = async (taskId: string) => {
    try {
      await api.toggleTask(taskId);
      await loadSprint();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // ── Column management ─────────────────────────────────────────
  const handleRenameColumn = async (columnId: string, title: string) => {
    if (!sprintId) return;
    try {
      await api.updateSprintColumn(sprintId, columnId, { title });
      await loadSprint();
    } catch (err) { setError((err as Error).message); }
  };

  const handleDeleteColumn = async (columnId: string) => {
    if (!sprintId) return;
    try {
      await api.deleteSprintColumn(sprintId, columnId);
      await loadSprint();
    } catch (err) { setError((err as Error).message); }
  };

  const handleToggleDoneColumn = async (columnId: string, isDone: boolean) => {
    if (!sprintId) return;
    try {
      await api.updateSprintColumn(sprintId, columnId, { is_done_column: isDone });
      await loadSprint();
    } catch (err) { setError((err as Error).message); }
  };

  const handleAddColumn = async () => {
    if (!sprintId) return;
    const title = prompt('New column name:');
    if (!title?.trim()) return;
    try {
      await api.createSprintColumn(sprintId, { title: title.trim() });
      await loadSprint();
    } catch (err) { setError((err as Error).message); }
  };

  const handleSaveColumnsAsDefault = async () => {
    if (!sprint) return;
    const defaultCols = columns.map(c => ({ title: c.title, position: c.position, is_done_column: c.is_done_column }));
    try {
      await api.updateProject(sprint.project_id, { default_columns: defaultCols });
      alert('Columns saved as default for this project. New sprints/sections will use these columns.');
    } catch (err) { setError((err as Error).message); }
  };

  const handleStatusChange = async (status: string) => {
    if (!sprintId) return;
    try {
      await api.updateSprintStatus(sprintId, status);
      await loadSprint();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">Loading sprint...</p>
      </div>
    );
  }

  if (error || !sprint) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-2">{error || 'Sprint not found'}</p>
          <button onClick={() => navigate(-1)} className="text-sm text-blue-600 hover:text-blue-700">Go back</button>
        </div>
      </div>
    );
  }

  const tasksForColumn = (columnId: string) =>
    tasks.filter(t => t.bucket_id === columnId).sort((a, b) => a.position - b.position);

  const unassignedTasks = tasks.filter(t => !t.bucket_id);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3">
        {(() => {
          const isSimple = (sprint.project_mode || 'simple') === 'simple';
          return (
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{sprint.title}</h1>
              {!isSimple && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase ${statusColors[sprint.status] || statusColors.planned}`}>
                  {sprint.status}
                </span>
              )}
            </div>
            {!isSimple && (
              <div className="text-xs text-gray-400 dark:text-gray-500">
                {sprint.sprint_number && `Sprint ${sprint.sprint_number}`}
                {sprint.start_date && ` · ${new Date(sprint.start_date).toLocaleDateString()}`}
                {sprint.end_date && ` – ${new Date(sprint.end_date).toLocaleDateString()}`}
              </div>
            )}
          </div>

          {/* Status actions — sprint mode only */}
          {!isSimple && (
            <div className="flex items-center gap-2">
              {sprint.status === 'planned' && (
                <button onClick={() => handleStatusChange('active')} className="text-xs px-2 py-1 rounded bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900">
                  Start Sprint
                </button>
              )}
              {sprint.status === 'active' && (
                <button onClick={() => handleStatusChange('completed')} className="text-xs px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900">
                  Complete
                </button>
              )}
              {sprint.status === 'completed' && (
                <button onClick={() => handleStatusChange('active')} className="text-xs px-2 py-1 rounded bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900">
                  Reopen
                </button>
              )}
            </div>
          )}

          {/* Add task button */}
          <button
            onClick={() => setHeaderAddingTask(true)}
            className="text-xs px-2.5 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            + Task
          </button>

          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'kanban'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              Board
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'list'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              List
            </button>
          </div>
        </div>
          );
        })()}
        {headerAddingTask && (
          <div className="px-6 py-2 border-t border-gray-100 dark:border-gray-700 flex items-center gap-2">
            <input
              ref={headerInputRef}
              type="text"
              value={headerNewTitle}
              onChange={e => setHeaderNewTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && headerNewTitle.trim()) {
                  handleAddTask('__unassigned', headerNewTitle.trim());
                  setHeaderNewTitle('');
                  setHeaderAddingTask(false);
                }
                if (e.key === 'Escape') { setHeaderAddingTask(false); setHeaderNewTitle(''); }
              }}
              onBlur={() => { if (!headerNewTitle.trim()) { setHeaderAddingTask(false); setHeaderNewTitle(''); } }}
              placeholder="Task title..."
              className="flex-1 text-sm border border-gray-300 dark:border-gray-600 rounded px-2.5 py-1.5 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={() => { setHeaderAddingTask(false); setHeaderNewTitle(''); }}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-0.5"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (headerNewTitle.trim()) {
                  handleAddTask('__unassigned', headerNewTitle.trim());
                  setHeaderNewTitle('');
                  setHeaderAddingTask(false);
                }
              }}
              disabled={!headerNewTitle.trim()}
              className="text-xs bg-blue-600 text-white rounded px-2.5 py-1 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        )}
      </div>

      {/* Board content */}
      {viewMode === 'kanban' ? (
        <div className="flex gap-4 px-6 py-4 overflow-x-auto" style={{ minHeight: 'calc(100vh - 170px)' }}>
          {columns.map(col => (
            <KanbanColumn
              key={col.id}
              column={col}
              tasks={tasksForColumn(col.id)}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
              onTaskClick={t => setEditingTask(t)}
              onAddTask={handleAddTask}
              onRenameColumn={handleRenameColumn}
              onDeleteColumn={handleDeleteColumn}
              onToggleDoneColumn={handleToggleDoneColumn}
            />
          ))}

          {/* Add Column button */}
          <div className="flex-shrink-0 w-72 space-y-2">
            <button
              onClick={handleAddColumn}
              className="w-full py-3 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 text-sm text-gray-400 dark:text-gray-500 hover:border-blue-400 hover:text-blue-500 dark:hover:border-blue-500 dark:hover:text-blue-400 transition-colors"
            >
              + Add Column
            </button>
            <button
              onClick={handleSaveColumnsAsDefault}
              className="w-full py-2 text-xs text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
              title="New sprints/sections in this project will use the current columns"
            >
              Save columns as project default
            </button>
          </div>

          {/* Unassigned tasks in sprint (no bucket) */}
          {unassignedTasks.length > 0 && (
            <div className="flex flex-col w-72 flex-shrink-0 rounded-lg bg-yellow-50 dark:bg-yellow-900/10">
              <div className="px-3 py-2.5">
                <span className="text-sm font-semibold text-yellow-700 dark:text-yellow-300">Unassigned ({unassignedTasks.length})</span>
              </div>
              <div className="px-2 pb-2 space-y-2">
                {unassignedTasks.map(t => (
                  <TaskCard key={t.id} task={t} onDragStart={handleDragStart} onClick={() => setEditingTask(t)} />
                ))}
              </div>
            </div>
          )}

          {/* Backlog drop zone */}
          <div
            className={`flex flex-col w-72 flex-shrink-0 rounded-lg transition-colors ${
              draggedTaskId ? 'bg-orange-50 dark:bg-orange-900/10 border-2 border-dashed border-orange-300 dark:border-orange-700' : 'bg-gray-50 dark:bg-gray-900/30'
            }`}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleBacklogDrop(); }}
          >
            <button
              onClick={() => setBacklogCollapsed(!backlogCollapsed)}
              className="px-3 py-2.5 flex items-center gap-2 w-full"
            >
              <svg
                className={`w-3.5 h-3.5 text-gray-400 transition-transform ${backlogCollapsed ? '' : 'rotate-90'}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">Backlog ({backlog.length})</span>
            </button>
            {!backlogCollapsed && (
              <div className="px-2 pb-2 space-y-2 overflow-y-auto max-h-[500px]">
                {backlog.map(t => (
                  <TaskCard key={t.id} task={t} onDragStart={handleDragStart} onClick={() => setEditingTask(t)} />
                ))}
                {backlog.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">Drop tasks here to move to backlog</p>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* List view */
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg m-4 overflow-hidden">
            {columns.map(col => (
              <ListSection
                key={col.id}
                column={col}
                tasks={tasksForColumn(col.id)}
                onTaskClick={t => setEditingTask(t)}
                onToggleTask={handleToggleTask}
                onAddTask={handleAddTask}
              />
            ))}
            {unassignedTasks.length > 0 && (
              <ListSection
                column={{ id: '__unassigned', title: (sprint.project_mode || 'simple') === 'simple' ? 'Tasks' : 'Unassigned', position: -1, is_done_column: 0 }}
                tasks={unassignedTasks}
                onTaskClick={t => setEditingTask(t)}
                onToggleTask={handleToggleTask}
                onAddTask={handleAddTask}
              />
            )}
          </div>

          {/* Backlog in list view */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg mx-4 mb-4 overflow-hidden">
            <ListSection
              column={{ id: '__backlog', title: `Backlog`, position: -2, is_done_column: 0 }}
              tasks={backlog}
              onTaskClick={t => setEditingTask(t)}
              onToggleTask={handleToggleTask}
              onAddTask={handleAddTask}
            />
          </div>
        </div>
      )}

      {/* Task edit modal */}
      {editingTask && (
        <TaskEditModal
          task={editingTask}
          columns={columns.map(c => ({ id: c.id, title: c.title }))}
          onSave={(data) => handleEditTask(editingTask.id, data)}
          onClose={() => setEditingTask(null)}
          showTaskType
          showAssignee
          showColumnSelector
          showRelations
          showDates
          showChecklist
        />
      )}
    </div>
  );
}
