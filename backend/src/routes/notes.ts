import { Router } from 'express';
import { db } from '../db/database';
import { randomUUID } from 'crypto';
import { ok, fail } from '../utils/response';

const notesRouter = Router();

// GET /api/notes — list all notes for current user, newest first
notesRouter.get('/notes', (req, res) => {
  const userId = (req as any).user?.id;
  const notes = db.prepare(
    'SELECT * FROM quick_notes WHERE user_id = ? ORDER BY updated_at DESC'
  ).all(userId);
  ok(res, notes);
});

// POST /api/notes — create a note
notesRouter.post('/notes', (req, res) => {
  const userId = (req as any).user?.id;
  const { content } = req.body;

  if (!content?.trim()) {
    return fail(res, 400, 'content is required');
  }

  const id = randomUUID();
  db.prepare(
    'INSERT INTO quick_notes (id, user_id, content) VALUES (?, ?, ?)'
  ).run(id, userId, content.trim());

  const note = db.prepare('SELECT * FROM quick_notes WHERE id = ?').get(id);
  ok(res, note, 201);
});

// PUT /api/notes/:id — update a note
notesRouter.put('/notes/:id', (req, res) => {
  const userId = (req as any).user?.id;
  const { content } = req.body;

  if (!content?.trim()) {
    return fail(res, 400, 'content is required');
  }

  const result = db.prepare(
    `UPDATE quick_notes SET content = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).run(content.trim(), req.params.id, userId);

  if (result.changes === 0) {
    return fail(res, 404, 'Note not found');
  }

  const note = db.prepare('SELECT * FROM quick_notes WHERE id = ?').get(req.params.id);
  ok(res, note);
});

// DELETE /api/notes/:id — delete a note
notesRouter.delete('/notes/:id', (req, res) => {
  const userId = (req as any).user?.id;
  const result = db.prepare(
    'DELETE FROM quick_notes WHERE id = ? AND user_id = ?'
  ).run(req.params.id, userId);

  if (result.changes === 0) {
    return fail(res, 404, 'Note not found');
  }

  ok(res, { deleted: true });
});

export default notesRouter;
