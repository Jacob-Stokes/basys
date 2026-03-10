import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import ConfirmModal from '../components/ConfirmModal';

// ── Types ──────────────────────────────────────────────────────────

interface LabelItem {
  id: string;
  title: string;
  hex_color: string;
  description: string | null;
  task_count?: number;
}

interface TaskLinkItem {
  task_id: string;
  target_type: 'goal' | 'subgoal' | 'habit' | 'pomodoro';
  target_id: string;
  target_title: string;
}

interface ProjectItem {
  id: string;
  title: string;
  description: string | null;
  hex_color: string;
  is_favorite: number;
  archived: number;
  open_tasks: number;
  done_tasks: number;
}

interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  done: number;
  done_at: string | null;
  due_date: string | null;
  priority: number;
  is_favorite: number;
  project_id: string | null;
  project: { id: string; title: string; hex_color: string } | null;
  labels: LabelItem[];
  links: TaskLinkItem[];
}

type ActiveTab = 'overview' | 'projects' | 'labels';
type TaskFilter = 'home' | 'all' | 'open' | 'done' | 'favorites';

// ── Helpers ────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function relativeDue(due: string): string {
  const today = new Date(todayStr());
  const d = new Date(due);
  const diff = Math.floor((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff <= 7) return `${diff}d`;
  return due;
}

function priorityColor(p: number): string {
  if (p >= 4) return 'bg-red-500';
  if (p === 3) return 'bg-orange-500';
  if (p === 2) return 'bg-blue-500';
  if (p === 1) return 'bg-gray-400';
  return 'bg-transparent';
}

function priorityLabel(p: number): string {
  if (p >= 4) return 'Urgent';
  if (p === 3) return 'High';
  if (p === 2) return 'Medium';
  if (p === 1) return 'Low';
  return 'None';
}

const PRESET_COLORS = ['#e2e8f0', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280'];

// ── LabelPill ──────────────────────────────────────────────────────

function LabelPill({ label, small }: { label: LabelItem; small?: boolean }) {
  const isDark = label.hex_color && !['#e2e8f0', '#ffffff', ''].includes(label.hex_color.toLowerCase());
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${small ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'}`}
      style={{
        backgroundColor: label.hex_color || '#e2e8f0',
        color: isDark ? '#fff' : '#374151',
      }}
    >
      {label.title}
    </span>
  );
}

// ── QuickAddBar (shared between overview + project detail) ─────────

function QuickAddBar({ value, onChange, onSubmit, placeholder, inputRef }: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <div className="px-3 py-3">
      <form
        onSubmit={e => { e.preventDefault(); onSubmit(); }}
        className="flex gap-3"
      >
        <div className="flex-1 flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
          <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder || 'Add a task...'}
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
          />
        </div>
        {value.trim() && (
          <button
            type="submit"
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            Add
          </button>
        )}
      </form>
    </div>
  );
}

// ── TaskRow ────────────────────────────────────────────────────────

function TaskRow({ task, onToggle, onEdit, onDelete, onToggleFavorite }: {
  task: TaskItem;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isOverdue = task.due_date && !task.done && task.due_date < todayStr();

  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 group ${task.done ? 'opacity-60' : ''}`}>
      {/* Checkbox */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
          task.done
            ? 'bg-green-500 border-green-500 text-white'
            : 'border-gray-300 dark:border-gray-600 hover:border-green-400'
        }`}
      >
        {task.done && (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Priority dot */}
      {task.priority > 0 && (
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityColor(task.priority)}`} title={priorityLabel(task.priority)} />
      )}

      {/* Title + details */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onEdit}>
        <div className={`text-sm ${task.done ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
          {task.title}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {task.due_date && (
            <span className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
              {relativeDue(task.due_date)}
            </span>
          )}
          {task.project && (
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: task.project.hex_color ? task.project.hex_color + '20' : '#e2e8f020',
                color: task.project.hex_color || '#6b7280',
              }}
            >
              {task.project.title}
            </span>
          )}
          {task.labels.map(l => <LabelPill key={l.id} label={l} small />)}
          {task.links?.map(link => (
            <span key={`${link.target_type}-${link.target_id}`} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
              {link.target_type === 'goal' ? '🎯' : link.target_type === 'subgoal' ? '📌' : link.target_type === 'habit' ? '✅' : '🍅'}{' '}
              {link.target_title}
            </span>
          ))}
        </div>
      </div>

      {/* Favorite */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
        className={`text-sm flex-shrink-0 transition-colors ${task.is_favorite ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100'}`}
      >
        ★
      </button>

      {/* Three-dot menu */}
      <div className="relative flex-shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-gray-700 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 z-20 py-1">
              <button onClick={() => { onEdit(); setMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600">
                Edit
              </button>
              <button onClick={() => { onDelete(); setMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── TaskEditModal ──────────────────────────────────────────────────

function TaskEditModal({ task, projects, labels, onSave, onClose }: {
  task: TaskItem | null; // null = create
  projects: ProjectItem[];
  labels: LabelItem[];
  onSave: (data: any) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [dueDate, setDueDate] = useState(task?.due_date || '');
  const [priority, setPriority] = useState(task?.priority || 0);
  const [projectId, setProjectId] = useState(task?.project_id || '');
  const [selectedLabels, setSelectedLabels] = useState<string[]>(task?.labels.map(l => l.id) || []);

  // Link state
  const [selectedLinks, setSelectedLinks] = useState<{ target_type: TaskLinkItem['target_type']; target_id: string; target_title: string }[]>(
    task?.links?.map(l => ({ target_type: l.target_type, target_id: l.target_id, target_title: l.target_title })) || []
  );
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [linkType, setLinkType] = useState<TaskLinkItem['target_type']>('goal');
  const [linkQuery, setLinkQuery] = useState('');
  const [linkResults, setLinkResults] = useState<{ id: string; title: string }[]>([]);
  const [linkDropdownOpen, setLinkDropdownOpen] = useState(false);
  const linkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search for link targets
  useEffect(() => {
    if (linkTimerRef.current) clearTimeout(linkTimerRef.current);
    if (!showLinkPicker) { setLinkResults([]); setLinkDropdownOpen(false); return; }

    const doSearch = async () => {
      try {
        let results: { id: string; title: string }[] = [];
        if (linkType === 'goal') {
          if (!linkQuery.trim()) { setLinkResults([]); setLinkDropdownOpen(false); return; }
          const data = await api.getGoals(linkQuery.trim());
          results = data.map((g: any) => ({ id: g.id, title: g.title }));
        } else if (linkType === 'subgoal') {
          if (!linkQuery.trim()) { setLinkResults([]); setLinkDropdownOpen(false); return; }
          const data = await api.searchSubGoals(linkQuery.trim());
          results = data.map((sg: any) => ({ id: sg.id, title: `${sg.goal_title} › ${sg.title}` }));
        } else if (linkType === 'habit') {
          const data = await api.getHabits();
          results = data.map((h: any) => ({ id: h.id, title: `${h.emoji || ''} ${h.title}`.trim() }));
          const q = linkQuery.trim().toLowerCase();
          if (q) results = results.filter(r => r.title.toLowerCase().includes(q));
        } else if (linkType === 'pomodoro') {
          const data = await api.getPomodoros({ limit: '50' });
          results = data.map((p: any) => ({ id: p.id, title: p.note || `Pomodoro ${new Date(p.started_at).toLocaleDateString()}` }));
          const q = linkQuery.trim().toLowerCase();
          if (q) results = results.filter(r => r.title.toLowerCase().includes(q));
        }
        // Filter out already-linked items
        results = results.filter(r => !selectedLinks.some(l => l.target_type === linkType && l.target_id === r.id));
        setLinkResults(results);
        setLinkDropdownOpen(results.length > 0);
      } catch { setLinkResults([]); setLinkDropdownOpen(false); }
    };

    const delay = (linkType === 'habit' || linkType === 'pomodoro') ? 150 : 300;
    linkTimerRef.current = setTimeout(doSearch, delay);
    return () => { if (linkTimerRef.current) clearTimeout(linkTimerRef.current); };
  }, [linkQuery, linkType, showLinkPicker]);

  const addLink = (target: { id: string; title: string }) => {
    if (selectedLinks.some(l => l.target_type === linkType && l.target_id === target.id)) return;
    setSelectedLinks(prev => [...prev, { target_type: linkType, target_id: target.id, target_title: target.title }]);
    setLinkQuery(''); setLinkResults([]); setLinkDropdownOpen(false); setShowLinkPicker(false);
  };

  const removeLink = (targetType: string, targetId: string) => {
    setSelectedLinks(prev => prev.filter(l => !(l.target_type === targetType && l.target_id === targetId)));
  };

  const linkEmoji = (type: string) =>
    type === 'goal' ? '🎯' : type === 'subgoal' ? '📌' : type === 'habit' ? '✅' : '🍅';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      description: description || null,
      due_date: dueDate || null,
      priority,
      project_id: projectId || null,
      labels: selectedLabels,
      links: selectedLinks.map(l => ({ target_type: l.target_type, target_id: l.target_id })),
    });
  };

  const toggleLabel = (labelId: string) => {
    setSelectedLabels(prev =>
      prev.includes(labelId) ? prev.filter(l => l !== labelId) : [...prev, labelId]
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          {task ? 'Edit Task' : 'New Task'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Task title..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            autoFocus
          />

          {/* Description */}
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />

          {/* Due date + Priority row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
              >
                <option value={0}>None</option>
                <option value={1}>Low</option>
                <option value={2}>Medium</option>
                <option value={3}>High</option>
                <option value={4}>Urgent</option>
              </select>
            </div>
          </div>

          {/* Project */}
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Project</label>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
            >
              <option value="">No project</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>

          {/* Labels */}
          {labels.length > 0 && (
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Labels</label>
              <div className="flex flex-wrap gap-1.5">
                {labels.map(l => {
                  const selected = selectedLabels.includes(l.id);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => toggleLabel(l.id)}
                      className={`px-2 py-1 text-xs rounded-full border transition-all ${
                        selected
                          ? 'ring-2 ring-blue-400 ring-offset-1 dark:ring-offset-gray-800'
                          : 'opacity-60 hover:opacity-100'
                      }`}
                      style={{
                        backgroundColor: l.hex_color || '#e2e8f0',
                        color: l.hex_color && !['#e2e8f0', '#ffffff', ''].includes(l.hex_color.toLowerCase()) ? '#fff' : '#374151',
                        borderColor: selected ? 'transparent' : 'transparent',
                      }}
                    >
                      {l.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Links */}
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Links</label>

            {selectedLinks.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedLinks.map(l => (
                  <span
                    key={`${l.target_type}-${l.target_id}`}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                  >
                    {linkEmoji(l.target_type)} {l.target_title}
                    <button type="button" onClick={() => removeLink(l.target_type, l.target_id)} className="text-gray-400 hover:text-red-500 font-bold ml-0.5">×</button>
                  </span>
                ))}
              </div>
            )}

            {showLinkPicker ? (
              <div className="flex gap-2 items-start">
                <select
                  value={linkType}
                  onChange={e => { setLinkType(e.target.value as TaskLinkItem['target_type']); setLinkQuery(''); setLinkResults([]); setLinkDropdownOpen(false); }}
                  className="px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                >
                  <option value="goal">🎯 Goal</option>
                  <option value="subgoal">📌 Sub-goal</option>
                  <option value="habit">✅ Habit</option>
                  <option value="pomodoro">🍅 Pomodoro</option>
                </select>
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={linkQuery}
                    onChange={e => setLinkQuery(e.target.value)}
                    onFocus={() => { if (linkResults.length > 0) setLinkDropdownOpen(true); }}
                    placeholder={`Search ${linkType}s...`}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    autoFocus
                  />
                  {linkDropdownOpen && linkResults.length > 0 && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setLinkDropdownOpen(false)} />
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-700 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 z-20 max-h-48 overflow-y-auto">
                        {linkResults.map(r => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => addLink(r)}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100"
                          >
                            {r.title}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { setShowLinkPicker(false); setLinkQuery(''); setLinkResults([]); setLinkDropdownOpen(false); }}
                  className="px-2 py-2 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowLinkPicker(true)}
                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              >
                + Add Link
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
              Cancel
            </button>
            <button type="submit" disabled={!title.trim()} className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {task ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── LabelEditModal ─────────────────────────────────────────────────

function LabelEditModal({ label, onSave, onClose }: {
  label: LabelItem | null;
  onSave: (data: { title: string; hex_color: string; description: string | null }) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(label?.title || '');
  const [hexColor, setHexColor] = useState(label?.hex_color || '#e2e8f0');
  const [description, setDescription] = useState(label?.description || '');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          {label ? 'Edit Label' : 'New Label'}
        </h3>
        <form onSubmit={(e) => { e.preventDefault(); if (title.trim()) onSave({ title: title.trim(), hex_color: hexColor, description: description || null }); }} className="space-y-4">
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Label name..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
            autoFocus
          />
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Color</label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setHexColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${hexColor === c ? 'border-blue-500 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                value={hexColor}
                onChange={e => setHexColor(e.target.value)}
                className="w-7 h-7 rounded-full cursor-pointer border-0 p-0"
              />
            </div>
          </div>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm resize-none"
          />
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
              Cancel
            </button>
            <button type="submit" disabled={!title.trim()} className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {label ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── ProjectEditModal ───────────────────────────────────────────────

function ProjectEditModal({ project, onSave, onClose }: {
  project: ProjectItem | null;
  onSave: (data: { title: string; description: string | null; hex_color: string }) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(project?.title || '');
  const [description, setDescription] = useState(project?.description || '');
  const [hexColor, setHexColor] = useState(project?.hex_color || '');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          {project ? 'Edit Project' : 'New Project'}
        </h3>
        <form onSubmit={(e) => { e.preventDefault(); if (title.trim()) onSave({ title: title.trim(), description: description || null, hex_color: hexColor }); }} className="space-y-4">
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Project name..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
            autoFocus
          />
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Color</label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setHexColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${hexColor === c ? 'border-blue-500 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                value={hexColor || '#e2e8f0'}
                onChange={e => setHexColor(e.target.value)}
                className="w-7 h-7 rounded-full cursor-pointer border-0 p-0"
              />
            </div>
          </div>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm resize-none"
          />
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
              Cancel
            </button>
            <button type="submit" disabled={!title.trim()} className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {project ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────

export default function Tasks() {
  const [tab, setTab] = useState<ActiveTab>('overview');
  const [error, setError] = useState<string | null>(null);

  // Data
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [labels, setLabels] = useState<LabelItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Task state
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('home');
  const [editingTask, setEditingTask] = useState<TaskItem | null | 'new'>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'task' | 'project' | 'label'; id: string; title: string } | null>(null);
  const [quickAdd, setQuickAdd] = useState('');
  const quickAddRef = useRef<HTMLInputElement>(null);

  // Project state
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [activeProjectData, setActiveProjectData] = useState<any>(null);
  const [editingProject, setEditingProject] = useState<ProjectItem | null | 'new'>(null);

  // Label state
  const [editingLabel, setEditingLabel] = useState<LabelItem | null | 'new'>(null);
  const [filterLabel, setFilterLabel] = useState<string | null>(null);

  // ── Load data ──────────────────────────────────────────────────

  const loadTasks = async () => {
    try {
      const params: any = {};
      // 'home' fetches all tasks so we can filter client-side (open + today's completed)
      if (taskFilter === 'open') params.done = '0';
      else if (taskFilter === 'done') params.done = '1';
      else if (taskFilter === 'favorites') params.favorite = '1';
      if (filterLabel) params.label = filterLabel;
      const data = await api.getTasks(params);
      setTasks(data);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const loadProjects = async () => {
    try {
      const data = await api.getProjects();
      setProjects(data);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const loadLabels = async () => {
    try {
      const data = await api.getLabels();
      setLabels(data);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadTasks(), loadProjects(), loadLabels()]);
    setLoading(false);
  };

  const loadProjectDetail = async (projectId: string) => {
    try {
      const data = await api.getProject(projectId);
      setActiveProjectData(data);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { loadTasks(); }, [taskFilter, filterLabel]);
  useEffect(() => {
    if (activeProject) loadProjectDetail(activeProject);
  }, [activeProject]);

  // ── Handlers ───────────────────────────────────────────────────

  const handleQuickAdd = async () => {
    if (!quickAdd.trim()) return;
    try {
      await api.createTask({ title: quickAdd.trim(), project_id: activeProject || undefined });
      setQuickAdd('');
      loadTasks();
      if (activeProject) loadProjectDetail(activeProject);
      loadProjects();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleToggleTask = async (id: string) => {
    try {
      await api.toggleTask(id);
      loadTasks();
      if (activeProject) loadProjectDetail(activeProject);
      loadProjects();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleToggleFavorite = async (id: string) => {
    try {
      await api.toggleTaskFavorite(id);
      loadTasks();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSaveTask = async (data: any) => {
    try {
      if (editingTask && editingTask !== 'new') {
        await api.updateTask(editingTask.id, data);
      } else {
        await api.createTask(data);
      }
      setEditingTask(null);
      loadTasks();
      if (activeProject) loadProjectDetail(activeProject);
      loadProjects();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSaveProject = async (data: { title: string; description: string | null; hex_color: string }) => {
    try {
      if (editingProject && editingProject !== 'new') {
        await api.updateProject(editingProject.id, data);
      } else {
        await api.createProject(data);
      }
      setEditingProject(null);
      loadProjects();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSaveLabel = async (data: { title: string; hex_color: string; description: string | null }) => {
    try {
      if (editingLabel && editingLabel !== 'new') {
        await api.updateLabel(editingLabel.id, data);
      } else {
        await api.createLabel(data);
      }
      setEditingLabel(null);
      loadLabels();
      loadTasks();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'task') await api.deleteTask(deleteTarget.id);
      else if (deleteTarget.type === 'project') await api.deleteProject(deleteTarget.id);
      else if (deleteTarget.type === 'label') await api.deleteLabel(deleteTarget.id);
      setDeleteTarget(null);
      loadAll();
      if (activeProject) loadProjectDetail(activeProject);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // ── Render Overview Tab ────────────────────────────────────────

  const renderOverview = () => {
    const today = todayStr();

    // For home view, only show open tasks + tasks completed today
    const visibleTasks = taskFilter === 'home'
      ? tasks.filter(t => !t.done || (t.done && t.done_at && t.done_at.startsWith(today)))
      : tasks;

    // Group tasks by due status
    const overdue = visibleTasks.filter(t => t.due_date && t.due_date < today && !t.done);
    const dueToday = visibleTasks.filter(t => t.due_date === today && !t.done);
    const upcoming = visibleTasks.filter(t => t.due_date && t.due_date > today && !t.done);
    const noDue = visibleTasks.filter(t => !t.due_date && !t.done);
    const doneToday = visibleTasks.filter(t => t.done && t.done_at && t.done_at.startsWith(today));
    const done = visibleTasks.filter(t => t.done);

    const renderSection = (title: string, items: TaskItem[], className?: string) => {
      if (items.length === 0) return null;
      return (
        <div className="mb-4">
          <h3 className={`text-xs font-semibold uppercase tracking-wider mb-1 px-3 ${className || 'text-gray-400 dark:text-gray-500'}`}>
            {title} ({items.length})
          </h3>
          {items.map(t => (
            <TaskRow
              key={t.id}
              task={t}
              onToggle={() => handleToggleTask(t.id)}
              onEdit={() => setEditingTask(t)}
              onDelete={() => setDeleteTarget({ type: 'task', id: t.id, title: t.title })}
              onToggleFavorite={() => handleToggleFavorite(t.id)}
            />
          ))}
        </div>
      );
    };

    return (
      <>
        {/* Quick add */}
        <QuickAddBar
          value={quickAdd}
          onChange={setQuickAdd}
          onSubmit={handleQuickAdd}
          inputRef={quickAddRef}
        />

        {/* Filter row: Home left, pills right */}
        <div className="px-3 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
          {/* Home icon */}
          <button
            onClick={() => { setTaskFilter('home'); setFilterLabel(null); }}
            className={`p-1.5 rounded-lg transition-colors ${
              taskFilter === 'home' && !filterLabel
                ? 'bg-blue-600 text-white'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
            title="Home"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
            </svg>
          </button>

          {/* Filter pills — right-aligned */}
          <div className="flex gap-1.5 items-center">
            {(['all', 'open', 'done', 'favorites'] as TaskFilter[]).map(f => (
              <button
                key={f}
                onClick={() => { setTaskFilter(f); setFilterLabel(null); }}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors capitalize ${
                  taskFilter === f && !filterLabel
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-gray-400'
                }`}
              >
                {f}
              </button>
            ))}
            {filterLabel && (
              <button
                onClick={() => setFilterLabel(null)}
                className="px-2.5 py-1 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 flex items-center gap-1"
              >
                {labels.find(l => l.id === filterLabel)?.title} ×
              </button>
            )}
          </div>
        </div>

        {/* Task list */}
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {taskFilter === 'home' ? (
            <>
              {renderSection('Overdue', overdue, 'text-red-500')}
              {renderSection('Today', dueToday, 'text-blue-500')}
              {renderSection('Upcoming', upcoming)}
              {renderSection('No due date', noDue)}
              {renderSection('Completed today', doneToday)}
            </>
          ) : taskFilter === 'all' || taskFilter === 'open' ? (
            <>
              {renderSection('Overdue', overdue, 'text-red-500')}
              {renderSection('Today', dueToday, 'text-blue-500')}
              {renderSection('Upcoming', upcoming)}
              {renderSection('No due date', noDue)}
              {taskFilter === 'all' && renderSection('Done', done)}
            </>
          ) : taskFilter === 'done' ? (
            renderSection('Completed', done)
          ) : taskFilter === 'favorites' ? (
            tasks.length > 0 ? tasks.map(t => (
              <TaskRow
                key={t.id}
                task={t}
                onToggle={() => handleToggleTask(t.id)}
                onEdit={() => setEditingTask(t)}
                onDelete={() => setDeleteTarget({ type: 'task', id: t.id, title: t.title })}
                onToggleFavorite={() => handleToggleFavorite(t.id)}
              />
            )) : null
          ) : null}

          {!loading && (taskFilter === 'home' ? visibleTasks : tasks).length === 0 && (
            <div className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">
              No tasks yet. Add one above!
            </div>
          )}
        </div>
      </>
    );
  };

  // ── Render Projects Tab ────────────────────────────────────────

  const renderProjectDetail = () => {
    if (!activeProjectData) return <div className="p-8 text-center text-gray-400">Loading...</div>;
    const p = activeProjectData;
    return (
      <div>
        {/* Back + header */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
          <button onClick={() => { setActiveProject(null); setActiveProjectData(null); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {p.hex_color && <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.hex_color }} />}
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">{p.title}</h3>
            </div>
            {p.description && <p className="text-xs text-gray-400 mt-0.5">{p.description}</p>}
          </div>
          <button
            onClick={() => setEditingProject(projects.find(pr => pr.id === activeProject) || null)}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            Edit
          </button>
        </div>

        {/* Quick add for project */}
        <QuickAddBar
          value={quickAdd}
          onChange={setQuickAdd}
          onSubmit={handleQuickAdd}
          placeholder="Add a task to this project..."
        />

        {/* Tasks in project */}
        {(p.tasks || []).length > 0 ? (
          <div>
            {(p.tasks as TaskItem[]).map(t => (
              <TaskRow
                key={t.id}
                task={t}
                onToggle={() => handleToggleTask(t.id)}
                onEdit={() => setEditingTask(t)}
                onDelete={() => setDeleteTarget({ type: 'task', id: t.id, title: t.title })}
                onToggleFavorite={() => handleToggleFavorite(t.id)}
              />
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">
            No tasks in this project yet.
          </div>
        )}
      </div>
    );
  };

  const renderProjects = () => {
    if (activeProject) return renderProjectDetail();

    return (
      <div className="p-4">
        <div className="flex justify-between items-center mb-4">
          <span className="text-sm text-gray-500 dark:text-gray-400">{projects.length} project{projects.length !== 1 ? 's' : ''}</span>
          <button
            onClick={() => setEditingProject('new')}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            + New Project
          </button>
        </div>
        <div className="grid gap-3">
          {projects.map(p => (
            <div
              key={p.id}
              onClick={() => setActiveProject(p.id)}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer bg-white dark:bg-gray-800"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {p.hex_color && <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.hex_color }} />}
                  <span className="font-medium text-gray-900 dark:text-gray-100">{p.title}</span>
                </div>
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <button onClick={() => api.toggleProjectFavorite(p.id).then(loadProjects)} className={`text-sm ${p.is_favorite ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'}`}>
                    ★
                  </button>
                  <button onClick={() => setEditingProject(p)} className="text-xs text-gray-400 hover:text-gray-600">
                    Edit
                  </button>
                  <button onClick={() => setDeleteTarget({ type: 'project', id: p.id, title: p.title })} className="text-xs text-red-400 hover:text-red-600">
                    Delete
                  </button>
                </div>
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500">
                {p.open_tasks} open · {p.done_tasks} done
              </div>
            </div>
          ))}
          {projects.length === 0 && (
            <div className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">
              No projects yet. Create one to organize your tasks!
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Render Labels Tab ──────────────────────────────────────────

  const renderLabels = () => (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm text-gray-500 dark:text-gray-400">{labels.length} label{labels.length !== 1 ? 's' : ''}</span>
        <button
          onClick={() => setEditingLabel('new')}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          + New Label
        </button>
      </div>
      <div className="space-y-1">
        {labels.map(l => (
          <div
            key={l.id}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer group"
            onClick={() => { setTab('overview'); setFilterLabel(l.id); setTaskFilter('all'); }}
          >
            <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: l.hex_color || '#e2e8f0' }} />
            <span className="flex-1 text-sm text-gray-900 dark:text-gray-100">{l.title}</span>
            <span className="text-xs text-gray-400">{l.task_count || 0} task{(l.task_count || 0) !== 1 ? 's' : ''}</span>
            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
              <button onClick={() => setEditingLabel(l)} className="text-xs text-gray-400 hover:text-gray-600">
                Edit
              </button>
              <button onClick={() => setDeleteTarget({ type: 'label', id: l.id, title: l.title })} className="text-xs text-red-400 hover:text-red-600">
                Delete
              </button>
            </div>
          </div>
        ))}
        {labels.length === 0 && (
          <div className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">
            No labels yet. Create one to categorize your tasks!
          </div>
        )}
      </div>
    </div>
  );

  // ── Main Render ────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="container mx-auto px-4 sm:px-16 py-8">
        {error && (
          <div className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg px-4 py-3 mb-4 text-sm flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">×</button>
          </div>
        )}

        {/* Header card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Todo</h1>
            <div className="flex gap-1.5">
              {(['overview', 'projects', 'labels'] as ActiveTab[]).map(t => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setActiveProject(null); setActiveProjectData(null); setFilterLabel(null); }}
                  className={`px-3 py-1.5 text-sm rounded border transition-colors capitalize ${
                    tab === t
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-gray-400'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6" />

        {/* Content card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
          {loading ? (
            <div className="py-12 text-center text-gray-400">Loading...</div>
          ) : (
            <>
              {tab === 'overview' && renderOverview()}
              {tab === 'projects' && renderProjects()}
              {tab === 'labels' && renderLabels()}
            </>
          )}
        </div>

        {/* + New Task FAB for overview */}
        {tab === 'overview' && !editingTask && (
          <button
            onClick={() => setEditingTask('new')}
            className="fixed bottom-20 right-6 w-12 h-12 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 flex items-center justify-center text-2xl z-30"
          >
            +
          </button>
        )}
      </div>

      {/* Modals */}
      {editingTask && (
        <TaskEditModal
          task={editingTask === 'new' ? null : editingTask}
          projects={projects}
          labels={labels}
          onSave={handleSaveTask}
          onClose={() => setEditingTask(null)}
        />
      )}

      {editingLabel && (
        <LabelEditModal
          label={editingLabel === 'new' ? null : editingLabel}
          onSave={handleSaveLabel}
          onClose={() => setEditingLabel(null)}
        />
      )}

      {editingProject && (
        <ProjectEditModal
          project={editingProject === 'new' ? null : editingProject}
          onSave={handleSaveProject}
          onClose={() => setEditingProject(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title={`Delete ${deleteTarget.type}`}
          message={`Are you sure you want to delete "${deleteTarget.title}"? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
