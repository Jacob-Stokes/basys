import { beforeEach, describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import searchRouter from '../../src/routes/search';
import { db } from '../../src/db/database';
import { createAuthedApp, insertRuntimeUser, requestAuthedApp, resetRuntimeDb } from '../helpers/runtimeApp';

describe('Search routes', () => {
  let user: ReturnType<typeof insertRuntimeUser>;
  let otherUser: ReturnType<typeof insertRuntimeUser>;
  let app: ReturnType<typeof createAuthedApp>;
  let projectId: string;

  beforeEach(() => {
    resetRuntimeDb();
    user = insertRuntimeUser();
    otherUser = insertRuntimeUser({
      username: 'other-search-user',
      email: 'other-search@example.com',
    });
    app = createAuthedApp(user, [{ basePath: '/api/search', router: searchRouter }]);

    projectId = uuidv4();
    const otherProjectId = uuidv4();
    const sprintId = uuidv4();
    const ownGoalId = uuidv4();
    const ownSubgoalId = uuidv4();

    db.prepare(`
      INSERT INTO projects (id, user_id, title, description, type, project_mode, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'personal', 'simple', datetime('now'), datetime('now'))
    `).run(projectId, user.id, 'Alpha Project', 'Alpha desc');

    db.prepare(`
      INSERT INTO projects (id, user_id, title, description, type, project_mode, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'personal', 'simple', datetime('now'), datetime('now'))
    `).run(otherProjectId, otherUser.id, 'Alpha Foreign Project', 'Should not leak');

    db.prepare(`
      INSERT INTO sprints (id, project_id, title, status, sprint_number, created_at, updated_at)
      VALUES (?, ?, ?, 'planned', 1, datetime('now'), datetime('now'))
    `).run(sprintId, projectId, 'Alpha Sprint');

    db.prepare(`
      INSERT INTO tasks (id, user_id, project_id, title, done, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, datetime('now'), datetime('now'))
    `).run(uuidv4(), user.id, projectId, 'Alpha Task');

    db.prepare(`
      INSERT INTO tasks (id, user_id, project_id, title, done, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, datetime('now'), datetime('now'))
    `).run(uuidv4(), user.id, projectId, 'Backlog Alpha');

    db.prepare(`
      INSERT INTO tasks (id, user_id, project_id, title, done, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, datetime('now'), datetime('now'))
    `).run(uuidv4(), otherUser.id, otherProjectId, 'Alpha Foreign Task');

    db.prepare(`
      INSERT INTO primary_goals (id, user_id, title, status, created_at, updated_at)
      VALUES (?, ?, ?, 'active', datetime('now'), datetime('now'))
    `).run(ownGoalId, user.id, 'Alpha Goal');

    db.prepare(`
      INSERT INTO sub_goals (id, primary_goal_id, position, title, created_at, updated_at)
      VALUES (?, ?, 1, ?, datetime('now'), datetime('now'))
    `).run(ownSubgoalId, ownGoalId, 'Alpha Subgoal');

    db.prepare(`
      INSERT INTO habits (id, user_id, title, emoji, type, archived, created_at, updated_at)
      VALUES (?, ?, ?, '🔥', 'habit', 0, datetime('now'), datetime('now'))
    `).run(uuidv4(), user.id, 'Alpha Habit');

    db.prepare(`
      INSERT INTO contacts (id, user_id, name, archived, created_at, updated_at)
      VALUES (?, ?, ?, 0, datetime('now'), datetime('now'))
    `).run(uuidv4(), user.id, 'Alpha Contact');
  });

  it('returns only the authenticated users matching entities, including contacts', async () => {
    const response = await requestAuthedApp(app, {
      method: 'GET',
      path: '/api/search',
      query: { q: 'Alpha' },
    });

    expect(response.status).toBe(200);
    expect((response.body as any).success).toBe(true);
    expect((response.body as any).data.projects).toHaveLength(1);
    expect((response.body as any).data.projects[0].title).toBe('Alpha Project');
    expect((response.body as any).data.tasks.map((task: { title: string }) => task.title)).toContain('Alpha Task');
    expect((response.body as any).data.goals[0].title).toBe('Alpha Goal');
    expect((response.body as any).data.subgoals[0].title).toBe('Alpha Subgoal');
    expect((response.body as any).data.habits[0].title).toBe('Alpha Habit');
    expect((response.body as any).data.contacts[0].title).toBe('Alpha Contact');
  });

  it('returns project children as own sprints plus own backlog tasks', async () => {
    const response = await requestAuthedApp(app, {
      method: 'GET',
      path: '/api/search/children',
      query: { type: 'project', id: projectId },
    });

    expect(response.status).toBe(200);
    expect((response.body as any).success).toBe(true);
    expect((response.body as any).data.map((item: { entity_type: string }) => item.entity_type)).toEqual(
      expect.arrayContaining(['sprint', 'task'])
    );
    expect((response.body as any).data.every((item: { title: string }) => !item.title.includes('Foreign'))).toBe(true);
  });
});
