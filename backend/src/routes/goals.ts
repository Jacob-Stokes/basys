import { Router, Request, Response } from 'express';
import { db, PrimaryGoal, SubGoal, ActionItem, ActivityLog } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { goalOwnerCheck } from '../middleware/ownership';

const router = Router();

function getGoalTree(goalId: string, userId?: string | null) {
  const goal = db
    .prepare('SELECT * FROM primary_goals WHERE id = ? AND user_id = ?')
    .get(goalId, userId) as PrimaryGoal | undefined;

  if (!goal) {
    return null;
  }

  const subGoals = db
    .prepare('SELECT * FROM sub_goals WHERE primary_goal_id = ? ORDER BY position')
    .all(goalId) as SubGoal[];

  const subGoalsWithActions = subGoals.map((subGoal) => {
    const actions = db
      .prepare('SELECT * FROM action_items WHERE sub_goal_id = ? ORDER BY position')
      .all(subGoal.id) as ActionItem[];

    return {
      ...subGoal,
      actions: actions.map((action) => {
        const logs = db
          .prepare('SELECT * FROM activity_logs WHERE action_item_id = ? ORDER BY log_date DESC, created_at DESC')
          .all(action.id) as ActivityLog[];
        return { ...action, logs };
      }),
    };
  });

  return {
    ...goal,
    subGoals: subGoalsWithActions,
  };
}

// Get all primary goals (with optional search via ?q=)
router.get('/', (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const q = (req.query.q as string || '').trim();

    let goals;
    if (q) {
      const likeTerm = `%${q}%`;
      goals = db.prepare(`
        SELECT DISTINCT pg.* FROM primary_goals pg
        WHERE pg.user_id = ? AND (
          pg.title LIKE ? OR pg.description LIKE ?
          OR pg.id IN (
            SELECT sg.primary_goal_id FROM sub_goals sg
            WHERE sg.primary_goal_id IN (SELECT id FROM primary_goals WHERE user_id = ?)
              AND sg.title LIKE ?
          )
          OR pg.id IN (
            SELECT sg2.primary_goal_id FROM action_items ai
            JOIN sub_goals sg2 ON ai.sub_goal_id = sg2.id
            WHERE sg2.primary_goal_id IN (SELECT id FROM primary_goals WHERE user_id = ?)
              AND ai.title LIKE ?
          )
        )
        ORDER BY pg.created_at DESC
      `).all(userId, likeTerm, likeTerm, userId, likeTerm, userId, likeTerm);
    } else {
      goals = db.prepare('SELECT * FROM primary_goals WHERE user_id = ? ORDER BY created_at DESC').all(userId);
    }

    res.json({ success: true, data: goals, error: null });
  } catch (error) {
    res.status(500).json({ success: false, data: null, error: (error as Error).message });
  }
});

// Export one or many goals (with sub-goals, actions, logs) as JSON
router.get('/export', (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { goalIds } = req.query;

    let ids: string[] = [];
    if (typeof goalIds === 'string' && goalIds.trim().length > 0) {
      ids = goalIds
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
    } else {
      const rows = db
        .prepare('SELECT id FROM primary_goals WHERE user_id = ? ORDER BY created_at DESC')
        .all(userId) as { id: string }[];
      ids = rows.map((row) => row.id);
    }

    const exported = ids
      .map((id) => getGoalTree(id, userId))
      .filter((goal): goal is NonNullable<ReturnType<typeof getGoalTree>> => Boolean(goal));

    res.json({
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        count: exported.length,
        goals: exported,
      },
      error: null,
    });
  } catch (error) {
    res.status(500).json({ success: false, data: null, error: (error as Error).message });
  }
});

// Import goals from JSON payload produced by the export endpoint
router.post('/import', (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    const extractGoalsArray = (body: any) => {
      if (!body) return null;
      if (Array.isArray(body)) return body;
      if (Array.isArray(body.goals)) return body.goals;
      if (body.data && Array.isArray(body.data.goals)) return body.data.goals;
      return null;
    };

    const incomingGoals = extractGoalsArray(req.body);

    if (!incomingGoals || incomingGoals.length === 0) {
      return res.status(400).json({ success: false, data: null, error: 'No goals found in payload' });
    }

    const stats = {
      goals: 0,
      subGoals: 0,
      actions: 0,
      logs: 0,
      skippedSubGoals: 0,
      skippedActions: 0,
    };

    const insertGoalStmt = db.prepare(`
      INSERT INTO primary_goals (id, user_id, title, description, target_date, status, theme_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertSubGoalStmt = db.prepare(`
      INSERT INTO sub_goals (id, primary_goal_id, position, title, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertActionStmt = db.prepare(`
      INSERT INTO action_items (id, sub_goal_id, position, title, description, completed, completed_at, due_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertLogStmt = db.prepare(`
      INSERT INTO activity_logs (id, action_item_id, log_type, content, log_date, duration_minutes, metric_value, metric_unit, media_url, media_type, external_link, mood, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const clampPosition = (value: any) => {
      const num = Number(value);
      if (Number.isFinite(num) && num >= 1 && num <= 8) {
        return num;
      }
      return null;
    };

    const runImport = db.transaction(() => {
      incomingGoals.forEach((goal: any) => {
        const goalId = uuidv4();
        const createdAt = goal.created_at || new Date().toISOString();
        const updatedAt = goal.updated_at || createdAt;
        insertGoalStmt.run(
          goalId,
          userId,
          goal.title || 'Untitled Goal',
          goal.description || null,
          goal.target_date || null,
          goal.status || 'active',
          goal.theme_json || null,
          createdAt,
          updatedAt
        );
        stats.goals += 1;

        const usedSubGoalPositions = new Set<number>();
        const subGoals = Array.isArray(goal.subGoals) ? goal.subGoals : [];

        subGoals.forEach((subGoal: any, index: number) => {
          const positionCandidate = clampPosition(subGoal.position);
          let position = positionCandidate;
          if (!position || usedSubGoalPositions.has(position)) {
            for (let pos = 1; pos <= 8; pos += 1) {
              if (!usedSubGoalPositions.has(pos)) {
                position = pos;
                break;
              }
            }
          }
          if (!position) {
            stats.skippedSubGoals += 1;
            return;
          }
          usedSubGoalPositions.add(position);

          const subGoalId = uuidv4();
          const sgCreatedAt = subGoal.created_at || createdAt;
          const sgUpdatedAt = subGoal.updated_at || sgCreatedAt;
          insertSubGoalStmt.run(
            subGoalId,
            goalId,
            position,
            subGoal.title || `Sub-goal ${position}`,
            subGoal.description || null,
            sgCreatedAt,
            sgUpdatedAt
          );
          stats.subGoals += 1;

          const usedActionPositions = new Set<number>();
          const actions = Array.isArray(subGoal.actions) ? subGoal.actions : [];
          actions.forEach((action: any) => {
            const actionPositionCandidate = clampPosition(action.position);
            let actionPosition = actionPositionCandidate;
            if (!actionPosition || usedActionPositions.has(actionPosition)) {
              for (let pos = 1; pos <= 8; pos += 1) {
                if (!usedActionPositions.has(pos)) {
                  actionPosition = pos;
                  break;
                }
              }
            }
            if (!actionPosition) {
              stats.skippedActions += 1;
              return;
            }
            usedActionPositions.add(actionPosition);

            const actionId = uuidv4();
            const acCreatedAt = action.created_at || sgCreatedAt;
            const acUpdatedAt = action.updated_at || acCreatedAt;
            insertActionStmt.run(
              actionId,
              subGoalId,
              actionPosition,
              action.title || `Action ${actionPosition}`,
              action.description || null,
              action.completed ? 1 : 0,
              action.completed_at || null,
              action.due_date || null,
              acCreatedAt,
              acUpdatedAt
            );
            stats.actions += 1;

            const logs = Array.isArray(action.logs) ? action.logs : [];
            logs.forEach((log: any) => {
              const logId = uuidv4();
              insertLogStmt.run(
                logId,
                actionId,
                log.log_type || 'note',
                log.content || null,
                log.log_date || new Date().toISOString().split('T')[0],
                log.duration_minutes || null,
                log.metric_value ?? null,
                log.metric_unit || null,
                log.media_url || null,
                log.media_type || null,
                log.external_link || null,
                log.mood || null,
                log.tags || null,
                log.created_at || acCreatedAt,
                log.updated_at || log.created_at || acCreatedAt
              );
              stats.logs += 1;
            });
          });
        });
      });
    });

    runImport();

    res.json({
      success: true,
      data: {
        imported: stats,
      },
      error: null,
    });
  } catch (error) {
    res.status(500).json({ success: false, data: null, error: (error as Error).message });
  }
});

// Get specific goal with full tree
router.get('/:goalId', (req: Request, res: Response) => {
  try {
    const { goalId } = req.params;
    const userId = req.user?.id;

    const goal = db.prepare('SELECT * FROM primary_goals WHERE id = ? AND user_id = ?').get(goalId, userId) as PrimaryGoal | undefined;

    if (!goal) {
      return res.status(404).json({ success: false, data: null, error: 'Goal not found' });
    }

    const subGoals = db.prepare('SELECT * FROM sub_goals WHERE primary_goal_id = ? ORDER BY position').all(goalId) as SubGoal[];

    const goalWithTree = {
      ...goal,
      subGoals: subGoals.map(subGoal => {
        const actions = db.prepare('SELECT * FROM action_items WHERE sub_goal_id = ? ORDER BY position').all(subGoal.id) as ActionItem[];
        return {
          ...subGoal,
          actions
        };
      })
    };

    res.json({ success: true, data: goalWithTree, error: null });
  } catch (error) {
    res.status(500).json({ success: false, data: null, error: (error as Error).message });
  }
});

// Get full tree structure
router.get('/:goalId/tree', (req: Request, res: Response) => {
  try {
    const { goalId } = req.params;
    const userId = req.user?.id;

    const goal = db.prepare('SELECT * FROM primary_goals WHERE id = ? AND user_id = ?').get(goalId, userId) as PrimaryGoal | undefined;

    if (!goal) {
      return res.status(404).json({ success: false, data: null, error: 'Goal not found' });
    }

    const subGoals = db.prepare('SELECT * FROM sub_goals WHERE primary_goal_id = ? ORDER BY position').all(goalId) as SubGoal[];

    const tree = {
      ...goal,
      subGoals: subGoals.map(subGoal => {
        const actions = db.prepare('SELECT * FROM action_items WHERE sub_goal_id = ? ORDER BY position').all(subGoal.id) as ActionItem[];
        return {
          ...subGoal,
          actions
        };
      })
    };

    res.json({ success: true, data: tree, error: null });
  } catch (error) {
    res.status(500).json({ success: false, data: null, error: (error as Error).message });
  }
});

// Create primary goal
router.post('/', (req: Request, res: Response) => {
  try {
    const { title, description, target_date, theme_json } = req.body;
    const userId = req.user?.id;

    if (!title) {
      return res.status(400).json({ success: false, data: null, error: 'Title is required' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO primary_goals (id, user_id, title, description, target_date, theme_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, userId, title, description || null, target_date || null, theme_json || null, now, now);

    const goal = db.prepare('SELECT * FROM primary_goals WHERE id = ?').get(id);

    res.status(201).json({ success: true, data: goal, error: null });
  } catch (error) {
    res.status(500).json({ success: false, data: null, error: (error as Error).message });
  }
});

// Update primary goal (supports partial updates)
router.put('/:goalId', (req: Request, res: Response) => {
  try {
    const { goalId } = req.params;
    const userId = req.user?.id;

    const existing = db.prepare('SELECT * FROM primary_goals WHERE id = ? AND user_id = ?').get(goalId, userId) as PrimaryGoal | undefined;

    if (!existing) {
      return res.status(404).json({ success: false, data: null, error: 'Goal not found' });
    }

    const title = req.body.title ?? existing.title;
    const description = req.body.description ?? existing.description;
    const target_date = req.body.target_date ?? existing.target_date;
    const status = req.body.status ?? existing.status;
    const theme_json = req.body.theme_json !== undefined ? req.body.theme_json : (existing as any).theme_json;
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      UPDATE primary_goals
      SET title = ?, description = ?, target_date = ?, status = ?, theme_json = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(title, description, target_date, status, theme_json, now, goalId);

    const updatedGoal = db.prepare('SELECT * FROM primary_goals WHERE id = ?').get(goalId);

    res.json({ success: true, data: updatedGoal, error: null });
  } catch (error) {
    res.status(500).json({ success: false, data: null, error: (error as Error).message });
  }
});

// Delete primary goal
router.delete('/:goalId', (req: Request, res: Response) => {
  try {
    const { goalId } = req.params;
    const userId = req.user?.id;

    const result = db.prepare('DELETE FROM primary_goals WHERE id = ? AND user_id = ?').run(goalId, userId);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, data: null, error: 'Goal not found' });
    }

    res.json({ success: true, data: { deleted: true }, error: null });
  } catch (error) {
    res.status(500).json({ success: false, data: null, error: (error as Error).message });
  }
});

// Get sub-goals for a primary goal
router.get('/:goalId/subgoals', (req: Request, res: Response) => {
  try {
    const { goalId } = req.params;
    const userId = req.user?.id;

    if (!goalOwnerCheck(goalId, userId!)) {
      return res.status(404).json({ success: false, data: null, error: 'Goal not found' });
    }

    const subGoals = db.prepare('SELECT * FROM sub_goals WHERE primary_goal_id = ? ORDER BY position').all(goalId);

    res.json({ success: true, data: subGoals, error: null });
  } catch (error) {
    res.status(500).json({ success: false, data: null, error: (error as Error).message });
  }
});

// Create sub-goal
router.post('/:goalId/subgoals', (req: Request, res: Response) => {
  try {
    const { goalId } = req.params;
    const userId = req.user?.id;
    const { position, title, description } = req.body;

    if (!goalOwnerCheck(goalId, userId!)) {
      return res.status(404).json({ success: false, data: null, error: 'Goal not found' });
    }

    if (!title || !position) {
      return res.status(400).json({ success: false, data: null, error: 'Title and position are required' });
    }

    if (position < 1 || position > 8) {
      return res.status(400).json({ success: false, data: null, error: 'Position must be between 1 and 8' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO sub_goals (id, primary_goal_id, position, title, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, goalId, position, title, description || null, now, now);

    const subGoal = db.prepare('SELECT * FROM sub_goals WHERE id = ?').get(id);

    res.status(201).json({ success: true, data: subGoal, error: null });
  } catch (error) {
    res.status(500).json({ success: false, data: null, error: (error as Error).message });
  }
});

export default router;
