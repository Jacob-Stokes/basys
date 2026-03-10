import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface ChatSidebarState {
  isOpen: boolean;
  activeConversationId: string | null;
  toggle: () => void;
  open: () => void;
  close: () => void;
  setActiveConversationId: (id: string | null) => void;
}

const ChatSidebarContext = createContext<ChatSidebarState | null>(null);

const STORAGE_KEY = 'basys-chat-sidebar';

export function ChatSidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'open';
    } catch {
      return false;
    }
  });
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, isOpen ? 'open' : 'closed');
    } catch {}
  }, [isOpen]);

  const toggle = () => setIsOpen(prev => !prev);
  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);

  return (
    <ChatSidebarContext.Provider value={{ isOpen, activeConversationId, toggle, open, close, setActiveConversationId }}>
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
