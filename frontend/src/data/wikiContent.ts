export interface WikiPage {
  id: string;
  title: string;
  section: string;
  content: string;
}

export const WIKI_SECTIONS: string[] = [
  'Getting Started',
  'Navigation',
  'Features',
  'Keyboard Shortcuts',
  'Architecture',
  'API',
];

export const WIKI_PAGES: WikiPage[] = [
  // ── Getting Started ──────────────────────────────────────────────
  {
    id: 'welcome',
    section: 'Getting Started',
    title: 'Welcome',
    content: `
# Welcome to Thesys

Thesys is a personal productivity platform that combines goal tracking (using the Harada Method), task management, habit tracking, journaling, a personal CRM, and more — all in a single self-hosted application.

## Key Features

- **Goals** — Structured goal-setting based on the Harada Method (1 goal → 8 sub-goals → 8 actions each)
- **Tasks / Todo** — Kanban-style task management with projects, sprints, labels, and checklists
- **Habits** — Daily and weekly habit tracking with streaks and calendar views
- **Journal** — Daily journaling with markdown support
- **Phonebook** — Personal CRM for managing contacts, interactions, and reminders
- **Pomodoro Timer** — Focus timer with Pomo / Short / Long break modes
- **Quick Notes** — Scratchpad in the side panel for quick capture
- **Chat Sidebar** — AI assistant powered by Claude for in-app help
- **Terminal** — Embedded terminal for server administration

## Getting Help

- Press **⌥/** (Option + /) to view keyboard shortcuts at any time
- Use the Chat sidebar (**⌥]**) to ask the AI assistant questions
- This wiki documents all features, shortcuts, and technical details
`,
  },
  {
    id: 'setup',
    section: 'Getting Started',
    title: 'Setup & Configuration',
    content: `
# Setup & Configuration

## First Login

After deploying Thesys, navigate to the app URL and log in with your credentials. The default admin account is created during initial setup.

## Display Settings

Go to **Admin → Settings → Display** to configure:

- **Theme** — Choose from Default, Academia, Academia 2026, Academia Mono, Arc, or write your own Custom CSS
- **Dark Mode** — Toggle dark mode on/off
- **Color Palette** — Select built-in palettes (Classic Greens, Rainbow, Pastel, Greyscale) or create custom palettes
- **Goal View** — Choose between List, Compact, or Full view for goals
- **Tab Order** — Rearrange navbar tabs, subtabs, and side panel tabs under Display → Navigation

## API Keys

Go to **Admin → Settings → API** to manage API keys for programmatic access.

## Integrations

- **Google Calendar** — Sync events bidirectionally
- **Gmail** — View and manage emails within Thesys
- **Obsidian** — Connect your Obsidian vault for note syncing
`,
  },

  // ── Navigation ────────────────────────────────────────────────────
  {
    id: 'navbar',
    section: 'Navigation',
    title: 'Navbar & Tabs',
    content: `
# Navbar & Tabs

## Top Navigation Bar

The navbar provides access to all major sections:

| Tab | Path | Description |
|-----|------|-------------|
| Todo | \`/\` | Task management and todo lists |
| Projects | \`/sprints\` | Projects with sprint boards |
| Life | \`/life\` | Goals, Habits, Recipes, Bookshelf |
| Journal | \`/journal\` | Daily journal entries |
| Phonebook | \`/phonebook\` | Personal CRM / contacts |
| Admin | \`/admin\` | Terminal, Settings, Wiki |

## Subtabs

Some pages have subtabs for sub-sections:

- **Life** — Goals, Habits, Recipes, Bookshelf
- **Admin** — Terminal, Settings, Wiki

## Tab Reordering

All tab orders can be customized via **Admin → Settings → Display → Navigation**. Use the up/down arrows to rearrange tabs. Changes take effect immediately and persist across sessions.
`,
  },
  {
    id: 'panels',
    section: 'Navigation',
    title: 'Side Panels',
    content: `
# Side Panels

## Left Panel

Toggle with **⌥[** or the panel button in the navbar. Contains:

- **Notes** — Quick scratchpad for capturing ideas
- **Tab 2 / Tab 3** — Placeholder tabs for future panel apps

## Chat Sidebar

Toggle with **⌥]** or the chat button. Provides an AI assistant powered by Claude that can:

- Answer questions about your goals and tasks
- Help with planning and brainstorming
- Access your data through MCP tools

## Panel Swapping

Press **⌥\\** to swap the left panel and chat sidebar positions. The left panel moves to the right side and vice versa.
`,
  },

  // ── Features ──────────────────────────────────────────────────────
  {
    id: 'goals',
    section: 'Features',
    title: 'Goals (Harada Method)',
    content: `
# Goals — Harada Method

The goals system implements the **Harada Method**, a structured approach to goal achievement developed by Takashi Harada.

## Structure

\`\`\`
Goal (1 primary goal)
├── Sub-goal 1 (of 8)
│   ├── Action 1 (of 8)
│   ├── Action 2
│   └── ...
├── Sub-goal 2
│   ├── Action 1
│   └── ...
└── ... (up to 8 sub-goals)
\`\`\`

Each goal has up to **8 sub-goals**, and each sub-goal has up to **8 actions**. Actions can be toggled complete and have activity logs attached.

## Views

- **List View** — Simple list of goals with sub-goal summaries
- **Compact View** — Grid layout showing sub-goals as colored cards
- **Full View** — Detailed view with all actions visible

## Color Customization

Each sub-goal position (1–8) can have a custom color. Configure palettes in **Admin → Settings → Display → Goals**.

## Activity Logs

Each action supports activity logs with:
- **Note** — Free-text notes
- **Progress** — Quantifiable metrics (value + unit)
- **Completion** — Completion entries
- **Media** — Attached media
- **Link** — External links

## Sharing

Goals can be shared publicly via share links. Go to a goal's detail view and create a share link. Recipients can view the goal tree and optionally leave guestbook entries.
`,
  },
  {
    id: 'tasks',
    section: 'Features',
    title: 'Tasks & Todo',
    content: `
# Tasks & Todo

The Todo page (\`/\`) is the default landing page and provides full task management.

## Task Properties

| Property | Description |
|----------|-------------|
| Title | Task name (required) |
| Description | Detailed description (markdown) |
| Priority | None, Low, Medium, High, Urgent |
| Due Date | Optional deadline |
| Project | Assign to a project |
| Labels | Color-coded tags |
| Favorite | Star tasks for quick access |
| Checklist | Sub-items within a task |

## Task Relations

Tasks can be linked to:
- **Goals / Sub-goals** — Connect tasks to your goal hierarchy
- **Habits** — Associate tasks with habit tracking
- **Pomodoros** — Track focus time spent on tasks
- **Other tasks** — Create dependencies between tasks

## Comments

Each task has a comment thread for notes and updates.

## Quick Create

Press **⌥N** from anywhere to open the quick create dialog.
`,
  },
  {
    id: 'sprints',
    section: 'Features',
    title: 'Projects & Sprints',
    content: `
# Projects & Sprints

## Projects

Projects group related tasks together. Each project can have:
- A custom color
- Favorite / archive status
- Parent projects (nesting)
- Multiple sprints

## Sprints

Sprints are time-boxed iterations within a project, using a Kanban board layout.

### Sprint Columns

Each sprint has customizable columns (e.g., To Do, In Progress, Done). Tasks are assigned to columns and can be moved between them.

### Sprint Status

Sprints have a lifecycle status:
- **Planning** — Sprint is being set up
- **Active** — Sprint is in progress
- **Completed** — Sprint is finished

Navigate to \`/sprints\` to view all projects, or \`/sprints/:id\` for a specific sprint board.
`,
  },
  {
    id: 'habits',
    section: 'Features',
    title: 'Habits',
    content: `
# Habits

Found under **Life → Habits**, the habit tracker supports both building new habits and quitting old ones.

## Habit Types

- **Habit** (build) — Track a positive habit you want to form (e.g., exercise, reading)
- **Quit** (stop) — Track progress on quitting a bad habit, with a quit date and streak counter

## Tracking

- **Daily habits** — Mark as complete each day
- **Weekly habits** — Mark as complete each week
- **Streaks** — Current streak and longest streak are tracked automatically

## Calendar View

Each habit has a calendar view showing completion history by month, similar to a GitHub contribution graph.

## Linking

Habits can be linked to sub-goals in your goal hierarchy, connecting daily actions to bigger objectives.
`,
  },
  {
    id: 'journal',
    section: 'Features',
    title: 'Journal',
    content: `
# Journal

The journal (\`/journal\`) provides a daily journaling space with markdown support.

Write entries to reflect on your day, track progress, or capture thoughts. Entries are organized by date and support full markdown formatting.
`,
  },
  {
    id: 'phonebook',
    section: 'Features',
    title: 'Phonebook (Personal CRM)',
    content: `
# Phonebook — Personal CRM

The phonebook (\`/phonebook\`) is a personal CRM for managing relationships.

## Contact Properties

- **Name, Email, Phone** — Basic contact info
- **Type** — Personal, Professional, or Other
- **Tags** — Custom tags for categorization
- **Custom Fields** — Add any key-value pairs
- **Notes** — Free-text notes about the contact
- **Favorite** — Star important contacts

## Interactions

Track every interaction with a contact:
- Type (call, email, meeting, note, etc.)
- Date and description
- Follow-up reminders

## Reminders

Set follow-up reminders on interactions. Due reminders are surfaced in the app.

## Search & Filter

Filter contacts by search query, tags, type, or archived status.
`,
  },
  {
    id: 'pomodoro',
    section: 'Features',
    title: 'Pomodoro Timer',
    content: `
# Pomodoro Timer

The Pomodoro timer is accessible via the 🍅 emoji in the footer bar, or by navigating to \`/timer\`.

## Modes

| Mode | Duration | Description |
|------|----------|-------------|
| Pomo | 25 min | Focused work session |
| Short | 5 min | Short break between pomos |
| Long | 15 min | Longer break after a set of pomos |

## Timer Shortcuts (on Timer page)

- **⌥S** — Start / Stop the timer
- **⌥R** — Reset the timer

## Tracking

Pomodoro sessions are saved and can be linked to tasks for time tracking. View your pomo stats to see focus time per task or project.

## Footer Bar

The timer footer is always visible at the bottom of the screen, showing the current timer state and mode selector buttons.
`,
  },
  {
    id: 'notes',
    section: 'Features',
    title: 'Quick Notes',
    content: `
# Quick Notes

Quick Notes live in the left side panel (toggle with **⌥[**) under the "Notes" tab.

## Usage

- Click **+ New Note** to create a note
- Notes auto-save as you type
- Delete notes with the trash icon
- Notes are stored server-side and sync across sessions

Quick Notes are designed for fast capture — jot down an idea, a phone number, or a todo before you forget it. For longer-form writing, use the Journal.
`,
  },
  {
    id: 'chat',
    section: 'Features',
    title: 'Chat Sidebar',
    content: `
# Chat Sidebar

Toggle with **⌥]** or the chat icon in the navbar.

## AI Assistant

The chat sidebar provides an AI assistant powered by **Claude** (via the Claude Agent SDK). It can:

- Answer questions about your goals, tasks, and data
- Help with brainstorming and planning
- Create, update, and manage items through MCP tool access
- Provide summaries and insights

## Conversations

- Create new conversations with the **+** button
- Switch between saved conversations
- Delete old conversations

## MCP Integration

The chat assistant has access to Thesys data through MCP (Model Context Protocol) tools, allowing it to read and modify your goals, tasks, habits, and other data directly.
`,
  },

  // ── Keyboard Shortcuts ────────────────────────────────────────────
  {
    id: 'shortcuts',
    section: 'Keyboard Shortcuts',
    title: 'All Shortcuts',
    content: `
# Keyboard Shortcuts

Press **⌥/** (Option + / on Mac, Alt + / on Windows/Linux) to view shortcuts in-app.

All shortcuts use the **Option (⌥)** key on Mac or **Alt** key on Windows/Linux as the modifier.

> Shortcuts are suppressed when focus is inside an input, textarea, or contenteditable element.

## Navigation

| Shortcut | Action |
|----------|--------|
| ⌥1 | Go to Todo |
| ⌥2 | Go to Projects |
| ⌥3 | Go to Timer |
| ⌥4 | Go to Life / Goals |
| ⌥5 | Go to Journal |
| ⌥6 | Go to Phonebook |
| ⌥7 | Go to Terminal |
| ⌥, | Go to Settings |

## Panels

| Shortcut | Action |
|----------|--------|
| ⌥[ | Toggle left panel |
| ⌥] | Toggle chat sidebar |
| ⌥\\ | Swap panel sides |

## Quick Actions

| Shortcut | Action |
|----------|--------|
| ⌥N | Quick create |
| ⌥/ | Show shortcuts help |

## Timer (on Timer page only)

| Shortcut | Action |
|----------|--------|
| ⌥S | Start / Stop timer |
| ⌥R | Reset timer |
`,
  },

  // ── Architecture ──────────────────────────────────────────────────
  {
    id: 'data-model',
    section: 'Architecture',
    title: 'Data Model',
    content: `
# Data Model

Thesys uses a SQLite database on the backend. The core entities and their relationships:

## Goal Hierarchy

\`\`\`
User
├── Goal (id, title, description, status, target_date)
│   └── SubGoal (id, goal_id, title, position 1-8)
│       └── Action (id, subgoal_id, title, completed, position 1-8)
│           └── ActivityLog (id, action_id, log_type, content, metric_value, mood)
\`\`\`

## Task System

\`\`\`
Project (id, title, color, parent_project_id)
├── Sprint (id, project_id, title, status, start_date, end_date)
│   └── SprintColumn (id, sprint_id, title, position)
└── Task (id, title, description, priority, due_date, project_id, sprint_id)
    ├── TaskLabel (task_id, label_id)
    ├── TaskLink (task_id, target_type, target_id)
    ├── TaskRelation (task_id, related_task_id, relation_kind)
    ├── TaskChecklist (id, task_id, title, completed)
    └── TaskComment (id, task_id, content)
\`\`\`

## Other Entities

- **Habit** — id, title, type (habit/quit), frequency (daily/weekly), subgoal_id
- **HabitLog** — id, habit_id, log_date, note
- **Contact** — id, name, email, phone, type, tags, custom fields
- **Interaction** — id, contact_id, type, description, date, reminder
- **Note** — id, content (Quick Notes)
- **Event** — id, title, start, end, all_day
- **Pomodoro** — id, duration, status, task_id
- **Conversation / Message** — Chat history
- **ShareLink** — id, goal_id, token
- **Etiquette** — id, content (AI agent behavior rules)
`,
  },
  {
    id: 'themes',
    section: 'Architecture',
    title: 'Theme System',
    content: `
# Theme System

Thesys supports multiple visual themes controlled via CSS classes on the \`<html>\` element.

## Available Themes

| Theme | Description |
|-------|-------------|
| Default | Clean sans-serif, neutral grays |
| Academia | Tufte-inspired — serif fonts, warm ivory background |
| Academia 2026 | Glassmorphism + warm parchment, frosted glass, editorial serif |
| Academia Mono | Same Tufte flat style — crisp white/grey, slate-blue accent |
| Arc | Frosted white/grey glassmorphism, vivid accent pops |
| Custom CSS | Write your own CSS for full control |

## How It Works

1. Theme name is stored in \`DisplaySettings.appTheme\`
2. The \`DisplaySettingsProvider\` adds/removes CSS classes on \`document.documentElement\`
3. Theme CSS files define variables and overrides scoped to their class name
4. Custom CSS is injected via a \`<style>\` tag when the Custom CSS theme is active

## Color Palettes

Palettes control the 8 sub-goal colors in the Harada grid:

- **Classic Greens** — Alternating green shades
- **Rainbow** — Orange → Yellow → Green → Teal → Blue → Indigo → Pink → Red
- **Pastel** — Soft pastel tones
- **Greyscale** — Alternating grays

Custom palettes can be created in Settings and applied per-goal.

## Display Settings Storage

All display preferences are stored in \`localStorage\` under the key \`haradaDisplaySettings\`. This includes theme, palette, dark mode, tab order, and all other UI preferences.
`,
  },
  {
    id: 'settings-keys',
    section: 'Architecture',
    title: 'LocalStorage Keys',
    content: `
# LocalStorage Keys

Thesys stores client-side state in the following localStorage keys:

| Key | Purpose |
|-----|---------|
| \`haradaDisplaySettings\` | All display/UI preferences (theme, palette, dark mode, tab order, etc.) |
| \`harada_auth_token\` | Authentication JWT token |
| \`thesys_timer_state\` | Pomodoro timer state (mode, time remaining, running status) |
| \`thesys_left_panel_open\` | Left panel open/closed state |
| \`thesys_chat_sidebar_open\` | Chat sidebar open/closed state |
| \`thesys_panel_swap\` | Whether panels are swapped |

These are all client-side only. Server-side data is stored in SQLite.
`,
  },

  // ── API ───────────────────────────────────────────────────────────
  {
    id: 'api-overview',
    section: 'API',
    title: 'API Overview',
    content: `
# API Overview

Thesys exposes a RESTful JSON API at \`/api\`. All endpoints (except public share links and auth) require authentication.

## Authentication

Two methods:

1. **Session cookie** — Set after login via \`POST /api/auth/login\`
2. **API key** — Pass via \`X-API-Key\` header or \`?api_key=\` query parameter

Manage API keys in **Admin → Settings → API**.

## Base URL

Default: \`http://localhost:3001\` (configurable via \`VITE_API_URL\` environment variable)

## Response Format

All responses follow a consistent format:

\`\`\`json
// Success
{ "ok": true, "data": { ... } }

// Error
{ "ok": false, "error": "Error message" }
\`\`\`

## Rate Limiting

No rate limiting is applied by default (self-hosted). If exposed publicly, configure rate limiting at the reverse proxy level.
`,
  },
  {
    id: 'api-endpoints',
    section: 'API',
    title: 'API Endpoints',
    content: `
# API Endpoints

## Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | \`/api/auth/register\` | Create account |
| POST | \`/api/auth/login\` | Log in |
| POST | \`/api/auth/logout\` | Log out |
| GET | \`/api/auth/me\` | Get current user |
| PATCH | \`/api/auth/me\` | Update profile |
| PUT | \`/api/auth/password\` | Change password |
| GET | \`/api/auth/api-keys\` | List API keys |
| POST | \`/api/auth/api-keys\` | Create API key |
| DELETE | \`/api/auth/api-keys/:id\` | Delete API key |

## Goals

| Method | Path | Description |
|--------|------|-------------|
| GET | \`/api/goals\` | List goals |
| POST | \`/api/goals\` | Create goal |
| GET | \`/api/goals/:id\` | Get goal |
| PUT | \`/api/goals/:id\` | Update goal |
| DELETE | \`/api/goals/:id\` | Delete goal |
| GET | \`/api/goals/:id/tree\` | Get full goal tree |

## Sub-goals

| Method | Path | Description |
|--------|------|-------------|
| GET | \`/api/goals/:goalId/subgoals\` | List sub-goals |
| POST | \`/api/goals/:goalId/subgoals\` | Create sub-goal |
| PUT | \`/api/subgoals/:id\` | Update sub-goal |
| POST | \`/api/subgoals/:id/reorder\` | Reorder sub-goal |
| DELETE | \`/api/subgoals/:id\` | Delete sub-goal |

## Actions

| Method | Path | Description |
|--------|------|-------------|
| GET | \`/api/subgoals/:subGoalId/actions\` | List actions |
| POST | \`/api/subgoals/:subGoalId/actions\` | Create action |
| PUT | \`/api/actions/:id\` | Update action |
| POST | \`/api/actions/:id/reorder\` | Reorder action |
| PATCH | \`/api/actions/:id/complete\` | Toggle completion |
| DELETE | \`/api/actions/:id\` | Delete action |

## Tasks

| Method | Path | Description |
|--------|------|-------------|
| GET | \`/api/tasks\` | List tasks (filterable) |
| POST | \`/api/tasks\` | Create task |
| GET | \`/api/tasks/:id\` | Get task |
| PUT | \`/api/tasks/:id\` | Update task |
| DELETE | \`/api/tasks/:id\` | Delete task |
| PATCH | \`/api/tasks/:id/done\` | Toggle done |
| PATCH | \`/api/tasks/:id/favorite\` | Toggle favorite |

## Projects & Sprints

| Method | Path | Description |
|--------|------|-------------|
| GET | \`/api/projects\` | List projects |
| POST | \`/api/projects\` | Create project |
| GET | \`/api/projects/:id\` | Get project |
| PUT | \`/api/projects/:id\` | Update project |
| DELETE | \`/api/projects/:id\` | Delete project |
| GET | \`/api/projects/:id/sprints\` | List sprints |
| POST | \`/api/projects/:id/sprints\` | Create sprint |
| GET | \`/api/sprints/:id\` | Get sprint |
| PUT | \`/api/sprints/:id\` | Update sprint |
| DELETE | \`/api/sprints/:id\` | Delete sprint |

## Habits

| Method | Path | Description |
|--------|------|-------------|
| GET | \`/api/habits\` | List habits |
| POST | \`/api/habits\` | Create habit |
| PUT | \`/api/habits/:id\` | Update habit |
| DELETE | \`/api/habits/:id\` | Delete habit |
| POST | \`/api/habits/:id/logs\` | Log habit completion |
| GET | \`/api/habits/:id/calendar\` | Get calendar view |

## Other Endpoints

| Resource | Base Path |
|----------|-----------|
| Activity Logs | \`/api/logs\` |
| Labels | \`/api/labels\` |
| Notes | \`/api/notes\` |
| Contacts | \`/api/contacts\` |
| Events | \`/api/events\` |
| Pomodoros | \`/api/pomodoros\` |
| Chat | \`/api/chat\` |
| Share Links | \`/api/share\` |
| Search | \`/api/search\` |
| Etiquette | \`/api/etiquette\` |
| Guestbook | \`/api/guestbook\` |
| Google Calendar | \`/api/google-calendar\` |
| Gmail | \`/api/gmail\` |
`,
  },
  {
    id: 'mcp',
    section: 'API',
    title: 'MCP Integration',
    content: `
# MCP Integration

Thesys exposes its data through **MCP (Model Context Protocol)**, allowing AI assistants (like Claude) to read and write your data.

## What is MCP?

MCP is an open protocol that lets AI models interact with external tools and data sources. Thesys acts as an MCP server, providing tools that Claude can call to access your goals, tasks, habits, and more.

## Available MCP Tools

The in-app chat sidebar uses MCP to give Claude access to:

- Goal, sub-goal, and action CRUD
- Task and project management
- Habit tracking
- Note management
- Search across all data
- Sprint and column management
- Event management

## Configuration

MCP tool permissions are configured in the chat agent setup. The allowed tool patterns include:

- \`mcp__thesys__*\` — Core Thesys tools
- \`mcp__claude_ai_Thesys__*\` — External MCP server tools
- \`mcp__claude_ai_Basys__*\` — Additional MCP tools

## Self-Hosted MCP

Since Thesys is self-hosted, MCP requests stay within your infrastructure. No data is sent to external services beyond the AI model API calls.
`,
  },
];
