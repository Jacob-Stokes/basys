import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { ok, fail, serverError } from '../utils/response';
import { getValidAccessToken } from '../utils/googleCalendar';
import {
  syncGmailMessages,
  getGmailMessage,
  modifyGmailMessage,
  parseGmailHeaders,
  decodeGmailBody,
} from '../utils/gmail';

const router = Router();

// ── GET /status — check if Gmail is enabled ──────────────────
router.get('/status', (req: Request, res: Response) => {
  try {
    const row = db.prepare(
      'SELECT granted_scopes, gmail_sync_enabled, gmail_last_synced_at, google_email FROM google_calendar_tokens WHERE user_id = ?'
    ).get(req.user!.id) as any;

    if (!row) {
      return ok(res, { connected: false, gmail_enabled: false });
    }

    const scopes: string[] = JSON.parse(row.granted_scopes || '[]');
    const hasGmail = scopes.some((s: string) => s.includes('gmail'));

    ok(res, {
      connected: true,
      gmail_enabled: hasGmail && !!row.gmail_sync_enabled,
      has_gmail_scopes: hasGmail,
      google_email: row.google_email,
      gmail_last_synced_at: row.gmail_last_synced_at,
    });
  } catch (error) {
    serverError(res, error);
  }
});

// ── GET /messages — list cached messages ─────────────────────
router.get('/messages', (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    // Opportunistic sync: fire-and-forget if stale (>5 min)
    try {
      const tokenRow = db.prepare(
        'SELECT gmail_last_synced_at, gmail_sync_enabled FROM google_calendar_tokens WHERE user_id = ?'
      ).get(userId) as any;
      if (tokenRow?.gmail_sync_enabled) {
        const lastSync = tokenRow.gmail_last_synced_at ? new Date(tokenRow.gmail_last_synced_at).getTime() : 0;
        if (Date.now() - lastSync > 5 * 60 * 1000) {
          syncGmailMessages(userId).catch(err =>
            console.error('Background Gmail sync failed:', err)
          );
        }
      }
    } catch { /* non-critical */ }

    const messages = db.prepare(
      `SELECT gmail_message_id, thread_id, from_address, from_name, to_address,
              subject, snippet, date, label_ids, is_unread, has_attachments
       FROM gmail_messages WHERE user_id = ?
       ORDER BY date DESC LIMIT ? OFFSET ?`
    ).all(userId, limit, offset) as any[];

    const unreadCount = db.prepare(
      'SELECT COUNT(*) as count FROM gmail_messages WHERE user_id = ? AND is_unread = 1'
    ).get(userId) as any;

    ok(res, {
      messages: messages.map(m => ({
        ...m,
        label_ids: JSON.parse(m.label_ids || '[]'),
        is_unread: !!m.is_unread,
        has_attachments: !!m.has_attachments,
      })),
      unread_count: unreadCount.count,
    });
  } catch (error) {
    serverError(res, error);
  }
});

// ── GET /messages/:gmailMessageId — get single message with body ──
router.get('/messages/:gmailMessageId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const gmailMessageId = String(req.params.gmailMessageId);

    // Try cache first
    let cached = db.prepare(
      'SELECT * FROM gmail_messages WHERE user_id = ? AND gmail_message_id = ?'
    ).get(userId, gmailMessageId) as any;

    // If no body cached, fetch from Gmail API on demand
    if (cached && !cached.body_html && !cached.body_text) {
      try {
        const accessToken = await getValidAccessToken(userId);
        const full = await getGmailMessage(accessToken, gmailMessageId, 'full');
        const body = decodeGmailBody(full.payload || {});
        db.prepare(
          `UPDATE gmail_messages SET body_html = ?, body_text = ?, last_synced_at = datetime('now')
           WHERE user_id = ? AND gmail_message_id = ?`
        ).run(body.html || null, body.text || null, userId, gmailMessageId);
        cached.body_html = body.html;
        cached.body_text = body.text;
      } catch (err) {
        console.error('Body fetch failed:', err);
      }
    }

    if (!cached) {
      // Not in cache — fetch directly from API
      try {
        const accessToken = await getValidAccessToken(userId);
        const full = await getGmailMessage(accessToken, gmailMessageId, 'full');
        const headers = parseGmailHeaders(full.payload?.headers || []);
        const body = decodeGmailBody(full.payload || {});

        let dateStr: string;
        try {
          dateStr = headers.date ? new Date(headers.date).toISOString() : new Date(parseInt(full.internalDate)).toISOString();
        } catch {
          dateStr = new Date(parseInt(full.internalDate)).toISOString();
        }

        return ok(res, {
          gmail_message_id: gmailMessageId,
          thread_id: full.threadId,
          from_address: headers.from,
          from_name: headers.fromName,
          to_address: headers.to,
          subject: headers.subject,
          snippet: full.snippet,
          body_html: body.html,
          body_text: body.text,
          date: dateStr,
          label_ids: full.labelIds || [],
          is_unread: (full.labelIds || []).includes('UNREAD'),
          has_attachments: false,
        });
      } catch (err: any) {
        return fail(res, 404, 'Message not found');
      }
    }

    ok(res, {
      ...cached,
      label_ids: JSON.parse(cached.label_ids || '[]'),
      is_unread: !!cached.is_unread,
      has_attachments: !!cached.has_attachments,
    });
  } catch (error: any) {
    if (error.message?.includes('not connected')) return fail(res, 400, error.message);
    serverError(res, error);
  }
});

// ── POST /messages/:gmailMessageId/read — mark as read ───────
router.post('/messages/:gmailMessageId/read', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const gmailMessageId = String(req.params.gmailMessageId);
    const accessToken = await getValidAccessToken(userId);

    await modifyGmailMessage(accessToken, gmailMessageId, [], ['UNREAD']);

    // Update local cache
    db.prepare(
      "UPDATE gmail_messages SET is_unread = 0, last_synced_at = datetime('now') WHERE user_id = ? AND gmail_message_id = ?"
    ).run(userId, gmailMessageId);

    ok(res, { marked: 'read' });
  } catch (error: any) {
    console.error('Mark as read error:', error);
    if (error.message?.includes('not connected')) return fail(res, 400, error.message);
    serverError(res, error);
  }
});

// ── POST /messages/:gmailMessageId/unread — mark as unread ───
router.post('/messages/:gmailMessageId/unread', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const gmailMessageId = String(req.params.gmailMessageId);
    const accessToken = await getValidAccessToken(userId);

    await modifyGmailMessage(accessToken, gmailMessageId, ['UNREAD'], []);

    // Update local cache
    db.prepare(
      "UPDATE gmail_messages SET is_unread = 1, last_synced_at = datetime('now') WHERE user_id = ? AND gmail_message_id = ?"
    ).run(userId, gmailMessageId);

    ok(res, { marked: 'unread' });
  } catch (error: any) {
    console.error('Mark as unread error:', error);
    if (error.message?.includes('not connected')) return fail(res, 400, error.message);
    serverError(res, error);
  }
});

// ── POST /sync — manual Gmail sync ──────────────────────────
router.post('/sync', async (req: Request, res: Response) => {
  try {
    const count = await syncGmailMessages(req.user!.id);
    ok(res, { synced: count });
  } catch (error: any) {
    console.error('Gmail sync error:', error);
    if (error.message?.includes('not connected')) return fail(res, 400, error.message);
    serverError(res, error);
  }
});

export default router;
