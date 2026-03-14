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
import {
  handleManageHabit,
  handleManageTask,
  handleManageTaskComment,
  handleManageProject,
  handleManageLabel,
  handleManagePomodoro,
  handleManageShare,
  handleManageEtiquette,
  handleManageSprint,
  handleManageSprintColumn,
  handleManageNote,
  handleManageEvent,
  MANAGE_HABIT_ACTIONS,
  MANAGE_TASK_ACTIONS,
  MANAGE_TASK_COMMENT_ACTIONS,
  MANAGE_PROJECT_ACTIONS,
  MANAGE_LABEL_ACTIONS,
  MANAGE_POMODORO_ACTIONS,
  MANAGE_SHARE_ACTIONS,
  MANAGE_ETIQUETTE_ACTIONS,
  MANAGE_SPRINT_ACTIONS,
  MANAGE_SPRINT_COLUMN_ACTIONS,
  MANAGE_NOTE_ACTIONS,
  MANAGE_EVENT_ACTIONS,
} from '../tools/manageHandlers';

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

const bulkItemsProperty = {
  type: 'array',
  items: { type: 'object', additionalProperties: true },
  description: 'For bulk actions, provide an array of item objects using the same fields as the single-item action.',
} as const;

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
    description: 'List, create, update, or delete habits. Supports bulk_create, bulk_update, and bulk_delete via an items array.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...MANAGE_HABIT_ACTIONS] },
        habitId: { type: 'string' },
        title: { type: 'string' },
        emoji: { type: 'string' },
        type: { type: 'string', enum: ['habit', 'quit'] },
        frequency: { type: 'string', enum: ['daily', 'weekly'] },
        quit_date: { type: 'string' },
        subgoal_id: { type: 'string' },
        archived: { type: 'boolean' },
        include_archived: { type: 'boolean' },
        items: bulkItemsProperty,
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
    description: 'List, create, update, delete tasks, or toggle done/favorite. Supports bulk_create, bulk_update, and bulk_delete via an items array.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...MANAGE_TASK_ACTIONS] },
        taskId: { type: 'string', description: 'Required for list and single-item create/delete, or per item in bulk actions' },
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
        items: bulkItemsProperty,
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_task_comment',
    description: 'List, add, or delete comments on a task. Supports bulk_create and bulk_delete via an items array.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...MANAGE_TASK_COMMENT_ACTIONS] },
        taskId: { type: 'string' },
        commentId: { type: 'string' },
        content: { type: 'string' },
        items: bulkItemsProperty,
      },
      required: ['action'],
    },
  },
  // ═══ PROJECTS & LABELS ═══
  {
    name: 'manage_project',
    description: 'List, create, update, delete, archive, or favorite projects. Supports bulk_create, bulk_update, and bulk_delete via an items array.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...MANAGE_PROJECT_ACTIONS] },
        projectId: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        hex_color: { type: 'string' },
        parent_project_id: { type: 'string' },
        include_tasks: { type: 'boolean' },
        items: bulkItemsProperty,
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_label',
    description: 'List, create, update, or delete labels. Supports bulk_create, bulk_update, and bulk_delete via an items array.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...MANAGE_LABEL_ACTIONS] },
        labelId: { type: 'string' },
        title: { type: 'string' },
        hex_color: { type: 'string' },
        description: { type: 'string' },
        items: bulkItemsProperty,
      },
      required: ['action'],
    },
  },
  // ═══ POMODORO ═══
  {
    name: 'manage_pomodoro',
    description: 'List, create, update, complete, or delete pomodoro sessions. Supports bulk_create, bulk_update, and bulk_delete via an items array.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...MANAGE_POMODORO_ACTIONS] },
        pomodoroId: { type: 'string' },
        duration_minutes: { type: 'number' },
        note: { type: 'string' },
        task_id: { type: 'string' },
        status: { type: 'string', enum: ['completed', 'cancelled', 'in_progress'] },
        limit: { type: 'number' },
        items: bulkItemsProperty,
      },
      required: ['action'],
    },
  },
  // ═══ SHARING ═══
  {
    name: 'manage_share',
    description: 'Create, list, or revoke share links for goals. Supports bulk_create and bulk_delete via an items array.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...MANAGE_SHARE_ACTIONS] },
        shareId: { type: 'string' },
        goalId: { type: 'string' },
        show_logs: { type: 'boolean' },
        show_guestbook: { type: 'boolean' },
        items: bulkItemsProperty,
      },
      required: ['action'],
    },
  },
  // ═══ ETIQUETTE ═══
  {
    name: 'manage_etiquette',
    description: 'List, add, update, delete, or reset agent etiquette rules. Supports bulk_create, bulk_update, and bulk_delete via an items array.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...MANAGE_ETIQUETTE_ACTIONS] },
        ruleId: { type: 'string' },
        content: { type: 'string' },
        position: { type: 'number' },
        items: bulkItemsProperty,
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
  // ═══ SPRINTS ═══
  {
    name: 'manage_sprint',
    description: 'List, create, get, update, delete sprints, or transition sprint status. Supports bulk_create, bulk_update, and bulk_delete via an items array.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...MANAGE_SPRINT_ACTIONS] },
        sprintId: { type: 'string', description: 'Required for list and single-item create/update/delete, or per item in bulk actions' },
        projectId: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        start_date: { type: 'string' },
        end_date: { type: 'string' },
        status: { type: 'string', enum: ['planned', 'active', 'completed'] },
        items: bulkItemsProperty,
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_sprint_column',
    description: 'List, create, update, or delete columns within a sprint board. Supports bulk_create, bulk_update, and bulk_delete via an items array.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...MANAGE_SPRINT_COLUMN_ACTIONS] },
        sprintId: { type: 'string' },
        columnId: { type: 'string' },
        title: { type: 'string' },
        position: { type: 'number' },
        is_done_column: { type: 'boolean' },
        items: bulkItemsProperty,
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_note',
    description: 'List, create, update, or delete quick notes. Supports bulk_create, bulk_update, and bulk_delete via an items array.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...MANAGE_NOTE_ACTIONS] },
        noteId: { type: 'string' },
        content: { type: 'string' },
        items: bulkItemsProperty,
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_event',
    description: 'List, create, update, or delete calendar events. Supports bulk_create, bulk_update, and bulk_delete via an items array.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...MANAGE_EVENT_ACTIONS] },
        eventId: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        start_date: { type: 'string' },
        end_date: { type: 'string' },
        all_day: { type: 'boolean' },
        color: { type: 'string' },
        location: { type: 'string' },
        filter_start: { type: 'string' },
        filter_end: { type: 'string' },
        items: bulkItemsProperty,
      },
      required: ['action'],
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
      title: `${username}'s Thesys`,
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

registerTool('manage_habit', handleManageHabit);

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

registerTool('manage_task', handleManageTask);

registerTool('manage_task_comment', handleManageTaskComment);

registerTool('manage_project', handleManageProject);

registerTool('manage_label', handleManageLabel);

registerTool('manage_pomodoro', handleManagePomodoro);

registerTool('manage_share', handleManageShare);

registerTool('manage_etiquette', handleManageEtiquette);

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

// ═══ SPRINT TOOLS ═══

registerTool('manage_sprint', handleManageSprint);

registerTool('manage_sprint_column', handleManageSprintColumn);

registerTool('manage_note', handleManageNote);

registerTool('manage_event', handleManageEvent);

// ─── PUBLIC API ──────────────────────────────────────────────────

export function executeToolCall(name: string, args: any, userId: string): any {
  const handler = toolHandlers[name];
  if (!handler) throw new Error(`Unknown tool: ${name}`);
  return handler(args, userId);
}
