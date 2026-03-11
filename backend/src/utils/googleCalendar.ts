import { db } from '../db/database';
import { encrypt, decrypt } from './crypto';
import { v4 as uuid } from 'uuid';

const GOOGLE_CLIENT_ID = () => process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = () => process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = () => process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/google-calendar/callback';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
];

// ── OAuth Helpers ──────────────────────────────────────────────

export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID(),
    redirect_uri: GOOGLE_REDIRECT_URI(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}> {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID(),
      client_secret: GOOGLE_CLIENT_SECRET(),
      redirect_uri: GOOGLE_REDIRECT_URI(),
      grant_type: 'authorization_code',
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Token exchange failed: ${err}`);
  }
  return resp.json() as any;
}

export async function refreshAccessToken(refreshTokenEncrypted: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const refreshToken = decrypt(refreshTokenEncrypted);
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID(),
      client_secret: GOOGLE_CLIENT_SECRET(),
      grant_type: 'refresh_token',
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Token refresh failed: ${err}`);
  }
  return resp.json() as any;
}

// Gets a valid access token, refreshing if expired or about to expire
export async function getValidAccessToken(userId: string): Promise<string> {
  const row = db.prepare(
    'SELECT * FROM google_calendar_tokens WHERE user_id = ?'
  ).get(userId) as any;
  if (!row) throw new Error('Google Calendar not connected');

  const expiry = new Date(row.token_expiry);
  const now = new Date();
  // Refresh if token expires within 5 minutes
  if (expiry.getTime() - now.getTime() < 5 * 60 * 1000) {
    const refreshed = await refreshAccessToken(row.refresh_token_encrypted);
    const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    db.prepare(
      `UPDATE google_calendar_tokens
       SET access_token_encrypted = ?, token_expiry = ?, updated_at = datetime('now')
       WHERE user_id = ?`
    ).run(encrypt(refreshed.access_token), newExpiry, userId);
    return refreshed.access_token;
  }
  return decrypt(row.access_token_encrypted);
}

// ── Google API Calls ───────────────────────────────────────────

export async function getGoogleEmail(accessToken: string): Promise<string> {
  const resp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error('Failed to get Google email');
  const data = await resp.json() as any;
  return data.email;
}

export async function listCalendars(accessToken: string): Promise<Array<{
  id: string;
  summary: string;
  backgroundColor: string;
  primary: boolean;
}>> {
  const resp = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error('Failed to list calendars');
  const data = await resp.json() as any;
  return (data.items || []).map((c: any) => ({
    id: c.id,
    summary: c.summary,
    backgroundColor: c.backgroundColor || '#4285f4',
    primary: !!c.primary,
  }));
}

export async function fetchCalendarEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
): Promise<any[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });
  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!resp.ok) throw new Error(`Failed to fetch events from ${calendarId}`);
  const data = await resp.json() as any;
  return data.items || [];
}

// ── Sync ───────────────────────────────────────────────────────

export async function syncGoogleEvents(userId: string): Promise<number> {
  const tokenRow = db.prepare(
    'SELECT * FROM google_calendar_tokens WHERE user_id = ?'
  ).get(userId) as any;
  if (!tokenRow || !tokenRow.sync_enabled) return 0;

  const accessToken = await getValidAccessToken(userId);
  const selectedCalendars: string[] = JSON.parse(tokenRow.selected_calendars || '[]');
  if (selectedCalendars.length === 0) return 0;

  // Fetch events: 30 days back, 90 days forward
  const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  let totalSynced = 0;
  const upsertStmt = db.prepare(`
    INSERT INTO google_calendar_events
      (id, user_id, google_event_id, calendar_id, title, description, start_date, end_date,
       all_day, location, color, html_link, status, last_synced_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(user_id, google_event_id) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      all_day = excluded.all_day,
      location = excluded.location,
      color = excluded.color,
      html_link = excluded.html_link,
      status = excluded.status,
      last_synced_at = datetime('now'),
      updated_at = datetime('now')
  `);

  // Get calendar colors
  const calendars = await listCalendars(accessToken);
  const calColorMap = new Map(calendars.map(c => [c.id, c.backgroundColor]));

  // Date strings for the sync window (used to scope deletions)
  const timeMinDate = timeMin.slice(0, 10);
  const timeMaxDate = timeMax.slice(0, 10);

  for (const calId of selectedCalendars) {
    try {
      const events = await fetchCalendarEvents(accessToken, calId, timeMin, timeMax);

      // Track all event IDs returned by Google for this calendar
      const returnedIds: string[] = events.map((e: any) => e.id);

      for (const event of events) {
        if (event.status === 'cancelled') continue;
        const isAllDay = !!event.start?.date;
        const startDate = isAllDay ? event.start.date : event.start?.dateTime;
        const endDate = isAllDay ? event.end?.date : event.end?.dateTime;
        if (!startDate) continue;

        upsertStmt.run(
          uuid(),
          userId,
          event.id,
          calId,
          event.summary || '(No title)',
          event.description || null,
          startDate,
          endDate || null,
          isAllDay ? 1 : 0,
          event.location || null,
          calColorMap.get(calId) || '#4285f4',
          event.htmlLink || null,
          event.status || 'confirmed',
        );
        totalSynced++;
      }

      // Delete cached events that Google no longer returns for this calendar
      // (covers deleted events and cancelled events within the sync window)
      if (returnedIds.length > 0) {
        const placeholders = returnedIds.map(() => '?').join(',');
        db.prepare(
          `DELETE FROM google_calendar_events
           WHERE user_id = ? AND calendar_id = ?
             AND google_event_id NOT IN (${placeholders})
             AND start_date >= ? AND start_date <= ?`
        ).run(userId, calId, ...returnedIds, timeMinDate, timeMaxDate);
      } else {
        // Google returned nothing — delete all cached events in the sync window for this calendar
        db.prepare(
          `DELETE FROM google_calendar_events
           WHERE user_id = ? AND calendar_id = ?
             AND start_date >= ? AND start_date <= ?`
        ).run(userId, calId, timeMinDate, timeMaxDate);
      }

      // Also delete any cancelled events that slipped through previously
      db.prepare(
        `DELETE FROM google_calendar_events WHERE user_id = ? AND calendar_id = ? AND status = 'cancelled'`
      ).run(userId, calId);

    } catch (err) {
      console.error(`Failed to sync calendar ${calId}:`, err);
    }
  }

  // Delete cached events for de-selected calendars
  if (selectedCalendars.length > 0) {
    const placeholders = selectedCalendars.map(() => '?').join(',');
    db.prepare(
      `DELETE FROM google_calendar_events WHERE user_id = ? AND calendar_id NOT IN (${placeholders})`
    ).run(userId, ...selectedCalendars);
  }

  // Update last_synced_at
  db.prepare(
    "UPDATE google_calendar_tokens SET last_synced_at = datetime('now') WHERE user_id = ?"
  ).run(userId);

  return totalSynced;
}

// ── Create Event on Google ─────────────────────────────────────

export async function createGoogleEvent(
  accessToken: string,
  calendarId: string,
  event: {
    summary: string;
    description?: string;
    start: { dateTime?: string; date?: string; timeZone?: string };
    end: { dateTime?: string; date?: string; timeZone?: string };
    location?: string;
  }
): Promise<any> {
  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Failed to create Google Calendar event: ${err}`);
  }
  return resp.json();
}

// ── Update Event on Google ────────────────────────────────────

export async function updateGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: {
    summary?: string;
    description?: string;
    start?: { dateTime?: string; date?: string; timeZone?: string };
    end?: { dateTime?: string; date?: string; timeZone?: string };
    location?: string;
  }
): Promise<any> {
  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Failed to update Google Calendar event: ${err}`);
  }
  return resp.json();
}

// ── Delete Event on Google ────────────────────────────────────

export async function deleteGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!resp.ok && resp.status !== 410) {
    const err = await resp.text();
    throw new Error(`Failed to delete Google Calendar event: ${err}`);
  }
}

// ── Check if Google Calendar is configured ─────────────────────

export function isGoogleCalendarConfigured(): boolean {
  return !!(GOOGLE_CLIENT_ID() && GOOGLE_CLIENT_SECRET());
}
