import { useState } from 'react';

interface EventEntry {
  id: string;
  title: string;
  color: string;
  all_day?: boolean;
  start_date: string;
}

interface TaskEntry {
  id: string;
  title: string;
  priority: number | string;
  due_date: string;
}

interface CalendarProps {
  /** Dates that have tasks due (YYYY-MM-DD strings) */
  taskDates?: Set<string>;
  /** Map of date string → array of event colors for that date */
  eventDateColors?: Map<string, string[]>;
  /** Currently selected date */
  selectedDate?: string | null;
  /** Callback when a date is clicked */
  onDateClick?: (date: string) => void;
  /** Full-size mode: shows events/tasks inline in day cells */
  fullSize?: boolean;
  /** Events to display inline (only used in fullSize mode) */
  events?: EventEntry[];
  /** Tasks to display inline (only used in fullSize mode) */
  tasks?: TaskEntry[];
  /** Callback when an event is clicked (fullSize mode) */
  onEventClick?: (event: EventEntry) => void;
  /** Callback when a task is clicked (fullSize mode) */
  onTaskClick?: (task: TaskEntry) => void;
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

function priorityColor(p: number | string): string {
  const n = typeof p === 'string' ? ({ none: 0, low: 1, medium: 2, high: 3, urgent: 4 }[p] ?? 0) : p;
  if (n >= 4) return '#ef4444';
  if (n >= 3) return '#f97316';
  if (n >= 2) return '#eab308';
  if (n >= 1) return '#3b82f6';
  return '#9ca3af';
}

function datePart(d: string) { return d.slice(0, 10); }

export default function Calendar({ taskDates, eventDateColors, selectedDate, onDateClick, fullSize, events, tasks, onEventClick, onTaskClick }: CalendarProps) {
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

  // In fullSize mode, build lookup maps for events/tasks by date
  const eventsByDate = new Map<string, EventEntry[]>();
  const tasksByDate = new Map<string, TaskEntry[]>();
  if (fullSize) {
    events?.forEach(e => {
      const d = datePart(e.start_date);
      if (!eventsByDate.has(d)) eventsByDate.set(d, []);
      eventsByDate.get(d)!.push(e);
    });
    tasks?.forEach(t => {
      if (!t.due_date) return;
      const d = datePart(t.due_date);
      if (!tasksByDate.has(d)) tasksByDate.set(d, []);
      tasksByDate.get(d)!.push(t);
    });
  }

  // Determine how many rows we need
  const totalRows = Math.ceil(cells.length / 7);

  if (fullSize) {
    return (
      <div className="select-none flex flex-col h-full">
        {/* Header: month nav */}
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={prev}
            className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={goToday}
            className="text-lg font-semibold text-gray-800 dark:text-gray-200 hover:text-gray-900 dark:hover:text-gray-100 transition-colors tracking-wide"
          >
            {MONTHS[viewMonth]} {viewYear}
          </button>
          <button
            onClick={next}
            className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
          {DAYS.map(d => (
            <div key={d} className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider py-2">
              {d}
            </div>
          ))}
        </div>

        {/* Full-size date grid */}
        <div className="grid grid-cols-7 flex-1" style={{ gridTemplateRows: `repeat(${totalRows}, minmax(0, 1fr))` }}>
          {cells.map((cell, i) => {
            const isToday = cell.dateStr === todayStr;
            const isSelected = cell.dateStr === selectedDate;
            const cellEvents = eventsByDate.get(cell.dateStr) || [];
            const cellTasks = tasksByDate.get(cell.dateStr) || [];
            const totalItems = cellEvents.length + cellTasks.length;
            const maxVisible = 3;
            const overflow = totalItems - maxVisible;

            return (
              <div
                key={i}
                onClick={() => onDateClick?.(cell.dateStr)}
                className={`
                  border-b border-r border-gray-100 dark:border-gray-700/50 p-1 cursor-pointer transition-colors min-h-[80px]
                  ${cell.inMonth ? '' : 'bg-gray-50/50 dark:bg-gray-800/30'}
                  ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}
                  ${i % 7 === 0 ? 'border-l' : ''}
                  ${i < 7 ? 'border-t' : ''}
                `}
              >
                {/* Day number */}
                <div className="flex items-center justify-between mb-0.5">
                  <span
                    className={`
                      w-6 h-6 flex items-center justify-center rounded-full text-xs
                      ${cell.inMonth ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}
                      ${isToday ? 'bg-blue-600 text-white font-semibold' : ''}
                      ${isSelected && !isToday ? 'bg-blue-100 dark:bg-blue-800 font-medium' : ''}
                    `}
                  >
                    {cell.day}
                  </span>
                </div>
                {/* Events + tasks inline */}
                <div className="space-y-px">
                  {cellEvents.slice(0, maxVisible).map(e => (
                    <div
                      key={e.id}
                      onClick={(ev) => { ev.stopPropagation(); onEventClick?.(e); }}
                      className="flex items-center gap-1 px-1 py-px rounded text-[10px] truncate cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ backgroundColor: (e.color || '#3b82f6') + '20', color: e.color || '#3b82f6' }}
                      title={e.title}
                    >
                      <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: e.color || '#3b82f6' }} />
                      <span className="truncate font-medium">{e.title}</span>
                    </div>
                  ))}
                  {cellTasks.slice(0, Math.max(0, maxVisible - cellEvents.length)).map(t => (
                    <div
                      key={t.id}
                      onClick={(ev) => { ev.stopPropagation(); onTaskClick?.(t); }}
                      className="flex items-center gap-1 px-1 py-px rounded text-[10px] truncate cursor-pointer hover:opacity-80 transition-opacity bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400"
                      title={t.title}
                    >
                      <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: priorityColor(t.priority) }} />
                      <span className="truncate">{t.title}</span>
                    </div>
                  ))}
                  {overflow > 0 && (
                    <div className="text-[9px] text-gray-400 dark:text-gray-500 px-1">
                      +{overflow} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Compact mode (original) ──
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
