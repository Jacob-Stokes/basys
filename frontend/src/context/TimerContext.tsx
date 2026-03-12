import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { api } from '../api/client';

// ── Types ──────────────────────────────────────────────────────────
export type TimerMode = 'pomodoro' | 'shortBreak' | 'longBreak';

export interface FocusItem {
  id: string;
  type: 'task' | 'project' | 'sprint' | 'goal' | 'subgoal' | 'habit';
  title: string;
  color?: string;
  parentInfo?: string;
}

export interface HistoryEntry {
  id: string;
  mode: TimerMode;
  duration: number; // seconds actually elapsed
  completedAt: Date;
  links?: FocusItem[];
  synced?: boolean;
}

// ── Constants ──────────────────────────────────────────────────────
export const DURATIONS: Record<TimerMode, number> = {
  pomodoro: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
};

export const MODE_LABELS: Record<TimerMode, string> = {
  pomodoro: 'Pomodoro',
  shortBreak: 'Short Break',
  longBreak: 'Long Break',
};

export const MODE_COLORS: Record<TimerMode, string> = {
  pomodoro: 'bg-red-500',
  shortBreak: 'bg-blue-500',
  longBreak: 'bg-green-500',
};

const STORAGE_KEY = 'basys-pomo-history';
const TIMER_STATE_KEY = 'basys-pomo-timer';

interface PersistedTimerState {
  mode: TimerMode;
  startedAt: number;
  totalSeconds: number;
  focusItems: FocusItem[];
}

// ── Helpers ────────────────────────────────────────────────────────
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function saveTimerState(state: PersistedTimerState | null): void {
  if (state) {
    localStorage.setItem(TIMER_STATE_KEY, JSON.stringify(state));
  } else {
    localStorage.removeItem(TIMER_STATE_KEY);
  }
}

function loadTimerState(): { mode: TimerMode; timeLeft: number; running: boolean; focusItems: FocusItem[] } {
  try {
    const raw = localStorage.getItem(TIMER_STATE_KEY);
    if (!raw) return { mode: 'pomodoro', timeLeft: DURATIONS.pomodoro, running: false, focusItems: [] };
    const state: PersistedTimerState = JSON.parse(raw);
    const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
    const timeLeft = Math.max(0, state.totalSeconds - elapsed);
    if (timeLeft <= 0) {
      localStorage.removeItem(TIMER_STATE_KEY);
      return { mode: state.mode, timeLeft: DURATIONS[state.mode], running: false, focusItems: [] };
    }
    return { mode: state.mode, timeLeft, running: true, focusItems: state.focusItems || [] };
  } catch {
    return { mode: 'pomodoro', timeLeft: DURATIONS.pomodoro, running: false, focusItems: [] };
  }
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((e: any) => ({
      ...e,
      completedAt: new Date(e.completedAt),
    }));
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 100)));
}

// ── Context ────────────────────────────────────────────────────────
interface TimerContextValue {
  mode: TimerMode;
  timeLeft: number;
  running: boolean;
  history: HistoryEntry[];
  focusItems: FocusItem[];
  start: () => void;
  stop: () => void;
  reset: () => void;
  switchMode: (mode: TimerMode) => void;
  addFocusItem: (item: FocusItem) => void;
  removeFocusItem: (id: string) => void;
  clearFocusItems: () => void;
  startWithFocus: (items: FocusItem[], durationMinutes?: number) => void;
}

const TimerContext = createContext<TimerContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────
export function TimerProvider({ children }: { children: ReactNode }) {
  const initial = loadTimerState();
  const [mode, setMode] = useState<TimerMode>(initial.mode);
  const [timeLeft, setTimeLeft] = useState(initial.timeLeft);
  const [running, setRunning] = useState(initial.running);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const [focusItems, setFocusItems] = useState<FocusItem[]>(initial.focusItems);

  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const modeRef = useRef(mode);
  const focusRef = useRef(focusItems);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { focusRef.current = focusItems; }, [focusItems]);

  // Load history from backend on mount
  useEffect(() => {
    api.getPomodoros({ limit: '50' }).then((sessions: any[]) => {
      if (!Array.isArray(sessions) || sessions.length === 0) return;
      const backendHistory: HistoryEntry[] = sessions
        .filter((s: any) => s.status === 'completed')
        .map((s: any) => ({
          id: s.id,
          mode: 'pomodoro' as TimerMode,
          duration: (s.duration_minutes || 25) * 60,
          completedAt: new Date(s.ended_at || s.started_at),
          links: (s.links || []).map((l: any) => ({
            id: l.target_id,
            type: l.target_type,
            title: l.target_title || 'Unknown',
          })),
          synced: true,
        }));
      // Merge: backend entries replace localStorage entries by id
      setHistory(prev => {
        const backendIds = new Set(backendHistory.map(e => e.id));
        const localOnly = prev.filter(e => !backendIds.has(e.id) && !e.synced);
        return [...localOnly, ...backendHistory].sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
      });
    }).catch(() => { /* offline — keep localStorage history */ });
  }, []);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const syncToBackend = useCallback((entryMode: TimerMode, durationSecs: number, items: FocusItem[]) => {
    if (entryMode !== 'pomodoro' || durationSecs < 60) return;
    api.createPomodoro({
      duration_minutes: Math.round(durationSecs / 60),
      links: items.map(f => ({ target_type: f.type, target_id: f.id })),
    }).catch((err: unknown) => console.error('Failed to sync pomo:', err));
  }, []);

  const addHistoryEntry = useCallback((entryMode: TimerMode, duration: number) => {
    if (duration < 1) return;
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      mode: entryMode,
      duration,
      completedAt: new Date(),
      links: [...focusRef.current],
      synced: false,
    };
    setHistory(prev => {
      const next = [entry, ...prev];
      saveHistory(next);
      return next;
    });
    syncToBackend(entryMode, duration, focusRef.current);
  }, [syncToBackend]);

  // Tick logic
  useEffect(() => {
    if (!running) return;

    startTimeRef.current = Date.now();
    const totalAtStart = timeLeft;
    const currentMode = modeRef.current;

    saveTimerState({ mode: currentMode, startedAt: startTimeRef.current, totalSeconds: totalAtStart, focusItems: focusRef.current });

    intervalRef.current = setInterval(() => {
      if (startTimeRef.current === null) return;
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const remaining = Math.max(0, totalAtStart - elapsed);
      elapsedRef.current = DURATIONS[currentMode] - remaining;
      setTimeLeft(remaining);

      if (remaining <= 0) {
        stopInterval();
        setRunning(false);
        saveTimerState(null);
        addHistoryEntry(currentMode, DURATIONS[currentMode]);
      }
    }, 250);

    return () => stopInterval();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const start = useCallback(() => {
    if (timeLeft <= 0) {
      setTimeLeft(DURATIONS[modeRef.current]);
      elapsedRef.current = 0;
    }
    setRunning(true);
  }, [timeLeft]);

  const stop = useCallback(() => {
    setRunning(false);
    stopInterval();
    saveTimerState(null);
    addHistoryEntry(modeRef.current, elapsedRef.current);
    elapsedRef.current = 0;
  }, [stopInterval, addHistoryEntry]);

  const reset = useCallback(() => {
    setRunning(false);
    stopInterval();
    saveTimerState(null);
    setTimeLeft(DURATIONS[modeRef.current]);
    elapsedRef.current = 0;
  }, [stopInterval]);

  const switchMode = useCallback((newMode: TimerMode) => {
    if (running) return;
    setMode(newMode);
    setTimeLeft(DURATIONS[newMode]);
    elapsedRef.current = 0;
  }, [running]);

  const addFocusItem = useCallback((item: FocusItem) => {
    setFocusItems(prev => {
      if (prev.some(f => f.id === item.id)) return prev;
      return [...prev, item];
    });
  }, []);

  const removeFocusItem = useCallback((id: string) => {
    setFocusItems(prev => prev.filter(f => f.id !== id));
  }, []);

  const clearFocusItems = useCallback(() => {
    setFocusItems([]);
  }, []);

  const startWithFocus = useCallback((items: FocusItem[], durationMinutes?: number) => {
    const newMode: TimerMode = 'pomodoro';
    const totalSeconds = (durationMinutes || 25) * 60;
    setFocusItems(items);
    setMode(newMode);
    modeRef.current = newMode;
    focusRef.current = items;
    setTimeLeft(totalSeconds);
    elapsedRef.current = 0;
    saveTimerState({ mode: newMode, startedAt: Date.now(), totalSeconds, focusItems: items });
    setRunning(true);
  }, []);

  // Listen for agent-initiated timer starts
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const minutes = detail?.duration_minutes ?? 25;
      const items: FocusItem[] = detail?.focusItems ?? [];
      startWithFocus(items, minutes);
    };
    window.addEventListener('basys:timer-start', handler);
    return () => window.removeEventListener('basys:timer-start', handler);
  }, [startWithFocus]);

  return (
    <TimerContext.Provider value={{
      mode, timeLeft, running, history, focusItems,
      start, stop, reset, switchMode,
      addFocusItem, removeFocusItem, clearFocusItems, startWithFocus,
    }}>
      {children}
    </TimerContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────
export function useTimer(): TimerContextValue {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error('useTimer must be used within a TimerProvider');
  return ctx;
}
