import { useState, useRef, useEffect, useCallback } from 'react';
import {
  useTimer,
  MODE_LABELS,
  MODE_COLORS,
  formatTime,
} from '../context/TimerContext';
import type { TimerMode, FocusItem, HistoryEntry } from '../context/TimerContext';
import { api } from '../api/client';

type HistoryFilter = 'today' | 'week' | 'month' | 'all';

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function relativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function isToday(date: Date): boolean {
  return date.toDateString() === new Date().toDateString();
}
function isThisWeek(date: Date): boolean {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  start.setHours(0, 0, 0, 0);
  return date >= start;
}
function isThisMonth(date: Date): boolean {
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

const isBreakMode = (m: TimerMode) => m === 'shortBreak' || m === 'longBreak';

// ── TYPE_META for inline search ─────────────────────────────────
const TYPE_META: Record<string, { icon: string; label: string }> = {
  project: { icon: '📁', label: 'Projects' },
  sprint: { icon: '🔄', label: 'Sprints' },
  task: { icon: '☐', label: 'Tasks' },
  goal: { icon: '🎯', label: 'Goals' },
  subgoal: { icon: '📌', label: 'Subgoals' },
  habit: { icon: '✅', label: 'Habits' },
};

interface SearchResult {
  id: string;
  title: string;
  type: string;
  color?: string;
  parentInfo?: string;
  done?: number;
}

// ── Inline Focus Search for Timer page ──────────────────────────
function InlineFocusSearch({ onSelect, selectedIds }: { onSelect: (item: FocusItem) => void; selectedIds: Set<string> }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Record<string, SearchResult[]>>({});
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults({}); return; }
    setLoading(true);
    try {
      const data = await api.universalSearch(q);
      const mapped: Record<string, SearchResult[]> = {};
      for (const type of Object.keys(TYPE_META)) {
        const items = data[type + 's'] || data[type] || [];
        if (items.length > 0) {
          mapped[type] = items.map((item: any) => ({
            id: item.id,
            title: item.title,
            type,
            color: item.hex_color || item.project_color,
            parentInfo: item.project_title || item.goal_title || undefined,
            done: item.done,
          }));
        }
      }
      setResults(mapped);
    } catch {
      setResults({});
    }
    setLoading(false);
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 250);
  };

  const hasResults = Object.values(results).some(arr => arr.length > 0);

  return (
    <div className="mt-4">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => handleChange(e.target.value)}
        placeholder="Search projects, tasks, goals, habits..."
        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
      />
      {query && (
        <div className="mt-2 max-h-56 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
          {loading && <div className="px-3 py-2 text-xs text-gray-400">Searching...</div>}
          {!loading && !hasResults && <div className="px-3 py-2 text-xs text-gray-400">No results</div>}
          {!loading && Object.entries(results).map(([type, items]) => (
            <div key={type}>
              <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 dark:bg-gray-900/50 sticky top-0">
                {TYPE_META[type]?.icon} {TYPE_META[type]?.label}
              </div>
              {items.map(item => {
                const isSelected = selectedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-900 dark:text-gray-100'
                    }`}
                    onClick={() => !isSelected && onSelect({ id: item.id, type: item.type as FocusItem['type'], title: item.title, color: item.color, parentInfo: item.parentInfo })}
                  >
                    {item.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />}
                    <span className={`text-sm flex-1 truncate ${item.done ? 'line-through opacity-50' : ''}`}>{item.title}</span>
                    {item.parentInfo && <span className="text-[10px] text-gray-400 truncate max-w-[100px]">{item.parentInfo}</span>}
                    {isSelected && (
                      <svg className="w-3 h-3 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Retroactive Link Modal ──────────────────────────────────────
function RetroLinkModal({ entry, onClose }: { entry: HistoryEntry; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Record<string, SearchResult[]>>({});
  const [loading, setLoading] = useState(false);
  const [links, setLinks] = useState<FocusItem[]>(entry.links || []);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults({}); return; }
    setLoading(true);
    try {
      const data = await api.universalSearch(q);
      const mapped: Record<string, SearchResult[]> = {};
      for (const type of Object.keys(TYPE_META)) {
        const items = data[type + 's'] || data[type] || [];
        if (items.length > 0) {
          mapped[type] = items.map((item: any) => ({
            id: item.id, title: item.title, type,
            color: item.hex_color || item.project_color,
            parentInfo: item.project_title || item.goal_title || undefined,
          }));
        }
      }
      setResults(mapped);
    } catch { setResults({}); }
    setLoading(false);
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 250);
  };

  const addLink = (item: SearchResult) => {
    if (links.some(l => l.id === item.id)) return;
    setLinks(prev => [...prev, { id: item.id, type: item.type as FocusItem['type'], title: item.title, color: item.color, parentInfo: item.parentInfo }]);
  };

  const removeLink = (id: string) => {
    setLinks(prev => prev.filter(l => l.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updatePomodoro(entry.id, {
        links: links.map(l => ({ target_type: l.type, target_id: l.id })),
      });
      onClose();
    } catch (err) {
      console.error('Failed to save links:', err);
    }
    setSaving(false);
  };

  const linkIds = new Set(links.map(l => l.id));
  const hasResults = Object.values(results).some(arr => arr.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">Link Pomodoro Session</h3>
        <p className="text-xs text-gray-400 mb-3">{MODE_LABELS[entry.mode]} · {formatDuration(entry.duration)} · {relativeTime(entry.completedAt)}</p>

        {/* Current links */}
        {links.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {links.map(link => (
              <span key={link.id} className="flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                {link.color && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: link.color }} />}
                <span className="truncate max-w-[120px]">{link.title}</span>
                <button onClick={() => removeLink(link.id)} className="text-blue-400 hover:text-blue-600">
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Search */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => handleChange(e.target.value)}
          placeholder="Search to link entities..."
          className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        />
        {query && (
          <div className="mt-2 max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
            {loading && <div className="px-3 py-2 text-xs text-gray-400">Searching...</div>}
            {!loading && !hasResults && <div className="px-3 py-2 text-xs text-gray-400">No results</div>}
            {!loading && Object.entries(results).map(([type, items]) => (
              <div key={type}>
                <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 dark:bg-gray-900/50 sticky top-0">
                  {TYPE_META[type]?.icon} {TYPE_META[type]?.label}
                </div>
                {items.map(item => {
                  const isLinked = linkIds.has(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors text-sm ${
                        isLinked ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                      onClick={() => addLink(item)}
                    >
                      {item.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />}
                      <span className="flex-1 truncate">{item.title}</span>
                      {item.parentInfo && <span className="text-[10px] text-gray-400 truncate max-w-[80px]">{item.parentInfo}</span>}
                      {isLinked && <svg className="w-3 h-3 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Links'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Hierarchical link display ───────────────────────────────────
function LinkHierarchy({ links }: { links: FocusItem[] }) {
  if (!links || links.length === 0) return null;

  // Group by type in hierarchy order: project → sprint → task → goal → subgoal → habit
  const order: FocusItem['type'][] = ['project', 'sprint', 'task', 'goal', 'subgoal', 'habit'];
  const sorted = [...links].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));

  return (
    <div className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
      {sorted.map((link, i) => (
        <span key={link.id} className="flex items-center gap-0.5">
          {i > 0 && <span className="text-gray-300 dark:text-gray-600 mx-0.5">›</span>}
          {link.color && <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: link.color }} />}
          <span className="truncate max-w-[100px]">{link.title}</span>
        </span>
      ))}
    </div>
  );
}

// ── Main Timer Component ────────────────────────────────────────
export default function Timer() {
  const { mode, timeLeft, running, history, focusItems, start, stop, reset, switchMode, addFocusItem, removeFocusItem } = useTimer();
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('today');
  const [retroEntry, setRetroEntry] = useState<HistoryEntry | null>(null);

  const isBreak = isBreakMode(mode);
  const selectedIds = new Set(focusItems.map(f => f.id));

  const filteredHistory = history.filter(entry => {
    switch (historyFilter) {
      case 'today': return isToday(entry.completedAt);
      case 'week': return isThisWeek(entry.completedAt);
      case 'month': return isThisMonth(entry.completedAt);
      case 'all': return true;
    }
  });

  const filterOptions: { key: HistoryFilter; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="container mx-auto px-4 sm:px-16 pt-8 pb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">

          {/* ── Timer Panel (2/5) ── */}
          <div className="w-full lg:w-2/5">

            {/* Mode selector */}
            <div className="flex gap-2 mb-8">
              {(['pomodoro', 'shortBreak', 'longBreak'] as TimerMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  disabled={running}
                  className={`px-4 py-2 text-sm rounded border transition-colors ${
                    mode === m
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  } ${running && mode !== m ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>

            {/* Focus items display — only for pomodoro mode */}
            {!isBreak && focusItems.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {focusItems.map(item => (
                  <span
                    key={item.id}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                  >
                    {item.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />}
                    <span className="truncate max-w-[140px]">{item.title}</span>
                    {!running && (
                      <button
                        onClick={() => removeFocusItem(item.id)}
                        className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-200 ml-0.5"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}

            {/* Clock display */}
            <div className="mb-8">
              <div
                className="text-8xl font-bold tracking-tight text-gray-900 dark:text-gray-100 tabular-nums"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatTime(timeLeft)}
              </div>
            </div>

            {/* Controls */}
            <div className="flex gap-3 mb-4">
              <button
                onClick={start}
                disabled={running}
                className={`px-6 py-2 text-sm font-medium rounded border transition-colors ${
                  running
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 border-gray-300 dark:border-gray-600 cursor-not-allowed'
                    : 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                }`}
              >
                Start
              </button>
              <button
                onClick={stop}
                disabled={!running}
                className={`px-6 py-2 text-sm font-medium rounded border transition-colors ${
                  !running
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 border-gray-300 dark:border-gray-600 cursor-not-allowed'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                Stop
              </button>
              <button
                onClick={reset}
                className="px-6 py-2 text-sm font-medium rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Reset
              </button>
            </div>

            {/* Inline focus search — only for pomodoro mode, hidden during breaks */}
            {!isBreak && !running && (
              <InlineFocusSearch
                onSelect={addFocusItem}
                selectedIds={selectedIds}
              />
            )}

            <hr className="border-gray-200 dark:border-gray-700 mt-6" />
          </div>

          {/* ── History Panel (3/5) ── */}
          <div className="w-full lg:w-3/5">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              History
            </h2>

            {/* Filter buttons */}
            <div className="flex gap-2 mb-6">
              {filterOptions.map(f => (
                <button
                  key={f.key}
                  onClick={() => setHistoryFilter(f.key)}
                  className={`px-3 py-1.5 text-sm rounded border transition-colors ${
                    historyFilter === f.key
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* History list */}
            <div className="space-y-0">
              {filteredHistory.length === 0 ? (
                <p className="text-gray-400 dark:text-gray-500 text-sm py-4">
                  No sessions recorded{historyFilter !== 'all' ? ` ${historyFilter === 'today' ? 'today' : `this ${historyFilter}`}` : ''}.
                </p>
              ) : (
                filteredHistory.map(entry => {
                  const isPomoEntry = entry.mode === 'pomodoro';
                  return (
                    <div
                      key={entry.id}
                      className={`py-3 border-b border-gray-200 dark:border-gray-700 ${isPomoEntry ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30' : ''}`}
                      onClick={() => isPomoEntry && setRetroEntry(entry)}
                      title={isPomoEntry ? 'Click to link entities' : undefined}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${MODE_COLORS[entry.mode]}`} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {MODE_LABELS[entry.mode]}
                              </span>
                              <span className="text-sm text-gray-500 dark:text-gray-400">
                                {formatDuration(entry.duration)}
                              </span>
                            </div>
                            {isPomoEntry && entry.links && entry.links.length > 0 && (
                              <LinkHierarchy links={entry.links} />
                            )}
                          </div>
                        </div>
                        <span className="text-sm text-gray-400 dark:text-gray-500 flex-shrink-0 ml-3">
                          {relativeTime(entry.completedAt)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
        </div>
      </div>

      {/* Retroactive link modal */}
      {retroEntry && <RetroLinkModal entry={retroEntry} onClose={() => setRetroEntry(null)} />}
    </div>
  );
}
