import { beforeEach, describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../src/db/database';
import { CLAUDE_TOOLS, executeToolCall } from '../../src/chat/toolRegistry';
import { createMcpServer } from '../../src/mcp/tools';
import { insertRuntimeUser, resetRuntimeDb } from '../helpers/runtimeApp';

describe('Manage tool verbosity', () => {
  let user: ReturnType<typeof insertRuntimeUser>;

  beforeEach(() => {
    resetRuntimeDb();
    user = insertRuntimeUser();
  });

  it('returns task list summary rows and full rows with comments', () => {
    const projectId = uuidv4();
    const taskId = uuidv4();
    const commentId = uuidv4();

    db.prepare(`
      INSERT INTO projects (id, user_id, title, type, created_at, updated_at)
      VALUES (?, ?, ?, 'dev', datetime('now'), datetime('now'))
    `).run(projectId, user.id, 'Alpha');

    db.prepare(`
      INSERT INTO tasks (id, user_id, project_id, title, description, priority, due_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(taskId, user.id, projectId, 'Ship API', 'Long description', 3, '2026-03-20');

    db.prepare(`
      INSERT INTO task_comments (id, task_id, user_id, content, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(commentId, taskId, user.id, 'Need docs');

    const summary = executeToolCall('manage_task', {
      action: 'list',
      verbosity: 'summary',
    }, user.id) as any[];

    expect(summary).toEqual([
      {
        id: taskId,
        title: 'Ship API',
        done: 0,
        priority: 3,
        due_date: '2026-03-20',
        bucket_id: null,
        project_id: projectId,
        project_title: 'Alpha',
      },
    ]);

    const full = executeToolCall('manage_task', {
      action: 'list',
      verbosity: 'full',
    }, user.id) as any[];

    expect(full[0].comments).toEqual([
      expect.objectContaining({ id: commentId, content: 'Need docs' }),
    ]);
    expect(full[0].labels).toEqual([]);
    expect(full[0].links).toEqual([]);
  });

  it('returns habit summary rows without extra fields', () => {
    const habit = executeToolCall('manage_habit', {
      action: 'create',
      title: 'Walk',
      emoji: 'W',
      frequency: 'weekly',
    }, user.id) as any;

    db.prepare(`
      INSERT INTO habit_logs (id, habit_id, log_date)
      VALUES (?, ?, ?)
    `).run(uuidv4(), habit.id, '2026-03-14');

    const summary = executeToolCall('manage_habit', {
      action: 'list',
      verbosity: 'summary',
    }, user.id) as any[];

    expect(summary).toEqual([
      {
        id: habit.id,
        title: 'Walk',
        emoji: 'W',
        type: 'habit',
        total_logs: 1,
        last_logged: '2026-03-14',
      },
    ]);
  });

  it('returns summary projects with nested summary sprints and columns', () => {
    const projectId = uuidv4();
    db.prepare(`
      INSERT INTO projects (id, user_id, title, type, hex_color, created_at, updated_at)
      VALUES (?, ?, ?, 'dev', '#123456', datetime('now'), datetime('now'))
    `).run(projectId, user.id, 'Basys');

    const sprint = executeToolCall('manage_sprint', {
      action: 'create',
      project_id: projectId,
      title: 'Sprint 3',
      status: 'active',
    }, user.id) as any;

    db.prepare(`
      INSERT INTO tasks (id, user_id, project_id, sprint_id, bucket_id, title, done, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
    `).run(uuidv4(), user.id, projectId, sprint.id, sprint.columns[0].id, 'Implement verbosity');

    const projects = executeToolCall('manage_project', {
      action: 'list',
      verbosity: 'summary',
      include_sprints: true,
    }, user.id) as any[];

    expect(projects).toHaveLength(1);
    expect(projects[0]).toEqual(expect.objectContaining({
      id: projectId,
      title: 'Basys',
      type: 'dev',
      hex_color: '#123456',
      open_tasks: 1,
      done_tasks: 0,
      sprints: [
        expect.objectContaining({
          id: sprint.id,
          title: 'Sprint 3',
          sprint_number: 1,
          status: 'active',
          open_tasks: 1,
          done_tasks: 0,
          columns: expect.arrayContaining([
            expect.objectContaining({ title: 'In Progress', bucket_type: 'in_progress' }),
          ]),
        }),
      ],
    }));
    expect(projects[0]).not.toHaveProperty('view_settings');
    expect(projects[0]).not.toHaveProperty('default_columns');
  });

  it('returns summary sprints with nested columns when requested and exposes schema params', async () => {
    const projectId = uuidv4();
    db.prepare(`
      INSERT INTO projects (id, user_id, title, type, created_at, updated_at)
      VALUES (?, ?, ?, 'dev', datetime('now'), datetime('now'))
    `).run(projectId, user.id, 'Workspace');

    const sprint = executeToolCall('manage_sprint', {
      action: 'create',
      project_id: projectId,
      title: 'Sprint A',
    }, user.id) as any;

    const sprints = executeToolCall('manage_sprint', {
      action: 'list',
      project_id: projectId,
      verbosity: 'summary',
      include_columns: true,
    }, user.id) as any[];

    expect(sprints).toEqual([
      expect.objectContaining({
        id: sprint.id,
        title: 'Sprint A',
        sprint_number: 1,
        status: 'planned',
        columns: expect.arrayContaining([
          expect.objectContaining({ title: 'Done', bucket_type: 'done' }),
        ]),
      }),
    ]);
    expect(sprints[0]).not.toHaveProperty('description');

    const manageProjectTool = CLAUDE_TOOLS.find(tool => tool.name === 'manage_project');
    const manageSprintTool = CLAUDE_TOOLS.find(tool => tool.name === 'manage_sprint');
    const manageTaskTool = CLAUDE_TOOLS.find(tool => tool.name === 'manage_task');
    const manageHabitTool = CLAUDE_TOOLS.find(tool => tool.name === 'manage_habit');

    expect(manageProjectTool?.input_schema.properties.verbosity).toBeDefined();
    expect(manageProjectTool?.input_schema.properties.include_sprints).toBeDefined();
    expect(manageSprintTool?.input_schema.properties.verbosity).toBeDefined();
    expect(manageSprintTool?.input_schema.properties.include_columns).toBeDefined();
    expect(manageTaskTool?.input_schema.properties.verbosity).toBeDefined();
    expect(manageHabitTool?.input_schema.properties.verbosity).toBeDefined();

    const server = createMcpServer() as any;
    const parsed = await server._registeredTools.manage_project.inputSchema.safeParseAsync({
      action: 'list',
      verbosity: 'summary',
      include_sprints: true,
    });

    expect(parsed.success).toBe(true);
  });
});
