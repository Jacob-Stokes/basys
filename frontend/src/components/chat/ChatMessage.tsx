import ReactMarkdown from 'react-markdown';
import ToolCallDisplay from './ToolCallDisplay';
import type { ChatMessage as ChatMessageType } from '../../hooks/useChatStream';

interface ChatMessageProps {
  message: ChatMessageType;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
        isUser
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
      }`}>
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <>
            {message.toolCalls?.map(tool => (
              <ToolCallDisplay key={tool.id} tool={tool} />
            ))}
            <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
