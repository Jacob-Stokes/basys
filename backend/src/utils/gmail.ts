import { db } from '../db/database';
import { getValidAccessToken } from './googleCalendar';
import { v4 as uuid } from 'uuid';

// ── Gmail API Calls ──────────────────────────────────────────

export async function listGmailMessages(
  accessToken: string,
  maxResults: number = 50
): Promise<{ messages: Array<{ id: string; threadId: string }>; nextPageToken?: string; resultSizeEstimate: number }> {
  const params = new URLSearchParams({
    labelIds: 'INBOX',
    maxResults: String(maxResults),
  });

  const resp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!resp.ok) throw new Error(`Failed to list Gmail messages: ${await resp.text()}`);
  return resp.json() as any;
}

export async function getGmailMessage(
  accessToken: string,
  messageId: string,
  format: 'full' | 'metadata' | 'minimal' = 'full'
): Promise<any> {
  const resp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=${format}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!resp.ok) throw new Error(`Failed to get Gmail message: ${await resp.text()}`);
  return resp.json();
}

export async function modifyGmailMessage(
  accessToken: string,
  messageId: string,
  addLabelIds: string[],
  removeLabelIds: string[]
): Promise<any> {
  const resp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ addLabelIds, removeLabelIds }),
    }
  );
  if (!resp.ok) throw new Error(`Failed to modify Gmail message: ${await resp.text()}`);
  return resp.json();
}

export async function getGmailUnreadCount(accessToken: string): Promise<number> {
  const resp = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!resp.ok) throw new Error(`Failed to get Gmail label: ${await resp.text()}`);
  const data = await resp.json() as any;
  return data.messagesUnread || 0;
}

// ── Parsing Helpers ──────────────────────────────────────────

export function parseGmailHeaders(headers: Array<{ name: string; value: string }>): {
  from: string;
  fromName: string;
  to: string;
  subject: string;
  date: string;
} {
  const get = (name: string) =>
    headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
  const fromRaw = get('From');
  const fromMatch = fromRaw.match(/^(.+?)\s*<(.+)>$/);
  return {
    from: fromMatch ? fromMatch[2] : fromRaw,
    fromName: fromMatch ? fromMatch[1].replace(/^"|"$/g, '').trim() : fromRaw,
    to: get('To'),
    subject: get('Subject'),
    date: get('Date'),
  };
}

export function decodeGmailBody(payload: any): { html: string; text: string } {
  let html = '';
  let text = '';

  function extractParts(part: any) {
    if (part.mimeType === 'text/html' && part.body?.data) {
      html = Buffer.from(part.body.data, 'base64url').toString('utf8');
    } else if (part.mimeType === 'text/plain' && part.body?.data) {
      text = Buffer.from(part.body.data, 'base64url').toString('utf8');
    }
    if (part.parts) {
      for (const sub of part.parts) extractParts(sub);
    }
  }

  extractParts(payload);
  return { html, text };
}

// ── Sync ─────────────────────────────────────────────────────

export async function syncGmailMessages(userId: string): Promise<number> {
  const tokenRow = db.prepare(
    'SELECT * FROM google_calendar_tokens WHERE user_id = ?'
  ).get(userId) as any;
  if (!tokenRow || !tokenRow.gmail_sync_enabled) return 0;

  const accessToken = await getValidAccessToken(userId);

  // Get list of recent inbox messages
  const list = await listGmailMessages(accessToken, 50);
  if (!list.messages || list.messages.length === 0) {
    // Inbox is empty — purge all cached messages
    db.prepare('DELETE FROM gmail_messages WHERE user_id = ?').run(userId);
    db.prepare(
      "UPDATE google_calendar_tokens SET gmail_last_synced_at = datetime('now') WHERE user_id = ?"
    ).run(userId);
    return 0;
  }

  let synced = 0;
  const upsertStmt = db.prepare(`
    INSERT INTO gmail_messages
      (id, user_id, gmail_message_id, thread_id, from_address, from_name, to_address,
       subject, snippet, date, label_ids, is_unread, has_attachments, last_synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, gmail_message_id) DO UPDATE SET
      label_ids = excluded.label_ids,
      is_unread = excluded.is_unread,
      snippet = excluded.snippet,
      last_synced_at = datetime('now')
  `);

  // Fetch metadata for each message (not body — that's lazy-loaded on open)
  for (const msg of list.messages) {
    try {
      const full = await getGmailMessage(accessToken, msg.id, 'metadata');
      const headers = parseGmailHeaders(full.payload?.headers || []);
      const labelIds = full.labelIds || [];
      const isUnread = labelIds.includes('UNREAD') ? 1 : 0;

      // Parse date — try header date first, fall back to internalDate (epoch ms)
      let dateStr: string;
      try {
        dateStr = headers.date ? new Date(headers.date).toISOString() : new Date(parseInt(full.internalDate)).toISOString();
      } catch {
        dateStr = new Date(parseInt(full.internalDate)).toISOString();
      }

      upsertStmt.run(
        uuid(),
        userId,
        msg.id,
        msg.threadId,
        headers.from,
        headers.fromName,
        headers.to,
        headers.subject,
        full.snippet || '',
        dateStr,
        JSON.stringify(labelIds),
        isUnread,
        0, // has_attachments — not available in metadata format
      );
      synced++;
    } catch (err) {
      console.error(`Failed to sync Gmail message ${msg.id}:`, err);
    }
  }

  // Purge messages no longer in inbox
  const returnedIds = list.messages.map(m => m.id);
  if (returnedIds.length > 0) {
    const placeholders = returnedIds.map(() => '?').join(',');
    db.prepare(
      `DELETE FROM gmail_messages WHERE user_id = ? AND gmail_message_id NOT IN (${placeholders})`
    ).run(userId, ...returnedIds);
  }

  // Update sync timestamp
  db.prepare(
    "UPDATE google_calendar_tokens SET gmail_last_synced_at = datetime('now') WHERE user_id = ?"
  ).run(userId);

  return synced;
}
