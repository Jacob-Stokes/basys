/**
 * Chat API routes for the AI sidebar.
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, ChatConversation, ChatMessage } from '../db/database';
import { streamChatResponse } from '../chat/claude';
import { ok, fail, serverError } from '../utils/response';

const router = Router();

// List conversations (newest first)
router.get('/conversations', (req, res) => {
  try {
    const userId = req.user!.id;
    const conversations = db.prepare(
      'SELECT * FROM chat_conversations WHERE user_id = ? ORDER BY updated_at DESC'
    ).all(userId);
    ok(res, conversations);
  } catch (err) {
    serverError(res, err);
  }
});

// Create conversation
router.post('/conversations', (req, res) => {
  try {
    const userId = req.user!.id;
    const id = uuidv4();
    db.prepare('INSERT INTO chat_conversations (id, user_id) VALUES (?, ?)').run(id, userId);
    const conversation = db.prepare('SELECT * FROM chat_conversations WHERE id = ?').get(id);
    ok(res, conversation, 201);
  } catch (err) {
    serverError(res, err);
  }
});

// Get conversation with messages
router.get('/conversations/:id', (req, res) => {
  try {
    const userId = req.user!.id;
    const conversation = db.prepare(
      'SELECT * FROM chat_conversations WHERE id = ? AND user_id = ?'
    ).get(req.params.id, userId) as ChatConversation | undefined;

    if (!conversation) return fail(res, 404, 'Conversation not found');

    const messages = db.prepare(
      'SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC'
    ).all(conversation.id);

    ok(res, { ...conversation, messages });
  } catch (err) {
    serverError(res, err);
  }
});

// Delete conversation
router.delete('/conversations/:id', (req, res) => {
  try {
    const userId = req.user!.id;
    const conversation = db.prepare(
      'SELECT * FROM chat_conversations WHERE id = ? AND user_id = ?'
    ).get(req.params.id, userId);

    if (!conversation) return fail(res, 404, 'Conversation not found');

    db.prepare('DELETE FROM chat_conversations WHERE id = ?').run(req.params.id);
    ok(res, { deleted: true });
  } catch (err) {
    serverError(res, err);
  }
});

// Send message — triggers Claude API streaming response
router.post('/conversations/:id/messages', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { content } = req.body;

    if (!content || typeof content !== 'string') {
      return fail(res, 400, 'content is required');
    }

    // Verify conversation ownership
    const conversation = db.prepare(
      'SELECT * FROM chat_conversations WHERE id = ? AND user_id = ?'
    ).get(req.params.id, userId) as ChatConversation | undefined;

    if (!conversation) return fail(res, 404, 'Conversation not found');

    // Save user message
    const userMsgId = uuidv4();
    db.prepare('INSERT INTO chat_messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)')
      .run(userMsgId, conversation.id, 'user', JSON.stringify(content));

    // Update conversation timestamp
    db.prepare("UPDATE chat_conversations SET updated_at = datetime('now') WHERE id = ?")
      .run(conversation.id);

    // Load conversation history
    const history = db.prepare(
      'SELECT role, content FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC'
    ).all(conversation.id) as ChatMessage[];

    // Build messages array for Claude API
    const messages = history.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: parseMessageContent(msg.content),
    }));

    // Stream response
    await streamChatResponse(userId, messages, res, (contentBlocks) => {
      // Save assistant message on completion
      const assistantMsgId = uuidv4();
      db.prepare('INSERT INTO chat_messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)')
        .run(assistantMsgId, conversation.id, 'assistant', JSON.stringify(contentBlocks));

      // Auto-title from first exchange
      if (conversation.title === 'New conversation' && messages.length <= 2) {
        const title = generateTitle(content);
        db.prepare('UPDATE chat_conversations SET title = ? WHERE id = ?').run(title, conversation.id);
      }
    });
  } catch (err: any) {
    console.error('Chat message error:', err);
    // If headers already sent (SSE started), we can't send a JSON error
    if (!res.headersSent) {
      serverError(res, err);
    }
  }
});

/**
 * Parse stored message content back to Claude API format.
 * User messages are stored as JSON strings, assistant messages as JSON content blocks array.
 */
function parseMessageContent(stored: string): any {
  try {
    const parsed = JSON.parse(stored);
    // If it's a plain string (user message), return as-is for Claude
    if (typeof parsed === 'string') return parsed;
    // If it's an array (assistant content blocks), return as-is
    if (Array.isArray(parsed)) return parsed;
    // Fallback
    return stored;
  } catch {
    return stored;
  }
}

/**
 * Generate a short conversation title from the first user message.
 */
function generateTitle(firstMessage: string): string {
  // Take first 50 chars, trim to last word boundary
  const truncated = firstMessage.substring(0, 50);
  const lastSpace = truncated.lastIndexOf(' ');
  const title = lastSpace > 20 ? truncated.substring(0, lastSpace) : truncated;
  return title + (firstMessage.length > 50 ? '...' : '');
}

export default router;
