import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { v4 as uuid } from 'uuid';
import { ok, fail } from '../utils/response';
import { syncGoogleEvents } from '../utils/googleCalendar';

const router = Router();

// GET / — list events (optionally filter by date range)
router.get('/', (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { start, end } = req.query;

  // Opportunistic Google Calendar sync: fire-and-forget if stale (>5 min)
  try {
    const gcalToken = db.prepare(
      'SELECT last_synced_at FROM google_calendar_tokens WHERE user_id = ? AND sync_enabled = 1'
    ).get(userId) as any;
    if (gcalToken) {
      const lastSync = gcalToken.last_synced_at ? new Date(gcalToken.last_synced_at).getTime() : 0;
      if (Date.now() - lastSync > 5 * 60 * 1000) {
        syncGoogleEvents(userId).catch(err =>
          console.error('Background Google Calendar sync failed:', err)
        );
      }
    }
  } catch { /* non-critical */ }

  let query = 'SELECT * FROM events WHERE user_id = ?';
  const params: any[] = [userId];

  if (start) {
    query += ' AND start_date >= ?';
    params.push(start);
  }
  if (end) {
    query += ' AND start_date <= ?';
    params.push(end);
  }

  query += ' ORDER BY start_date ASC';

  const events = db.prepare(query).all(...params);
  return ok(res, events);
});

// GET /:id — get single event
router.get('/:id', (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const event = db.prepare('SELECT * FROM events WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!event) return fail(res, 404, 'Event not found');
  return ok(res, event);
});

// POST / — create event
router.post('/', (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { title, description, start_date, end_date, all_day, color, location } = req.body;

  if (!title || !start_date) {
    return fail(res, 400, 'title and start_date are required');
  }

  const id = uuid();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO events (id, user_id, title, description, start_date, end_date, all_day, color, location, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, title, description || null, start_date, end_date || null, all_day ? 1 : 0, color || '#3b82f6', location || null, now, now);

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  return ok(res, event);
});

// PUT /:id — update event
router.put('/:id', (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const existing = db.prepare('SELECT * FROM events WHERE id = ? AND user_id = ?').get(req.params.id, userId) as any;
  if (!existing) return fail(res, 404, 'Event not found');

  const { title, description, start_date, end_date, all_day, color, location } = req.body;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE events SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      start_date = COALESCE(?, start_date),
      end_date = ?,
      all_day = COALESCE(?, all_day),
      color = COALESCE(?, color),
      location = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    title || null, description, start_date || null,
    end_date !== undefined ? end_date : existing.end_date,
    all_day !== undefined ? (all_day ? 1 : 0) : null,
    color || null,
    location !== undefined ? location : existing.location,
    now, req.params.id
  );

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  return ok(res, event);
});

// DELETE /:id — delete event
router.delete('/:id', (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const existing = db.prepare('SELECT * FROM events WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!existing) return fail(res, 404, 'Event not found');

  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  return ok(res, { deleted: true });
});

export default router;
