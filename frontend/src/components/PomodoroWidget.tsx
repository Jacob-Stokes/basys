import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTimer, MODE_COLORS, MODE_LABELS, formatTime } from '../context/TimerContext';
import type { TimerMode } from '../context/TimerContext';
import FocusSearch from './FocusSearch';

const MODES: TimerMode[] = ['pomodoro', 'shortBreak', 'longBreak'];

interface PomodoroWidgetProps {
  variant: 'small' | 'large';
}

// ── Small variant: single-row icon buttons (corner-top, corner-bottom-sm) ──
function SmallWidget() {
  const { mode, timeLeft, running, start, stop, reset, switchMode } = useTimer();
  const [showModes, setShowModes] = useState(false);

  const cycleMode = () => {
    if (running) return;
    const idx = MODES.indexOf(mode);
    switchMode(MODES[(idx + 1) % MODES.length]);
  };

  return (
    <div className="h-full w-full flex items-center justify-between px-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      {/* Left: tomato + mode */}
      <div className="flex items-center gap-2">
        <Link to="/timer" className="text-base hover:scale-110 transition-transform" title="Open Timer">
          🍅
        </Link>
        <div className="relative">
          <button
            onClick={() => running ? null : setShowModes(!showModes)}
            className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors ${
              running ? 'cursor-default' : 'hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer'
            }`}
            title={running ? MODE_LABELS[mode] : 'Switch mode'}
          >
            <span className={`w-2 h-2 rounded-full ${running ? MODE_COLORS[mode] : 'bg-gray-300 dark:bg-gray-600'}`} />
            <span className="text-gray-500 dark:text-gray-400">{MODE_LABELS[mode]}</span>
          </button>
          {showModes && !running && (
            <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 py-1 min-w-[80px]">
              {MODES.map(m => (
                <button
                  key={m}
                  onClick={() => { switchMode(m); setShowModes(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 ${
                    mode === m ? 'font-medium text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${MODE_COLORS[m]}`} />
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Center: time */}
      <button
        onClick={cycleMode}
        className="text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums hover:opacity-70 transition-opacity"
        style={{ fontVariantNumeric: 'tabular-nums' }}
        title={running ? formatTime(timeLeft) : 'Click to cycle mode'}
      >
        {formatTime(timeLeft)}
      </button>

      {/* Right: play/stop + reset */}
      <div className="flex items-center gap-1">
        {!running ? (
          <button
            onClick={start}
            className="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 transition-colors"
            title="Start"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        ) : (
          <button
            onClick={stop}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
            title="Stop"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          </button>
        )}
        <button
          onClick={reset}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
          title="Reset"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Large variant: vertical stack (corner-bottom-lg) ──
function LargeWidget() {
  const { mode, timeLeft, running, note, setNote, start, stop, reset, switchMode, focusItems, removeFocusItem } = useTimer();
  const [showSearch, setShowSearch] = useState(false);
  const isBreak = mode === 'shortBreak' || mode === 'longBreak';

  return (
    <div className="h-full w-full flex flex-col bg-white dark:bg-gray-800 border-t border-r border-gray-200 dark:border-gray-700 rounded-tr-lg shadow-lg">
      {showSearch && !isBreak && (
        <div className="absolute bottom-full left-0 w-full">
          <FocusSearch onClose={() => setShowSearch(false)} />
        </div>
      )}

      {/* Time + mode */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <Link to="/timer" className="text-base hover:scale-110 transition-transform" title="Open Timer">
            🍅
          </Link>
          <span
            className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formatTime(timeLeft)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className={`w-2.5 h-2.5 rounded-full ${running ? MODE_COLORS[mode] : 'bg-gray-300 dark:bg-gray-600'}`} />
          <span className="text-xs text-gray-500 dark:text-gray-400">{MODE_LABELS[mode]}</span>
        </div>
      </div>

      {/* Mode switcher */}
      <div className="flex gap-1 px-3 pb-2">
        {MODES.map(m => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            disabled={running}
            className={`flex-1 px-1.5 py-1 text-[10px] rounded border transition-colors ${
              mode === m
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
            } ${running && mode !== m ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex gap-1.5 px-3 pb-2">
        {!running ? (
          <button
            onClick={start}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
            title="Start"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        ) : (
          <button
            onClick={stop}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
            title="Stop"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          </button>
        )}
        <button
          onClick={reset}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
          title="Reset"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
          </svg>
        </button>
      </div>

      {/* Focus item (1 visible) — hidden during breaks */}
      {!isBreak && (
        <div className="px-3 pb-1.5 flex-1 min-h-0">
          {focusItems.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 truncate max-w-full">
                {focusItems[0].color && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: focusItems[0].color }} />}
                <span className="truncate">{focusItems[0].title}</span>
                <button
                  onClick={() => removeFocusItem(focusItems[0].id)}
                  className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-200 flex-shrink-0 ml-0.5"
                >
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
              {focusItems.length > 1 && <span className="text-[10px] text-gray-400 flex-shrink-0">+{focusItems.length - 1}</span>}
            </div>
          ) : (
            <button
              onClick={() => setShowSearch(true)}
              className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              + Add focus item
            </button>
          )}
        </div>
      )}

      {/* Note input — hidden during breaks */}
      {!isBreak && (
        <div className="px-3 pb-3">
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Working on..."
            className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        </div>
      )}
    </div>
  );
}

export default function PomodoroWidget({ variant }: PomodoroWidgetProps) {
  return variant === 'large' ? <LargeWidget /> : <SmallWidget />;
}
