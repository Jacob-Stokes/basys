<div align="left">
  <img src="frontend/public/logo.svg?v=2" alt="Xharada logo" width="120" height="120">
  <h1>Xharada</h1>
</div>

One place for all your goals. Built around the **Harada Method** (原田メソッド) — a Japanese goal-setting framework where 1 primary goal breaks down into 8 sub-goals, each with 8 actions, giving you 64 concrete things to work on.

## Why

Most goal trackers treat goals as a flat list of checkboxes. Xharada gives them structure. The grid makes it obvious where you're putting effort and where you're neglecting things. AI agents can plug in via MCP or REST API to read your goals, log progress, and nudge you.

## What you get

- **Harada grids** — 3x3 compact and 9x9 full views
- **Activity logging** — track what you actually did, not just whether you "finished"
- **MCP endpoint** — any AI agent can read/write your goals out of the box
- **Multi-user** — OAuth 2.1 auth, each user gets their own data

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
    restart: unless-stopped
```

```bash
docker-compose up -d
```

Go to http://localhost:3001, make an account, create a goal.

## Connecting AI agents

Xharada has a built-in remote MCP endpoint at `/mcp` with OAuth 2.1. Works with Claude mobile/web and any MCP client.

1. Deploy with `MCP_SERVER_URL` set to your public URL
2. Point your MCP client at `https://your-domain.com/mcp`
3. Log in with your Xharada credentials

There's also a standalone stdio MCP server for local use: **[xharada-mcp](https://github.com/Jacob-Stokes/xharada-mcp)**.

## Tech

Node.js · TypeScript · Express · SQLite · React · Vite · Tailwind · Docker

## Dev setup

```bash
cd backend && npm install && npm run dev   # port 3001
cd frontend && npm install && npm run dev  # port 3000
```

API docs and architecture details in the [wiki](https://github.com/Jacob-Stokes/xharada/wiki).

## License

MIT — Based on the Harada Method by Takashi Harada.
