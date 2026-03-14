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

function getJsonRpcMethod(body: any): string {
  if (Array.isArray(body)) {
    const methods = body.map((entry) => entry?.method).filter(Boolean);
    return methods.length > 0 ? methods.join(',') : 'unknown';
  }
  return typeof body?.method === 'string' ? body.method : 'unknown';
}

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

  // ─── RFC 9728: path-aware protected resource metadata ──
  // Claude checks /.well-known/oauth-protected-resource/mcp (resource path appended)
  app.get('/.well-known/oauth-protected-resource/mcp', (_req: Request, res: Response) => {
    res.json({
      resource: `${MCP_SERVER_URL}/`,
      authorization_servers: [`${MCP_SERVER_URL}/`],
      scopes_supported: ['harada'],
      resource_name: 'Thesys MCP',
      resource_documentation: 'https://github.com/Jacob-Stokes/thesys',
    });
  });

  // ─── OAuth login callback ──────────────────────────────
  // Receives the login form POST from the authorize page
  app.post('/oauth/callback', (req: Request, res: Response) => {
    console.log('[OAuth callback] Body keys:', Object.keys(req.body || {}));
    const { username, password, client_id, redirect_uri, state, code_challenge, code_challenge_method, scopes, resource } = req.body;

    console.log('[OAuth callback] client_id:', client_id, 'redirect_uri:', redirect_uri, 'has_code_challenge:', !!code_challenge);

    if (!username || !password) {
      console.log('[OAuth callback] Missing username or password');
      res.status(400).send('Username and password are required');
      return;
    }

    const userId = provider.validateCredentials(username, password);
    console.log('[OAuth callback] Auth result:', userId ? 'success' : 'failed');
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
    console.log('[OAuth callback] Redirecting to:', redirectUrl.toString().substring(0, 100) + '...');
    res.redirect(redirectUrl.toString());
  });

  // ─── MCP endpoint ──────────────────────────────────────
  const bearerAuth = requireBearerAuth({ verifier: provider });

  // Pre-auth logging — catches requests rejected by bearerAuth
  app.post('/mcp', (req: Request, _res: Response, next: Function) => {
    console.log('[MCP RAW] POST /mcp received', {
      sessionId: req.headers['mcp-session-id'] || null,
      protocolVersion: req.headers['mcp-protocol-version'] || null,
      auth: req.headers['authorization']?.substring(0, 20) + '...',
      method: getJsonRpcMethod(req.body),
    });
    next();
  });

  // Handle POST /mcp (JSON-RPC messages) and GET /mcp (SSE streams)
  app.post('/mcp', bearerAuth, async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const rpcMethod = getJsonRpcMethod(req.body);
    const sessionMatched = !!(sessionId && sessions.has(sessionId));

    console.log('[MCP POST] Incoming request', {
      sessionId: sessionId || null,
      sessionMatched,
      rpcMethod,
    });

    try {
      if (sessionId && sessions.has(sessionId)) {
        // Existing session — forward the request
        const session = sessions.get(sessionId)!;
        console.log('[MCP POST] Reusing existing session', { sessionId, rpcMethod });
        await session.transport.handleRequest(req, res, req.body);
        console.log('[MCP POST] handleRequest completed', { sessionId, rpcMethod, statusCode: res.statusCode });
      } else {
        // No session or stale session — create new one
        if (sessionId) {
          console.log('[MCP POST] Stale session — auto-creating new session', {
            requestedSessionId: sessionId,
            rpcMethod,
          });
        } else {
          console.log('[MCP POST] No session supplied — creating new session', { rpcMethod });
        }
        const server = createMcpServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: true,
          onsessioninitialized: (sid) => {
            console.log('[MCP POST] Session initialized', {
              newSessionId: sid,
              rpcMethod,
            });
            sessions.set(sid, { transport, server });
          },
        });

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      }
    } catch (err) {
      console.error('[MCP POST] Error:', {
        sessionId: sessionId || null,
        sessionMatched,
        rpcMethod,
      }, err);
      if (!res.headersSent) res.status(500).json({ error: 'Internal MCP error' });
    }
  });

  app.get('/mcp', bearerAuth, async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    console.log('[MCP GET] SSE stream request', { sessionId, matched: !!(sessionId && sessions.has(sessionId)), activeSessions: sessions.size });
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      await session.transport.handleRequest(req, res);
    } else {
      // Stale or missing session — return 404 so client re-initializes via POST
      console.log('[MCP GET] Session not found, returning 404 to trigger re-init', { sessionId });
      res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Session expired. Please re-initialize.' },
        id: null,
      });
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
