import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { ok, fail, serverError } from '../utils/response';
import { generateProjectDoc } from '../utils/vault';
import { deleteTasksCascade } from '../utils/taskCascade';
import { ensureProjectBuckets } from '../utils/buckets';

const router = Router();

// GET / — List all projects with task counts
router.get('/', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const { exclude_types } = req.query;

    let extraWhere = '';
    const params: any[] = [userId];

    // Filter out projects by type (comma-separated list)
    if (exclude_types && typeof exclude_types === 'string') {
      const types = exclude_types.split(',').map(t => t.trim()).filter(Boolean);
      if (types.length > 0) {
        const placeholders = types.map(() => '?').join(',');
        extraWhere = ` AND (p.type IS NULL OR p.type NOT IN (${placeholders}))`;
        params.push(...types);
      }
    }

    const rows = db.prepare(`
      SELECT p.*,
        COUNT(CASE WHEN t.done = 0 THEN 1 END) as open_tasks,
        COUNT(CASE WHEN t.done = 1 THEN 1 END) as done_tasks
      FROM projects p
      LEFT JOIN tasks t ON t.project_id = p.id AND t.user_id = p.user_id
      WHERE p.user_id = ?${extraWhere}
      GROUP BY p.id
      ORDER BY p.is_favorite DESC, p.position ASC, p.created_at DESC
    `).all(...params);

    ok(res, rows);
  } catch (error) {
    serverError(res, error);
  }
});

// POST / — Create project
router.post('/', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const { title, description, hex_color, parent_project_id, type, project_mode } = req.body;
    if (!title?.trim()) return fail(res, 400, 'Title is required');

    if (parent_project_id) {
      const parent = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(parent_project_id, userId);
      if (!parent) return fail(res, 400, 'Parent project not found');
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO projects (id, user_id, title, description, hex_color, parent_project_id, type, project_mode, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, title.trim(), description || null, hex_color || '', parent_project_id || null, type || 'personal', project_mode || 'simple', now, now);

    // Generate Obsidian vault doc if enabled
    const obsSettings = db.prepare('SELECT obsidian_vault_name, obsidian_enabled FROM users WHERE id = ?').get(userId) as any;
    if (obsSettings?.obsidian_enabled && obsSettings.obsidian_vault_name) {
      const result = generateProjectDoc(
        { id, title: title.trim(), description: description || null, hex_color: hex_color || '', type: type || 'personal' },
        obsSettings.obsidian_vault_name
      );
      if (result) {
        db.prepare('UPDATE projects SET obsidian_path = ? WHERE id = ?').run(result.obsidian_path, id);
      }
    }

    // Auto-create default project-level buckets
    ensureProjectBuckets(id);

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    ok(res, project, 201);
  } catch (error) {
    serverError(res, error);
  }
});

// GET /:id — Get project with tasks
router.get('/:id', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, userId) as any;
    if (!project) return fail(res, 404, 'Project not found');

    const tasks = db.prepare(`
      SELECT t.*, p2.title as project_title, p2.hex_color as project_color
      FROM tasks t
      LEFT JOIN projects p2 ON t.project_id = p2.id
      WHERE t.project_id = ? AND t.user_id = ?
      ORDER BY t.done ASC, t.position ASC, t.created_at DESC
    `).all(id, userId) as any[];

    // Batch-load labels + links for all tasks
    const taskIds = tasks.map(t => t.id);
    const labelsMap: Record<string, any[]> = {};
    const linksMap: Record<string, any[]> = {};
    for (const id2 of taskIds) { labelsMap[id2] = []; linksMap[id2] = []; }
    if (taskIds.length > 0) {
      const ph = taskIds.map(() => '?').join(',');
      const labelRows = db.prepare(`
        SELECT l.*, tl.task_id FROM labels l
        JOIN task_labels tl ON tl.label_id = l.id
        WHERE tl.task_id IN (${ph})
      `).all(...taskIds) as any[];
      for (const row of labelRows) {
        const { task_id, ...label } = row;
        labelsMap[task_id].push(label);
      }
      const linkRows = db.prepare(`SELECT * FROM task_links WHERE task_id IN (${ph}) ORDER BY target_type, created_at`).all(...taskIds) as any[];
      for (const row of linkRows) {
        linksMap[row.task_id].push(row);
      }
    }

    const enrichedTasks = tasks.map(t => ({
      ...t,
      labels: labelsMap[t.id] || [],
      links: linksMap[t.id] || [],
      project: t.project_id ? { id: t.project_id, title: t.project_title, hex_color: t.project_color } : null,
    }));

    const buckets = db.prepare('SELECT * FROM buckets WHERE project_id = ? ORDER BY position ASC').all(id);

    ok(res, { ...project, tasks: enrichedTasks, buckets });
  } catch (error) {
    serverError(res, error);
  }
});

// PUT /:id — Update project
router.put('/:id', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const existing = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, userId);
    if (!existing) return fail(res, 404, 'Project not found');

    const { title, description, hex_color, parent_project_id, type, project_mode, default_columns } = req.body;

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE projects SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        hex_color = COALESCE(?, hex_color),
        parent_project_id = ?,
        type = COALESCE(?, type),
        project_mode = COALESCE(?, project_mode),
        default_columns = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      title?.trim() || null,
      description !== undefined ? description : null,
      hex_color !== undefined ? hex_color : null,
      parent_project_id !== undefined ? parent_project_id : (existing as any).parent_project_id,
      type || null,
      project_mode || null,
      default_columns !== undefined ? (default_columns ? JSON.stringify(default_columns) : null) : (existing as any).default_columns,
      now, id
    );

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    ok(res, project);
  } catch (error) {
    serverError(res, error);
  }
});

// DELETE /:id — Delete project (?deleteTasks=true deletes tasks, false unlinks them)
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const existing = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, userId);
    if (!existing) return fail(res, 404, 'Project not found');

    const deleteTasks = req.query.deleteTasks !== 'false'; // default true

    const deleteAll = db.transaction(() => {
      if (deleteTasks) {
        const taskIds = (db.prepare('SELECT id FROM tasks WHERE project_id = ?').all(id) as any[]).map(t => t.id);
        deleteTasksCascade(taskIds);
        if (taskIds.length > 0) db.prepare('DELETE FROM tasks WHERE project_id = ?').run(id);
      } else {
        db.prepare('UPDATE tasks SET project_id = NULL, sprint_id = NULL, bucket_id = NULL WHERE project_id = ?').run(id);
      }
      db.prepare('DELETE FROM buckets WHERE project_id = ?').run(id);
      db.prepare('DELETE FROM sprints WHERE project_id = ?').run(id);
      db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    });
    deleteAll();
    ok(res, { deleted: true });
  } catch (error) {
    serverError(res, error);
  }
});

// PATCH /:id/favorite — Toggle favorite
router.patch('/:id/favorite', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const existing = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, userId) as any;
    if (!existing) return fail(res, 404, 'Project not found');

    const now = new Date().toISOString();
    db.prepare('UPDATE projects SET is_favorite = ?, updated_at = ? WHERE id = ?')
      .run(existing.is_favorite ? 0 : 1, now, id);
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    ok(res, project);
  } catch (error) {
    serverError(res, error);
  }
});

// PATCH /:id/archive — Toggle archived (cascades to sprints + tasks)
router.patch('/:id/archive', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const existing = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, userId) as any;
    if (!existing) return fail(res, 404, 'Project not found');

    const newArchived = existing.archived ? 0 : 1;
    const now = new Date().toISOString();
    const archiveCascade = db.transaction(() => {
      db.prepare('UPDATE projects SET archived = ?, updated_at = ? WHERE id = ?').run(newArchived, now, id);
      db.prepare('UPDATE sprints SET archived = ? WHERE project_id = ?').run(newArchived, id);
      db.prepare('UPDATE tasks SET archived = ? WHERE project_id = ?').run(newArchived, id);
    });
    archiveCascade();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    ok(res, project);
  } catch (error) {
    serverError(res, error);
  }
});

// GET /:id/buckets — List buckets for project
router.get('/:id/buckets', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, userId);
    if (!project) return fail(res, 404, 'Project not found');

    const buckets = db.prepare('SELECT * FROM buckets WHERE project_id = ? ORDER BY position ASC').all(id);
    ok(res, buckets);
  } catch (error) {
    serverError(res, error);
  }
});

// POST /:id/buckets — Create bucket
router.post('/:id/buckets', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, userId);
    if (!project) return fail(res, 404, 'Project not found');

    const { title, emoji, show_inline } = req.body;
    if (!title?.trim()) return fail(res, 400, 'Title is required');

    const bucketId = uuidv4();
    const maxPos = db.prepare('SELECT MAX(position) as max FROM buckets WHERE project_id = ?').get(id) as any;
    const position = (maxPos?.max ?? 0) + 1;

    db.prepare('INSERT INTO buckets (id, project_id, title, position, emoji, show_inline) VALUES (?, ?, ?, ?, ?, ?)')
      .run(bucketId, id, title.trim(), position, emoji || null, show_inline !== undefined ? (show_inline ? 1 : 0) : 1);

    const bucket = db.prepare('SELECT * FROM buckets WHERE id = ?').get(bucketId);
    ok(res, bucket, 201);
  } catch (error) {
    serverError(res, error);
  }
});

// PUT /:id/buckets/:bucketId — Update bucket
router.put('/:id/buckets/:bucketId', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const bucketId = req.params.bucketId as string;
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, userId);
    if (!project) return fail(res, 404, 'Project not found');

    const existing = db.prepare('SELECT * FROM buckets WHERE id = ? AND project_id = ?').get(bucketId, id);
    if (!existing) return fail(res, 404, 'Bucket not found');

    const { title, position, emoji, show_inline, is_done_column } = req.body;
    const updates: string[] = [];
    const params: any[] = [];
    if (title?.trim()) { updates.push('title = ?'); params.push(title.trim()); }
    if (position !== undefined && position !== null) { updates.push('position = ?'); params.push(position); }
    if (emoji !== undefined) { updates.push('emoji = ?'); params.push(emoji || null); }
    if (show_inline !== undefined) { updates.push('show_inline = ?'); params.push(show_inline ? 1 : 0); }
    if (is_done_column !== undefined) { updates.push('is_done_column = ?'); params.push(is_done_column ? 1 : 0); }
    if (updates.length > 0) {
      params.push(bucketId);
      db.prepare(`UPDATE buckets SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    const bucket = db.prepare('SELECT * FROM buckets WHERE id = ?').get(bucketId);
    ok(res, bucket);
  } catch (error) {
    serverError(res, error);
  }
});

// DELETE /:id/buckets/:bucketId — Delete bucket
router.delete('/:id/buckets/:bucketId', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const bucketId = req.params.bucketId as string;
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, userId);
    if (!project) return fail(res, 404, 'Project not found');

    const existing = db.prepare('SELECT * FROM buckets WHERE id = ? AND project_id = ?').get(bucketId, id);
    if (!existing) return fail(res, 404, 'Bucket not found');

    db.prepare('UPDATE tasks SET bucket_id = NULL WHERE bucket_id = ?').run(bucketId);
    db.prepare('DELETE FROM buckets WHERE id = ?').run(bucketId);
    ok(res, { deleted: true });
  } catch (error) {
    serverError(res, error);
  }
});

export default router;
