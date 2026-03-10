import { useTimer, MODE_LABELS, MODE_COLORS, formatTime } from '../context/TimerContext';
import type { TimerMode } from '../context/TimerContext';

const MODES: TimerMode[] = ['pomodoro', 'shortBreak', 'longBreak'];

export default function TimerFooter() {
  const { mode, timeLeft, running, start, stop, reset, switchMode } = useTimer();

  return (
    <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 sticky bottom-0 z-30">
      <div className="container mx-auto px-4 sm:px-16 flex items-center justify-between h-14">
        {/* Left: mode selector */}
        <div className="flex items-center gap-1.5">
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

        {/* Center: countdown */}
        <div className="flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full shrink-0 ${running ? MODE_COLORS[mode] : 'bg-gray-300 dark:bg-gray-600'}`} />
          <span
            className="text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formatTime(timeLeft)}
          </span>
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-1.5">
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
