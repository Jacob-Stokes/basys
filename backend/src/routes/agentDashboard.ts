import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { ok, serverError } from '../utils/response';

const router = Router();

// GET /dashboard — Aggregate stats + recent actions across all projects
router.get('/dashboard', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { status, project_id, agent_model, date_from, date_to, limit: limitStr } = req.query as Record<string, string>;
    const limit = parseInt(limitStr) || 50;

    // Build WHERE clause
    const conditions: string[] = ['aa.user_id = ?'];
    const params: any[] = [userId];

    if (status) { conditions.push('aa.status = ?'); params.push(status); }
    if (project_id) { conditions.push('t.project_id = ?'); params.push(project_id); }
    if (agent_model) { conditions.push('aa.agent_model = ?'); params.push(agent_model); }
    if (date_from) { conditions.push('aa.created_at >= ?'); params.push(date_from); }
    if (date_to) { conditions.push('aa.created_at <= ?'); params.push(date_to); }

    const where = conditions.join(' AND ');

    // Get recent actions with task/project context
    const actions = db.prepare(`
      SELECT aa.*,
        t.title as task_title,
        p.title as project_title,
        p.hex_color as project_color
      FROM agent_actions aa
      LEFT JOIN tasks t ON aa.task_id = t.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE ${where}
      ORDER BY aa.updated_at DESC
      LIMIT ?
    `).all(...params, limit);

    // Aggregate stats (same filter)
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN aa.status = 'done' THEN 1 ELSE 0 END) as done,
        SUM(CASE WHEN aa.status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN aa.status = 'running' THEN 1 ELSE 0 END) as running,
        SUM(CASE WHEN aa.status = 'staged' THEN 1 ELSE 0 END) as staged,
        SUM(CASE WHEN aa.status = 'draft' THEN 1 ELSE 0 END) as draft,
        SUM(COALESCE(aa.cost_cents, 0)) as total_cost_cents,
        SUM(COALESCE(aa.tokens_in, 0)) as total_tokens_in,
        SUM(COALESCE(aa.tokens_out, 0)) as total_tokens_out,
        AVG(CASE
          WHEN aa.completed_at IS NOT NULL AND aa.started_at IS NOT NULL
          THEN (julianday(aa.completed_at) - julianday(aa.started_at)) * 86400
          ELSE NULL
        END) as avg_duration_seconds
      FROM agent_actions aa
      LEFT JOIN tasks t ON aa.task_id = t.id
      WHERE ${where}
    `).get(...params) as any;

    // Distinct models used
    const models = db.prepare(`
      SELECT DISTINCT aa.agent_model FROM agent_actions aa
      LEFT JOIN tasks t ON aa.task_id = t.id
      WHERE ${where} AND aa.agent_model IS NOT NULL
    `).all(...params).map((r: any) => r.agent_model);

    // Projects with actions
    const projects = db.prepare(`
      SELECT DISTINCT p.id, p.title, p.hex_color
      FROM agent_actions aa
      JOIN tasks t ON aa.task_id = t.id
      JOIN projects p ON t.project_id = p.id
      WHERE aa.user_id = ?
    `).all(userId);

    ok(res, { actions, stats, models, projects });
  } catch (error) {
    serverError(res, error);
  }
});

export default router;
