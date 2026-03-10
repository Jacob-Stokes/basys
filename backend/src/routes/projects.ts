import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { ok, fail, serverError } from '../utils/response';

const router = Router();

// GET / — List all projects with task counts
router.get('/', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const rows = db.prepare(`
      SELECT p.*,
        COUNT(CASE WHEN t.done = 0 THEN 1 END) as open_tasks,
        COUNT(CASE WHEN t.done = 1 THEN 1 END) as done_tasks
      FROM projects p
      LEFT JOIN tasks t ON t.project_id = p.id
      WHERE p.user_id = ?
      GROUP BY p.id
      ORDER BY p.is_favorite DESC, p.position ASC, p.created_at DESC
    `).all(userId);

    ok(res, rows);
  } catch (error) {
    serverError(res, error);
  }
});

// POST / — Create project
router.post('/', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const { title, description, hex_color, parent_project_id } = req.body;
    if (!title?.trim()) return fail(res, 400, 'Title is required');

    if (parent_project_id) {
      const parent = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(parent_project_id, userId);
      if (!parent) return fail(res, 400, 'Parent project not found');
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO projects (id, user_id, title, description, hex_color, parent_project_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, title.trim(), description || null, hex_color || '', parent_project_id || null, now, now);

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

    // Load labels + links for each task
    const taskIds = tasks.map(t => t.id);
    const labelsMap: Record<string, any[]> = {};
    const linksMap: Record<string, any[]> = {};
    for (const taskId of taskIds) {
      labelsMap[taskId] = db.prepare(`
        SELECT l.* FROM labels l
        JOIN task_labels tl ON tl.label_id = l.id
        WHERE tl.task_id = ?
      `).all(taskId) as any[];
      linksMap[taskId] = db.prepare('SELECT * FROM task_links WHERE task_id = ? ORDER BY target_type, created_at').all(taskId) as any[];
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

    const { title, description, hex_color, parent_project_id } = req.body;

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE projects SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        hex_color = COALESCE(?, hex_color),
        parent_project_id = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      title?.trim() || null,
      description !== undefined ? description : null,
      hex_color !== undefined ? hex_color : null,
      parent_project_id !== undefined ? parent_project_id : (existing as any).parent_project_id,
      now, id
    );

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    ok(res, project);
  } catch (error) {
    serverError(res, error);
  }
});

// DELETE /:id — Delete project (tasks get project_id = NULL)
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const existing = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, userId);
    if (!existing) return fail(res, 404, 'Project not found');

    // Unlink tasks before deleting
    db.prepare('UPDATE tasks SET project_id = NULL WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
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

// PATCH /:id/archive — Toggle archived
router.patch('/:id/archive', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const existing = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, userId) as any;
    if (!existing) return fail(res, 404, 'Project not found');

    const now = new Date().toISOString();
    db.prepare('UPDATE projects SET archived = ?, updated_at = ? WHERE id = ?')
      .run(existing.archived ? 0 : 1, now, id);
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

    const { title } = req.body;
    if (!title?.trim()) return fail(res, 400, 'Title is required');

    const bucketId = uuidv4();
    const maxPos = db.prepare('SELECT MAX(position) as max FROM buckets WHERE project_id = ?').get(id) as any;
    const position = (maxPos?.max ?? 0) + 1;

    db.prepare('INSERT INTO buckets (id, project_id, title, position) VALUES (?, ?, ?, ?)')
      .run(bucketId, id, title.trim(), position);

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

    const { title, position } = req.body;
    db.prepare('UPDATE buckets SET title = COALESCE(?, title), position = COALESCE(?, position) WHERE id = ?')
      .run(title?.trim() || null, position ?? null, bucketId);

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
