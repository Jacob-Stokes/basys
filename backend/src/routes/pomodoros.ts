import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { ok, fail, serverError } from '../utils/response';

const router = Router();

// GET / — List pomodoro sessions (newest first)
router.get('/', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const { status, limit } = req.query;

    let sql = 'SELECT * FROM pomodoro_sessions WHERE user_id = ?';
    const params: any[] = [userId];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY started_at DESC';

    if (limit) {
      sql += ' LIMIT ?';
      params.push(Number(limit));
    }

    const rows = db.prepare(sql).all(...params);
    ok(res, rows);
  } catch (error) {
    serverError(res, error);
  }
});

// POST / — Start a new pomodoro session
router.post('/', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const { duration_minutes, note, task_id } = req.body;

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO pomodoro_sessions (id, user_id, started_at, duration_minutes, status, note, created_at)
      VALUES (?, ?, ?, ?, 'in_progress', ?, ?)
    `).run(id, userId, now, duration_minutes || 25, note || null, now);

    // If a task_id is provided, link the pomodoro to the task
    if (task_id) {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(task_id, userId);
      if (task) {
        db.prepare('INSERT OR IGNORE INTO task_links (task_id, target_type, target_id) VALUES (?, ?, ?)')
          .run(task_id, 'pomodoro', id);
      }
    }

    const session = db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ?').get(id);
    ok(res, session, 201);
  } catch (error) {
    serverError(res, error);
  }
});

// GET /:id — Get single session
router.get('/:id', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const session = db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ? AND user_id = ?').get(id, userId);
    if (!session) return fail(res, 404, 'Session not found');

    // Include linked tasks
    const linkedTasks = db.prepare(`
      SELECT t.id, t.title, t.done FROM tasks t
      JOIN task_links tl ON tl.task_id = t.id
      WHERE tl.target_type = 'pomodoro' AND tl.target_id = ?
    `).all(id);

    ok(res, { ...session, linked_tasks: linkedTasks });
  } catch (error) {
    serverError(res, error);
  }
});

// PUT /:id — Update session (complete, cancel, or edit note)
router.put('/:id', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const existing = db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ? AND user_id = ?').get(id, userId);
    if (!existing) return fail(res, 404, 'Session not found');

    const { status, note, ended_at } = req.body;

    db.prepare(`
      UPDATE pomodoro_sessions SET
        status = COALESCE(?, status),
        note = COALESCE(?, note),
        ended_at = COALESCE(?, ended_at)
      WHERE id = ?
    `).run(
      status || null,
      note !== undefined ? note : null,
      ended_at || null,
      id
    );

    const session = db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ?').get(id);
    ok(res, session);
  } catch (error) {
    serverError(res, error);
  }
});

// PATCH /:id/complete — Mark session as completed
router.patch('/:id/complete', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const existing = db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ? AND user_id = ?').get(id, userId);
    if (!existing) return fail(res, 404, 'Session not found');

    const now = new Date().toISOString();
    db.prepare('UPDATE pomodoro_sessions SET status = ?, ended_at = ? WHERE id = ?')
      .run('completed', now, id);

    const session = db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ?').get(id);
    ok(res, session);
  } catch (error) {
    serverError(res, error);
  }
});

// DELETE /:id — Delete session
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const existing = db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ? AND user_id = ?').get(id, userId);
    if (!existing) return fail(res, 404, 'Session not found');

    db.prepare('DELETE FROM pomodoro_sessions WHERE id = ?').run(id);
    ok(res, { deleted: true });
  } catch (error) {
    serverError(res, error);
  }
});

export default router;
