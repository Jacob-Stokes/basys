import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { goalOwnerCheck } from '../middleware/ownership';
import { seedDefaultEtiquette } from '../utils/etiquette';

type ToolArgs = Record<string, any>;
type ToolHandler = (args: ToolArgs, userId: string) => any;
type BulkAction = 'bulk_create' | 'bulk_update' | 'bulk_delete';

const DEFAULT_BULK_ACTION_MAP: Record<BulkAction, string> = {
  bulk_create: 'create',
  bulk_update: 'update',
  bulk_delete: 'delete',
};

function createManagedActionHandler(
  actions: Record<string, ToolHandler>,
  options: {
    bulkActionMap?: Partial<Record<BulkAction, string>>;
  } = {}
): ToolHandler {
  const bulkActionMap = { ...DEFAULT_BULK_ACTION_MAP, ...options.bulkActionMap };

  return (args, userId) => {
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
  if (!args.habitId) throw new Error('habitId is required for update');
  const existing = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(args.habitId, userId) as any;
  if (!existing) throw new Error('Habit not found or access denied');
  db.prepare(`UPDATE habits SET title = ?, emoji = ?, frequency = ?, quit_date = ?, subgoal_id = ?, archived = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(
      args.title ?? existing.title,
      args.emoji ?? existing.emoji,
      args.frequency ?? existing.frequency,
      args.quit_date ?? existing.quit_date,
      args.subgoal_id ?? existing.subgoal_id,
      args.archived !== undefined ? (args.archived ? 1 : 0) : existing.archived,
      args.habitId
    );
  return db.prepare('SELECT * FROM habits WHERE id = ?').get(args.habitId);
};

const deleteHabit: ToolHandler = (args, userId) => {
  if (!args.habitId) throw new Error('habitId is required for delete');
  const existing = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(args.habitId, userId);
  if (!existing) throw new Error('Habit not found or access denied');
  db.prepare('DELETE FROM habits WHERE id = ?').run(args.habitId);
  return { deleted: true, id: args.habitId };
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
  const labelStmt = db.prepare('SELECT l.* FROM labels l JOIN task_labels tl ON l.id = tl.label_id WHERE tl.task_id = ?');
  const linkStmt = db.prepare('SELECT * FROM task_links WHERE task_id = ?');
  for (const task of tasks) {
    task.labels = labelStmt.all(task.id);
    task.links = linkStmt.all(task.id);
  }
  return tasks;
};

const createTask: ToolHandler = (args, userId) => {
  if (!args.title) throw new Error('title is required');
  const id = uuidv4();
  db.prepare(`INSERT INTO tasks (id, user_id, title, description, project_id, sprint_id, bucket_id, priority, due_date, start_date, end_date, assignee_name, task_type, hex_color, percent_done)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
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
      args.percent_done || 0
    );
  if (args.labels?.length) {
    const ins = db.prepare('INSERT OR IGNORE INTO task_labels (task_id, label_id) VALUES (?, ?)');
    for (const lid of args.labels) ins.run(id, lid);
  }
  if (args.links?.length) {
    const ins = db.prepare('INSERT OR IGNORE INTO task_links (task_id, target_type, target_id) VALUES (?, ?, ?)');
    for (const link of args.links) ins.run(id, link.target_type, link.target_id);
  }
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
};

const updateTask: ToolHandler = (args, userId) => {
  if (!args.taskId) throw new Error('taskId is required for update');
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(args.taskId, userId) as any;
  if (!existing) throw new Error('Task not found or access denied');
  db.prepare(`UPDATE tasks SET title = ?, description = ?, project_id = ?, sprint_id = ?, bucket_id = ?, priority = ?, due_date = ?,
    start_date = ?, end_date = ?, assignee_name = ?, task_type = ?, hex_color = ?, percent_done = ?, updated_at = datetime('now') WHERE id = ?`)
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
      args.taskId
    );
  if (args.labels) {
    db.prepare('DELETE FROM task_labels WHERE task_id = ?').run(args.taskId);
    const ins = db.prepare('INSERT OR IGNORE INTO task_labels (task_id, label_id) VALUES (?, ?)');
    for (const lid of args.labels) ins.run(args.taskId, lid);
  }
  if (args.links) {
    db.prepare('DELETE FROM task_links WHERE task_id = ?').run(args.taskId);
    const ins = db.prepare('INSERT OR IGNORE INTO task_links (task_id, target_type, target_id) VALUES (?, ?, ?)');
    for (const link of args.links) ins.run(args.taskId, link.target_type, link.target_id);
  }
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(args.taskId);
};

const deleteTask: ToolHandler = (args, userId) => {
  if (!args.taskId) throw new Error('taskId is required for delete');
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(args.taskId, userId);
  if (!existing) throw new Error('Task not found or access denied');
  db.prepare('DELETE FROM tasks WHERE id = ?').run(args.taskId);
  return { deleted: true, id: args.taskId };
};

const toggleTaskDone: ToolHandler = (args, userId) => {
  if (!args.taskId) throw new Error('taskId is required');
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(args.taskId, userId) as any;
  if (!existing) throw new Error('Task not found or access denied');

  if (!existing.done && existing.repeat_after > 0 && existing.due_date) {
    const baseDate = new Date(existing.due_date);
    const nextDate = new Date(baseDate.getTime() + existing.repeat_after * 1000);
    db.prepare(`UPDATE tasks SET due_date = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(nextDate.toISOString().slice(0, 19), args.taskId);
    const rescheduled = db.prepare('SELECT * FROM tasks WHERE id = ?').get(args.taskId) as any;
    return { ...rescheduled, rescheduled: true };
  }

  const newDone = existing.done ? 0 : 1;
  const doneAt = newDone ? new Date().toISOString() : null;
  db.prepare('UPDATE tasks SET done = ?, done_at = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newDone, doneAt, args.taskId);
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(args.taskId);
};

const toggleTaskFavorite: ToolHandler = (args, userId) => {
  if (!args.taskId) throw new Error('taskId is required');
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(args.taskId, userId) as any;
  if (!existing) throw new Error('Task not found or access denied');
  db.prepare('UPDATE tasks SET is_favorite = ?, updated_at = datetime(\'now\') WHERE id = ?').run(existing.is_favorite ? 0 : 1, args.taskId);
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(args.taskId);
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
  verifyTaskOwnership(args.taskId, userId);
  return db.prepare('SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at DESC').all(args.taskId);
};

const createTaskComment: ToolHandler = (args, userId) => {
  verifyTaskOwnership(args.taskId, userId);
  if (!args.content) throw new Error('content is required');
  const id = uuidv4();
  db.prepare('INSERT INTO task_comments (id, task_id, user_id, content) VALUES (?, ?, ?, ?)').run(id, args.taskId, userId, args.content);
  return db.prepare('SELECT * FROM task_comments WHERE id = ?').get(id);
};

const deleteTaskComment: ToolHandler = (args, userId) => {
  verifyTaskOwnership(args.taskId, userId);
  if (!args.commentId) throw new Error('commentId is required for delete');
  const comment = db.prepare('SELECT * FROM task_comments WHERE id = ? AND task_id = ?').get(args.commentId, args.taskId);
  if (!comment) throw new Error('Comment not found');
  db.prepare('DELETE FROM task_comments WHERE id = ?').run(args.commentId);
  return { deleted: true, id: args.commentId };
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
  if (!args.projectId) throw new Error('projectId is required for update');
  const existing = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(args.projectId, userId) as any;
  if (!existing) throw new Error('Project not found or access denied');
  db.prepare(`UPDATE projects SET title = ?, description = ?, hex_color = ?, type = ?, parent_project_id = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(
      args.title ?? existing.title,
      args.description ?? existing.description,
      args.hex_color ?? existing.hex_color,
      args.type ?? existing.type,
      args.parent_project_id !== undefined ? (args.parent_project_id || null) : existing.parent_project_id,
      args.projectId
    );
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(args.projectId);
};

const deleteProject: ToolHandler = (args, userId) => {
  if (!args.projectId) throw new Error('projectId is required for delete');
  const existing = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(args.projectId, userId);
  if (!existing) throw new Error('Project not found or access denied');
  db.prepare('DELETE FROM projects WHERE id = ?').run(args.projectId);
  return { deleted: true, id: args.projectId };
};

const toggleProjectArchive: ToolHandler = (args, userId) => {
  if (!args.projectId) throw new Error('projectId is required');
  const existing = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(args.projectId, userId) as any;
  if (!existing) throw new Error('Project not found or access denied');
  db.prepare('UPDATE projects SET archived = ?, updated_at = datetime(\'now\') WHERE id = ?').run(existing.archived ? 0 : 1, args.projectId);
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(args.projectId);
};

const toggleProjectFavorite: ToolHandler = (args, userId) => {
  if (!args.projectId) throw new Error('projectId is required');
  const existing = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(args.projectId, userId) as any;
  if (!existing) throw new Error('Project not found or access denied');
  db.prepare('UPDATE projects SET is_favorite = ?, updated_at = datetime(\'now\') WHERE id = ?').run(existing.is_favorite ? 0 : 1, args.projectId);
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(args.projectId);
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
  if (!args.labelId) throw new Error('labelId is required for update');
  const existing = db.prepare('SELECT * FROM labels WHERE id = ? AND user_id = ?').get(args.labelId, userId) as any;
  if (!existing) throw new Error('Label not found or access denied');
  db.prepare(`UPDATE labels SET title = ?, hex_color = ?, description = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(args.title ?? existing.title, args.hex_color ?? existing.hex_color, args.description ?? existing.description, args.labelId);
  return db.prepare('SELECT * FROM labels WHERE id = ?').get(args.labelId);
};

const deleteLabel: ToolHandler = (args, userId) => {
  if (!args.labelId) throw new Error('labelId is required for delete');
  const existing = db.prepare('SELECT * FROM labels WHERE id = ? AND user_id = ?').get(args.labelId, userId);
  if (!existing) throw new Error('Label not found or access denied');
  db.prepare('DELETE FROM labels WHERE id = ?').run(args.labelId);
  return { deleted: true, id: args.labelId };
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
  if (!args.pomodoroId) throw new Error('pomodoroId is required for update');
  const existing = db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ? AND user_id = ?').get(args.pomodoroId, userId) as any;
  if (!existing) throw new Error('Session not found or access denied');
  db.prepare('UPDATE pomodoro_sessions SET note = ?, status = ? WHERE id = ?')
    .run(args.note ?? existing.note, args.status ?? existing.status, args.pomodoroId);
  return db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ?').get(args.pomodoroId);
};

const completePomodoro: ToolHandler = (args, userId) => {
  if (!args.pomodoroId) throw new Error('pomodoroId is required');
  const existing = db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ? AND user_id = ?').get(args.pomodoroId, userId);
  if (!existing) throw new Error('Session not found or access denied');
  db.prepare('UPDATE pomodoro_sessions SET status = ?, ended_at = ? WHERE id = ?')
    .run('completed', new Date().toISOString(), args.pomodoroId);
  return db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ?').get(args.pomodoroId);
};

const deletePomodoro: ToolHandler = (args, userId) => {
  if (!args.pomodoroId) throw new Error('pomodoroId is required for delete');
  const existing = db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ? AND user_id = ?').get(args.pomodoroId, userId);
  if (!existing) throw new Error('Session not found or access denied');
  db.prepare('DELETE FROM pomodoro_sessions WHERE id = ?').run(args.pomodoroId);
  return { deleted: true, id: args.pomodoroId };
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
  if (args.goalId) { sql += ' AND goal_id = ?'; params.push(args.goalId); }
  sql += ' ORDER BY created_at DESC';
  return db.prepare(sql).all(...params);
};

const createShare: ToolHandler = (args, userId) => {
  if (!args.goalId) throw new Error('goalId is required');
  if (!goalOwnerCheck(args.goalId, userId)) throw new Error('Goal not found or access denied');
  const id = uuidv4();
  const token = uuidv4().replace(/-/g, '').substring(0, 16);
  db.prepare('INSERT INTO shared_goals (id, goal_id, user_id, token, show_logs, show_guestbook) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, args.goalId, userId, token, args.show_logs ? 1 : 0, args.show_guestbook ? 1 : 0);
  return db.prepare('SELECT * FROM shared_goals WHERE id = ?').get(id);
};

const revokeShare: ToolHandler = (args, userId) => {
  if (!args.shareId) throw new Error('shareId is required');
  const existing = db.prepare('SELECT * FROM shared_goals WHERE id = ? AND user_id = ?').get(args.shareId, userId);
  if (!existing) throw new Error('Share link not found or access denied');
  db.prepare('DELETE FROM shared_goals WHERE id = ?').run(args.shareId);
  return { deleted: true, id: args.shareId };
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
  if (!args.ruleId) throw new Error('ruleId is required');
  const existing = db.prepare('SELECT * FROM agent_etiquette WHERE id = ? AND user_id = ?').get(args.ruleId, userId) as any;
  if (!existing) throw new Error('Rule not found or access denied');
  db.prepare('UPDATE agent_etiquette SET content = ?, position = ? WHERE id = ?')
    .run(args.content ?? existing.content, args.position ?? existing.position, args.ruleId);
  return db.prepare('SELECT * FROM agent_etiquette WHERE id = ?').get(args.ruleId);
};

const deleteEtiquette: ToolHandler = (args, userId) => {
  if (!args.ruleId) throw new Error('ruleId is required');
  const existing = db.prepare('SELECT * FROM agent_etiquette WHERE id = ? AND user_id = ?').get(args.ruleId, userId);
  if (!existing) throw new Error('Rule not found or access denied');
  db.prepare('DELETE FROM agent_etiquette WHERE id = ?').run(args.ruleId);
  const remaining = db.prepare('SELECT id FROM agent_etiquette WHERE user_id = ? ORDER BY position').all(userId) as any[];
  remaining.forEach((rule: any, index: number) => db.prepare('UPDATE agent_etiquette SET position = ? WHERE id = ?').run(index + 1, rule.id));
  return { deleted: true, id: args.ruleId };
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
  if (!args.projectId) throw new Error('projectId is required for list');
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(args.projectId, userId);
  if (!project) throw new Error('Project not found or access denied');
  return db.prepare(`
    SELECT s.*,
      COUNT(CASE WHEN t.done = 0 THEN 1 END) as open_tasks,
      COUNT(CASE WHEN t.done = 1 THEN 1 END) as done_tasks
    FROM sprints s LEFT JOIN tasks t ON t.sprint_id = s.id
    WHERE s.project_id = ?
    GROUP BY s.id
    ORDER BY s.sprint_number DESC, s.created_at DESC
  `).all(args.projectId);
};

const createSprint: ToolHandler = (args, userId) => {
  if (!args.projectId) throw new Error('projectId is required for create');
  if (!args.title) throw new Error('title is required for create');
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(args.projectId, userId);
  if (!project) throw new Error('Project not found or access denied');

  const now = new Date().toISOString();
  const maxNum = db.prepare('SELECT MAX(sprint_number) as max FROM sprints WHERE project_id = ?').get(args.projectId) as any;
  const sprintNumber = (maxNum?.max ?? 0) + 1;
  const id = uuidv4();

  db.prepare(`INSERT INTO sprints (id, project_id, title, description, sprint_number, status, start_date, end_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'planned', ?, ?, ?, ?)`)
    .run(id, args.projectId, args.title.trim(), args.description || null, sprintNumber, args.start_date || null, args.end_date || null, now, now);

  const defaultColumns = [
    { title: 'To Do', position: 0, is_done_column: 0 },
    { title: 'In Progress', position: 1, is_done_column: 0 },
    { title: 'Review', position: 2, is_done_column: 0 },
    { title: 'Done', position: 3, is_done_column: 1 },
  ];
  const insertBucket = db.prepare('INSERT INTO buckets (id, project_id, sprint_id, title, position, is_done_column) VALUES (?, ?, ?, ?, ?, ?)');
  for (const column of defaultColumns) {
    insertBucket.run(uuidv4(), args.projectId, id, column.title, column.position, column.is_done_column);
  }

  const sprint = db.prepare('SELECT * FROM sprints WHERE id = ?').get(id);
  const columns = db.prepare('SELECT * FROM buckets WHERE sprint_id = ? ORDER BY position ASC').all(id);
  return { ...(sprint as any), columns };
};

const getSprint: ToolHandler = (args, userId) => {
  if (!args.sprintId) throw new Error('sprintId is required for get');
  const sprint = verifySprintOwnership(args.sprintId, userId);
  const columns = db.prepare('SELECT * FROM buckets WHERE sprint_id = ? ORDER BY position ASC').all(args.sprintId);
  const tasks = db.prepare(`
    SELECT t.*, p.title as project_title, p.hex_color as project_color
    FROM tasks t LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.sprint_id = ? ORDER BY t.position ASC, t.created_at DESC
  `).all(args.sprintId);
  const backlog = db.prepare(`
    SELECT t.*, p.title as project_title, p.hex_color as project_color
    FROM tasks t LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.project_id = ? AND t.sprint_id IS NULL ORDER BY t.position ASC, t.created_at DESC
  `).all(sprint.project_id);
  return { ...sprint, columns, tasks, backlog };
};

const updateSprint: ToolHandler = (args, userId) => {
  if (!args.sprintId) throw new Error('sprintId is required for update');
  const existing = verifySprintOwnership(args.sprintId, userId);
  const now = new Date().toISOString();
  db.prepare(`UPDATE sprints SET title = COALESCE(?, title), description = ?, start_date = ?, end_date = ?, updated_at = ? WHERE id = ?`)
    .run(
      args.title?.trim() || null,
      args.description !== undefined ? args.description : existing.description,
      args.start_date !== undefined ? args.start_date : existing.start_date,
      args.end_date !== undefined ? args.end_date : existing.end_date,
      now,
      args.sprintId
    );
  return db.prepare('SELECT * FROM sprints WHERE id = ?').get(args.sprintId);
};

const deleteSprint: ToolHandler = (args, userId) => {
  if (!args.sprintId) throw new Error('sprintId is required for delete');
  verifySprintOwnership(args.sprintId, userId);
  db.prepare('UPDATE tasks SET sprint_id = NULL, bucket_id = NULL WHERE sprint_id = ?').run(args.sprintId);
  db.prepare('DELETE FROM buckets WHERE sprint_id = ?').run(args.sprintId);
  db.prepare('DELETE FROM sprints WHERE id = ?').run(args.sprintId);
  return { deleted: true, id: args.sprintId };
};

const transitionSprintStatus: ToolHandler = (args, userId) => {
  if (!args.sprintId) throw new Error('sprintId is required');
  if (!args.status) throw new Error('status is required');
  const existing = verifySprintOwnership(args.sprintId, userId);
  const validTransitions: Record<string, string[]> = {
    planned: ['active'],
    active: ['completed'],
    completed: ['active'],
  };
  if (!validTransitions[existing.status]?.includes(args.status)) {
    throw new Error(`Cannot transition from '${existing.status}' to '${args.status}'`);
  }
  db.prepare('UPDATE sprints SET status = ?, updated_at = ? WHERE id = ?').run(args.status, new Date().toISOString(), args.sprintId);
  return db.prepare('SELECT * FROM sprints WHERE id = ?').get(args.sprintId);
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
  verifySprintForColumn(args.sprintId, userId);
  return db.prepare('SELECT * FROM buckets WHERE sprint_id = ? ORDER BY position ASC').all(args.sprintId);
};

const createSprintColumn: ToolHandler = (args, userId) => {
  const sprint = verifySprintForColumn(args.sprintId, userId);
  if (!args.title) throw new Error('title is required');
  const maxPos = db.prepare('SELECT MAX(position) as max FROM buckets WHERE sprint_id = ?').get(args.sprintId) as any;
  const position = args.position ?? ((maxPos?.max ?? 0) + 1);
  const id = uuidv4();
  db.prepare('INSERT INTO buckets (id, project_id, sprint_id, title, position, is_done_column) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, sprint.project_id, args.sprintId, args.title.trim(), position, args.is_done_column ? 1 : 0);
  return db.prepare('SELECT * FROM buckets WHERE id = ?').get(id);
};

const updateSprintColumn: ToolHandler = (args, userId) => {
  verifySprintForColumn(args.sprintId, userId);
  if (!args.columnId) throw new Error('columnId is required for update');
  const existing = db.prepare('SELECT * FROM buckets WHERE id = ? AND sprint_id = ?').get(args.columnId, args.sprintId);
  if (!existing) throw new Error('Column not found');
  db.prepare('UPDATE buckets SET title = COALESCE(?, title), position = COALESCE(?, position), is_done_column = COALESCE(?, is_done_column) WHERE id = ?')
    .run(args.title?.trim() || null, args.position ?? null, args.is_done_column !== undefined ? (args.is_done_column ? 1 : 0) : null, args.columnId);
  return db.prepare('SELECT * FROM buckets WHERE id = ?').get(args.columnId);
};

const deleteSprintColumn: ToolHandler = (args, userId) => {
  verifySprintForColumn(args.sprintId, userId);
  if (!args.columnId) throw new Error('columnId is required for delete');
  const existing = db.prepare('SELECT * FROM buckets WHERE id = ? AND sprint_id = ?').get(args.columnId, args.sprintId);
  if (!existing) throw new Error('Column not found');
  db.prepare('UPDATE tasks SET bucket_id = NULL WHERE bucket_id = ?').run(args.columnId);
  db.prepare('DELETE FROM buckets WHERE id = ?').run(args.columnId);
  return { deleted: true, id: args.columnId };
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
  if (!args.noteId) throw new Error('noteId is required for update');
  if (!args.content) throw new Error('content is required for update');
  const result = db.prepare(`UPDATE quick_notes SET content = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .run(args.content.trim(), args.noteId, userId);
  if (result.changes === 0) throw new Error('Note not found or access denied');
  return db.prepare('SELECT * FROM quick_notes WHERE id = ?').get(args.noteId);
};

const deleteNote: ToolHandler = (args, userId) => {
  if (!args.noteId) throw new Error('noteId is required for delete');
  const result = db.prepare('DELETE FROM quick_notes WHERE id = ? AND user_id = ?').run(args.noteId, userId);
  if (result.changes === 0) throw new Error('Note not found or access denied');
  return { deleted: true, id: args.noteId };
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
  if (!args.eventId) throw new Error('eventId is required for update');
  const existing = db.prepare('SELECT * FROM events WHERE id = ? AND user_id = ?').get(args.eventId, userId) as any;
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
    args.eventId,
    userId
  );
  return db.prepare('SELECT * FROM events WHERE id = ?').get(args.eventId);
};

const deleteEvent: ToolHandler = (args, userId) => {
  if (!args.eventId) throw new Error('eventId is required for delete');
  const existing = db.prepare('SELECT * FROM events WHERE id = ? AND user_id = ?').get(args.eventId, userId);
  if (!existing) throw new Error('Event not found');
  db.prepare('DELETE FROM events WHERE id = ? AND user_id = ?').run(args.eventId, userId);
  return { deleted: true, id: args.eventId };
};

export const handleManageEvent = createManagedActionHandler({
  list: listEvents,
  create: createEvent,
  update: updateEvent,
  delete: deleteEvent,
});
