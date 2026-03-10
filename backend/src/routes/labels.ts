import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { ok, fail, serverError } from '../utils/response';

const router = Router();

// GET / — List all labels with usage count
router.get('/', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const rows = db.prepare(`
      SELECT l.*,
        COUNT(tl.task_id) as task_count
      FROM labels l
      LEFT JOIN task_labels tl ON tl.label_id = l.id
      WHERE l.user_id = ?
      GROUP BY l.id
      ORDER BY l.title ASC
    `).all(userId);
    ok(res, rows);
  } catch (error) {
    serverError(res, error);
  }
});

// POST / — Create label
router.post('/', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const { title, hex_color, description } = req.body;
    if (!title?.trim()) return fail(res, 400, 'Title is required');

    const id = uuidv4();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO labels (id, user_id, title, description, hex_color, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, title.trim(), description || null, hex_color || '#e2e8f0', now, now);

    const label = db.prepare('SELECT * FROM labels WHERE id = ?').get(id);
    ok(res, label, 201);
  } catch (error) {
    serverError(res, error);
  }
});

// PUT /:id — Update label
router.put('/:id', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM labels WHERE id = ? AND user_id = ?').get(id, userId);
    if (!existing) return fail(res, 404, 'Label not found');

    const { title, hex_color, description } = req.body;
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE labels SET
        title = COALESCE(?, title),
        hex_color = COALESCE(?, hex_color),
        description = COALESCE(?, description),
        updated_at = ?
      WHERE id = ?
    `).run(title?.trim() || null, hex_color || null, description !== undefined ? description : null, now, id);

    const label = db.prepare('SELECT * FROM labels WHERE id = ?').get(id);
    ok(res, label);
  } catch (error) {
    serverError(res, error);
  }
});

// DELETE /:id — Delete label
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM labels WHERE id = ? AND user_id = ?').get(id, userId);
    if (!existing) return fail(res, 404, 'Label not found');

    db.prepare('DELETE FROM labels WHERE id = ?').run(id);
    ok(res, { deleted: true });
  } catch (error) {
    serverError(res, error);
  }
});

export default router;
