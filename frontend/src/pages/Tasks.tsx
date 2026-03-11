import { useState, useEffect, useRef, useMemo } from 'react';
import { api } from '../api/client';
import ConfirmModal from '../components/ConfirmModal';
import { parseTaskInput, formatParsedPreview } from '../utils/taskParser';
import Calendar from '../components/Calendar';

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

interface EventItem {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  all_day: number;
  color: string;
  location: string | null;
  source?: 'local' | 'google';
  html_link?: string | null;
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
  repeat_after: number;
  repeat_mode: number;
  project_id: string | null;
  project: { id: string; title: string; hex_color: string } | null;
  labels: LabelItem[];
  links: TaskLinkItem[];
}

type ActiveTab = 'overview' | 'projects' | 'labels';
type TaskFilter = 'home' | 'all' | 'open' | 'done' | 'favorites';

// ── Weather helpers ────────────────────────────────────────────────

function getWeatherIcon(code: number): JSX.Element {
  // Clear
  if (code === 0) return (
    <svg className="w-5 h-5 text-yellow-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
  // Partly cloudy
  if (code <= 3) return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
      <circle cx="9" cy="8" r="3" fill="#facc15" />
      <path d="M8 14a4 4 0 014-4h2a4 4 0 110 8H12a4 4 0 01-4-4z" fill="#9ca3af" />
    </svg>
  );
  // Fog
  if (code <= 48) return (
    <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 12h16M4 8h12M6 16h14" strokeLinecap="round" />
    </svg>
  );
  // Drizzle
  if (code <= 57) return (
    <svg className="w-5 h-5 text-blue-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M8 4a5 5 0 019.5 2H19a3 3 0 010 6H6a4 4 0 010-8z" fill="#d1d5db" stroke="none" />
      <path d="M10 15v2M14 15v2" strokeLinecap="round" />
    </svg>
  );
  // Rain
  if (code <= 67 || (code >= 80 && code <= 82)) return (
    <svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M8 4a5 5 0 019.5 2H19a3 3 0 010 6H6a4 4 0 010-8z" fill="#9ca3af" stroke="none" />
      <path d="M8 16v3M12 15v3M16 16v3" strokeLinecap="round" />
    </svg>
  );
  // Snow
  if (code <= 77 || (code >= 85 && code <= 86)) return (
    <svg className="w-5 h-5 text-blue-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M8 4a5 5 0 019.5 2H19a3 3 0 010 6H6a4 4 0 010-8z" fill="#d1d5db" stroke="none" />
      <circle cx="9" cy="17" r="1" fill="currentColor" /><circle cx="15" cy="17" r="1" fill="currentColor" /><circle cx="12" cy="20" r="1" fill="currentColor" />
    </svg>
  );
  // Thunderstorm
  return (
    <svg className="w-5 h-5 text-yellow-500" viewBox="0 0 24 24" fill="none">
      <path d="M8 4a5 5 0 019.5 2H19a3 3 0 010 6H6a4 4 0 010-8z" fill="#6b7280" />
      <path d="M13 13l-2 5h3l-2 5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function getWeatherDescription(code: number): string {
  if (code === 0) return 'Clear sky';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 48) return 'Fog';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Rain showers';
  if (code <= 86) return 'Snow showers';
  return 'Thunderstorm';
}

// ── Helpers ────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// Extract just the YYYY-MM-DD part from a due_date (handles both date-only and datetime strings)
function datePart(due: string): string {
  return due.slice(0, 10);
}

// Parse a due_date string correctly whether it has a time component or not
function parseDue(due: string): Date {
  // date-only strings like "2026-03-11" must be parsed as local time, not UTC
  return due.includes('T') ? new Date(due) : new Date(due + 'T00:00:00');
}

function relativeDue(due: string): string {
  const today = new Date(todayStr() + 'T00:00:00');
  const d = parseDue(due);
  const todayDate = datePart(due) === todayStr();
  const diff = Math.floor((new Date(datePart(due) + 'T00:00:00').getTime() - today.getTime()) / 86400000);
  const timeStr = due.includes('T')
    ? ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : '';
  if (diff < 0) return `${Math.abs(diff)}d overdue${timeStr}`;
  if (diff === 0) return `Today${timeStr}`;
  if (diff === 1) return `Tomorrow${timeStr}`;
  if (diff <= 7) return `${diff}d${timeStr}`;
  if (todayDate) return `Today${timeStr}`;
  return datePart(due) + timeStr;
}

function priorityColor(p: number): string {
  if (p >= 4) return '#ef4444'; // red-500
  if (p === 3) return '#f97316'; // orange-500
  if (p === 2) return '#3b82f6'; // blue-500
  if (p === 1) return '#9ca3af'; // gray-400
  return 'transparent';
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

// ── SyntaxHintModal ────────────────────────────────────────────────

function SyntaxHintModal({ onClose }: { onClose: () => void }) {
  const sections = [
    {
      title: 'Due date & time',
      color: 'text-blue-600 dark:text-blue-400',
      rows: [
        ['@today', 'Today'],
        ['@tomorrow / @tmr', 'Tomorrow'],
        ['@monday / @fri', 'Next weekday occurrence'],
        ['@next week / @next month', '+7 days / +1 month'],
        ['@in 3 days / @3d', '3 days from now'],
        ['@in 2 weeks / @2w', '2 weeks from now'],
        ['@end of week / @eow', 'Next Friday'],
        ['@end of month / @eom', 'Last day of month'],
        ['@Jan 5 / @jan5 / @5 jan', 'Jan 5 (this or next year)'],
        ['@Jan 5 2027', 'Jan 5, 2027'],
        ['@3/15', 'March 15 (M/D)'],
        ['@2026-03-15', 'ISO date'],
        ['@3pm / @9:30 / @14:00', 'Today at that time'],
        ['@tomorrow 3pm', 'Date + time'],
        ['@monday at 9:30am', 'Weekday + time'],
        ['@noon / @midnight', 'Today at noon / midnight'],
      ],
    },
    {
      title: 'Priority',
      color: 'text-orange-600 dark:text-orange-400',
      rows: [
        ['!1 / !low', 'Low priority'],
        ['!2 / !medium', 'Medium priority'],
        ['!3 / !high', 'High priority'],
        ['!4 / !urgent', 'Urgent'],
      ],
    },
    {
      title: 'Project',
      color: 'text-green-600 dark:text-green-400',
      rows: [
        ['#Work', 'Assign to project "Work"'],
        ['#"My Project"', 'Multi-word project name'],
      ],
    },
    {
      title: 'Labels',
      color: 'text-purple-600 dark:text-purple-400',
      rows: [
        ['~bug', 'Add label "bug"'],
        ['~"in progress"', 'Multi-word label'],
        ['~bug ~urgent', 'Multiple labels'],
      ],
    },
    {
      title: 'Repeating',
      color: 'text-teal-600 dark:text-teal-400',
      rows: [
        ['every day', 'Repeat daily'],
        ['every 3 days', 'Every 3 days'],
        ['every week', 'Repeat weekly'],
        ['every 2 weeks', 'Every 2 weeks'],
        ['every month', 'Repeat monthly'],
        ['every year', 'Repeat yearly'],
      ],
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Smart task syntax</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-5">
          {sections.map(s => (
            <div key={s.title}>
              <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${s.color}`}>{s.title}</h3>
              <table className="w-full text-sm">
                <tbody>
                  {s.rows.map(([syntax, desc]) => (
                    <tr key={syntax} className="border-b border-gray-100 dark:border-gray-700/50 last:border-0">
                      <td className="py-1.5 pr-4 font-mono text-xs text-gray-800 dark:text-gray-200 whitespace-nowrap">{syntax}</td>
                      <td className="py-1.5 text-gray-500 dark:text-gray-400">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          <p className="text-xs text-gray-400 dark:text-gray-500 pt-1">Combine any tokens: <span className="font-mono">Buy milk @tomorrow 9am !2 #Errands ~shopping</span></p>
        </div>
      </div>
    </div>
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
  const [showHint, setShowHint] = useState(false);
  const parsed = value.trim() ? parseTaskInput(value) : null;
  const preview = parsed ? formatParsedPreview(parsed) : [];

  return (
    <div className="px-3 pt-2 pb-4">
      {showHint && <SyntaxHintModal onClose={() => setShowHint(false)} />}
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
            placeholder={placeholder || 'Add a task... (@tomorrow, !2, #Project, ~label)'}
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
          />
          {preview.length > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              {preview.map((p, i) => (
                <span key={i} className="px-1.5 py-0.5 text-xs rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium">
                  {p}
                </span>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowHint(true)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0"
            title="Syntax help"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
          </button>
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
  const isOverdue = task.due_date && !task.done && datePart(task.due_date) < todayStr();

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
        {!!task.done && (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Priority dot */}
      {task.priority > 0 && (
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: priorityColor(task.priority) }} title={priorityLabel(task.priority)} />
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
          {task.repeat_after > 0 && (
            <span className="text-xs text-teal-500 dark:text-teal-400" title="Repeating task">↻</span>
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
  // datetime-local input needs value in "YYYY-MM-DDTHH:MM" format
  const toInputVal = (v: string) => {
    if (!v) return '';
    if (v.includes('T')) return v.slice(0, 16); // trim seconds
    return v + 'T00:00'; // date-only → add midnight
  };
  const [dueDate, setDueDate] = useState(toInputVal(task?.due_date || ''));
  const [priority, setPriority] = useState(task?.priority || 0);
  const [repeatAfter, setRepeatAfter] = useState(task?.repeat_after || 0);
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
      repeat_after: repeatAfter,
      repeat_mode: 0,
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
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Due date & time</label>
              <input
                type="datetime-local"
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

          {/* Repeat */}
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Repeat</label>
            <select
              value={repeatAfter}
              onChange={e => setRepeatAfter(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
            >
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

export default function Tasks({ initialTab = 'overview' }: { initialTab?: ActiveTab } = {}) {
  const [tab, setTab] = useState<ActiveTab>(initialTab);
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

  // User profile
  const [currentUser, setCurrentUser] = useState<{
    username: string;
    display_name: string | null;
    weather_latitude: number | null;
    weather_longitude: number | null;
    weather_location_name: string | null;
    timezone: string | null;
    use_browser_time: boolean;
    temperature_unit: string;
  } | null>(null);

  // Weather + time
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [weatherData, setWeatherData] = useState<{ temp: number; code: number; description: string } | null>(null);

  // Calendar + Events state
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [newEventInput, setNewEventInput] = useState('');

  const taskDates = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach(t => {
      if (t.due_date && !t.done) set.add(datePart(t.due_date));
    });
    return set;
  }, [tasks]);
  const eventDateColors = useMemo(() => {
    const map = new Map<string, string[]>();
    events.forEach(e => {
      const d = datePart(e.start_date);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(e.color || '#3b82f6');
    });
    return map;
  }, [events]);

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

  const loadEvents = async () => {
    try {
      const [local, google] = await Promise.all([
        api.getEvents(),
        api.getGoogleCalendarEvents().catch(() => []),
      ]);
      const localWithSource = local.map((e: any) => ({ ...e, source: 'local' as const }));
      const googleWithSource = google.map((e: any) => ({ ...e, source: 'google' as const }));
      setEvents([...localWithSource, ...googleWithSource]);
    } catch (err) {
      // events are non-critical — don't block the page
      console.warn('Failed to load events:', err);
    }
  };

  const handleAddEvent = async () => {
    const raw = newEventInput.trim();
    if (!raw) return;
    const parsed = parseTaskInput(raw);
    const title = parsed.title || raw;
    const start = parsed.due_date || new Date().toISOString().slice(0, 10);
    const allDay = !start.includes('T');
    try {
      await api.createEvent({ title, start_date: start, all_day: allDay });
      setNewEventInput('');
      loadEvents();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadTasks(), loadProjects(), loadLabels(), loadEvents(),
      api.getMe().then(u => setCurrentUser(u)).catch(() => {})
    ]);
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

  // Live clock — tick every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Weather fetch — on load + every 30 min
  const fetchWeather = async (lat: number, lon: number, unit: string) => {
    try {
      const resp = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=${unit === 'fahrenheit' ? 'fahrenheit' : 'celsius'}`
      );
      const data = await resp.json();
      if (data.current) {
        setWeatherData({
          temp: Math.round(data.current.temperature_2m),
          code: data.current.weather_code,
          description: getWeatherDescription(data.current.weather_code),
        });
      }
    } catch (err) {
      console.warn('Weather fetch failed:', err);
    }
  };

  useEffect(() => {
    if (currentUser?.weather_latitude != null && currentUser?.weather_longitude != null) {
      fetchWeather(currentUser.weather_latitude, currentUser.weather_longitude, currentUser.temperature_unit);
      const interval = setInterval(
        () => fetchWeather(currentUser.weather_latitude!, currentUser.weather_longitude!, currentUser.temperature_unit),
        30 * 60 * 1000
      );
      return () => clearInterval(interval);
    }
  }, [currentUser?.weather_latitude, currentUser?.weather_longitude, currentUser?.temperature_unit]);

  // ── Time helpers ────────────────────────────────────────────────

  const getUserTimezone = () => {
    return currentUser?.use_browser_time === false && currentUser?.timezone
      ? currentUser.timezone
      : undefined; // undefined = browser default
  };

  const formatTime = () => {
    return currentTime.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: getUserTimezone(),
    });
  };

  const getHourInTz = () => {
    return parseInt(
      new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: getUserTimezone() })
        .format(currentTime)
    );
  };

  // ── Handlers ───────────────────────────────────────────────────

  const handleQuickAdd = async () => {
    if (!quickAdd.trim()) return;
    try {
      const parsed = parseTaskInput(quickAdd);

      // Resolve project hint → project id (fuzzy match, case-insensitive)
      let resolvedProjectId: string | undefined = activeProject || undefined;
      if (parsed.projectHint) {
        const hint = parsed.projectHint.toLowerCase();
        const match = projects.find(p => p.title.toLowerCase().includes(hint));
        if (match) resolvedProjectId = match.id;
      }

      const task = await api.createTask({
        title: parsed.title,
        project_id: resolvedProjectId,
        due_date: parsed.due_date || undefined,
        priority: parsed.priority ?? undefined,
        repeat_after: parsed.repeat_after ?? undefined,
        repeat_mode: parsed.repeat_after ? parsed.repeat_mode : undefined,
      });

      // Attach labels by hint
      if (parsed.labelHints.length > 0) {
        for (const hint of parsed.labelHints) {
          const h = hint.toLowerCase();
          const match = labels.find(l => l.title.toLowerCase().includes(h));
          if (match) {
            await api.addTaskLabel(task.id, match.id).catch(() => {});
          }
        }
      }

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

    // Group tasks by due status, sorted by priority descending within each group
    const byPriority = (a: TaskItem, b: TaskItem) => (b.priority ?? 0) - (a.priority ?? 0);
    const overdue = visibleTasks.filter(t => t.due_date && datePart(t.due_date) < today && !t.done).sort(byPriority);
    const dueToday = visibleTasks.filter(t => t.due_date && datePart(t.due_date) === today && !t.done).sort(byPriority);
    const upcoming = visibleTasks.filter(t => t.due_date && datePart(t.due_date) > today && !t.done).sort(byPriority);
    const noDue = visibleTasks.filter(t => !t.due_date && !t.done).sort(byPriority);
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
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {(() => {
                const h = getHourInTz();
                const greeting = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
                const name = currentUser?.display_name || currentUser?.username || '';
                return name ? `${greeting}, ${name}` : greeting;
              })()}
            </h1>
            {/* Time + Weather */}
            <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
              {weatherData && (
                <div className="flex items-center gap-1.5" title={weatherData.description}>
                  {getWeatherIcon(weatherData.code)}
                  <span className="text-sm font-medium">{weatherData.temp}°{currentUser?.temperature_unit === 'fahrenheit' ? 'F' : 'C'}</span>
                  {currentUser?.weather_location_name && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:inline">
                      {currentUser.weather_location_name}
                    </span>
                  )}
                </div>
              )}
              <span className="text-sm font-medium tabular-nums">{formatTime()}</span>
            </div>
          </div>
        </div>

        <div className="mt-6" />

        {/* Main content: tasks + calendar side by side */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Tasks — 3/5 */}
          <div className="w-full lg:w-3/5">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
              {/* Filter row: Home + Projects/Labels left, pills right */}
              <div className="px-3 py-2 mt-[0.4rem] flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
                {/* Left: Home icon + Projects + Labels */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => { setTab('overview'); setTaskFilter('home'); setFilterLabel(null); setActiveProject(null); setActiveProjectData(null); }}
                    className={`p-1.5 rounded-lg transition-colors ${
                      tab === 'overview' && taskFilter === 'home' && !filterLabel
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                    title="Home"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => { setTab('projects'); setActiveProject(null); setActiveProjectData(null); setFilterLabel(null); }}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                      tab === 'projects'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-gray-400'
                    }`}
                  >
                    Projects
                  </button>
                  <button
                    onClick={() => { setTab('labels'); setFilterLabel(null); }}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                      tab === 'labels'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-gray-400'
                    }`}
                  >
                    Labels
                  </button>
                </div>

                {/* Right: Filter pills (only in overview) */}
                {tab === 'overview' && (
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
                )}
              </div>

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
          </div>

          {/* Calendar — 2/5 (always visible) */}
          <div className="w-full lg:w-2/5">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md pt-2 pb-5 px-5 lg:sticky lg:top-8 lg:mt-0">
                <Calendar
                  taskDates={taskDates}
                  eventDateColors={eventDateColors}
                  selectedDate={selectedDate}
                  onDateClick={(date) => setSelectedDate(date === selectedDate ? null : date)}
                />

                {/* Selected date summary: tasks + events */}
                {selectedDate && (() => {
                  const dayTasks = tasks.filter(t => t.due_date && datePart(t.due_date) === selectedDate && !t.done);
                  const dayEvents = events.filter(e => datePart(e.start_date) === selectedDate);
                  const hasContent = dayTasks.length > 0 || dayEvents.length > 0;
                  return (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <h4 className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                        {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                      </h4>
                      {!hasContent && <p className="text-xs text-gray-400 dark:text-gray-500 italic">Nothing scheduled</p>}
                      <ul className="space-y-1">
                        {dayEvents.map(e => (
                          <li key={e.id} className="flex items-center gap-2 text-sm px-2 py-1 -mx-2 rounded">
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: e.color }} />
                            <span className="text-gray-700 dark:text-gray-300 truncate">{e.title}</span>
                            {!e.all_day && e.start_date.includes('T') && (
                              <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0 ml-auto">
                                {e.start_date.slice(11, 16)}
                              </span>
                            )}
                            {!!e.all_day && (
                              <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0 ml-auto">all day</span>
                            )}
                          </li>
                        ))}
                        {dayTasks.map(t => (
                          <li
                            key={t.id}
                            className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750 rounded px-2 py-1 -mx-2 transition-colors"
                            onClick={() => setEditingTask(t)}
                          >
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: priorityColor(t.priority) }} />
                            <span className="text-gray-700 dark:text-gray-300 truncate">{t.title}</span>
                            {t.due_date && t.due_date.includes('T') && (
                              <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0 ml-auto">
                                {t.due_date.slice(11, 16)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}

                {/* Add event input */}
                <form
                  onSubmit={e => { e.preventDefault(); handleAddEvent(); }}
                  className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                    <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    <input
                      type="text"
                      value={newEventInput}
                      onChange={e => setNewEventInput(e.target.value)}
                      placeholder="Add event... (@fri 2pm)"
                      className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
                    />
                    {newEventInput.trim() && (
                      <button type="submit" className="px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors">
                        Add
                      </button>
                    )}
                  </div>
                </form>

                {/* Upcoming events list */}
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <h4 className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Upcoming events</h4>
                  {(() => {
                    const today = todayStr();
                    const upcoming = events
                      .filter(e => datePart(e.start_date) >= today)
                      .sort((a, b) => a.start_date.localeCompare(b.start_date))
                      .slice(0, 8);

                    if (upcoming.length === 0) {
                      return <p className="text-xs text-gray-400 dark:text-gray-500 italic">No upcoming events</p>;
                    }

                    // Group by date
                    const groups: { date: string; events: EventItem[] }[] = [];
                    for (const e of upcoming) {
                      const d = datePart(e.start_date);
                      const last = groups[groups.length - 1];
                      if (last && last.date === d) last.events.push(e);
                      else groups.push({ date: d, events: [e] });
                    }

                    return (
                      <div className="space-y-3">
                        {groups.map(g => {
                          const isToday = g.date === today;
                          const dateLabel = isToday
                            ? 'Today'
                            : new Date(g.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                          return (
                            <div key={g.date}>
                              <p className={`text-[10px] font-medium uppercase tracking-wider mb-1 ${isToday ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'}`}>
                                {dateLabel}
                              </p>
                              <ul className="space-y-0.5">
                                {g.events.map(e => (
                                  <li key={e.id} className="flex items-center gap-2 pl-1">
                                    <span
                                      className="w-0.5 h-4 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: e.color }}
                                    />
                                    {e.source === 'google' && e.html_link ? (
                                      <a href={e.html_link} target="_blank" rel="noopener noreferrer"
                                        className="text-sm text-gray-700 dark:text-gray-300 truncate hover:underline">{e.title}</a>
                                    ) : (
                                      <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{e.title}</span>
                                    )}
                                    {e.source === 'google' && (
                                      <span className="text-[9px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-1 rounded flex-shrink-0" title="Google Calendar">G</span>
                                    )}
                                    <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0 ml-auto whitespace-nowrap">
                                      {e.all_day
                                        ? 'all day'
                                        : e.start_date.includes('T')
                                          ? e.start_date.slice(11, 16)
                                          : ''}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
          </div>
        </div>

        {/* + New Task FAB */}
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
