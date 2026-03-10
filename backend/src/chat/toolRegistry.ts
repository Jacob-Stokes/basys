/**
 * Tool registry for the AI chat sidebar.
 * Adapts the 22 MCP tools + 2 memory tools for Claude API tool_use format.
 * Each tool handler takes (args, userId) directly (no MCP wrapper).
 */

import { v4 as uuidv4 } from 'uuid';
import { db, PrimaryGoal, SubGoal, ActionItem, AgentEtiquette } from '../db/database';
import { buildGoalTree } from '../utils/goalTree';
import { seedDefaultEtiquette } from '../utils/etiquette';
import {
  ownedGoal, goalOwnerCheck, ownedSubGoal, ownedAction, ownedLog, actionOwnerCheck
} from '../middleware/ownership';

// Claude API tool format
interface ClaudeTool {
  name: string;
  description: string;
  input_schema: Record<string, any>;
}

type ToolHandler = (args: any, userId: string) => any;

const toolHandlers: Record<string, ToolHandler> = {};

function registerTool(name: string, handler: ToolHandler) {
  toolHandlers[name] = handler;
}

// ─── TOOL DEFINITIONS (Claude API format) ─────────────────────────

export const CLAUDE_TOOLS: ClaudeTool[] = [
  // ═══ GOALS ═══
  {
    name: 'get_overview',
    description: 'Get a full overview: goals, sub-goals, actions, stats, and etiquette rules.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_summary',
    description: 'Fetch goal summary tree at varying detail levels.',
    input_schema: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['minimal', 'standard', 'detailed', 'full'], description: 'Detail level (default: standard)' },
        includeLogs: { type: 'boolean', description: 'Include recent action logs (only with level=full)' },
        includeGuestbook: { type: 'boolean', description: 'Include guestbook comments' },
      },
    },
  },
  {
    name: 'list_goals',
    description: 'List all primary goals.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'upsert_goal',
    description: 'Create or update a primary goal. Omit goalId to create.',
    input_schema: {
      type: 'object',
      properties: {
        goalId: { type: 'string', description: 'Goal ID (omit to create)' },
        title: { type: 'string', description: 'Goal title' },
        description: { type: 'string' },
        status: { type: 'string', enum: ['active', 'completed', 'archived'] },
        target_date: { type: 'string', description: 'ISO date' },
      },
      required: ['title'],
    },
  },
  {
    name: 'upsert_subgoal',
    description: 'Create or update a sub-goal. Omit subGoalId to create (requires goalId + position).',
    input_schema: {
      type: 'object',
      properties: {
        subGoalId: { type: 'string' },
        goalId: { type: 'string', description: 'Required for create' },
        title: { type: 'string' },
        description: { type: 'string' },
        position: { type: 'number', description: '1-8' },
      },
      required: ['title'],
    },
  },
  {
    name: 'upsert_action',
    description: 'Create or update an action item. Omit actionId to create (requires subGoalId + position).',
    input_schema: {
      type: 'object',
      properties: {
        actionId: { type: 'string' },
        subGoalId: { type: 'string', description: 'Required for create' },
        title: { type: 'string' },
        description: { type: 'string' },
        position: { type: 'number', description: '1-8' },
        due_date: { type: 'string' },
        completed: { type: 'boolean' },
      },
      required: ['title'],
    },
  },
  {
    name: 'upsert_action_log',
    description: 'Create or update an activity log entry.',
    input_schema: {
      type: 'object',
      properties: {
        logId: { type: 'string' },
        actionId: { type: 'string', description: 'Required for create' },
        logType: { type: 'string', enum: ['note', 'progress', 'completion', 'media', 'link'] },
        content: { type: 'string' },
        logDate: { type: 'string', description: 'ISO date (defaults to today)' },
        metricValue: { type: 'number' },
        metricUnit: { type: 'string' },
        mood: { type: 'string', enum: ['motivated', 'challenged', 'accomplished', 'frustrated', 'neutral'] },
      },
      required: ['logType', 'content'],
    },
  },
  {
    name: 'post_guestbook_entry',
    description: 'Leave an encouragement note on a goal, sub-goal, or action.',
    input_schema: {
      type: 'object',
      properties: {
        agentName: { type: 'string' },
        comment: { type: 'string' },
        targetType: { type: 'string', enum: ['user', 'goal', 'subgoal', 'action'] },
        targetId: { type: 'string' },
      },
      required: ['agentName', 'comment', 'targetType'],
    },
  },
  {
    name: 'reorder_subgoal',
    description: 'Move a sub-goal to a new position (1-8).',
    input_schema: {
      type: 'object',
      properties: {
        subGoalId: { type: 'string' },
        targetPosition: { type: 'number' },
      },
      required: ['subGoalId', 'targetPosition'],
    },
  },
  {
    name: 'reorder_action',
    description: 'Move an action to a new position (1-8) within its sub-goal.',
    input_schema: {
      type: 'object',
      properties: {
        actionId: { type: 'string' },
        targetPosition: { type: 'number' },
      },
      required: ['actionId', 'targetPosition'],
    },
  },
  {
    name: 'delete_resource',
    description: 'Delete a resource by type and ID.',
    input_schema: {
      type: 'object',
      properties: {
        resourceType: { type: 'string', enum: ['goal', 'subgoal', 'action', 'log', 'guestbook'] },
        resourceId: { type: 'string' },
      },
      required: ['resourceType', 'resourceId'],
    },
  },
  // ═══ HABITS ═══
  {
    name: 'manage_habit',
    description: 'List, create, update, or delete habits. Use action="list" for all habits with streak stats.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'create', 'update', 'delete'] },
        habitId: { type: 'string' },
        title: { type: 'string' },
        emoji: { type: 'string' },
        type: { type: 'string', enum: ['habit', 'quit'] },
        frequency: { type: 'string', enum: ['daily', 'weekly'] },
        quit_date: { type: 'string' },
        subgoal_id: { type: 'string' },
        archived: { type: 'boolean' },
        include_archived: { type: 'boolean' },
      },
      required: ['action'],
    },
  },
  {
    name: 'log_habit',
    description: 'Log a habit completion, remove a log, or get calendar/stats.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['log', 'unlog', 'calendar'] },
        habitId: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD (defaults to today)' },
        note: { type: 'string' },
        year: { type: 'number' },
        month: { type: 'number' },
      },
      required: ['action', 'habitId'],
    },
  },
  // ═══ TASKS ═══
  {
    name: 'manage_task',
    description: 'List, create, update, delete tasks, or toggle done/favorite. Supports filters.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'create', 'update', 'delete', 'toggle_done', 'toggle_favorite'] },
        taskId: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        project_id: { type: 'string' },
        priority: { type: 'number', description: '0=none, 1=low, 2=medium, 3=high, 4=urgent' },
        due_date: { type: 'string' },
        labels: { type: 'array', items: { type: 'string' }, description: 'Array of label IDs' },
        links: { type: 'array', items: { type: 'object', properties: { target_type: { type: 'string' }, target_id: { type: 'string' } } } },
        filter_done: { type: 'boolean' },
        filter_priority: { type: 'number' },
        filter_project: { type: 'string' },
        filter_label: { type: 'string' },
        filter_favorite: { type: 'boolean' },
        search: { type: 'string' },
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_task_comment',
    description: 'List, add, or delete comments on a task.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'create', 'delete'] },
        taskId: { type: 'string' },
        commentId: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['action', 'taskId'],
    },
  },
  // ═══ PROJECTS & LABELS ═══
  {
    name: 'manage_project',
    description: 'List, create, update, delete, archive, or favorite projects.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'create', 'update', 'delete', 'toggle_archive', 'toggle_favorite'] },
        projectId: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        hex_color: { type: 'string' },
        parent_project_id: { type: 'string' },
        include_tasks: { type: 'boolean' },
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_label',
    description: 'List, create, update, or delete labels (color-coded task tags).',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'create', 'update', 'delete'] },
        labelId: { type: 'string' },
        title: { type: 'string' },
        hex_color: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['action'],
    },
  },
  // ═══ POMODORO ═══
  {
    name: 'manage_pomodoro',
    description: 'List, create, update, complete, or delete pomodoro sessions.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'create', 'update', 'complete', 'delete'] },
        pomodoroId: { type: 'string' },
        duration_minutes: { type: 'number' },
        note: { type: 'string' },
        task_id: { type: 'string' },
        status: { type: 'string', enum: ['completed', 'cancelled', 'in_progress'] },
        limit: { type: 'number' },
      },
      required: ['action'],
    },
  },
  // ═══ SHARING ═══
  {
    name: 'manage_share',
    description: 'Create, list, or revoke share links for goals.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'create', 'revoke'] },
        shareId: { type: 'string' },
        goalId: { type: 'string' },
        show_logs: { type: 'boolean' },
        show_guestbook: { type: 'boolean' },
      },
      required: ['action'],
    },
  },
  // ═══ ETIQUETTE ═══
  {
    name: 'manage_etiquette',
    description: 'List, add, update, delete, or reset agent etiquette rules.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'add', 'update', 'delete', 'reset'] },
        ruleId: { type: 'string' },
        content: { type: 'string' },
        position: { type: 'number' },
      },
      required: ['action'],
    },
  },
  // ═══ SEARCH ═══
  {
    name: 'search',
    description: 'Search across goals, sub-goals, habits, and tasks by title.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        domains: { type: 'array', items: { type: 'string', enum: ['goals', 'subgoals', 'habits', 'tasks'] } },
        limit: { type: 'number' },
      },
      required: ['query'],
    },
  },
  // ═══ MEMORY (chat-only) ═══
  {
    name: 'save_memory',
    description: 'Save a fact, preference, or important context about the user for future conversations. Use this when the user tells you something worth remembering long-term.',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The fact to remember' },
        category: { type: 'string', enum: ['preference', 'context', 'personal', 'general'] },
      },
      required: ['content'],
    },
  },
  {
    name: 'recall_memory',
    description: 'Search stored memories about the user.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for in memories' },
      },
    },
  },
];

// ─── TOOL HANDLERS ───────────────────────────────────────────────

registerTool('get_overview', (_, userId) => {
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any;
  const username = user?.username || 'User';
  const goals = db.prepare('SELECT * FROM primary_goals WHERE user_id = ? ORDER BY created_at DESC').all(userId) as PrimaryGoal[];
  const goalSummaries = goals.map(goal => {
    const tree = buildGoalTree(goal.id, { userId });
    if (!tree) return null;
    return {
      id: tree.id, title: tree.title, status: tree.status,
      subGoals: tree.subGoals.map(sg => ({
        id: sg.id, title: sg.title, position: sg.position,
        actions: sg.actions.map(a => ({ id: a.id, title: a.title, position: a.position })),
      })),
    };
  }).filter(Boolean);

  seedDefaultEtiquette(userId);
  const rules = db.prepare('SELECT * FROM agent_etiquette WHERE user_id = ? ORDER BY position').all(userId) as AgentEtiquette[];
  const habitCount = (db.prepare('SELECT COUNT(*) as c FROM habits WHERE user_id = ? AND archived = 0').get(userId) as any).c;
  const taskCount = (db.prepare('SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND done = 0').get(userId) as any).c;
  const projectCount = (db.prepare('SELECT COUNT(*) as c FROM projects WHERE user_id = ? AND archived = 0').get(userId) as any).c;

  return {
    overview: {
      title: `${username}'s Basys`,
      quickStats: { activeGoals: goals.filter(g => g.status === 'active').length, activeHabits: habitCount, openTasks: taskCount, activeProjects: projectCount },
    },
    etiquette: rules.map(r => r.content),
    goals: goalSummaries,
  };
});

registerTool('get_summary', (args, userId) => {
  const level = args.level || 'standard';
  const goals = db.prepare('SELECT * FROM primary_goals WHERE user_id = ? ORDER BY created_at DESC').all(userId) as PrimaryGoal[];
  return goals.map(goal => {
    if (level === 'minimal') {
      return { id: goal.id, title: goal.title, status: goal.status, subGoalCount: (db.prepare('SELECT COUNT(*) as count FROM sub_goals WHERE primary_goal_id = ?').get(goal.id) as any).count };
    }
    const subGoals = db.prepare('SELECT * FROM sub_goals WHERE primary_goal_id = ? ORDER BY position').all(goal.id) as SubGoal[];
    return {
      id: goal.id, title: goal.title, status: goal.status,
      subGoals: subGoals.map(sg => {
        const actions = db.prepare('SELECT * FROM action_items WHERE sub_goal_id = ? ORDER BY position').all(sg.id) as ActionItem[];
        return {
          id: sg.id, position: sg.position, title: sg.title,
          actions: actions.map(a => {
            const stats = db.prepare('SELECT COUNT(*) as log_count, MAX(log_date) as last_log_date FROM activity_logs WHERE action_item_id = ?').get(a.id) as any;
            const d: any = { id: a.id, position: a.position, title: a.title, totalLogs: stats.log_count };
            if (level === 'detailed' || level === 'full') { d.description = a.description; d.due_date = a.due_date; }
            if (level === 'full' && args.includeLogs) {
              d.recentLogs = db.prepare('SELECT id, log_type, content, log_date, mood FROM activity_logs WHERE action_item_id = ? ORDER BY log_date DESC LIMIT 10').all(a.id);
            }
            return d;
          }),
        };
      }),
    };
  });
});

registerTool('list_goals', (_, userId) => {
  return db.prepare('SELECT * FROM primary_goals WHERE user_id = ? ORDER BY created_at DESC').all(userId);
});

registerTool('upsert_goal', (args, userId) => {
  if (args.goalId) {
    const existing = ownedGoal(args.goalId, userId);
    if (!existing) throw new Error('Goal not found or access denied');
    db.prepare("UPDATE primary_goals SET title = ?, description = ?, status = ?, target_date = ?, updated_at = datetime('now') WHERE id = ?")
      .run(args.title, args.description ?? existing.description, args.status ?? existing.status, args.target_date ?? existing.target_date, args.goalId);
    return ownedGoal(args.goalId, userId);
  }
  const id = uuidv4();
  db.prepare('INSERT INTO primary_goals (id, user_id, title, description, target_date) VALUES (?, ?, ?, ?, ?)')
    .run(id, userId, args.title, args.description || null, args.target_date || null);
  return db.prepare('SELECT * FROM primary_goals WHERE id = ?').get(id);
});

registerTool('upsert_subgoal', (args, userId) => {
  if (args.subGoalId) {
    const existing = ownedSubGoal(args.subGoalId, userId);
    if (!existing) throw new Error('Sub-goal not found or access denied');
    db.prepare("UPDATE sub_goals SET title = ?, description = ?, position = ?, updated_at = datetime('now') WHERE id = ?")
      .run(args.title, args.description ?? existing.description, args.position ?? existing.position, args.subGoalId);
    return db.prepare('SELECT * FROM sub_goals WHERE id = ?').get(args.subGoalId);
  }
  if (!args.goalId) throw new Error('goalId is required when creating');
  if (!goalOwnerCheck(args.goalId, userId)) throw new Error('Goal not found or access denied');
  if (typeof args.position !== 'number') throw new Error('position is required when creating');
  const id = uuidv4();
  db.prepare('INSERT INTO sub_goals (id, primary_goal_id, position, title, description) VALUES (?, ?, ?, ?, ?)')
    .run(id, args.goalId, args.position, args.title, args.description || null);
  return db.prepare('SELECT * FROM sub_goals WHERE id = ?').get(id);
});

registerTool('upsert_action', (args, userId) => {
  if (args.actionId) {
    const existing = ownedAction(args.actionId, userId);
    if (!existing) throw new Error('Action not found or access denied');
    if (typeof args.completed === 'boolean') {
      db.prepare("UPDATE action_items SET completed = ?, completed_at = ?, updated_at = datetime('now') WHERE id = ?")
        .run(args.completed ? 1 : 0, args.completed ? new Date().toISOString() : null, args.actionId);
    }
    db.prepare("UPDATE action_items SET title = ?, description = ?, position = ?, due_date = ?, updated_at = datetime('now') WHERE id = ?")
      .run(args.title, args.description ?? existing.description, args.position ?? existing.position, args.due_date ?? existing.due_date, args.actionId);
    return db.prepare('SELECT * FROM action_items WHERE id = ?').get(args.actionId);
  }
  if (!args.subGoalId) throw new Error('subGoalId is required when creating');
  if (!ownedSubGoal(args.subGoalId, userId)) throw new Error('Sub-goal not found or access denied');
  if (typeof args.position !== 'number') throw new Error('position is required when creating');
  const id = uuidv4();
  db.prepare('INSERT INTO action_items (id, sub_goal_id, position, title, description, due_date) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, args.subGoalId, args.position, args.title, args.description || null, args.due_date || null);
  return db.prepare('SELECT * FROM action_items WHERE id = ?').get(id);
});

registerTool('upsert_action_log', (args, userId) => {
  const logDate = args.logDate || new Date().toISOString().split('T')[0];
  if (args.logId) {
    const existing = ownedLog(args.logId, userId);
    if (!existing) throw new Error('Log not found or access denied');
    db.prepare("UPDATE activity_logs SET log_type = ?, content = ?, log_date = ?, metric_value = ?, metric_unit = ?, mood = ?, updated_at = datetime('now') WHERE id = ?")
      .run(args.logType, args.content, logDate, args.metricValue ?? null, args.metricUnit ?? null, args.mood ?? null, args.logId);
    return db.prepare('SELECT * FROM activity_logs WHERE id = ?').get(args.logId);
  }
  if (!args.actionId) throw new Error('actionId is required when creating');
  if (!actionOwnerCheck(args.actionId, userId)) throw new Error('Action not found or access denied');
  const id = uuidv4();
  db.prepare('INSERT INTO activity_logs (id, action_item_id, log_type, content, log_date, metric_value, metric_unit, mood) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, args.actionId, args.logType, args.content, logDate, args.metricValue ?? null, args.metricUnit ?? null, args.mood ?? null);
  return db.prepare('SELECT * FROM activity_logs WHERE id = ?').get(id);
});

registerTool('post_guestbook_entry', (args, userId) => {
  const id = uuidv4();
  db.prepare('INSERT INTO guestbook (id, user_id, agent_name, comment, target_type, target_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, userId, args.agentName, args.comment, args.targetType, args.targetId || null);
  return db.prepare('SELECT * FROM guestbook WHERE id = ?').get(id);
});

registerTool('reorder_subgoal', (args, userId) => {
  const subGoal = ownedSubGoal(args.subGoalId, userId);
  if (!subGoal) throw new Error('Sub-goal not found or access denied');
  const reorder = db.transaction(() => {
    db.prepare('UPDATE sub_goals SET position = -1 WHERE primary_goal_id = ? AND position = ?').run(subGoal.primary_goal_id, args.targetPosition);
    db.prepare("UPDATE sub_goals SET position = ?, updated_at = datetime('now') WHERE id = ?").run(args.targetPosition, args.subGoalId);
    db.prepare("UPDATE sub_goals SET position = ?, updated_at = datetime('now') WHERE primary_goal_id = ? AND position = -1").run(subGoal.position, subGoal.primary_goal_id);
  });
  reorder();
  return db.prepare('SELECT * FROM sub_goals WHERE id = ?').get(args.subGoalId);
});

registerTool('reorder_action', (args, userId) => {
  const action = ownedAction(args.actionId, userId);
  if (!action) throw new Error('Action not found or access denied');
  const reorder = db.transaction(() => {
    db.prepare('UPDATE action_items SET position = -1 WHERE sub_goal_id = ? AND position = ?').run(action.sub_goal_id, args.targetPosition);
    db.prepare("UPDATE action_items SET position = ?, updated_at = datetime('now') WHERE id = ?").run(args.targetPosition, args.actionId);
    db.prepare("UPDATE action_items SET position = ?, updated_at = datetime('now') WHERE sub_goal_id = ? AND position = -1").run(action.position, action.sub_goal_id);
  });
  reorder();
  return db.prepare('SELECT * FROM action_items WHERE id = ?').get(args.actionId);
});

registerTool('delete_resource', (args, userId) => {
  const deleteMap: Record<string, { check: () => any; table: string }> = {
    goal: { check: () => ownedGoal(args.resourceId, userId), table: 'primary_goals' },
    subgoal: { check: () => ownedSubGoal(args.resourceId, userId), table: 'sub_goals' },
    action: { check: () => ownedAction(args.resourceId, userId), table: 'action_items' },
    log: { check: () => ownedLog(args.resourceId, userId), table: 'activity_logs' },
    guestbook: { check: () => db.prepare('SELECT * FROM guestbook WHERE id = ? AND user_id = ?').get(args.resourceId, userId), table: 'guestbook' },
  };
  const entry = deleteMap[args.resourceType];
  if (!entry) throw new Error(`Unknown resource type: ${args.resourceType}`);
  if (!entry.check()) throw new Error(`${args.resourceType} not found or access denied`);
  db.prepare(`DELETE FROM ${entry.table} WHERE id = ?`).run(args.resourceId);
  return { deleted: true, type: args.resourceType, id: args.resourceId };
});

registerTool('manage_habit', (args, userId) => {
  if (args.action === 'list') {
    const filter = args.type ? 'AND h.type = ?' : '';
    const archiveFilter = args.include_archived ? '' : 'AND h.archived = 0';
    const params: any[] = [userId];
    if (args.type) params.push(args.type);
    return db.prepare(`SELECT h.*, COUNT(hl.id) as total_logs, MAX(hl.log_date) as last_logged FROM habits h LEFT JOIN habit_logs hl ON hl.habit_id = h.id WHERE h.user_id = ? ${filter} ${archiveFilter} GROUP BY h.id ORDER BY h.position, h.created_at`).all(...params);
  }
  if (args.action === 'create') {
    if (!args.title) throw new Error('title is required');
    const id = uuidv4();
    db.prepare('INSERT INTO habits (id, user_id, title, emoji, type, frequency, quit_date, subgoal_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, userId, args.title, args.emoji || '', args.type || 'habit', args.frequency || 'daily', args.quit_date || null, args.subgoal_id || null);
    return db.prepare('SELECT * FROM habits WHERE id = ?').get(id);
  }
  if (args.action === 'update') {
    if (!args.habitId) throw new Error('habitId is required');
    const existing = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(args.habitId, userId) as any;
    if (!existing) throw new Error('Habit not found or access denied');
    db.prepare("UPDATE habits SET title = ?, emoji = ?, frequency = ?, quit_date = ?, subgoal_id = ?, archived = ?, updated_at = datetime('now') WHERE id = ?")
      .run(args.title ?? existing.title, args.emoji ?? existing.emoji, args.frequency ?? existing.frequency, args.quit_date ?? existing.quit_date, args.subgoal_id ?? existing.subgoal_id, args.archived !== undefined ? (args.archived ? 1 : 0) : existing.archived, args.habitId);
    return db.prepare('SELECT * FROM habits WHERE id = ?').get(args.habitId);
  }
  if (args.action === 'delete') {
    if (!args.habitId) throw new Error('habitId is required');
    if (!db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(args.habitId, userId)) throw new Error('Habit not found');
    db.prepare('DELETE FROM habits WHERE id = ?').run(args.habitId);
    return { deleted: true, id: args.habitId };
  }
  throw new Error('Invalid action');
});

registerTool('log_habit', (args, userId) => {
  const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(args.habitId, userId) as any;
  if (!habit) throw new Error('Habit not found or access denied');
  const date = args.date || new Date().toISOString().split('T')[0];

  if (args.action === 'log') {
    const existing = db.prepare('SELECT * FROM habit_logs WHERE habit_id = ? AND log_date = ?').get(args.habitId, date);
    if (existing) return { already_logged: true, date, habit: habit.title };
    const id = uuidv4();
    db.prepare('INSERT INTO habit_logs (id, habit_id, log_date, note) VALUES (?, ?, ?, ?)').run(id, args.habitId, date, args.note || null);
    return { logged: true, id, date, habit: habit.title };
  }
  if (args.action === 'unlog') {
    const result = db.prepare('DELETE FROM habit_logs WHERE habit_id = ? AND log_date = ?').run(args.habitId, date);
    return { unlogged: true, date, changes: result.changes };
  }
  if (args.action === 'calendar') {
    const now = new Date();
    const year = args.year || now.getFullYear();
    const month = args.month || now.getMonth() + 1;
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
    const logs = db.prepare('SELECT log_date, note FROM habit_logs WHERE habit_id = ? AND log_date >= ? AND log_date <= ? ORDER BY log_date').all(args.habitId, startDate, endDate);
    const allLogs = db.prepare('SELECT log_date FROM habit_logs WHERE habit_id = ? ORDER BY log_date DESC').all(args.habitId) as any[];
    let currentStreak = 0;
    const checkDate = new Date(); checkDate.setHours(0, 0, 0, 0);
    for (const log of allLogs) {
      if (log.log_date === checkDate.toISOString().split('T')[0]) { currentStreak++; checkDate.setDate(checkDate.getDate() - 1); } else if (log.log_date < checkDate.toISOString().split('T')[0]) break;
    }
    const totalLogs = (db.prepare('SELECT COUNT(*) as count FROM habit_logs WHERE habit_id = ?').get(args.habitId) as any).count;
    return { habit: habit.title, type: habit.type, year, month, logs, stats: { currentStreak, totalLogs } };
  }
  throw new Error('Invalid action');
});

registerTool('manage_task', (args, userId) => {
  if (args.action === 'list') {
    let sql = 'SELECT t.*, p.title as project_title FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE t.user_id = ?';
    const params: any[] = [userId];
    if (args.filter_done !== undefined) { sql += ' AND t.done = ?'; params.push(args.filter_done ? 1 : 0); }
    if (args.filter_priority !== undefined) { sql += ' AND t.priority = ?'; params.push(args.filter_priority); }
    if (args.filter_project) { sql += ' AND t.project_id = ?'; params.push(args.filter_project); }
    if (args.filter_favorite) sql += ' AND t.is_favorite = 1';
    if (args.search) { sql += ' AND t.title LIKE ?'; params.push(`%${args.search}%`); }
    if (args.filter_label) { sql += ' AND t.id IN (SELECT task_id FROM task_labels WHERE label_id = ?)'; params.push(args.filter_label); }
    sql += ' ORDER BY t.done ASC, t.priority DESC, t.created_at DESC';
    const tasks = db.prepare(sql).all(...params) as any[];
    const labelStmt = db.prepare('SELECT l.* FROM labels l JOIN task_labels tl ON l.id = tl.label_id WHERE tl.task_id = ?');
    for (const task of tasks) task.labels = labelStmt.all(task.id);
    return tasks;
  }
  if (args.action === 'create') {
    if (!args.title) throw new Error('title is required');
    const id = uuidv4();
    db.prepare('INSERT INTO tasks (id, user_id, title, description, project_id, priority, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, userId, args.title, args.description || null, args.project_id || null, args.priority || 0, args.due_date || null);
    if (args.labels?.length) { const ins = db.prepare('INSERT OR IGNORE INTO task_labels (task_id, label_id) VALUES (?, ?)'); for (const lid of args.labels) ins.run(id, lid); }
    if (args.links?.length) { const ins = db.prepare('INSERT OR IGNORE INTO task_links (task_id, target_type, target_id) VALUES (?, ?, ?)'); for (const link of args.links) ins.run(id, link.target_type, link.target_id); }
    return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  }
  if (args.action === 'update') {
    if (!args.taskId) throw new Error('taskId is required');
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(args.taskId, userId) as any;
    if (!existing) throw new Error('Task not found');
    db.prepare("UPDATE tasks SET title = ?, description = ?, project_id = ?, priority = ?, due_date = ?, updated_at = datetime('now') WHERE id = ?")
      .run(args.title ?? existing.title, args.description ?? existing.description, args.project_id !== undefined ? (args.project_id || null) : existing.project_id, args.priority ?? existing.priority, args.due_date !== undefined ? (args.due_date || null) : existing.due_date, args.taskId);
    if (args.labels) { db.prepare('DELETE FROM task_labels WHERE task_id = ?').run(args.taskId); const ins = db.prepare('INSERT OR IGNORE INTO task_labels (task_id, label_id) VALUES (?, ?)'); for (const lid of args.labels) ins.run(args.taskId, lid); }
    if (args.links) { db.prepare('DELETE FROM task_links WHERE task_id = ?').run(args.taskId); const ins = db.prepare('INSERT OR IGNORE INTO task_links (task_id, target_type, target_id) VALUES (?, ?, ?)'); for (const link of args.links) ins.run(args.taskId, link.target_type, link.target_id); }
    return db.prepare('SELECT * FROM tasks WHERE id = ?').get(args.taskId);
  }
  if (args.action === 'delete') {
    if (!args.taskId) throw new Error('taskId is required');
    if (!db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(args.taskId, userId)) throw new Error('Task not found');
    db.prepare('DELETE FROM tasks WHERE id = ?').run(args.taskId);
    return { deleted: true, id: args.taskId };
  }
  if (args.action === 'toggle_done') {
    if (!args.taskId) throw new Error('taskId is required');
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(args.taskId, userId) as any;
    if (!existing) throw new Error('Task not found');
    db.prepare("UPDATE tasks SET done = ?, done_at = ?, updated_at = datetime('now') WHERE id = ?").run(existing.done ? 0 : 1, existing.done ? null : new Date().toISOString(), args.taskId);
    return db.prepare('SELECT * FROM tasks WHERE id = ?').get(args.taskId);
  }
  if (args.action === 'toggle_favorite') {
    if (!args.taskId) throw new Error('taskId is required');
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(args.taskId, userId) as any;
    if (!existing) throw new Error('Task not found');
    db.prepare("UPDATE tasks SET is_favorite = ?, updated_at = datetime('now') WHERE id = ?").run(existing.is_favorite ? 0 : 1, args.taskId);
    return db.prepare('SELECT * FROM tasks WHERE id = ?').get(args.taskId);
  }
  throw new Error('Invalid action');
});

registerTool('manage_task_comment', (args, userId) => {
  if (!db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(args.taskId, userId)) throw new Error('Task not found');
  if (args.action === 'list') return db.prepare('SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at DESC').all(args.taskId);
  if (args.action === 'create') {
    if (!args.content) throw new Error('content is required');
    const id = uuidv4();
    db.prepare('INSERT INTO task_comments (id, task_id, user_id, content) VALUES (?, ?, ?, ?)').run(id, args.taskId, userId, args.content);
    return db.prepare('SELECT * FROM task_comments WHERE id = ?').get(id);
  }
  if (args.action === 'delete') {
    if (!args.commentId) throw new Error('commentId is required');
    if (!db.prepare('SELECT * FROM task_comments WHERE id = ? AND task_id = ?').get(args.commentId, args.taskId)) throw new Error('Comment not found');
    db.prepare('DELETE FROM task_comments WHERE id = ?').run(args.commentId);
    return { deleted: true, id: args.commentId };
  }
  throw new Error('Invalid action');
});

registerTool('manage_project', (args, userId) => {
  if (args.action === 'list') {
    const projects = db.prepare('SELECT p.*, (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND done = 0) as open_tasks, (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND done = 1) as done_tasks FROM projects p WHERE p.user_id = ? AND p.archived = 0 ORDER BY p.position, p.created_at').all(userId) as any[];
    if (args.include_tasks) { const stmt = db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY done ASC, priority DESC'); for (const p of projects) p.tasks = stmt.all(p.id); }
    return projects;
  }
  if (args.action === 'create') {
    if (!args.title) throw new Error('title is required');
    const id = uuidv4();
    db.prepare('INSERT INTO projects (id, user_id, title, description, hex_color, parent_project_id) VALUES (?, ?, ?, ?, ?, ?)').run(id, userId, args.title, args.description || null, args.hex_color || '', args.parent_project_id || null);
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  }
  if (args.action === 'update') {
    if (!args.projectId) throw new Error('projectId is required');
    const existing = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(args.projectId, userId) as any;
    if (!existing) throw new Error('Project not found');
    db.prepare("UPDATE projects SET title = ?, description = ?, hex_color = ?, parent_project_id = ?, updated_at = datetime('now') WHERE id = ?")
      .run(args.title ?? existing.title, args.description ?? existing.description, args.hex_color ?? existing.hex_color, args.parent_project_id !== undefined ? (args.parent_project_id || null) : existing.parent_project_id, args.projectId);
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(args.projectId);
  }
  if (args.action === 'delete') {
    if (!args.projectId) throw new Error('projectId is required');
    if (!db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(args.projectId, userId)) throw new Error('Project not found');
    db.prepare('DELETE FROM projects WHERE id = ?').run(args.projectId);
    return { deleted: true, id: args.projectId };
  }
  if (args.action === 'toggle_archive') {
    if (!args.projectId) throw new Error('projectId is required');
    const existing = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(args.projectId, userId) as any;
    if (!existing) throw new Error('Project not found');
    db.prepare("UPDATE projects SET archived = ?, updated_at = datetime('now') WHERE id = ?").run(existing.archived ? 0 : 1, args.projectId);
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(args.projectId);
  }
  if (args.action === 'toggle_favorite') {
    if (!args.projectId) throw new Error('projectId is required');
    const existing = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(args.projectId, userId) as any;
    if (!existing) throw new Error('Project not found');
    db.prepare("UPDATE projects SET is_favorite = ?, updated_at = datetime('now') WHERE id = ?").run(existing.is_favorite ? 0 : 1, args.projectId);
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(args.projectId);
  }
  throw new Error('Invalid action');
});

registerTool('manage_label', (args, userId) => {
  if (args.action === 'list') return db.prepare('SELECT l.*, COUNT(tl.task_id) as task_count FROM labels l LEFT JOIN task_labels tl ON l.id = tl.label_id WHERE l.user_id = ? GROUP BY l.id ORDER BY l.title').all(userId);
  if (args.action === 'create') {
    if (!args.title) throw new Error('title is required');
    const id = uuidv4();
    db.prepare('INSERT INTO labels (id, user_id, title, hex_color, description) VALUES (?, ?, ?, ?, ?)').run(id, userId, args.title, args.hex_color || '#e2e8f0', args.description || null);
    return db.prepare('SELECT * FROM labels WHERE id = ?').get(id);
  }
  if (args.action === 'update') {
    if (!args.labelId) throw new Error('labelId is required');
    const existing = db.prepare('SELECT * FROM labels WHERE id = ? AND user_id = ?').get(args.labelId, userId) as any;
    if (!existing) throw new Error('Label not found');
    db.prepare("UPDATE labels SET title = ?, hex_color = ?, description = ?, updated_at = datetime('now') WHERE id = ?").run(args.title ?? existing.title, args.hex_color ?? existing.hex_color, args.description ?? existing.description, args.labelId);
    return db.prepare('SELECT * FROM labels WHERE id = ?').get(args.labelId);
  }
  if (args.action === 'delete') {
    if (!args.labelId) throw new Error('labelId is required');
    if (!db.prepare('SELECT * FROM labels WHERE id = ? AND user_id = ?').get(args.labelId, userId)) throw new Error('Label not found');
    db.prepare('DELETE FROM labels WHERE id = ?').run(args.labelId);
    return { deleted: true, id: args.labelId };
  }
  throw new Error('Invalid action');
});

registerTool('manage_pomodoro', (args, userId) => {
  if (args.action === 'list') {
    let sql = 'SELECT * FROM pomodoro_sessions WHERE user_id = ?';
    const params: any[] = [userId];
    if (args.status) { sql += ' AND status = ?'; params.push(args.status); }
    sql += ' ORDER BY started_at DESC LIMIT ?'; params.push(args.limit || 20);
    return db.prepare(sql).all(...params);
  }
  if (args.action === 'create') {
    const id = uuidv4();
    db.prepare('INSERT INTO pomodoro_sessions (id, user_id, started_at, duration_minutes, status, note) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, userId, new Date().toISOString(), args.duration_minutes || 25, 'in_progress', args.note || null);
    if (args.task_id && db.prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?').get(args.task_id, userId)) {
      db.prepare('INSERT OR IGNORE INTO task_links (task_id, target_type, target_id) VALUES (?, ?, ?)').run(args.task_id, 'pomodoro', id);
    }
    return db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ?').get(id);
  }
  if (args.action === 'update') {
    if (!args.pomodoroId) throw new Error('pomodoroId is required');
    const existing = db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ? AND user_id = ?').get(args.pomodoroId, userId) as any;
    if (!existing) throw new Error('Session not found');
    db.prepare('UPDATE pomodoro_sessions SET note = ?, status = ? WHERE id = ?').run(args.note ?? existing.note, args.status ?? existing.status, args.pomodoroId);
    return db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ?').get(args.pomodoroId);
  }
  if (args.action === 'complete') {
    if (!args.pomodoroId) throw new Error('pomodoroId is required');
    if (!db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ? AND user_id = ?').get(args.pomodoroId, userId)) throw new Error('Session not found');
    db.prepare('UPDATE pomodoro_sessions SET status = ?, ended_at = ? WHERE id = ?').run('completed', new Date().toISOString(), args.pomodoroId);
    return db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ?').get(args.pomodoroId);
  }
  if (args.action === 'delete') {
    if (!args.pomodoroId) throw new Error('pomodoroId is required');
    if (!db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ? AND user_id = ?').get(args.pomodoroId, userId)) throw new Error('Session not found');
    db.prepare('DELETE FROM pomodoro_sessions WHERE id = ?').run(args.pomodoroId);
    return { deleted: true, id: args.pomodoroId };
  }
  throw new Error('Invalid action');
});

registerTool('manage_share', (args, userId) => {
  if (args.action === 'list') {
    let sql = 'SELECT * FROM shared_goals WHERE user_id = ?';
    const params: any[] = [userId];
    if (args.goalId) { sql += ' AND goal_id = ?'; params.push(args.goalId); }
    return db.prepare(sql + ' ORDER BY created_at DESC').all(...params);
  }
  if (args.action === 'create') {
    if (!args.goalId) throw new Error('goalId is required');
    if (!goalOwnerCheck(args.goalId, userId)) throw new Error('Goal not found');
    const id = uuidv4();
    const token = uuidv4().replace(/-/g, '').substring(0, 16);
    db.prepare('INSERT INTO shared_goals (id, goal_id, user_id, token, show_logs, show_guestbook) VALUES (?, ?, ?, ?, ?, ?)').run(id, args.goalId, userId, token, args.show_logs ? 1 : 0, args.show_guestbook ? 1 : 0);
    return db.prepare('SELECT * FROM shared_goals WHERE id = ?').get(id);
  }
  if (args.action === 'revoke') {
    if (!args.shareId) throw new Error('shareId is required');
    if (!db.prepare('SELECT * FROM shared_goals WHERE id = ? AND user_id = ?').get(args.shareId, userId)) throw new Error('Share link not found');
    db.prepare('DELETE FROM shared_goals WHERE id = ?').run(args.shareId);
    return { deleted: true, id: args.shareId };
  }
  throw new Error('Invalid action');
});

registerTool('manage_etiquette', (args, userId) => {
  if (args.action === 'list') {
    seedDefaultEtiquette(userId);
    return db.prepare('SELECT * FROM agent_etiquette WHERE user_id = ? ORDER BY position').all(userId);
  }
  if (args.action === 'add') {
    if (!args.content) throw new Error('content is required');
    const maxPos = (db.prepare('SELECT MAX(position) as max FROM agent_etiquette WHERE user_id = ?').get(userId) as any)?.max || 0;
    const id = uuidv4();
    db.prepare('INSERT INTO agent_etiquette (id, user_id, content, position, is_default) VALUES (?, ?, ?, ?, 0)').run(id, userId, args.content, args.position ?? maxPos + 1);
    return db.prepare('SELECT * FROM agent_etiquette WHERE id = ?').get(id);
  }
  if (args.action === 'update') {
    if (!args.ruleId) throw new Error('ruleId is required');
    const existing = db.prepare('SELECT * FROM agent_etiquette WHERE id = ? AND user_id = ?').get(args.ruleId, userId) as any;
    if (!existing) throw new Error('Rule not found');
    db.prepare('UPDATE agent_etiquette SET content = ?, position = ? WHERE id = ?').run(args.content ?? existing.content, args.position ?? existing.position, args.ruleId);
    return db.prepare('SELECT * FROM agent_etiquette WHERE id = ?').get(args.ruleId);
  }
  if (args.action === 'delete') {
    if (!args.ruleId) throw new Error('ruleId is required');
    if (!db.prepare('SELECT * FROM agent_etiquette WHERE id = ? AND user_id = ?').get(args.ruleId, userId)) throw new Error('Rule not found');
    db.prepare('DELETE FROM agent_etiquette WHERE id = ?').run(args.ruleId);
    const remaining = db.prepare('SELECT id FROM agent_etiquette WHERE user_id = ? ORDER BY position').all(userId) as any[];
    remaining.forEach((r: any, i: number) => db.prepare('UPDATE agent_etiquette SET position = ? WHERE id = ?').run(i + 1, r.id));
    return { deleted: true, id: args.ruleId };
  }
  if (args.action === 'reset') {
    db.prepare('DELETE FROM agent_etiquette WHERE user_id = ?').run(userId);
    seedDefaultEtiquette(userId);
    return { reset: true, rules: db.prepare('SELECT * FROM agent_etiquette WHERE user_id = ? ORDER BY position').all(userId) };
  }
  throw new Error('Invalid action');
});

registerTool('search', (args, userId) => {
  const q = `%${args.query}%`;
  const limit = args.limit || 10;
  const domains = args.domains || ['goals', 'subgoals', 'habits', 'tasks'];
  const results: any = {};
  if (domains.includes('goals')) results.goals = db.prepare('SELECT id, title, status FROM primary_goals WHERE user_id = ? AND title LIKE ? LIMIT ?').all(userId, q, limit);
  if (domains.includes('subgoals')) results.subgoals = db.prepare('SELECT sg.id, sg.title, sg.position, pg.title as goal_title FROM sub_goals sg JOIN primary_goals pg ON sg.primary_goal_id = pg.id WHERE pg.user_id = ? AND sg.title LIKE ? LIMIT ?').all(userId, q, limit);
  if (domains.includes('habits')) results.habits = db.prepare('SELECT id, title, emoji, type FROM habits WHERE user_id = ? AND title LIKE ? LIMIT ?').all(userId, q, limit);
  if (domains.includes('tasks')) results.tasks = db.prepare('SELECT id, title, done, priority, due_date FROM tasks WHERE user_id = ? AND title LIKE ? LIMIT ?').all(userId, q, limit);
  return results;
});

// ═══ MEMORY TOOLS ═══

registerTool('save_memory', (args, userId) => {
  const id = uuidv4();
  db.prepare('INSERT INTO chat_memory (id, user_id, content, category) VALUES (?, ?, ?, ?)').run(id, userId, args.content, args.category || 'general');
  return { saved: true, id, content: args.content };
});

registerTool('recall_memory', (args, userId) => {
  if (args.query) {
    return db.prepare('SELECT id, content, category, created_at FROM chat_memory WHERE user_id = ? AND content LIKE ? ORDER BY created_at DESC LIMIT 20').all(userId, `%${args.query}%`);
  }
  return db.prepare('SELECT id, content, category, created_at FROM chat_memory WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(userId);
});

// ─── PUBLIC API ──────────────────────────────────────────────────

export function executeToolCall(name: string, args: any, userId: string): any {
  const handler = toolHandlers[name];
  if (!handler) throw new Error(`Unknown tool: ${name}`);
  return handler(args, userId);
}
