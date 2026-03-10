import { useState } from 'react';
import {
  useTimer,
  MODE_LABELS,
  MODE_COLORS,
  formatTime,
} from '../context/TimerContext';
import type { TimerMode } from '../context/TimerContext';

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
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

function isThisWeek(date: Date): boolean {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  return date >= startOfWeek;
}

function isThisMonth(date: Date): boolean {
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

export default function Timer() {
  const { mode, timeLeft, running, history, start, stop, reset, switchMode } = useTimer();
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('today');

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
            <div className="flex gap-3 mb-6">
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

            <hr className="border-gray-200 dark:border-gray-700" />
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
                filteredHistory.map(entry => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${MODE_COLORS[entry.mode]}`} />
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {MODE_LABELS[entry.mode]}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {formatDuration(entry.duration)}
                      </span>
                    </div>
                    <span className="text-sm text-gray-400 dark:text-gray-500">
                      {relativeTime(entry.completedAt)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
        </div>
      </div>
    </div>
  );
}
