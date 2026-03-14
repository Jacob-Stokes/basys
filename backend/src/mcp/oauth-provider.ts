/**
 * OAuth 2.1 provider for the remote MCP endpoint.
 * Authenticates against the users table.
 */

import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { db } from '../db/database';
import { renderLoginPage } from './auth-page';
import type {
  OAuthServerProvider,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type {
  OAuthRegisteredClientsStore,
} from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';

// Token lifetimes
const ACCESS_TOKEN_TTL = 60 * 60 * 24 * 7;  // 7 days in seconds
const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 30; // 30 days in seconds
const AUTH_CODE_TTL = 60 * 10;              // 10 minutes in seconds

// ─── Clients Store ───────────────────────────────────────────

class SqliteClientsStore implements OAuthRegisteredClientsStore {
  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    const row = db.prepare('SELECT * FROM oauth_clients WHERE client_id = ?').get(clientId) as any;
    if (!row) return undefined;
    return this.rowToClient(row);
  }

  async registerClient(client: OAuthClientInformationFull): Promise<OAuthClientInformationFull> {
    db.prepare(`
      INSERT INTO oauth_clients (client_id, client_secret, client_secret_expires_at, redirect_uris, client_name, client_uri, grant_types, response_types, token_endpoint_auth_method, scope, client_id_issued_at, client_metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      client.client_id,
      client.client_secret || null,
      client.client_secret_expires_at || 0,
      JSON.stringify(client.redirect_uris),
      client.client_name || null,
      client.client_uri || null,
      JSON.stringify(client.grant_types || ['authorization_code']),
      JSON.stringify(client.response_types || ['code']),
      client.token_endpoint_auth_method || 'client_secret_post',
      client.scope || null,
      client.client_id_issued_at || Math.floor(Date.now() / 1000),
      JSON.stringify(client),
    );
    return client;
  }

  private rowToClient(row: any): OAuthClientInformationFull {
    // If we have the full metadata blob, use it; otherwise reconstruct
    if (row.client_metadata) {
      try {
        return JSON.parse(row.client_metadata);
      } catch { /* fall through */ }
    }
    return {
      client_id: row.client_id,
      client_secret: row.client_secret || undefined,
      client_secret_expires_at: row.client_secret_expires_at || 0,
      redirect_uris: JSON.parse(row.redirect_uris || '[]'),
      client_name: row.client_name || undefined,
      client_uri: row.client_uri || undefined,
      grant_types: JSON.parse(row.grant_types || '["authorization_code"]'),
      response_types: JSON.parse(row.response_types || '["code"]'),
      token_endpoint_auth_method: row.token_endpoint_auth_method || 'client_secret_post',
      scope: row.scope || undefined,
      client_id_issued_at: row.client_id_issued_at || 0,
    };
  }
}

// ─── OAuth Provider ──────────────────────────────────────────

export class HaradaOAuthProvider implements OAuthServerProvider {
  clientsStore = new SqliteClientsStore();

  /**
   * Called by the SDK's /authorize handler.
   * Renders the login form — the user submits to POST /oauth/callback.
   */
  async authorize(
    client: OAuthClientInformationFull,
    params: {
      state?: string;
      scopes?: string[];
      codeChallenge: string;
      codeChallengeMethod?: string;
      redirectUri: string;
      resource?: URL;
    },
    res: any, // Express Response
  ): Promise<void> {
    const html = renderLoginPage({
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      state: params.state || '',
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod || 'S256',
      scopes: (params.scopes || []).join(' '),
      resource: params.resource?.toString(),
    });
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }

  /**
   * Return the code_challenge for PKCE validation.
   */
  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const row = db.prepare('SELECT code_challenge FROM oauth_auth_codes WHERE code = ?').get(authorizationCode) as any;
    if (!row) throw new Error('Invalid authorization code');
    return row.code_challenge;
  }

  /**
   * Exchange an authorization code for tokens.
   */
  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    _redirectUri?: string,
    _resource?: URL,
  ): Promise<OAuthTokens> {
    const row = db.prepare('SELECT * FROM oauth_auth_codes WHERE code = ? AND client_id = ?')
      .get(authorizationCode, client.client_id) as any;

    if (!row) throw new Error('Invalid authorization code');

    const now = Math.floor(Date.now() / 1000);
    if (row.expires_at < now) {
      db.prepare('DELETE FROM oauth_auth_codes WHERE code = ?').run(authorizationCode);
      throw new Error('Authorization code expired');
    }

    // Delete the code (single-use)
    db.prepare('DELETE FROM oauth_auth_codes WHERE code = ?').run(authorizationCode);

    // Generate tokens
    return this.generateTokens(client.client_id, row.user_id, row.scopes || '', row.resource);
  }

  /**
   * Exchange a refresh token for new tokens.
   */
  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    _scopes?: string[],
    _resource?: URL,
  ): Promise<OAuthTokens> {
    const row = db.prepare(
      "SELECT * FROM oauth_tokens WHERE token = ? AND token_type = 'refresh' AND client_id = ?"
    ).get(refreshToken, client.client_id) as any;

    if (!row) throw new Error('Invalid refresh token');

    const now = Math.floor(Date.now() / 1000);
    if (row.expires_at < now) {
      db.prepare('DELETE FROM oauth_tokens WHERE token = ?').run(refreshToken);
      throw new Error('Refresh token expired');
    }

    // Delete old refresh token
    db.prepare('DELETE FROM oauth_tokens WHERE token = ?').run(refreshToken);

    // Generate new tokens
    return this.generateTokens(client.client_id, row.user_id, row.scopes || '', row.resource);
  }

  /**
   * Verify an access token — called on every /mcp request.
   * Returns AuthInfo with userId in extra for tool handlers.
   */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const row = db.prepare(
      "SELECT * FROM oauth_tokens WHERE token = ? AND token_type = 'access'"
    ).get(token) as any;

    if (!row) throw new Error('Invalid access token');

    const now = Math.floor(Date.now() / 1000);
    if (row.expires_at < now) {
      db.prepare('DELETE FROM oauth_tokens WHERE token = ?').run(token);
      throw new Error('Access token expired');
    }

    return {
      token,
      clientId: row.client_id,
      scopes: row.scopes ? row.scopes.split(' ') : [],
      expiresAt: row.expires_at,
      extra: { userId: row.user_id },
    };
  }

  /**
   * Revoke a token.
   */
  async revokeToken(
    _client: OAuthClientInformationFull,
    request: { token: string },
  ): Promise<void> {
    db.prepare('DELETE FROM oauth_tokens WHERE token = ?').run(request.token);
  }

  // ─── Helpers ─────────────────────────────────────────────

  private generateTokens(
    clientId: string,
    userId: string,
    scopes: string,
    resource?: string,
  ): OAuthTokens {
    const now = Math.floor(Date.now() / 1000);

    const accessToken = uuidv4();
    const refreshToken = uuidv4();

    db.prepare(`
      INSERT INTO oauth_tokens (token, token_type, client_id, user_id, scopes, resource, expires_at)
      VALUES (?, 'access', ?, ?, ?, ?, ?)
    `).run(accessToken, clientId, userId, scopes, resource || null, now + ACCESS_TOKEN_TTL);

    db.prepare(`
      INSERT INTO oauth_tokens (token, token_type, client_id, user_id, scopes, resource, expires_at)
      VALUES (?, 'refresh', ?, ?, ?, ?, ?)
    `).run(refreshToken, clientId, userId, scopes, resource || null, now + REFRESH_TOKEN_TTL);

    return {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: ACCESS_TOKEN_TTL,
      refresh_token: refreshToken,
      scope: scopes || undefined,
    } as unknown as OAuthTokens;
  }

  /**
   * Create an authorization code after successful login.
   * Called from the POST /oauth/callback route.
   */
  createAuthorizationCode(
    clientId: string,
    userId: string,
    redirectUri: string,
    codeChallenge: string,
    codeChallengeMethod: string,
    scopes: string,
    resource?: string,
  ): string {
    const code = uuidv4();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO oauth_auth_codes (code, client_id, user_id, redirect_uri, code_challenge, code_challenge_method, scopes, resource, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(code, clientId, userId, redirectUri, codeChallenge, codeChallengeMethod, scopes, resource || null, now + AUTH_CODE_TTL);

    return code;
  }

  /**
   * Validate user credentials against the users table.
   * Returns userId on success, null on failure.
   */
  validateCredentials(username: string, password: string): string | null {
    const user = db.prepare('SELECT id, password_hash FROM users WHERE username = ?').get(username) as any;
    if (!user) return null;
    if (!bcrypt.compareSync(password, user.password_hash)) return null;
    return user.id;
  }
}

/**
 * Periodically clean up expired OAuth tokens and codes.
 */
export function startOAuthCleanup(intervalMs = 60 * 60 * 1000): NodeJS.Timeout {
  return setInterval(() => {
    const now = Math.floor(Date.now() / 1000);
    db.prepare('DELETE FROM oauth_auth_codes WHERE expires_at < ?').run(now);
    db.prepare('DELETE FROM oauth_tokens WHERE expires_at < ?').run(now);
  }, intervalMs);
}
