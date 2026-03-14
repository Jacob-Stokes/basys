import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { ok, fail, serverError } from '../utils/response';

const router = Router();

// GET / — List all action templates for current user
router.get('/', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const templates = db.prepare('SELECT * FROM action_templates WHERE user_id = ? ORDER BY created_at DESC').all(userId);
    ok(res, templates);
  } catch (error) {
    serverError(res, error);
  }
});

// POST / — Create action template
router.post('/', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { title, description, default_config } = req.body;
    if (!title?.trim()) return fail(res, 400, 'Title is required');

    const id = uuidv4();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO action_templates (id, user_id, title, description, default_config, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, userId, title.trim(), description || null, typeof default_config === 'string' ? default_config : JSON.stringify(default_config || null), now, now);

    const template = db.prepare('SELECT * FROM action_templates WHERE id = ?').get(id);
    ok(res, template, 201);
  } catch (error) {
    serverError(res, error);
  }
});

// PUT /:id — Update action template
router.put('/:id', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM action_templates WHERE id = ? AND user_id = ?').get(id, userId) as any;
    if (!existing) return fail(res, 404, 'Template not found');

    const { title, description, default_config } = req.body;
    const now = new Date().toISOString();
    db.prepare(`UPDATE action_templates SET title = ?, description = ?, default_config = ?, updated_at = ? WHERE id = ?`)
      .run(
        title?.trim() || existing.title,
        description !== undefined ? description : existing.description,
        default_config !== undefined ? (typeof default_config === 'string' ? default_config : JSON.stringify(default_config)) : existing.default_config,
        now, id
      );

    const template = db.prepare('SELECT * FROM action_templates WHERE id = ?').get(id);
    ok(res, template);
  } catch (error) {
    serverError(res, error);
  }
});

// DELETE /:id — Delete action template
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM action_templates WHERE id = ? AND user_id = ?').get(id, userId);
    if (!existing) return fail(res, 404, 'Template not found');

    db.prepare('DELETE FROM action_templates WHERE id = ?').run(id);
    ok(res, { deleted: true });
  } catch (error) {
    serverError(res, error);
  }
});

export default router;
