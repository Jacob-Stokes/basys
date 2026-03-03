import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { requireAuth } from '../middleware/auth';

const router = Router();

// Register new user (only for initial setup - you may want to disable this in production)
router.post('/register', (req, res) => {
  try {
    const { username, password, email } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }

    // Check if user already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Username already exists'
      });
    }

    // Hash password
    const passwordHash = bcrypt.hashSync(password, 10);

    // Create user
    const userId = uuidv4();
    db.prepare(`
      INSERT INTO users (id, username, password_hash, email)
      VALUES (?, ?, ?, ?)
    `).run(userId, username, passwordHash, email || null);

    res.json({
      success: true,
      data: {
        id: userId,
        username,
        email
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Login
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }

    // Get user
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password'
      });
    }

    // Set session
    (req.session as any).userId = user.id;

    res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: 'Failed to logout'
      });
    }

    res.json({
      success: true,
      data: { message: 'Logged out successfully' }
    });
  });
});

// Get current user
router.get('/me', requireAuth, (req, res) => {
  res.json({
    success: true,
    data: req.user
  });
});

// Generate API key
router.post('/api-keys', requireAuth, (req, res) => {
  try {
    const { name, expiresInDays } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'API key name is required'
      });
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

    res.json({
      success: true,
      data: {
        id: keyId,
        name,
        key: apiKey,
        expiresAt,
        warning: 'Store this API key securely. It will not be shown again.'
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
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

    res.json({
      success: true,
      data: keys
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
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
      return res.status(404).json({
        success: false,
        error: 'API key not found'
      });
    }

    res.json({
      success: true,
      data: { message: 'API key deleted successfully' }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
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

    res.json({
      success: true,
      data: {
        allow_query_param_auth: user?.allow_query_param_auth !== 0
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
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

    res.json({
      success: true,
      data: {
        allow_query_param_auth: user?.allow_query_param_auth !== 0
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
