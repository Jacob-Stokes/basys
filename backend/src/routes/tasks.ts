import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { ok, fail, serverError } from '../utils/response';

const router = Router();

// Helper: load labels for a set of task IDs (batch query)
function loadTaskLabels(taskIds: string[]): Record<string, any[]> {
  const map: Record<string, any[]> = {};
  if (taskIds.length === 0) return map;
  for (const id of taskIds) map[id] = [];
  const placeholders = taskIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT l.*, tl.task_id FROM labels l
    JOIN task_labels tl ON tl.label_id = l.id
    WHERE tl.task_id IN (${placeholders})
  `).all(...taskIds) as any[];
  for (const row of rows) {
    const { task_id, ...label } = row;
    map[task_id].push(label);
  }
  return map;
}

// Helper: load links for a set of task IDs, resolving target titles (batch queries)
function loadTaskLinks(taskIds: string[]): Record<string, any[]> {
  const map: Record<string, any[]> = {};
  if (taskIds.length === 0) return map;
  for (const id of taskIds) map[id] = [];
  const placeholders = taskIds.map(() => '?').join(',');

  // 1. Batch-fetch all links
  const rawLinks = db.prepare(`
    SELECT * FROM task_links WHERE task_id IN (${placeholders}) ORDER BY target_type, created_at
  `).all(...taskIds) as any[];

  if (rawLinks.length === 0) return map;

  // 2. Collect target IDs by type for batch resolution
  const goalIds = new Set<string>();
  const subgoalIds = new Set<string>();
  const habitIds = new Set<string>();
  const pomodoroIds = new Set<string>();
  for (const link of rawLinks) {
    if (link.target_type === 'goal') goalIds.add(link.target_id);
    else if (link.target_type === 'subgoal') subgoalIds.add(link.target_id);
    else if (link.target_type === 'habit') habitIds.add(link.target_id);
    else if (link.target_type === 'pomodoro') pomodoroIds.add(link.target_id);
  }

  // 3. Batch-resolve all targets (max 4 queries instead of N)
  const goalMap: Record<string, any> = {};
  if (goalIds.size > 0) {
    const ph = [...goalIds].map(() => '?').join(',');
    const rows = db.prepare(`SELECT id, title FROM primary_goals WHERE id IN (${ph})`).all(...goalIds) as any[];
    for (const r of rows) goalMap[r.id] = r;
  }

  const subgoalMap: Record<string, any> = {};
  if (subgoalIds.size > 0) {
    const ph = [...subgoalIds].map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT sg.id, sg.title, sg.position, pg.id as goal_id, pg.title as goal_title
      FROM sub_goals sg JOIN primary_goals pg ON sg.primary_goal_id = pg.id
      WHERE sg.id IN (${ph})
    `).all(...subgoalIds) as any[];
    for (const r of rows) subgoalMap[r.id] = r;
  }

  const habitMap: Record<string, any> = {};
  if (habitIds.size > 0) {
    const ph = [...habitIds].map(() => '?').join(',');
    const rows = db.prepare(`SELECT id, title, emoji, type FROM habits WHERE id IN (${ph})`).all(...habitIds) as any[];
    for (const r of rows) habitMap[r.id] = r;
  }

  const pomodoroMap: Record<string, any> = {};
  if (pomodoroIds.size > 0) {
    const ph = [...pomodoroIds].map(() => '?').join(',');
    const rows = db.prepare(`SELECT id, started_at, duration_minutes FROM pomodoro_sessions WHERE id IN (${ph})`).all(...pomodoroIds) as any[];
    for (const r of rows) pomodoroMap[r.id] = r;
  }

  // 4. Enrich links from pre-fetched maps
  for (const link of rawLinks) {
    let target_title = '';
    let extra: any = {};
    if (link.target_type === 'goal') {
      const g = goalMap[link.target_id];
      target_title = g?.title || 'Unknown goal';
    } else if (link.target_type === 'subgoal') {
      const sg = subgoalMap[link.target_id];
      target_title = sg ? `${sg.goal_title} › ${sg.title}` : 'Unknown sub-goal';
      if (sg) extra = { goal_id: sg.goal_id, goal_title: sg.goal_title, subgoal_title: sg.title, subgoal_position: sg.position };
    } else if (link.target_type === 'habit') {
      const h = habitMap[link.target_id];
      target_title = h ? `${h.emoji} ${h.title}`.trim() : 'Unknown habit';
      if (h) extra = { habit_type: h.type };
    } else if (link.target_type === 'pomodoro') {
      const p = pomodoroMap[link.target_id];
      target_title = p ? `Pomodoro ${p.started_at}` : 'Unknown session';
      if (p) extra = { started_at: p.started_at, duration_minutes: p.duration_minutes };
    }
    map[link.task_id].push({ ...link, target_title, ...extra });
  }
  return map;
}

// Inverse kind mapping for task relations
const INVERSE_KIND: Record<string, string> = {
  subtask: 'parent', parent: 'subtask',
  blocking: 'blocked_by', blocked_by: 'blocking',
  precedes: 'follows', follows: 'precedes',
  copied_from: 'copied_to', copied_to: 'copied_from',
  related: 'related', duplicates: 'duplicates',
};

// Helper: load relations for a set of task IDs (both directions)
function loadTaskRelations(taskIds: string[]): Record<string, any[]> {
  const map: Record<string, any[]> = {};
  if (taskIds.length === 0) return map;
  for (const id of taskIds) map[id] = [];
  const placeholders = taskIds.map(() => '?').join(',');

  // Forward relations (this task is task_id)
  const forward = db.prepare(`
    SELECT r.*, t.title as related_task_title, t.done as related_task_done, t.priority as related_task_priority
    FROM task_relations r
    JOIN tasks t ON t.id = r.related_task_id
    WHERE r.task_id IN (${placeholders})
  `).all(...taskIds) as any[];

  for (const r of forward) {
    map[r.task_id].push({
      id: r.id,
      relation_kind: r.relation_kind,
      other_task_id: r.related_task_id,
      other_task_title: r.related_task_title,
      other_task_done: r.related_task_done,
      other_task_priority: r.related_task_priority,
      created_at: r.created_at,
    });
  }

  // Inverse relations (this task is related_task_id)
  const inverse = db.prepare(`
    SELECT r.*, t.title as source_task_title, t.done as source_task_done, t.priority as source_task_priority
    FROM task_relations r
    JOIN tasks t ON t.id = r.task_id
    WHERE r.related_task_id IN (${placeholders})
  `).all(...taskIds) as any[];

  for (const r of inverse) {
    const invertedKind = INVERSE_KIND[r.relation_kind] || r.relation_kind;
    map[r.related_task_id].push({
      id: r.id,
      relation_kind: invertedKind,
      other_task_id: r.task_id,
      other_task_title: r.source_task_title,
      other_task_done: r.source_task_done,
      other_task_priority: r.source_task_priority,
      created_at: r.created_at,
      is_inverse: true,
    });
  }

  return map;
}

// Helper: enrich task row with labels + links + project
function loadChecklistCounts(taskIds: string[]): Record<string, { total: number; done: number }> {
  const map: Record<string, { total: number; done: number }> = {};
  if (taskIds.length === 0) return map;
  const ph = taskIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT task_id, COUNT(*) as total, SUM(CASE WHEN done = 1 THEN 1 ELSE 0 END) as done
    FROM task_checklist_items WHERE task_id IN (${ph}) GROUP BY task_id
  `).all(...taskIds) as any[];
  for (const row of rows) {
    map[row.task_id] = { total: row.total, done: row.done };
  }
  return map;
}

function loadChecklistItems(taskIds: string[]): Record<string, any[]> {
  const map: Record<string, any[]> = {};
  if (taskIds.length === 0) return map;
  const ph = taskIds.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT * FROM task_checklist_items WHERE task_id IN (${ph}) ORDER BY position ASC, created_at ASC`
  ).all(...taskIds) as any[];
  for (const row of rows) {
    if (!map[row.task_id]) map[row.task_id] = [];
    map[row.task_id].push(row);
  }
  return map;
}

function enrichTask(t: any, labels: any[], links: any[], relations?: any[], checklistCount?: { total: number; done: number }, checklistItems?: any[]) {
  return {
    ...t,
    labels,
    links,
    relations: relations || [],
    checklist_count: checklistCount || { total: 0, done: 0 },
    ...(checklistItems !== undefined ? { checklist_items: checklistItems } : {}),
    project: t.project_id ? {
      id: t.project_id, title: t.project_title, hex_color: t.project_color,
    } : null,
  };
}

// Base SELECT for tasks (no subgoal join)
const TASK_SELECT = `
  SELECT t.*,
    p.title as project_title, p.hex_color as project_color,
    b.title as bucket_title,
    u.username as assignee_username
  FROM tasks t
  LEFT JOIN projects p ON t.project_id = p.id
  LEFT JOIN buckets b ON t.bucket_id = b.id
  LEFT JOIN users u ON t.assignee_user_id = u.id
`;

// GET / — List tasks with filters
router.get('/', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const { project_id, done, priority, label, due_before, due_after, search, favorite, linked_to, project_type, sprint_id, exclude_dev, exclude_types, include_checklist } = req.query;

    let sql = TASK_SELECT;
    const conditions: string[] = ['t.user_id = ?'];
    const params: any[] = [userId];

    if (project_id) {
      conditions.push('t.project_id = ?');
      params.push(project_id);
    }
    if (sprint_id) {
      if (sprint_id === 'none') {
        conditions.push('t.sprint_id IS NULL');
      } else {
        conditions.push('t.sprint_id = ?');
        params.push(sprint_id);
      }
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
    // Exclude tasks belonging to projects of specific types (comma-separated)
    if (exclude_types && typeof exclude_types === 'string') {
      const types = exclude_types.split(',').map(t => t.trim()).filter(Boolean);
      if (types.length > 0) {
        const placeholders = types.map(() => '?').join(',');
        conditions.push(`(t.project_id IS NULL OR p.type IS NULL OR p.type NOT IN (${placeholders}))`);
        params.push(...types);
      }
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
    const relationsMap = loadTaskRelations(ids);
    const checklistMap = loadChecklistCounts(ids);
    const checklistItemsMap = include_checklist ? loadChecklistItems(ids) : {};
    const tasks = rows.map(t => enrichTask(
      t, labelsMap[t.id] || [], linksMap[t.id] || [], relationsMap[t.id] || [],
      checklistMap[t.id], include_checklist ? (checklistItemsMap[t.id] || []) : undefined
    ));

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
    const taskRelations = loadTaskRelations([id]);
    const taskChecklist = loadChecklistCounts([id]);
    ok(res, enrichTask(task, taskLabels, taskLinks[id] || [], taskRelations[id] || [], taskChecklist[id]), 201);
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
    const taskRelations = loadTaskRelations([id]);
    const taskChecklist = loadChecklistCounts([id]);
    const comments = db.prepare('SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC').all(id);

    ok(res, { ...enrichTask(task, taskLabels, taskLinks[id] || [], taskRelations[id] || [], taskChecklist[id]), comments });
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
    const taskRelations = loadTaskRelations([id]);
    const taskChecklist = loadChecklistCounts([id]);
    ok(res, enrichTask(task, taskLabels, taskLinks[id] || [], taskRelations[id] || [], taskChecklist[id]));
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

// ── Task Relations ─────────────────────────────────────────────────

const VALID_RELATION_KINDS = ['subtask', 'parent', 'related', 'duplicates', 'blocking', 'blocked_by', 'precedes', 'follows', 'copied_from', 'copied_to'];

// GET /:id/relations — List relations for a task (both directions)
router.get('/:id/relations', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, userId);
    if (!task) return fail(res, 404, 'Task not found');

    const relations = loadTaskRelations([id]);
    ok(res, relations[id] || []);
  } catch (error) {
    serverError(res, error);
  }
});

// POST /:id/relations — Add a relation
router.post('/:id/relations', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, userId);
    if (!task) return fail(res, 404, 'Task not found');

    const { related_task_id, relation_kind } = req.body;
    if (!related_task_id || !relation_kind) return fail(res, 400, 'related_task_id and relation_kind are required');
    if (!VALID_RELATION_KINDS.includes(relation_kind)) {
      return fail(res, 400, `Invalid relation_kind. Must be one of: ${VALID_RELATION_KINDS.join(', ')}`);
    }
    if (related_task_id === id) return fail(res, 400, 'Cannot relate a task to itself');

    const relatedTask = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(related_task_id, userId);
    if (!relatedTask) return fail(res, 404, 'Related task not found');

    const relationId = uuidv4();
    db.prepare('INSERT INTO task_relations (id, task_id, related_task_id, relation_kind) VALUES (?, ?, ?, ?)')
      .run(relationId, id, related_task_id, relation_kind);

    const relations = loadTaskRelations([id]);
    ok(res, relations[id] || [], 201);
  } catch (error) {
    serverError(res, error);
  }
});

// DELETE /:id/relations/:relationId — Remove a relation
router.delete('/:id/relations/:relationId', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const relationId = req.params.relationId as string;
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, userId);
    if (!task) return fail(res, 404, 'Task not found');

    // Allow deletion whether this task is task_id or related_task_id
    const existing = db.prepare('SELECT * FROM task_relations WHERE id = ? AND (task_id = ? OR related_task_id = ?)').get(relationId, id, id);
    if (!existing) return fail(res, 404, 'Relation not found');

    db.prepare('DELETE FROM task_relations WHERE id = ?').run(relationId);
    ok(res, { deleted: true });
  } catch (error) {
    serverError(res, error);
  }
});

// ── Task Checklist Items ──────────────────────────────────────────

// GET /:id/checklist — List checklist items
router.get('/:id/checklist', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, userId);
    if (!task) return fail(res, 404, 'Task not found');

    const items = db.prepare('SELECT * FROM task_checklist_items WHERE task_id = ? ORDER BY position ASC, created_at ASC').all(id);
    ok(res, items);
  } catch (error) {
    serverError(res, error);
  }
});

// POST /:id/checklist — Add checklist item
router.post('/:id/checklist', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, userId);
    if (!task) return fail(res, 404, 'Task not found');

    const { title } = req.body;
    if (!title?.trim()) return fail(res, 400, 'Title is required');

    const maxPos = db.prepare('SELECT MAX(position) as max FROM task_checklist_items WHERE task_id = ?').get(id) as any;
    const position = (maxPos?.max ?? -1) + 1;

    const itemId = uuidv4();
    db.prepare('INSERT INTO task_checklist_items (id, task_id, title, position) VALUES (?, ?, ?, ?)')
      .run(itemId, id, title.trim(), position);

    const item = db.prepare('SELECT * FROM task_checklist_items WHERE id = ?').get(itemId);
    ok(res, item, 201);
  } catch (error) {
    serverError(res, error);
  }
});

// PUT /:id/checklist/:itemId — Update checklist item (title, done, position)
router.put('/:id/checklist/:itemId', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const itemId = req.params.itemId as string;
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, userId);
    if (!task) return fail(res, 404, 'Task not found');

    const existing = db.prepare('SELECT * FROM task_checklist_items WHERE id = ? AND task_id = ?').get(itemId, id);
    if (!existing) return fail(res, 404, 'Checklist item not found');

    const { title, done, position } = req.body;
    db.prepare(`
      UPDATE task_checklist_items SET
        title = COALESCE(?, title),
        done = COALESCE(?, done),
        position = COALESCE(?, position)
      WHERE id = ?
    `).run(title?.trim() || null, done !== undefined ? (done ? 1 : 0) : null, position ?? null, itemId);

    const item = db.prepare('SELECT * FROM task_checklist_items WHERE id = ?').get(itemId);
    ok(res, item);
  } catch (error) {
    serverError(res, error);
  }
});

// DELETE /:id/checklist/:itemId — Delete checklist item
router.delete('/:id/checklist/:itemId', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const itemId = req.params.itemId as string;
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, userId);
    if (!task) return fail(res, 404, 'Task not found');

    const existing = db.prepare('SELECT * FROM task_checklist_items WHERE id = ? AND task_id = ?').get(itemId, id);
    if (!existing) return fail(res, 404, 'Checklist item not found');

    db.prepare('DELETE FROM task_checklist_items WHERE id = ?').run(itemId);
    ok(res, { deleted: true });
  } catch (error) {
    serverError(res, error);
  }
});

export default router;
