import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { v4 as uuid } from 'uuid';
import { ok, fail, serverError } from '../utils/response';
import { encrypt, decrypt } from '../utils/crypto';
import {
  getAuthUrl,
  exchangeCodeForTokens,
  getGoogleEmail,
  listCalendars,
  getValidAccessToken,
  syncGoogleEvents,
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  isGoogleCalendarConfigured,
} from '../utils/googleCalendar';

const router = Router();

// ── GET /status — check if Google Calendar is connected ────────

router.get('/status', (req: Request, res: Response) => {
  try {
    if (!isGoogleCalendarConfigured()) {
      return ok(res, { configured: false, connected: false });
    }

    const row = db.prepare(
      'SELECT google_email, selected_calendars, last_synced_at, sync_enabled FROM google_calendar_tokens WHERE user_id = ?'
    ).get(req.user!.id) as any;

    if (!row) {
      return ok(res, { configured: true, connected: false });
    }

    ok(res, {
      configured: true,
      connected: true,
      google_email: row.google_email,
      selected_calendars: JSON.parse(row.selected_calendars || '[]'),
      last_synced_at: row.last_synced_at,
      sync_enabled: !!row.sync_enabled,
    });
  } catch (error) {
    serverError(res, error);
  }
});

// ── GET /auth-url — generate Google OAuth consent URL ──────────

router.get('/auth-url', (req: Request, res: Response) => {
  try {
    if (!isGoogleCalendarConfigured()) {
      return fail(res, 503, 'Google Calendar integration not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.');
    }

    const state = uuid();
    (req.session as any).gcalOAuthState = state;

    ok(res, { url: getAuthUrl(state) });
  } catch (error) {
    serverError(res, error);
  }
});

// ── DELETE /disconnect — disconnect Google Calendar ────────────

router.delete('/disconnect', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const row = db.prepare(
      'SELECT refresh_token_encrypted FROM google_calendar_tokens WHERE user_id = ?'
    ).get(userId) as any;

    if (row) {
      // Try to revoke token at Google (best-effort)
      try {
        const refreshToken = decrypt(row.refresh_token_encrypted);
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
      } catch {
        // Revocation is best-effort
      }

      // Delete tokens and cached events
      db.prepare('DELETE FROM google_calendar_tokens WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM google_calendar_events WHERE user_id = ?').run(userId);
    }

    ok(res, { disconnected: true });
  } catch (error) {
    serverError(res, error);
  }
});

// ── GET /calendars — list available Google Calendars ───────────

router.get('/calendars', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const accessToken = await getValidAccessToken(userId);
    const calendars = await listCalendars(accessToken);

    const tokenRow = db.prepare(
      'SELECT selected_calendars FROM google_calendar_tokens WHERE user_id = ?'
    ).get(userId) as any;
    const selected: string[] = JSON.parse(tokenRow?.selected_calendars || '[]');

    const result = calendars.map(cal => ({
      ...cal,
      selected: selected.includes(cal.id),
    }));

    ok(res, result);
  } catch (error: any) {
    if (error.message?.includes('not connected')) {
      return fail(res, 400, error.message);
    }
    serverError(res, error);
  }
});

// ── PUT /calendars — update which calendars are selected ───────

router.put('/calendars', (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { selected_calendars } = req.body;

    if (!Array.isArray(selected_calendars)) {
      return fail(res, 400, 'selected_calendars must be an array of calendar IDs');
    }

    db.prepare(
      "UPDATE google_calendar_tokens SET selected_calendars = ?, updated_at = datetime('now') WHERE user_id = ?"
    ).run(JSON.stringify(selected_calendars), userId);

    ok(res, { selected_calendars });
  } catch (error) {
    serverError(res, error);
  }
});

// ── POST /sync — trigger manual sync ──────────────────────────

router.post('/sync', async (req: Request, res: Response) => {
  try {
    const count = await syncGoogleEvents(req.user!.id);
    ok(res, { synced: count });
  } catch (error: any) {
    if (error.message?.includes('not connected') || error.message?.includes('Token refresh failed')) {
      return fail(res, 400, error.message);
    }
    serverError(res, error);
  }
});

// ── GET /events — get cached Google Calendar events ────────────

router.get('/events', (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { start, end } = req.query;

    let query = 'SELECT * FROM google_calendar_events WHERE user_id = ? AND status != ?';
    const params: any[] = [userId, 'cancelled'];

    if (start) {
      query += ' AND start_date >= ?';
      params.push(start as string);
    }
    if (end) {
      query += ' AND start_date <= ?';
      params.push(end as string);
    }

    query += ' ORDER BY start_date ASC';

    const events = db.prepare(query).all(...params) as any[];

    // Add source marker for frontend
    const result = events.map(e => ({
      ...e,
      all_day: !!e.all_day,
      source: 'google',
    }));

    ok(res, result);
  } catch (error) {
    serverError(res, error);
  }
});

// ── POST /push-event — create event on Google Calendar ─────────

router.post('/push-event', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { calendar_id, title, description, start_date, end_date, all_day, location } = req.body;

    if (!calendar_id || !title || !start_date) {
      return fail(res, 400, 'calendar_id, title, and start_date are required');
    }

    const accessToken = await getValidAccessToken(userId);

    const event: any = {
      summary: title,
      start: {},
      end: {},
    };
    if (description) event.description = description;
    if (location) event.location = location;

    if (all_day) {
      event.start.date = start_date.slice(0, 10);
      event.end.date = end_date ? end_date.slice(0, 10) : start_date.slice(0, 10);
    } else {
      // Google Calendar API requires RFC3339 with timezone offset
      // If start_date lacks a timezone offset, append the server's local offset
      let startDT = start_date;
      let endDT = end_date;
      const tzOffsetToString = (d: Date) => {
        const off = d.getTimezoneOffset();
        const sign = off <= 0 ? '+' : '-';
        const h = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
        const m = String(Math.abs(off) % 60).padStart(2, '0');
        return `${sign}${h}:${m}`;
      };
      if (!/[Zz]|[+-]\d{2}:\d{2}/.test(startDT)) {
        startDT += tzOffsetToString(new Date(startDT));
      }
      if (!endDT) {
        // Default end = start + 1 hour
        const endDate = new Date(startDT);
        endDate.setHours(endDate.getHours() + 1);
        endDT = endDate.toISOString().replace('Z', tzOffsetToString(endDate));
      } else if (!/[Zz]|[+-]\d{2}:\d{2}/.test(endDT)) {
        endDT += tzOffsetToString(new Date(endDT));
      }
      event.start.dateTime = startDT;
      event.end.dateTime = endDT;
    }

    const created = await createGoogleEvent(accessToken, calendar_id, event);

    // Sync to cache the new event locally, then mark origin as 'basys'
    try {
      await syncGoogleEvents(userId);
      if (created.id) {
        db.prepare(
          "UPDATE google_calendar_events SET origin = 'basys' WHERE user_id = ? AND google_event_id = ?"
        ).run(userId, created.id);
      }
    } catch (err) {
      console.error('Post-create sync failed:', err);
    }

    ok(res, created);
  } catch (error: any) {
    if (error.message?.includes('not connected')) {
      return fail(res, 400, error.message);
    }
    serverError(res, error);
  }
});

// ── PUT /events/:googleEventId — update a Google Calendar event ──

router.put('/events/:googleEventId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const googleEventId = req.params.googleEventId as string;
    const { calendar_id, title, description, start_date, end_date, all_day, location } = req.body;
    console.log('PUT /events/:googleEventId', { googleEventId, calendar_id, title, start_date, end_date, all_day, location });

    if (!calendar_id) return fail(res, 400, 'calendar_id is required');

    const accessToken = await getValidAccessToken(userId);

    const event: any = {};
    if (title !== undefined) event.summary = title;
    if (description !== undefined && description !== null) event.description = description;
    if (location !== undefined && location !== null) event.location = location;

    const tzOffsetToString = (d: Date) => {
      const off = d.getTimezoneOffset();
      const sign = off <= 0 ? '+' : '-';
      const h = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
      const m = String(Math.abs(off) % 60).padStart(2, '0');
      return `${sign}${h}:${m}`;
    };
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (start_date !== undefined) {
      if (all_day) {
        // Google all-day end date is exclusive (day after)
        const endStr = end_date ? end_date.slice(0, 10) : start_date.slice(0, 10);
        const endExclusive = new Date(endStr + 'T00:00:00');
        endExclusive.setDate(endExclusive.getDate() + 1);
        const endExclusiveStr = endExclusive.toISOString().slice(0, 10);
        event.start = { date: start_date.slice(0, 10) };
        event.end = { date: endExclusiveStr };
      } else {
        let startDT = start_date;
        let endDT = end_date;
        if (!/[Zz]|[+-]\d{2}:\d{2}/.test(startDT)) {
          startDT += ':00' + tzOffsetToString(new Date(startDT));
        }
        if (!endDT) {
          const endMs = new Date(startDT).getTime() + 60 * 60 * 1000;
          const endObj = new Date(endMs);
          const pad = (n: number) => String(n).padStart(2, '0');
          endDT = `${endObj.getFullYear()}-${pad(endObj.getMonth()+1)}-${pad(endObj.getDate())}T${pad(endObj.getHours())}:${pad(endObj.getMinutes())}:00${tzOffsetToString(endObj)}`;
        } else if (!/[Zz]|[+-]\d{2}:\d{2}/.test(endDT)) {
          endDT += ':00' + tzOffsetToString(new Date(endDT));
        }
        event.start = { dateTime: startDT, timeZone: tz };
        event.end = { dateTime: endDT, timeZone: tz };
      }
    }

    console.log('Google PATCH payload:', JSON.stringify(event, null, 2));
    const updated = await updateGoogleEvent(accessToken, calendar_id, googleEventId, event);

    syncGoogleEvents(userId).catch(err =>
      console.error('Post-update sync failed:', err)
    );

    ok(res, updated);
  } catch (error: any) {
    console.error('Google Calendar update error:', error);
    if (error.message?.includes('not connected')) return fail(res, 400, error.message);
    serverError(res, error);
  }
});

// ── DELETE /events/:googleEventId — delete a Google Calendar event ──

router.delete('/events/:googleEventId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const googleEventId = req.params.googleEventId as string;
    const calendar_id = String(req.query.calendar_id || '');

    if (!calendar_id) return fail(res, 400, 'calendar_id query param is required');

    const accessToken = await getValidAccessToken(userId);
    await deleteGoogleEvent(accessToken, calendar_id, googleEventId);

    // Remove from local cache immediately
    db.prepare(
      'DELETE FROM google_calendar_events WHERE user_id = ? AND google_event_id = ?'
    ).run(userId, googleEventId);

    ok(res, { deleted: true });
  } catch (error: any) {
    if (error.message?.includes('not connected')) return fail(res, 400, error.message);
    serverError(res, error);
  }
});

export default router;

// ── Callback route (separate — needs session but not requireAuth) ──

export const googleCalendarCallbackRouter = Router();

googleCalendarCallbackRouter.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req.session as any)?.userId;
    if (!userId) {
      return res.redirect('/settings?gcal=error&reason=session_expired');
    }

    const state = req.query.state as string;
    const savedState = (req.session as any).gcalOAuthState;

    if (!state || state !== savedState) {
      return res.redirect('/settings?gcal=error&reason=invalid_state');
    }

    // Clear used state
    delete (req.session as any).gcalOAuthState;

    const code = req.query.code as string;
    if (!code) {
      const error = req.query.error as string;
      return res.redirect(`/settings?gcal=error&reason=${encodeURIComponent(error || 'no_code')}`);
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);
    const tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Get Google email
    const googleEmail = await getGoogleEmail(tokens.access_token);

    // Get calendar list to auto-select primary
    const calendars = await listCalendars(tokens.access_token);
    const primaryCal = calendars.find(c => c.primary);
    const selectedCalendars = primaryCal ? [primaryCal.id] : [];

    // Parse granted scopes
    const grantedScopes: string[] = tokens.scope ? tokens.scope.split(' ') : [];
    const hasGmail = grantedScopes.some(s => s.includes('gmail'));

    // Upsert token record
    db.prepare(`
      INSERT INTO google_calendar_tokens
        (id, user_id, access_token_encrypted, refresh_token_encrypted, token_expiry, google_email, selected_calendars, sync_enabled, granted_scopes, gmail_sync_enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        access_token_encrypted = excluded.access_token_encrypted,
        refresh_token_encrypted = excluded.refresh_token_encrypted,
        token_expiry = excluded.token_expiry,
        google_email = excluded.google_email,
        selected_calendars = excluded.selected_calendars,
        granted_scopes = excluded.granted_scopes,
        gmail_sync_enabled = excluded.gmail_sync_enabled,
        updated_at = datetime('now')
    `).run(
      uuid(),
      userId,
      encrypt(tokens.access_token),
      encrypt(tokens.refresh_token),
      tokenExpiry,
      googleEmail,
      JSON.stringify(selectedCalendars),
      JSON.stringify(grantedScopes),
      hasGmail ? 1 : 0,
    );

    // Fire initial syncs in background
    syncGoogleEvents(userId).catch(err =>
      console.error('Initial Google Calendar sync failed:', err)
    );

    if (hasGmail) {
      // Lazy import to avoid circular deps
      import('../utils/gmail').then(({ syncGmailMessages }) =>
        syncGmailMessages(userId).catch(err =>
          console.error('Initial Gmail sync failed:', err)
        )
      );
    }

    res.redirect('/settings?gcal=connected');
  } catch (error) {
    console.error('Google Calendar OAuth callback error:', error);
    res.redirect('/settings?gcal=error&reason=token_exchange_failed');
  }
});
