import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { ok, fail, serverError } from '../utils/response';

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────

function loadPomoLinkTarget(userId: string, targetType: string, targetId: string): boolean {
  const targetQueries: Record<string, string> = {
    task: 'SELECT id FROM tasks WHERE id = ? AND user_id = ?',
    project: 'SELECT id FROM projects WHERE id = ? AND user_id = ?',
    sprint: 'SELECT s.id FROM sprints s JOIN projects p ON s.project_id = p.id WHERE s.id = ? AND p.user_id = ?',
    goal: 'SELECT id FROM primary_goals WHERE id = ? AND user_id = ?',
    subgoal: 'SELECT sg.id FROM sub_goals sg JOIN primary_goals pg ON sg.primary_goal_id = pg.id WHERE sg.id = ? AND pg.user_id = ?',
    habit: 'SELECT id FROM habits WHERE id = ? AND user_id = ?',
  };

  const sql = targetQueries[targetType];
  if (!sql) return false;
  return !!db.prepare(sql).get(targetId, userId);
}

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

function enrichPomoLinks(links: any[], userId: string): any[] {
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
    const rows = db.prepare(`SELECT id, title FROM tasks WHERE user_id = ? AND id IN (${ph})`).all(userId, ...ids) as any[];
    for (const r of rows) titleMap[`task:${r.id}`] = r.title;
  }
  const colorMap: Record<string, string> = {};
  if (byType.project?.size) {
    const ids = Array.from(byType.project);
    const ph = ids.map(() => '?').join(',');
    const rows = db.prepare(`SELECT id, title, hex_color FROM projects WHERE user_id = ? AND id IN (${ph})`).all(userId, ...ids) as any[];
    for (const r of rows) {
      titleMap[`project:${r.id}`] = r.title;
      if (r.hex_color) colorMap[`project:${r.id}`] = r.hex_color;
    }
  }
  if (byType.sprint?.size) {
    const ids = Array.from(byType.sprint);
    const ph = ids.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT s.id, s.title
      FROM sprints s
      JOIN projects p ON s.project_id = p.id
      WHERE p.user_id = ? AND s.id IN (${ph})
    `).all(userId, ...ids) as any[];
    for (const r of rows) titleMap[`sprint:${r.id}`] = r.title;
  }
  if (byType.goal?.size) {
    const ids = Array.from(byType.goal);
    const ph = ids.map(() => '?').join(',');
    const rows = db.prepare(`SELECT id, title FROM primary_goals WHERE user_id = ? AND id IN (${ph})`).all(userId, ...ids) as any[];
    for (const r of rows) titleMap[`goal:${r.id}`] = r.title;
  }
  if (byType.subgoal?.size) {
    const ids = Array.from(byType.subgoal);
    const ph = ids.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT sg.id, sg.title
      FROM sub_goals sg
      JOIN primary_goals pg ON sg.primary_goal_id = pg.id
      WHERE pg.user_id = ? AND sg.id IN (${ph})
    `).all(userId, ...ids) as any[];
    for (const r of rows) titleMap[`subgoal:${r.id}`] = r.title;
  }
  if (byType.habit?.size) {
    const ids = Array.from(byType.habit);
    const ph = ids.map(() => '?').join(',');
    const rows = db.prepare(`SELECT id, title, emoji FROM habits WHERE user_id = ? AND id IN (${ph})`).all(userId, ...ids) as any[];
    for (const r of rows) titleMap[`habit:${r.id}`] = r.emoji ? `${r.emoji} ${r.title}` : r.title;
  }

  return links.map(link => ({
    ...link,
    target_title: titleMap[`${link.target_type}:${link.target_id}`] || 'Unknown',
    target_color: colorMap[`${link.target_type}:${link.target_id}`] || undefined,
  }));
}

function insertPomoLinks(pomoId: string, links: { target_type: string; target_id: string }[], userId: string) {
  const stmt = db.prepare('INSERT OR IGNORE INTO pomodoro_links (pomodoro_id, target_type, target_id) VALUES (?, ?, ?)');
  const existingTypes = new Set(links.map(l => `${l.target_type}:${l.target_id}`));

  for (const link of links) {
    stmt.run(pomoId, link.target_type, link.target_id);
  }

  // Auto-associate parent entities for tasks
  const taskLinks = links.filter(l => l.target_type === 'task');
  if (taskLinks.length > 0) {
    const taskIds = taskLinks.map(l => l.target_id);
    const ph = taskIds.map(() => '?').join(',');
    const tasks = db.prepare(`SELECT id, project_id, sprint_id FROM tasks WHERE user_id = ? AND id IN (${ph})`).all(userId, ...taskIds) as any[];
    const projectIds = new Set<string>();
    const sprintIds = new Set<string>();
    for (const t of tasks) {
      if (t.project_id && !existingTypes.has(`project:${t.project_id}`)) {
        projectIds.add(t.project_id);
        existingTypes.add(`project:${t.project_id}`);
      }
      if (t.sprint_id && !existingTypes.has(`sprint:${t.sprint_id}`)) {
        sprintIds.add(t.sprint_id);
        existingTypes.add(`sprint:${t.sprint_id}`);
      }
    }
    for (const pid of projectIds) stmt.run(pomoId, 'project', pid);
    for (const sid of sprintIds) stmt.run(pomoId, 'sprint', sid);
  }

  // Auto-associate parent goal for subgoals
  const subgoalLinks = links.filter(l => l.target_type === 'subgoal');
  if (subgoalLinks.length > 0) {
    const sgIds = subgoalLinks.map(l => l.target_id);
    const ph = sgIds.map(() => '?').join(',');
    const sgs = db.prepare(`
      SELECT sg.id, sg.primary_goal_id
      FROM sub_goals sg
      JOIN primary_goals pg ON sg.primary_goal_id = pg.id
      WHERE pg.user_id = ? AND sg.id IN (${ph})
    `).all(userId, ...sgIds) as any[];
    for (const sg of sgs) {
      if (sg.primary_goal_id && !existingTypes.has(`goal:${sg.primary_goal_id}`)) {
        stmt.run(pomoId, 'goal', sg.primary_goal_id);
        existingTypes.add(`goal:${sg.primary_goal_id}`);
      }
    }
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
    const enriched = enrichPomoLinks(allLinks, userId);
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

    if (Array.isArray(links)) {
      for (const link of links) {
        if (!link?.target_type || !link?.target_id || !loadPomoLinkTarget(userId, link.target_type, link.target_id)) {
          return fail(res, 400, 'One or more pomodoro links are invalid');
        }
      }
    }

    db.prepare(`
      INSERT INTO pomodoro_sessions (id, user_id, started_at, duration_minutes, status, note, created_at)
      VALUES (?, ?, ?, ?, 'in_progress', ?, ?)
    `).run(id, userId, now, duration_minutes || 25, note || null, now);

    // Insert links from the links array
    if (Array.isArray(links) && links.length > 0) {
      insertPomoLinks(id, links, userId);
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
    const enrichedLinks = enrichPomoLinks(pomoLinks[id] || [], userId);
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
    const enrichedLinks = enrichPomoLinks(pomoLinks[id] || [], userId);

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

    if (Array.isArray(links)) {
      for (const link of links) {
        if (!link?.target_type || !link?.target_id || !loadPomoLinkTarget(userId, link.target_type, link.target_id)) {
          return fail(res, 400, 'One or more pomodoro links are invalid');
        }
      }
    }

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
      insertPomoLinks(id, links, userId);
    }

    const session = db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ?').get(id) as any;
    const pomoLinks = loadPomoLinks([id]);
    const enrichedLinks = enrichPomoLinks(pomoLinks[id] || [], userId);
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
