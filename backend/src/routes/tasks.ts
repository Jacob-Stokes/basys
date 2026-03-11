import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { ok, fail, serverError } from '../utils/response';

const router = Router();

// Helper: load labels for a set of task IDs
function loadTaskLabels(taskIds: string[]): Record<string, any[]> {
  const map: Record<string, any[]> = {};
  for (const taskId of taskIds) {
    map[taskId] = db.prepare(`
      SELECT l.* FROM labels l
      JOIN task_labels tl ON tl.label_id = l.id
      WHERE tl.task_id = ?
    `).all(taskId) as any[];
  }
  return map;
}

// Helper: load links for a set of task IDs, resolving target titles
function loadTaskLinks(taskIds: string[]): Record<string, any[]> {
  const map: Record<string, any[]> = {};
  for (const taskId of taskIds) {
    const rawLinks = db.prepare('SELECT * FROM task_links WHERE task_id = ? ORDER BY target_type, created_at').all(taskId) as any[];
    map[taskId] = rawLinks.map(link => {
      let target_title = '';
      let extra: any = {};
      if (link.target_type === 'goal') {
        const g = db.prepare('SELECT title FROM primary_goals WHERE id = ?').get(link.target_id) as any;
        target_title = g?.title || 'Unknown goal';
      } else if (link.target_type === 'subgoal') {
        const sg = db.prepare(`
          SELECT sg.title, sg.position, pg.id as goal_id, pg.title as goal_title
          FROM sub_goals sg JOIN primary_goals pg ON sg.primary_goal_id = pg.id
          WHERE sg.id = ?
        `).get(link.target_id) as any;
        target_title = sg ? `${sg.goal_title} › ${sg.title}` : 'Unknown sub-goal';
        if (sg) extra = { goal_id: sg.goal_id, goal_title: sg.goal_title, subgoal_title: sg.title, subgoal_position: sg.position };
      } else if (link.target_type === 'habit') {
        const h = db.prepare('SELECT title, emoji, type FROM habits WHERE id = ?').get(link.target_id) as any;
        target_title = h ? `${h.emoji} ${h.title}`.trim() : 'Unknown habit';
        if (h) extra = { habit_type: h.type };
      } else if (link.target_type === 'pomodoro') {
        const p = db.prepare('SELECT started_at, duration_minutes FROM pomodoro_sessions WHERE id = ?').get(link.target_id) as any;
        target_title = p ? `Pomodoro ${p.started_at}` : 'Unknown session';
        if (p) extra = { started_at: p.started_at, duration_minutes: p.duration_minutes };
      }
      return { ...link, target_title, ...extra };
    });
  }
  return map;
}

// Helper: enrich task row with labels + links + project
function enrichTask(t: any, labels: any[], links: any[]) {
  return {
    ...t,
    labels,
    links,
    project: t.project_id ? {
      id: t.project_id, title: t.project_title, hex_color: t.project_color,
    } : null,
  };
}

// Base SELECT for tasks (no subgoal join)
const TASK_SELECT = `
  SELECT t.*,
    p.title as project_title, p.hex_color as project_color
  FROM tasks t
  LEFT JOIN projects p ON t.project_id = p.id
`;

// GET / — List tasks with filters
router.get('/', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const { project_id, done, priority, label, due_before, due_after, search, favorite, linked_to, project_type, sprint_id, exclude_dev } = req.query;

    let sql = TASK_SELECT;
    const conditions: string[] = ['t.user_id = ?'];
    const params: any[] = [userId];

    if (project_id) {
      conditions.push('t.project_id = ?');
      params.push(project_id);
    }
    if (sprint_id) {
      conditions.push('t.sprint_id = ?');
      params.push(sprint_id);
    }
    // Filter by project type (e.g. project_type=personal to only show personal tasks)
    if (project_type) {
      conditions.push('(p.type = ? OR t.project_id IS NULL)');
      params.push(project_type);
    }
    // Exclude tasks belonging to non-personal projects (for homepage)
    if (exclude_dev === 'true' || exclude_dev === '1') {
      conditions.push("(p.type IS NULL OR p.type = 'personal' OR t.project_id IS NULL)");
    }
    if (done !== undefined) {
      conditions.push('t.done = ?');
      params.push(done === 'true' || done === '1' ? 1 : 0);
    }
    if (priority) {
      conditions.push('t.priority = ?');
      params.push(Number(priority));
    }
    if (favorite === 'true' || favorite === '1') {
      conditions.push('t.is_favorite = 1');
    }
    if (due_before) {
      conditions.push('t.due_date <= ?');
      params.push(due_before);
    }
    if (due_after) {
      conditions.push('t.due_date >= ?');
      params.push(due_after);
    }
    if (search) {
      conditions.push('(t.title LIKE ? OR t.description LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term);
    }
    if (label) {
      conditions.push('t.id IN (SELECT task_id FROM task_labels WHERE label_id = ?)');
      params.push(label);
    }
    // Filter by linked target (e.g. ?linked_to=subgoal:abc-123)
    if (linked_to && typeof linked_to === 'string' && linked_to.includes(':')) {
      const [targetType, targetId] = (linked_to as string).split(':', 2);
      conditions.push('t.id IN (SELECT task_id FROM task_links WHERE target_type = ? AND target_id = ?)');
      params.push(targetType, targetId);
    }

    sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY t.done ASC, t.position ASC, t.created_at DESC';

    const rows = db.prepare(sql).all(...params) as any[];
    const ids = rows.map(r => r.id);
    const labelsMap = loadTaskLabels(ids);
    const linksMap = loadTaskLinks(ids);
    const tasks = rows.map(t => enrichTask(t, labelsMap[t.id] || [], linksMap[t.id] || []));

    ok(res, tasks);
  } catch (error) {
    serverError(res, error);
  }
});

// POST / — Create task
router.post('/', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const { title, description, project_id, due_date, start_date, end_date, priority, hex_color, bucket_id, repeat_after, repeat_mode, labels, links, sprint_id, assignee_user_id, assignee_name, task_type } = req.body;
    if (!title?.trim()) return fail(res, 400, 'Title is required');

    if (project_id) {
      const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(project_id, userId);
      if (!project) return fail(res, 400, 'Project not found');
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO tasks (id, user_id, project_id, title, description, due_date, start_date, end_date,
        priority, hex_color, bucket_id, repeat_after, repeat_mode, sprint_id, assignee_user_id, assignee_name, task_type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, project_id || null, title.trim(), description || null,
      due_date || null, start_date || null, end_date || null,
      priority || 0, hex_color || '', bucket_id || null,
      repeat_after || 0, repeat_mode || 0,
      sprint_id || null, assignee_user_id || null, assignee_name || null, task_type || 'task',
      now, now);

    // Attach labels if provided
    if (labels && Array.isArray(labels)) {
      const insertLabel = db.prepare('INSERT OR IGNORE INTO task_labels (task_id, label_id) VALUES (?, ?)');
      for (const labelId of labels) {
        insertLabel.run(id, labelId);
      }
    }

    // Attach links if provided [{target_type, target_id}]
    if (links && Array.isArray(links)) {
      const insertLink = db.prepare('INSERT OR IGNORE INTO task_links (task_id, target_type, target_id) VALUES (?, ?, ?)');
      for (const link of links) {
        if (link.target_type && link.target_id) {
          insertLink.run(id, link.target_type, link.target_id);
        }
      }
    }

    const task = db.prepare(TASK_SELECT + ' WHERE t.id = ?').get(id) as any;
    const taskLabels = db.prepare('SELECT l.* FROM labels l JOIN task_labels tl ON tl.label_id = l.id WHERE tl.task_id = ?').all(id);
    const taskLinks = loadTaskLinks([id]);
    ok(res, enrichTask(task, taskLabels, taskLinks[id] || []), 201);
  } catch (error) {
    serverError(res, error);
  }
});

// GET /:id — Get single task with labels + links + comments
router.get('/:id', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;

    const task = db.prepare(TASK_SELECT + ' WHERE t.id = ? AND t.user_id = ?').get(id, userId) as any;
    if (!task) return fail(res, 404, 'Task not found');

    const taskLabels = db.prepare('SELECT l.* FROM labels l JOIN task_labels tl ON tl.label_id = l.id WHERE tl.task_id = ?').all(id);
    const taskLinks = loadTaskLinks([id]);
    const comments = db.prepare('SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC').all(id);

    ok(res, { ...enrichTask(task, taskLabels, taskLinks[id] || []), comments });
  } catch (error) {
    serverError(res, error);
  }
});

// PUT /:id — Update task
router.put('/:id', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, userId) as any;
    if (!existing) return fail(res, 404, 'Task not found');

    const { title, description, project_id, due_date, start_date, end_date, priority, hex_color, percent_done, position, bucket_id, repeat_after, repeat_mode, labels, links, sprint_id, assignee_user_id, assignee_name, task_type } = req.body;

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE tasks SET
        title = COALESCE(?, title),
        description = ?,
        project_id = ?,
        due_date = ?,
        start_date = ?,
        end_date = ?,
        priority = COALESCE(?, priority),
        hex_color = COALESCE(?, hex_color),
        percent_done = COALESCE(?, percent_done),
        position = COALESCE(?, position),
        bucket_id = ?,
        repeat_after = COALESCE(?, repeat_after),
        repeat_mode = COALESCE(?, repeat_mode),
        sprint_id = ?,
        assignee_user_id = ?,
        assignee_name = ?,
        task_type = COALESCE(?, task_type),
        updated_at = ?
      WHERE id = ?
    `).run(
      title?.trim() || null,
      description !== undefined ? description : existing.description,
      project_id !== undefined ? project_id : existing.project_id,
      due_date !== undefined ? due_date : existing.due_date,
      start_date !== undefined ? start_date : existing.start_date,
      end_date !== undefined ? end_date : existing.end_date,
      priority !== undefined ? priority : null,
      hex_color !== undefined ? hex_color : null,
      percent_done !== undefined ? percent_done : null,
      position !== undefined ? position : null,
      bucket_id !== undefined ? bucket_id : existing.bucket_id,
      repeat_after !== undefined ? repeat_after : null,
      repeat_mode !== undefined ? repeat_mode : null,
      sprint_id !== undefined ? sprint_id : existing.sprint_id,
      assignee_user_id !== undefined ? assignee_user_id : existing.assignee_user_id,
      assignee_name !== undefined ? assignee_name : existing.assignee_name,
      task_type || null,
      now, id
    );

    // Update labels if provided
    if (labels !== undefined && Array.isArray(labels)) {
      db.prepare('DELETE FROM task_labels WHERE task_id = ?').run(id);
      const insertLabel = db.prepare('INSERT OR IGNORE INTO task_labels (task_id, label_id) VALUES (?, ?)');
      for (const labelId of labels) {
        insertLabel.run(id, labelId);
      }
    }

    // Update links if provided (full replace)
    if (links !== undefined && Array.isArray(links)) {
      db.prepare('DELETE FROM task_links WHERE task_id = ?').run(id);
      const insertLink = db.prepare('INSERT OR IGNORE INTO task_links (task_id, target_type, target_id) VALUES (?, ?, ?)');
      for (const link of links) {
        if (link.target_type && link.target_id) {
          insertLink.run(id, link.target_type, link.target_id);
        }
      }
    }

    const task = db.prepare(TASK_SELECT + ' WHERE t.id = ?').get(id) as any;
    const taskLabels = db.prepare('SELECT l.* FROM labels l JOIN task_labels tl ON tl.label_id = l.id WHERE tl.task_id = ?').all(id);
    const taskLinks = loadTaskLinks([id]);
    ok(res, enrichTask(task, taskLabels, taskLinks[id] || []));
  } catch (error) {
    serverError(res, error);
  }
});

// DELETE /:id — Delete task
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, userId);
    if (!existing) return fail(res, 404, 'Task not found');

    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    ok(res, { deleted: true });
  } catch (error) {
    serverError(res, error);
  }
});

// PATCH /:id/done — Toggle done status
router.patch('/:id/done', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, userId) as any;
    if (!existing) return fail(res, 404, 'Task not found');

    const now = new Date().toISOString();
    const newDone = existing.done ? 0 : 1;

    // If marking done and task has repeat_after, reschedule instead of completing
    if (newDone && existing.repeat_after > 0) {
      const baseDate = existing.due_date ? new Date(existing.due_date) : new Date();
      const nextDate = new Date(baseDate.getTime() + existing.repeat_after * 1000);
      const nextDue = nextDate.toISOString().slice(0, 19); // YYYY-MM-DDTHH:MM:SS
      db.prepare('UPDATE tasks SET due_date = ?, updated_at = ? WHERE id = ?').run(nextDue, now, id);
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
      return ok(res, task);
    }

    db.prepare('UPDATE tasks SET done = ?, done_at = ?, updated_at = ? WHERE id = ?')
      .run(newDone, newDone ? now : null, now, id);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    ok(res, task);
  } catch (error) {
    serverError(res, error);
  }
});

// PATCH /:id/favorite — Toggle favorite
router.patch('/:id/favorite', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, userId) as any;
    if (!existing) return fail(res, 404, 'Task not found');

    const now = new Date().toISOString();
    db.prepare('UPDATE tasks SET is_favorite = ?, updated_at = ? WHERE id = ?')
      .run(existing.is_favorite ? 0 : 1, now, id);
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    ok(res, task);
  } catch (error) {
    serverError(res, error);
  }
});

// ── Task Links ─────────────────────────────────────────────────────

// GET /:id/links — List links for a task
router.get('/:id/links', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, userId);
    if (!task) return fail(res, 404, 'Task not found');

    const links = loadTaskLinks([id]);
    ok(res, links[id] || []);
  } catch (error) {
    serverError(res, error);
  }
});

// POST /:id/links — Add a link
router.post('/:id/links', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, userId);
    if (!task) return fail(res, 404, 'Task not found');

    const { target_type, target_id } = req.body;
    if (!target_type || !target_id) return fail(res, 400, 'target_type and target_id are required');
    if (!['goal', 'subgoal', 'habit', 'pomodoro'].includes(target_type)) {
      return fail(res, 400, 'target_type must be goal, subgoal, habit, or pomodoro');
    }

    db.prepare('INSERT OR IGNORE INTO task_links (task_id, target_type, target_id) VALUES (?, ?, ?)')
      .run(id, target_type, target_id);

    const links = loadTaskLinks([id]);
    ok(res, links[id] || [], 201);
  } catch (error) {
    serverError(res, error);
  }
});

// DELETE /:id/links/:targetType/:targetId — Remove a link
router.delete('/:id/links/:targetType/:targetId', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const targetType = req.params.targetType as string;
    const targetId = req.params.targetId as string;
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, userId);
    if (!task) return fail(res, 404, 'Task not found');

    db.prepare('DELETE FROM task_links WHERE task_id = ? AND target_type = ? AND target_id = ?')
      .run(id, targetType, targetId);
    ok(res, { removed: true });
  } catch (error) {
    serverError(res, error);
  }
});

// ── Task Labels ────────────────────────────────────────────────────

// POST /:id/labels/:labelId — Attach label to task
router.post('/:id/labels/:labelId', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const labelId = req.params.labelId as string;
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, userId);
    if (!task) return fail(res, 404, 'Task not found');
    const label = db.prepare('SELECT * FROM labels WHERE id = ? AND user_id = ?').get(labelId, userId);
    if (!label) return fail(res, 404, 'Label not found');

    db.prepare('INSERT OR IGNORE INTO task_labels (task_id, label_id) VALUES (?, ?)').run(id, labelId);
    ok(res, { attached: true });
  } catch (error) {
    serverError(res, error);
  }
});

// DELETE /:id/labels/:labelId — Detach label from task
router.delete('/:id/labels/:labelId', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const labelId = req.params.labelId as string;
    db.prepare('DELETE FROM task_labels WHERE task_id = ? AND label_id = ?').run(id, labelId);
    ok(res, { detached: true });
  } catch (error) {
    serverError(res, error);
  }
});

// ── Task Comments ──────────────────────────────────────────────────

// GET /:id/comments — List comments
router.get('/:id/comments', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, userId);
    if (!task) return fail(res, 404, 'Task not found');

    const comments = db.prepare('SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC').all(id);
    ok(res, comments);
  } catch (error) {
    serverError(res, error);
  }
});

// POST /:id/comments — Add comment
router.post('/:id/comments', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, userId);
    if (!task) return fail(res, 404, 'Task not found');

    const { content } = req.body;
    if (!content?.trim()) return fail(res, 400, 'Content is required');

    const commentId = uuidv4();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO task_comments (id, task_id, user_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(commentId, id, userId, content.trim(), now, now);

    const comment = db.prepare('SELECT * FROM task_comments WHERE id = ?').get(commentId);
    ok(res, comment, 201);
  } catch (error) {
    serverError(res, error);
  }
});

// DELETE /:id/comments/:commentId — Delete comment
router.delete('/:id/comments/:commentId', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const commentId = req.params.commentId as string;
    const existing = db.prepare('SELECT * FROM task_comments WHERE id = ? AND task_id = ? AND user_id = ?').get(commentId, id, userId);
    if (!existing) return fail(res, 404, 'Comment not found');

    db.prepare('DELETE FROM task_comments WHERE id = ?').run(commentId);
    ok(res, { deleted: true });
  } catch (error) {
    serverError(res, error);
  }
});

export default router;
