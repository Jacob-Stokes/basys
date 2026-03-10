import { useRef, useEffect } from 'react';
import ChatMessage from './ChatMessage';
import type { ChatMessage as ChatMessageType } from '../../hooks/useChatStream';

interface ChatMessageListProps {
  messages: ChatMessageType[];
}

export default function ChatMessageList({ messages }: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center">
          Ask me anything about your goals, tasks, or habits.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {messages.map(msg => (
        <ChatMessage key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
