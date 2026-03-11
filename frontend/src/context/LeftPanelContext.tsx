import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface LeftPanelState {
  isOpen: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
}

const LeftPanelContext = createContext<LeftPanelState | null>(null);

const STORAGE_KEY = 'basys-left-panel';

export function LeftPanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'open';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, isOpen ? 'open' : 'closed');
    } catch {}
  }, [isOpen]);

  const toggle = () => setIsOpen(prev => !prev);
  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);

  return (
    <LeftPanelContext.Provider value={{ isOpen, toggle, open, close }}>
      {children}
    </LeftPanelContext.Provider>
  );
}

export function useLeftPanel() {
  const ctx = useContext(LeftPanelContext);
  if (!ctx) throw new Error('useLeftPanel must be used within LeftPanelProvider');
  return ctx;
}

/** Safe version that returns null when outside provider (e.g., login page). */
export function useLeftPanelSafe() {
  return useContext(LeftPanelContext);
}
