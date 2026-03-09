<div align="left">
  <img src="frontend/public/logo.svg?v=2" alt="Xharada logo" width="120" height="120">
  <h1>Xharada <sub>原田メソッド</sub></h1>
</div>

A **single source of truth** for your life goals — structured for both humans and AI agents.

## Philosophy

Your goals, sub-goals, and actions should live in one place that any AI agent can read, write to, and reason about. Xharada is that place. It uses the **Harada Method** — a Japanese framework that structures goals as **1 Primary Goal → 8 Sub-Goals → 8 Actions each = 64 total actions** — and exposes everything through an MCP endpoint and REST API.

Progress is tracked through continuous activity logging rather than completion checkboxes. Frequency and consistency matter more than "done" states. AI agents can provide coaching, track patterns, and leave feedback at any level of the goal hierarchy.

## Features

- **Visual grids**: 3x3 compact view and 9x9 full Harada grid with configurable aspect ratios
- **Activity logging**: Continuous logging with metrics, mood tracking, and media attachments
- **AI agent integration**: Built-in MCP endpoint, REST API, and guestbook system for AI coaching
- **Multi-user**: OAuth 2.1 authentication with per-user data isolation

## Quick Start

```yaml
# docker-compose.yml
services:
  xharada:
    image: ghcr.io/jacob-stokes/xharada:latest
    ports:
      - "3001:3001"
    volumes:
      - ./data:/app/data
    environment:
      - SESSION_SECRET=change-me-to-something-secure
      # - MCP_SERVER_URL=https://mcp.example.com  # For remote MCP
    restart: unless-stopped
```

```bash
docker-compose up -d
```

Visit http://localhost:3001, register an account, and create your first goal.

## MCP Server

Xharada has a **built-in remote MCP endpoint** at `/mcp` with OAuth 2.1 authentication — the recommended way to connect AI agents. Works with Claude mobile, Claude web, and any MCP-compatible client.

1. Deploy with `MCP_SERVER_URL` set to your public URL
2. Add as a custom integration in your MCP client, pointing to `https://your-domain.com/mcp`
3. Authenticate with your Xharada username and password

The endpoint provides 12 tools covering goal/sub-goal/action management, activity logging, guestbook operations, and bulk import.

For a standalone stdio MCP server (local Claude Desktop via API key), see **[xharada-mcp](https://github.com/Jacob-Stokes/xharada-mcp)**.

## Tech Stack

Node.js + TypeScript + Express + SQLite | React + Vite + Tailwind CSS | Docker

## Development

```bash
# Backend
cd backend && npm install && npm run dev  # port 3001

# Frontend
cd frontend && npm install && npm run dev  # port 3000
```

See the [wiki](https://github.com/Jacob-Stokes/xharada/wiki) for API documentation, database schema, and architecture details.

## License

MIT — Based on the Harada Method by Takashi Harada.
