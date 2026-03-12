import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { ok, fail, serverError } from '../utils/response';

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────

function loadPomoLinks(pomoIds: string[]): Record<string, any[]> {
  const map: Record<string, any[]> = {};
  if (pomoIds.length === 0) return map;
  const ph = pomoIds.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM pomodoro_links WHERE pomodoro_id IN (${ph}) ORDER BY created_at ASC`).all(...pomoIds) as any[];
  for (const row of rows) {
    if (!map[row.pomodoro_id]) map[row.pomodoro_id] = [];
    map[row.pomodoro_id].push(row);
  }
  return map;
}

function enrichPomoLinks(links: any[]): any[] {
  // Batch-resolve target titles for display
  const byType: Record<string, Set<string>> = {};
  for (const link of links) {
    if (!byType[link.target_type]) byType[link.target_type] = new Set();
    byType[link.target_type].add(link.target_id);
  }

  const titleMap: Record<string, string> = {};

  if (byType.task?.size) {
    const ids = Array.from(byType.task);
    const ph = ids.map(() => '?').join(',');
    const rows = db.prepare(`SELECT id, title FROM tasks WHERE id IN (${ph})`).all(...ids) as any[];
    for (const r of rows) titleMap[`task:${r.id}`] = r.title;
  }
  if (byType.project?.size) {
    const ids = Array.from(byType.project);
    const ph = ids.map(() => '?').join(',');
    const rows = db.prepare(`SELECT id, title FROM projects WHERE id IN (${ph})`).all(...ids) as any[];
    for (const r of rows) titleMap[`project:${r.id}`] = r.title;
  }
  if (byType.sprint?.size) {
    const ids = Array.from(byType.sprint);
    const ph = ids.map(() => '?').join(',');
    const rows = db.prepare(`SELECT id, title FROM sprints WHERE id IN (${ph})`).all(...ids) as any[];
    for (const r of rows) titleMap[`sprint:${r.id}`] = r.title;
  }
  if (byType.goal?.size) {
    const ids = Array.from(byType.goal);
    const ph = ids.map(() => '?').join(',');
    const rows = db.prepare(`SELECT id, title FROM primary_goals WHERE id IN (${ph})`).all(...ids) as any[];
    for (const r of rows) titleMap[`goal:${r.id}`] = r.title;
  }
  if (byType.subgoal?.size) {
    const ids = Array.from(byType.subgoal);
    const ph = ids.map(() => '?').join(',');
    const rows = db.prepare(`SELECT id, title FROM sub_goals WHERE id IN (${ph})`).all(...ids) as any[];
    for (const r of rows) titleMap[`subgoal:${r.id}`] = r.title;
  }
  if (byType.habit?.size) {
    const ids = Array.from(byType.habit);
    const ph = ids.map(() => '?').join(',');
    const rows = db.prepare(`SELECT id, title, emoji FROM habits WHERE id IN (${ph})`).all(...ids) as any[];
    for (const r of rows) titleMap[`habit:${r.id}`] = r.emoji ? `${r.emoji} ${r.title}` : r.title;
  }

  return links.map(link => ({
    ...link,
    target_title: titleMap[`${link.target_type}:${link.target_id}`] || 'Unknown',
  }));
}

function insertPomoLinks(pomoId: string, links: { target_type: string; target_id: string }[]) {
  const stmt = db.prepare('INSERT OR IGNORE INTO pomodoro_links (pomodoro_id, target_type, target_id) VALUES (?, ?, ?)');
  for (const link of links) {
    stmt.run(pomoId, link.target_type, link.target_id);
  }
}

// ── Routes ───────────────────────────────────────────────────────

// GET / — List pomodoro sessions (newest first) with links
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

    const rows = db.prepare(sql).all(...params) as any[];
    const ids = rows.map(r => r.id);
    const linksMap = loadPomoLinks(ids);

    // Enrich all links in one batch
    const allLinks = ids.flatMap(id => linksMap[id] || []);
    const enriched = enrichPomoLinks(allLinks);
    const enrichedMap: Record<string, any[]> = {};
    for (const link of enriched) {
      if (!enrichedMap[link.pomodoro_id]) enrichedMap[link.pomodoro_id] = [];
      enrichedMap[link.pomodoro_id].push(link);
    }

    const sessions = rows.map(r => ({ ...r, links: enrichedMap[r.id] || [] }));
    ok(res, sessions);
  } catch (error) {
    serverError(res, error);
  }
});

// GET /stats — Pomo stats for an entity
router.get('/stats', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const { target_type, target_id } = req.query;
    if (!target_type || !target_id) return fail(res, 400, 'target_type and target_id required');

    const row = db.prepare(`
      SELECT COUNT(*) as pomo_count, COALESCE(SUM(ps.duration_minutes), 0) as total_minutes
      FROM pomodoro_links pl
      JOIN pomodoro_sessions ps ON ps.id = pl.pomodoro_id
      WHERE pl.target_type = ? AND pl.target_id = ? AND ps.user_id = ? AND ps.status = 'completed'
    `).get(target_type, target_id, userId) as any;

    ok(res, { pomo_count: row.pomo_count, total_minutes: row.total_minutes });
  } catch (error) {
    serverError(res, error);
  }
});

// POST / — Start a new pomodoro session with optional links
router.post('/', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const { duration_minutes, note, task_id, links } = req.body;

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO pomodoro_sessions (id, user_id, started_at, duration_minutes, status, note, created_at)
      VALUES (?, ?, ?, ?, 'in_progress', ?, ?)
    `).run(id, userId, now, duration_minutes || 25, note || null, now);

    // Insert links from the links array
    if (Array.isArray(links) && links.length > 0) {
      insertPomoLinks(id, links);
    }

    // Legacy: if task_id provided, also link it (backward compat)
    if (task_id) {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(task_id, userId);
      if (task) {
        db.prepare('INSERT OR IGNORE INTO pomodoro_links (pomodoro_id, target_type, target_id) VALUES (?, ?, ?)')
          .run(id, 'task', task_id);
        // Also maintain legacy task_links for backward compat
        db.prepare('INSERT OR IGNORE INTO task_links (task_id, target_type, target_id) VALUES (?, ?, ?)')
          .run(task_id, 'pomodoro', id);
      }
    }

    const session = db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ?').get(id) as any;
    const pomoLinks = loadPomoLinks([id]);
    const enrichedLinks = enrichPomoLinks(pomoLinks[id] || []);
    ok(res, { ...session, links: enrichedLinks }, 201);
  } catch (error) {
    serverError(res, error);
  }
});

// GET /:id — Get single session with links
router.get('/:id', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const session = db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ? AND user_id = ?').get(id, userId);
    if (!session) return fail(res, 404, 'Session not found');

    const pomoLinks = loadPomoLinks([id]);
    const enrichedLinks = enrichPomoLinks(pomoLinks[id] || []);

    ok(res, { ...session, links: enrichedLinks });
  } catch (error) {
    serverError(res, error);
  }
});

// PUT /:id — Update session (status, note, links)
router.put('/:id', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const existing = db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ? AND user_id = ?').get(id, userId);
    if (!existing) return fail(res, 404, 'Session not found');

    const { status, note, ended_at, links } = req.body;

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

    // Replace links if provided
    if (Array.isArray(links)) {
      db.prepare('DELETE FROM pomodoro_links WHERE pomodoro_id = ?').run(id);
      insertPomoLinks(id, links);
    }

    const session = db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ?').get(id) as any;
    const pomoLinks = loadPomoLinks([id]);
    const enrichedLinks = enrichPomoLinks(pomoLinks[id] || []);
    ok(res, { ...session, links: enrichedLinks });
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

    const session = db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ?').get(id) as any;
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
