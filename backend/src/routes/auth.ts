import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { requireAuth } from '../middleware/auth';
import { ok, fail, serverError } from '../utils/response';

const router = Router();

// Register first user only (when no users exist — initial setup)
router.post('/register', (req, res) => {
  try {
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as any;
    if (userCount.count > 0) {
      return fail(res, 403, 'Registration is disabled. Contact an administrator to create your account.');
    }

    const { username, password, email } = req.body;

    if (!username || !password) {
      return fail(res, 400, 'Username and password are required');
    }

    const passwordHash = bcrypt.hashSync(password, 10);

    const userId = uuidv4();
    db.prepare(`
      INSERT INTO users (id, username, password_hash, email, is_admin)
      VALUES (?, ?, ?, ?, 1)
    `).run(userId, username, passwordHash, email || null);

    ok(res, {
      id: userId,
      username,
      email,
      is_admin: true
    });
  } catch (error: any) {
    serverError(res, error);
  }
});

// Login
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return fail(res, 400, 'Username and password are required');
    }

    // Get user
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return fail(res, 401, 'Invalid username or password');
    }

    // Set session
    (req.session as any).userId = user.id;

    ok(res, {
      id: user.id,
      username: user.username,
      email: user.email
    });
  } catch (error: any) {
    serverError(res, error);
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return fail(res, 500, 'Failed to logout');
    }

    ok(res, { message: 'Logged out successfully' });
  });
});

// Get current user (full profile including weather/timezone settings)
router.get('/me', requireAuth, (req: Request, res: Response) => {
  try {
    const user = db.prepare(`
      SELECT id, username, email, display_name, is_admin, allow_query_param_auth,
             weather_latitude, weather_longitude, weather_location_name,
             timezone, use_browser_time, temperature_unit, todo_hidden_project_types,
             obsidian_vault_name, obsidian_enabled
      FROM users WHERE id = ?
    `).get(req.user!.id) as any;
    ok(res, {
      ...user,
      is_admin: !!user.is_admin,
      use_browser_time: user.use_browser_time !== 0,
      todo_hidden_project_types: user.todo_hidden_project_types || 'dev',
      obsidian_enabled: !!user.obsidian_enabled,
    });
  } catch (error) {
    serverError(res, error);
  }
});

// Update current user profile
router.patch('/me', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const allowedFields: Record<string, (v: any) => any> = {
      display_name: v => v ?? null,
      weather_latitude: v => v ?? null,
      weather_longitude: v => v ?? null,
      weather_location_name: v => v ?? null,
      timezone: v => v ?? null,
      use_browser_time: v => v ? 1 : 0,
      temperature_unit: v => v ?? 'celsius',
      todo_hidden_project_types: v => v ?? 'dev',
      obsidian_vault_name: v => v ?? null,
      obsidian_enabled: v => v ? 1 : 0,
    };

    const updates: string[] = [];
    const values: any[] = [];
    for (const [field, transform] of Object.entries(allowedFields)) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(transform(req.body[field]));
      }
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values, userId);
    }

    const updated = db.prepare(`
      SELECT id, username, email, display_name, is_admin, allow_query_param_auth,
             weather_latitude, weather_longitude, weather_location_name,
             timezone, use_browser_time, temperature_unit, todo_hidden_project_types,
             obsidian_vault_name, obsidian_enabled
      FROM users WHERE id = ?
    `).get(userId) as any;
    ok(res, { ...updated, is_admin: !!updated.is_admin, use_browser_time: updated.use_browser_time !== 0, todo_hidden_project_types: updated.todo_hidden_project_types || 'dev', obsidian_enabled: !!updated.obsidian_enabled });
  } catch (error) {
    serverError(res, error);
  }
});

// Generate API key
router.post('/api-keys', requireAuth, (req, res) => {
  try {
    const { name, expiresInDays } = req.body;

    if (!name) {
      return fail(res, 400, 'API key name is required');
    }

    // Generate API key (format: id-randomstring)
    const keyId = uuidv4();
    const randomPart = uuidv4().replace(/-/g, '');
    const apiKey = `${keyId}-${randomPart}`;

    // Hash the key for storage
    const keyHash = bcrypt.hashSync(apiKey, 10);

    // Calculate expiration
    let expiresAt = null;
    if (expiresInDays) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + expiresInDays);
      expiresAt = expiry.toISOString();
    }

    // Store in database
    db.prepare(`
      INSERT INTO api_keys (id, user_id, key_hash, name, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(keyId, req.user!.id, keyHash, name, expiresAt);

    ok(res, {
      id: keyId,
      name,
      key: apiKey,
      expiresAt,
      warning: 'Store this API key securely. It will not be shown again.'
    });
  } catch (error: any) {
    serverError(res, error);
  }
});

// List API keys
router.get('/api-keys', requireAuth, (req, res) => {
  try {
    const keys = db.prepare(`
      SELECT id, name, last_used_at, created_at, expires_at
      FROM api_keys
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(req.user!.id);

    ok(res, keys);
  } catch (error: any) {
    serverError(res, error);
  }
});

// Delete API key
router.delete('/api-keys/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;

    const result = db.prepare(`
      DELETE FROM api_keys
      WHERE id = ? AND user_id = ?
    `).run(id, req.user!.id);

    if (result.changes === 0) {
      return fail(res, 404, 'API key not found');
    }

    ok(res, { message: 'API key deleted successfully' });
  } catch (error: any) {
    serverError(res, error);
  }
});

// Get user settings
router.get('/settings', requireAuth, (req, res) => {
  try {
    const user = db.prepare(`
      SELECT allow_query_param_auth
      FROM users
      WHERE id = ?
    `).get(req.user!.id) as any;

    ok(res, {
      allow_query_param_auth: user?.allow_query_param_auth !== 0
    });
  } catch (error: any) {
    serverError(res, error);
  }
});

// Update user settings
router.put('/settings', requireAuth, (req, res) => {
  try {
    const { allow_query_param_auth } = req.body;

    if (typeof allow_query_param_auth === 'boolean') {
      db.prepare(`
        UPDATE users SET allow_query_param_auth = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(allow_query_param_auth ? 1 : 0, req.user!.id);
    }

    const user = db.prepare(`
      SELECT allow_query_param_auth
      FROM users
      WHERE id = ?
    `).get(req.user!.id) as any;

    ok(res, {
      allow_query_param_auth: user?.allow_query_param_auth !== 0
    });
  } catch (error: any) {
    serverError(res, error);
  }
});

// Change password (authenticated user)
router.put('/password', requireAuth, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return fail(res, 400, 'Current password and new password are required');
    }

    if (newPassword.length < 6) {
      return fail(res, 400, 'New password must be at least 6 characters');
    }

    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as any;
    if (!user) {
      return fail(res, 404, 'User not found');
    }

    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      return fail(res, 401, 'Current password is incorrect');
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
      .run(newHash, req.user!.id);

    ok(res, { message: 'Password changed successfully' });
  } catch (error: any) {
    serverError(res, error);
  }
});

// Terminal token — return shared secret to authenticated users
router.get('/terminal-token', requireAuth, (req, res) => {
  const secret = process.env.TERMINAL_SHARED_SECRET;
  if (!secret) {
    return fail(res, 503, 'Terminal service is not configured');
  }
  ok(res, { token: secret });
});

// Terminal token validation — called server-to-server by sidecar (no session auth)
router.post('/terminal-validate', (req, res) => {
  const { token } = req.body;
  const secret = process.env.TERMINAL_SHARED_SECRET;
  if (!secret || !token || token !== secret) {
    return fail(res, 401, 'Invalid token');
  }
  ok(res, { valid: true });
});

export default router;
