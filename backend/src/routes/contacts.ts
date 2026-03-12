import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { ok, fail, serverError } from '../utils/response';

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────

function getTags(contactId: string): string[] {
  const rows = db.prepare('SELECT tag FROM contact_tags WHERE contact_id = ? ORDER BY tag').all(contactId) as { tag: string }[];
  return rows.map(r => r.tag);
}

function getFields(contactId: string): any[] {
  return db.prepare('SELECT id, field_group, field_label, field_value, position FROM contact_field_values WHERE contact_id = ? ORDER BY position, field_label').all(contactId);
}

function replaceTags(contactId: string, tags: string[]) {
  db.prepare('DELETE FROM contact_tags WHERE contact_id = ?').run(contactId);
  const stmt = db.prepare('INSERT INTO contact_tags (contact_id, tag) VALUES (?, ?)');
  for (const tag of [...new Set(tags.map(t => t.trim()).filter(Boolean))]) {
    stmt.run(contactId, tag);
  }
}

function replaceFields(contactId: string, fields: { field_group: string; field_label: string; field_value: string; position?: number }[]) {
  db.prepare('DELETE FROM contact_field_values WHERE contact_id = ?').run(contactId);
  const stmt = db.prepare('INSERT INTO contact_field_values (id, contact_id, field_group, field_label, field_value, position) VALUES (?, ?, ?, ?, ?, ?)');
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    stmt.run(uuidv4(), contactId, f.field_group, f.field_label, f.field_value, f.position ?? i);
  }
}

function enrichContact(contact: any): any {
  return {
    ...contact,
    tags: getTags(contact.id),
  };
}

// ── Contacts CRUD ────────────────────────────────────────────────

// GET / — List contacts
router.get('/', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const q = (req.query.q as string || '').trim();
    const tag = (req.query.tag as string || '').trim();
    const type = (req.query.type as string || '').trim();
    const archived = req.query.archived === '1' ? 1 : 0;

    let sql = 'SELECT * FROM contacts WHERE user_id = ? AND archived = ?';
    const params: any[] = [userId, archived];

    if (q) {
      sql += ' AND (name LIKE ? OR company LIKE ? OR email LIKE ? OR nickname LIKE ? OR notes LIKE ?)';
      const term = `%${q}%`;
      params.push(term, term, term, term, term);
    }
    if (type) {
      sql += ' AND relationship_type = ?';
      params.push(type);
    }

    sql += ' ORDER BY is_favorite DESC, name ASC';

    let contacts = db.prepare(sql).all(...params) as any[];

    // Tag filter (post-query since tags are in a separate table)
    if (tag) {
      const tagContactIds = new Set(
        (db.prepare('SELECT contact_id FROM contact_tags WHERE tag = ?').all(tag) as { contact_id: string }[]).map(r => r.contact_id)
      );
      contacts = contacts.filter(c => tagContactIds.has(c.id));
    }

    ok(res, contacts.map(enrichContact));
  } catch (error) {
    serverError(res, error);
  }
});

// GET /reminders/due — Contacts overdue for outreach
router.get('/reminders/due', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const contacts = db.prepare(`
      SELECT * FROM contacts
      WHERE user_id = ? AND archived = 0 AND contact_frequency_days IS NOT NULL
        AND (last_contacted_at IS NULL OR datetime(last_contacted_at, '+' || contact_frequency_days || ' days') < datetime('now'))
      ORDER BY
        CASE WHEN last_contacted_at IS NULL THEN 0 ELSE 1 END,
        datetime(last_contacted_at, '+' || contact_frequency_days || ' days') ASC
    `).all(userId) as any[];

    ok(res, contacts.map(enrichContact));
  } catch (error) {
    serverError(res, error);
  }
});

// GET /:id — Single contact with tags, fields, recent interactions
router.get('/:id', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const contact = db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?').get(req.params.id, userId) as any;
    if (!contact) return fail(res, 404, 'Contact not found');

    const tags = getTags(contact.id);
    const fields = getFields(contact.id);
    const recentInteractions = db.prepare(
      'SELECT * FROM contact_interactions WHERE contact_id = ? ORDER BY interaction_date DESC, created_at DESC LIMIT 20'
    ).all(contact.id);

    ok(res, { ...contact, tags, fields, interactions: recentInteractions });
  } catch (error) {
    serverError(res, error);
  }
});

// POST / — Create contact
router.post('/', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const { name, nickname, company, job_title, email, phone, website, location, birthday, how_met, notes, relationship_type, contact_frequency_days, tags, fields } = req.body;

    if (!name?.trim()) return fail(res, 400, 'Name is required');

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO contacts (id, user_id, name, nickname, company, job_title, email, phone, website, location, birthday, how_met, notes, relationship_type, contact_frequency_days, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, name.trim(), nickname || null, company || null, job_title || null, email || null, phone || null, website || null, location || null, birthday || null, how_met || null, notes || null, relationship_type || 'acquaintance', contact_frequency_days ?? null, now, now);

    if (tags && Array.isArray(tags)) replaceTags(id, tags);
    if (fields && Array.isArray(fields)) replaceFields(id, fields);

    const created = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id) as any;
    ok(res, enrichContact(created));
  } catch (error) {
    serverError(res, error);
  }
});

// PUT /:id — Update contact
router.put('/:id', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const existing = db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?').get(id, userId) as any;
    if (!existing) return fail(res, 404, 'Contact not found');

    const { name, nickname, company, job_title, email, phone, website, location, birthday, how_met, notes, relationship_type, contact_frequency_days, tags, fields } = req.body;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE contacts SET
        name = ?, nickname = ?, company = ?, job_title = ?,
        email = ?, phone = ?, website = ?, location = ?,
        birthday = ?, how_met = ?, notes = ?,
        relationship_type = ?, contact_frequency_days = ?,
        updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(
      name?.trim() || existing.name, nickname ?? existing.nickname, company ?? existing.company, job_title ?? existing.job_title,
      email ?? existing.email, phone ?? existing.phone, website ?? existing.website, location ?? existing.location,
      birthday ?? existing.birthday, how_met ?? existing.how_met, notes ?? existing.notes,
      relationship_type ?? existing.relationship_type, contact_frequency_days ?? existing.contact_frequency_days,
      now, id, userId
    );

    if (tags && Array.isArray(tags)) replaceTags(id, tags);
    if (fields && Array.isArray(fields)) replaceFields(id, fields);

    const updated = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id) as any;
    ok(res, enrichContact(updated));
  } catch (error) {
    serverError(res, error);
  }
});

// DELETE /:id — Delete contact
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const result = db.prepare('DELETE FROM contacts WHERE id = ? AND user_id = ?').run(req.params.id, userId);
    if (result.changes === 0) return fail(res, 404, 'Contact not found');
    ok(res, { deleted: true });
  } catch (error) {
    serverError(res, error);
  }
});

// PUT /:id/favorite — Toggle favorite
router.put('/:id/favorite', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const contact = db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?').get(req.params.id, userId) as any;
    if (!contact) return fail(res, 404, 'Contact not found');

    const newVal = contact.is_favorite ? 0 : 1;
    db.prepare('UPDATE contacts SET is_favorite = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newVal, contact.id);
    ok(res, { is_favorite: newVal });
  } catch (error) {
    serverError(res, error);
  }
});

// ── Tags ─────────────────────────────────────────────────────────

// PUT /:id/tags — Replace all tags
router.put('/:id/tags', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const contact = db.prepare('SELECT id FROM contacts WHERE id = ? AND user_id = ?').get(id, userId);
    if (!contact) return fail(res, 404, 'Contact not found');

    const { tags } = req.body;
    if (!Array.isArray(tags)) return fail(res, 400, 'tags must be an array');

    replaceTags(id, tags);
    ok(res, { tags: getTags(id) });
  } catch (error) {
    serverError(res, error);
  }
});

// ── Custom Fields ────────────────────────────────────────────────

// PUT /:id/fields — Replace all custom fields
router.put('/:id/fields', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const id = req.params.id as string;
    const contact = db.prepare('SELECT id FROM contacts WHERE id = ? AND user_id = ?').get(id, userId);
    if (!contact) return fail(res, 404, 'Contact not found');

    const { fields } = req.body;
    if (!Array.isArray(fields)) return fail(res, 400, 'fields must be an array');

    replaceFields(id, fields);
    ok(res, { fields: getFields(id) });
  } catch (error) {
    serverError(res, error);
  }
});

// ── Interactions ─────────────────────────────────────────────────

// GET /:id/interactions — List interactions
router.get('/:id/interactions', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const contact = db.prepare('SELECT id FROM contacts WHERE id = ? AND user_id = ?').get(req.params.id, userId);
    if (!contact) return fail(res, 404, 'Contact not found');

    const interactions = db.prepare(
      'SELECT * FROM contact_interactions WHERE contact_id = ? ORDER BY interaction_date DESC, created_at DESC'
    ).all(req.params.id);

    ok(res, interactions);
  } catch (error) {
    serverError(res, error);
  }
});

// POST /:id/interactions — Create interaction
router.post('/:id/interactions', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const contactId = req.params.id;
    const contact = db.prepare('SELECT id FROM contacts WHERE id = ? AND user_id = ?').get(contactId, userId);
    if (!contact) return fail(res, 404, 'Contact not found');

    const { type, title, description, interaction_date } = req.body;
    if (!type) return fail(res, 400, 'type is required');
    if (!interaction_date) return fail(res, 400, 'interaction_date is required');

    const id = uuidv4();
    db.prepare(
      'INSERT INTO contact_interactions (id, contact_id, user_id, type, title, description, interaction_date) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, contactId, userId, type, title || null, description || null, interaction_date);

    // Update last_contacted_at
    db.prepare('UPDATE contacts SET last_contacted_at = ?, updated_at = datetime(\'now\') WHERE id = ?').run(interaction_date, contactId);

    const created = db.prepare('SELECT * FROM contact_interactions WHERE id = ?').get(id);
    ok(res, created);
  } catch (error) {
    serverError(res, error);
  }
});

// PUT /interactions/:id — Update interaction
router.put('/interactions/:id', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const interactionId = req.params.id;
    const existing = db.prepare('SELECT * FROM contact_interactions WHERE id = ? AND user_id = ?').get(interactionId, userId) as any;
    if (!existing) return fail(res, 404, 'Interaction not found');

    const { type, title, description, interaction_date } = req.body;
    db.prepare(`
      UPDATE contact_interactions SET type = ?, title = ?, description = ?, interaction_date = ? WHERE id = ?
    `).run(type ?? existing.type, title ?? existing.title, description ?? existing.description, interaction_date ?? existing.interaction_date, interactionId);

    // Recalculate last_contacted_at for the contact
    const latest = db.prepare(
      'SELECT MAX(interaction_date) as latest FROM contact_interactions WHERE contact_id = ?'
    ).get(existing.contact_id) as any;
    if (latest?.latest) {
      db.prepare('UPDATE contacts SET last_contacted_at = ?, updated_at = datetime(\'now\') WHERE id = ?').run(latest.latest, existing.contact_id);
    }

    const updated = db.prepare('SELECT * FROM contact_interactions WHERE id = ?').get(interactionId);
    ok(res, updated);
  } catch (error) {
    serverError(res, error);
  }
});

// DELETE /interactions/:id — Delete interaction
router.delete('/interactions/:id', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const existing = db.prepare('SELECT * FROM contact_interactions WHERE id = ? AND user_id = ?').get(req.params.id, userId) as any;
    if (!existing) return fail(res, 404, 'Interaction not found');

    db.prepare('DELETE FROM contact_interactions WHERE id = ?').run(req.params.id);

    // Recalculate last_contacted_at
    const latest = db.prepare(
      'SELECT MAX(interaction_date) as latest FROM contact_interactions WHERE contact_id = ?'
    ).get(existing.contact_id) as any;
    db.prepare('UPDATE contacts SET last_contacted_at = ?, updated_at = datetime(\'now\') WHERE id = ?').run(latest?.latest || null, existing.contact_id);

    ok(res, { deleted: true });
  } catch (error) {
    serverError(res, error);
  }
});

export default router;
