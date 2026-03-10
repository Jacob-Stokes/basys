import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';

// ── Types ──────────────────────────────────────────────────────────
export type TimerMode = 'pomodoro' | 'shortBreak' | 'longBreak';

export interface HistoryEntry {
  id: string;
  mode: TimerMode;
  duration: number; // seconds actually elapsed
  completedAt: Date;
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

// ── Helpers ────────────────────────────────────────────────────────
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((e: { id: string; mode: TimerMode; duration: number; completedAt: string }) => ({
      ...e,
      completedAt: new Date(e.completedAt),
    }));
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

// ── Context ────────────────────────────────────────────────────────
interface TimerContextValue {
  mode: TimerMode;
  timeLeft: number;
  running: boolean;
  history: HistoryEntry[];
  start: () => void;
  stop: () => void;
  reset: () => void;
  switchMode: (mode: TimerMode) => void;
}

const TimerContext = createContext<TimerContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────
export function TimerProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<TimerMode>('pomodoro');
  const [timeLeft, setTimeLeft] = useState(DURATIONS.pomodoro);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);

  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);

  // Stable ref for mode so the interval callback always reads the latest value
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const addHistoryEntry = useCallback((entryMode: TimerMode, duration: number) => {
    if (duration < 1) return;
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      mode: entryMode,
      duration,
      completedAt: new Date(),
    };
    setHistory(prev => {
      const next = [entry, ...prev];
      saveHistory(next);
      return next;
    });
  }, []);

  // Tick logic — runs in the provider so it survives route changes
  useEffect(() => {
    if (!running) return;

    startTimeRef.current = Date.now();
    const totalAtStart = timeLeft;
    const currentMode = modeRef.current;

    intervalRef.current = setInterval(() => {
      if (startTimeRef.current === null) return;
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const remaining = Math.max(0, totalAtStart - elapsed);
      elapsedRef.current = DURATIONS[currentMode] - remaining;
      setTimeLeft(remaining);

      if (remaining <= 0) {
        stopInterval();
        setRunning(false);
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
    addHistoryEntry(modeRef.current, elapsedRef.current);
    elapsedRef.current = 0;
  }, [stopInterval, addHistoryEntry]);

  const reset = useCallback(() => {
    setRunning(false);
    stopInterval();
    setTimeLeft(DURATIONS[modeRef.current]);
    elapsedRef.current = 0;
  }, [stopInterval]);

  const switchMode = useCallback((newMode: TimerMode) => {
    if (running) return;
    setMode(newMode);
    setTimeLeft(DURATIONS[newMode]);
    elapsedRef.current = 0;
  }, [running]);

  return (
    <TimerContext.Provider value={{ mode, timeLeft, running, history, start, stop, reset, switchMode }}>
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
