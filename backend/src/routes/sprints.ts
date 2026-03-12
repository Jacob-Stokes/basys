import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { ok, fail, serverError } from '../utils/response';
import { generateSprintDoc } from '../utils/vault';

const router = Router();

const DEFAULT_COLUMNS = [
  { title: 'To Do', position: 0, is_done_column: 0 },
  { title: 'In Progress', position: 1, is_done_column: 0 },
  { title: 'Review', position: 2, is_done_column: 0 },
  { title: 'Done', position: 3, is_done_column: 1 },
];

// GET /projects/:projectId/sprints — List sprints for a project
router.get('/projects/:projectId/sprints', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const projectId = req.params.projectId;

    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId);
    if (!project) return fail(res, 404, 'Project not found');

    const sprints = db.prepare(`
      SELECT s.*,
        COUNT(CASE WHEN t.done = 0 THEN 1 END) as open_tasks,
        COUNT(CASE WHEN t.done = 1 THEN 1 END) as done_tasks
      FROM sprints s
      LEFT JOIN tasks t ON t.sprint_id = s.id
      WHERE s.project_id = ?
      GROUP BY s.id
      ORDER BY s.sprint_number DESC, s.created_at DESC
    `).all(projectId);

    ok(res, sprints);
  } catch (error) {
    serverError(res, error);
  }
});

// POST /projects/:projectId/sprints — Create sprint with default columns
router.post('/projects/:projectId/sprints', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const projectId = req.params.projectId as string;

    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId);
    if (!project) return fail(res, 404, 'Project not found');

    const { title, description, start_date, end_date } = req.body;
    if (!title?.trim()) return fail(res, 400, 'Title is required');

    const projectMode = (project as any).project_mode || 'simple';
    const isSprintMode = projectMode === 'sprint';

    // Auto-increment sprint_number only for sprint mode
    let sprintNumber = null;
    if (isSprintMode) {
      const maxNum = db.prepare('SELECT MAX(sprint_number) as max FROM sprints WHERE project_id = ?').get(projectId) as any;
      sprintNumber = (maxNum?.max ?? 0) + 1;
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO sprints (id, project_id, title, description, sprint_number, status, start_date, end_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'planned', ?, ?, ?, ?)
    `).run(id, projectId, title.trim(), description || null, sprintNumber, start_date || null, end_date || null, now, now);

    // Create kanban columns — use project default_columns if set, otherwise global defaults
    let columnsToCreate = DEFAULT_COLUMNS;
    const projectDefaultColumns = (project as any).default_columns;
    if (projectDefaultColumns) {
      try {
        const parsed = JSON.parse(projectDefaultColumns);
        if (Array.isArray(parsed) && parsed.length > 0) {
          columnsToCreate = parsed.map((c: any, i: number) => ({
            title: c.title || `Column ${i + 1}`,
            position: c.position ?? i,
            is_done_column: c.is_done_column ?? 0,
          }));
        }
      } catch { /* ignore parse errors, use defaults */ }
    }
    const insertBucket = db.prepare('INSERT INTO buckets (id, project_id, sprint_id, title, position, is_done_column) VALUES (?, ?, ?, ?, ?, ?)');
    for (const col of columnsToCreate) {
      insertBucket.run(uuidv4(), projectId, id, col.title, col.position, col.is_done_column);
    }

    // Generate Obsidian vault doc if enabled
    const obsSettings = db.prepare('SELECT obsidian_vault_name, obsidian_enabled FROM users WHERE id = ?').get(userId) as any;
    if (obsSettings?.obsidian_enabled && obsSettings.obsidian_vault_name) {
      const result = generateSprintDoc(
        { id, title: title.trim(), description: description || null, project_id: projectId, sprint_number: sprintNumber, start_date: start_date || null, end_date: end_date || null },
        (project as any).title,
        obsSettings.obsidian_vault_name
      );
      if (result) {
        db.prepare('UPDATE sprints SET obsidian_path = ? WHERE id = ?').run(result.obsidian_path, id);
      }
    }

    const sprint = db.prepare('SELECT * FROM sprints WHERE id = ?').get(id);
    const columns = db.prepare('SELECT * FROM buckets WHERE sprint_id = ? ORDER BY position ASC').all(id);

    ok(res, { ...sprint as any, columns }, 201);
  } catch (error) {
    serverError(res, error);
  }
});

// GET /sprints/:id — Get sprint with tasks grouped by column
router.get('/sprints/:id', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id;

    const sprint = db.prepare(`
      SELECT s.*, p.project_mode FROM sprints s
      JOIN projects p ON s.project_id = p.id
      WHERE s.id = ? AND p.user_id = ?
    `).get(id, userId) as any;
    if (!sprint) return fail(res, 404, 'Sprint not found');

    const columns = db.prepare('SELECT * FROM buckets WHERE sprint_id = ? ORDER BY position ASC').all(id);

    const tasks = db.prepare(`
      SELECT t.*,
        p.title as project_title, p.hex_color as project_color,
        u.username as assignee_username
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN users u ON t.assignee_user_id = u.id
      WHERE t.sprint_id = ?
      ORDER BY t.position ASC, t.created_at DESC
    `).all(id) as any[];

    // Backlog tasks (same project, no sprint)
    const backlog = db.prepare(`
      SELECT t.*,
        p.title as project_title, p.hex_color as project_color,
        u.username as assignee_username
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN users u ON t.assignee_user_id = u.id
      WHERE t.project_id = ? AND t.sprint_id IS NULL
      ORDER BY t.position ASC, t.created_at DESC
    `).all(sprint.project_id) as any[];

    ok(res, { ...sprint, columns, tasks, backlog });
  } catch (error) {
    serverError(res, error);
  }
});

// PUT /sprints/:id — Update sprint
router.put('/sprints/:id', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id;

    const sprint = db.prepare(`
      SELECT s.* FROM sprints s
      JOIN projects p ON s.project_id = p.id
      WHERE s.id = ? AND p.user_id = ?
    `).get(id, userId) as any;
    if (!sprint) return fail(res, 404, 'Sprint not found');

    const { title, description, start_date, end_date } = req.body;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE sprints SET
        title = COALESCE(?, title),
        description = ?,
        start_date = ?,
        end_date = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      title?.trim() || null,
      description !== undefined ? description : sprint.description,
      start_date !== undefined ? start_date : sprint.start_date,
      end_date !== undefined ? end_date : sprint.end_date,
      now, id
    );

    const updated = db.prepare('SELECT * FROM sprints WHERE id = ?').get(id);
    ok(res, updated);
  } catch (error) {
    serverError(res, error);
  }
});

// DELETE /sprints/:id — Delete sprint (tasks revert to backlog)
router.delete('/sprints/:id', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id;

    const sprint = db.prepare(`
      SELECT s.* FROM sprints s
      JOIN projects p ON s.project_id = p.id
      WHERE s.id = ? AND p.user_id = ?
    `).get(id, userId);
    if (!sprint) return fail(res, 404, 'Sprint not found');

    // Revert tasks to backlog
    db.prepare('UPDATE tasks SET sprint_id = NULL, bucket_id = NULL WHERE sprint_id = ?').run(id);
    // Delete sprint columns
    db.prepare('DELETE FROM buckets WHERE sprint_id = ?').run(id);
    // Delete sprint
    db.prepare('DELETE FROM sprints WHERE id = ?').run(id);

    ok(res, { deleted: true });
  } catch (error) {
    serverError(res, error);
  }
});

// PATCH /sprints/:id/status — Transition sprint status
router.patch('/sprints/:id/status', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id;

    const sprint = db.prepare(`
      SELECT s.* FROM sprints s
      JOIN projects p ON s.project_id = p.id
      WHERE s.id = ? AND p.user_id = ?
    `).get(id, userId) as any;
    if (!sprint) return fail(res, 404, 'Sprint not found');

    const { status } = req.body;
    const validTransitions: Record<string, string[]> = {
      planned: ['active'],
      active: ['completed'],
      completed: ['active'], // allow reopening
    };

    if (!status || !validTransitions[sprint.status]?.includes(status)) {
      return fail(res, 400, `Cannot transition from '${sprint.status}' to '${status}'`);
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE sprints SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);

    const updated = db.prepare('SELECT * FROM sprints WHERE id = ?').get(id);
    ok(res, updated);
  } catch (error) {
    serverError(res, error);
  }
});

// ── Sprint Columns (Buckets) ───────────────────────────────────────

// GET /sprints/:id/columns — List columns for a sprint
router.get('/sprints/:id/columns', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id;

    const sprint = db.prepare(`
      SELECT s.* FROM sprints s
      JOIN projects p ON s.project_id = p.id
      WHERE s.id = ? AND p.user_id = ?
    `).get(id, userId);
    if (!sprint) return fail(res, 404, 'Sprint not found');

    const columns = db.prepare('SELECT * FROM buckets WHERE sprint_id = ? ORDER BY position ASC').all(id);
    ok(res, columns);
  } catch (error) {
    serverError(res, error);
  }
});

// POST /sprints/:id/columns — Add a column to a sprint
router.post('/sprints/:id/columns', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id;

    const sprint = db.prepare(`
      SELECT s.* FROM sprints s
      JOIN projects p ON s.project_id = p.id
      WHERE s.id = ? AND p.user_id = ?
    `).get(id, userId);
    if (!sprint) return fail(res, 404, 'Sprint not found');

    const { title, is_done_column } = req.body;
    if (!title?.trim()) return fail(res, 400, 'Title is required');

    const maxPos = db.prepare('SELECT MAX(position) as max FROM buckets WHERE sprint_id = ?').get(id) as any;
    const position = (maxPos?.max ?? 0) + 1;

    const bucketId = uuidv4();
    db.prepare('INSERT INTO buckets (id, project_id, sprint_id, title, position, is_done_column) VALUES (?, ?, ?, ?, ?, ?)')
      .run(bucketId, (sprint as any).project_id, id, title.trim(), position, is_done_column ? 1 : 0);

    const bucket = db.prepare('SELECT * FROM buckets WHERE id = ?').get(bucketId);
    ok(res, bucket, 201);
  } catch (error) {
    serverError(res, error);
  }
});

// PUT /sprints/:id/columns/:columnId — Update a sprint column
router.put('/sprints/:id/columns/:columnId', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id;
    const columnId = req.params.columnId;

    const sprint = db.prepare(`
      SELECT s.* FROM sprints s
      JOIN projects p ON s.project_id = p.id
      WHERE s.id = ? AND p.user_id = ?
    `).get(id, userId);
    if (!sprint) return fail(res, 404, 'Sprint not found');

    const existing = db.prepare('SELECT * FROM buckets WHERE id = ? AND sprint_id = ?').get(columnId, id);
    if (!existing) return fail(res, 404, 'Column not found');

    const { title, position, is_done_column } = req.body;
    db.prepare('UPDATE buckets SET title = COALESCE(?, title), position = COALESCE(?, position), is_done_column = COALESCE(?, is_done_column) WHERE id = ?')
      .run(title?.trim() || null, position ?? null, is_done_column !== undefined ? (is_done_column ? 1 : 0) : null, columnId);

    const bucket = db.prepare('SELECT * FROM buckets WHERE id = ?').get(columnId);
    ok(res, bucket);
  } catch (error) {
    serverError(res, error);
  }
});

// DELETE /sprints/:id/columns/:columnId — Delete a sprint column
router.delete('/sprints/:id/columns/:columnId', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id;
    const columnId = req.params.columnId;

    const sprint = db.prepare(`
      SELECT s.* FROM sprints s
      JOIN projects p ON s.project_id = p.id
      WHERE s.id = ? AND p.user_id = ?
    `).get(id, userId);
    if (!sprint) return fail(res, 404, 'Sprint not found');

    const existing = db.prepare('SELECT * FROM buckets WHERE id = ? AND sprint_id = ?').get(columnId, id);
    if (!existing) return fail(res, 404, 'Column not found');

    // Unassign tasks from this column
    db.prepare('UPDATE tasks SET bucket_id = NULL WHERE bucket_id = ?').run(columnId);
    db.prepare('DELETE FROM buckets WHERE id = ?').run(columnId);
    ok(res, { deleted: true });
  } catch (error) {
    serverError(res, error);
  }
});

export default router;
