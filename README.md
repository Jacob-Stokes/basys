<div align="left">
  <img src="frontend/public/logo.svg?v=2" alt="Basys logo" width="120" height="120">
  <h1>Basys</h1>
</div>

A **personal productivity suite** — goals, tasks, habits, and focus timers in one place, structured for both humans and AI agents.

## Philosophy

Your productivity tools should live in one place that any AI agent can read, write to, and reason about. Basys is that place. It combines the **Harada Method** (a Japanese goal-setting framework: 1 Primary Goal → 8 Sub-Goals → 8 Actions each), task management, habit tracking, and pomodoro timers — all exposed through an MCP endpoint and REST API.

Progress is tracked through continuous activity logging rather than completion checkboxes. Frequency and consistency matter more than "done" states. AI agents can provide coaching, track patterns, and leave feedback at any level.

## Features

- **Harada goals**: 3x3 compact view and 9x9 full grid with configurable aspect ratios
- **Task management**: Projects, labels, Kanban buckets, and polymorphic links to goals/habits
- **Habit tracking**: Daily/weekly habits and quits with streaks and calendar views
- **Pomodoro timer**: Focus sessions linked to tasks
- **Activity logging**: Continuous logging with metrics, mood tracking, and media attachments
- **AI agent integration**: Built-in MCP endpoint, REST API, and guestbook system for AI coaching
- **Multi-user**: OAuth 2.1 authentication with per-user data isolation

## Quick Start

```yaml
# docker-compose.yml
services:
  basys:
    image: ghcr.io/jacob-stokes/basys:latest
    ports:
      - "4000:3001"
    volumes:
      - ./data:/app/data
    environment:
      - SESSION_SECRET=change-me-to-something-secure
      # - MCP_SERVER_URL=https://home.jacob.st  # OAuth issuer URL
    restart: unless-stopped
```

```bash
docker-compose up -d
```

Visit http://localhost:4000, register an account, and start tracking your goals, tasks, and habits.

## MCP Server

Basys has a **built-in remote MCP endpoint** at `/mcp` with OAuth 2.1 authentication — the recommended way to connect AI agents. Works with Claude mobile, Claude web, and any MCP-compatible client.

1. Deploy with `MCP_SERVER_URL` set to your public URL (e.g. `https://home.jacob.st`)
2. Add as a custom integration in your MCP client, pointing to `https://home.jacob.st/mcp`
3. Authenticate with your Basys username and password

The endpoint provides **22 tools** covering goals, tasks, projects, habits, pomodoros, labels, sharing, agent etiquette, and cross-domain search.

## Data Model

```
┌─────────────────────────────────────────────────────────────────────┐
│  USERS & AUTH                                                       │
│                                                                     │
│  users ──┬── api_keys                                               │
│          ├── oauth_tokens ──── oauth_clients ──── oauth_auth_codes   │
│          └── agent_etiquette                                        │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  HARADA METHOD (Goal Hierarchy)                                     │
│                                                                     │
│  primary_goals ──── sub_goals ──── action_items ──── activity_logs  │
│       │                                                             │
│       ├── shared_goals          (public sharing tokens)             │
│       └── guestbook             (AI agent feedback at any level)    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  TASK MANAGEMENT                                                    │
│                                                                     │
│  projects ──┬── tasks ──┬── task_labels ──── labels                 │
│      │      │           ├── task_comments                           │
│      │      │           └── task_links ─ ─ ─ ┐                     │
│      │      └── buckets                      │ (polymorphic)       │
│      └── projects  (self-referencing)        │                     │
│                                              ▼                     │
│                              ┌────────────────────────┐            │
│                              │ primary_goals          │            │
│                              │ sub_goals              │            │
│                              │ habits                 │            │
│                              │ pomodoro_sessions      │            │
│                              └────────────────────────┘            │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  HABITS & POMODORO                                                  │
│                                                                     │
│  habits ──── habit_logs         (daily/weekly tracking)             │
│                                                                     │
│  pomodoro_sessions              (focus timer sessions)              │
└─────────────────────────────────────────────────────────────────────┘
```

**22 tables** across four domains:

| Domain | Tables | Purpose |
|--------|--------|---------|
| Users & Auth | `users`, `api_keys`, `oauth_clients`, `oauth_auth_codes`, `oauth_tokens`, `agent_etiquette` | Multi-user accounts, API keys, OAuth 2.1 for MCP, AI agent behavior rules |
| Harada Method | `primary_goals`, `sub_goals`, `action_items`, `activity_logs`, `guestbook`, `shared_goals` | 1→8→8 goal hierarchy, continuous progress logging, AI coaching, public sharing |
| Task Management | `projects`, `tasks`, `labels`, `task_labels`, `task_comments`, `buckets`, `task_links` | Projects with Kanban buckets, labeled tasks, polymorphic links to goals/habits/pomodoros |
| Habits & Pomodoro | `habits`, `habit_logs`, `pomodoro_sessions` | Daily/weekly habit tracking, focus timer sessions |

`task_links` uses a polymorphic junction pattern — `target_type` + `target_id` — to connect any task to goals, sub-goals, habits, or pomodoro sessions without separate foreign keys per type.

## Tech Stack

Node.js + TypeScript + Express + SQLite | React + Vite + Tailwind CSS | Docker

## Development

```bash
# Backend
cd backend && npm install && npm run dev  # port 3001

# Frontend
cd frontend && npm install && npm run dev  # port 3000
```

See the [wiki](https://github.com/Jacob-Stokes/basys/wiki) for API documentation, database schema, and architecture details.

## License

MIT
