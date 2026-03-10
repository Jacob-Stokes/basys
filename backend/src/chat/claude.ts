/**
 * Claude chat client using the Agent SDK.
 * Auth: uses Claude Max subscription via mounted ~/.claude credentials.
 * Tools: exposed via in-process MCP server so the agent can read/write Basys data.
 */

import { Response as ExpressResponse } from 'express';
import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { executeToolCall, CLAUDE_TOOLS } from './toolRegistry';
import { buildSystemPrompt } from './systemPrompt';

const MODEL = process.env.CLAUDE_MODEL || 'sonnet';
const MAX_TURNS = 10;

interface Message {
  role: 'user' | 'assistant';
  content: any;
}

/**
 * Build an in-process MCP server exposing Basys tools for a specific user.
 */
function buildMcpServer(userId: string) {
  const mcpTools = CLAUDE_TOOLS.map((t) =>
    tool(
      t.name,
      t.description,
      // Convert JSON Schema to a Zod passthrough schema
      // The Agent SDK needs Zod but our tools use JSON schema — use z.object({}).passthrough()
      // and rely on our own handler for validation
      z.object({}).passthrough() as any,
      async (args: any) => {
        try {
          const result = executeToolCall(t.name, args, userId);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (err: any) {
          return {
            content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
            isError: true,
          };
        }
      },
    )
  );

  return createSdkMcpServer({
    name: 'basys',
    version: '1.0.0',
    tools: mcpTools,
  });
}

/**
 * Run a silent warmup exchange when a conversation is created.
 * Sends a hidden "session started" prompt and returns the greeting text.
 * Not streamed — result is returned directly so the caller can save it to DB.
 */
export async function warmupConversation(userId: string): Promise<string> {
  const systemPrompt = buildSystemPrompt(userId);
  const mcpServer = buildMcpServer(userId);

  let greeting = '';

  for await (const message of query({
    prompt: 'The user just opened the chat sidebar. Greet them briefly (1-2 sentences max) and mention one thing you noticed about their current goals or tasks if they have any. Be warm and natural — not robotic.',
    options: {
      systemPrompt,
      model: MODEL,
      maxTurns: 1,
      mcpServers: { basys: mcpServer },
      allowedTools: ['mcp__basys__*'],
      disallowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'NotebookEdit'],
      persistSession: false,
    },
  })) {
    if (message.type === 'assistant') {
      const msg = (message as any).message;
      if (msg?.content) {
        for (const block of msg.content) {
          if (block.type === 'text') greeting = block.text;
        }
      }
    } else if (message.type === 'result') {
      const result = (message as any).result;
      if (typeof result === 'string' && result) greeting = result;
    }
  }

  return greeting || 'Hey! Ready when you are.';
}

/**
 * Stream a chat response via SSE using the Claude Agent SDK.
 */
export async function streamChatResponse(
  userId: string,
  messages: Message[],
  res: ExpressResponse,
  onComplete: (assistantContent: any[]) => void,
): Promise<void> {
  const systemPrompt = buildSystemPrompt(userId);

  // Build prompt from conversation history
  // The Agent SDK takes a single prompt string, so we serialize the conversation
  // into a format Claude can understand
  const lastUserMessage = messages.filter(m => m.role === 'user').pop();
  const prompt = typeof lastUserMessage?.content === 'string'
    ? lastUserMessage.content
    : JSON.stringify(lastUserMessage?.content || 'Hello');

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const contentBlocks: any[] = [];
  let fullText = '';

  try {
    const mcpServer = buildMcpServer(userId);

    // Build conversation context from history (exclude last user message since that's the prompt)
    const historyContext = messages.slice(0, -1).map(m => {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return `${m.role === 'user' ? 'User' : 'Assistant'}: ${content}`;
    }).join('\n\n');

    const fullSystemPrompt = historyContext
      ? `${systemPrompt}\n\n## Conversation History\n${historyContext}`
      : systemPrompt;

    for await (const message of query({
      prompt,
      options: {
        systemPrompt: fullSystemPrompt,
        model: MODEL,
        maxTurns: MAX_TURNS,
        mcpServers: { basys: mcpServer },
        allowedTools: ['mcp__basys__*'],
        disallowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'NotebookEdit'],
        persistSession: false,
      },
    })) {
      // Handle different message types from the SDK
      if (message.type === 'assistant') {
        const msg = (message as any).message;
        if (msg?.content) {
          for (const block of msg.content) {
            if (block.type === 'text') {
              const newText = block.text.slice(fullText.length);
              if (newText) {
                fullText = block.text;
                sendSSE(res, 'delta', { text: newText });
              }
            } else if (block.type === 'tool_use') {
              sendSSE(res, 'tool_use', { id: block.id, name: block.name, input: block.input });
              contentBlocks.push(block);
            }
          }
        }
      } else if (message.type === 'result') {
        const result = (message as any).result;
        if (result && fullText !== result) {
          const newText = typeof result === 'string' ? result.slice(fullText.length) : '';
          if (newText) {
            sendSSE(res, 'delta', { text: newText });
            fullText = result;
          }
        }
      }
    }

    // Build final content blocks
    if (fullText) {
      contentBlocks.unshift({ type: 'text', text: fullText });
    }

    onComplete(contentBlocks);
    sendSSE(res, 'done', {});
    res.end();
  } catch (err: any) {
    console.error('Claude Agent SDK error:', err);
    sendSSE(res, 'error', { message: err.message || 'Claude API error' });
    if (!res.writableEnded) res.end();
  }
}

function sendSSE(res: ExpressResponse, type: string, data: any) {
  if (!res.writableEnded) {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  }
}
