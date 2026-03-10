import { useState, useCallback, useRef } from 'react';
import { API_URL } from '../api/client';

export interface ToolCall {
  id: string;
  name: string;
  input: any;
  result?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  created_at?: string;
}

export function useChatStream() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (
    conversationId: string,
    content: string,
    onDelta: (text: string) => void,
    onToolUse?: (tool: ToolCall) => void,
    onToolResult?: (toolId: string, result: string) => void,
    onDone?: () => void,
  ) => {
    setIsStreaming(true);
    setError(null);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const response = await fetch(`${API_URL}/api/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
        signal: abort.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);

          try {
            const event = JSON.parse(data);

            switch (event.type) {
              case 'delta':
                onDelta(event.text);
                break;
              case 'tool_use':
                onToolUse?.({ id: event.id, name: event.name, input: event.input });
                break;
              case 'tool_result':
                onToolResult?.(event.id, event.result || event.error || '');
                break;
              case 'done':
                onDone?.();
                break;
              case 'error':
                setError(event.message);
                break;
            }
          } catch {
            // ignore non-JSON lines
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Stream failed');
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { sendMessage, isStreaming, error, cancel };
}
