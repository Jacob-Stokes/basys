import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { goalOwnerCheck } from '../middleware/ownership';
import { seedDefaultEtiquette } from '../utils/etiquette';
import { deleteTasksCascade } from '../utils/taskCascade';

type ToolArgs = Record<string, any>;
type ToolHandler = (args: ToolArgs, userId: string) => any;
type BulkAction = 'bulk_create' | 'bulk_update' | 'bulk_delete';

const DEFAULT_BULK_ACTION_MAP: Record<BulkAction, string> = {
  bulk_create: 'create',
  bulk_update: 'update',
  bulk_delete: 'delete',
};

const MANAGE_ARG_ALIASES = {
  habitId: 'habit_id',
  taskId: 'task_id',
  commentId: 'comment_id',
  projectId: 'project_id',
  labelId: 'label_id',
  pomodoroId: 'pomodoro_id',
  shareId: 'share_id',
  goalId: 'goal_id',
  ruleId: 'rule_id',
  sprintId: 'sprint_id',
  columnId: 'column_id',
  noteId: 'note_id',
  eventId: 'event_id',
} as const;

function normalizeManageArgs(args: ToolArgs): ToolArgs {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return args;

  const normalizedArgs: ToolArgs = { ...args };
  for (const [legacyKey, normalizedKey] of Object.entries(MANAGE_ARG_ALIASES)) {
    if (normalizedArgs[normalizedKey] === undefined && normalizedArgs[legacyKey] !== undefined) {
      normalizedArgs[normalizedKey] = normalizedArgs[legacyKey];
    }
  }

  if (Array.isArray(normalizedArgs.items)) {
    normalizedArgs.items = normalizedArgs.items.map((item: unknown) => normalizeManageArgs(item as ToolArgs));
  }

  return normalizedArgs;
}

function hydrateTaskRelations(task: any) {
  if (!task) return task;
  task.labels = db.prepare('SELECT l.* FROM labels l JOIN task_labels tl ON l.id = tl.label_id WHERE tl.task_id = ?').all(task.id);
  task.links = db.prepare('SELECT * FROM task_links WHERE task_id = ?').all(task.id);
  return task;
}

function getTaskWithRelations(taskId: string) {
  const task = db.prepare(`
    SELECT t.*, p.title as project_title, p.hex_color as project_color, p.type as project_type
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.id = ?
  `).get(taskId) as any;
  return hydrateTaskRelations(task);
}

function createManagedActionHandler(
  actions: Record<string, ToolHandler>,
  options: {
    bulkActionMap?: Partial<Record<BulkAction, string>>;
  } = {}
): ToolHandler {
  const bulkActionMap = { ...DEFAULT_BULK_ACTION_MAP, ...options.bulkActionMap };

  return (rawArgs, userId) => {
    const args = normalizeManageArgs(rawArgs);
    const bulkTargetAction = bulkActionMap[args.action as BulkAction];
    if (bulkTargetAction) {
      const handler = actions[bulkTargetAction];
      if (!handler) {
        throw new Error(`Action ${args.action} is not supported`);
      }
      if (!Array.isArray(args.items) || args.items.length === 0) {
        throw new Error('items is required and must be a non-empty array for bulk actions');
      }

      const executeBulk = db.transaction(() =>
        args.items.map((item: unknown, index: number) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new Error(`items[${index}] must be an object`);
          }
          return handler({ ...args, ...(item as Record<string, unknown>), action: bulkTargetAction, items: undefined }, userId);
        })
      );

      const results = executeBulk();
      return { action: args.action, count: results.length, results };
    }

    const handler = actions[args.action];
    if (!handler) {
      throw new Error(`Invalid action: ${args.action}`);
    }
    return handler(args, userId);
  };
}

export const MANAGE_HABIT_ACTIONS = [
  'list',
  'create',
  'update',
  'delete',
  'bulk_create',
  'bulk_update',
  'bulk_delete',
] as const;

export const MANAGE_TASK_ACTIONS = [
  'list',
  'create',
  'update',
  'delete',
  'toggle_done',
  'toggle_favorite',
  'bulk_create',
  'bulk_update',
  'bulk_delete',
] as const;

export const MANAGE_TASK_COMMENT_ACTIONS = [
  'list',
  'create',
  'delete',
  'bulk_create',
  'bulk_delete',
] as const;

export const MANAGE_PROJECT_ACTIONS = [
  'list',
  'create',
  'update',
  'delete',
  'toggle_archive',
  'toggle_favorite',
  'bulk_create',
  'bulk_update',
  'bulk_delete',
] as const;

export const MANAGE_LABEL_ACTIONS = [
  'list',
  'create',
  'update',
  'delete',
  'bulk_create',
  'bulk_update',
  'bulk_delete',
] as const;

export const MANAGE_POMODORO_ACTIONS = [
  'list',
  'create',
  'update',
  'complete',
  'delete',
  'bulk_create',
  'bulk_update',
  'bulk_delete',
] as const;

export const MANAGE_SHARE_ACTIONS = [
  'list',
  'create',
  'revoke',
  'bulk_create',
  'bulk_delete',
] as const;

export const MANAGE_ETIQUETTE_ACTIONS = [
  'list',
  'add',
  'update',
  'delete',
  'reset',
  'bulk_create',
  'bulk_update',
  'bulk_delete',
] as const;

export const MANAGE_SPRINT_ACTIONS = [
  'list',
  'create',
  'get',
  'update',
  'delete',
  'transition_status',
  'bulk_create',
  'bulk_update',
  'bulk_delete',
] as const;

export const MANAGE_SPRINT_COLUMN_ACTIONS = [
  'list',
  'create',
  'update',
  'delete',
  'bulk_create',
  'bulk_update',
  'bulk_delete',
] as const;

export const MANAGE_NOTE_ACTIONS = [
  'list',
  'create',
  'update',
  'delete',
  'bulk_create',
  'bulk_update',
  'bulk_delete',
] as const;

export const MANAGE_EVENT_ACTIONS = [
  'list',
  'create',
  'update',
  'delete',
  'bulk_create',
  'bulk_update',
  'bulk_delete',
] as const;

const listHabits: ToolHandler = (args, userId) => {
  const filter = args.type ? 'AND h.type = ?' : '';
  const archiveFilter = args.include_archived ? '' : 'AND h.archived = 0';
  const params: any[] = [userId];
  if (args.type) params.push(args.type);
  return db.prepare(`
    SELECT h.*, COUNT(hl.id) as total_logs,
      MAX(hl.log_date) as last_logged
    FROM habits h
    LEFT JOIN habit_logs hl ON hl.habit_id = h.id
    WHERE h.user_id = ? ${filter} ${archiveFilter}
    GROUP BY h.id
    ORDER BY h.position, h.created_at
  `).all(...params);
};

const createHabit: ToolHandler = (args, userId) => {
  if (!args.title) throw new Error('title is required');
  const id = uuidv4();
  db.prepare('INSERT INTO habits (id, user_id, title, emoji, type, frequency, quit_date, subgoal_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, userId, args.title, args.emoji || '', args.type || 'habit', args.frequency || 'daily', args.quit_date || null, args.subgoal_id || null);
  return db.prepare('SELECT * FROM habits WHERE id = ?').get(id);
};

const updateHabit: ToolHandler = (args, userId) => {
  if (!args.habit_id) throw new Error('habit_id is required for update');
  const existing = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(args.habit_id, userId) as any;
  if (!existing) throw new Error('Habit not found or access denied');
  db.prepare(`UPDATE habits SET title = ?, emoji = ?, frequency = ?, quit_date = ?, subgoal_id = ?, archived = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(
      args.title ?? existing.title,
      args.emoji ?? existing.emoji,
      args.frequency ?? existing.frequency,
      args.quit_date ?? existing.quit_date,
      args.subgoal_id ?? existing.subgoal_id,
      args.archived !== undefined ? (args.archived ? 1 : 0) : existing.archived,
      args.habit_id
    );
  return db.prepare('SELECT * FROM habits WHERE id = ?').get(args.habit_id);
};

const deleteHabit: ToolHandler = (args, userId) => {
  if (!args.habit_id) throw new Error('habit_id is required for delete');
  const existing = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(args.habit_id, userId);
  if (!existing) throw new Error('Habit not found or access denied');
  db.prepare('DELETE FROM habits WHERE id = ?').run(args.habit_id);
  return { deleted: true, id: args.habit_id };
};

export const handleManageHabit = createManagedActionHandler({
  list: listHabits,
  create: createHabit,
  update: updateHabit,
  delete: deleteHabit,
});

const listTasks: ToolHandler = (args, userId) => {
  let sql = `SELECT t.*, p.title as project_title, p.hex_color as project_color, p.type as project_type
    FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE t.user_id = ?`;
  const params: any[] = [userId];

  if (args.filter_done !== undefined) { sql += ' AND t.done = ?'; params.push(args.filter_done ? 1 : 0); }
  if (args.filter_priority !== undefined) { sql += ' AND t.priority = ?'; params.push(args.filter_priority); }
  if (args.filter_project) { sql += ' AND t.project_id = ?'; params.push(args.filter_project); }
  if (args.filter_sprint) { sql += ' AND t.sprint_id = ?'; params.push(args.filter_sprint); }
  if (args.filter_favorite) { sql += ' AND t.is_favorite = 1'; }
  if (args.search) { sql += ' AND t.title LIKE ?'; params.push(`%${args.search}%`); }
  if (args.filter_label) {
    sql += ' AND t.id IN (SELECT task_id FROM task_labels WHERE label_id = ?)';
    params.push(args.filter_label);
  }
  if (args.filter_project_type) {
    sql += ' AND p.type = ?';
    params.push(args.filter_project_type);
  }
  if (args.filter_exclude_types) {
    const types = args.filter_exclude_types.split(',').map((t: string) => t.trim()).filter(Boolean);
    if (types.length) {
      sql += ` AND (p.type IS NULL OR p.type NOT IN (${types.map(() => '?').join(',')}))`;
      params.push(...types);
    }
  }
  sql += ' ORDER BY t.done ASC, t.priority DESC, t.due_date ASC NULLS LAST, t.created_at DESC';

  const tasks = db.prepare(sql).all(...params) as any[];
  for (const task of tasks) {
    hydrateTaskRelations(task);
  }
  return tasks;
};

const createTask: ToolHandler = (args, userId) => {
  if (!args.title) throw new Error('title is required');
  const id = uuidv4();
  const done = args.done ? 1 : 0;
  db.prepare(`INSERT INTO tasks (id, user_id, title, description, project_id, sprint_id, bucket_id, priority, due_date, start_date, end_date, assignee_name, task_type, hex_color, percent_done, done, done_at, is_favorite)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id,
      userId,
      args.title,
      args.description || null,
      args.project_id || null,
      args.sprint_id || null,
      args.bucket_id || null,
      args.priority || 0,
      args.due_date || null,
      args.start_date || null,
      args.end_date || null,
      args.assignee_name || null,
      args.task_type || null,
      args.hex_color || null,
      args.percent_done || 0,
      done,
      done ? new Date().toISOString() : null,
      args.is_favorite ? 1 : 0
    );
  if (args.labels?.length) {
    const ins = db.prepare('INSERT OR IGNORE INTO task_labels (task_id, label_id) VALUES (?, ?)');
    for (const lid of args.labels) ins.run(id, lid);
  }
  if (args.links?.length) {
    const ins = db.prepare('INSERT OR IGNORE INTO task_links (task_id, target_type, target_id) VALUES (?, ?, ?)');
    for (const link of args.links) ins.run(id, link.target_type, link.target_id);
  }
  return getTaskWithRelations(id);
};

const updateTask: ToolHandler = (args, userId) => {
  if (!args.task_id) throw new Error('task_id is required for update');
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(args.task_id, userId) as any;
  if (!existing) throw new Error('Task not found or access denied');
  db.prepare(`UPDATE tasks SET title = ?, description = ?, project_id = ?, sprint_id = ?, bucket_id = ?, priority = ?, due_date = ?,
    start_date = ?, end_date = ?, assignee_name = ?, task_type = ?, hex_color = ?, percent_done = ?, done = ?, done_at = ?,
    is_favorite = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(
      args.title ?? existing.title,
      args.description ?? existing.description,
      args.project_id !== undefined ? (args.project_id || null) : existing.project_id,
      args.sprint_id !== undefined ? (args.sprint_id || null) : existing.sprint_id,
      args.bucket_id !== undefined ? (args.bucket_id || null) : existing.bucket_id,
      args.priority ?? existing.priority,
      args.due_date !== undefined ? (args.due_date || null) : existing.due_date,
      args.start_date !== undefined ? (args.start_date || null) : existing.start_date,
      args.end_date !== undefined ? (args.end_date || null) : existing.end_date,
      args.assignee_name !== undefined ? (args.assignee_name || null) : existing.assignee_name,
      args.task_type !== undefined ? (args.task_type || null) : existing.task_type,
      args.hex_color !== undefined ? (args.hex_color || null) : existing.hex_color,
      args.percent_done ?? existing.percent_done,
      args.done !== undefined ? (args.done ? 1 : 0) : existing.done,
      args.done !== undefined ? (args.done ? existing.done_at || new Date().toISOString() : null) : existing.done_at,
      args.is_favorite !== undefined ? (args.is_favorite ? 1 : 0) : existing.is_favorite,
      args.task_id
    );
  if (args.labels) {
    db.prepare('DELETE FROM task_labels WHERE task_id = ?').run(args.task_id);
    const ins = db.prepare('INSERT OR IGNORE INTO task_labels (task_id, label_id) VALUES (?, ?)');
    for (const lid of args.labels) ins.run(args.task_id, lid);
  }
  if (args.links) {
    db.prepare('DELETE FROM task_links WHERE task_id = ?').run(args.task_id);
    const ins = db.prepare('INSERT OR IGNORE INTO task_links (task_id, target_type, target_id) VALUES (?, ?, ?)');
    for (const link of args.links) ins.run(args.task_id, link.target_type, link.target_id);
  }
  return getTaskWithRelations(args.task_id);
};

const deleteTask: ToolHandler = (args, userId) => {
  if (!args.task_id) throw new Error('task_id is required for delete');
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(args.task_id, userId);
  if (!existing) throw new Error('Task not found or access denied');
  db.prepare('DELETE FROM tasks WHERE id = ?').run(args.task_id);
  return { deleted: true, id: args.task_id };
};

const toggleTaskDone: ToolHandler = (args, userId) => {
  if (!args.task_id) throw new Error('task_id is required');
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(args.task_id, userId) as any;
  if (!existing) throw new Error('Task not found or access denied');

  if (!existing.done && existing.repeat_after > 0 && existing.due_date) {
    const baseDate = new Date(existing.due_date);
    const nextDate = new Date(baseDate.getTime() + existing.repeat_after * 1000);
    db.prepare(`UPDATE tasks SET due_date = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(nextDate.toISOString().slice(0, 19), args.task_id);
    const rescheduled = getTaskWithRelations(args.task_id) as any;
    return { ...rescheduled, rescheduled: true };
  }

  const newDone = existing.done ? 0 : 1;
  const doneAt = newDone ? new Date().toISOString() : null;
  db.prepare('UPDATE tasks SET done = ?, done_at = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newDone, doneAt, args.task_id);
  return getTaskWithRelations(args.task_id);
};

const toggleTaskFavorite: ToolHandler = (args, userId) => {
  if (!args.task_id) throw new Error('task_id is required');
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(args.task_id, userId) as any;
  if (!existing) throw new Error('Task not found or access denied');
  db.prepare('UPDATE tasks SET is_favorite = ?, updated_at = datetime(\'now\') WHERE id = ?').run(existing.is_favorite ? 0 : 1, args.task_id);
  return getTaskWithRelations(args.task_id);
};

export const handleManageTask = createManagedActionHandler({
  list: listTasks,
  create: createTask,
  update: updateTask,
  delete: deleteTask,
  toggle_done: toggleTaskDone,
  toggle_favorite: toggleTaskFavorite,
});

const verifyTaskOwnership = (taskId: string, userId: string) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, userId);
  if (!task) throw new Error('Task not found or access denied');
  return task;
};

const listTaskComments: ToolHandler = (args, userId) => {
  verifyTaskOwnership(args.task_id, userId);
  return db.prepare('SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at DESC').all(args.task_id);
};

const createTaskComment: ToolHandler = (args, userId) => {
  verifyTaskOwnership(args.task_id, userId);
  if (!args.content) throw new Error('content is required');
  const id = uuidv4();
  db.prepare('INSERT INTO task_comments (id, task_id, user_id, content) VALUES (?, ?, ?, ?)').run(id, args.task_id, userId, args.content);
  return db.prepare('SELECT * FROM task_comments WHERE id = ?').get(id);
};

const deleteTaskComment: ToolHandler = (args, userId) => {
  verifyTaskOwnership(args.task_id, userId);
  if (!args.comment_id) throw new Error('comment_id is required for delete');
  const comment = db.prepare('SELECT * FROM task_comments WHERE id = ? AND task_id = ?').get(args.comment_id, args.task_id);
  if (!comment) throw new Error('Comment not found');
  db.prepare('DELETE FROM task_comments WHERE id = ?').run(args.comment_id);
  return { deleted: true, id: args.comment_id };
};

export const handleManageTaskComment = createManagedActionHandler({
  list: listTaskComments,
  create: createTaskComment,
  delete: deleteTaskComment,
}, {
  bulkActionMap: {
    bulk_create: 'create',
    bulk_delete: 'delete',
  },
});

const listProjects: ToolHandler = (args, userId) => {
  let sql = `SELECT p.*,
      (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND done = 0) as open_tasks,
      (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND done = 1) as done_tasks
    FROM projects p WHERE p.user_id = ?`;
  const params: any[] = [userId];
  if (!args.include_archived) { sql += ' AND p.archived = 0'; }
  if (args.filter_type) { sql += ' AND p.type = ?'; params.push(args.filter_type); }
  sql += ' ORDER BY p.position, p.created_at';
  const projects = db.prepare(sql).all(...params) as any[];

  if (args.include_tasks) {
    const taskStmt = db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY done ASC, priority DESC, created_at DESC');
    for (const project of projects) {
      project.tasks = taskStmt.all(project.id);
    }
  }

  return projects;
};

const createProject: ToolHandler = (args, userId) => {
  if (!args.title) throw new Error('title is required');
  const id = uuidv4();
  db.prepare('INSERT INTO projects (id, user_id, title, description, hex_color, type, parent_project_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, userId, args.title, args.description || null, args.hex_color || '', args.type || 'personal', args.parent_project_id || null);
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
};

const updateProject: ToolHandler = (args, userId) => {
  if (!args.project_id) throw new Error('project_id is required for update');
  const existing = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(args.project_id, userId) as any;
  if (!existing) throw new Error('Project not found or access denied');
  db.prepare(`UPDATE projects SET title = ?, description = ?, hex_color = ?, type = ?, parent_project_id = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(
      args.title ?? existing.title,
      args.description ?? existing.description,
      args.hex_color ?? existing.hex_color,
      args.type ?? existing.type,
      args.parent_project_id !== undefined ? (args.parent_project_id || null) : existing.parent_project_id,
      args.project_id
    );
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(args.project_id);
};

const deleteProject: ToolHandler = (args, userId) => {
  if (!args.project_id) throw new Error('project_id is required for delete');
  const existing = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(args.project_id, userId);
  if (!existing) throw new Error('Project not found or access denied');

  const deleteAll = db.transaction(() => {
    if (args.keep_tasks) {
      // Unlink tasks but keep them as orphans in backlog
      db.prepare('UPDATE tasks SET project_id = NULL, sprint_id = NULL, bucket_id = NULL WHERE project_id = ?').run(args.project_id);
    } else {
      // Cascade delete all tasks and their related data
      const taskIds = (db.prepare('SELECT id FROM tasks WHERE project_id = ?').all(args.project_id) as any[]).map(t => t.id);
      deleteTasksCascade(taskIds);
      if (taskIds.length > 0) db.prepare('DELETE FROM tasks WHERE project_id = ?').run(args.project_id);
    }
    db.prepare('DELETE FROM buckets WHERE project_id = ?').run(args.project_id);
    db.prepare('DELETE FROM sprints WHERE project_id = ?').run(args.project_id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(args.project_id);
  });
  deleteAll();

  return { deleted: true, id: args.project_id, tasks_kept: !!args.keep_tasks };
};

const toggleProjectArchive: ToolHandler = (args, userId) => {
  if (!args.project_id) throw new Error('project_id is required');
  const existing = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(args.project_id, userId) as any;
  if (!existing) throw new Error('Project not found or access denied');
  db.prepare('UPDATE projects SET archived = ?, updated_at = datetime(\'now\') WHERE id = ?').run(existing.archived ? 0 : 1, args.project_id);
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(args.project_id);
};

const toggleProjectFavorite: ToolHandler = (args, userId) => {
  if (!args.project_id) throw new Error('project_id is required');
  const existing = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(args.project_id, userId) as any;
  if (!existing) throw new Error('Project not found or access denied');
  db.prepare('UPDATE projects SET is_favorite = ?, updated_at = datetime(\'now\') WHERE id = ?').run(existing.is_favorite ? 0 : 1, args.project_id);
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(args.project_id);
};

export const handleManageProject = createManagedActionHandler({
  list: listProjects,
  create: createProject,
  update: updateProject,
  delete: deleteProject,
  toggle_archive: toggleProjectArchive,
  toggle_favorite: toggleProjectFavorite,
});

const listLabels: ToolHandler = (_args, userId) => db.prepare(`
  SELECT l.*, COUNT(tl.task_id) as task_count
  FROM labels l LEFT JOIN task_labels tl ON l.id = tl.label_id
  WHERE l.user_id = ? GROUP BY l.id ORDER BY l.title
`).all(userId);

const createLabel: ToolHandler = (args, userId) => {
  if (!args.title) throw new Error('title is required');
  const id = uuidv4();
  db.prepare('INSERT INTO labels (id, user_id, title, hex_color, description) VALUES (?, ?, ?, ?, ?)')
    .run(id, userId, args.title, args.hex_color || '#e2e8f0', args.description || null);
  return db.prepare('SELECT * FROM labels WHERE id = ?').get(id);
};

const updateLabel: ToolHandler = (args, userId) => {
  if (!args.label_id) throw new Error('label_id is required for update');
  const existing = db.prepare('SELECT * FROM labels WHERE id = ? AND user_id = ?').get(args.label_id, userId) as any;
  if (!existing) throw new Error('Label not found or access denied');
  db.prepare(`UPDATE labels SET title = ?, hex_color = ?, description = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(args.title ?? existing.title, args.hex_color ?? existing.hex_color, args.description ?? existing.description, args.label_id);
  return db.prepare('SELECT * FROM labels WHERE id = ?').get(args.label_id);
};

const deleteLabel: ToolHandler = (args, userId) => {
  if (!args.label_id) throw new Error('label_id is required for delete');
  const existing = db.prepare('SELECT * FROM labels WHERE id = ? AND user_id = ?').get(args.label_id, userId);
  if (!existing) throw new Error('Label not found or access denied');
  db.prepare('DELETE FROM labels WHERE id = ?').run(args.label_id);
  return { deleted: true, id: args.label_id };
};

export const handleManageLabel = createManagedActionHandler({
  list: listLabels,
  create: createLabel,
  update: updateLabel,
  delete: deleteLabel,
});

const listPomodoros: ToolHandler = (args, userId) => {
  let sql = 'SELECT * FROM pomodoro_sessions WHERE user_id = ?';
  const params: any[] = [userId];
  if (args.status) { sql += ' AND status = ?'; params.push(args.status); }
  sql += ' ORDER BY started_at DESC LIMIT ?';
  params.push(args.limit || 20);
  return db.prepare(sql).all(...params);
};

const createPomodoro: ToolHandler = (args, userId) => {
  const id = uuidv4();
  db.prepare('INSERT INTO pomodoro_sessions (id, user_id, started_at, duration_minutes, status, note) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, userId, new Date().toISOString(), args.duration_minutes || 25, 'in_progress', args.note || null);
  if (args.task_id) {
    const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?').get(args.task_id, userId);
    if (task) {
      db.prepare('INSERT OR IGNORE INTO task_links (task_id, target_type, target_id) VALUES (?, ?, ?)')
        .run(args.task_id, 'pomodoro', id);
    }
  }
  return db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ?').get(id);
};

const updatePomodoro: ToolHandler = (args, userId) => {
  if (!args.pomodoro_id) throw new Error('pomodoro_id is required for update');
  const existing = db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ? AND user_id = ?').get(args.pomodoro_id, userId) as any;
  if (!existing) throw new Error('Session not found or access denied');
  db.prepare('UPDATE pomodoro_sessions SET note = ?, status = ? WHERE id = ?')
    .run(args.note ?? existing.note, args.status ?? existing.status, args.pomodoro_id);
  return db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ?').get(args.pomodoro_id);
};

const completePomodoro: ToolHandler = (args, userId) => {
  if (!args.pomodoro_id) throw new Error('pomodoro_id is required');
  const existing = db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ? AND user_id = ?').get(args.pomodoro_id, userId);
  if (!existing) throw new Error('Session not found or access denied');
  db.prepare('UPDATE pomodoro_sessions SET status = ?, ended_at = ? WHERE id = ?')
    .run('completed', new Date().toISOString(), args.pomodoro_id);
  return db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ?').get(args.pomodoro_id);
};

const deletePomodoro: ToolHandler = (args, userId) => {
  if (!args.pomodoro_id) throw new Error('pomodoro_id is required for delete');
  const existing = db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ? AND user_id = ?').get(args.pomodoro_id, userId);
  if (!existing) throw new Error('Session not found or access denied');
  db.prepare('DELETE FROM pomodoro_sessions WHERE id = ?').run(args.pomodoro_id);
  return { deleted: true, id: args.pomodoro_id };
};

export const handleManagePomodoro = createManagedActionHandler({
  list: listPomodoros,
  create: createPomodoro,
  update: updatePomodoro,
  complete: completePomodoro,
  delete: deletePomodoro,
});

const listShares: ToolHandler = (args, userId) => {
  let sql = 'SELECT * FROM shared_goals WHERE user_id = ?';
  const params: any[] = [userId];
  if (args.goal_id) { sql += ' AND goal_id = ?'; params.push(args.goal_id); }
  sql += ' ORDER BY created_at DESC';
  return db.prepare(sql).all(...params);
};

const createShare: ToolHandler = (args, userId) => {
  if (!args.goal_id) throw new Error('goal_id is required');
  if (!goalOwnerCheck(args.goal_id, userId)) throw new Error('Goal not found or access denied');
  const id = uuidv4();
  const token = uuidv4().replace(/-/g, '').substring(0, 16);
  db.prepare('INSERT INTO shared_goals (id, goal_id, user_id, token, show_logs, show_guestbook) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, args.goal_id, userId, token, args.show_logs ? 1 : 0, args.show_guestbook ? 1 : 0);
  return db.prepare('SELECT * FROM shared_goals WHERE id = ?').get(id);
};

const revokeShare: ToolHandler = (args, userId) => {
  if (!args.share_id) throw new Error('share_id is required');
  const existing = db.prepare('SELECT * FROM shared_goals WHERE id = ? AND user_id = ?').get(args.share_id, userId);
  if (!existing) throw new Error('Share link not found or access denied');
  db.prepare('DELETE FROM shared_goals WHERE id = ?').run(args.share_id);
  return { deleted: true, id: args.share_id };
};

export const handleManageShare = createManagedActionHandler({
  list: listShares,
  create: createShare,
  revoke: revokeShare,
}, {
  bulkActionMap: {
    bulk_create: 'create',
    bulk_delete: 'revoke',
  },
});

const listEtiquette: ToolHandler = (_args, userId) => {
  seedDefaultEtiquette(userId);
  return db.prepare('SELECT * FROM agent_etiquette WHERE user_id = ? ORDER BY position').all(userId);
};

const addEtiquette: ToolHandler = (args, userId) => {
  if (!args.content) throw new Error('content is required');
  const maxPos = (db.prepare('SELECT MAX(position) as max FROM agent_etiquette WHERE user_id = ?').get(userId) as any)?.max || 0;
  const id = uuidv4();
  db.prepare('INSERT INTO agent_etiquette (id, user_id, content, position, is_default) VALUES (?, ?, ?, ?, 0)')
    .run(id, userId, args.content, args.position ?? maxPos + 1);
  return db.prepare('SELECT * FROM agent_etiquette WHERE id = ?').get(id);
};

const updateEtiquette: ToolHandler = (args, userId) => {
  if (!args.rule_id) throw new Error('rule_id is required');
  const existing = db.prepare('SELECT * FROM agent_etiquette WHERE id = ? AND user_id = ?').get(args.rule_id, userId) as any;
  if (!existing) throw new Error('Rule not found or access denied');
  db.prepare('UPDATE agent_etiquette SET content = ?, position = ? WHERE id = ?')
    .run(args.content ?? existing.content, args.position ?? existing.position, args.rule_id);
  return db.prepare('SELECT * FROM agent_etiquette WHERE id = ?').get(args.rule_id);
};

const deleteEtiquette: ToolHandler = (args, userId) => {
  if (!args.rule_id) throw new Error('rule_id is required');
  const existing = db.prepare('SELECT * FROM agent_etiquette WHERE id = ? AND user_id = ?').get(args.rule_id, userId);
  if (!existing) throw new Error('Rule not found or access denied');
  db.prepare('DELETE FROM agent_etiquette WHERE id = ?').run(args.rule_id);
  const remaining = db.prepare('SELECT id FROM agent_etiquette WHERE user_id = ? ORDER BY position').all(userId) as any[];
  remaining.forEach((rule: any, index: number) => db.prepare('UPDATE agent_etiquette SET position = ? WHERE id = ?').run(index + 1, rule.id));
  return { deleted: true, id: args.rule_id };
};

const resetEtiquette: ToolHandler = (_args, userId) => {
  db.prepare('DELETE FROM agent_etiquette WHERE user_id = ?').run(userId);
  seedDefaultEtiquette(userId);
  const rules = db.prepare('SELECT * FROM agent_etiquette WHERE user_id = ? ORDER BY position').all(userId);
  return { reset: true, rules };
};

export const handleManageEtiquette = createManagedActionHandler({
  list: listEtiquette,
  add: addEtiquette,
  update: updateEtiquette,
  delete: deleteEtiquette,
  reset: resetEtiquette,
}, {
  bulkActionMap: {
    bulk_create: 'add',
    bulk_update: 'update',
    bulk_delete: 'delete',
  },
});

function verifySprintOwnership(sprintId: string, userId: string) {
  const sprint = db.prepare(`
    SELECT s.* FROM sprints s JOIN projects p ON s.project_id = p.id
    WHERE s.id = ? AND p.user_id = ?
  `).get(sprintId, userId) as any;
  if (!sprint) throw new Error('Sprint not found or access denied');
  return sprint;
}

const listSprints: ToolHandler = (args, userId) => {
  if (!args.project_id) throw new Error('project_id is required for list');
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(args.project_id, userId);
  if (!project) throw new Error('Project not found or access denied');
  return db.prepare(`
    SELECT s.*,
      COUNT(CASE WHEN t.done = 0 THEN 1 END) as open_tasks,
      COUNT(CASE WHEN t.done = 1 THEN 1 END) as done_tasks
    FROM sprints s LEFT JOIN tasks t ON t.sprint_id = s.id
    WHERE s.project_id = ?
    GROUP BY s.id
    ORDER BY s.sprint_number DESC, s.created_at DESC
  `).all(args.project_id);
};

const createSprint: ToolHandler = (args, userId) => {
  if (!args.project_id) throw new Error('project_id is required for create');
  if (!args.title) throw new Error('title is required for create');
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(args.project_id, userId);
  if (!project) throw new Error('Project not found or access denied');
  const sprintStatus = args.status || 'planned';
  if (!['planned', 'active', 'completed'].includes(sprintStatus)) {
    throw new Error('status must be planned, active, or completed');
  }

  const now = new Date().toISOString();
  const maxNum = db.prepare('SELECT MAX(sprint_number) as max FROM sprints WHERE project_id = ?').get(args.project_id) as any;
  const sprintNumber = (maxNum?.max ?? 0) + 1;
  const id = uuidv4();

  db.prepare(`INSERT INTO sprints (id, project_id, title, description, sprint_number, status, start_date, end_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, args.project_id, args.title.trim(), args.description || null, sprintNumber, sprintStatus, args.start_date || null, args.end_date || null, now, now);

  const defaultColumns = [
    { title: 'To Do', position: 0, is_done_column: 0 },
    { title: 'In Progress', position: 1, is_done_column: 0 },
    { title: 'Review', position: 2, is_done_column: 0 },
    { title: 'Done', position: 3, is_done_column: 1 },
  ];
  const insertBucket = db.prepare('INSERT INTO buckets (id, project_id, sprint_id, title, position, is_done_column) VALUES (?, ?, ?, ?, ?, ?)');
  for (const column of defaultColumns) {
    insertBucket.run(uuidv4(), args.project_id, id, column.title, column.position, column.is_done_column);
  }

  const sprint = db.prepare('SELECT * FROM sprints WHERE id = ?').get(id);
  const columns = db.prepare('SELECT * FROM buckets WHERE sprint_id = ? ORDER BY position ASC').all(id);
  return { ...(sprint as any), columns };
};

const getSprint: ToolHandler = (args, userId) => {
  if (!args.sprint_id) throw new Error('sprint_id is required for get');
  const sprint = verifySprintOwnership(args.sprint_id, userId);
  const columns = db.prepare('SELECT * FROM buckets WHERE sprint_id = ? ORDER BY position ASC').all(args.sprint_id);
  const tasks = db.prepare(`
    SELECT t.*, p.title as project_title, p.hex_color as project_color
    FROM tasks t LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.sprint_id = ? ORDER BY t.position ASC, t.created_at DESC
  `).all(args.sprint_id);
  const backlog = db.prepare(`
    SELECT t.*, p.title as project_title, p.hex_color as project_color
    FROM tasks t LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.project_id = ? AND t.sprint_id IS NULL ORDER BY t.position ASC, t.created_at DESC
  `).all(sprint.project_id);
  return { ...sprint, columns, tasks, backlog };
};

const updateSprint: ToolHandler = (args, userId) => {
  if (!args.sprint_id) throw new Error('sprint_id is required for update');
  const existing = verifySprintOwnership(args.sprint_id, userId);
  const now = new Date().toISOString();
  db.prepare(`UPDATE sprints SET title = COALESCE(?, title), description = ?, start_date = ?, end_date = ?, updated_at = ? WHERE id = ?`)
    .run(
      args.title?.trim() || null,
      args.description !== undefined ? args.description : existing.description,
      args.start_date !== undefined ? args.start_date : existing.start_date,
      args.end_date !== undefined ? args.end_date : existing.end_date,
      now,
      args.sprint_id
    );
  return db.prepare('SELECT * FROM sprints WHERE id = ?').get(args.sprint_id);
};

const deleteSprint: ToolHandler = (args, userId) => {
  if (!args.sprint_id) throw new Error('sprint_id is required for delete');
  verifySprintOwnership(args.sprint_id, userId);
  db.prepare('UPDATE tasks SET sprint_id = NULL, bucket_id = NULL WHERE sprint_id = ?').run(args.sprint_id);
  db.prepare('DELETE FROM buckets WHERE sprint_id = ?').run(args.sprint_id);
  db.prepare('DELETE FROM sprints WHERE id = ?').run(args.sprint_id);
  return { deleted: true, id: args.sprint_id };
};

const transitionSprintStatus: ToolHandler = (args, userId) => {
  if (!args.sprint_id) throw new Error('sprint_id is required');
  if (!args.status) throw new Error('status is required');
  const existing = verifySprintOwnership(args.sprint_id, userId);
  const validTransitions: Record<string, string[]> = {
    planned: ['active'],
    active: ['completed'],
    completed: ['active'],
  };
  if (!validTransitions[existing.status]?.includes(args.status)) {
    throw new Error(`Cannot transition from '${existing.status}' to '${args.status}'`);
  }
  db.prepare('UPDATE sprints SET status = ?, updated_at = ? WHERE id = ?').run(args.status, new Date().toISOString(), args.sprint_id);
  return db.prepare('SELECT * FROM sprints WHERE id = ?').get(args.sprint_id);
};

export const handleManageSprint = createManagedActionHandler({
  list: listSprints,
  create: createSprint,
  get: getSprint,
  update: updateSprint,
  delete: deleteSprint,
  transition_status: transitionSprintStatus,
});

function verifySprintForColumn(sprintId: string, userId: string) {
  const sprint = db.prepare(`
    SELECT s.* FROM sprints s JOIN projects p ON s.project_id = p.id
    WHERE s.id = ? AND p.user_id = ?
  `).get(sprintId, userId) as any;
  if (!sprint) throw new Error('Sprint not found or access denied');
  return sprint;
}

const listSprintColumns: ToolHandler = (args, userId) => {
  verifySprintForColumn(args.sprint_id, userId);
  return db.prepare('SELECT * FROM buckets WHERE sprint_id = ? ORDER BY position ASC').all(args.sprint_id);
};

const createSprintColumn: ToolHandler = (args, userId) => {
  const sprint = verifySprintForColumn(args.sprint_id, userId);
  if (!args.title) throw new Error('title is required');
  const maxPos = db.prepare('SELECT MAX(position) as max FROM buckets WHERE sprint_id = ?').get(args.sprint_id) as any;
  const position = args.position ?? ((maxPos?.max ?? 0) + 1);
  const id = uuidv4();
  db.prepare('INSERT INTO buckets (id, project_id, sprint_id, title, position, is_done_column) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, sprint.project_id, args.sprint_id, args.title.trim(), position, args.is_done_column ? 1 : 0);
  return db.prepare('SELECT * FROM buckets WHERE id = ?').get(id);
};

const updateSprintColumn: ToolHandler = (args, userId) => {
  verifySprintForColumn(args.sprint_id, userId);
  if (!args.column_id) throw new Error('column_id is required for update');
  const existing = db.prepare('SELECT * FROM buckets WHERE id = ? AND sprint_id = ?').get(args.column_id, args.sprint_id);
  if (!existing) throw new Error('Column not found');
  db.prepare('UPDATE buckets SET title = COALESCE(?, title), position = COALESCE(?, position), is_done_column = COALESCE(?, is_done_column) WHERE id = ?')
    .run(args.title?.trim() || null, args.position ?? null, args.is_done_column !== undefined ? (args.is_done_column ? 1 : 0) : null, args.column_id);
  return db.prepare('SELECT * FROM buckets WHERE id = ?').get(args.column_id);
};

const deleteSprintColumn: ToolHandler = (args, userId) => {
  verifySprintForColumn(args.sprint_id, userId);
  if (!args.column_id) throw new Error('column_id is required for delete');
  const existing = db.prepare('SELECT * FROM buckets WHERE id = ? AND sprint_id = ?').get(args.column_id, args.sprint_id);
  if (!existing) throw new Error('Column not found');
  db.prepare('UPDATE tasks SET bucket_id = NULL WHERE bucket_id = ?').run(args.column_id);
  db.prepare('DELETE FROM buckets WHERE id = ?').run(args.column_id);
  return { deleted: true, id: args.column_id };
};

export const handleManageSprintColumn = createManagedActionHandler({
  list: listSprintColumns,
  create: createSprintColumn,
  update: updateSprintColumn,
  delete: deleteSprintColumn,
});

const listNotes: ToolHandler = (_args, userId) => db.prepare('SELECT * FROM quick_notes WHERE user_id = ? ORDER BY updated_at DESC').all(userId);

const createNote: ToolHandler = (args, userId) => {
  if (!args.content) throw new Error('content is required');
  const id = uuidv4();
  db.prepare('INSERT INTO quick_notes (id, user_id, content) VALUES (?, ?, ?)').run(id, userId, args.content.trim());
  return db.prepare('SELECT * FROM quick_notes WHERE id = ?').get(id);
};

const updateNote: ToolHandler = (args, userId) => {
  if (!args.note_id) throw new Error('note_id is required for update');
  if (!args.content) throw new Error('content is required for update');
  const result = db.prepare(`UPDATE quick_notes SET content = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .run(args.content.trim(), args.note_id, userId);
  if (result.changes === 0) throw new Error('Note not found or access denied');
  return db.prepare('SELECT * FROM quick_notes WHERE id = ?').get(args.note_id);
};

const deleteNote: ToolHandler = (args, userId) => {
  if (!args.note_id) throw new Error('note_id is required for delete');
  const result = db.prepare('DELETE FROM quick_notes WHERE id = ? AND user_id = ?').run(args.note_id, userId);
  if (result.changes === 0) throw new Error('Note not found or access denied');
  return { deleted: true, id: args.note_id };
};

export const handleManageNote = createManagedActionHandler({
  list: listNotes,
  create: createNote,
  update: updateNote,
  delete: deleteNote,
});

const listEvents: ToolHandler = (args, userId) => {
  let query = 'SELECT * FROM events WHERE user_id = ?';
  const params: any[] = [userId];
  if (args.filter_start) { query += ' AND start_date >= ?'; params.push(args.filter_start); }
  if (args.filter_end) { query += ' AND start_date <= ?'; params.push(args.filter_end); }
  query += ' ORDER BY start_date ASC';
  return db.prepare(query).all(...params);
};

const createEvent: ToolHandler = (args, userId) => {
  if (!args.title) throw new Error('title is required for create');
  if (!args.start_date) throw new Error('start_date is required for create');
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO events (id, user_id, title, description, start_date, end_date, all_day, color, location, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    args.title,
    args.description || null,
    args.start_date,
    args.end_date || null,
    args.all_day ? 1 : 0,
    args.color || '#3b82f6',
    args.location || null,
    now,
    now
  );
  return db.prepare('SELECT * FROM events WHERE id = ?').get(id);
};

const updateEvent: ToolHandler = (args, userId) => {
  if (!args.event_id) throw new Error('event_id is required for update');
  const existing = db.prepare('SELECT * FROM events WHERE id = ? AND user_id = ?').get(args.event_id, userId) as any;
  if (!existing) throw new Error('Event not found');
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE events SET title = ?, description = ?, start_date = ?, end_date = ?, all_day = ?, color = ?, location = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    args.title ?? existing.title,
    args.description !== undefined ? args.description : existing.description,
    args.start_date ?? existing.start_date,
    args.end_date !== undefined ? (args.end_date || null) : existing.end_date,
    args.all_day !== undefined ? (args.all_day ? 1 : 0) : existing.all_day,
    args.color ?? existing.color,
    args.location !== undefined ? (args.location || null) : existing.location,
    now,
    args.event_id,
    userId
  );
  return db.prepare('SELECT * FROM events WHERE id = ?').get(args.event_id);
};

const deleteEvent: ToolHandler = (args, userId) => {
  if (!args.event_id) throw new Error('event_id is required for delete');
  const existing = db.prepare('SELECT * FROM events WHERE id = ? AND user_id = ?').get(args.event_id, userId);
  if (!existing) throw new Error('Event not found');
  db.prepare('DELETE FROM events WHERE id = ? AND user_id = ?').run(args.event_id, userId);
  return { deleted: true, id: args.event_id };
};

export const handleManageEvent = createManagedActionHandler({
  list: listEvents,
  create: createEvent,
  update: updateEvent,
  delete: deleteEvent,
});

// ─── Agent Actions ──────────────────────────────────────────────────

export const MANAGE_AGENT_ACTION_ACTIONS = [
  'list', 'list_staged', 'create', 'update', 'delete', 'update_status',
  'bulk_create', 'bulk_update', 'bulk_delete',
] as const;

function listAgentActions(args: ToolArgs, userId: string) {
  const { task_id } = args;
  if (!task_id) throw new Error('task_id is required for list');
  const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?').get(task_id, userId);
  if (!task) throw new Error('Task not found');
  return db.prepare('SELECT * FROM agent_actions WHERE task_id = ? ORDER BY position ASC').all(task_id);
}

function listStagedAgentActions(_args: ToolArgs, userId: string) {
  return db.prepare(`
    SELECT aa.*, t.title as task_title, t.project_id, p.title as project_title
    FROM agent_actions aa
    JOIN tasks t ON aa.task_id = t.id
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE aa.user_id = ? AND aa.status = 'staged'
    ORDER BY aa.created_at ASC
  `).all(userId);
}

function createAgentAction(args: ToolArgs, userId: string) {
  const { task_id, title, description } = args;
  if (!task_id) throw new Error('task_id is required');
  if (!title?.trim()) throw new Error('title is required');
  const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?').get(task_id, userId);
  if (!task) throw new Error('Task not found');

  const id = uuidv4();
  const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 as next FROM agent_actions WHERE task_id = ?').get(task_id) as any;
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO agent_actions (id, task_id, user_id, title, description, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, task_id, userId, title.trim(), description || null, maxPos.next, now, now);
  return db.prepare('SELECT * FROM agent_actions WHERE id = ?').get(id);
}

function updateAgentAction(args: ToolArgs, userId: string) {
  const { agent_action_id, title, description, position } = args;
  if (!agent_action_id) throw new Error('agent_action_id is required');
  const existing = db.prepare(`
    SELECT aa.* FROM agent_actions aa JOIN tasks t ON aa.task_id = t.id WHERE aa.id = ? AND t.user_id = ?
  `).get(agent_action_id, userId) as any;
  if (!existing) throw new Error('Agent action not found');

  const now = new Date().toISOString();
  db.prepare(`UPDATE agent_actions SET title = ?, description = ?, position = ?, updated_at = ? WHERE id = ?`)
    .run(title?.trim() || existing.title, description !== undefined ? description : existing.description, position ?? existing.position, now, agent_action_id);
  return db.prepare('SELECT * FROM agent_actions WHERE id = ?').get(agent_action_id);
}

function deleteAgentAction(args: ToolArgs, userId: string) {
  const { agent_action_id } = args;
  if (!agent_action_id) throw new Error('agent_action_id is required');
  const existing = db.prepare(`
    SELECT aa.* FROM agent_actions aa JOIN tasks t ON aa.task_id = t.id WHERE aa.id = ? AND t.user_id = ?
  `).get(agent_action_id, userId) as any;
  if (!existing) throw new Error('Agent action not found');
  db.prepare('DELETE FROM agent_actions WHERE id = ?').run(agent_action_id);
  return { deleted: true, id: agent_action_id };
}

function updateStatusAgentAction(args: ToolArgs, userId: string) {
  const { agent_action_id, status, result, error: errorMsg, commit_hash, files_changed, agent_model } = args;
  if (!agent_action_id) throw new Error('agent_action_id is required');
  if (!status) throw new Error('status is required');

  const existing = db.prepare(`
    SELECT aa.* FROM agent_actions aa JOIN tasks t ON aa.task_id = t.id WHERE aa.id = ? AND t.user_id = ?
  `).get(agent_action_id, userId) as any;
  if (!existing) throw new Error('Agent action not found');

  const validTransitions: Record<string, string[]> = {
    draft: ['staged'],
    staged: ['draft', 'running'],
    running: ['done', 'failed'],
    done: ['draft'],
    failed: ['draft', 'staged'],
  };
  if (!validTransitions[existing.status]?.includes(status)) {
    throw new Error(`Invalid transition: ${existing.status} → ${status}`);
  }

  const now = new Date().toISOString();
  const sets: string[] = ['status = ?', 'updated_at = ?'];
  const vals: any[] = [status, now];

  if (status === 'running') { sets.push('started_at = ?'); vals.push(now); }
  if (status === 'done' || status === 'failed') { sets.push('completed_at = ?'); vals.push(now); }
  if (result !== undefined) { sets.push('result = ?'); vals.push(result); }
  if (errorMsg !== undefined) { sets.push('error = ?'); vals.push(errorMsg); }
  if (commit_hash !== undefined) { sets.push('commit_hash = ?'); vals.push(commit_hash); }
  if (files_changed !== undefined) { sets.push('files_changed = ?'); vals.push(typeof files_changed === 'string' ? files_changed : JSON.stringify(files_changed)); }
  if (agent_model !== undefined) { sets.push('agent_model = ?'); vals.push(agent_model); }

  vals.push(agent_action_id);
  db.prepare(`UPDATE agent_actions SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return db.prepare('SELECT * FROM agent_actions WHERE id = ?').get(agent_action_id);
}

export const handleManageAgentAction = createManagedActionHandler({
  list: listAgentActions,
  list_staged: listStagedAgentActions,
  create: createAgentAction,
  update: updateAgentAction,
  delete: deleteAgentAction,
  update_status: updateStatusAgentAction,
});
