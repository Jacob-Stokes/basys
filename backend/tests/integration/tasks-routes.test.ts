import { beforeEach, describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import tasksRouter from '../../src/routes/tasks';
import projectsRouter from '../../src/routes/projects';
import { db } from '../../src/db/database';
import { createAuthedApp, insertRuntimeUser, requestAuthedApp, resetRuntimeDb } from '../helpers/runtimeApp';

describe('Task routes', () => {
  let user: ReturnType<typeof insertRuntimeUser>;
  let otherUser: ReturnType<typeof insertRuntimeUser>;
  let app: ReturnType<typeof createAuthedApp>;
  let ownProjectId: string;
  let foreignProjectId: string;
  let ownGoalId: string;
  let foreignGoalId: string;
  let ownLabelId: string;

  beforeEach(() => {
    resetRuntimeDb();
    user = insertRuntimeUser();
    otherUser = insertRuntimeUser({
      username: 'other-user',
      email: 'other@example.com',
    });
    app = createAuthedApp(user, [
      { basePath: '/api/tasks', router: tasksRouter },
      { basePath: '/api/projects', router: projectsRouter },
    ]);

    ownProjectId = uuidv4();
    foreignProjectId = uuidv4();
    ownGoalId = uuidv4();
    foreignGoalId = uuidv4();
    ownLabelId = uuidv4();

    db.prepare(`
      INSERT INTO projects (id, user_id, title, type, project_mode, created_at, updated_at)
      VALUES (?, ?, ?, 'personal', 'simple', datetime('now'), datetime('now'))
    `).run(ownProjectId, user.id, 'Own Project');

    db.prepare(`
      INSERT INTO projects (id, user_id, title, type, project_mode, created_at, updated_at)
      VALUES (?, ?, ?, 'personal', 'simple', datetime('now'), datetime('now'))
    `).run(foreignProjectId, otherUser.id, 'Foreign Project');

    db.prepare(`
      INSERT INTO primary_goals (id, user_id, title, status, created_at, updated_at)
      VALUES (?, ?, ?, 'active', datetime('now'), datetime('now'))
    `).run(ownGoalId, user.id, 'Own Goal');

    db.prepare(`
      INSERT INTO primary_goals (id, user_id, title, status, created_at, updated_at)
      VALUES (?, ?, ?, 'active', datetime('now'), datetime('now'))
    `).run(foreignGoalId, otherUser.id, 'Foreign Goal');

    db.prepare(`
      INSERT INTO labels (id, user_id, title, hex_color, created_at, updated_at)
      VALUES (?, ?, ?, '#ff0000', datetime('now'), datetime('now'))
    `).run(ownLabelId, user.id, 'Urgent');
  });

  it('creates a task with validated labels and links', async () => {
    const response = await requestAuthedApp(app, {
      method: 'POST',
      path: '/api/tasks',
      body: {
        title: 'Ship tests',
        project_id: ownProjectId,
        labels: [ownLabelId],
        links: [{ target_type: 'goal', target_id: ownGoalId }],
      },
    });

    expect(response.status).toBe(201);
    expect((response.body as any).success).toBe(true);
    expect((response.body as any).data.project.id).toBe(ownProjectId);
    expect((response.body as any).data.labels).toHaveLength(1);
    expect((response.body as any).data.labels[0].id).toBe(ownLabelId);
    expect((response.body as any).data.links).toHaveLength(1);
    expect((response.body as any).data.links[0].target_title).toBe('Own Goal');
  });

  it('rejects moving a task into another users project', async () => {
    const taskId = uuidv4();
    db.prepare(`
      INSERT INTO tasks (id, user_id, project_id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(taskId, user.id, ownProjectId, 'Keep isolated');

    const response = await requestAuthedApp(app, {
      method: 'PUT',
      path: `/api/tasks/${taskId}`,
      body: { project_id: foreignProjectId },
    });

    expect(response.status).toBe(400);
    expect((response.body as any).error).toBe('Project not found');
  });

  it('rejects linking a task to another users goal', async () => {
    const taskId = uuidv4();
    db.prepare(`
      INSERT INTO tasks (id, user_id, title, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `).run(taskId, user.id, 'Keep isolated');

    const response = await requestAuthedApp(app, {
      method: 'POST',
      path: `/api/tasks/${taskId}/links`,
      body: { target_type: 'goal', target_id: foreignGoalId },
    });

    expect(response.status).toBe(400);
    expect((response.body as any).error).toBe('goal not found');
  });

  it('reschedules repeating tasks using seconds instead of completing them', async () => {
    const taskId = uuidv4();
    db.prepare(`
      INSERT INTO tasks (id, user_id, title, due_date, repeat_after, done, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
    `).run(taskId, user.id, 'Daily task', '2026-03-12T10:00:00', 86400);

    const response = await requestAuthedApp(app, {
      method: 'PATCH',
      path: `/api/tasks/${taskId}/done`,
      body: {},
    });

    expect(response.status).toBe(200);
    expect((response.body as any).success).toBe(true);
    expect((response.body as any).data.done).toBe(0);
    expect((response.body as any).data.due_date).toBe('2026-03-13T10:00:00');
  });

  it('does not count another users corrupted task rows in project stats', async () => {
    db.prepare(`
      INSERT INTO tasks (id, user_id, project_id, title, done, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, datetime('now'), datetime('now'))
    `).run(uuidv4(), otherUser.id, ownProjectId, 'Foreign task');

    const response = await requestAuthedApp(app, {
      method: 'GET',
      path: '/api/projects',
    });

    expect(response.status).toBe(200);
    expect((response.body as any).success).toBe(true);
    expect((response.body as any).data).toHaveLength(1);
    expect((response.body as any).data[0].open_tasks).toBe(0);
  });
});
