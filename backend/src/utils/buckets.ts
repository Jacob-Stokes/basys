import { db } from '../db/database';
import { v4 as uuidv4 } from 'uuid';

export const DEFAULT_BUCKETS = [
  { title: 'To Do', position: 0, is_done_column: 0, emoji: '📋', show_inline: 1 },
  { title: 'In Progress', position: 1, is_done_column: 0, emoji: '🔨', show_inline: 1 },
  { title: 'Review', position: 2, is_done_column: 0, emoji: '👀', show_inline: 1 },
  { title: 'Done', position: 3, is_done_column: 1, emoji: '✅', show_inline: 1 },
];

/**
 * Ensure a project has project-level buckets (sprint_id IS NULL).
 * Creates default buckets if none exist. Idempotent.
 */
export function ensureProjectBuckets(projectId: string): void {
  const existing = db.prepare('SELECT COUNT(*) as cnt FROM buckets WHERE project_id = ? AND sprint_id IS NULL').get(projectId) as any;
  if (existing.cnt > 0) return;
  const insertBucket = db.prepare(
    'INSERT INTO buckets (id, project_id, sprint_id, title, position, is_done_column, emoji, show_inline) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)'
  );
  for (const col of DEFAULT_BUCKETS) {
    insertBucket.run(uuidv4(), projectId, col.title, col.position, col.is_done_column, col.emoji, col.show_inline);
  }
}
