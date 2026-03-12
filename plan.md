# Vikunja-Style Task Management — Implementation Plan

## Overview

Add a full task/project/label system to Thesys modeled after Vikunja's data model. Tasks and projects can be linked to goals (via `subgoal_id`). The Tasks page uses subtabs: **Overview**, **Projects**, **Labels**.

---

## 1. Database Schema (`backend/src/db/database.ts`)

### New Tables

```sql
-- Projects (containers for tasks, can be nested)
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  parent_project_id TEXT DEFAULT NULL,
  hex_color TEXT DEFAULT '',
  is_favorite INTEGER DEFAULT 0,
  position REAL DEFAULT 0,
  subgoal_id TEXT DEFAULT NULL,
  archived INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Tasks (work items, belong to a project)
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT DEFAULT NULL,
  title TEXT NOT NULL,
  description TEXT,
  done INTEGER DEFAULT 0,
  done_at TEXT,
  due_date TEXT,
  start_date TEXT,
  end_date TEXT,
  priority INTEGER DEFAULT 0,
  hex_color TEXT DEFAULT '',
  percent_done REAL DEFAULT 0,
  position REAL DEFAULT 0,
  bucket_id TEXT DEFAULT NULL,
  is_favorite INTEGER DEFAULT 0,
  subgoal_id TEXT DEFAULT NULL,
  repeat_after INTEGER DEFAULT 0,
  repeat_mode INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

-- Labels (color-coded tags)
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

-- Task ↔ Label junction table
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

-- Buckets (Kanban columns per project)
CREATE TABLE IF NOT EXISTS buckets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  position REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

### Indexes

```sql
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
```

### TypeScript Interfaces (in database.ts)

```ts
export interface Project {
  id: string; user_id: string; title: string; description: string | null;
  parent_project_id: string | null; hex_color: string; is_favorite: number;
  position: number; subgoal_id: string | null; archived: number;
  created_at: string; updated_at: string;
}

export interface Task {
  id: string; user_id: string; project_id: string | null;
  title: string; description: string | null;
  done: number; done_at: string | null;
  due_date: string | null; start_date: string | null; end_date: string | null;
  priority: number; hex_color: string; percent_done: number;
  position: number; bucket_id: string | null;
  is_favorite: number; subgoal_id: string | null;
  repeat_after: number; repeat_mode: number;
  created_at: string; updated_at: string;
}

export interface Label {
  id: string; user_id: string; title: string;
  description: string | null; hex_color: string;
  created_at: string; updated_at: string;
}

export interface TaskComment {
  id: string; task_id: string; user_id: string;
  content: string; created_at: string; updated_at: string;
}

export interface Bucket {
  id: string; project_id: string; title: string;
  position: number; created_at: string;
}
```

---

## 2. Backend Routes

### `backend/src/routes/tasks.ts` — Task CRUD + comments

| Method | Path | Description |
|--------|------|-------------|
| `GET /` | List all tasks for user (filterable: `?project_id=&done=&priority=&label=&due_before=&due_after=&search=&favorite=`) |
| `POST /` | Create task `{ title, project_id?, description?, due_date?, priority?, hex_color?, subgoal_id?, bucket_id? }` |
| `GET /:id` | Get single task with labels + comments |
| `PUT /:id` | Update task fields |
| `DELETE /:id` | Delete task |
| `PATCH /:id/done` | Toggle done status (like action toggle pattern) |
| `PATCH /:id/favorite` | Toggle favorite |
| `POST /:id/labels/:labelId` | Attach label to task |
| `DELETE /:id/labels/:labelId` | Detach label from task |
| `GET /:id/comments` | List comments on a task |
| `POST /:id/comments` | Add comment `{ content }` |
| `DELETE /:id/comments/:commentId` | Delete comment |

**Key query for GET /:**
```sql
SELECT t.*,
  sg.title as subgoal_title, sg.position as subgoal_position,
  pg.id as goal_id, pg.title as goal_title,
  p.title as project_title, p.hex_color as project_color
FROM tasks t
LEFT JOIN sub_goals sg ON t.subgoal_id = sg.id
LEFT JOIN primary_goals pg ON sg.primary_goal_id = pg.id
LEFT JOIN projects p ON t.project_id = p.id
WHERE t.user_id = ?
```

Labels loaded per-task via:
```sql
SELECT l.* FROM labels l
JOIN task_labels tl ON tl.label_id = l.id
WHERE tl.task_id = ?
```

### `backend/src/routes/projects.ts` — Project CRUD

| Method | Path | Description |
|--------|------|-------------|
| `GET /` | List all projects (with task counts) |
| `POST /` | Create project `{ title, description?, hex_color?, parent_project_id?, subgoal_id? }` |
| `GET /:id` | Get project with tasks + buckets |
| `PUT /:id` | Update project |
| `DELETE /:id` | Delete project (tasks get `project_id = NULL`) |
| `PATCH /:id/favorite` | Toggle favorite |
| `PATCH /:id/archive` | Toggle archived |
| `GET /:id/buckets` | List buckets for project |
| `POST /:id/buckets` | Create bucket `{ title }` |
| `PUT /:id/buckets/:bucketId` | Update bucket |
| `DELETE /:id/buckets/:bucketId` | Delete bucket |

**Task count query:**
```sql
SELECT p.*,
  COUNT(CASE WHEN t.done = 0 THEN 1 END) as open_tasks,
  COUNT(CASE WHEN t.done = 1 THEN 1 END) as done_tasks
FROM projects p
LEFT JOIN tasks t ON t.project_id = p.id
WHERE p.user_id = ?
GROUP BY p.id
```

### `backend/src/routes/labels.ts` — Label CRUD

| Method | Path | Description |
|--------|------|-------------|
| `GET /` | List all labels (with usage count) |
| `POST /` | Create label `{ title, hex_color?, description? }` |
| `PUT /:id` | Update label |
| `DELETE /:id` | Delete label (cascade removes from task_labels) |

---

## 3. Wire into Express (`backend/src/index.ts`)

```ts
import tasksRouter from './routes/tasks';
import projectsRouter from './routes/projects';
import labelsRouter from './routes/labels';

// After existing routes:
app.use('/api/tasks', requireAuth, tasksRouter);
app.use('/api/projects', requireAuth, projectsRouter);
app.use('/api/labels', requireAuth, labelsRouter);
```

---

## 4. Frontend API Client (`frontend/src/api/client.ts`)

Add methods:

```ts
// Tasks
getTasks: (params?) => apiRequest('/api/tasks' + queryString(params)),
createTask: (data) => apiRequest('/api/tasks', { method: 'POST', body }),
getTask: (id) => apiRequest(`/api/tasks/${id}`),
updateTask: (id, data) => apiRequest(`/api/tasks/${id}`, { method: 'PUT', body }),
deleteTask: (id) => apiRequest(`/api/tasks/${id}`, { method: 'DELETE' }),
toggleTask: (id) => apiRequest(`/api/tasks/${id}/done`, { method: 'PATCH' }),
toggleTaskFavorite: (id) => apiRequest(`/api/tasks/${id}/favorite`, { method: 'PATCH' }),
addTaskLabel: (taskId, labelId) => apiRequest(`/api/tasks/${taskId}/labels/${labelId}`, { method: 'POST' }),
removeTaskLabel: (taskId, labelId) => apiRequest(`/api/tasks/${taskId}/labels/${labelId}`, { method: 'DELETE' }),
getTaskComments: (taskId) => apiRequest(`/api/tasks/${taskId}/comments`),
createTaskComment: (taskId, content) => apiRequest(`/api/tasks/${taskId}/comments`, { method: 'POST', body }),
deleteTaskComment: (taskId, commentId) => apiRequest(`/api/tasks/${taskId}/comments/${commentId}`, { method: 'DELETE' }),

// Projects
getProjects: () => apiRequest('/api/projects'),
createProject: (data) => apiRequest('/api/projects', { method: 'POST', body }),
getProject: (id) => apiRequest(`/api/projects/${id}`),
updateProject: (id, data) => apiRequest(`/api/projects/${id}`, { method: 'PUT', body }),
deleteProject: (id) => apiRequest(`/api/projects/${id}`, { method: 'DELETE' }),
toggleProjectFavorite: (id) => apiRequest(`/api/projects/${id}/favorite`, { method: 'PATCH' }),
toggleProjectArchive: (id) => apiRequest(`/api/projects/${id}/archive`, { method: 'PATCH' }),

// Labels
getLabels: () => apiRequest('/api/labels'),
createLabel: (data) => apiRequest('/api/labels', { method: 'POST', body }),
updateLabel: (id, data) => apiRequest(`/api/labels/${id}`, { method: 'PUT', body }),
deleteLabel: (id) => apiRequest(`/api/labels/${id}`, { method: 'DELETE' }),
```

---

## 5. Frontend — Tasks Page (`frontend/src/pages/Tasks.tsx`)

### Subtab Structure

```
┌─────────────────────────────────────────────────────┐
│  Todo                    [Overview] [Projects] [Labels]  │
│                                                     │
│  ─── depends on active tab ───                      │
└─────────────────────────────────────────────────────┘
```

**Tab state:** `type TasksTab = 'overview' | 'projects' | 'labels'`

### Overview Tab

Shows all tasks across projects, sorted by due date / priority. Sections:

1. **Overdue** — red header, tasks past due date with `done = 0`
2. **Today** — tasks due today
3. **This week** — tasks due within 7 days
4. **Later / No date** — everything else

Each task row shows:
- Checkbox (toggle done)
- Title
- Priority indicator (colored dot: 🔴 urgent, 🟠 high, 🔵 medium, ⚪ none)
- Due date (relative: "today", "tomorrow", "3 days", or date)
- Project name pill (colored by project hex_color)
- Label pills (colored)
- Star icon (favorite toggle)
- Three-dot menu (edit, delete, move to project)

**Quick-add bar** at top: text input + Enter to create task (default: no project, no due date, can set inline)

**Filters bar** below tabs: `All | Open | Done | Favorites` as small pill buttons

### Projects Tab

Lists all projects as cards:

```
┌─────────────────────────────────┐
│ 🎨 Project Title         ★  ⋯  │
│ 3 open · 12 done               │
│ [label1] [label2]              │
│ Linked: Goal › SubGoal         │
└─────────────────────────────────┘
```

- Click card → opens **Project Detail View** (inline, replaces projects list)
  - Project header with title, description, edit button
  - Task list for this project (reuses same task row component)
  - "+ Add task" inline form
  - Back button to return to project list

- "+ New Project" button → inline form (title, color picker, optional subgoal link)

### Labels Tab

Shows all labels as a manageable list:

```
┌────────────────────────────────────────┐
│ [●] Label Name          12 tasks   ⋯  │
│ [●] Another Label        5 tasks   ⋯  │
│ [+ New Label]                          │
└────────────────────────────────────────┘
```

- Color dot + title + usage count + three-dot menu (edit, delete)
- Click label → filters Overview to show only tasks with that label
- "+ New Label" → inline form (title + color picker)
- Edit label → modal with title + color + description

### Shared Components (within Tasks.tsx)

- **TaskRow** — checkbox, title, priority dot, due date, project pill, label pills, star, menu
- **TaskEditModal** — full edit form (title, description, project dropdown, labels multi-select, due date, priority, subgoal link via SubGoalSearchInput)
- **ProjectCard** — project summary card
- **ProjectDetailView** — project header + filtered task list
- **LabelPill** — small colored pill `<span>`
- **ConfirmModal** — reuse existing from components/

---

## 6. Academia Theme (`frontend/src/index.css`)

Add overrides for any new Tailwind classes used. Likely minimal since we reuse existing patterns, but may need:

```css
/* Task priority colors in academia */
.academia .text-red-500 { color: #7c3238 !important; }     /* urgent */
.academia .text-orange-500 { color: #8b6914 !important; }   /* high */
.academia .bg-red-500 { background-color: #7c3238 !important; }
.academia .bg-orange-500 { background-color: #8b6914 !important; }
```

---

## 7. Implementation Order

1. **Database schema** — add tables + indexes + interfaces to `database.ts`
2. **Labels route** — simplest, no dependencies (`labels.ts`)
3. **Projects route** — depends on labels only conceptually (`projects.ts`)
4. **Tasks route** — depends on projects + labels (`tasks.ts`)
5. **Wire routes** into `index.ts`
6. **API client** — add all methods to `client.ts`
7. **Tasks page — Labels tab** — simplest UI, validates label CRUD works
8. **Tasks page — Projects tab** — project cards + create/edit
9. **Tasks page — Overview tab** — task list with all features
10. **Task edit modal** — full form with project/label/subgoal linking
11. **Project detail view** — click-into project with filtered tasks
12. **Docker build + test**
13. **Academia theme overrides** if needed

---

## Scope Decisions

**Included (Vikunja-like):**
- Projects with nesting (parent_project_id)
- Tasks with priority, due dates, done toggle, favorites
- Labels with colors, many-to-many with tasks
- Task comments
- Buckets (Kanban columns) — schema only, UI deferred
- Goal linking on both tasks and projects (subgoal_id)

**Deferred / Out of scope:**
- Kanban board view (buckets schema is ready, but no drag-drop board UI yet)
- Gantt view
- Table view
- Repeating tasks (schema fields present, logic deferred)
- Task relations (subtask, blocking, etc.)
- File attachments
- Task assignees (single-user app)
- CalDAV/reminders integration
