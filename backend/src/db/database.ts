import Database from 'better-sqlite3';
import { seedDefaultEtiquette } from '../utils/etiquette';

const DB_PATH = process.env.DATABASE_URL?.replace('file:', '') || './data/harada.db';

// Initialize database connection
export const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// SQL Schema
const SCHEMA = `
-- Harada Method Database Schema

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- API Keys table for AI agents
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  last_used_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS primary_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  target_date TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'archived')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sub_goals (
  id TEXT PRIMARY KEY,
  primary_goal_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK(position >= -99 AND position <= 8),
  title TEXT NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (primary_goal_id) REFERENCES primary_goals(id) ON DELETE CASCADE,
  UNIQUE(primary_goal_id, position)
);

CREATE TABLE IF NOT EXISTS action_items (
  id TEXT PRIMARY KEY,
  sub_goal_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK(position >= -99 AND position <= 8),
  title TEXT NOT NULL,
  description TEXT,
  completed INTEGER DEFAULT 0 CHECK(completed IN (0, 1)),
  completed_at TEXT,
  due_date TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (sub_goal_id) REFERENCES sub_goals(id) ON DELETE CASCADE,
  UNIQUE(sub_goal_id, position)
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  action_item_id TEXT NOT NULL,
  log_type TEXT NOT NULL CHECK(log_type IN ('note', 'progress', 'completion', 'media', 'link')),
  content TEXT,
  log_date TEXT NOT NULL,
  duration_minutes INTEGER,
  metric_value REAL,
  metric_unit TEXT,
  media_url TEXT,
  media_type TEXT CHECK(media_type IN ('image', 'video', 'document', 'audio')),
  external_link TEXT,
  mood TEXT CHECK(mood IN ('motivated', 'challenged', 'accomplished', 'frustrated', 'neutral')),
  tags TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (action_item_id) REFERENCES action_items(id) ON DELETE CASCADE
);

-- Guestbook for AI agents to leave comments
CREATE TABLE IF NOT EXISTS guestbook (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  comment TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('user', 'goal', 'subgoal', 'action')),
  target_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Shared goal links for public viewing
CREATE TABLE IF NOT EXISTS shared_goals (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  show_logs INTEGER DEFAULT 0 CHECK(show_logs IN (0, 1)),
  show_guestbook INTEGER DEFAULT 0 CHECK(show_guestbook IN (0, 1)),
  is_active INTEGER DEFAULT 1 CHECK(is_active IN (0, 1)),
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (goal_id) REFERENCES primary_goals(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shared_goals_token ON shared_goals(token);
CREATE INDEX IF NOT EXISTS idx_shared_goals_goal ON shared_goals(goal_id);

-- Custom agent etiquette rules per user
CREATE TABLE IF NOT EXISTS agent_etiquette (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  position INTEGER NOT NULL,
  is_default INTEGER DEFAULT 0 CHECK(is_default IN (0, 1)),
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_etiquette_user ON agent_etiquette(user_id);

-- Habits and Quits tracker
CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  emoji TEXT DEFAULT '',
  type TEXT NOT NULL CHECK(type IN ('habit', 'quit')),
  frequency TEXT DEFAULT 'daily' CHECK(frequency IN ('daily', 'weekly')),
  quit_date TEXT,
  subgoal_id TEXT DEFAULT NULL,
  archived INTEGER DEFAULT 0 CHECK(archived IN (0, 1)),
  position INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS habit_logs (
  id TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL,
  log_date TEXT NOT NULL,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id);
CREATE INDEX IF NOT EXISTS idx_habits_type ON habits(type);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit ON habit_logs(habit_id);
CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_date ON habit_logs(habit_id, log_date);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_sub_goals_primary_goal ON sub_goals(primary_goal_id);
CREATE INDEX IF NOT EXISTS idx_action_items_sub_goal ON action_items(sub_goal_id);
CREATE INDEX IF NOT EXISTS idx_action_items_completed ON action_items(completed);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action_item_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_date ON activity_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_activity_logs_type ON activity_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_guestbook_user ON guestbook(user_id);
CREATE INDEX IF NOT EXISTS idx_guestbook_target ON guestbook(target_type, target_id);

-- Projects (task containers, can be nested)
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  parent_project_id TEXT DEFAULT NULL,
  hex_color TEXT DEFAULT '',
  is_favorite INTEGER DEFAULT 0 CHECK(is_favorite IN (0, 1)),
  position REAL DEFAULT 0,
  archived INTEGER DEFAULT 0 CHECK(archived IN (0, 1)),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Tasks (work items)
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT DEFAULT NULL,
  title TEXT NOT NULL,
  description TEXT,
  done INTEGER DEFAULT 0 CHECK(done IN (0, 1)),
  done_at TEXT,
  due_date TEXT,
  start_date TEXT,
  end_date TEXT,
  priority INTEGER DEFAULT 0,
  hex_color TEXT DEFAULT '',
  percent_done REAL DEFAULT 0,
  position REAL DEFAULT 0,
  bucket_id TEXT DEFAULT NULL,
  is_favorite INTEGER DEFAULT 0 CHECK(is_favorite IN (0, 1)),
  repeat_after INTEGER DEFAULT 0,
  repeat_mode INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

-- Labels (color-coded tags for tasks)
CREATE TABLE IF NOT EXISTS labels (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  hex_color TEXT DEFAULT '#e2e8f0',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Task <-> Label junction
CREATE TABLE IF NOT EXISTS task_labels (
  task_id TEXT NOT NULL,
  label_id TEXT NOT NULL,
  PRIMARY KEY (task_id, label_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE CASCADE
);

-- Task comments
CREATE TABLE IF NOT EXISTS task_comments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Sprints (time-boxed iterations within a project)
CREATE TABLE IF NOT EXISTS sprints (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  sprint_number INTEGER,
  status TEXT DEFAULT 'planned' CHECK(status IN ('planned', 'active', 'completed')),
  start_date TEXT,
  end_date TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Buckets (Kanban columns for projects or sprints)
CREATE TABLE IF NOT EXISTS buckets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  sprint_id TEXT,
  title TEXT NOT NULL,
  position REAL DEFAULT 0,
  is_done_column INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (sprint_id) REFERENCES sprints(id) ON DELETE CASCADE
);

-- Polymorphic task links (many-to-many between tasks and goals/subgoals/habits/pomodoros)
CREATE TABLE IF NOT EXISTS task_links (
  task_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('goal', 'subgoal', 'habit', 'pomodoro')),
  target_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (task_id, target_type, target_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Pomodoro sessions
CREATE TABLE IF NOT EXISTS pomodoro_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_minutes INTEGER DEFAULT 25,
  status TEXT DEFAULT 'completed' CHECK(status IN ('completed', 'cancelled', 'in_progress')),
  note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_links_task ON task_links(task_id);
CREATE INDEX IF NOT EXISTS idx_task_links_target ON task_links(target_type, target_id);
CREATE TABLE IF NOT EXISTS pomodoro_links (
  pomodoro_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('task','project','sprint','goal','subgoal','habit')),
  target_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (pomodoro_id, target_type, target_id),
  FOREIGN KEY (pomodoro_id) REFERENCES pomodoro_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pomodoro_sessions_user ON pomodoro_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_pomodoro_sessions_started ON pomodoro_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_pomo_links_pomo ON pomodoro_links(pomodoro_id);
CREATE INDEX IF NOT EXISTS idx_pomo_links_target ON pomodoro_links(target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_sprints_project ON sprints(project_id);
CREATE INDEX IF NOT EXISTS idx_sprints_status ON sprints(status);

CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_parent ON projects(parent_project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_done ON tasks(done);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_bucket ON tasks(bucket_id);
CREATE INDEX IF NOT EXISTS idx_labels_user ON labels(user_id);
CREATE INDEX IF NOT EXISTS idx_task_labels_task ON task_labels(task_id);
CREATE INDEX IF NOT EXISTS idx_task_labels_label ON task_labels(label_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_buckets_project ON buckets(project_id);

-- OAuth tables for remote MCP endpoint
CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_secret TEXT,
  client_secret_expires_at INTEGER DEFAULT 0,
  redirect_uris TEXT NOT NULL,
  client_name TEXT,
  client_uri TEXT,
  grant_types TEXT,
  response_types TEXT,
  token_endpoint_auth_method TEXT DEFAULT 'client_secret_post',
  scope TEXT,
  client_id_issued_at INTEGER,
  client_metadata TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oauth_auth_codes (
  code TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT DEFAULT 'S256',
  scopes TEXT,
  resource TEXT,
  expires_at INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  token TEXT PRIMARY KEY,
  token_type TEXT NOT NULL CHECK(token_type IN ('access', 'refresh')),
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  scopes TEXT,
  resource TEXT,
  expires_at INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user ON oauth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_expires ON oauth_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_auth_codes_expires ON oauth_auth_codes(expires_at);

-- AI Chat conversations
CREATE TABLE IF NOT EXISTS chat_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT DEFAULT 'New conversation',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_user ON chat_conversations(user_id);

-- Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id);

-- Agent memory: persistent facts the AI remembers about the user
CREATE TABLE IF NOT EXISTS chat_memory (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_memory_user ON chat_memory(user_id);

-- Calendar events
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  all_day INTEGER DEFAULT 0,
  color TEXT DEFAULT '#3b82f6',
  location TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_date);
CREATE INDEX IF NOT EXISTS idx_events_user_start ON events(user_id, start_date);

-- Google Calendar integration tokens
CREATE TABLE IF NOT EXISTS google_calendar_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  token_expiry TEXT NOT NULL,
  google_email TEXT,
  selected_calendars TEXT DEFAULT '[]',
  sync_enabled INTEGER DEFAULT 1,
  last_synced_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_gcal_tokens_user ON google_calendar_tokens(user_id);

-- Cached Google Calendar events
CREATE TABLE IF NOT EXISTS google_calendar_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  google_event_id TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  all_day INTEGER DEFAULT 0,
  location TEXT,
  color TEXT DEFAULT '#4285f4',
  html_link TEXT,
  status TEXT DEFAULT 'confirmed',
  origin TEXT DEFAULT 'google',
  last_synced_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, google_event_id)
);

CREATE INDEX IF NOT EXISTS idx_gcal_events_user ON google_calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_gcal_events_start ON google_calendar_events(start_date);
CREATE INDEX IF NOT EXISTS idx_gcal_events_user_start ON google_calendar_events(user_id, start_date);

-- Cached Gmail messages
CREATE TABLE IF NOT EXISTS gmail_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  gmail_message_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  from_address TEXT,
  from_name TEXT,
  to_address TEXT,
  subject TEXT,
  snippet TEXT,
  body_html TEXT,
  body_text TEXT,
  date TEXT NOT NULL,
  label_ids TEXT DEFAULT '[]',
  is_unread INTEGER DEFAULT 1,
  has_attachments INTEGER DEFAULT 0,
  last_synced_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, gmail_message_id)
);

CREATE INDEX IF NOT EXISTS idx_gmail_messages_user ON gmail_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_date ON gmail_messages(date);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_unread ON gmail_messages(user_id, is_unread);

-- Quick notes (side panel scratch pad)
CREATE TABLE IF NOT EXISTS quick_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quick_notes_user ON quick_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_quick_notes_updated ON quick_notes(user_id, updated_at DESC);

-- Task-to-task relations (subtask, blocking, related, etc.)
CREATE TABLE IF NOT EXISTS task_relations (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  related_task_id TEXT NOT NULL,
  relation_kind TEXT NOT NULL CHECK(relation_kind IN (
    'subtask', 'parent',
    'related',
    'duplicates',
    'blocking', 'blocked_by',
    'precedes', 'follows',
    'copied_from', 'copied_to'
  )),
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (related_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  UNIQUE(task_id, related_task_id, relation_kind)
);

CREATE INDEX IF NOT EXISTS idx_task_relations_task ON task_relations(task_id);
CREATE INDEX IF NOT EXISTS idx_task_relations_related ON task_relations(related_task_id);

-- Task checklist items (lightweight inline subtasks)
CREATE TABLE IF NOT EXISTS task_checklist_items (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  title TEXT NOT NULL,
  done INTEGER DEFAULT 0 CHECK(done IN (0, 1)),
  position INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_checklist_task ON task_checklist_items(task_id);

-- Agent Actions (Claude Code work items per task)
CREATE TABLE IF NOT EXISTS agent_actions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'staged', 'running', 'done', 'failed')),
  position INTEGER DEFAULT 0,
  result TEXT,
  error TEXT,
  started_at TEXT,
  completed_at TEXT,
  commit_hash TEXT,
  files_changed TEXT,
  agent_model TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agent_actions_task ON agent_actions(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_actions_user_status ON agent_actions(user_id, status);

-- Action Templates (reusable presets for agent actions)
CREATE TABLE IF NOT EXISTS action_templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  default_config TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Personal CRM: Contacts
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  nickname TEXT,
  company TEXT,
  job_title TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  location TEXT,
  birthday TEXT,
  how_met TEXT,
  notes TEXT,
  relationship_type TEXT DEFAULT 'acquaintance',
  contact_frequency_days INTEGER,
  last_contacted_at TEXT,
  is_favorite INTEGER DEFAULT 0,
  archived INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);

-- Contact interaction log
CREATE TABLE IF NOT EXISTS contact_interactions (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT,
  description TEXT,
  interaction_date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_contact_interactions_contact ON contact_interactions(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_interactions_user ON contact_interactions(user_id);

-- Contact tags (many-to-many)
CREATE TABLE IF NOT EXISTS contact_tags (
  contact_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (contact_id, tag),
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);

-- Contact custom fields (flexible key-value)
CREATE TABLE IF NOT EXISTS contact_field_values (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  field_group TEXT NOT NULL,
  field_label TEXT NOT NULL,
  field_value TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_contact_fields_contact ON contact_field_values(contact_id);
`;

// Initialize schema
export function initDatabase() {
  db.exec(SCHEMA);

  // Migration: Add user_id to existing goals if column doesn't exist
  try {
    // Check if user_id column exists
    const tableInfo = db.prepare("PRAGMA table_info(primary_goals)").all() as any[];
    const hasUserId = tableInfo.some((col: any) => col.name === 'user_id');

    if (!hasUserId) {
      console.log('Migrating existing goals to add user_id...');

      // Get first user (should be jacob)
      const firstUser = db.prepare('SELECT id FROM users LIMIT 1').get() as any;

      if (firstUser) {
        // Add column with default value
        db.exec(`ALTER TABLE primary_goals ADD COLUMN user_id TEXT DEFAULT '${firstUser.id}'`);
        console.log(`Linked existing goals to user: ${firstUser.id}`);
      }
    }

    // Create index after column exists
    db.exec('CREATE INDEX IF NOT EXISTS idx_primary_goals_user ON primary_goals(user_id)');
  } catch (err) {
    console.log('Migration check:', err);
  }

  // Migration: Add allow_query_param_auth to users table
  try {
    const userCols = db.prepare("PRAGMA table_info(users)").all() as any[];
    if (!userCols.some((col: any) => col.name === 'allow_query_param_auth')) {
      db.exec(`ALTER TABLE users ADD COLUMN allow_query_param_auth INTEGER DEFAULT 1`);
      console.log('Added allow_query_param_auth column to users table');
    }
  } catch (err) {
    console.log('Migration check (allow_query_param_auth):', err);
  }

  // Migration: Add is_admin to users table and promote first user
  try {
    const adminCols = db.prepare("PRAGMA table_info(users)").all() as any[];
    if (!adminCols.some((col: any) => col.name === 'is_admin')) {
      db.exec(`ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`);
      // Promote the first (oldest) user to admin
      db.exec(`UPDATE users SET is_admin = 1 WHERE id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1)`);
      console.log('Added is_admin column and promoted first user to admin');
    }
  } catch (err) {
    console.log('Migration check (is_admin):', err);
  }

  // Migration: Add theme_json to primary_goals
  try {
    const goalCols = db.prepare("PRAGMA table_info(primary_goals)").all() as any[];
    if (!goalCols.some((col: any) => col.name === 'theme_json')) {
      db.exec(`ALTER TABLE primary_goals ADD COLUMN theme_json TEXT DEFAULT NULL`);
      console.log('Added theme_json column to primary_goals');
    }
  } catch (err) {
    console.log('Migration check (theme_json):', err);
  }

  // Migration: Add subgoal_id to habits table
  try {
    const habitCols = db.prepare("PRAGMA table_info(habits)").all() as any[];
    if (!habitCols.some((col: any) => col.name === 'subgoal_id')) {
      db.exec(`ALTER TABLE habits ADD COLUMN subgoal_id TEXT DEFAULT NULL`);
      console.log('Added subgoal_id column to habits table');
    }
    // Always ensure index exists (safe for both fresh and migrated DBs)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_habits_subgoal ON habits(subgoal_id)`);
  } catch (err) {
    console.log('Migration check (habits subgoal_id):', err);
  }

  // Migration: Move task/project subgoal_id data to task_links
  try {
    const taskCols = db.prepare("PRAGMA table_info(tasks)").all() as any[];
    if (taskCols.some((col: any) => col.name === 'subgoal_id')) {
      // Migrate any existing subgoal_id references to task_links
      const tasksWithSubgoal = db.prepare("SELECT id, subgoal_id FROM tasks WHERE subgoal_id IS NOT NULL").all() as any[];
      if (tasksWithSubgoal.length > 0) {
        const insert = db.prepare("INSERT OR IGNORE INTO task_links (task_id, target_type, target_id) VALUES (?, 'subgoal', ?)");
        for (const t of tasksWithSubgoal) {
          insert.run(t.id, t.subgoal_id);
        }
        db.prepare("UPDATE tasks SET subgoal_id = NULL WHERE subgoal_id IS NOT NULL").run();
        console.log(`Migrated ${tasksWithSubgoal.length} task subgoal links to task_links`);
      }
    }
  } catch (err) {
    console.log('Migration check (task subgoal_id -> task_links):', err);
  }

  // Migration: Seed default agent etiquette for existing users
  try {
    const users = db.prepare('SELECT id FROM users').all() as any[];
    for (const user of users) {
      seedDefaultEtiquette(user.id);
    }
  } catch (err) {
    console.log('Migration check (agent_etiquette seed):', err);
  }

  // Migration: Add display_name to users table
  try {
    const userCols = db.prepare("PRAGMA table_info(users)").all() as any[];
    if (!userCols.some((col: any) => col.name === 'display_name')) {
      db.exec(`ALTER TABLE users ADD COLUMN display_name TEXT DEFAULT NULL`);
      console.log('Added display_name column to users table');
    }
  } catch (err) {
    console.log('Migration check (display_name):', err);
  }

  // Migration: Add weather/timezone/temperature settings to users table
  try {
    const userCols = db.prepare("PRAGMA table_info(users)").all() as any[];
    if (!userCols.some((col: any) => col.name === 'weather_latitude')) {
      db.exec(`ALTER TABLE users ADD COLUMN weather_latitude REAL DEFAULT NULL`);
      db.exec(`ALTER TABLE users ADD COLUMN weather_longitude REAL DEFAULT NULL`);
      db.exec(`ALTER TABLE users ADD COLUMN weather_location_name TEXT DEFAULT NULL`);
      db.exec(`ALTER TABLE users ADD COLUMN timezone TEXT DEFAULT NULL`);
      db.exec(`ALTER TABLE users ADD COLUMN use_browser_time INTEGER DEFAULT 1`);
      db.exec(`ALTER TABLE users ADD COLUMN temperature_unit TEXT DEFAULT 'celsius'`);
      console.log('Added weather/timezone/temperature columns to users table');
    }
  } catch (err) {
    console.log('Migration check (weather/timezone):', err);
  }

  // Add origin column to google_calendar_events
  try {
    const cols = db.prepare("PRAGMA table_info(google_calendar_events)").all() as any[];
    if (!cols.find((c: any) => c.name === 'origin')) {
      db.exec(`ALTER TABLE google_calendar_events ADD COLUMN origin TEXT DEFAULT 'google'`);
      console.log('Added origin column to google_calendar_events table');
    }
  } catch (err) {
    console.log('Migration check (gcal origin):', err);
  }

  // Add Gmail columns to google_calendar_tokens
  try {
    const cols = db.prepare("PRAGMA table_info(google_calendar_tokens)").all() as any[];
    if (!cols.find((c: any) => c.name === 'granted_scopes')) {
      db.exec(`ALTER TABLE google_calendar_tokens ADD COLUMN granted_scopes TEXT DEFAULT '[]'`);
      db.exec(`ALTER TABLE google_calendar_tokens ADD COLUMN gmail_sync_enabled INTEGER DEFAULT 0`);
      db.exec(`ALTER TABLE google_calendar_tokens ADD COLUMN gmail_last_synced_at TEXT`);
      console.log('Added Gmail columns to google_calendar_tokens table');
    }
  } catch (err) {
    console.log('Migration check (gmail columns):', err);
  }

  // Migration: Add type to projects
  try {
    const projCols = db.prepare("PRAGMA table_info(projects)").all() as any[];
    if (!projCols.some((col: any) => col.name === 'type')) {
      db.exec(`ALTER TABLE projects ADD COLUMN type TEXT DEFAULT 'personal'`);
      console.log('Added type column to projects table');
    }
  } catch (err) {
    console.log('Migration check (projects type):', err);
  }

  // Migration: Add sprint/assignee/task_type columns to tasks
  try {
    const taskCols = db.prepare("PRAGMA table_info(tasks)").all() as any[];
    if (!taskCols.some((col: any) => col.name === 'sprint_id')) {
      db.exec(`ALTER TABLE tasks ADD COLUMN sprint_id TEXT DEFAULT NULL`);
      db.exec(`ALTER TABLE tasks ADD COLUMN assignee_user_id TEXT DEFAULT NULL`);
      db.exec(`ALTER TABLE tasks ADD COLUMN assignee_name TEXT DEFAULT NULL`);
      db.exec(`ALTER TABLE tasks ADD COLUMN task_type TEXT DEFAULT 'task'`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_sprint ON tasks(sprint_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_user_id)`);
      console.log('Added sprint/assignee/task_type columns to tasks table');
    }
  } catch (err) {
    console.log('Migration check (tasks sprint):', err);
  }

  // Migration: Add sprint_id and is_done_column to buckets
  try {
    const bucketCols = db.prepare("PRAGMA table_info(buckets)").all() as any[];
    if (!bucketCols.some((col: any) => col.name === 'sprint_id')) {
      db.exec(`ALTER TABLE buckets ADD COLUMN sprint_id TEXT DEFAULT NULL`);
      db.exec(`ALTER TABLE buckets ADD COLUMN is_done_column INTEGER DEFAULT 0`);
      console.log('Added sprint_id and is_done_column to buckets table');
    }
    db.exec(`CREATE INDEX IF NOT EXISTS idx_buckets_sprint ON buckets(sprint_id)`);
  } catch (err) {
    console.log('Migration check (buckets sprint):', err);
  }

  // Migration: Add todo_hidden_project_types to users
  try {
    const userCols = db.prepare("PRAGMA table_info(users)").all() as any[];
    if (!userCols.some((col: any) => col.name === 'todo_hidden_project_types')) {
      db.exec(`ALTER TABLE users ADD COLUMN todo_hidden_project_types TEXT DEFAULT 'dev'`);
      console.log('Added todo_hidden_project_types to users table');
    }
  } catch (err) {
    console.log('Migration check (todo_hidden_project_types):', err);
  }

  // Migration: Add project_mode to projects
  try {
    const projCols2 = db.prepare("PRAGMA table_info(projects)").all() as any[];
    if (!projCols2.some((col: any) => col.name === 'project_mode')) {
      db.exec(`ALTER TABLE projects ADD COLUMN project_mode TEXT DEFAULT 'simple'`);
      // Backfill: dev projects default to sprint mode
      db.exec(`UPDATE projects SET project_mode = 'sprint' WHERE type = 'dev'`);
      console.log('Added project_mode column to projects table');
    }
  } catch (err) {
    console.log('Migration check (projects project_mode):', err);
  }

  // Migration: Add default_columns to projects
  try {
    const projCols3 = db.prepare("PRAGMA table_info(projects)").all() as any[];
    if (!projCols3.some((col: any) => col.name === 'default_columns')) {
      db.exec(`ALTER TABLE projects ADD COLUMN default_columns TEXT DEFAULT NULL`);
      console.log('Added default_columns column to projects table');
    }
  } catch (err) {
    console.log('Migration check (projects default_columns):', err);
  }

  // Migration: Add Obsidian integration columns to users
  try {
    const userCols8 = db.prepare("PRAGMA table_info(users)").all() as any[];
    if (!userCols8.some((col: any) => col.name === 'obsidian_vault_name')) {
      db.exec(`ALTER TABLE users ADD COLUMN obsidian_vault_name TEXT DEFAULT NULL`);
      db.exec(`ALTER TABLE users ADD COLUMN obsidian_enabled INTEGER DEFAULT 0`);
      console.log('Added Obsidian integration columns to users table');
    }
  } catch (err) {
    console.log('Migration check (obsidian users):', err);
  }

  // Migration: Add obsidian_path to projects
  try {
    const projCols4 = db.prepare("PRAGMA table_info(projects)").all() as any[];
    if (!projCols4.some((col: any) => col.name === 'obsidian_path')) {
      db.exec(`ALTER TABLE projects ADD COLUMN obsidian_path TEXT DEFAULT NULL`);
      console.log('Added obsidian_path column to projects table');
    }
  } catch (err) {
    console.log('Migration check (projects obsidian_path):', err);
  }

  // Migration: Add obsidian_path to sprints
  try {
    const sprintCols = db.prepare("PRAGMA table_info(sprints)").all() as any[];
    if (!sprintCols.some((col: any) => col.name === 'obsidian_path')) {
      db.exec(`ALTER TABLE sprints ADD COLUMN obsidian_path TEXT DEFAULT NULL`);
      console.log('Added obsidian_path column to sprints table');
    }
  } catch (err) {
    console.log('Migration check (sprints obsidian_path):', err);
  }

  // Migration: Add archived column to sprints
  try {
    const sprintCols2 = db.prepare("PRAGMA table_info(sprints)").all() as any[];
    if (!sprintCols2.some((col: any) => col.name === 'archived')) {
      db.exec(`ALTER TABLE sprints ADD COLUMN archived INTEGER DEFAULT 0`);
      console.log('Added archived column to sprints table');
    }
  } catch (err) {
    console.log('Migration check (sprints archived):', err);
  }

  // Migration: Add archived column to tasks
  try {
    const taskCols = db.prepare("PRAGMA table_info(tasks)").all() as any[];
    if (!taskCols.some((col: any) => col.name === 'archived')) {
      db.exec(`ALTER TABLE tasks ADD COLUMN archived INTEGER DEFAULT 0`);
      console.log('Added archived column to tasks table');
    }
  } catch (err) {
    console.log('Migration check (tasks archived):', err);
  }

  // Migration: Add emoji and show_inline columns to buckets
  try {
    const bucketCols = db.prepare("PRAGMA table_info(buckets)").all() as any[];
    if (!bucketCols.some((col: any) => col.name === 'emoji')) {
      db.exec(`ALTER TABLE buckets ADD COLUMN emoji TEXT DEFAULT NULL`);
      db.exec(`ALTER TABLE buckets ADD COLUMN show_inline INTEGER DEFAULT 1`);
      console.log('Added emoji and show_inline columns to buckets table');
    }
  } catch (err) {
    console.log('Migration check (buckets emoji):', err);
  }

  // Migration: Backfill emoji on existing buckets that have none
  try {
    const nullEmojiCount = (db.prepare(`SELECT COUNT(*) as c FROM buckets WHERE emoji IS NULL`).get() as any).c;
    if (nullEmojiCount > 0) {
      db.exec(`UPDATE buckets SET emoji = '📋' WHERE emoji IS NULL AND title LIKE '%To Do%' AND is_done_column = 0`);
      db.exec(`UPDATE buckets SET emoji = '📥' WHERE emoji IS NULL AND title LIKE '%Backlog%' AND is_done_column = 0`);
      db.exec(`UPDATE buckets SET emoji = '🔨' WHERE emoji IS NULL AND title LIKE '%Progress%' AND is_done_column = 0`);
      db.exec(`UPDATE buckets SET emoji = '👀' WHERE emoji IS NULL AND title LIKE '%Review%' AND is_done_column = 0`);
      db.exec(`UPDATE buckets SET emoji = '🎨' WHERE emoji IS NULL AND title LIKE '%Design%' AND is_done_column = 0`);
      db.exec(`UPDATE buckets SET emoji = '💻' WHERE emoji IS NULL AND title LIKE '%Development%' AND is_done_column = 0`);
      db.exec(`UPDATE buckets SET emoji = '🧪' WHERE emoji IS NULL AND title LIKE '%Test%' AND is_done_column = 0`);
      db.exec(`UPDATE buckets SET emoji = '✅' WHERE emoji IS NULL AND is_done_column = 1`);
      db.exec(`UPDATE buckets SET emoji = '📌' WHERE emoji IS NULL`);
      console.log(`Backfilled emoji on ${nullEmojiCount} buckets`);
    }
  } catch (err) {
    console.log('Migration check (buckets emoji backfill):', err);
  }

  // Migration: Add new columns to agent_actions (config, dependencies, cost tracking)
  try {
    const aaCols = db.prepare("PRAGMA table_info(agent_actions)").all() as any[];
    if (!aaCols.some((col: any) => col.name === 'config')) {
      db.exec(`ALTER TABLE agent_actions ADD COLUMN config TEXT DEFAULT NULL`);
      db.exec(`ALTER TABLE agent_actions ADD COLUMN depends_on TEXT DEFAULT NULL`);
      db.exec(`ALTER TABLE agent_actions ADD COLUMN tokens_in INTEGER DEFAULT NULL`);
      db.exec(`ALTER TABLE agent_actions ADD COLUMN tokens_out INTEGER DEFAULT NULL`);
      db.exec(`ALTER TABLE agent_actions ADD COLUMN cost_cents INTEGER DEFAULT NULL`);
      db.exec(`ALTER TABLE agent_actions ADD COLUMN prompt_template TEXT DEFAULT NULL`);
      db.exec(`ALTER TABLE agent_actions ADD COLUMN template_id TEXT DEFAULT NULL`);
      console.log('Added config, depends_on, tokens, cost, prompt_template, template_id columns to agent_actions');
    }
  } catch (err) {
    console.log('Migration check (agent_actions expansion):', err);
  }

  // ── Triggers: enforce bucket belongs to same project as task ──────────
  // A task's bucket must always belong to the same project. This catches
  // bugs where a raw UPDATE or code path bypasses route-level validation.
  // Sprint-level scoping (bucket.sprint_id = task.sprint_id) is still
  // enforced in application code since NULLs make composite FKs impractical.
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_task_bucket_project_insert
    BEFORE INSERT ON tasks
    WHEN NEW.bucket_id IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'Bucket does not belong to task project')
      WHERE NOT EXISTS (
        SELECT 1 FROM buckets
        WHERE id = NEW.bucket_id
        AND project_id = NEW.project_id
      );
    END
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_task_bucket_project_update
    BEFORE UPDATE OF bucket_id, project_id ON tasks
    WHEN NEW.bucket_id IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'Bucket does not belong to task project')
      WHERE NOT EXISTS (
        SELECT 1 FROM buckets
        WHERE id = NEW.bucket_id
        AND project_id = NEW.project_id
      );
    END
  `);

  console.log('Database initialized at:', DB_PATH);
}

// Types
export interface PrimaryGoal {
  id: string;
  title: string;
  description: string | null;
  target_date: string | null;
  status: 'active' | 'completed' | 'archived';
  theme_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubGoal {
  id: string;
  primary_goal_id: string;
  position: number;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActionItem {
  id: string;
  sub_goal_id: string;
  position: number;
  title: string;
  description: string | null;
  completed: number;
  completed_at: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityLog {
  id: string;
  action_item_id: string;
  log_type: 'note' | 'progress' | 'completion' | 'media' | 'link';
  content: string | null;
  log_date: string;
  duration_minutes: number | null;
  metric_value: number | null;
  metric_unit: string | null;
  media_url: string | null;
  media_type: 'image' | 'video' | 'document' | 'audio' | null;
  external_link: string | null;
  mood: 'motivated' | 'challenged' | 'accomplished' | 'frustrated' | 'neutral' | null;
  tags: string | null;
  created_at: string;
  updated_at: string;
}

export interface SharedGoal {
  id: string;
  goal_id: string;
  user_id: string;
  token: string;
  show_logs: number;
  show_guestbook: number;
  is_active: number;
  created_at: string;
}

export interface AgentEtiquette {
  id: string;
  user_id: string;
  content: string;
  position: number;
  is_default: number;
  created_at: string;
}

export interface GuestbookEntry {
  id: string;
  user_id: string;
  agent_name: string;
  comment: string;
  target_type: 'user' | 'goal' | 'subgoal' | 'action';
  target_id: string | null;
  created_at: string;
}

export interface Habit {
  id: string;
  user_id: string;
  title: string;
  emoji: string;
  type: 'habit' | 'quit';
  frequency: string;
  quit_date: string | null;
  subgoal_id: string | null;
  archived: number;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface HabitLog {
  id: string;
  habit_id: string;
  log_date: string;
  note: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  parent_project_id: string | null;
  hex_color: string;
  is_favorite: number;
  position: number;
  archived: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  done: number;
  done_at: string | null;
  due_date: string | null;
  start_date: string | null;
  end_date: string | null;
  priority: number;
  hex_color: string;
  percent_done: number;
  position: number;
  bucket_id: string | null;
  is_favorite: number;
  repeat_after: number;
  repeat_mode: number;
  created_at: string;
  updated_at: string;
}

export interface Label {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  hex_color: string;
  created_at: string;
  updated_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface Sprint {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  sprint_number: number | null;
  status: 'planned' | 'active' | 'completed';
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Bucket {
  id: string;
  project_id: string | null;
  sprint_id: string | null;
  title: string;
  position: number;
  is_done_column: number;
  created_at: string;
}

export interface TaskLink {
  task_id: string;
  target_type: 'goal' | 'subgoal' | 'habit' | 'pomodoro';
  target_id: string;
  created_at: string;
}

export interface PomodoroSession {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number;
  status: 'completed' | 'cancelled' | 'in_progress';
  note: string | null;
  created_at: string;
}

export interface ChatConversation {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ChatMemory {
  id: string;
  user_id: string;
  content: string;
  category: string;
  created_at: string;
}

export interface GoogleCalendarToken {
  id: string;
  user_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expiry: string;
  google_email: string | null;
  selected_calendars: string;
  sync_enabled: number;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GoogleCalendarEvent {
  id: string;
  user_id: string;
  google_event_id: string;
  calendar_id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  all_day: number;
  location: string | null;
  color: string;
  html_link: string | null;
  status: string;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  user_id: string;
  name: string;
  nickname: string | null;
  company: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  location: string | null;
  birthday: string | null;
  how_met: string | null;
  notes: string | null;
  relationship_type: string;
  contact_frequency_days: number | null;
  last_contacted_at: string | null;
  is_favorite: number;
  archived: number;
  created_at: string;
  updated_at: string;
}

export interface ContactInteraction {
  id: string;
  contact_id: string;
  user_id: string;
  type: string;
  title: string | null;
  description: string | null;
  interaction_date: string;
  created_at: string;
}

export interface ContactFieldValue {
  id: string;
  contact_id: string;
  field_group: string;
  field_label: string;
  field_value: string;
  position: number;
}
