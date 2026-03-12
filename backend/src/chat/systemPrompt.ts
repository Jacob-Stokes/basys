/**
 * Builds the system prompt for the AI chat sidebar.
 */

import { db, AgentEtiquette, PrimaryGoal } from '../db/database';
import { seedDefaultEtiquette } from '../utils/etiquette';

export function buildSystemPrompt(userId: string): string {
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any;
  const username = user?.username || 'User';

  // Etiquette rules
  seedDefaultEtiquette(userId);
  const rules = db.prepare('SELECT content FROM agent_etiquette WHERE user_id = ? ORDER BY position').all(userId) as AgentEtiquette[];
  const etiquetteBlock = rules.map(r => `- ${r.content}`).join('\n');

  // Memory
  const memories = db.prepare('SELECT content, category FROM chat_memory WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(userId) as any[];
  const memoryBlock = memories.length > 0
    ? memories.map(m => `- [${m.category}] ${m.content}`).join('\n')
    : 'No memories saved yet.';

  // Quick stats
  const activeGoals = (db.prepare("SELECT COUNT(*) as c FROM primary_goals WHERE user_id = ? AND status = 'active'").get(userId) as any).c;
  const openTasks = (db.prepare('SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND done = 0').get(userId) as any).c;
  const activeHabits = (db.prepare('SELECT COUNT(*) as c FROM habits WHERE user_id = ? AND archived = 0').get(userId) as any).c;
  const activeProjects = (db.prepare('SELECT COUNT(*) as c FROM projects WHERE user_id = ? AND archived = 0').get(userId) as any).c;

  // Active goals (compact)
  const goals = db.prepare("SELECT id, title, status FROM primary_goals WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC").all(userId) as PrimaryGoal[];
  const goalLines = goals.map(g => {
    const sgs = db.prepare('SELECT title, position FROM sub_goals WHERE primary_goal_id = ? ORDER BY position').all(g.id) as any[];
    const sgList = sgs.map(sg => `  ${sg.position}. ${sg.title}`).join('\n');
    return `- ${g.title}\n${sgList}`;
  }).join('\n');

  return `You are the Thesys AI assistant — a helpful, knowledgeable companion embedded in ${username}'s personal productivity app.

## About Thesys
Thesys is a personal productivity suite built on the Harada Method: each primary goal has 8 sub-goals, each sub-goal has 8 action items (64 actions total per goal). It also includes tasks, projects, habits, pomodoro sessions, and a journal.

## Your Capabilities
You can read and modify all of ${username}'s data using the tools available to you:
- Goals, sub-goals, and actions (create, update, reorder, delete)
- Activity logs (track progress on actions)
- Tasks and projects (create, manage, filter)
- Habits (create, log completions, view streaks)
- Pomodoro sessions
- Labels and share links
- Memory (save and recall facts about the user)

## Etiquette
${etiquetteBlock}

## What You Remember About ${username}
${memoryBlock}

## Current Stats
- Active goals: ${activeGoals}
- Open tasks: ${openTasks}
- Active habits: ${activeHabits}
- Active projects: ${activeProjects}

## Active Goals
${goalLines || 'No active goals.'}

## Guidelines
- Be concise and helpful. Prefer action over lengthy explanations.
- When the user asks you to do something, use the appropriate tool. Don't just describe what you would do.
- Use save_memory when the user shares preferences, important context, or asks you to remember something.
- When showing data, format it cleanly with markdown.
- You are a personal assistant — be warm but efficient.`;
}
