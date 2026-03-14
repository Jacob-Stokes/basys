import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import { useModKeySubmit } from '../hooks/useModKeySubmit';
import {
  AgentActionItem, AgentActionConfig, STATUS_COLORS,
  CONFIG_OPTIONS, MODEL_OPTIONS,
  parseConfig, formatDuration, formatCost, formatTokens, parseFilesChanged,
} from '../utils/agentActions';

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

  // ── Agent Actions ───────────────────────────────────────────────
  const [agentActions, setAgentActions] = useState<AgentActionItem[]>([]);
  const [newActionTitle, setNewActionTitle] = useState('');
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  const [editingActionDesc, setEditingActionDesc] = useState<string | null>(null);
  const [actionDescDraft, setActionDescDraft] = useState('');
  const [actionTemplates, setActionTemplates] = useState<any[]>([]);
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);

  useEffect(() => {
    if (isEdit && task?.id) {
      api.getAgentActions(task.id).then(setAgentActions).catch(() => {});
      api.getActionTemplates().then(setActionTemplates).catch(() => {});
    }
  }, [isEdit, task?.id]);

  const handleAddAgentAction = async () => {
    if (!newActionTitle.trim() || !task?.id) return;
    try {
      const action = await api.createAgentAction(task.id, { title: newActionTitle.trim() });
      setAgentActions(prev => [...prev, action]);
      setNewActionTitle('');
    } catch (err) { console.error('Failed to add agent action:', err); }
  };

  const handleToggleStaging = async (action: AgentActionItem) => {
    if (!task?.id || (action.status !== 'draft' && action.status !== 'staged')) return;
    try {
      const newStatus = action.status === 'draft' ? 'staged' : 'draft';
      const updated = await api.updateAgentActionStatus(task.id, action.id, { status: newStatus });
      setAgentActions(prev => prev.map(a => a.id === action.id ? updated : a));
    } catch (err) { console.error('Failed to toggle staging:', err); }
  };

  const handleDeleteAgentAction = async (actionId: string) => {
    if (!task?.id) return;
    try {
      await api.deleteAgentAction(task.id, actionId);
      setAgentActions(prev => prev.filter(a => a.id !== actionId));
    } catch (err) { console.error('Failed to delete agent action:', err); }
  };

  const handleSaveActionDesc = async (action: AgentActionItem) => {
    if (!task?.id) return;
    try {
      const updated = await api.updateAgentAction(task.id, action.id, { description: actionDescDraft || null });
      setAgentActions(prev => prev.map(a => a.id === action.id ? updated : a));
      setEditingActionDesc(null);
    } catch (err) { console.error('Failed to save description:', err); }
  };

  const handleRunAction = async (action: AgentActionItem) => {
    if (!task?.id || action.status !== 'staged') return;
    // Check dependency
    if (action.depends_on) {
      const dep = agentActions.find(a => a.id === action.depends_on);
      if (dep && dep.status !== 'done') {
        alert(`Blocked by: ${dep.title} (${dep.status})`);
        return;
      }
    }
    try {
      const updated = await api.updateAgentActionStatus(task.id, action.id, { status: 'running' });
      setAgentActions(prev => prev.map(a => a.id === action.id ? updated : a));
    } catch (err: any) {
      alert(err.message || 'Failed to run action');
    }
  };

  const handleUpdateConfig = async (action: AgentActionItem, newConfig: AgentActionConfig) => {
    if (!task?.id) return;
    try {
      const updated = await api.updateAgentAction(task.id, action.id, { config: JSON.stringify(newConfig) });
      setAgentActions(prev => prev.map(a => a.id === action.id ? updated : a));
    } catch (err) { console.error('Failed to update config:', err); }
  };

  const handleSetDependency = async (action: AgentActionItem, dependsOn: string | null) => {
    if (!task?.id) return;
    try {
      const updated = await api.updateAgentAction(task.id, action.id, { depends_on: dependsOn });
      setAgentActions(prev => prev.map(a => a.id === action.id ? updated : a));
    } catch (err) { console.error('Failed to set dependency:', err); }
  };

  const handleAddFromTemplate = async (template: any) => {
    if (!task?.id) return;
    try {
      const action = await api.createAgentAction(task.id, { title: template.title, description: template.description || undefined });
      if (template.default_config) {
        const updated = await api.updateAgentAction(task.id, action.id, { config: template.default_config });
        setAgentActions(prev => [...prev, updated]);
      } else {
        setAgentActions(prev => [...prev, action]);
      }
      setShowTemplateDropdown(false);
    } catch (err) { console.error('Failed to add from template:', err); }
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
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
            {/* Agent Actions */}
            {isEdit && (
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                    </svg>
                    Agent Actions
                    {agentActions.length > 0 && (
                      <span className="text-gray-400">
                        ({agentActions.filter(a => a.status === 'staged').length} staged / {agentActions.length})
                        {(() => { const totalCost = agentActions.reduce((s, a) => s + (a.cost_cents || 0), 0); return totalCost > 0 ? ` — ${formatCost(totalCost)}` : ''; })()}
                      </span>
                    )}
                  </span>
                </label>
                {agentActions.length > 0 && (
                  <div className="space-y-1 mb-2">
                    {agentActions.map(action => {
                      const config = parseConfig(action.config);
                      const depAction = action.depends_on ? agentActions.find(a => a.id === action.depends_on) : null;
                      const isBlocked = depAction ? depAction.status !== 'done' : false;
                      return (
                      <div key={action.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                        <div className="flex items-center gap-2 px-2 py-1.5 group">
                          {/* Staging checkbox */}
                          {(action.status === 'draft' || action.status === 'staged') && (
                            <button type="button" onClick={() => handleToggleStaging(action)}
                              className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                                action.status === 'staged' ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                              }`}>
                              {action.status === 'staged' && (
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                          )}
                          {action.status === 'running' && (
                            <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                            </span>
                          )}
                          {(action.status === 'done' || action.status === 'failed') && (
                            <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                              {action.status === 'done' ? (
                                <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              ) : (
                                <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                </svg>
                              )}
                            </span>
                          )}

                          {/* Blocked indicator */}
                          {isBlocked && (
                            <span className="text-gray-400" title={`Blocked by: ${depAction?.title}`}>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                              </svg>
                            </span>
                          )}

                          {/* Title */}
                          <span className="text-sm flex-1 text-gray-900 dark:text-gray-100 truncate">{action.title}</span>

                          {/* Config indicators */}
                          {config.plan_mode && <span className="text-[9px] px-1 py-0.5 rounded bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400">plan</span>}
                          {config.use_worktree && <span className="text-[9px] px-1 py-0.5 rounded bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400">worktree</span>}
                          {config.model_override && <span className="text-[9px] px-1 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">{config.model_override}</span>}

                          {/* Status badge */}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[action.status]}`}>
                            {action.status}
                          </span>

                          {/* Run button (staged only, not blocked) */}
                          {action.status === 'staged' && (
                            <button type="button" onClick={() => handleRunAction(action)}
                              disabled={isBlocked}
                              className={`p-0.5 transition-colors ${isBlocked ? 'text-gray-300 cursor-not-allowed' : 'text-green-500 hover:text-green-700'}`}
                              title={isBlocked ? `Blocked by: ${depAction?.title}` : 'Run action'}>
                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </button>
                          )}

                          {/* Expand toggle */}
                          <button type="button" onClick={() => setExpandedAction(expandedAction === action.id ? null : action.id)}
                            className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                            <svg className={`w-3 h-3 transition-transform ${expandedAction === action.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>

                          {/* Delete */}
                          {(action.status === 'draft' || action.status === 'staged') && (
                            <button type="button" onClick={() => handleDeleteAgentAction(action.id)}
                              className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-0.5">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>

                        {/* Expanded detail */}
                        {expandedAction === action.id && (
                          <div className="px-3 pb-2 pt-1 border-t border-gray-100 dark:border-gray-700 space-y-2 bg-gray-50/50 dark:bg-gray-800/50">
                            {/* Description */}
                            {editingActionDesc === action.id ? (
                              <div className="space-y-1">
                                <textarea value={actionDescDraft} onChange={e => setActionDescDraft(e.target.value)}
                                  rows={3} placeholder="Instructions for the agent..."
                                  className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none focus:ring-1 focus:ring-blue-500" />
                                <div className="flex gap-1">
                                  <button type="button" onClick={() => handleSaveActionDesc(action)}
                                    className="px-2 py-0.5 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
                                  <button type="button" onClick={() => setEditingActionDesc(null)}
                                    className="px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-700">Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <div className="cursor-pointer" onClick={() => { setEditingActionDesc(action.id); setActionDescDraft(action.description || ''); }}>
                                {action.description ? (
                                  <p className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{action.description}</p>
                                ) : (
                                  <p className="text-xs text-gray-400 dark:text-gray-500 italic">Click to add instructions...</p>
                                )}
                              </div>
                            )}

                            {/* Config checkboxes (draft/staged only) */}
                            {(action.status === 'draft' || action.status === 'staged') && (
                              <div className="space-y-1.5">
                                <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">Config</span>
                                <div className="grid grid-cols-2 gap-1.5">
                                  {CONFIG_OPTIONS.map(opt => (
                                    <label key={opt.key} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 cursor-pointer" title={opt.description}>
                                      <input type="checkbox" checked={!!config[opt.key]}
                                        onChange={e => handleUpdateConfig(action, { ...config, [opt.key]: e.target.checked })}
                                        className="w-3 h-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                                      {opt.label}
                                    </label>
                                  ))}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-500 dark:text-gray-400">Model:</span>
                                  <select value={config.model_override || ''} onChange={e => handleUpdateConfig(action, { ...config, model_override: (e.target.value || null) as any })}
                                    className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                                    {MODEL_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                  </select>
                                </div>
                              </div>
                            )}

                            {/* Dependency selector */}
                            {(action.status === 'draft' || action.status === 'staged') && agentActions.length > 1 && (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">Depends on:</span>
                                <select value={action.depends_on || ''} onChange={e => handleSetDependency(action, e.target.value || null)}
                                  className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 flex-1">
                                  <option value="">None</option>
                                  {agentActions.filter(a => a.id !== action.id).map(a => (
                                    <option key={a.id} value={a.id}>{a.title}</option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {/* Result (if done/failed) */}
                            {action.result && (
                              <div>
                                <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">Result</span>
                                <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5 whitespace-pre-wrap bg-white dark:bg-gray-800 rounded p-2 border border-gray-200 dark:border-gray-700">
                                  {action.result}
                                </p>
                              </div>
                            )}
                            {action.error && (
                              <div>
                                <span className="text-[10px] text-red-400 uppercase tracking-wider">Error</span>
                                <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 whitespace-pre-wrap bg-red-50 dark:bg-red-900/20 rounded p-2 border border-red-200 dark:border-red-800">
                                  {action.error}
                                </p>
                              </div>
                            )}

                            {/* Enhanced Metadata */}
                            {(action.commit_hash || action.agent_model || action.completed_at || action.tokens_in || action.cost_cents) && (
                              <div className="space-y-1">
                                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-400 dark:text-gray-500">
                                  {action.agent_model && <span>Model: <span className="text-gray-600 dark:text-gray-300">{action.agent_model}</span></span>}
                                  {formatDuration(action.started_at, action.completed_at) && (
                                    <span>Duration: <span className="text-gray-600 dark:text-gray-300">{formatDuration(action.started_at, action.completed_at)}</span></span>
                                  )}
                                  {action.completed_at && <span>Completed: <span className="text-gray-600 dark:text-gray-300">{new Date(action.completed_at).toLocaleString()}</span></span>}
                                </div>
                                {(action.tokens_in || action.cost_cents) && (
                                  <div className="flex flex-wrap gap-x-3 text-[10px] text-gray-400 dark:text-gray-500">
                                    {formatTokens(action.tokens_in, action.tokens_out) && <span>Tokens: <span className="text-gray-600 dark:text-gray-300">{formatTokens(action.tokens_in, action.tokens_out)}</span></span>}
                                    {action.cost_cents != null && action.cost_cents > 0 && <span>Cost: <span className="text-gray-600 dark:text-gray-300">{formatCost(action.cost_cents)}</span></span>}
                                  </div>
                                )}
                                {action.commit_hash && (
                                  <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500">
                                    <span>Commit:</span>
                                    <code className="font-mono text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded select-all">{action.commit_hash.slice(0, 7)}</code>
                                    <button type="button" onClick={() => navigator.clipboard.writeText(action.commit_hash!)} className="text-gray-400 hover:text-blue-500" title="Copy hash">
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>
                                    </button>
                                  </div>
                                )}
                                {parseFilesChanged(action.files_changed).length > 0 && (
                                  <div className="text-[10px]">
                                    <span className="text-gray-400 dark:text-gray-500">Files changed ({parseFilesChanged(action.files_changed).length}):</span>
                                    <div className="mt-0.5 font-mono text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded p-1.5 max-h-20 overflow-y-auto">
                                      {parseFilesChanged(action.files_changed).map((f, i) => <div key={i} className="truncate">{f}</div>)}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ); })}
                  </div>
                )}
                <div className="flex gap-2">
                  <input type="text" value={newActionTitle} onChange={e => setNewActionTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddAgentAction(); } }}
                    placeholder="Add agent action..."
                    className="flex-1 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm placeholder-gray-400" />
                  {actionTemplates.length > 0 && (
                    <div className="relative">
                      <button type="button" onClick={() => setShowTemplateDropdown(!showTemplateDropdown)}
                        className="px-2 py-1.5 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-500"
                        title="Add from template">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                        </svg>
                      </button>
                      {showTemplateDropdown && (
                        <div className="absolute bottom-full right-0 mb-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 py-1 max-h-48 overflow-y-auto">
                          {actionTemplates.map(t => (
                            <button key={t.id} type="button" onClick={() => handleAddFromTemplate(t)}
                              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 truncate">
                              {t.title}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <button type="button" onClick={handleAddAgentAction} disabled={!newActionTitle.trim()}
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
