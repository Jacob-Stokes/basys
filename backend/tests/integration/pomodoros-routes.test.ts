import { beforeEach, describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import pomodorosRouter from '../../src/routes/pomodoros';
import { db } from '../../src/db/database';
import { createAuthedApp, insertRuntimeUser, requestAuthedApp, resetRuntimeDb } from '../helpers/runtimeApp';

describe('Pomodoro routes', () => {
  let user: ReturnType<typeof insertRuntimeUser>;
  let otherUser: ReturnType<typeof insertRuntimeUser>;
  let app: ReturnType<typeof createAuthedApp>;
  let goalId: string;
  let subgoalId: string;
  let foreignGoalId: string;
  let taskId: string;

  beforeEach(() => {
    resetRuntimeDb();
    user = insertRuntimeUser();
    otherUser = insertRuntimeUser({
      username: 'other-pomo-user',
      email: 'other-pomo@example.com',
    });
    app = createAuthedApp(user, [{ basePath: '/api/pomodoros', router: pomodorosRouter }]);

    goalId = uuidv4();
    subgoalId = uuidv4();
    foreignGoalId = uuidv4();
    taskId = uuidv4();

    db.prepare(`
      INSERT INTO primary_goals (id, user_id, title, status, created_at, updated_at)
      VALUES (?, ?, ?, 'active', datetime('now'), datetime('now'))
    `).run(goalId, user.id, 'Own Goal');

    db.prepare(`
      INSERT INTO sub_goals (id, primary_goal_id, position, title, created_at, updated_at)
      VALUES (?, ?, 1, ?, datetime('now'), datetime('now'))
    `).run(subgoalId, goalId, 'Own Subgoal');

    db.prepare(`
      INSERT INTO primary_goals (id, user_id, title, status, created_at, updated_at)
      VALUES (?, ?, ?, 'active', datetime('now'), datetime('now'))
    `).run(foreignGoalId, otherUser.id, 'Foreign Goal');

    db.prepare(`
      INSERT INTO tasks (id, user_id, title, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `).run(taskId, user.id, 'Own Task');
  });

  it('creates a pomodoro linked to a subgoal and auto-links its parent goal', async () => {
    const response = await requestAuthedApp(app, {
      method: 'POST',
      path: '/api/pomodoros',
      body: {
        note: 'Focus block',
        links: [{ target_type: 'subgoal', target_id: subgoalId }],
      },
    });

    expect(response.status).toBe(201);
    expect((response.body as any).success).toBe(true);
    expect((response.body as any).data.links.map((link: { target_type: string }) => link.target_type)).toEqual(
      expect.arrayContaining(['subgoal', 'goal'])
    );
    expect((response.body as any).data.links.find((link: { target_type: string }) => link.target_type === 'goal')?.target_title).toBe('Own Goal');
  });

  it('rejects pomodoro links to another users data', async () => {
    const response = await requestAuthedApp(app, {
      method: 'POST',
      path: '/api/pomodoros',
      body: {
        note: 'Invalid link',
        links: [{ target_type: 'goal', target_id: foreignGoalId }],
      },
    });

    expect(response.status).toBe(400);
    expect((response.body as any).error).toBe('One or more pomodoro links are invalid');
  });

  it('counts only completed pomodoros in stats', async () => {
    const completedId = uuidv4();
    const inProgressId = uuidv4();

    db.prepare(`
      INSERT INTO pomodoro_sessions (id, user_id, started_at, ended_at, duration_minutes, status, created_at)
      VALUES (?, ?, datetime('now'), datetime('now'), 25, 'completed', datetime('now'))
    `).run(completedId, user.id);
    db.prepare(`
      INSERT INTO pomodoro_sessions (id, user_id, started_at, duration_minutes, status, created_at)
      VALUES (?, ?, datetime('now'), 15, 'in_progress', datetime('now'))
    `).run(inProgressId, user.id);

    db.prepare(`
      INSERT INTO pomodoro_links (pomodoro_id, target_type, target_id, created_at)
      VALUES (?, 'task', ?, datetime('now')), (?, 'task', ?, datetime('now'))
    `).run(completedId, taskId, inProgressId, taskId);

    const response = await requestAuthedApp(app, {
      method: 'GET',
      path: '/api/pomodoros/stats',
      query: { target_type: 'task', target_id: taskId },
    });

    expect(response.status).toBe(200);
    expect((response.body as any).data).toEqual({ pomo_count: 1, total_minutes: 25 });
  });
});
