import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/database';

// Extend Express Request type to include user
declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: string;
      username: string;
      display_name: string | null;
      is_admin: boolean;
    };
  }
}

// Validate an API key record: check hash match and expiration
function validateApiKey(apiKey: string, record: any): boolean {
  // Check expiration
  if (record.expires_at && new Date(record.expires_at) < new Date()) {
    return false;
  }
  // Check hash
  return bcrypt.compareSync(apiKey, record.key_hash);
}

// Resolve API key from header or query param, respecting user's query param setting
function resolveApiKey(req: Request): string | null {
  const headerKey = req.headers['x-api-key'] as string;
  if (headerKey) return headerKey;

  const queryKey = req.query.apiKey as string;
  if (!queryKey) return null;

  // Check if the user who owns this key allows query param auth
  const keyId = queryKey.substring(0, 36);
  const user = db.prepare(`
    SELECT u.allow_query_param_auth
    FROM api_keys ak
    JOIN users u ON ak.user_id = u.id
    WHERE ak.id = ?
  `).get(keyId) as any;

  if (user && user.allow_query_param_auth === 0) {
    return null; // User has disabled query param auth
  }

  return queryKey;
}

// Middleware to check if user is authenticated via session OR API key
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = resolveApiKey(req);

  if (apiKey) {
    // Validate API key - extract key ID from format: {uuid}-{randomstring}
    // UUID is 36 chars (including dashes), e.g., "1e1be6bb-0e71-438d-b92f-55a4c6da2f54"
    const keyId = apiKey.substring(0, 36);

    const apiKeyRecord = db.prepare(`
      SELECT ak.*, u.id as user_id, u.username, u.display_name, u.is_admin
      FROM api_keys ak
      JOIN users u ON ak.user_id = u.id
      WHERE ak.id = ?
    `).get(keyId) as any;

    if (apiKeyRecord && validateApiKey(apiKey, apiKeyRecord)) {
      // Update last used
      db.prepare(`UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?`).run(apiKeyRecord.id);

      req.user = {
        id: apiKeyRecord.user_id,
        username: apiKeyRecord.username,
        display_name: apiKeyRecord.display_name ?? null,
        is_admin: !!apiKeyRecord.is_admin
      };
      return next();
    }
  }

  // Check session
  if (req.session && (req.session as any).userId) {
    const user = db.prepare('SELECT id, username, display_name, is_admin FROM users WHERE id = ?').get((req.session as any).userId) as any;

    if (user) {
      req.user = {
        id: user.id,
        username: user.username,
        display_name: user.display_name ?? null,
        is_admin: !!user.is_admin
      };
      return next();
    }
  }

  return res.status(401).json({
    success: false,
    error: 'Authentication required. Please login or provide a valid API key.'
  });
};

// Optional auth - sets user if authenticated but doesn't require it
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = resolveApiKey(req);

  if (apiKey) {
    const keyId = apiKey.substring(0, 36);
    const apiKeyRecord = db.prepare(`
      SELECT ak.*, u.id as user_id, u.username, u.display_name, u.is_admin
      FROM api_keys ak
      JOIN users u ON ak.user_id = u.id
      WHERE ak.id = ?
    `).get(keyId) as any;

    if (apiKeyRecord && validateApiKey(apiKey, apiKeyRecord)) {
      db.prepare(`UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?`).run(apiKeyRecord.id);
      req.user = {
        id: apiKeyRecord.user_id,
        username: apiKeyRecord.username,
        display_name: apiKeyRecord.display_name ?? null,
        is_admin: !!apiKeyRecord.is_admin
      };
    }
  } else if (req.session && (req.session as any).userId) {
    const user = db.prepare('SELECT id, username, display_name, is_admin FROM users WHERE id = ?').get((req.session as any).userId) as any;
    if (user) {
      req.user = {
        id: user.id,
        username: user.username,
        display_name: user.display_name ?? null,
        is_admin: !!user.is_admin
      };
    }
  }

  next();
};

// Middleware to require admin privileges
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({
      success: false,
      error: 'Admin privileges required.'
    });
  }
  next();
};
