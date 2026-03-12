import { beforeEach, describe, expect, it } from 'vitest';
import contactsRouter from '../../src/routes/contacts';
import { db } from '../../src/db/database';
import { createAuthedApp, insertRuntimeUser, requestAuthedApp, resetRuntimeDb } from '../helpers/runtimeApp';

describe('Contacts routes', () => {
  let user: ReturnType<typeof insertRuntimeUser>;
  let app: ReturnType<typeof createAuthedApp>;

  beforeEach(() => {
    resetRuntimeDb();
    user = insertRuntimeUser();
    app = createAuthedApp(user, [{ basePath: '/api/contacts', router: contactsRouter }]);
  });

  it('creates a contact and persists tags plus custom fields', async () => {
    const createResponse = await requestAuthedApp(app, {
      method: 'POST',
      path: '/api/contacts',
      body: {
        name: 'Alice Example',
        company: 'Thesys',
        tags: ['friend', 'vip'],
        fields: [
          { field_group: 'Meta', field_label: 'Twitter', field_value: '@alice' },
          { field_group: 'Meta', field_label: 'City', field_value: 'London' },
        ],
      },
    });

    expect(createResponse.status).toBe(200);
    expect((createResponse.body as any).success).toBe(true);

    const detailResponse = await requestAuthedApp(app, {
      method: 'GET',
      path: `/api/contacts/${(createResponse.body as any).data.id}`,
    });

    expect(detailResponse.status).toBe(200);
    expect((detailResponse.body as any).data.tags).toEqual(['friend', 'vip']);
    expect((detailResponse.body as any).data.fields).toHaveLength(2);
    expect((detailResponse.body as any).data.fields.map((field: { field_label: string }) => field.field_label)).toEqual(
      expect.arrayContaining(['Twitter', 'City'])
    );
  });

  it('returns only overdue contacts from the reminders endpoint', async () => {
    db.prepare(`
      INSERT INTO contacts (id, user_id, name, contact_frequency_days, last_contacted_at, archived, created_at, updated_at)
      VALUES ('due-contact', ?, 'Due Contact', 7, datetime('now', '-30 days'), 0, datetime('now'), datetime('now'))
    `).run(user.id);

    db.prepare(`
      INSERT INTO contacts (id, user_id, name, contact_frequency_days, last_contacted_at, archived, created_at, updated_at)
      VALUES ('recent-contact', ?, 'Recent Contact', 365, datetime('now', '-1 day'), 0, datetime('now'), datetime('now'))
    `).run(user.id);

    const response = await requestAuthedApp(app, {
      method: 'GET',
      path: '/api/contacts/reminders/due',
    });

    expect(response.status).toBe(200);
    expect((response.body as any).data).toHaveLength(1);
    expect((response.body as any).data[0].name).toBe('Due Contact');
  });

  it('recalculates last_contacted_at when the latest interaction is deleted', async () => {
    const createResponse = await requestAuthedApp(app, {
      method: 'POST',
      path: '/api/contacts',
      body: { name: 'Delete Interaction Contact' },
    });
    const contactId = (createResponse.body as any).data.id as string;

    const first = await requestAuthedApp(app, {
      method: 'POST',
      path: `/api/contacts/${contactId}/interactions`,
      body: { type: 'call', interaction_date: '2026-01-01', title: 'Oldest' },
    });
    const second = await requestAuthedApp(app, {
      method: 'POST',
      path: `/api/contacts/${contactId}/interactions`,
      body: { type: 'call', interaction_date: '2026-02-01', title: 'Latest' },
    });

    expect(second.status).toBe(200);

    const deleteResponse = await requestAuthedApp(app, {
      method: 'DELETE',
      path: `/api/contacts/interactions/${(second.body as any).data.id}`,
    });

    expect(deleteResponse.status).toBe(200);
    const contact = db.prepare('SELECT last_contacted_at FROM contacts WHERE id = ?').get(contactId) as { last_contacted_at: string | null };
    expect(contact.last_contacted_at).toBe('2026-01-01');
    expect((first.body as any).data.title).toBe('Oldest');
  });
});
