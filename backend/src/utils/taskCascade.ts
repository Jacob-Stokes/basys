import { db } from '../db/database';

/**
 * Delete all task-related records (labels, links, relations, checklist items, comments)
 * for the given task IDs, then delete the tasks themselves.
 * Runs inside a transaction for atomicity.
 */
export function deleteTasksCascade(taskIds: string[]) {
  if (taskIds.length === 0) return;
  const placeholders = taskIds.map(() => '?').join(',');
  db.prepare(`DELETE FROM task_labels WHERE task_id IN (${placeholders})`).run(...taskIds);
  db.prepare(`DELETE FROM task_links WHERE task_id IN (${placeholders})`).run(...taskIds);
  db.prepare(`DELETE FROM task_relations WHERE task_id IN (${placeholders}) OR related_task_id IN (${placeholders})`).run(...taskIds, ...taskIds);
  db.prepare(`DELETE FROM task_checklist_items WHERE task_id IN (${placeholders})`).run(...taskIds);
  db.prepare(`DELETE FROM task_comments WHERE task_id IN (${placeholders})`).run(...taskIds);
}
