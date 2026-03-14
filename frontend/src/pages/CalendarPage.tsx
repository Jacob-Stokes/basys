import { useState, useEffect } from 'react';
import Calendar from '../components/Calendar';
import { api } from '../api/client';
import TaskEditModal from '../components/TaskEditModal';
import { useModKeySubmit } from '../hooks/useModKeySubmit';

interface EventItem {
  id: string;
  title: string;
  start_date: string;
  end_date?: string;
  all_day?: boolean;
  color: string;
  description?: string;
  location?: string;
  source?: 'local' | 'google';
  html_link?: string | null;
  google_event_id?: string;
  calendar_id?: string;
  origin?: 'thesys' | 'google';
}

function datePart(d: string) { return d.slice(0, 10); }

// ── Event Edit Modal (shared with Tasks.tsx) ─────────────────────
const EVENT_COLORS = ['#3b82f6','#ef4444','#f59e0b','#10b981','#8b5cf6','#ec4899','#06b6d4','#f97316'];

function EventEditModal({ event, onSave, onDelete, onClose }: {
  event: EventItem;
  onSave: (data: { title: string; description: string | null; start_date: string; end_date: string | null; all_day: boolean; color: string; location: string | null }) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const toInputVal = (v: string | null | undefined, allDay: boolean) => {
    if (!v) return '';
    if (allDay) return v.slice(0, 10);
    if (v.includes('T')) return v.slice(0, 16);
    return v;
  };

  const isReadOnly = !!(event.source === 'google' && event.calendar_id && event.calendar_id.includes('#holiday@group'));
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description || '');
  const [allDay, setAllDay] = useState(!!event.all_day);
  const [startDate, setStartDate] = useState(toInputVal(event.start_date, !!event.all_day));
  const [endDate, setEndDate] = useState(toInputVal(event.end_date, !!event.all_day));
  const [location, setLocation] = useState(event.location || '');
  const [color, setColor] = useState(event.color || '#3b82f6');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    let start = startDate;
    let end = endDate || null;
    if (allDay) {
      start = start.slice(0, 10);
      if (end) end = end.slice(0, 10);
    } else if (start && !start.includes('T')) {
      start = start + 'T00:00:00';
    }
    onSave({ title: title.trim(), description: description || null, start_date: start, end_date: end, all_day: allDay, color, location: location || null });
  };

  useModKeySubmit(true, () => handleSubmit({ preventDefault: () => {} } as React.FormEvent), !!title.trim() && !isReadOnly);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{isReadOnly ? 'Event Details' : 'Edit Event'}</h3>
          <div className="flex items-center gap-2">
            {event.source === 'google' && <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">Google</span>}
            {event.source === 'local' && <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full font-medium">Local</span>}
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Title</label>
            <input autoFocus type="text" value={title} onChange={e => setTitle(e.target.value)} readOnly={isReadOnly}
              className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 ${isReadOnly ? 'opacity-70 cursor-default' : ''}`}
              placeholder="Event title" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Event description" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="cal-event-all-day" checked={allDay}
              onChange={e => { setAllDay(e.target.checked); if (e.target.checked) { setStartDate(startDate.slice(0,10)); setEndDate(endDate ? endDate.slice(0,10) : ''); } else { if (startDate && !startDate.includes('T')) setStartDate(startDate+'T09:00'); if (endDate && !endDate.includes('T')) setEndDate(endDate+'T10:00'); }}}
              className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500" />
            <label htmlFor="cal-event-all-day" className="text-sm text-gray-700 dark:text-gray-300">All day</label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Start</label>
              <input type={allDay ? 'date' : 'datetime-local'} value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">End</label>
              <input type={allDay ? 'date' : 'datetime-local'} value={endDate} onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Location</label>
            <input type="text" value={location} onChange={e => setLocation(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500"
              placeholder="Event location" />
          </div>
          {event.source !== 'google' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Color</label>
              <div className="flex items-center gap-2">
                {EVENT_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setColor(c)}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${color === c ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent hover:scale-105'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          )}
          {event.source === 'google' && event.html_link && (
            <a href={event.html_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              View in Google Calendar
            </a>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
            <div>
              {isReadOnly ? (
                <span className="text-xs text-gray-400 dark:text-gray-500 italic">Read-only observance</span>
              ) : !confirmDelete ? (
                <button type="button" onClick={() => setConfirmDelete(true)} className="text-sm text-red-500 hover:text-red-700 dark:text-red-400">Delete</button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-500">Confirm?</span>
                  <button type="button" onClick={onDelete} className="text-xs font-medium text-red-600 hover:text-red-800 dark:text-red-400">Yes, delete</button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">{isReadOnly ? 'Close' : 'Cancel'}</button>
              {!isReadOnly && <button type="submit" disabled={!title.trim()} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">Save</button>}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── CalendarPage ─────────────────────────────────────────────────

type ViewMode = 'month' | 'year';

export default function CalendarPage({ embedded }: { embedded?: boolean }) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [editingTask, setEditingTask] = useState<any | null>(null);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [yearViewYear, setYearViewYear] = useState(new Date().getFullYear());

  const [gcalConnected, setGcalConnected] = useState(false);

  const loadData = async () => {
    try {
      const [localEvents, googleEvents, taskList] = await Promise.all([
        api.getEvents(),
        api.getGoogleCalendarEvents().catch(() => []),
        api.getTasks({ include_done: '0' }),
      ]);
      const localWithSource = localEvents.map((e: any) => ({ ...e, source: 'local' as const, origin: 'thesys' as const }));
      const googleWithSource = googleEvents.map((e: any) => ({ ...e, source: 'google' as const, origin: 'google' as const }));
      const localGoogleIds = new Set(localWithSource.filter((e: any) => e.google_event_id).map((e: any) => e.google_event_id));
      const deduped = googleWithSource.filter((e: any) => !localGoogleIds.has(e.google_event_id));
      setEvents([...localWithSource, ...deduped]);
      setTasks(taskList);
    } catch (err) {
      console.warn('CalendarPage data load failed:', err);
    }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    api.getGoogleCalendarStatus().then((s: any) => {
      setGcalConnected(s.connected);
    }).catch(() => {});
  }, []);

  const handleRefresh = async () => {
    setSyncing(true);
    try {
      if (gcalConnected) await api.syncGoogleCalendar();
      await loadData();
    } catch (err) {
      console.warn('Calendar refresh failed:', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleEventSave = async (data: { title: string; description: string | null; start_date: string; end_date: string | null; all_day: boolean; color: string; location: string | null }) => {
    if (!editingEvent) return;
    try {
      if (editingEvent.source === 'google' && editingEvent.google_event_id && editingEvent.calendar_id) {
        await api.updateGoogleCalendarEvent(editingEvent.google_event_id, {
          calendar_id: editingEvent.calendar_id,
          title: data.title, description: data.description, start_date: data.start_date,
          end_date: data.end_date, all_day: data.all_day, location: data.location,
        });
        await api.syncGoogleCalendar();
      } else {
        await api.updateEvent(editingEvent.id, data);
      }
      await loadData();
      setEditingEvent(null);
    } catch (err) {
      console.warn('Failed to save event:', err);
    }
  };

  const handleEventDelete = async () => {
    if (!editingEvent) return;
    try {
      if (editingEvent.source === 'google' && editingEvent.google_event_id && editingEvent.calendar_id) {
        await api.deleteGoogleCalendarEvent(editingEvent.google_event_id, editingEvent.calendar_id);
        await api.syncGoogleCalendar();
      } else {
        await api.deleteEvent(editingEvent.id);
      }
      await loadData();
      setEditingEvent(null);
    } catch (err) {
      console.warn('Failed to delete event:', err);
    }
  };

  const taskDates = new Set(tasks.filter(t => t.due_date && !t.done).map(t => datePart(t.due_date)));
  const eventDateColors = new Map<string, string[]>();
  events.forEach(e => {
    const d = datePart(e.start_date);
    if (!eventDateColors.has(d)) eventDateColors.set(d, []);
    eventDateColors.get(d)!.push(e.color || '#3b82f6');
  });

  const calendarEvents = events.map(e => ({
    id: e.id, title: e.title, color: e.color || '#3b82f6', all_day: e.all_day, start_date: e.start_date,
  }));
  const calendarTasks = tasks.filter(t => t.due_date && !t.done).map(t => ({
    id: t.id, title: t.title, priority: t.priority, due_date: t.due_date,
  }));

  const dayTasks = selectedDate ? tasks.filter(t => t.due_date && datePart(t.due_date) === selectedDate && !t.done) : [];
  const dayEvents = selectedDate ? events.filter(e => datePart(e.start_date) === selectedDate) : [];

  return (
    <div className={`${embedded ? '' : 'min-h-screen bg-gray-100 dark:bg-gray-900'} flex flex-col`} style={embedded ? { height: 'calc(100vh - 80px)' } : {}}>
      <div className="container mx-auto px-4 sm:px-8 pt-3 pb-4 flex flex-col flex-1 min-h-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewMode('month')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${viewMode === 'month' ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              Month
            </button>
            <button
              onClick={() => setViewMode('year')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${viewMode === 'year' ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              Year
            </button>
          </div>
          <button
            onClick={handleRefresh}
            disabled={syncing}
            title="Refresh calendar"
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {viewMode === 'month' ? (
          <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
            {/* Full-size calendar */}
            <div className={`${selectedDate ? 'lg:w-3/4' : 'w-full'} transition-all duration-200 flex flex-col min-h-0`}>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 flex flex-col flex-1 min-h-0">
                <Calendar
                  fullSize
                  taskDates={taskDates}
                  eventDateColors={eventDateColors}
                  selectedDate={selectedDate}
                  onDateClick={(date) => setSelectedDate(date === selectedDate ? null : date)}
                  events={calendarEvents}
                  tasks={calendarTasks}
                  onEventClick={(e) => {
                    const full = events.find(ev => ev.id === e.id);
                    if (full) setEditingEvent(full);
                  }}
                  onTaskClick={(t) => {
                    const full = tasks.find(ft => ft.id === t.id);
                    if (full) setEditingTask(full);
                  }}
                />
              </div>
            </div>

            {/* Side panel */}
            {selectedDate && (
              <div className="lg:w-1/4">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 sticky top-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                    </h3>
                    <button onClick={() => setSelectedDate(null)} className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {dayEvents.length === 0 && dayTasks.length === 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 italic">Nothing scheduled</p>
                  )}

                  {dayEvents.length > 0 && (
                    <div className="mb-3">
                      <h4 className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Events</h4>
                      <ul className="space-y-1">
                        {dayEvents.map(e => (
                          <li key={e.id} className="flex items-center gap-2 text-sm px-2 py-1.5 -mx-2 rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                            onClick={() => setEditingEvent(e)}>
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: e.color }} />
                            <span className="text-gray-700 dark:text-gray-300 truncate">{e.title}</span>
                            {!e.all_day && e.start_date.includes('T') && (
                              <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0 ml-auto">{e.start_date.slice(11, 16)}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {dayTasks.length > 0 && (
                    <div>
                      <h4 className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Tasks due</h4>
                      <ul className="space-y-1">
                        {dayTasks.map(t => (
                          <li key={t.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750 rounded px-2 py-1.5 -mx-2 transition-colors"
                            onClick={() => setEditingTask(t)}>
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.priority >= 3 ? '#f97316' : '#9ca3af' }} />
                            <span className="text-gray-700 dark:text-gray-300 truncate">{t.title}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Year view */
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
              {/* Year nav */}
              <div className="flex items-center justify-center gap-4 mb-4">
                <button onClick={() => setYearViewYear(y => y - 1)} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                </button>
                <button onClick={() => setYearViewYear(new Date().getFullYear())} className="text-lg font-semibold text-gray-800 dark:text-gray-200 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
                  {yearViewYear}
                </button>
                <button onClick={() => setYearViewYear(y => y + 1)} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
              {/* 4x3 grid of mini calendars */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 12 }, (_, month) => (
                  <div key={month} className="border border-gray-100 dark:border-gray-700/50 rounded-lg p-2">
                    <MiniMonthCalendar
                      year={yearViewYear}
                      month={month}
                      taskDates={taskDates}
                      eventDateColors={eventDateColors}
                      onDateClick={(date) => {
                        setSelectedDate(date);
                        setViewMode('month');
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {editingEvent && (
        <EventEditModal
          event={editingEvent}
          onSave={handleEventSave}
          onDelete={handleEventDelete}
          onClose={() => setEditingEvent(null)}
        />
      )}

      {editingTask && (
        <TaskEditModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSave={async (id, updates) => {
            await api.updateTask(id, updates);
            await loadData();
            setEditingTask(null);
          }}
          onDelete={async (id) => {
            await api.deleteTask(id);
            await loadData();
            setEditingTask(null);
          }}
        />
      )}
    </div>
  );
}

// ── Mini Month Calendar (for year view) ──────────────────────────

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(n: number) { return n.toString().padStart(2, '0'); }
function toDateStr(y: number, m: number, d: number) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

function MiniMonthCalendar({ year, month, taskDates, eventDateColors, onDateClick }: {
  year: number;
  month: number;
  taskDates: Set<string>;
  eventDateColors: Map<string, string[]>;
  onDateClick: (date: string) => void;
}) {
  const now = new Date();
  const todayStr = toDateStr(now.getFullYear(), now.getMonth(), now.getDate());
  const firstDay = new Date(year, month, 1).getDay();
  const startOffset = (firstDay + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: { day: number; inMonth: boolean; dateStr: string }[] = [];
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const m = month === 0 ? 11 : month - 1;
    const y = month === 0 ? year - 1 : year;
    cells.push({ day: d, inMonth: false, dateStr: toDateStr(y, m, d) });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, inMonth: true, dateStr: toDateStr(year, month, d) });
  }
  const remaining = Math.ceil(cells.length / 7) * 7 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const m = month === 11 ? 0 : month + 1;
    const y = month === 11 ? year + 1 : year;
    cells.push({ day: d, inMonth: false, dateStr: toDateStr(y, m, d) });
  }

  return (
    <div className="select-none">
      <div className="text-center text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">{MONTH_NAMES[month]}</div>
      <div className="grid grid-cols-7 mb-0.5">
        {DAYS.map((d, i) => (
          <div key={i} className="text-center text-[9px] text-gray-400 dark:text-gray-500 font-medium">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          const isToday = cell.dateStr === todayStr;
          const hasTask = taskDates.has(cell.dateStr);
          const hasEvent = eventDateColors.has(cell.dateStr);
          const hasDot = hasTask || hasEvent;

          return (
            <button
              key={i}
              onClick={() => onDateClick(cell.dateStr)}
              className={`relative flex flex-col items-center justify-center py-0.5 text-[10px] transition-colors
                ${cell.inMonth ? 'text-gray-700 dark:text-gray-300' : 'text-gray-300 dark:text-gray-600'}
                hover:bg-gray-100 dark:hover:bg-gray-700 rounded
              `}
            >
              <span className={`w-5 h-5 flex items-center justify-center rounded-full ${isToday ? 'bg-blue-600 text-white font-semibold' : ''}`}>
                {cell.day}
              </span>
              {hasDot && !isToday && (
                <span className="absolute bottom-0 w-1 h-1 rounded-full" style={{ backgroundColor: hasEvent ? (eventDateColors.get(cell.dateStr)?.[0] || '#3b82f6') : '#9ca3af' }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
