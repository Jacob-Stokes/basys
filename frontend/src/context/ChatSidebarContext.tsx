import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { PixelManState } from '../components/chat/PixelMan';

interface ChatSidebarState {
  isOpen: boolean;
  activeConversationId: string | null;
  agentState: PixelManState;
  toggle: () => void;
  open: () => void;
  close: () => void;
  setActiveConversationId: (id: string | null) => void;
  setAgentState: (s: PixelManState) => void;
}

const ChatSidebarContext = createContext<ChatSidebarState | null>(null);

const STORAGE_KEY = 'thesys-chat-sidebar';

export function ChatSidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'open';
    } catch {
      return false;
    }
  });
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [agentState, setAgentState] = useState<PixelManState>('idle');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, isOpen ? 'open' : 'closed');
    } catch {}
  }, [isOpen]);

  // Wave when sidebar opens
  useEffect(() => {
    if (isOpen) {
      setAgentState('wave');
      const t = setTimeout(() => setAgentState('idle'), 2000);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const toggle = () => setIsOpen(prev => !prev);
  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);

  return (
    <ChatSidebarContext.Provider value={{ isOpen, activeConversationId, agentState, toggle, open, close, setActiveConversationId, setAgentState }}>
      {children}
    </ChatSidebarContext.Provider>
  );
}

export function useChatSidebar() {
  const ctx = useContext(ChatSidebarContext);
  if (!ctx) throw new Error('useChatSidebar must be used within ChatSidebarProvider');
  return ctx;
}

/** Safe version that returns null when outside provider (e.g., login page). */
export function useChatSidebarSafe() {
  return useContext(ChatSidebarContext);
}
