import { useState } from 'react';

interface CalendarProps {
  /** Dates that have tasks due (YYYY-MM-DD strings) */
  taskDates?: Set<string>;
  /** Map of date string → array of event colors for that date */
  eventDateColors?: Map<string, string[]>;
  /** Currently selected date */
  selectedDate?: string | null;
  /** Callback when a date is clicked */
  onDateClick?: (date: string) => void;
}

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad(n: number) { return n.toString().padStart(2, '0'); }

function toDateStr(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

export default function Calendar({ taskDates, eventDateColors, selectedDate, onDateClick }: CalendarProps) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const todayStr = toDateStr(now.getFullYear(), now.getMonth(), now.getDate());

  // First day of this month (0 = Sunday)
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  // Shift so Monday = 0
  const startOffset = (firstDay + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const prev = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const next = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };
  const goToday = () => { setViewYear(now.getFullYear()); setViewMonth(now.getMonth()); };

  // Build 6-row grid
  const cells: { day: number; inMonth: boolean; dateStr: string }[] = [];

  // Previous month trailing days
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const m = viewMonth === 0 ? 11 : viewMonth - 1;
    const y = viewMonth === 0 ? viewYear - 1 : viewYear;
    cells.push({ day: d, inMonth: false, dateStr: toDateStr(y, m, d) });
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, inMonth: true, dateStr: toDateStr(viewYear, viewMonth, d) });
  }
  // Next month leading days
  const remaining = 42 - cells.length; // always 6 rows
  for (let d = 1; d <= remaining; d++) {
    const m = viewMonth === 11 ? 0 : viewMonth + 1;
    const y = viewMonth === 11 ? viewYear + 1 : viewYear;
    cells.push({ day: d, inMonth: false, dateStr: toDateStr(y, m, d) });
  }

  return (
    <div className="select-none">
      {/* Header: month nav */}
      <div className="flex items-center justify-between mb-0">
        <button
          onClick={prev}
          className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={goToday}
          className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors tracking-wide"
        >
          {MONTHS[viewMonth]} {viewYear}
        </button>
        <button
          onClick={next}
          className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Thin separator */}
      <div className="border-t border-gray-200 dark:border-gray-700 mb-1" />

      {/* Date grid */}
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          const isToday = cell.dateStr === todayStr;
          const isSelected = cell.dateStr === selectedDate;
          const hasTask = taskDates?.has(cell.dateStr);
          const eventColors = eventDateColors?.get(cell.dateStr);
          const hasDots = hasTask || (eventColors && eventColors.length > 0);

          // Build dot array: task dot (gray) + event dots (various colors)
          const dots: string[] = [];
          if (hasTask) dots.push('#6b7280'); // gray for tasks
          if (eventColors) {
            // Deduplicate colors and take max 3
            const unique = [...new Set(eventColors)];
            dots.push(...unique.slice(0, 3));
          }

          return (
            <button
              key={i}
              onClick={() => onDateClick?.(cell.dateStr)}
              className={`
                relative flex flex-col items-center justify-center
                py-1.5 text-xs transition-colors
                ${cell.inMonth
                  ? 'text-gray-700 dark:text-gray-300'
                  : 'text-gray-300 dark:text-gray-600'
                }
                ${isSelected
                  ? 'bg-blue-50 dark:bg-blue-900/20'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                }
              `}
            >
              <span
                className={`
                  w-6 h-6 flex items-center justify-center rounded-full text-xs
                  ${isToday
                    ? 'border border-gray-900 dark:border-gray-100 font-semibold'
                    : ''
                  }
                  ${isSelected
                    ? 'bg-blue-600 text-white border-blue-600'
                    : ''
                  }
                `}
              >
                {cell.day}
              </span>
              {/* Dot indicators */}
              {hasDots && !isSelected && (
                <span className="absolute bottom-0.5 flex gap-px">
                  {dots.slice(0, 4).map((color, di) => (
                    <span
                      key={di}
                      className="w-1 h-1 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom line */}
      <div className="border-t border-gray-200 dark:border-gray-700 mt-1" />
    </div>
  );
}
