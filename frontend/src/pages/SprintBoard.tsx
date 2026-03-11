import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';

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
  sprint_number: number;
  status: string;
  start_date: string | null;
  end_date: string | null;
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

function KanbanColumn({ column, tasks, onDragStart, onDrop, onTaskClick, onAddTask }: {
  column: Column;
  tasks: Task[];
  onDragStart: (e: React.DragEvent, taskId: string) => void;
  onDrop: (columnId: string) => void;
  onTaskClick: (task: Task) => void;
  onAddTask: (columnId: string, title: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingTask && inputRef.current) inputRef.current.focus();
  }, [addingTask]);

  const handleSubmit = () => {
    if (newTitle.trim()) {
      onAddTask(column.id, newTitle.trim());
      setNewTitle('');
      setAddingTask(false);
    }
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
      <div className="px-3 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{column.title}</span>
          <span className="text-xs text-gray-400 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">
            {tasks.length}
          </span>
        </div>
        <button
          onClick={() => setAddingTask(true)}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg leading-none"
        >
          +
        </button>
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

function ListSection({ column, tasks, onTaskClick, onToggleTask }: {
  column: Column;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onToggleTask: (taskId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-4 py-2.5 flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <svg
          className={`w-3.5 h-3.5 text-gray-400 transition-transform ${collapsed ? '' : 'rotate-90'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{column.title}</span>
        <span className="text-xs text-gray-400">{tasks.length}</span>
      </button>
      {!collapsed && tasks.length > 0 && (
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
        </div>
      )}
    </div>
  );
}

// ── Task Edit Modal ────────────────────────────────────────────────

function TaskEditModal({ task, columns, onSave, onClose }: {
  task: Task;
  columns: Column[];
  onSave: (id: string, data: any) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [taskType, setTaskType] = useState(task.task_type || '');
  const [assigneeName, setAssigneeName] = useState(task.assignee_name || '');
  const [priority, setPriority] = useState(task.priority);
  const [bucketId, setBucketId] = useState(task.bucket_id || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(task.id, {
      title: title.trim(),
      task_type: taskType || null,
      assignee_name: assigneeName || null,
      priority,
      bucket_id: bucketId || null,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full text-lg font-medium bg-transparent border-none outline-none text-gray-900 dark:text-gray-100"
              autoFocus
            />
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Type</label>
                <select
                  value={taskType}
                  onChange={e => setTaskType(e.target.value)}
                  className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="">None</option>
                  <option value="task">Task</option>
                  <option value="bug">Bug</option>
                  <option value="feature">Feature</option>
                  <option value="chore">Chore</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Priority</label>
                <select
                  value={priority}
                  onChange={e => setPriority(Number(e.target.value))}
                  className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value={0}>None</option>
                  <option value={1}>Low</option>
                  <option value={2}>Medium</option>
                  <option value={3}>High</option>
                  <option value={4}>Urgent</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Assignee</label>
              <input
                type="text"
                value={assigneeName}
                onChange={e => setAssigneeName(e.target.value)}
                placeholder="Name..."
                className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Column</label>
              <select
                value={bucketId}
                onChange={e => setBucketId(e.target.value)}
                className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="">Backlog</option>
                {columns.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              Cancel
            </button>
            <button type="submit" disabled={!title.trim()} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

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
    try {
      await api.createTask({
        title,
        project_id: sprint.project_id,
        sprint_id: sprint.id,
        bucket_id: columnId,
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
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{sprint.title}</h1>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase ${statusColors[sprint.status] || statusColors.planned}`}>
                {sprint.status}
              </span>
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500">
              Sprint {sprint.sprint_number}
              {sprint.start_date && ` · ${new Date(sprint.start_date).toLocaleDateString()}`}
              {sprint.end_date && ` – ${new Date(sprint.end_date).toLocaleDateString()}`}
            </div>
          </div>

          {/* Status actions */}
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
      </div>

      {/* Board content */}
      {viewMode === 'kanban' ? (
        <div className="flex gap-4 p-4 overflow-x-auto" style={{ minHeight: 'calc(100vh - 170px)' }}>
          {columns.map(col => (
            <KanbanColumn
              key={col.id}
              column={col}
              tasks={tasksForColumn(col.id)}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
              onTaskClick={t => setEditingTask(t)}
              onAddTask={handleAddTask}
            />
          ))}

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
        <div className="max-w-4xl mx-auto">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg m-4 overflow-hidden">
            {columns.map(col => (
              <ListSection
                key={col.id}
                column={col}
                tasks={tasksForColumn(col.id)}
                onTaskClick={t => setEditingTask(t)}
                onToggleTask={handleToggleTask}
              />
            ))}
            {unassignedTasks.length > 0 && (
              <ListSection
                column={{ id: '__unassigned', title: 'Unassigned', position: -1, is_done_column: 0 }}
                tasks={unassignedTasks}
                onTaskClick={t => setEditingTask(t)}
                onToggleTask={handleToggleTask}
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
            />
          </div>
        </div>
      )}

      {/* Task edit modal */}
      {editingTask && (
        <TaskEditModal
          task={editingTask}
          columns={columns}
          onSave={handleEditTask}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}
