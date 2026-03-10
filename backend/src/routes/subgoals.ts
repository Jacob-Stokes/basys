import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, SubGoal } from '../db/database';
import { ownedSubGoal, goalOwnerCheck } from '../middleware/ownership';
import { ok, fail, serverError } from '../utils/response';

const router = Router();

// Search sub-goals by title across all user's goals (for typeahead)
router.get('/search', (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const q = (req.query.q as string || '').trim();

    if (!q || q.length < 1) {
      return ok(res, []);
    }

    const likeTerm = `%${q}%`;
    const results = db.prepare(`
      SELECT sg.id, sg.title, sg.position, pg.id as goal_id, pg.title as goal_title
      FROM sub_goals sg
      JOIN primary_goals pg ON sg.primary_goal_id = pg.id
      WHERE pg.user_id = ? AND sg.title LIKE ?
      ORDER BY pg.title ASC, sg.position ASC
      LIMIT 20
    `).all(userId, likeTerm);

    ok(res, results);
  } catch (error) {
    serverError(res, error);
  }
});

// Get specific sub-goal with actions
router.get('/:subgoalId', (req: Request, res: Response) => {
  try {
    const subgoalId = req.params.subgoalId as string;
    const userId = req.user!.id;

    const subGoal = ownedSubGoal(subgoalId, userId);

    if (!subGoal) {
      return fail(res, 404, 'Sub-goal not found');
    }

    const actions = db.prepare('SELECT * FROM action_items WHERE sub_goal_id = ? ORDER BY position').all(subgoalId);

    ok(res, { ...subGoal, actions });
  } catch (error) {
    serverError(res, error);
  }
});

// Update sub-goal
router.put('/:subgoalId', (req: Request, res: Response) => {
  try {
    const subgoalId = req.params.subgoalId as string;
    const userId = req.user!.id;
    const { title, description, position } = req.body;

    const existing = ownedSubGoal(subgoalId, userId);

    if (!existing) {
      return fail(res, 404, 'Sub-goal not found');
    }

    const now = new Date().toISOString();

    const stmt = db.prepare(`
      UPDATE sub_goals
      SET title = ?, description = ?, position = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      title ?? existing.title,
      description ?? existing.description,
      position ?? existing.position,
      now, subgoalId
    );

    const updated = db.prepare('SELECT * FROM sub_goals WHERE id = ?').get(subgoalId);

    ok(res, updated);
  } catch (error) {
    serverError(res, error);
  }
});

// Reorder sub-goal positions within a goal using a single statement to avoid uniqueness conflicts
router.post('/:subgoalId/reorder', (req: Request, res: Response) => {
  try {
    const subgoalId = req.params.subgoalId as string;
    const userId = req.user!.id;
    const { targetPosition } = req.body as { targetPosition?: number };

    if (!targetPosition || targetPosition < 1 || targetPosition > 8) {
      return fail(res, 400, 'targetPosition must be 1-8');
    }

    const subGoal = ownedSubGoal(subgoalId, userId);

    if (!subGoal) {
      return fail(res, 404, 'Sub-goal not found');
    }

    if (subGoal.position === targetPosition) {
      return ok(res, subGoal);
    }

    const conflicting = db.prepare(
      'SELECT * FROM sub_goals WHERE primary_goal_id = ? AND position = ?'
    ).get(subGoal.primary_goal_id, targetPosition) as SubGoal | undefined;

    const now = new Date().toISOString();

    const runReorder = db.transaction(() => {
      const sourcePos = subGoal.position;
      const targetPos = targetPosition;

      if (sourcePos === targetPos) {
        return; // No-op
      }

      // Simple swap strategy using position -1 as temporary
      // Step 1: Move source to -1 (temporary position outside normal range)
      db.prepare('UPDATE sub_goals SET position = -1, updated_at = ? WHERE id = ?').run(
        now,
        subGoal.id
      );

      // Step 2: Move target to source's old position (if there's something there)
      if (conflicting) {
        db.prepare('UPDATE sub_goals SET position = ?, updated_at = ? WHERE id = ?').run(
          sourcePos,
          now,
          conflicting.id
        );
      }

      // Step 3: Move source to target position
      db.prepare('UPDATE sub_goals SET position = ?, updated_at = ? WHERE id = ?').run(
        targetPos,
        now,
        subGoal.id
      );
    });

    runReorder();

    const updated = db.prepare('SELECT * FROM sub_goals WHERE id = ?').get(subgoalId);

    ok(res, updated);
  } catch (error) {
    serverError(res, error);
  }
});

// Delete sub-goal
router.delete('/:subgoalId', (req: Request, res: Response) => {
  try {
    const subgoalId = req.params.subgoalId as string;
    const userId = req.user!.id;

    if (!ownedSubGoal(subgoalId, userId)) {
      return fail(res, 404, 'Sub-goal not found');
    }

    const result = db.prepare('DELETE FROM sub_goals WHERE id = ?').run(subgoalId);

    if (result.changes === 0) {
      return fail(res, 404, 'Sub-goal not found');
    }

    ok(res, { deleted: true });
  } catch (error) {
    serverError(res, error);
  }
});

// Get actions for sub-goal
router.get('/:subgoalId/actions', (req: Request, res: Response) => {
  try {
    const subgoalId = req.params.subgoalId as string;
    const userId = req.user!.id;

    if (!ownedSubGoal(subgoalId, userId)) {
      return fail(res, 404, 'Sub-goal not found');
    }

    const actions = db.prepare('SELECT * FROM action_items WHERE sub_goal_id = ? ORDER BY position').all(subgoalId);

    ok(res, actions);
  } catch (error) {
    serverError(res, error);
  }
});

// Create action item
router.post('/:subgoalId/actions', (req: Request, res: Response) => {
  try {
    const subgoalId = req.params.subgoalId as string;
    const userId = req.user!.id;
    const { position, title, description, due_date } = req.body;

    if (!ownedSubGoal(subgoalId, userId)) {
      return fail(res, 404, 'Sub-goal not found');
    }

    if (!title || !position) {
      return fail(res, 400, 'Title and position are required');
    }

    if (position < 1 || position > 8) {
      return fail(res, 400, 'Position must be between 1 and 8');
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO action_items (id, sub_goal_id, position, title, description, due_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, subgoalId, position, title, description || null, due_date || null, now, now);

    const action = db.prepare('SELECT * FROM action_items WHERE id = ?').get(id);

    ok(res, action, 201);
  } catch (error) {
    serverError(res, error);
  }
});

export default router;
