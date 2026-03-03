import Database from 'better-sqlite3';

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

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_sub_goals_primary_goal ON sub_goals(primary_goal_id);
CREATE INDEX IF NOT EXISTS idx_action_items_sub_goal ON action_items(sub_goal_id);
CREATE INDEX IF NOT EXISTS idx_action_items_completed ON action_items(completed);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action_item_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_date ON activity_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_activity_logs_type ON activity_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_guestbook_user ON guestbook(user_id);
CREATE INDEX IF NOT EXISTS idx_guestbook_target ON guestbook(target_type, target_id);
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

  console.log('Database initialized at:', DB_PATH);
}

// Types
export interface PrimaryGoal {
  id: string;
  title: string;
  description: string | null;
  target_date: string | null;
  status: 'active' | 'completed' | 'archived';
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

export interface GuestbookEntry {
  id: string;
  user_id: string;
  agent_name: string;
  comment: string;
  target_type: 'user' | 'goal' | 'subgoal' | 'action';
  target_id: string | null;
  created_at: string;
}
