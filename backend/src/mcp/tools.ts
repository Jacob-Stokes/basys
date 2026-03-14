/**
 * MCP tool definitions for the remote Harada MCP endpoint.
 * MCP tool definitions with direct DB access.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { v4 as uuidv4 } from 'uuid';
import { db, PrimaryGoal, SubGoal, ActionItem, ActivityLog, AgentEtiquette } from '../db/database';
import { buildGoalTree } from '../utils/goalTree';
import { DEFAULT_ETIQUETTE, seedDefaultEtiquette } from '../utils/etiquette';
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

function asTextContent(obj: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(obj, null, 2) }] };
}

function getUserId(extra: any): string {
  const userId = extra?.authInfo?.extra?.userId;
  if (!userId) throw new Error('Authentication required');
  return userId;
}

const bulkItemsSchema = z.array(z.record(z.string(), z.any())).optional()
  .describe('For bulk actions, provide an array of item objects using the same fields as the single-item action.');

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'thesys',
    version: '1.0.0',
  });

  // ─── get_harada_overview ─────────────────────────────────

  server.registerTool('get_harada_overview', {
    description: 'START HERE. Fetches the full Harada landing page: who the user is, their goals, sub-goals, actions, guidance for agents, and API info.',
    inputSchema: {},
  }, async (_args, extra) => {
    const userId = getUserId(extra);
    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any;
    const username = user?.username || 'User';

    const goals = db.prepare('SELECT * FROM primary_goals WHERE user_id = ? ORDER BY created_at DESC').all(userId) as PrimaryGoal[];
    const goalSummaries = goals.map(goal => {
      const tree = buildGoalTree(goal.id, { userId });
      if (!tree) return null;
      return {
        id: tree.id, title: tree.title, status: tree.status, description: tree.description,
        subGoals: tree.subGoals.map(sg => ({
          id: sg.id, title: sg.title, position: sg.position,
          actions: sg.actions.map(a => ({ id: a.id, title: a.title, position: a.position })),
        })),
      };
    }).filter(Boolean);

    seedDefaultEtiquette(userId);
    const rules = db.prepare('SELECT * FROM agent_etiquette WHERE user_id = ? ORDER BY position').all(userId) as AgentEtiquette[];

    // Gather quick stats for other domains
    const habitCount = (db.prepare('SELECT COUNT(*) as c FROM habits WHERE user_id = ? AND archived = 0').get(userId) as any).c;
    const taskCount = (db.prepare('SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND done = 0').get(userId) as any).c;
    const projectCount = (db.prepare('SELECT COUNT(*) as c FROM projects WHERE user_id = ? AND archived = 0').get(userId) as any).c;

    return asTextContent({
      overview: {
        title: `${username}'s Thesys — Personal Productivity Suite`,
        description: `This is ${username}'s single source of truth: Harada goals, tasks, habits, projects, and pomodoro sessions.`,
        framework: 'Harada Method: 1 primary goal -> 8 sub-goals -> 8 actions each (64 total actions)',
        quickStats: {
          activeGoals: goals.filter(g => g.status === 'active').length,
          activeHabits: habitCount,
          openTasks: taskCount,
          activeProjects: projectCount,
        },
      },
      guidance: {
        workflow: [
          'Use get_summary with level=detailed for the full Harada goal grid.',
          'Use manage_task to create/list/update tasks. Use manage_project for project management.',
          'Use manage_habit + log_habit for daily habit tracking with streak stats.',
          'Use manage_pomodoro for focus timer sessions, optionally linked to tasks.',
          'Use search to find items across goals, tasks, habits by title.',
          'Use manage_etiquette to view or update agent behavior rules.',
          'Log progress on Harada actions via upsert_action_log. Encourage via post_guestbook_entry.',
        ],
        etiquette: rules.map(r => r.content),
      },
      goals: goalSummaries,
    });
  });

  // ─── get_summary ─────────────────────────────────────────

  server.registerTool('get_summary', {
    description: 'Fetch the Harada user summary tree (goal -> sub-goal -> action).',
    inputSchema: {
      level: z.enum(['minimal', 'standard', 'detailed', 'full']).optional().describe('Level of detail (defaults to standard).'),
      includeLogs: z.boolean().optional().describe('When true and level=full, include recent action logs.'),
      includeGuestbook: z.boolean().optional().describe('Include inline guestbook comments.'),
    },
  }, async (args, extra) => {
    const userId = getUserId(extra);
    const level = args.level || 'standard';
    const includeLogs = args.includeLogs || false;
    const includeGuestbook = args.includeGuestbook || false;

    const goals = db.prepare('SELECT * FROM primary_goals WHERE user_id = ? ORDER BY created_at DESC').all(userId) as PrimaryGoal[];

    const summary = goals.map(goal => {
      if (level === 'minimal') {
        return {
          id: goal.id, title: goal.title, status: goal.status,
          subGoalCount: (db.prepare('SELECT COUNT(*) as count FROM sub_goals WHERE primary_goal_id = ?').get(goal.id) as any).count,
        };
      }

      const subGoals = db.prepare('SELECT * FROM sub_goals WHERE primary_goal_id = ? ORDER BY position').all(goal.id) as SubGoal[];
      const processedSubGoals = subGoals.map(sg => {
        const actions = db.prepare('SELECT * FROM action_items WHERE sub_goal_id = ? ORDER BY position').all(sg.id) as ActionItem[];
        const actionsWithActivity = actions.map(action => {
          const stats = db.prepare('SELECT COUNT(*) as log_count, MAX(log_date) as last_log_date FROM activity_logs WHERE action_item_id = ?').get(action.id) as any;
          const actionData: any = { id: action.id, position: action.position, title: action.title, totalLogs: stats.log_count, lastLoggedAt: stats.last_log_date };
          if (level === 'detailed' || level === 'full') {
            actionData.description = action.description;
            actionData.due_date = action.due_date;
            actionData.created_at = action.created_at;
          }
          if (level === 'full' && includeLogs) {
            actionData.recentLogs = db.prepare('SELECT id, log_type, content, log_date, metric_value, metric_unit, mood, created_at FROM activity_logs WHERE action_item_id = ? ORDER BY log_date DESC LIMIT 10').all(action.id);
          }
          return actionData;
        });

        const totalLogs = actionsWithActivity.reduce((sum, a) => sum + a.totalLogs, 0);
        const sgData: any = {
          id: sg.id, position: sg.position, title: sg.title,
          actions: actionsWithActivity, totalActivityLogs: totalLogs, totalActions: actions.length,
        };
        if (level === 'detailed' || level === 'full') {
          sgData.description = sg.description;
        }
        if (includeGuestbook) {
          sgData.guestbook = db.prepare("SELECT id, agent_name, comment, created_at FROM guestbook WHERE user_id = ? AND target_type = 'subgoal' AND target_id = ? ORDER BY created_at DESC").all(userId, sg.id);
        }
        return sgData;
      });

      const goalData: any = { id: goal.id, title: goal.title, status: goal.status, subGoals: processedSubGoals };
      if (level === 'detailed' || level === 'full') {
        goalData.description = goal.description;
        goalData.target_date = goal.target_date;
      }
      if (includeGuestbook) {
        goalData.guestbook = db.prepare("SELECT id, agent_name, comment, created_at FROM guestbook WHERE user_id = ? AND target_type = 'goal' AND target_id = ? ORDER BY created_at DESC").all(userId, goal.id);
      }
      return goalData;
    });

    return asTextContent(summary);
  });

  // ─── list_goals ──────────────────────────────────────────

  server.registerTool('list_goals', {
    description: 'List all primary goals.',
    inputSchema: {},
  }, async (_args, extra) => {
    const userId = getUserId(extra);
    const goals = db.prepare('SELECT * FROM primary_goals WHERE user_id = ? ORDER BY created_at DESC').all(userId);
    return asTextContent(goals);
  });

  // ─── upsert_goal ─────────────────────────────────────────

  server.registerTool('upsert_goal', {
    description: 'Create or update a primary goal. Omit goalId to create; provide goalId to update.',
    inputSchema: {
      goalId: z.string().optional().describe('Goal ID — if provided, updates instead of creating.'),
      title: z.string().describe('Goal title'),
      description: z.string().optional().describe('Goal description'),
      status: z.enum(['active', 'completed', 'archived']).optional().describe('Goal status'),
      target_date: z.string().optional().describe('Target date (ISO format)'),
    },
  }, async (args, extra) => {
    const userId = getUserId(extra);

    if (args.goalId) {
      const existing = ownedGoal(args.goalId, userId);
      if (!existing) throw new Error('Goal not found or access denied');
      db.prepare('UPDATE primary_goals SET title = ?, description = ?, status = ?, target_date = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(args.title, args.description ?? existing.description, args.status ?? existing.status, args.target_date ?? existing.target_date, args.goalId);
      return asTextContent(ownedGoal(args.goalId, userId));
    }

    const id = uuidv4();
    db.prepare('INSERT INTO primary_goals (id, user_id, title, description, target_date) VALUES (?, ?, ?, ?, ?)')
      .run(id, userId, args.title, args.description || null, args.target_date || null);
    return asTextContent(db.prepare('SELECT * FROM primary_goals WHERE id = ?').get(id));
  });

  // ─── upsert_subgoal ──────────────────────────────────────

  server.registerTool('upsert_subgoal', {
    description: 'Create or update a sub-goal. Omit subGoalId to create (requires goalId); provide subGoalId to update.',
    inputSchema: {
      subGoalId: z.string().optional(),
      goalId: z.string().optional().describe('Primary goal ID (required for create)'),
      title: z.string().describe('Sub-goal title'),
      description: z.string().optional(),
      position: z.number().optional().describe('Position 1-8'),
    },
  }, async (args, extra) => {
    const userId = getUserId(extra);

    if (args.subGoalId) {
      const existing = ownedSubGoal(args.subGoalId, userId);
      if (!existing) throw new Error('Sub-goal not found or access denied');
      db.prepare('UPDATE sub_goals SET title = ?, description = ?, position = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(args.title, args.description ?? existing.description, args.position ?? existing.position, args.subGoalId);
      return asTextContent(db.prepare('SELECT * FROM sub_goals WHERE id = ?').get(args.subGoalId));
    }

    if (!args.goalId) throw new Error('goalId is required when creating a new sub-goal.');
    if (!goalOwnerCheck(args.goalId, userId)) throw new Error('Goal not found or access denied');
    if (typeof args.position !== 'number') throw new Error('position is required when creating a sub-goal.');

    const id = uuidv4();
    db.prepare('INSERT INTO sub_goals (id, primary_goal_id, position, title, description) VALUES (?, ?, ?, ?, ?)')
      .run(id, args.goalId, args.position, args.title, args.description || null);
    return asTextContent(db.prepare('SELECT * FROM sub_goals WHERE id = ?').get(id));
  });

  // ─── upsert_action ───────────────────────────────────────

  server.registerTool('upsert_action', {
    description: 'Create or update an action. Omit actionId to create (requires subGoalId); provide actionId to update. Set completed to toggle completion.',
    inputSchema: {
      actionId: z.string().optional(),
      subGoalId: z.string().optional().describe('Sub-goal ID (required for create)'),
      title: z.string().describe('Action title'),
      description: z.string().optional(),
      position: z.number().optional().describe('Position 1-8'),
      due_date: z.string().optional().describe('Due date (ISO format)'),
      completed: z.boolean().optional().describe('Toggle completion status (requires actionId)'),
    },
  }, async (args, extra) => {
    const userId = getUserId(extra);

    if (args.actionId) {
      const existing = ownedAction(args.actionId, userId);
      if (!existing) throw new Error('Action not found or access denied');

      // Toggle completion if requested
      if (typeof args.completed === 'boolean') {
        const newCompleted = args.completed ? 1 : 0;
        const completedAt = args.completed ? new Date().toISOString() : null;
        db.prepare('UPDATE action_items SET completed = ?, completed_at = ?, updated_at = datetime(\'now\') WHERE id = ?')
          .run(newCompleted, completedAt, args.actionId);
      }

      db.prepare('UPDATE action_items SET title = ?, description = ?, position = ?, due_date = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(args.title, args.description ?? existing.description, args.position ?? existing.position, args.due_date ?? existing.due_date, args.actionId);
      return asTextContent(db.prepare('SELECT * FROM action_items WHERE id = ?').get(args.actionId));
    }

    if (!args.subGoalId) throw new Error('subGoalId is required when creating a new action.');
    if (!ownedSubGoal(args.subGoalId, userId)) throw new Error('Sub-goal not found or access denied');
    if (typeof args.position !== 'number') throw new Error('position is required when creating an action.');

    const id = uuidv4();
    db.prepare('INSERT INTO action_items (id, sub_goal_id, position, title, description, due_date) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, args.subGoalId, args.position, args.title, args.description || null, args.due_date || null);
    return asTextContent(db.prepare('SELECT * FROM action_items WHERE id = ?').get(id));
  });

  // ─── upsert_action_log ───────────────────────────────────

  server.registerTool('upsert_action_log', {
    description: 'Create or update an activity log. Omit logId to create (requires actionId); provide logId to update.',
    inputSchema: {
      logId: z.string().optional(),
      actionId: z.string().optional().describe('Action ID (required for create)'),
      logType: z.enum(['note', 'progress', 'completion', 'media', 'link']).describe('Type of log entry'),
      content: z.string().describe('Log content'),
      logDate: z.string().optional().describe('ISO date (defaults to now)'),
      metricValue: z.number().optional().describe('Quantifiable metric'),
      metricUnit: z.string().optional().describe('Unit for metric'),
      mood: z.enum(['motivated', 'challenged', 'accomplished', 'frustrated', 'neutral']).optional(),
    },
  }, async (args, extra) => {
    const userId = getUserId(extra);
    const logDate = args.logDate || new Date().toISOString().split('T')[0];

    if (args.logId) {
      const existing = ownedLog(args.logId, userId);
      if (!existing) throw new Error('Log not found or access denied');
      db.prepare('UPDATE activity_logs SET log_type = ?, content = ?, log_date = ?, metric_value = ?, metric_unit = ?, mood = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(args.logType, args.content, logDate, args.metricValue ?? null, args.metricUnit ?? null, args.mood ?? null, args.logId);
      return asTextContent(db.prepare('SELECT * FROM activity_logs WHERE id = ?').get(args.logId));
    }

    if (!args.actionId) throw new Error('actionId is required when creating a new log entry.');
    if (!actionOwnerCheck(args.actionId, userId)) throw new Error('Action not found or access denied');

    const id = uuidv4();
    db.prepare('INSERT INTO activity_logs (id, action_item_id, log_type, content, log_date, metric_value, metric_unit, mood) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, args.actionId, args.logType, args.content, logDate, args.metricValue ?? null, args.metricUnit ?? null, args.mood ?? null);
    return asTextContent(db.prepare('SELECT * FROM activity_logs WHERE id = ?').get(id));
  });

  // ─── post_guestbook_entry ────────────────────────────────

  server.registerTool('post_guestbook_entry', {
    description: 'Leave a guestbook / encouragement note at user/goal/sub-goal/action level.',
    inputSchema: {
      agentName: z.string().describe('Name of the AI agent'),
      comment: z.string().describe('Comment or encouragement'),
      targetType: z.enum(['user', 'goal', 'subgoal', 'action']).describe('Target level'),
      targetId: z.string().optional().describe('Target ID (optional for user level)'),
    },
  }, async (args, extra) => {
    const userId = getUserId(extra);
    const id = uuidv4();
    db.prepare('INSERT INTO guestbook (id, user_id, agent_name, comment, target_type, target_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, userId, args.agentName, args.comment, args.targetType, args.targetId || null);
    return asTextContent(db.prepare('SELECT * FROM guestbook WHERE id = ?').get(id));
  });

  // ─── reorder_subgoal ─────────────────────────────────────

  server.registerTool('reorder_subgoal', {
    description: 'Move a sub-goal to a new slot (1-8).',
    inputSchema: {
      subGoalId: z.string().describe('Sub-goal ID'),
      targetPosition: z.number().describe('New position (1-8)'),
    },
  }, async (args, extra) => {
    const userId = getUserId(extra);
    const subGoal = ownedSubGoal(args.subGoalId, userId);
    if (!subGoal) throw new Error('Sub-goal not found or access denied');

    const reorder = db.transaction(() => {
      // Move any existing item at target position to a temp slot
      db.prepare('UPDATE sub_goals SET position = -1 WHERE primary_goal_id = ? AND position = ?')
        .run(subGoal.primary_goal_id, args.targetPosition);
      // Move our item to target
      db.prepare('UPDATE sub_goals SET position = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(args.targetPosition, args.subGoalId);
      // Move displaced item to our old position
      db.prepare('UPDATE sub_goals SET position = ?, updated_at = datetime(\'now\') WHERE primary_goal_id = ? AND position = -1')
        .run(subGoal.position, subGoal.primary_goal_id);
    });
    reorder();

    return asTextContent(db.prepare('SELECT * FROM sub_goals WHERE id = ?').get(args.subGoalId));
  });

  // ─── reorder_action ──────────────────────────────────────

  server.registerTool('reorder_action', {
    description: 'Reorder an action within its sub-goal (1-8).',
    inputSchema: {
      actionId: z.string().describe('Action ID'),
      targetPosition: z.number().describe('New position (1-8)'),
    },
  }, async (args, extra) => {
    const userId = getUserId(extra);
    const action = ownedAction(args.actionId, userId);
    if (!action) throw new Error('Action not found or access denied');

    const reorder = db.transaction(() => {
      db.prepare('UPDATE action_items SET position = -1 WHERE sub_goal_id = ? AND position = ?')
        .run(action.sub_goal_id, args.targetPosition);
      db.prepare('UPDATE action_items SET position = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(args.targetPosition, args.actionId);
      db.prepare('UPDATE action_items SET position = ?, updated_at = datetime(\'now\') WHERE sub_goal_id = ? AND position = -1')
        .run(action.position, action.sub_goal_id);
    });
    reorder();

    return asTextContent(db.prepare('SELECT * FROM action_items WHERE id = ?').get(args.actionId));
  });

  // ─── bulk_import_goals ───────────────────────────────────

  server.registerTool('bulk_import_goals', {
    description: 'Import one or more complete goal trees (with sub-goals, actions, and logs) in a single operation.',
    inputSchema: {
      goals: z.array(z.object({
        title: z.string(),
        description: z.string().optional(),
        target_date: z.string().optional(),
        status: z.enum(['active', 'completed', 'archived']).optional(),
        subGoals: z.array(z.object({
          position: z.number().min(1).max(8),
          title: z.string(),
          description: z.string().optional(),
          actions: z.array(z.object({
            position: z.number().min(1).max(8),
            title: z.string(),
            description: z.string().optional(),
            completed: z.boolean().optional(),
            completed_at: z.string().optional(),
            due_date: z.string().optional(),
            logs: z.array(z.object({
              log_type: z.enum(['note', 'progress', 'completion', 'media', 'link']),
              content: z.string(),
              log_date: z.string().optional(),
              duration_minutes: z.number().optional(),
              metric_value: z.number().optional(),
              metric_unit: z.string().optional(),
              mood: z.enum(['motivated', 'challenged', 'accomplished', 'frustrated', 'neutral']).optional(),
              tags: z.string().optional(),
              media_url: z.string().optional(),
              media_type: z.string().optional(),
              external_link: z.string().optional(),
            })).optional(),
          })).optional(),
        })).optional(),
      })).describe('Array of goals to import'),
    },
  }, async (args, extra) => {
    const userId = getUserId(extra);

    const importGoals = db.transaction(() => {
      const results: any[] = [];
      for (const goal of args.goals) {
        const goalId = uuidv4();
        db.prepare('INSERT INTO primary_goals (id, user_id, title, description, target_date, status) VALUES (?, ?, ?, ?, ?, ?)')
          .run(goalId, userId, goal.title, goal.description || null, goal.target_date || null, goal.status || 'active');

        const sgResults: any[] = [];
        for (const sg of goal.subGoals || []) {
          const sgId = uuidv4();
          db.prepare('INSERT INTO sub_goals (id, primary_goal_id, position, title, description) VALUES (?, ?, ?, ?, ?)')
            .run(sgId, goalId, sg.position, sg.title, sg.description || null);

          const actionResults: any[] = [];
          for (const action of sg.actions || []) {
            const actionId = uuidv4();
            db.prepare('INSERT INTO action_items (id, sub_goal_id, position, title, description, completed, completed_at, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
              .run(actionId, sgId, action.position, action.title, action.description || null, action.completed ? 1 : 0, action.completed_at || null, action.due_date || null);

            for (const log of action.logs || []) {
              const logId = uuidv4();
              db.prepare('INSERT INTO activity_logs (id, action_item_id, log_type, content, log_date, duration_minutes, metric_value, metric_unit, mood, tags, media_url, media_type, external_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                .run(logId, actionId, log.log_type, log.content, log.log_date || new Date().toISOString().split('T')[0], log.duration_minutes ?? null, log.metric_value ?? null, log.metric_unit || null, log.mood || null, log.tags || null, log.media_url || null, log.media_type || null, log.external_link || null);
            }
            actionResults.push({ id: actionId, title: action.title, position: action.position });
          }
          sgResults.push({ id: sgId, title: sg.title, position: sg.position, actions: actionResults });
        }
        results.push({ id: goalId, title: goal.title, subGoals: sgResults });
      }
      return results;
    });

    return asTextContent(importGoals());
  });

  // ─── delete_resource ─────────────────────────────────────

  server.registerTool('delete_resource', {
    description: 'Delete a resource by type and ID. Supported types: goal, subgoal, action, log, guestbook.',
    inputSchema: {
      resourceType: z.enum(['goal', 'subgoal', 'action', 'log', 'guestbook']).describe('Type of resource'),
      resourceId: z.string().describe('ID of the resource to delete'),
    },
  }, async (args, extra) => {
    const userId = getUserId(extra);

    const deleteMap: Record<string, { check: () => any; table: string }> = {
      goal: { check: () => ownedGoal(args.resourceId, userId), table: 'primary_goals' },
      subgoal: { check: () => ownedSubGoal(args.resourceId, userId), table: 'sub_goals' },
      action: { check: () => ownedAction(args.resourceId, userId), table: 'action_items' },
      log: { check: () => ownedLog(args.resourceId, userId), table: 'activity_logs' },
      guestbook: {
        check: () => db.prepare('SELECT * FROM guestbook WHERE id = ? AND user_id = ?').get(args.resourceId, userId),
        table: 'guestbook',
      },
    };

    const entry = deleteMap[args.resourceType];
    if (!entry) throw new Error(`Unknown resource type: ${args.resourceType}`);

    const resource = entry.check();
    if (!resource) throw new Error(`${args.resourceType} not found or access denied`);

    db.prepare(`DELETE FROM ${entry.table} WHERE id = ?`).run(args.resourceId);
    return asTextContent({ deleted: true, type: args.resourceType, id: args.resourceId });
  });

  // ═══════════════════════════════════════════════════════════════
  // HABITS & TRACKING
  // ═══════════════════════════════════════════════════════════════

  // ─── manage_habit ─────────────────────────────────────────

  server.registerTool('manage_habit', {
    description: 'List, create, update, or delete habits and quit trackers. Supports bulk_create, bulk_update, and bulk_delete via an items array.',
    inputSchema: {
      action: z.enum(MANAGE_HABIT_ACTIONS).describe('Operation to perform'),
      habitId: z.string().optional().describe('Habit ID (required for update/delete)'),
      title: z.string().optional().describe('Habit title (required for create)'),
      emoji: z.string().optional().describe('Emoji icon for the habit'),
      type: z.enum(['habit', 'quit']).optional().describe('Type: habit (build) or quit (stop). Defaults to habit.'),
      frequency: z.enum(['daily', 'weekly']).optional().describe('Tracking frequency'),
      quit_date: z.string().optional().describe('Date quitting started (ISO format, for quits)'),
      subgoal_id: z.string().optional().describe('Link to a sub-goal'),
      archived: z.boolean().optional().describe('Archive/unarchive'),
      include_archived: z.boolean().optional().describe('Include archived habits in list'),
      items: bulkItemsSchema,
    },
  }, async (args, extra) => {
    const userId = getUserId(extra);
    return asTextContent(handleManageHabit(args, userId));
  });

  // ─── log_habit ────────────────────────────────────────────

  server.registerTool('log_habit', {
    description: 'Log a habit completion, remove a log, or get calendar/stats. Use action="log" to mark a habit done for a date, "unlog" to remove, "calendar" for stats and history.',
    inputSchema: {
      action: z.enum(['log', 'unlog', 'calendar']).describe('Operation: log, unlog, or calendar'),
      habitId: z.string().describe('Habit ID'),
      date: z.string().optional().describe('Date (ISO format YYYY-MM-DD, defaults to today)'),
      note: z.string().optional().describe('Optional note for the log entry'),
      year: z.number().optional().describe('Year for calendar view (defaults to current)'),
      month: z.number().optional().describe('Month for calendar view (1-12, defaults to current)'),
    },
  }, async (args, extra) => {
    const userId = getUserId(extra);
    const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(args.habitId, userId) as any;
    if (!habit) throw new Error('Habit not found or access denied');

    const date = args.date || new Date().toISOString().split('T')[0];

    if (args.action === 'log') {
      // Check if already logged
      const existing = db.prepare('SELECT * FROM habit_logs WHERE habit_id = ? AND log_date = ?').get(args.habitId, date);
      if (existing) return asTextContent({ already_logged: true, date, habit: habit.title });
      const id = uuidv4();
      db.prepare('INSERT INTO habit_logs (id, habit_id, log_date, note) VALUES (?, ?, ?, ?)').run(id, args.habitId, date, args.note || null);
      return asTextContent({ logged: true, id, date, habit: habit.title });
    }

    if (args.action === 'unlog') {
      const result = db.prepare('DELETE FROM habit_logs WHERE habit_id = ? AND log_date = ?').run(args.habitId, date);
      return asTextContent({ unlogged: true, date, changes: result.changes });
    }

    if (args.action === 'calendar') {
      const now = new Date();
      const year = args.year || now.getFullYear();
      const month = args.month || now.getMonth() + 1;
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

      const logs = db.prepare('SELECT log_date, note FROM habit_logs WHERE habit_id = ? AND log_date >= ? AND log_date <= ? ORDER BY log_date')
        .all(args.habitId, startDate, endDate);

      // Streak calculation
      const allLogs = db.prepare('SELECT log_date FROM habit_logs WHERE habit_id = ? ORDER BY log_date DESC').all(args.habitId) as any[];
      let currentStreak = 0;
      let checkDate = new Date();
      checkDate.setHours(0, 0, 0, 0);
      for (const log of allLogs) {
        const logDate = log.log_date;
        const expected = checkDate.toISOString().split('T')[0];
        if (logDate === expected) {
          currentStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else if (logDate < expected) {
          break;
        }
      }

      const totalLogs = (db.prepare('SELECT COUNT(*) as count FROM habit_logs WHERE habit_id = ?').get(args.habitId) as any).count;

      return asTextContent({
        habit: habit.title,
        type: habit.type,
        year, month,
        logs,
        stats: { currentStreak, totalLogs, daysInMonth: new Date(year, month, 0).getDate() },
      });
    }

    throw new Error('Invalid action');
  });

  // ═══════════════════════════════════════════════════════════════
  // TASK MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  // ─── manage_task ──────────────────────────────────────────

  server.registerTool('manage_task', {
    description: 'List, create, update, delete tasks, or toggle done/favorite. Supports bulk_create, bulk_update, and bulk_delete via an items array.',
    inputSchema: {
      action: z.enum(MANAGE_TASK_ACTIONS).describe('Operation to perform'),
      taskId: z.string().optional().describe('Task ID (required for update/delete/toggle)'),
      title: z.string().optional().describe('Task title (required for create)'),
      description: z.string().optional(),
      project_id: z.string().optional().describe('Project ID to assign task to'),
      sprint_id: z.string().optional().describe('Sprint ID to assign task to'),
      bucket_id: z.string().optional().describe('Bucket/column ID within a sprint'),
      priority: z.number().optional().describe('Priority: 0=none, 1=low, 2=medium, 3=high, 4=urgent'),
      due_date: z.string().optional().describe('Due date (ISO format)'),
      start_date: z.string().optional().describe('Start date (ISO format)'),
      end_date: z.string().optional().describe('End date (ISO format)'),
      assignee_name: z.string().optional().describe('Assignee display name'),
      task_type: z.string().optional().describe('Task type (e.g. task, bug, feature, story)'),
      hex_color: z.string().optional().describe('Color hex code for the task'),
      percent_done: z.number().optional().describe('Completion percentage (0-100)'),
      labels: z.array(z.string()).optional().describe('Array of label IDs to assign'),
      links: z.array(z.object({
        target_type: z.enum(['goal', 'subgoal', 'habit', 'pomodoro']),
        target_id: z.string(),
      })).optional().describe('Array of links to goals/subgoals/habits/pomodoros'),
      // List filters
      filter_done: z.boolean().optional().describe('Filter by completion status'),
      filter_priority: z.number().optional().describe('Filter by priority level'),
      filter_project: z.string().optional().describe('Filter by project ID'),
      filter_sprint: z.string().optional().describe('Filter by sprint ID'),
      filter_label: z.string().optional().describe('Filter by label ID'),
      filter_favorite: z.boolean().optional().describe('Filter favorites only'),
      filter_project_type: z.string().optional().describe('Filter by project type (e.g. dev, personal)'),
      filter_exclude_types: z.string().optional().describe('Comma-separated project types to exclude (e.g. "dev,work")'),
      search: z.string().optional().describe('Search tasks by title'),
      items: bulkItemsSchema,
    },
  }, async (args, extra) => {
    const userId = getUserId(extra);
    return asTextContent(handleManageTask(args, userId));
  });

  // ─── manage_task_comment ──────────────────────────────────

  server.registerTool('manage_task_comment', {
    description: 'List, add, or delete comments on a task. Supports bulk_create and bulk_delete via an items array.',
    inputSchema: {
      action: z.enum(MANAGE_TASK_COMMENT_ACTIONS).describe('Operation to perform'),
      taskId: z.string().optional().describe('Task ID (required for list and single-item create/delete, or per item in bulk actions)'),
      commentId: z.string().optional().describe('Comment ID (required for delete)'),
      content: z.string().optional().describe('Comment text (required for create)'),
      items: bulkItemsSchema,
    },
  }, async (args, extra) => {
    const userId = getUserId(extra);
    return asTextContent(handleManageTaskComment(args, userId));
  });

  // ═══════════════════════════════════════════════════════════════
  // PROJECTS & LABELS
  // ═══════════════════════════════════════════════════════════════

  // ─── manage_project ───────────────────────────────────────

  server.registerTool('manage_project', {
    description: 'List, create, update, delete, archive, or favorite projects. Supports bulk_create, bulk_update, and bulk_delete via an items array.',
    inputSchema: {
      action: z.enum(MANAGE_PROJECT_ACTIONS).describe('Operation to perform'),
      projectId: z.string().optional().describe('Project ID (required for update/delete/toggle)'),
      title: z.string().optional().describe('Project title (required for create)'),
      description: z.string().optional(),
      hex_color: z.string().optional().describe('Color hex code (e.g. #3b82f6)'),
      type: z.string().optional().describe('Project type (e.g. personal, dev, design, work, research, learning)'),
      parent_project_id: z.string().optional().describe('Parent project ID for nesting'),
      include_tasks: z.boolean().optional().describe('Include tasks in list/get response'),
      include_archived: z.boolean().optional().describe('Include archived projects in list'),
      filter_type: z.string().optional().describe('Filter projects by type'),
      items: bulkItemsSchema,
    },
  }, async (args, extra) => {
    const userId = getUserId(extra);
    return asTextContent(handleManageProject(args, userId));
  });

  // ─── manage_label ─────────────────────────────────────────

  server.registerTool('manage_label', {
    description: 'List, create, update, or delete labels. Supports bulk_create, bulk_update, and bulk_delete via an items array.',
    inputSchema: {
      action: z.enum(MANAGE_LABEL_ACTIONS).describe('Operation to perform'),
      labelId: z.string().optional().describe('Label ID (required for update/delete)'),
      title: z.string().optional().describe('Label title (required for create)'),
      hex_color: z.string().optional().describe('Color hex code (defaults to #e2e8f0)'),
      description: z.string().optional(),
      items: bulkItemsSchema,
    },
  }, async (args, extra) => {
    const userId = getUserId(extra);
    return asTextContent(handleManageLabel(args, userId));
  });

  // ═══════════════════════════════════════════════════════════════
  // POMODORO SESSIONS
  // ═══════════════════════════════════════════════════════════════

  server.registerTool('manage_pomodoro', {
    description: 'List, create, update, complete, or delete pomodoro sessions. Supports bulk_create, bulk_update, and bulk_delete via an items array.',
    inputSchema: {
      action: z.enum(MANAGE_POMODORO_ACTIONS).describe('Operation to perform'),
      pomodoroId: z.string().optional().describe('Session ID (required for update/complete/delete)'),
      duration_minutes: z.number().optional().describe('Duration in minutes (default 25)'),
      note: z.string().optional().describe('Session note'),
      task_id: z.string().optional().describe('Link session to a task'),
      status: z.enum(['completed', 'cancelled', 'in_progress']).optional().describe('Filter by status (for list)'),
      limit: z.number().optional().describe('Max results to return (for list, default 20)'),
      items: bulkItemsSchema,
    },
  }, async (args, extra) => {
    const userId = getUserId(extra);
    return asTextContent(handleManagePomodoro(args, userId));
  });

  // ═══════════════════════════════════════════════════════════════
  // SHARING
  // ═══════════════════════════════════════════════════════════════

  server.registerTool('manage_share', {
    description: 'Create, list, or revoke share links for goals. Supports bulk_create and bulk_delete via an items array.',
    inputSchema: {
      action: z.enum(MANAGE_SHARE_ACTIONS).describe('Operation to perform'),
      shareId: z.string().optional().describe('Share link ID (required for revoke)'),
      goalId: z.string().optional().describe('Goal ID (required for create, optional filter for list)'),
      show_logs: z.boolean().optional().describe('Show activity logs in shared view (default false)'),
      show_guestbook: z.boolean().optional().describe('Show guestbook in shared view (default false)'),
      items: bulkItemsSchema,
    },
  }, async (args, extra) => {
    const userId = getUserId(extra);
    return asTextContent(handleManageShare(args, userId));
  });

  // ═══════════════════════════════════════════════════════════════
  // AGENT ETIQUETTE
  // ═══════════════════════════════════════════════════════════════

  server.registerTool('manage_etiquette', {
    description: 'List, add, update, delete, or reset agent etiquette rules. Supports bulk_create, bulk_update, and bulk_delete via an items array.',
    inputSchema: {
      action: z.enum(MANAGE_ETIQUETTE_ACTIONS).describe('Operation to perform'),
      ruleId: z.string().optional().describe('Rule ID (required for update/delete)'),
      content: z.string().optional().describe('Rule text (required for add/update)'),
      position: z.number().optional().describe('Position/order of the rule'),
      items: bulkItemsSchema,
    },
  }, async (args, extra) => {
    const userId = getUserId(extra);
    return asTextContent(handleManageEtiquette(args, userId));
  });

  // ═══════════════════════════════════════════════════════════════
  // CROSS-DOMAIN SEARCH
  // ═══════════════════════════════════════════════════════════════

  server.registerTool('search', {
    description: 'Search across goals, sub-goals, habits, tasks, projects, and notes by title/content. Returns typed results from all domains.',
    inputSchema: {
      query: z.string().describe('Search query (matched against titles)'),
      domains: z.array(z.enum(['goals', 'subgoals', 'habits', 'tasks', 'projects', 'notes'])).optional()
        .describe('Limit search to specific domains (defaults to all)'),
      limit: z.number().optional().describe('Max results per domain (default 10)'),
    },
  }, async (args, extra) => {
    const userId = getUserId(extra);
    const q = `%${args.query}%`;
    const limit = args.limit || 10;
    const domains = args.domains || ['goals', 'subgoals', 'habits', 'tasks', 'projects', 'notes'];
    const results: any = {};

    if (domains.includes('goals')) {
      results.goals = db.prepare('SELECT id, title, status, description FROM primary_goals WHERE user_id = ? AND title LIKE ? ORDER BY created_at DESC LIMIT ?')
        .all(userId, q, limit);
    }
    if (domains.includes('subgoals')) {
      results.subgoals = db.prepare(`
        SELECT sg.id, sg.title, sg.position, sg.description, pg.title as goal_title, pg.id as goal_id
        FROM sub_goals sg JOIN primary_goals pg ON sg.primary_goal_id = pg.id
        WHERE pg.user_id = ? AND sg.title LIKE ? ORDER BY pg.created_at DESC LIMIT ?
      `).all(userId, q, limit);
    }
    if (domains.includes('habits')) {
      results.habits = db.prepare('SELECT id, title, emoji, type, frequency, archived FROM habits WHERE user_id = ? AND title LIKE ? ORDER BY created_at DESC LIMIT ?')
        .all(userId, q, limit);
    }
    if (domains.includes('tasks')) {
      results.tasks = db.prepare('SELECT id, title, done, priority, due_date, project_id, sprint_id FROM tasks WHERE user_id = ? AND title LIKE ? ORDER BY created_at DESC LIMIT ?')
        .all(userId, q, limit);
    }
    if (domains.includes('projects')) {
      results.projects = db.prepare('SELECT id, title, type, hex_color, archived, description FROM projects WHERE user_id = ? AND title LIKE ? ORDER BY created_at DESC LIMIT ?')
        .all(userId, q, limit);
    }
    if (domains.includes('notes')) {
      results.notes = db.prepare('SELECT id, content, created_at, updated_at FROM quick_notes WHERE user_id = ? AND content LIKE ? ORDER BY updated_at DESC LIMIT ?')
        .all(userId, q, limit);
    }

    return asTextContent(results);
  });

  // ═══════════════════════════════════════════════════════════════
  // SPRINTS
  // ═══════════════════════════════════════════════════════════════

  server.registerTool('manage_sprint', {
    description: 'List, create, get, update, delete sprints, or transition sprint status. Supports bulk_create, bulk_update, and bulk_delete via an items array.',
    inputSchema: {
      action: z.enum(MANAGE_SPRINT_ACTIONS).describe('Operation to perform'),
      sprintId: z.string().optional().describe('Sprint ID (required for get/update/delete/transition_status)'),
      projectId: z.string().optional().describe('Project ID (required for list/create)'),
      title: z.string().optional().describe('Sprint title (required for create)'),
      description: z.string().optional().describe('Sprint description'),
      start_date: z.string().optional().describe('Start date (ISO format)'),
      end_date: z.string().optional().describe('End date (ISO format)'),
      status: z.enum(['planned', 'active', 'completed']).optional().describe('Target status for transition_status action'),
      items: bulkItemsSchema,
    },
  }, async (args, extra) => {
    const userId = getUserId(extra);
    return asTextContent(handleManageSprint(args, userId));
  });

  // ─── manage_sprint_column ──────────────────────────────────

  server.registerTool('manage_sprint_column', {
    description: 'List, create, update, or delete columns within a sprint board. Supports bulk_create, bulk_update, and bulk_delete via an items array.',
    inputSchema: {
      action: z.enum(MANAGE_SPRINT_COLUMN_ACTIONS).describe('Operation to perform'),
      sprintId: z.string().optional().describe('Sprint ID (required for list and single-item create/update/delete, or per item in bulk actions)'),
      columnId: z.string().optional().describe('Column ID (required for update/delete)'),
      title: z.string().optional().describe('Column title (required for create)'),
      position: z.number().optional().describe('Column position'),
      is_done_column: z.boolean().optional().describe('Whether tasks in this column count as done'),
      items: bulkItemsSchema,
    },
  }, async (args, extra) => {
    const userId = getUserId(extra);
    return asTextContent(handleManageSprintColumn(args, userId));
  });

  // ═══════════════════════════════════════════════════════════════
  // QUICK NOTES
  // ═══════════════════════════════════════════════════════════════

  server.registerTool('manage_note', {
    description: 'List, create, update, or delete quick notes. Supports bulk_create, bulk_update, and bulk_delete via an items array.',
    inputSchema: {
      action: z.enum(MANAGE_NOTE_ACTIONS).describe('Operation to perform'),
      noteId: z.string().optional().describe('Note ID (required for update/delete)'),
      content: z.string().optional().describe('Note content/text (required for create)'),
      items: bulkItemsSchema,
    },
  }, async (args, extra) => {
    const userId = getUserId(extra);
    return asTextContent(handleManageNote(args, userId));
  });

  // ── manage_event ──────────────────────────────────────────────
  server.registerTool('manage_event', {
    description: 'List, create, update, or delete calendar events. Supports bulk_create, bulk_update, and bulk_delete via an items array.',
    inputSchema: {
      action: z.enum(MANAGE_EVENT_ACTIONS).describe('Operation to perform'),
      eventId: z.string().optional().describe('Event ID (required for update/delete)'),
      title: z.string().optional().describe('Event title (required for create)'),
      description: z.string().optional().describe('Event description'),
      start_date: z.string().optional().describe('Start date/time in ISO format (required for create)'),
      end_date: z.string().optional().describe('End date/time in ISO format'),
      all_day: z.boolean().optional().describe('Whether this is an all-day event'),
      color: z.string().optional().describe('Color hex code (e.g. #3b82f6)'),
      location: z.string().optional().describe('Event location'),
      filter_start: z.string().optional().describe('Filter: events starting on or after this date'),
      filter_end: z.string().optional().describe('Filter: events starting on or before this date'),
      items: bulkItemsSchema,
    },
  }, async (args, extra) => {
    const userId = getUserId(extra);
    return asTextContent(handleManageEvent(args, userId));
  });

  return server;
}
