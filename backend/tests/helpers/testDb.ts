import Database from 'better-sqlite3';

export function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  // Full schema matching production database.ts
  const SCHEMA = `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email TEXT,
      allow_query_param_auth INTEGER DEFAULT 1,
      is_admin INTEGER DEFAULT 0,
      display_name TEXT DEFAULT NULL,
      weather_latitude REAL DEFAULT NULL,
      weather_longitude REAL DEFAULT NULL,
      weather_location_name TEXT DEFAULT NULL,
      timezone TEXT DEFAULT NULL,
      use_browser_time INTEGER DEFAULT 1,
      temperature_unit TEXT DEFAULT 'celsius',
      todo_hidden_project_types TEXT DEFAULT 'dev',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

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
      theme_json TEXT DEFAULT NULL,
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

    CREATE TABLE IF NOT EXISTS agent_etiquette (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      position INTEGER NOT NULL,
      is_default INTEGER DEFAULT 0 CHECK(is_default IN (0, 1)),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Habits
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

    -- Projects
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
      type TEXT DEFAULT 'personal',
      project_mode TEXT DEFAULT 'simple',
      default_columns TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- Tasks
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
      sprint_id TEXT DEFAULT NULL,
      assignee_user_id TEXT DEFAULT NULL,
      assignee_name TEXT DEFAULT NULL,
      task_type TEXT DEFAULT 'task',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    -- Labels
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

    CREATE TABLE IF NOT EXISTS task_labels (
      task_id TEXT NOT NULL,
      label_id TEXT NOT NULL,
      PRIMARY KEY (task_id, label_id),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE CASCADE
    );

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

    -- Sprints
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

    -- Buckets (Kanban columns)
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

    -- Task links (polymorphic)
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

    CREATE TABLE IF NOT EXISTS pomodoro_links (
      pomodoro_id TEXT NOT NULL,
      target_type TEXT NOT NULL CHECK(target_type IN ('task','project','sprint','goal','subgoal','habit')),
      target_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (pomodoro_id, target_type, target_id),
      FOREIGN KEY (pomodoro_id) REFERENCES pomodoro_sessions(id) ON DELETE CASCADE
    );

    -- Task relations
    CREATE TABLE IF NOT EXISTS task_relations (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      related_task_id TEXT NOT NULL,
      relation_kind TEXT NOT NULL CHECK(relation_kind IN (
        'subtask', 'parent', 'related', 'duplicates',
        'blocking', 'blocked_by', 'precedes', 'follows',
        'copied_from', 'copied_to'
      )),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (related_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      UNIQUE(task_id, related_task_id, relation_kind)
    );

    -- Task checklist items
    CREATE TABLE IF NOT EXISTS task_checklist_items (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      title TEXT NOT NULL,
      done INTEGER DEFAULT 0 CHECK(done IN (0, 1)),
      position INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    -- OAuth tables
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

    -- Chat
    CREATE TABLE IF NOT EXISTS chat_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT DEFAULT 'New conversation',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_memory (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

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

    -- Quick notes
    CREATE TABLE IF NOT EXISTS quick_notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
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

    CREATE TABLE IF NOT EXISTS contact_tags (
      contact_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (contact_id, tag),
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS contact_field_values (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL,
      field_group TEXT NOT NULL,
      field_label TEXT NOT NULL,
      field_value TEXT NOT NULL,
      position INTEGER DEFAULT 0,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_shared_goals_token ON shared_goals(token);
    CREATE INDEX IF NOT EXISTS idx_shared_goals_goal ON shared_goals(goal_id);
    CREATE INDEX IF NOT EXISTS idx_agent_etiquette_user ON agent_etiquette(user_id);
    CREATE INDEX IF NOT EXISTS idx_sub_goals_primary_goal ON sub_goals(primary_goal_id);
    CREATE INDEX IF NOT EXISTS idx_action_items_sub_goal ON action_items(sub_goal_id);
    CREATE INDEX IF NOT EXISTS idx_action_items_completed ON action_items(completed);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action_item_id);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_date ON activity_logs(log_date);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_type ON activity_logs(log_type);
    CREATE INDEX IF NOT EXISTS idx_guestbook_user ON guestbook(user_id);
    CREATE INDEX IF NOT EXISTS idx_guestbook_target ON guestbook(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_primary_goals_user ON primary_goals(user_id);
    CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id);
    CREATE INDEX IF NOT EXISTS idx_habits_type ON habits(type);
    CREATE INDEX IF NOT EXISTS idx_habits_subgoal ON habits(subgoal_id);
    CREATE INDEX IF NOT EXISTS idx_habit_logs_habit ON habit_logs(habit_id);
    CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs(log_date);
    CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_date ON habit_logs(habit_id, log_date);
    CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
    CREATE INDEX IF NOT EXISTS idx_projects_parent ON projects(parent_project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_done ON tasks(done);
    CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_bucket ON tasks(bucket_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_sprint ON tasks(sprint_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_user_id);
    CREATE INDEX IF NOT EXISTS idx_labels_user ON labels(user_id);
    CREATE INDEX IF NOT EXISTS idx_task_labels_task ON task_labels(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_labels_label ON task_labels(label_id);
    CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
    CREATE INDEX IF NOT EXISTS idx_sprints_project ON sprints(project_id);
    CREATE INDEX IF NOT EXISTS idx_sprints_status ON sprints(status);
    CREATE INDEX IF NOT EXISTS idx_buckets_project ON buckets(project_id);
    CREATE INDEX IF NOT EXISTS idx_buckets_sprint ON buckets(sprint_id);
    CREATE INDEX IF NOT EXISTS idx_task_links_task ON task_links(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_links_target ON task_links(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_pomodoro_sessions_user ON pomodoro_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_pomodoro_sessions_started ON pomodoro_sessions(started_at);
    CREATE INDEX IF NOT EXISTS idx_pomo_links_pomo ON pomodoro_links(pomodoro_id);
    CREATE INDEX IF NOT EXISTS idx_pomo_links_target ON pomodoro_links(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_task_relations_task ON task_relations(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_relations_related ON task_relations(related_task_id);
    CREATE INDEX IF NOT EXISTS idx_task_checklist_task ON task_checklist_items(task_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);
    CREATE INDEX IF NOT EXISTS idx_contact_interactions_contact ON contact_interactions(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_interactions_user ON contact_interactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_contact_fields_contact ON contact_field_values(contact_id);
    CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user ON oauth_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_oauth_tokens_expires ON oauth_tokens(expires_at);
    CREATE INDEX IF NOT EXISTS idx_chat_conversations_user ON chat_conversations(user_id);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_chat_memory_user ON chat_memory(user_id);
    CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id);
    CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_date);
    CREATE INDEX IF NOT EXISTS idx_quick_notes_user ON quick_notes(user_id);
  `;

  db.exec(SCHEMA);

  return db;
}
