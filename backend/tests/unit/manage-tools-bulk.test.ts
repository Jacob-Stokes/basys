import { beforeEach, describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../src/db/database';
import { CLAUDE_TOOLS, executeToolCall } from '../../src/chat/toolRegistry';
import { createMcpServer } from '../../src/mcp/tools';
import { insertRuntimeUser, resetRuntimeDb } from '../helpers/runtimeApp';

describe('Bulk manage tools', () => {
  let user: ReturnType<typeof insertRuntimeUser>;

  beforeEach(() => {
    resetRuntimeDb();
    user = insertRuntimeUser();
  });

  it('supports bulk create, update, and delete for tasks', () => {
    const created = executeToolCall('manage_task', {
      action: 'bulk_create',
      items: [
        { title: 'First task', priority: 1 },
        { title: 'Second task', priority: 2 },
      ],
    }, user.id) as any;

    expect(created.action).toBe('bulk_create');
    expect(created.count).toBe(2);
    expect(created.results.map((task: { title: string }) => task.title)).toEqual(['First task', 'Second task']);

    const [firstId, secondId] = created.results.map((task: { id: string }) => task.id);

    const updated = executeToolCall('manage_task', {
      action: 'bulk_update',
      items: [
        { task_id: firstId, title: 'First task updated', priority: 4, done: true, is_favorite: true },
        { task_id: secondId, description: 'Expanded notes' },
      ],
    }, user.id) as any;

    expect(updated.count).toBe(2);
    expect(updated.results[0].title).toBe('First task updated');
    expect(updated.results[0].priority).toBe(4);
    expect(updated.results[0].done).toBe(1);
    expect(updated.results[0].is_favorite).toBe(1);
    expect(updated.results[1].description).toBe('Expanded notes');

    const deleted = executeToolCall('manage_task', {
      action: 'bulk_delete',
      items: [
        { task_id: firstId },
        { task_id: secondId },
      ],
    }, user.id) as any;

    expect(deleted.count).toBe(2);
    expect((db.prepare('SELECT COUNT(*) as count FROM tasks WHERE user_id = ?').get(user.id) as { count: number }).count).toBe(0);
  });

  it('supports bulk create and delete for task comments using per-item task ids', () => {
    const taskId = uuidv4();
    db.prepare(`
      INSERT INTO tasks (id, user_id, title, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `).run(taskId, user.id, 'Comment target');

    const created = executeToolCall('manage_task_comment', {
      action: 'bulk_create',
      items: [
        { task_id: taskId, content: 'First comment' },
        { task_id: taskId, content: 'Second comment' },
      ],
    }, user.id) as any;

    expect(created.count).toBe(2);
    expect(created.results.map((comment: { content: string }) => comment.content)).toEqual([
      'First comment',
      'Second comment',
    ]);

    const deleted = executeToolCall('manage_task_comment', {
      action: 'bulk_delete',
      items: created.results.map((comment: { id: string }) => ({
        task_id: taskId,
        comment_id: comment.id,
      })),
    }, user.id) as any;

    expect(deleted.count).toBe(2);
    expect((db.prepare('SELECT COUNT(*) as count FROM task_comments WHERE task_id = ?').get(taskId) as { count: number }).count).toBe(0);
  });

  it('supports bulk add, update, and delete for etiquette rules', () => {
    const created = executeToolCall('manage_etiquette', {
      action: 'bulk_create',
      items: [
        { content: 'Be concise', position: 1 },
        { content: 'Prefer facts', position: 2 },
      ],
    }, user.id) as any;

    expect(created.count).toBe(2);
    expect(created.results.map((rule: { content: string }) => rule.content)).toEqual([
      'Be concise',
      'Prefer facts',
    ]);

    const updated = executeToolCall('manage_etiquette', {
      action: 'bulk_update',
      items: created.results.map((rule: { id: string; content: string }, index: number) => ({
        rule_id: rule.id,
        content: `${rule.content} (${index + 1})`,
      })),
    }, user.id) as any;

    expect(updated.results[0].content).toBe('Be concise (1)');
    expect(updated.results[1].content).toBe('Prefer facts (2)');

    const deleted = executeToolCall('manage_etiquette', {
      action: 'bulk_delete',
      items: created.results.map((rule: { id: string }) => ({ rule_id: rule.id })),
    }, user.id) as any;

    expect(deleted.count).toBe(2);
    expect((db.prepare('SELECT COUNT(*) as count FROM agent_etiquette WHERE user_id = ?').get(user.id) as { count: number }).count).toBe(0);
  });

  it('supports bulk create and revoke for shares and advertises bulk actions in the chat tool schema', () => {
    const goalId = uuidv4();
    db.prepare(`
      INSERT INTO primary_goals (id, user_id, title, status, created_at, updated_at)
      VALUES (?, ?, ?, 'active', datetime('now'), datetime('now'))
    `).run(goalId, user.id, 'Sharable goal');

    const created = executeToolCall('manage_share', {
      action: 'bulk_create',
      items: [
        { goal_id: goalId, show_logs: true },
        { goal_id: goalId, show_guestbook: true },
      ],
    }, user.id) as any;

    expect(created.count).toBe(2);
    expect(created.results.every((share: { goal_id: string }) => share.goal_id === goalId)).toBe(true);

    const deleted = executeToolCall('manage_share', {
      action: 'bulk_delete',
      items: created.results.map((share: { id: string }) => ({ share_id: share.id })),
    }, user.id) as any;

    expect(deleted.count).toBe(2);
    expect((db.prepare('SELECT COUNT(*) as count FROM shared_goals WHERE user_id = ?').get(user.id) as { count: number }).count).toBe(0);

    const manageTaskTool = CLAUDE_TOOLS.find(tool => tool.name === 'manage_task');
    expect(manageTaskTool?.input_schema.properties.action.enum).toEqual(
      expect.arrayContaining(['bulk_create', 'bulk_update', 'bulk_delete'])
    );
    expect(manageTaskTool?.input_schema.properties.items).toBeDefined();
    expect(manageTaskTool?.input_schema.properties.task_id).toBeDefined();
    expect(manageTaskTool?.input_schema.properties.taskId).toBeUndefined();
  });

  it('returns assigned labels in the task create response', () => {
    const labelId = uuidv4();
    db.prepare(`
      INSERT INTO labels (id, user_id, title, hex_color, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(labelId, user.id, 'Urgent', '#ff0000');

    const created = executeToolCall('manage_task', {
      action: 'create',
      title: 'Labelled task',
      labels: [labelId],
    }, user.id) as any;

    expect(created.labels).toEqual([
      expect.objectContaining({ id: labelId, title: 'Urgent' }),
    ]);
  });

  it('allows sprint status to be set during creation', () => {
    const projectId = uuidv4();
    db.prepare(`
      INSERT INTO projects (id, user_id, title, type, created_at, updated_at)
      VALUES (?, ?, ?, 'personal', datetime('now'), datetime('now'))
    `).run(projectId, user.id, 'Sprint project');

    const created = executeToolCall('manage_sprint', {
      action: 'create',
      project_id: projectId,
      title: 'Active sprint',
      status: 'active',
    }, user.id) as any;

    expect(created.status).toBe('active');
  });

  it('accepts JSON-stringified bulk comment items in the MCP schema and exposes explicit snake_case item fields', async () => {
    const server = createMcpServer() as any;
    const schema = server._registeredTools.manage_task_comment.inputSchema;

    const parsed = await schema.safeParseAsync({
      action: 'bulk_create',
      items: JSON.stringify([
        { task_id: 'task-1', content: 'First' },
        { task_id: 'task-1', content: 'Second' },
      ]),
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.items).toEqual([
      { task_id: 'task-1', content: 'First' },
      { task_id: 'task-1', content: 'Second' },
    ]);
  });
});
