import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { ok, fail, serverError } from '../utils/response';
import { ensureProjectBuckets } from '../utils/buckets';

const router = Router();

function loadTaskLinkTarget(userId: string, targetType: string, targetId: string): boolean {
  const targetQueries: Record<string, string> = {
    goal: 'SELECT id FROM primary_goals WHERE id = ? AND user_id = ?',
    subgoal: 'SELECT sg.id FROM sub_goals sg JOIN primary_goals pg ON sg.primary_goal_id = pg.id WHERE sg.id = ? AND pg.user_id = ?',
    habit: 'SELECT id FROM habits WHERE id = ? AND user_id = ?',
    pomodoro: 'SELECT id FROM pomodoro_sessions WHERE id = ? AND user_id = ?',
  };

  const sql = targetQueries[targetType];
  if (!sql) return false;
  return !!db.prepare(sql).get(targetId, userId);
}

function validateTaskLabels(userId: string, labelIds: string[]) {
  const uniqueIds = [...new Set(labelIds)];
  if (uniqueIds.length === 0) return true;
  const placeholders = uniqueIds.map(() => '?').join(',');
  const row = db.prepare(`
    SELECT COUNT(*) as count
    FROM labels
    WHERE user_id = ? AND id IN (${placeholders})
  `).get(userId, ...uniqueIds) as { count: number };
  return row.count === uniqueIds.length;
}

function getOwnedProject(userId: string, projectId: string | null | undefined) {
  if (!projectId) return null;
  return db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId) as { id: string } | undefined;
}

function getOwnedSprint(userId: string, sprintId: string | null | undefined) {
  if (!sprintId) return null;
  return db.prepare(`
    SELECT s.id, s.project_id
    FROM sprints s
    JOIN projects p ON s.project_id = p.id
    WHERE s.id = ? AND p.user_id = ?
  `).get(sprintId, userId) as { id: string; project_id: string } | undefined;
}

function getOwnedBucket(userId: string, bucketId: string | null | undefined) {
  if (!bucketId) return null;
  return db.prepare(`
    SELECT b.id, b.project_id, b.sprint_id, b.is_done_column
    FROM buckets b
    JOIN projects p ON b.project_id = p.id
    WHERE b.id = ? AND p.user_id = ?
  `).get(bucketId, userId) as { id: string; project_id: string; sprint_id: string | null; is_done_column: number } | undefined;
}

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
  // Determine owner user_id from the first task's link for scoping resolution queries
  // Since loadTaskLinks is only called with the current user's tasks, we extract user_id from the task
  const ownerRow = taskIds.length > 0 ? db.prepare('SELECT user_id FROM tasks WHERE id = ?').get(taskIds[0]) as any : null;
  const ownerId = ownerRow?.user_id;

  const goalMap: Record<string, any> = {};
  if (goalIds.size > 0 && ownerId) {
    const ph = [...goalIds].map(() => '?').join(',');
    const rows = db.prepare(`SELECT id, title FROM primary_goals WHERE id IN (${ph}) AND user_id = ?`).all(...goalIds, ownerId) as any[];
    for (const r of rows) goalMap[r.id] = r;
  }

  const subgoalMap: Record<string, any> = {};
  if (subgoalIds.size > 0 && ownerId) {
    const ph = [...subgoalIds].map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT sg.id, sg.title, sg.position, pg.id as goal_id, pg.title as goal_title
      FROM sub_goals sg JOIN primary_goals pg ON sg.primary_goal_id = pg.id
      WHERE sg.id IN (${ph}) AND pg.user_id = ?
    `).all(...subgoalIds, ownerId) as any[];
    for (const r of rows) subgoalMap[r.id] = r;
  }

  const habitMap: Record<string, any> = {};
  if (habitIds.size > 0 && ownerId) {
    const ph = [...habitIds].map(() => '?').join(',');
    const rows = db.prepare(`SELECT id, title, emoji, type FROM habits WHERE id IN (${ph}) AND user_id = ?`).all(...habitIds, ownerId) as any[];
    for (const r of rows) habitMap[r.id] = r;
  }

  const pomodoroMap: Record<string, any> = {};
  if (pomodoroIds.size > 0 && ownerId) {
    const ph = [...pomodoroIds].map(() => '?').join(',');
    const rows = db.prepare(`SELECT id, started_at, duration_minutes FROM pomodoro_sessions WHERE id IN (${ph}) AND user_id = ?`).all(...pomodoroIds, ownerId) as any[];
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

/// Helper: load agent action counts per task
function loadAgentActionCounts(taskIds: string[]): Record<string, { total: number; draft: number; staged: number; running: number; done: number; failed: number }> {
  const map: Record<string, { total: number; draft: number; staged: number; running: number; done: number; failed: number }> = {};
  if (taskIds.length === 0) return map;
  const ph = taskIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT task_id,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft,
      SUM(CASE WHEN status = 'staged' THEN 1 ELSE 0 END) as staged,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM agent_actions WHERE task_id IN (${ph}) GROUP BY task_id
  `).all(...taskIds) as any[];
  for (const row of rows) {
    map[row.task_id] = { total: row.total, draft: row.draft, staged: row.staged, running: row.running, done: row.done, failed: row.failed };
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

function loadSprintBuckets(sprintIds: string[]): Record<string, any[]> {
  const map: Record<string, any[]> = {};
  if (sprintIds.length === 0) return map;
  const unique = [...new Set(sprintIds)];
  const ph = unique.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT id, sprint_id, title, emoji, position, is_done_column, show_inline FROM buckets WHERE sprint_id IN (${ph}) ORDER BY position ASC`
  ).all(...unique) as any[];
  for (const row of rows) {
    if (!map[row.sprint_id]) map[row.sprint_id] = [];
    map[row.sprint_id].push({ id: row.id, title: row.title, emoji: row.emoji, position: row.position, is_done_column: row.is_done_column, show_inline: row.show_inline });
  }
  return map;
}

function loadProjectBuckets(projectIds: string[]): Record<string, any[]> {
  const map: Record<string, any[]> = {};
  if (projectIds.length === 0) return map;
  const unique = [...new Set(projectIds)];
  // Lazily create default buckets for projects that don't have them yet
  for (const pid of unique) {
    ensureProjectBuckets(pid);
  }
  const ph = unique.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT id, project_id, title, emoji, position, is_done_column, show_inline FROM buckets WHERE project_id IN (${ph}) AND sprint_id IS NULL ORDER BY position ASC`
  ).all(...unique) as any[];
  for (const row of rows) {
    if (!map[row.project_id]) map[row.project_id] = [];
    map[row.project_id].push({ id: row.id, title: row.title, emoji: row.emoji, position: row.position, is_done_column: row.is_done_column, show_inline: row.show_inline });
  }
  return map;
}

function enrichTask(t: any, labels: any[], links: any[], relations?: any[], checklistCount?: { total: number; done: number }, checklistItems?: any[], sprintBuckets?: any[], projectBuckets?: any[], agentActionCount?: { total: number; draft: number; staged: number; running: number; done: number; failed: number }) {
  // Use sprint buckets if task is in a sprint, otherwise project-level buckets
  const buckets = sprintBuckets || projectBuckets || null;

  // Auto-assign bucket_id for project tasks that don't have one yet
  let effectiveBucketId = t.bucket_id;
  if (!effectiveBucketId && !t.sprint_id && projectBuckets && projectBuckets.length > 0) {
    const defaultBucket = t.done
      ? projectBuckets.find((b: any) => b.is_done_column)
      : projectBuckets.find((b: any) => !b.is_done_column);
    if (defaultBucket) {
      effectiveBucketId = defaultBucket.id;
      // Persist the assignment
      db.prepare('UPDATE tasks SET bucket_id = ? WHERE id = ?').run(defaultBucket.id, t.id);
    }
  }

  return {
    ...t,
    bucket_id: effectiveBucketId,
    labels,
    links,
    relations: relations || [],
    checklist_count: checklistCount || { total: 0, done: 0 },
    ...(checklistItems !== undefined ? { checklist_items: checklistItems } : {}),
    sprint_buckets: buckets,
    project: t.project_id ? {
      id: t.project_id, title: t.project_title, hex_color: t.project_color,
    } : null,
    sprint: t.sprint_id ? {
      id: t.sprint_id, title: t.sprint_title,
    } : null,
    agent_action_count: agentActionCount || null,
  };
}

// Base SELECT for tasks (no subgoal join)
const TASK_SELECT = `
  SELECT t.*,
    p.title as project_title, p.hex_color as project_color,
    s.title as sprint_title,
    b.title as bucket_title, b.emoji as bucket_emoji, b.is_done_column as bucket_is_done_column,
    u.username as assignee_username
  FROM tasks t
  LEFT JOIN projects p ON t.project_id = p.id AND p.user_id = t.user_id
  LEFT JOIN sprints s ON t.sprint_id = s.id
  LEFT JOIN buckets b ON t.bucket_id = b.id
  LEFT JOIN users u ON t.assignee_user_id = u.id
`;

// GET / — List tasks with filters
router.get('/', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const { project_id, done, priority, label, due_before, due_after, search, favorite, linked_to, project_type, sprint_id, exclude_dev, exclude_types, include_checklist, include_archived } = req.query;

    let sql = TASK_SELECT;
    const conditions: string[] = ['t.user_id = ?'];
    const params: any[] = [userId];

    // Exclude archived tasks by default
    if (include_archived !== 'true' && include_archived !== '1') {
      conditions.push('(t.archived IS NULL OR t.archived = 0)');
    }

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
    const agentActionMap = loadAgentActionCounts(ids);
    const sprintIds = rows.filter(r => r.sprint_id).map(r => r.sprint_id);
    const sprintBucketsMap = loadSprintBuckets(sprintIds);
    // Load project-level buckets for tasks without a sprint but with a project
    const projectIdsForBuckets = rows.filter(r => r.project_id && !r.sprint_id).map(r => r.project_id);
    const projectBucketsMap = loadProjectBuckets(projectIdsForBuckets);
    const tasks = rows.map(t => enrichTask(
      t, labelsMap[t.id] || [], linksMap[t.id] || [], relationsMap[t.id] || [],
      checklistMap[t.id], include_checklist ? (checklistItemsMap[t.id] || []) : undefined,
      t.sprint_id ? sprintBucketsMap[t.sprint_id] || [] : undefined,
      !t.sprint_id && t.project_id ? projectBucketsMap[t.project_id] || [] : undefined,
      agentActionMap[t.id]
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

    const project = getOwnedProject(userId, project_id);
    if (project_id && !project) return fail(res, 400, 'Project not found');

    const sprint = getOwnedSprint(userId, sprint_id);
    if (sprint_id && !sprint) return fail(res, 400, 'Sprint not found');

    const bucket = getOwnedBucket(userId, bucket_id);
    if (bucket_id && !bucket) return fail(res, 400, 'Bucket not found');

    const resolvedProjectId = project?.id ?? sprint?.project_id ?? bucket?.project_id ?? null;
    const resolvedSprintId = sprint?.id ?? bucket?.sprint_id ?? null;

    if (project && sprint && sprint.project_id !== project.id) {
      return fail(res, 400, 'Sprint does not belong to the selected project');
    }
    if (bucket && resolvedProjectId && bucket.project_id !== resolvedProjectId) {
      return fail(res, 400, 'Bucket does not belong to the selected project');
    }
    if (bucket && resolvedSprintId !== (bucket.sprint_id ?? null)) {
      return fail(res, 400, 'Bucket does not belong to the selected sprint');
    }
    if (labels !== undefined && (!Array.isArray(labels) || !validateTaskLabels(userId, labels))) {
      return fail(res, 400, 'One or more labels are invalid');
    }
    if (links !== undefined) {
      if (!Array.isArray(links)) return fail(res, 400, 'links must be an array');
      for (const link of links) {
        if (!link?.target_type || !link?.target_id || !loadTaskLinkTarget(userId, link.target_type, link.target_id)) {
          return fail(res, 400, 'One or more task links are invalid');
        }
      }
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO tasks (id, user_id, project_id, title, description, due_date, start_date, end_date,
        priority, hex_color, bucket_id, repeat_after, repeat_mode, sprint_id, assignee_user_id, assignee_name, task_type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, resolvedProjectId, title.trim(), description || null,
      due_date || null, start_date || null, end_date || null,
      priority || 0, hex_color || '', bucket?.id || null,
      repeat_after || 0, repeat_mode || 0,
      resolvedSprintId, assignee_user_id || null, assignee_name || null, task_type || 'task',
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
    const taskAgentActions = loadAgentActionCounts([id]);
    const newSprintBuckets = task.sprint_id ? loadSprintBuckets([task.sprint_id])[task.sprint_id] || [] : undefined;
    const newProjectBuckets = !task.sprint_id && task.project_id ? loadProjectBuckets([task.project_id])[task.project_id] || [] : undefined;
    ok(res, enrichTask(task, taskLabels, taskLinks[id] || [], taskRelations[id] || [], taskChecklist[id], undefined, newSprintBuckets, newProjectBuckets, taskAgentActions[id]), 201);
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
    const taskAgentActions = loadAgentActionCounts([id]);
    const comments = db.prepare('SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC').all(id);
    const sprintBuckets = task.sprint_id ? loadSprintBuckets([task.sprint_id])[task.sprint_id] || [] : undefined;
    const projBuckets = !task.sprint_id && task.project_id ? loadProjectBuckets([task.project_id])[task.project_id] || [] : undefined;

    ok(res, { ...enrichTask(task, taskLabels, taskLinks[id] || [], taskRelations[id] || [], taskChecklist[id], undefined, sprintBuckets, projBuckets, taskAgentActions[id]), comments });
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

    const { title, description, project_id, due_date, start_date, end_date, priority, hex_color, percent_done, position, bucket_id, repeat_after, repeat_mode, labels, links, sprint_id, assignee_user_id, assignee_name, task_type, done } = req.body;

    const requestedProjectId = project_id !== undefined ? project_id : existing.project_id;
    const requestedSprintId = sprint_id !== undefined ? sprint_id : existing.sprint_id;
    const requestedBucketId = bucket_id !== undefined ? bucket_id : existing.bucket_id;

    const project = getOwnedProject(userId, requestedProjectId);
    if (requestedProjectId && !project) return fail(res, 400, 'Project not found');

    const sprint = getOwnedSprint(userId, requestedSprintId);
    if (requestedSprintId && !sprint) return fail(res, 400, 'Sprint not found');

    const bucket = getOwnedBucket(userId, requestedBucketId);
    if (requestedBucketId && !bucket) return fail(res, 400, 'Bucket not found');

    const resolvedProjectId = project?.id ?? sprint?.project_id ?? bucket?.project_id ?? null;
    const resolvedSprintId = sprint?.id ?? bucket?.sprint_id ?? null;

    if (project && sprint && sprint.project_id !== project.id) {
      return fail(res, 400, 'Sprint does not belong to the selected project');
    }
    if (bucket && resolvedProjectId && bucket.project_id !== resolvedProjectId) {
      return fail(res, 400, 'Bucket does not belong to the selected project');
    }
    if (bucket && resolvedSprintId !== (bucket.sprint_id ?? null)) {
      return fail(res, 400, 'Bucket does not belong to the selected sprint');
    }
    if (labels !== undefined && (!Array.isArray(labels) || !validateTaskLabels(userId, labels))) {
      return fail(res, 400, 'One or more labels are invalid');
    }
    if (links !== undefined) {
      if (!Array.isArray(links)) return fail(res, 400, 'links must be an array');
      for (const link of links) {
        if (!link?.target_type || !link?.target_id || !loadTaskLinkTarget(userId, link.target_type, link.target_id)) {
          return fail(res, 400, 'One or more task links are invalid');
        }
      }
    }

    const now = new Date().toISOString();

    // Auto-sync done flag when bucket changes
    let resolvedDone = done !== undefined ? (done ? 1 : 0) : existing.done;
    if (bucket && bucket.id !== existing.bucket_id) {
      if (bucket.is_done_column && !resolvedDone) resolvedDone = 1;
      if (!bucket.is_done_column && resolvedDone) resolvedDone = 0;
    }
    const resolvedDoneAt = resolvedDone ? (existing.done ? existing.done_at : now) : null;

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
        done = ?,
        done_at = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      title?.trim() || null,
      description !== undefined ? description : existing.description,
      resolvedProjectId,
      due_date !== undefined ? due_date : existing.due_date,
      start_date !== undefined ? start_date : existing.start_date,
      end_date !== undefined ? end_date : existing.end_date,
      priority !== undefined ? priority : null,
      hex_color !== undefined ? hex_color : null,
      percent_done !== undefined ? percent_done : null,
      position !== undefined ? position : null,
      bucket?.id ?? null,
      repeat_after !== undefined ? repeat_after : null,
      repeat_mode !== undefined ? repeat_mode : null,
      resolvedSprintId,
      assignee_user_id !== undefined ? assignee_user_id : existing.assignee_user_id,
      assignee_name !== undefined ? assignee_name : existing.assignee_name,
      task_type || null,
      resolvedDone, resolvedDoneAt,
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
    const taskAgentActions = loadAgentActionCounts([id]);
    const updatedSprintBuckets = task.sprint_id ? loadSprintBuckets([task.sprint_id])[task.sprint_id] || [] : undefined;
    const updatedProjectBuckets = !task.sprint_id && task.project_id ? loadProjectBuckets([task.project_id])[task.project_id] || [] : undefined;
    ok(res, enrichTask(task, taskLabels, taskLinks[id] || [], taskRelations[id] || [], taskChecklist[id], undefined, updatedSprintBuckets, updatedProjectBuckets, taskAgentActions[id]));
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

    // Auto-sync bucket when toggling done — move to done bucket or back to first non-done bucket
    let newBucketId = existing.bucket_id;
    // Check sprint-level buckets first, then project-level buckets
    const bucketQuery = existing.sprint_id
      ? 'SELECT id, is_done_column, position FROM buckets WHERE sprint_id = ? ORDER BY position ASC'
      : existing.project_id
        ? 'SELECT id, is_done_column, position FROM buckets WHERE project_id = ? AND sprint_id IS NULL ORDER BY position ASC'
        : null;
    const bucketParam = existing.sprint_id || existing.project_id;
    if (bucketQuery && bucketParam) {
      const buckets = db.prepare(bucketQuery).all(bucketParam) as any[];
      if (newDone) {
        const doneBucket = buckets.find(b => b.is_done_column);
        if (doneBucket) newBucketId = doneBucket.id;
      } else {
        const firstNonDone = buckets.find(b => !b.is_done_column);
        if (firstNonDone) newBucketId = firstNonDone.id;
      }
    }

    db.prepare('UPDATE tasks SET done = ?, done_at = ?, bucket_id = ?, updated_at = ? WHERE id = ?')
      .run(newDone, newDone ? now : null, newBucketId, now, id);

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
    if (!loadTaskLinkTarget(userId, target_type, target_id)) return fail(res, 400, `${target_type} not found`);

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

// ─── Agent Actions CRUD ─────────────────────────────────────────────

// List agent actions for a task
router.get('/:id/agent-actions', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const taskId = req.params.id;
    const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?').get(taskId, userId);
    if (!task) return fail(res, 404, 'Task not found');

    const actions = db.prepare('SELECT * FROM agent_actions WHERE task_id = ? ORDER BY position ASC').all(taskId);
    ok(res, actions);
  } catch (error) {
    serverError(res, error);
  }
});

// Create agent action
router.post('/:id/agent-actions', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const taskId = req.params.id;
    const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?').get(taskId, userId);
    if (!task) return fail(res, 404, 'Task not found');

    const { title, description } = req.body;
    if (!title?.trim()) return fail(res, 400, 'Title is required');

    const id = uuidv4();
    const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 as next FROM agent_actions WHERE task_id = ?').get(taskId) as any;
    const now = new Date().toISOString();

    db.prepare(`INSERT INTO agent_actions (id, task_id, user_id, title, description, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, taskId, userId, title.trim(), description || null, maxPos.next, now, now);

    const action = db.prepare('SELECT * FROM agent_actions WHERE id = ?').get(id);
    ok(res, action, 201);
  } catch (error) {
    serverError(res, error);
  }
});

// Update agent action
router.put('/:id/agent-actions/:actionId', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id: taskId, actionId } = req.params;
    const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?').get(taskId, userId);
    if (!task) return fail(res, 404, 'Task not found');

    const existing = db.prepare('SELECT * FROM agent_actions WHERE id = ? AND task_id = ?').get(actionId, taskId) as any;
    if (!existing) return fail(res, 404, 'Agent action not found');

    const { title, description, position, config, depends_on, prompt_template } = req.body;
    const now = new Date().toISOString();
    const updates: any = { updated_at: now };
    if (title !== undefined) updates.title = title.trim() || existing.title;
    if (description !== undefined) updates.description = description;
    if (position !== undefined) updates.position = position;
    if (config !== undefined) updates.config = typeof config === 'string' ? config : JSON.stringify(config);
    if (depends_on !== undefined) updates.depends_on = depends_on;
    if (prompt_template !== undefined) updates.prompt_template = prompt_template;

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE agent_actions SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), actionId);

    const action = db.prepare('SELECT * FROM agent_actions WHERE id = ?').get(actionId);
    ok(res, action);
  } catch (error) {
    serverError(res, error);
  }
});

// Update agent action status
router.patch('/:id/agent-actions/:actionId/status', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id: taskId, actionId } = req.params;
    const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?').get(taskId, userId);
    if (!task) return fail(res, 404, 'Task not found');

    const existing = db.prepare('SELECT * FROM agent_actions WHERE id = ? AND task_id = ?').get(actionId, taskId) as any;
    if (!existing) return fail(res, 404, 'Agent action not found');

    const { status, result, error: errorMsg, commit_hash, files_changed, agent_model, tokens_in, tokens_out, cost_cents } = req.body;
    if (!status) return fail(res, 400, 'Status is required');

    // Validate transitions
    const validTransitions: Record<string, string[]> = {
      draft: ['staged'],
      staged: ['draft', 'running'],
      running: ['done', 'failed'],
      done: ['draft'],
      failed: ['draft', 'staged'],
    };
    if (!validTransitions[existing.status]?.includes(status)) {
      return fail(res, 400, `Invalid transition: ${existing.status} → ${status}`);
    }

    // Check dependency when transitioning to running
    if (status === 'running' && existing.depends_on) {
      const dep = db.prepare('SELECT id, title, status FROM agent_actions WHERE id = ?').get(existing.depends_on) as any;
      if (dep && dep.status !== 'done') {
        return fail(res, 400, `Blocked by: ${dep.title} (status: ${dep.status})`);
      }
    }

    const now = new Date().toISOString();
    const updates: any = { status, updated_at: now };
    if (status === 'running') updates.started_at = now;
    if (status === 'done' || status === 'failed') updates.completed_at = now;
    if (result !== undefined) updates.result = result;
    if (errorMsg !== undefined) updates.error = errorMsg;
    if (commit_hash !== undefined) updates.commit_hash = commit_hash;
    if (files_changed !== undefined) updates.files_changed = typeof files_changed === 'string' ? files_changed : JSON.stringify(files_changed);
    if (agent_model !== undefined) updates.agent_model = agent_model;
    if (tokens_in !== undefined) updates.tokens_in = tokens_in;
    if (tokens_out !== undefined) updates.tokens_out = tokens_out;
    if (cost_cents !== undefined) updates.cost_cents = cost_cents;

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE agent_actions SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), actionId);

    const action = db.prepare('SELECT * FROM agent_actions WHERE id = ?').get(actionId);
    ok(res, action);
  } catch (error) {
    serverError(res, error);
  }
});

// Delete agent action
router.delete('/:id/agent-actions/:actionId', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id: taskId, actionId } = req.params;
    const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?').get(taskId, userId);
    if (!task) return fail(res, 404, 'Task not found');

    const existing = db.prepare('SELECT * FROM agent_actions WHERE id = ? AND task_id = ?').get(actionId, taskId);
    if (!existing) return fail(res, 404, 'Agent action not found');

    db.prepare('DELETE FROM agent_actions WHERE id = ?').run(actionId);
    ok(res, { deleted: true });
  } catch (error) {
    serverError(res, error);
  }
});

// Reorder agent actions
router.patch('/:id/agent-actions/reorder', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const taskId = req.params.id;
    const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?').get(taskId, userId);
    if (!task) return fail(res, 404, 'Task not found');

    const { items } = req.body;
    if (!Array.isArray(items)) return fail(res, 400, 'items array required');

    const stmt = db.prepare('UPDATE agent_actions SET position = ?, updated_at = ? WHERE id = ? AND task_id = ?');
    const now = new Date().toISOString();
    for (const item of items) {
      stmt.run(item.position, now, item.id, taskId);
    }

    const actions = db.prepare('SELECT * FROM agent_actions WHERE task_id = ? ORDER BY position ASC').all(taskId);
    ok(res, actions);
  } catch (error) {
    serverError(res, error);
  }
});

export default router;
