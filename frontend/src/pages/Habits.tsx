import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import ConfirmModal from '../components/ConfirmModal';

// ── Types ──────────────────────────────────────────────────────────

interface HabitStats {
  currentStreak: number;
  bestStreak: number;
  totalEvents: number;
  weekCompletions: boolean[];
  todayLogged: boolean;
}

interface QuitStats {
  abstinenceStartDate: string;
  elapsedDays: number;
  elapsedMs: number;
  targetDays: number;
  progressPercent: number;
  totalSlips: number;
}

interface LinkedSubGoal {
  id: string;
  title: string;
  position: number;
  goal_id: string;
  goal_title: string;
}

interface HabitItem {
  id: string;
  title: string;
  emoji: string;
  type: 'habit' | 'quit';
  frequency: string;
  quit_date: string | null;
  subgoal_id: string | null;
  archived: number;
  position: number;
  stats: HabitStats | QuitStats;
  linked_subgoal: LinkedSubGoal | null;
}

type ActiveTab = 'habits' | 'quits';

// ── Helpers ────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

function milestoneLabel(days: number): string {
  if (days <= 30) return '30 days';
  if (days <= 90) return '90 days';
  if (days <= 180) return '6 months';
  return '1 year';
}

const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// ── SubGoalSearchInput ─────────────────────────────────────────────

function SubGoalSearchInput({
  linkedSubGoal,
  onSelect,
  onClear,
}: {
  linkedSubGoal: LinkedSubGoal | null;
  onSelect: (sg: LinkedSubGoal) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LinkedSubGoal[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (query.trim().length < 1) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    timerRef.current = setTimeout(async () => {
      try {
        const data = await api.searchSubGoals(query.trim());
        setResults(data);
        setShowDropdown(data.length > 0);
      } catch {
        setResults([]);
        setShowDropdown(false);
      }
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  if (linkedSubGoal) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 border border-green-300 dark:border-green-600 rounded-lg bg-green-50 dark:bg-green-900/20">
        <span className="text-sm text-green-700 dark:text-green-400 truncate flex-1">
          {linkedSubGoal.goal_title || '(deleted goal)'} › {linkedSubGoal.title || '(deleted sub-goal)'}
        </span>
        <button
          type="button"
          onClick={onClear}
          className="text-green-600 hover:text-red-500 font-bold text-sm"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
        placeholder="Link to sub-goal (optional)"
        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
      />
      {showDropdown && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-700 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 z-20 max-h-48 overflow-y-auto">
            {results.map((sg) => (
              <button
                key={sg.id}
                type="button"
                onClick={() => {
                  onSelect(sg);
                  setQuery('');
                  setResults([]);
                  setShowDropdown(false);
                }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600"
              >
                <span className="text-gray-500 dark:text-gray-400">{sg.goal_title}</span>
                <span className="mx-1 text-gray-400">›</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{sg.title}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── ProgressRing ───────────────────────────────────────────────────

function ProgressRing({ percent, size = 80, strokeWidth = 6 }: { percent: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-gray-200 dark:text-gray-700"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="text-yellow-600 transition-all duration-500"
      />
    </svg>
  );
}

// ── Month names ───────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const CAL_DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// ── HabitDetailModal ──────────────────────────────────────────────

function HabitDetailModal({
  habit,
  onClose,
}: {
  habit: HabitItem;
  onClose: () => void;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-indexed
  const [loggedDates, setLoggedDates] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getHabitCalendar(habit.id, year, month)
      .then((data) => {
        setLoggedDates(new Set(data.loggedDates));
        setStats(data.stats);
      })
      .catch(() => {
        setLoggedDates(new Set());
        setStats(null);
      })
      .finally(() => setLoading(false));
  }, [habit.id, year, month]);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  // Calendar grid
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const todayStr2 = now.toISOString().split('T')[0];

  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d);
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  const isQuit = habit.type === 'quit';
  const dotColor = isQuit ? 'bg-red-500' : 'bg-emerald-500';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Calendar */}
        <div className="p-5">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={prevMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              ‹
            </button>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {MONTH_NAMES[month - 1]} {year}
            </h3>
            <button
              onClick={nextMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              ›
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 mb-1">
            {CAL_DAY_LABELS.map((d) => (
              <div key={d} className="text-center text-[10px] font-semibold text-gray-400 dark:text-gray-500 py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          {loading ? (
            <div className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">Loading...</div>
          ) : (
            <div className="grid grid-cols-7">
              {calendarCells.map((day, idx) => {
                if (day === null) {
                  return <div key={idx} className="aspect-square" />;
                }
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isLogged = loggedDates.has(dateStr);
                const isToday = dateStr === todayStr2;

                return (
                  <div
                    key={idx}
                    className={`aspect-square flex flex-col items-center justify-center relative ${
                      isToday ? 'bg-blue-50 dark:bg-blue-900/20 rounded-lg' : ''
                    }`}
                  >
                    <span className={`text-sm ${
                      isToday
                        ? 'font-bold text-blue-600 dark:text-blue-400'
                        : 'text-gray-700 dark:text-gray-300'
                    }`}>
                      {day}
                    </span>
                    {isLogged && (
                      <div className={`w-1.5 h-1.5 rounded-full ${dotColor} mt-0.5`} />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Statistics */}
        {stats && (
          <div className="border-t border-gray-200 dark:border-gray-700 p-5">
            <h4 className="text-xs font-bold tracking-wider text-gray-500 dark:text-gray-400 uppercase mb-3">Statistics</h4>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              <StatRow
                label="Completion rate"
                value={`${stats.completionRate}%`}
                subtitle={`${stats.completionCount} of ${stats.completionTotal} days`}
              />
              <StatRow label="Current streak" value={`${stats.currentStreak} days`} />
              <StatRow label="Best streak" value={`${stats.bestStreak} days`} />
              <StatRow
                label="This week"
                value={`${stats.thisWeek} / ${stats.thisWeekTotal} days`}
              />
              <StatRow
                label="This month"
                value={`${stats.thisMonth} / ${stats.thisMonthTotal} days`}
              />
              <StatRow label="Avg per week" value={`${stats.avgPerWeek} days`} />
              <StatRow label="Total entries" value={`${stats.totalEntries}`} />
              <StatRow
                label="Tracking since"
                value={formatDate(stats.trackingSince)}
                subtitle={`${stats.trackingSinceDays} days ago`}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatRow({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <div className="flex items-baseline justify-between py-2.5">
      <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
      <div className="text-right">
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{value}</span>
        {subtitle && (
          <div className="text-xs text-gray-400 dark:text-gray-500">{subtitle}</div>
        )}
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── HabitCard ──────────────────────────────────────────────────────

function HabitCard({
  habit,
  onLog,
  onEdit,
  onDelete,
  onDetail,
}: {
  habit: HabitItem;
  onLog: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDetail: () => void;
}) {
  const stats = habit.stats as HabitStats;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-5 hover:shadow-md transition-shadow flex flex-col gap-4 cursor-pointer" onClick={onDetail}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {habit.emoji && <span className="text-2xl">{habit.emoji}</span>}
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">{habit.title}</h3>
            <div className="text-xs text-gray-400 dark:text-gray-500 truncate h-4">
              {(habit.linked_subgoal?.goal_title && habit.linked_subgoal?.title)
                ? `${habit.linked_subgoal.goal_title} › ${habit.linked_subgoal.title}`
                : '\u00A0'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
            HABIT
          </span>
          {/* Three-dot menu */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <circle cx="10" cy="4" r="1.5" />
                <circle cx="10" cy="10" r="1.5" />
                <circle cx="10" cy="16" r="1.5" />
              </svg>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-gray-700 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 z-20 py-1">
                  <button
                    onClick={() => { setMenuOpen(false); onEdit(); }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); onDelete(); }}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex gap-4 text-sm">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.currentStreak}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Current</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.bestStreak}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Best</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.totalEvents}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Total</div>
        </div>
      </div>

      {/* Week row — squares */}
      <div className="flex gap-1.5">
        {WEEKDAY_LABELS.map((label, i) => {
          const completed = stats.weekCompletions[i];
          const isToday = new Date().getDay() === (i === 6 ? 0 : i + 1);
          return (
            <div key={i} className="flex flex-col items-center gap-1 flex-1">
              <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">{label}</span>
              <div
                className={`w-full h-7 rounded habit-week-cell transition-colors ${
                  completed
                    ? 'bg-emerald-500'
                    : 'bg-gray-200 dark:bg-gray-700'
                } ${isToday && !completed ? 'ring-1 ring-gray-400 dark:ring-gray-500' : ''}`}
              />
            </div>
          );
        })}
      </div>

      {/* Action button */}
      <button
        onClick={(e) => { e.stopPropagation(); onLog(); }}
        disabled={stats.todayLogged}
        className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
          stats.todayLogged
            ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
            : 'bg-green-600 text-white hover:bg-green-700'
        }`}
      >
        {stats.todayLogged ? '✓ Done today' : '✓ Did it!'}
      </button>
    </div>
  );
}

// ── QuitCard ───────────────────────────────────────────────────────

function QuitCard({
  habit,
  onSlip,
  onEdit,
  onDelete,
  onDetail,
}: {
  habit: HabitItem;
  onSlip: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDetail: () => void;
}) {
  const stats = habit.stats as QuitStats;
  const [menuOpen, setMenuOpen] = useState(false);
  const [elapsed, setElapsed] = useState(stats.elapsedMs);

  // Live counter
  useEffect(() => {
    setElapsed(stats.elapsedMs);
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsed(stats.elapsedMs + (Date.now() - start));
    }, 1000);
    return () => clearInterval(interval);
  }, [stats.elapsedMs]);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-5 hover:shadow-md transition-shadow flex flex-col gap-4 cursor-pointer" onClick={onDetail}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {habit.emoji && <span className="text-2xl">{habit.emoji}</span>}
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">{habit.title}</h3>
            <div className="text-xs text-gray-400 dark:text-gray-500 truncate h-4">
              {(habit.linked_subgoal?.goal_title && habit.linked_subgoal?.title)
                ? `${habit.linked_subgoal.goal_title} › ${habit.linked_subgoal.title}`
                : '\u00A0'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">
            QUIT
          </span>
          {/* Three-dot menu */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <circle cx="10" cy="4" r="1.5" />
                <circle cx="10" cy="10" r="1.5" />
                <circle cx="10" cy="16" r="1.5" />
              </svg>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-gray-700 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 z-20 py-1">
                  <button
                    onClick={() => { setMenuOpen(false); onEdit(); }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); onDelete(); }}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Progress ring + elapsed */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <ProgressRing percent={stats.progressPercent} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{stats.progressPercent}%</span>
          </div>
        </div>
        <div className="flex-1">
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
            {formatElapsed(elapsed)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            free · next milestone: {milestoneLabel(stats.targetDays)}
          </div>
          {stats.totalSlips > 0 && (
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {stats.totalSlips} slip{stats.totalSlips !== 1 ? 's' : ''} total
            </div>
          )}
        </div>
      </div>

      {/* Action button */}
      <button
        onClick={(e) => { e.stopPropagation(); onSlip(); }}
        className="w-full py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
      >
        Slipped up
      </button>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────

export default function Habits() {
  const [tab, setTab] = useState<ActiveTab>('habits');
  const [items, setItems] = useState<HabitItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addEmoji, setAddEmoji] = useState('');
  const [addQuitDate, setAddQuitDate] = useState(todayStr());
  const [addLinkedSubGoal, setAddLinkedSubGoal] = useState<LinkedSubGoal | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  // Edit state
  const [editingItem, setEditingItem] = useState<HabitItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editEmoji, setEditEmoji] = useState('');
  const [editLinkedSubGoal, setEditLinkedSubGoal] = useState<LinkedSubGoal | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<HabitItem | null>(null);

  // Detail modal
  const [detailHabit, setDetailHabit] = useState<HabitItem | null>(null);

  // ── Data loading ────────────────────────────────────────────────

  const loadItems = async () => {
    try {
      setLoading(true);
      const data = await api.getHabits({ type: tab === 'habits' ? 'habit' : 'quit' });
      setItems(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, [tab]);

  // Focus add input when form opens
  useEffect(() => {
    if (showAddForm && addInputRef.current) {
      addInputRef.current.focus();
    }
  }, [showAddForm]);

  // ── Handlers ────────────────────────────────────────────────────

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addTitle.trim()) return;

    try {
      await api.createHabit({
        title: addTitle.trim(),
        emoji: addEmoji.trim(),
        type: tab === 'habits' ? 'habit' : 'quit',
        ...(tab === 'quits' ? { quit_date: addQuitDate } : {}),
        ...(addLinkedSubGoal ? { subgoal_id: addLinkedSubGoal.id } : {}),
      });
      setAddTitle('');
      setAddEmoji('');
      setAddQuitDate(todayStr());
      setAddLinkedSubGoal(null);
      setShowAddForm(false);
      loadItems();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleLog = async (habit: HabitItem) => {
    try {
      await api.createHabitLog(habit.id, { log_date: todayStr() });
      loadItems();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSlip = async (habit: HabitItem) => {
    try {
      await api.createHabitLog(habit.id, { log_date: todayStr(), note: 'Slipped up' });
      loadItems();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleEdit = (item: HabitItem) => {
    setEditingItem(item);
    setEditTitle(item.title);
    setEditEmoji(item.emoji);
    setEditLinkedSubGoal(item.linked_subgoal);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editTitle.trim()) return;

    try {
      await api.updateHabit(editingItem.id, {
        title: editTitle.trim(),
        emoji: editEmoji.trim(),
        subgoal_id: editLinkedSubGoal ? editLinkedSubGoal.id : null,
      });
      setEditingItem(null);
      loadItems();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteHabit(deleteTarget.id);
      setDeleteTarget(null);
      loadItems();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="container mx-auto px-4 sm:px-16 pt-8 pb-8">
        {error && (
          <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-400 px-4 py-3 rounded mb-4">
            {error}
            <button onClick={() => setError(null)} className="ml-2 font-bold">×</button>
          </div>
        )}

        {/* Header + tabs */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Sub-tab switcher */}
              <div className="flex gap-1.5">
                <button
                  onClick={() => { setTab('habits'); setShowAddForm(false); }}
                  className={`px-3 py-1.5 text-sm rounded border transition-colors ${
                    tab === 'habits'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  Habits
                </button>
                <button
                  onClick={() => { setTab('quits'); setShowAddForm(false); }}
                  className={`px-3 py-1.5 text-sm rounded border transition-colors ${
                    tab === 'quits'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  Quits
                </button>
              </div>
            </div>

            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              {showAddForm ? 'Cancel' : tab === 'habits' ? '+ New Habit' : '+ New Quit'}
            </button>
          </div>

          {/* Inline add form */}
          {showAddForm && (
            <form onSubmit={handleAdd} className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  ref={addInputRef}
                  type="text"
                  value={addEmoji}
                  onChange={(e) => setAddEmoji(e.target.value)}
                  placeholder="Emoji"
                  className="w-16 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100 text-center text-lg"
                />
                <input
                  type="text"
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  placeholder={tab === 'habits' ? 'e.g. Meditate for 10 minutes' : 'e.g. Smoking'}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                />
                {tab === 'quits' && (
                  <input
                    type="date"
                    value={addQuitDate}
                    onChange={(e) => setAddQuitDate(e.target.value)}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                  />
                )}
                <button
                  type="submit"
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium whitespace-nowrap"
                >
                  {tab === 'habits' ? 'Add Habit' : 'Add Quit'}
                </button>
              </div>
              {/* Sub-goal link search */}
              <div className="mt-3">
                <SubGoalSearchInput
                  linkedSubGoal={addLinkedSubGoal}
                  onSelect={setAddLinkedSubGoal}
                  onClear={() => setAddLinkedSubGoal(null)}
                />
              </div>
            </form>
          )}
        </div>

        {/* Card grid */}
        <div className="mt-6" />
        {loading ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-12">Loading…</p>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400 dark:text-gray-500 text-lg mb-2">
              {tab === 'habits' ? 'No habits yet' : 'No quits yet'}
            </p>
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              {tab === 'habits'
                ? 'Start building positive daily habits'
                : 'Track things you want to stop doing'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {items.map((item) =>
              item.type === 'habit' ? (
                <HabitCard
                  key={item.id}
                  habit={item}
                  onLog={() => handleLog(item)}
                  onEdit={() => handleEdit(item)}
                  onDelete={() => setDeleteTarget(item)}
                  onDetail={() => setDetailHabit(item)}
                />
              ) : (
                <QuitCard
                  key={item.id}
                  habit={item}
                  onSlip={() => handleSlip(item)}
                  onEdit={() => handleEdit(item)}
                  onDelete={() => setDeleteTarget(item)}
                  onDetail={() => setDetailHabit(item)}
                />
              )
            )}
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Edit {editingItem.type === 'habit' ? 'Habit' : 'Quit'}
            </h3>
            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={editEmoji}
                  onChange={(e) => setEditEmoji(e.target.value)}
                  placeholder="Emoji"
                  className="w-16 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100 text-center text-lg"
                />
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Title"
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                  autoFocus
                />
              </div>
              {/* Sub-goal link in edit */}
              <SubGoalSearchInput
                linkedSubGoal={editLinkedSubGoal}
                onSelect={setEditLinkedSubGoal}
                onClear={() => setEditLinkedSubGoal(null)}
              />
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmModal
          title={`Delete ${deleteTarget.type === 'habit' ? 'Habit' : 'Quit'}`}
          message={`Are you sure you want to delete "${deleteTarget.title}"? All logs will be permanently removed.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Detail modal */}
      {detailHabit && (
        <HabitDetailModal
          habit={detailHabit}
          onClose={() => setDetailHabit(null)}
        />
      )}
    </div>
  );
}
