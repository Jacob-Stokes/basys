import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import { useModKeySubmit } from '../hooks/useModKeySubmit';

// ── Types ──────────────────────────────────────────────────────────

export interface TaskRelationItem {
  id: string;
  relation_kind: string;
  other_task_id: string;
  other_task_title: string;
  other_task_done: number;
  other_task_priority: number;
  created_at: string;
  is_inverse?: boolean;
}

export interface TaskLinkItem {
  task_id: string;
  target_type: 'goal' | 'subgoal' | 'habit' | 'pomodoro';
  target_id: string;
  target_title: string;
}

export interface LabelItem {
  id: string;
  title: string;
  hex_color: string;
  description: string | null;
}

export interface ProjectItem {
  id: string;
  title: string;
  hex_color: string;
}

export interface ColumnItem {
  id: string;
  title: string;
}

export interface ChecklistItem {
  id: string;
  title: string;
  done: number;
  position: number;
}

export interface TaskData {
  id?: string;
  title: string;
  description?: string | null;
  due_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  priority?: number;
  repeat_after?: number;
  repeat_mode?: number;
  project_id?: string | null;
  labels?: LabelItem[];
  links?: TaskLinkItem[];
  relations?: TaskRelationItem[];
  task_type?: string | null;
  assignee_name?: string | null;
  bucket_id?: string | null;
  checklist?: ChecklistItem[];
}

// ── Constants ──────────────────────────────────────────────────────

export const RELATION_KINDS = [
  { value: 'subtask', label: 'Subtask', emoji: '📎' },
  { value: 'parent', label: 'Parent', emoji: '📂' },
  { value: 'related', label: 'Related', emoji: '🔗' },
  { value: 'duplicates', label: 'Duplicate', emoji: '📋' },
  { value: 'blocking', label: 'Blocking', emoji: '🚫' },
  { value: 'blocked_by', label: 'Blocked by', emoji: '⛔' },
  { value: 'precedes', label: 'Precedes', emoji: '⏩' },
  { value: 'follows', label: 'Follows', emoji: '⏪' },
  { value: 'copied_from', label: 'Copied from', emoji: '📥' },
  { value: 'copied_to', label: 'Copied to', emoji: '📤' },
];

export function relationDisplay(kind: string) {
  return RELATION_KINDS.find(k => k.value === kind) || { value: kind, label: kind, emoji: '🔗' };
}

const linkEmoji = (type: string) =>
  type === 'goal' ? '🎯' : type === 'subgoal' ? '📌' : type === 'habit' ? '✅' : '🍅';

// ── Component ──────────────────────────────────────────────────────

interface TaskEditModalProps {
  task: TaskData | null; // null = creating new task
  onSave: (data: any) => void;
  onClose: () => void;
  // Optional context: show/hide sections based on context
  projects?: ProjectItem[];
  labels?: LabelItem[];
  columns?: ColumnItem[];
  showProjectSelector?: boolean;
  showLabels?: boolean;
  showLinks?: boolean;
  showRelations?: boolean;
  showRepeat?: boolean;
  showTaskType?: boolean;
  showAssignee?: boolean;
  showColumnSelector?: boolean;
  showDates?: boolean;
  showChecklist?: boolean;
}

export default function TaskEditModal({
  task,
  onSave,
  onClose,
  projects = [],
  labels = [],
  columns = [],
  showProjectSelector = false,
  showLabels = false,
  showLinks = false,
  showRelations = true,
  showRepeat = false,
  showTaskType = false,
  showAssignee = false,
  showColumnSelector = false,
  showDates = true,
  showChecklist = true,
}: TaskEditModalProps) {
  const isEdit = !!task?.id;

  // ── Core fields ──────────────────────────────────────────────────
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const toInputVal = (v: string | null | undefined) => {
    if (!v) return '';
    if (v.includes('T')) return v.slice(0, 16);
    return v + 'T00:00';
  };
  const [dueDate, setDueDate] = useState(toInputVal(task?.due_date));
  const [startDate, setStartDate] = useState(toInputVal(task?.start_date));
  const [endDate, setEndDate] = useState(toInputVal(task?.end_date));
  const [priority, setPriority] = useState(task?.priority || 0);
  const [repeatAfter, setRepeatAfter] = useState(task?.repeat_after || 0);
  const [projectId, setProjectId] = useState(task?.project_id || '');
  const [taskType, setTaskType] = useState(task?.task_type || '');
  const [assigneeName, setAssigneeName] = useState(task?.assignee_name || '');
  const [bucketId, setBucketId] = useState(task?.bucket_id || '');

  // ── Labels ──────────────────────────────────────────────────────
  const [selectedLabels, setSelectedLabels] = useState<string[]>(
    task?.labels?.map(l => l.id) || []
  );
  const toggleLabel = (labelId: string) => {
    setSelectedLabels(prev =>
      prev.includes(labelId) ? prev.filter(l => l !== labelId) : [...prev, labelId]
    );
  };

  // ── Links ───────────────────────────────────────────────────────
  const [selectedLinks, setSelectedLinks] = useState<{ target_type: string; target_id: string; target_title: string }[]>(
    task?.links?.map(l => ({ target_type: l.target_type, target_id: l.target_id, target_title: l.target_title })) || []
  );
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [linkType, setLinkType] = useState<string>('goal');
  const [linkQuery, setLinkQuery] = useState('');
  const [linkResults, setLinkResults] = useState<{ id: string; title: string }[]>([]);
  const [linkDropdownOpen, setLinkDropdownOpen] = useState(false);
  const linkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // ── Relations ───────────────────────────────────────────────────
  const [relations, setRelations] = useState<TaskRelationItem[]>(task?.relations || []);
  const [showRelPicker, setShowRelPicker] = useState(false);
  const [relKind, setRelKind] = useState('related');
  const [relQuery, setRelQuery] = useState('');
  const [relResults, setRelResults] = useState<{ id: string; title: string }[]>([]);
  const [relDropdownOpen, setRelDropdownOpen] = useState(false);
  const relTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch relations on mount if editing and we don't have them preloaded
  useEffect(() => {
    if (isEdit && task?.id && (!task.relations || task.relations.length === 0)) {
      api.getTaskRelations(task.id).then(setRelations).catch(() => {});
    }
  }, [isEdit, task?.id]);

  useEffect(() => {
    if (relTimerRef.current) clearTimeout(relTimerRef.current);
    if (!showRelPicker || !relQuery.trim()) { setRelResults([]); setRelDropdownOpen(false); return; }
    relTimerRef.current = setTimeout(async () => {
      try {
        const tasks = await api.getTasks({ search: relQuery.trim() });
        const filtered = tasks
          .filter((t: any) => t.id !== task?.id && !relations.some(r => r.other_task_id === t.id && r.relation_kind === relKind))
          .slice(0, 10)
          .map((t: any) => ({ id: t.id, title: t.title }));
        setRelResults(filtered);
        setRelDropdownOpen(filtered.length > 0);
      } catch { setRelResults([]); setRelDropdownOpen(false); }
    }, 300);
    return () => { if (relTimerRef.current) clearTimeout(relTimerRef.current); };
  }, [relQuery, showRelPicker, relKind]);

  const addRelation = async (target: { id: string; title: string }) => {
    if (!task?.id) return;
    try {
      const updated = await api.addTaskRelation(task.id, target.id, relKind);
      setRelations(updated);
      setRelQuery(''); setRelResults([]); setRelDropdownOpen(false); setShowRelPicker(false);
    } catch (err) { console.error('Failed to add relation:', err); }
  };

  const removeRelation = async (relationId: string) => {
    if (!task?.id) return;
    try {
      await api.deleteTaskRelation(task.id, relationId);
      setRelations(prev => prev.filter(r => r.id !== relationId));
    } catch (err) { console.error('Failed to remove relation:', err); }
  };

  // ── Checklist ───────────────────────────────────────────────────
  const [checklist, setChecklist] = useState<ChecklistItem[]>(task?.checklist || []);
  const [newCheckItem, setNewCheckItem] = useState('');

  useEffect(() => {
    if (isEdit && task?.id) {
      api.getTaskChecklist(task.id).then(setChecklist).catch(() => {});
    }
  }, [isEdit, task?.id]);

  const handleAddCheckItem = async () => {
    if (!newCheckItem.trim() || !task?.id) return;
    try {
      const item = await api.addChecklistItem(task.id, newCheckItem.trim());
      setChecklist(prev => [...prev, item]);
      setNewCheckItem('');
    } catch (err) { console.error('Failed to add checklist item:', err); }
  };

  const handleToggleCheckItem = async (item: ChecklistItem) => {
    if (!task?.id) return;
    try {
      const updated = await api.updateChecklistItem(task.id, item.id, { done: item.done ? 0 : 1 });
      setChecklist(prev => prev.map(c => c.id === item.id ? updated : c));
    } catch (err) { console.error('Failed to toggle checklist item:', err); }
  };

  const handleDeleteCheckItem = async (itemId: string) => {
    if (!task?.id) return;
    try {
      await api.deleteChecklistItem(task.id, itemId);
      setChecklist(prev => prev.filter(c => c.id !== itemId));
    } catch (err) { console.error('Failed to delete checklist item:', err); }
  };

  // ── Submit ──────────────────────────────────────────────────────
  const doSubmit = () => {
    if (!title.trim()) return;
    const data: any = {
      title: title.trim(),
      description: description || null,
      due_date: dueDate || null,
      priority,
    };
    if (showDates) {
      data.start_date = startDate || null;
      data.end_date = endDate || null;
    }
    if (showRepeat) {
      data.repeat_after = repeatAfter;
      data.repeat_mode = 0;
    }
    if (showProjectSelector) {
      data.project_id = projectId || null;
    }
    if (showLabels) {
      data.labels = selectedLabels;
    }
    if (showLinks) {
      data.links = selectedLinks.map(l => ({ target_type: l.target_type, target_id: l.target_id }));
    }
    if (showTaskType) {
      data.task_type = taskType || null;
    }
    if (showAssignee) {
      data.assignee_name = assigneeName || null;
    }
    if (showColumnSelector) {
      data.bucket_id = bucketId || null;
    }
    onSave(data);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSubmit();
  };

  useModKeySubmit(true, doSubmit, !!title.trim());

  // ── Render helpers ──────────────────────────────────────────────

  const renderSearchDropdown = (
    results: { id: string; title: string }[],
    isOpen: boolean,
    onSelect: (item: { id: string; title: string }) => void,
    onClose: () => void,
  ) => {
    if (!isOpen || results.length === 0) return null;
    return (
      <>
        <div className="fixed inset-0 z-10" onClick={onClose} />
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-700 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 z-20 max-h-48 overflow-y-auto">
          {results.map(r => (
            <button key={r.id} type="button" onClick={() => onSelect(r)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100">
              {r.title}
            </button>
          ))}
        </div>
      </>
    );
  };

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          {/* Title */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <input
              type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Task title..."
              className="w-full text-lg font-medium bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400"
              autoFocus
            />
          </div>

          <div className="p-4 space-y-3">
            {/* Description */}
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Description</label>
              <textarea
                value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Description (optional)" rows={2}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Row 1: Due date + Priority */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Due date</label>
                <input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Priority</label>
                <select value={priority} onChange={e => setPriority(Number(e.target.value))}
                  className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
                  <option value={0}>None</option>
                  <option value={1}>Low</option>
                  <option value={2}>Medium</option>
                  <option value={3}>High</option>
                  <option value={4}>Urgent</option>
                </select>
              </div>
            </div>

            {/* Start/End dates */}
            {showDates && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Start date</label>
                  <input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">End date</label>
                  <input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm" />
                </div>
              </div>
            )}

            {/* Task type + Assignee (sprint context) */}
            {(showTaskType || showAssignee) && (
              <div className="grid grid-cols-2 gap-3">
                {showTaskType && (
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Type</label>
                    <select value={taskType} onChange={e => setTaskType(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
                      <option value="">None</option>
                      <option value="task">Task</option>
                      <option value="bug">Bug</option>
                      <option value="feature">Feature</option>
                      <option value="chore">Chore</option>
                    </select>
                  </div>
                )}
                {showAssignee && (
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Assignee</label>
                    <input type="text" value={assigneeName} onChange={e => setAssigneeName(e.target.value)}
                      placeholder="Name..."
                      className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm placeholder-gray-400" />
                  </div>
                )}
              </div>
            )}

            {/* Column selector */}
            {showColumnSelector && columns.length > 0 && (
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Column</label>
                <select value={bucketId} onChange={e => setBucketId(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
                  <option value="">Backlog</option>
                  {columns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
            )}

            {/* Repeat */}
            {showRepeat && (
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Repeat</label>
                <select value={repeatAfter} onChange={e => setRepeatAfter(Number(e.target.value))}
                  className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
                  <option value={0}>No repeat</option>
                  <option value={3600}>Every hour</option>
                  <option value={86400}>Every day</option>
                  <option value={259200}>Every 3 days</option>
                  <option value={604800}>Every week</option>
                  <option value={1209600}>Every 2 weeks</option>
                  <option value={2592000}>Every month</option>
                  <option value={7776000}>Every 3 months</option>
                  <option value={31536000}>Every year</option>
                </select>
              </div>
            )}

            {/* Project selector */}
            {showProjectSelector && projects.length > 0 && (
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Project</label>
                <select value={projectId} onChange={e => setProjectId(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
                  <option value="">No project</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>
            )}

            {/* Labels */}
            {showLabels && labels.length > 0 && (
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Labels</label>
                <div className="flex flex-wrap gap-1.5">
                  {labels.map(l => {
                    const selected = selectedLabels.includes(l.id);
                    return (
                      <button key={l.id} type="button" onClick={() => toggleLabel(l.id)}
                        className={`px-2 py-1 text-xs rounded-full border transition-all ${
                          selected ? 'ring-2 ring-blue-400 ring-offset-1 dark:ring-offset-gray-800' : 'opacity-60 hover:opacity-100'
                        }`}
                        style={{
                          backgroundColor: l.hex_color || '#e2e8f0',
                          color: l.hex_color && !['#e2e8f0', '#ffffff', ''].includes(l.hex_color.toLowerCase()) ? '#fff' : '#374151',
                          borderColor: 'transparent',
                        }}>
                        {l.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Links */}
            {showLinks && (
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Links</label>
                {selectedLinks.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedLinks.map(l => (
                      <span key={`${l.target_type}-${l.target_id}`}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                        {linkEmoji(l.target_type)} {l.target_title}
                        <button type="button" onClick={() => removeLink(l.target_type, l.target_id)} className="text-gray-400 hover:text-red-500 font-bold ml-0.5">×</button>
                      </span>
                    ))}
                  </div>
                )}
                {showLinkPicker ? (
                  <div className="flex gap-2 items-start">
                    <select value={linkType}
                      onChange={e => { setLinkType(e.target.value); setLinkQuery(''); setLinkResults([]); setLinkDropdownOpen(false); }}
                      className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
                      <option value="goal">🎯 Goal</option>
                      <option value="subgoal">📌 Sub-goal</option>
                      <option value="habit">✅ Habit</option>
                      <option value="pomodoro">🍅 Pomodoro</option>
                    </select>
                    <div className="flex-1 relative">
                      <input type="text" value={linkQuery} onChange={e => setLinkQuery(e.target.value)}
                        onFocus={() => { if (linkResults.length > 0) setLinkDropdownOpen(true); }}
                        placeholder={`Search ${linkType}s...`} autoFocus
                        className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm" />
                      {renderSearchDropdown(linkResults, linkDropdownOpen, addLink, () => setLinkDropdownOpen(false))}
                    </div>
                    <button type="button" onClick={() => { setShowLinkPicker(false); setLinkQuery(''); }}
                      className="px-2 py-1.5 text-sm text-gray-400 hover:text-gray-600">×</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowLinkPicker(true)}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700">+ Add Link</button>
                )}
              </div>
            )}

            {/* Relations */}
            {showRelations && isEdit && (
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Relations</label>
                {relations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {relations.map(r => {
                      const display = relationDisplay(r.relation_kind);
                      return (
                        <span key={`${r.id}-${r.relation_kind}-${r.other_task_id}`}
                          className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-700 ${
                            r.other_task_done ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300'
                          }`}>
                          {display.emoji} {display.label}: {r.other_task_title}
                          <button type="button" onClick={() => removeRelation(r.id)} className="text-gray-400 hover:text-red-500 font-bold ml-0.5">×</button>
                        </span>
                      );
                    })}
                  </div>
                )}
                {showRelPicker ? (
                  <div className="flex gap-2 items-start">
                    <select value={relKind}
                      onChange={e => { setRelKind(e.target.value); setRelQuery(''); setRelResults([]); setRelDropdownOpen(false); }}
                      className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
                      {RELATION_KINDS.map(k => <option key={k.value} value={k.value}>{k.emoji} {k.label}</option>)}
                    </select>
                    <div className="flex-1 relative">
                      <input type="text" value={relQuery} onChange={e => setRelQuery(e.target.value)}
                        onFocus={() => { if (relResults.length > 0) setRelDropdownOpen(true); }}
                        placeholder="Search tasks..." autoFocus
                        className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm" />
                      {renderSearchDropdown(relResults, relDropdownOpen, addRelation, () => setRelDropdownOpen(false))}
                    </div>
                    <button type="button" onClick={() => { setShowRelPicker(false); setRelQuery(''); }}
                      className="px-2 py-1.5 text-sm text-gray-400 hover:text-gray-600">×</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowRelPicker(true)}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700">+ Add Relation</button>
                )}
              </div>
            )}

            {/* Checklist */}
            {showChecklist && isEdit && (
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Checklist
                  {checklist.length > 0 && (
                    <span className="ml-1 text-gray-400">({checklist.filter(c => c.done).length}/{checklist.length})</span>
                  )}
                </label>
                {checklist.length > 0 && (
                  <div className="space-y-1 mb-2">
                    {checklist.map(item => (
                      <div key={item.id} className="flex items-center gap-2 group">
                        <button type="button" onClick={() => handleToggleCheckItem(item)}
                          className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                            item.done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 dark:border-gray-600 hover:border-green-400'
                          }`}>
                          {item.done ? (
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : null}
                        </button>
                        <span className={`text-sm flex-1 ${item.done ? 'line-through text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
                          {item.title}
                        </span>
                        <button type="button" onClick={() => handleDeleteCheckItem(item.id)}
                          className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-0.5">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input type="text" value={newCheckItem} onChange={e => setNewCheckItem(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCheckItem(); } }}
                    placeholder="Add checklist item..."
                    className="flex-1 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm placeholder-gray-400" />
                  <button type="button" onClick={handleAddCheckItem} disabled={!newCheckItem.trim()}
                    className="px-2 py-1.5 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50">Add</button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Cancel</button>
            <button type="submit" disabled={!title.trim()} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              {isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
