import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { ok, fail, serverError } from '../utils/response';

const router = Router();

// GET / — Universal search across entity types
router.get('/', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const q = (req.query.q as string || '').trim();
    if (!q) return ok(res, { projects: [], sprints: [], tasks: [], goals: [], subgoals: [], habits: [] });

    const term = `%${q}%`;
    const limit = 5;

    const projects = db.prepare(`
      SELECT id, title, hex_color, project_mode, type FROM projects
      WHERE user_id = ? AND (title LIKE ? OR description LIKE ?) AND archived = 0
      ORDER BY title ASC LIMIT ?
    `).all(userId, term, term, limit);

    const sprints = db.prepare(`
      SELECT s.id, s.title, s.status, s.project_id, p.title as project_title, p.hex_color as project_color
      FROM sprints s JOIN projects p ON s.project_id = p.id
      WHERE p.user_id = ? AND s.title LIKE ?
      ORDER BY s.title ASC LIMIT ?
    `).all(userId, term, limit);

    const tasks = db.prepare(`
      SELECT t.id, t.title, t.done, t.project_id, p.title as project_title
      FROM tasks t LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.user_id = ? AND t.title LIKE ?
      ORDER BY t.done ASC, t.title ASC LIMIT ?
    `).all(userId, term, limit);

    const goals = db.prepare(`
      SELECT id, title, status FROM primary_goals
      WHERE user_id = ? AND title LIKE ?
      ORDER BY title ASC LIMIT ?
    `).all(userId, term, limit);

    const subgoals = db.prepare(`
      SELECT sg.id, sg.title, sg.position, pg.id as goal_id, pg.title as goal_title
      FROM sub_goals sg JOIN primary_goals pg ON sg.goal_id = pg.id
      WHERE pg.user_id = ? AND sg.title LIKE ?
      ORDER BY sg.title ASC LIMIT ?
    `).all(userId, term, limit);

    const habits = db.prepare(`
      SELECT id, title, emoji, type FROM habits
      WHERE user_id = ? AND title LIKE ? AND archived = 0
      ORDER BY title ASC LIMIT ?
    `).all(userId, term, limit);

    ok(res, { projects, sprints, tasks, goals, subgoals, habits });
  } catch (error) {
    serverError(res, error);
  }
});

// GET /children — Drill-down children of an entity
router.get('/children', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const { type, id } = req.query;
    if (!type || !id) return fail(res, 400, 'type and id required');

    let children: any[] = [];

    if (type === 'project') {
      // Project children: sprints/sections
      children = db.prepare(`
        SELECT s.id, s.title, s.status, s.sprint_number, 'sprint' as entity_type
        FROM sprints s JOIN projects p ON s.project_id = p.id
        WHERE s.project_id = ? AND p.user_id = ?
        ORDER BY s.sprint_number DESC
      `).all(id, userId);
      // Also include direct project tasks (no sprint)
      const tasks = db.prepare(`
        SELECT t.id, t.title, t.done, 'task' as entity_type
        FROM tasks t WHERE t.project_id = ? AND t.sprint_id IS NULL AND t.user_id = ?
        ORDER BY t.done ASC, t.position ASC LIMIT 20
      `).all(id, userId);
      children = [...children, ...tasks];
    } else if (type === 'sprint') {
      // Sprint children: tasks
      children = db.prepare(`
        SELECT t.id, t.title, t.done, 'task' as entity_type
        FROM tasks t JOIN sprints s ON t.sprint_id = s.id JOIN projects p ON s.project_id = p.id
        WHERE t.sprint_id = ? AND p.user_id = ?
        ORDER BY t.done ASC, t.position ASC LIMIT 30
      `).all(id, userId);
    } else if (type === 'goal') {
      // Goal children: subgoals
      children = db.prepare(`
        SELECT sg.id, sg.title, sg.position, 'subgoal' as entity_type
        FROM sub_goals sg JOIN primary_goals pg ON sg.goal_id = pg.id
        WHERE sg.goal_id = ? AND pg.user_id = ?
        ORDER BY sg.position ASC
      `).all(id, userId);
    }

    ok(res, children);
  } catch (error) {
    serverError(res, error);
  }
});

export default router;
