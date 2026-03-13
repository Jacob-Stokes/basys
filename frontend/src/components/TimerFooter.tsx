import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTimer, MODE_LABELS, MODE_COLORS, formatTime } from '../context/TimerContext';
import type { TimerMode } from '../context/TimerContext';
import FocusSearch from './FocusSearch';

const MODES: TimerMode[] = ['pomodoro', 'shortBreak', 'longBreak'];

export default function TimerFooter() {
  const { mode, timeLeft, running, note, setNote, start, stop, reset, switchMode, focusItems, removeFocusItem } = useTimer();
  const [showSearch, setShowSearch] = useState(false);

  const isBreak = mode === 'shortBreak' || mode === 'longBreak';
  const MAX_VISIBLE_PILLS = 2;
  const visibleItems = focusItems.slice(0, MAX_VISIBLE_PILLS);
  const overflowCount = focusItems.length - MAX_VISIBLE_PILLS;

  return (
    <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 sticky bottom-0 z-30 relative">
      {showSearch && !isBreak && <FocusSearch onClose={() => setShowSearch(false)} />}

      <div className="container mx-auto px-4 sm:px-16 flex items-center justify-between h-14 gap-3">
        {/* Left: tomato link + mode selector */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Link
            to="/timer"
            className="text-base leading-none hover:scale-110 transition-transform flex-shrink-0"
            title="Open Pomodoro"
          >
            🍅
          </Link>
          {MODES.map(m => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              disabled={running}
              className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                mode === m
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
              } ${running && mode !== m ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>

        {/* Center: Focus area + countdown */}
        <div className="flex items-center gap-3 flex-1 justify-center min-w-0">
          {/* Focus button + pills — hidden for breaks */}
          {!isBreak && (
            <div className="flex items-center gap-1.5 min-w-0">
              <button
                onClick={() => setShowSearch(!showSearch)}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors flex-shrink-0 ${
                  focusItems.length > 0
                    ? 'border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
                title="Focus on..."
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                {focusItems.length === 0 && <span>Focus</span>}
              </button>
              {visibleItems.map(item => (
                <span
                  key={item.id}
                  className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 max-w-[120px] flex-shrink-0"
                >
                  {item.color && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />}
                  <span className="truncate">{item.title}</span>
                  <button
                    onClick={e => { e.stopPropagation(); removeFocusItem(item.id); }}
                    className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-200 flex-shrink-0"
                  >
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
              {overflowCount > 0 && (
                <span className="text-[10px] text-gray-400 flex-shrink-0">+{overflowCount}</span>
              )}
            </div>
          )}

          {/* Countdown */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${running ? MODE_COLORS[mode] : 'bg-gray-300 dark:bg-gray-600'}`} />
            <span
              className="text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatTime(timeLeft)}
            </span>
          </div>

          {/* Note input — to the right of timer, hidden for breaks */}
          {!isBreak && (
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Working on..."
              className="w-28 sm:w-40 px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-transparent outline-none flex-shrink-0"
            />
          )}
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!running ? (
            <button
              onClick={start}
              className="px-3 py-1 text-xs font-medium rounded border bg-blue-600 text-white border-blue-600 hover:bg-blue-700 transition-colors"
            >
              Start
            </button>
          ) : (
            <button
              onClick={stop}
              className="px-3 py-1 text-xs font-medium rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Stop
            </button>
          )}
          <button
            onClick={reset}
            className="px-3 py-1 text-xs font-medium rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
