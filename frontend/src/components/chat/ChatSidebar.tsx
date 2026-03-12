import { useState, useEffect, useCallback } from 'react';
import { useChatSidebar } from '../../context/ChatSidebarContext';
import { usePanelSwap } from '../../hooks/usePanelSwap';
import { useChatStream, ChatMessage, ToolCall } from '../../hooks/useChatStream';
import { api } from '../../api/client';
import ChatMessageList from './ChatMessageList';
import ChatInput from './ChatInput';

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

export default function ChatSidebar() {
  const { isOpen, close, activeConversationId, setActiveConversationId, setAgentState } = useChatSidebar();
  const { sendMessage, isStreaming, error, cancel } = useChatStream();

  // Drive pixel man state from streaming
  useEffect(() => {
    if (isStreaming) {
      setAgentState('talking');
    } else {
      setAgentState('idle');
    }
  }, [isStreaming, setAgentState]);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showList, setShowList] = useState(false);
  const [creatingConv, setCreatingConv] = useState(false);

  // Load conversations when sidebar opens; auto-select latest if none active
  useEffect(() => {
    if (!isOpen) return;
    api.listConversations().then(convs => {
      setConversations(convs);
      if (!activeConversationId && convs.length > 0) {
        setActiveConversationId(convs[0].id);
      }
    }).catch(() => {});
  }, [isOpen]);

  // Load messages when active conversation changes (handles selecting from list)
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }
    api.getConversation(activeConversationId).then((conv: any) => {
      setMessages(parseStoredMessages(conv.messages || []));
    }).catch(() => {});
  }, [activeConversationId]);

  const handleNewConversation = useCallback(async () => {
    setCreatingConv(true);
    try {
      const conv = await api.createConversation(); // blocks until greeting is in DB
      const loaded = await api.getConversation(conv.id);
      setMessages(parseStoredMessages(loaded.messages || []));
      setActiveConversationId(conv.id);
      setConversations(prev => [conv, ...prev]);
      setShowList(false);
    } catch {} finally {
      setCreatingConv(false);
    }
  }, [setActiveConversationId]);

  const handleSend = useCallback(async (content: string) => {
    setAgentState('thinking');
    let convId = activeConversationId;

    // Auto-create conversation if none active
    if (!convId) {
      setCreatingConv(true);
      try {
        const conv = await api.createConversation(); // blocks until greeting is in DB
        convId = conv.id;
        setActiveConversationId(conv.id);
        setConversations(prev => [conv, ...prev]);
        // Load greeting so it shows before the user's streaming reply
        const loaded = await api.getConversation(conv.id);
        setMessages(parseStoredMessages(loaded.messages || []));
      } catch {
        setCreatingConv(false);
        return;
      }
      setCreatingConv(false);
    }

    // Add user message optimistically
    const userMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content,
    };
    setMessages(prev => [...prev, userMsg]);

    // Add placeholder assistant message
    const assistantId = `assistant-${Date.now()}`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      toolCalls: [],
    };
    setMessages(prev => [...prev, assistantMsg]);

    await sendMessage(
      convId!,
      content,
      // onDelta
      (text) => {
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: m.content + text } : m
        ));
      },
      // onToolUse — also trigger side effects (e.g. start timer when agent creates a pomodoro)
      (tool: ToolCall) => {
        if ((tool.name === 'manage_pomodoro' || tool.name === 'mcp__thesys__manage_pomodoro') && tool.input?.action === 'create') {
          const minutes = tool.input?.duration_minutes ?? 25;
          window.dispatchEvent(new CustomEvent('thesys:timer-start', { detail: { duration_minutes: minutes } }));
        }
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, toolCalls: [...(m.toolCalls || []), tool] } : m
        ));
      },
      // onToolResult
      (toolId: string, result: string) => {
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, toolCalls: (m.toolCalls || []).map(t => t.id === toolId ? { ...t, result } : t) }
            : m
        ));
      },
      // onDone — refresh conversation list to get updated title
      () => {
        api.listConversations().then(setConversations).catch(() => {});
      },
    );
  }, [activeConversationId, setActiveConversationId, sendMessage]);

  const handleDeleteConversation = useCallback(async (id: string) => {
    try {
      await api.deleteConversation(id);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch {}
  }, [activeConversationId, setActiveConversationId]);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
    setShowList(false);
  }, [setActiveConversationId]);

  const activeTitle = conversations.find(c => c.id === activeConversationId)?.title || 'New conversation';
  const swapped = usePanelSwap();

  // When swapped, chat sidebar lives on the left side
  const side = swapped ? 'left-0' : 'right-0';
  const border = swapped ? 'border-r' : 'border-l';
  const hiddenTranslate = swapped ? '-translate-x-full' : 'translate-x-full';

  return (
    <div
      className={`fixed top-14 ${side} bottom-0 w-full sm:w-[300px] bg-white dark:bg-gray-800 ${border} border-gray-200 dark:border-gray-700 z-20 flex flex-col shadow-xl transition-transform duration-200 ease-in-out ${
        isOpen ? 'translate-x-0' : `${hiddenTranslate} pointer-events-none`
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => setShowList(!showList)}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
            title="Conversations"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
            {activeTitle}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleNewConversation}
            disabled={creatingConv}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
            title="New conversation"
          >
            {creatingConv ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            )}
          </button>
          <button
            onClick={close}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
            title="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Conversation list overlay */}
      {showList && (
        <div className="absolute top-10 left-0 right-0 bottom-0 bg-white dark:bg-gray-800 z-10 overflow-y-auto">
          <div className="p-2 space-y-1">
            {conversations.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">No conversations yet</p>
            )}
            {conversations.map(conv => (
              <div
                key={conv.id}
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded text-sm cursor-pointer ${
                  conv.id === activeConversationId
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
                onClick={() => handleSelectConversation(conv.id)}
              >
                <span className="truncate">{conv.title}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv.id); }}
                  className="shrink-0 p-0.5 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="px-3 py-1.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs">
          {error}
        </div>
      )}

      {/* Messages */}
      <ChatMessageList messages={messages} />

      {/* Input */}
      <ChatInput onSend={handleSend} disabled={isStreaming || creatingConv} />

      {/* Cancel streaming */}
      {isStreaming && (
        <div className="px-3 pb-2">
          <button
            onClick={cancel}
            className="w-full text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Stop generating
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Parse stored messages from the DB format to ChatMessage format.
 */
function parseStoredMessages(stored: any[]): ChatMessage[] {
  return stored.map(msg => {
    let content = '';
    let toolCalls: ToolCall[] = [];

    try {
      const parsed = JSON.parse(msg.content);
      if (typeof parsed === 'string') {
        content = parsed;
      } else if (Array.isArray(parsed)) {
        // Claude content blocks
        for (const block of parsed) {
          if (block.type === 'text') {
            content += block.text;
          } else if (block.type === 'tool_use') {
            toolCalls.push({ id: block.id, name: block.name, input: block.input });
          } else if (block.type === 'tool_result') {
            const tool = toolCalls.find(t => t.id === block.tool_use_id);
            if (tool) tool.result = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
          }
        }
      } else {
        content = msg.content;
      }
    } catch {
      content = msg.content;
    }

    return {
      id: msg.id,
      role: msg.role,
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      created_at: msg.created_at,
    };
  });
}
