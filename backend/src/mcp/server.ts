/**
 * Remote MCP server setup with OAuth and Streamable HTTP transport.
 * Mounts OAuth endpoints + MCP endpoint on the Express app.
 */

import { randomUUID } from 'crypto';
import type { Express, Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { HaradaOAuthProvider, startOAuthCleanup } from './oauth-provider';
import { createMcpServer } from './tools';

// MCP server URL — used for OAuth metadata. Set via env var for production.
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3001';

// Session storage for stateful MCP connections
const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: McpServer }>();

export function setupMcpRoutes(app: Express): void {
  const provider = new HaradaOAuthProvider();
  const issuerUrl = new URL(MCP_SERVER_URL);

  // ─── OAuth routes ──────────────────────────────────────
  // Mounts: /.well-known/oauth-authorization-server, /.well-known/oauth-protected-resource,
  //         /register, /authorize, /token, /revoke
  app.use(mcpAuthRouter({
    provider,
    issuerUrl,
    serviceDocumentationUrl: new URL('https://github.com/Jacob-Stokes/thesys'),
    scopesSupported: ['harada'],
    resourceName: 'Thesys MCP',
  }));

  // ─── OAuth login callback ──────────────────────────────
  // Receives the login form POST from the authorize page
  app.post('/oauth/callback', (req: Request, res: Response) => {
    const { username, password, client_id, redirect_uri, state, code_challenge, code_challenge_method, scopes, resource } = req.body;

    if (!username || !password) {
      res.status(400).send('Username and password are required');
      return;
    }

    const userId = provider.validateCredentials(username, password);
    if (!userId) {
      // Re-render login page with error
      const { renderLoginPage } = require('./auth-page');
      const html = renderLoginPage({
        clientId: client_id,
        redirectUri: redirect_uri,
        state: state || '',
        codeChallenge: code_challenge,
        codeChallengeMethod: code_challenge_method || 'S256',
        scopes: scopes || '',
        resource: resource || '',
        error: 'Invalid username or password',
      });
      res.setHeader('Content-Type', 'text/html');
      res.status(401).send(html);
      return;
    }

    // Generate authorization code
    const code = provider.createAuthorizationCode(
      client_id,
      userId,
      redirect_uri,
      code_challenge,
      code_challenge_method || 'S256',
      scopes || '',
      resource || undefined,
    );

    // Redirect back to Claude with the code
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set('code', code);
    if (state) redirectUrl.searchParams.set('state', state);
    res.redirect(redirectUrl.toString());
  });

  // ─── MCP endpoint ──────────────────────────────────────
  const bearerAuth = requireBearerAuth({ verifier: provider });

  // Handle POST /mcp (JSON-RPC messages) and GET /mcp (SSE streams)
  app.post('/mcp', bearerAuth, async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (sessionId && sessions.has(sessionId)) {
        // Existing session — forward the request
        const session = sessions.get(sessionId)!;
        await session.transport.handleRequest(req, res, req.body);
      } else if (!sessionId) {
        // New session — create transport and server
        const server = createMcpServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            sessions.set(sid, { transport, server });
          },
        });

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } else {
        res.status(400).json({ error: 'Invalid or expired session' });
      }
    } catch (err) {
      console.error('[MCP POST] Error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Internal MCP error' });
    }
  });

  app.get('/mcp', bearerAuth, async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      await session.transport.handleRequest(req, res);
    } else {
      res.status(400).json({ error: 'Invalid or missing session' });
    }
  });

  app.delete('/mcp', bearerAuth, async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      await session.transport.handleRequest(req, res);
      sessions.delete(sessionId);
    } else {
      res.status(400).json({ error: 'Invalid or missing session' });
    }
  });

  // ─── Cleanup ───────────────────────────────────────────
  startOAuthCleanup();

  console.log('MCP remote endpoint mounted at /mcp');
  console.log(`OAuth issuer: ${MCP_SERVER_URL}`);
}
