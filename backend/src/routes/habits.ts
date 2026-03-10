import { Router, Request, Response } from 'express';
import { db, Habit, HabitLog } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { ok, fail, serverError } from '../utils/response';
import { ownedSubGoal } from '../middleware/ownership';

const router = Router();

// ── Stats helpers ──────────────────────────────────────────────────

function computeHabitStats(habitId: string) {
  const today = new Date().toISOString().split('T')[0];

  const logDates = db.prepare(
    'SELECT DISTINCT log_date FROM habit_logs WHERE habit_id = ? ORDER BY log_date DESC'
  ).all(habitId) as { log_date: string }[];

  const dateSet = new Set(logDates.map(d => d.log_date));

  // Current streak
  let currentStreak = 0;
  const checkDate = new Date(today + 'T12:00:00');
  if (!dateSet.has(today)) {
    checkDate.setDate(checkDate.getDate() - 1);
  }
  while (dateSet.has(checkDate.toISOString().split('T')[0])) {
    currentStreak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  // Best streak
  const sortedDates = logDates.map(d => d.log_date).sort();
  let bestStreak = 0;
  let tempStreak = 0;
  for (let i = 0; i < sortedDates.length; i++) {
    if (i === 0) {
      tempStreak = 1;
    } else {
      const prev = new Date(sortedDates[i - 1] + 'T12:00:00');
      const curr = new Date(sortedDates[i] + 'T12:00:00');
      const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      if (Math.round(diffDays) === 1) {
        tempStreak++;
      } else {
        tempStreak = 1;
      }
    }
    bestStreak = Math.max(bestStreak, tempStreak);
  }

  // Total events
  const totalResult = db.prepare(
    'SELECT COUNT(*) as count FROM habit_logs WHERE habit_id = ?'
  ).get(habitId) as { count: number };

  // This week's completions (Mon–Sun)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon …
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  const mondayStr = monday.toISOString().split('T')[0];
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const sundayStr = sunday.toISOString().split('T')[0];

  const weekLogs = db.prepare(
    'SELECT DISTINCT log_date FROM habit_logs WHERE habit_id = ? AND log_date >= ? AND log_date <= ?'
  ).all(habitId, mondayStr, sundayStr) as { log_date: string }[];
  const weekDates = new Set(weekLogs.map(d => d.log_date));

  const weekCompletions: boolean[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekCompletions.push(weekDates.has(d.toISOString().split('T')[0]));
  }

  return {
    currentStreak,
    bestStreak,
    totalEvents: totalResult.count,
    weekCompletions,
    todayLogged: dateSet.has(today),
  };
}

function computeQuitStats(habitId: string, quitDate: string | null) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  const lastLog = db.prepare(
    'SELECT log_date, created_at FROM habit_logs WHERE habit_id = ? ORDER BY log_date DESC, created_at DESC LIMIT 1'
  ).get(habitId) as { log_date: string; created_at: string } | undefined;

  let startDate: Date;
  if (lastLog) {
    const slipDate = new Date(lastLog.created_at || lastLog.log_date + 'T00:00:00');
    const qd = quitDate ? new Date(quitDate + 'T00:00:00') : new Date(0);
    startDate = slipDate > qd ? slipDate : qd;
  } else {
    startDate = quitDate ? new Date(quitDate + 'T00:00:00') : now;
  }

  const elapsedMs = Math.max(0, now.getTime() - startDate.getTime());
  const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));

  const milestones = [30, 90, 180, 365];
  let targetDays = milestones[milestones.length - 1];
  for (const m of milestones) {
    if (elapsedDays < m) {
      targetDays = m;
      break;
    }
  }
  const progressPercent = Math.min(100, Math.round((elapsedDays / targetDays) * 100));

  const totalSlips = db.prepare(
    'SELECT COUNT(*) as count FROM habit_logs WHERE habit_id = ?'
  ).get(habitId) as { count: number };

  return {
    abstinenceStartDate: startDate.toISOString(),
    elapsedDays,
    elapsedMs,
    targetDays,
    progressPercent,
    totalSlips: totalSlips.count,
  };
}

// ── CRUD ───────────────────────────────────────────────────────────

// GET / — list habits (with stats)
router.get('/', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const type = req.query.type as string | undefined;
    const archived = req.query.archived as string | undefined;

    let query = `
      SELECT h.*, sg.title as subgoal_title, sg.position as subgoal_position,
             pg.id as goal_id, pg.title as goal_title
      FROM habits h
      LEFT JOIN sub_goals sg ON h.subgoal_id = sg.id
      LEFT JOIN primary_goals pg ON sg.primary_goal_id = pg.id
      WHERE h.user_id = ?
    `;
    const params: any[] = [userId];

    if (type) {
      query += ' AND h.type = ?';
      params.push(type);
    }

    const archivedVal = archived === '1' ? 1 : 0;
    query += ' AND h.archived = ?';
    params.push(archivedVal);

    query += ' ORDER BY h.position ASC, h.created_at ASC';

    const habits = db.prepare(query).all(...params) as any[];

    const result = habits.map((h: any) => {
      const base = {
        id: h.id, user_id: h.user_id, title: h.title, emoji: h.emoji,
        type: h.type, frequency: h.frequency, quit_date: h.quit_date,
        subgoal_id: h.subgoal_id, archived: h.archived, position: h.position,
        created_at: h.created_at, updated_at: h.updated_at,
        linked_subgoal: h.subgoal_id ? {
          id: h.subgoal_id,
          title: h.subgoal_title,
          position: h.subgoal_position,
          goal_id: h.goal_id,
          goal_title: h.goal_title,
        } : null,
      };
      if (h.type === 'habit') {
        return { ...base, stats: computeHabitStats(h.id) };
      } else {
        return { ...base, stats: computeQuitStats(h.id, h.quit_date) };
      }
    });

    ok(res, result);
  } catch (error) {
    serverError(res, error);
  }
});

// POST / — create habit or quit
router.post('/', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { title, emoji, type, frequency, quit_date, subgoal_id } = req.body;

    if (!title || !type) {
      return fail(res, 400, 'title and type are required');
    }
    if (type !== 'habit' && type !== 'quit') {
      return fail(res, 400, 'type must be "habit" or "quit"');
    }

    // Validate subgoal ownership if provided
    if (subgoal_id) {
      const sg = ownedSubGoal(subgoal_id, userId);
      if (!sg) {
        return fail(res, 400, 'Sub-goal not found or does not belong to you');
      }
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    // Get next position
    const maxPos = db.prepare(
      'SELECT COALESCE(MAX(position), -1) as maxPos FROM habits WHERE user_id = ? AND type = ?'
    ).get(userId, type) as { maxPos: number };

    db.prepare(`
      INSERT INTO habits (id, user_id, title, emoji, type, frequency, quit_date, subgoal_id, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, title, emoji || '', type, frequency || 'daily', quit_date || null, subgoal_id || null, maxPos.maxPos + 1, now, now);

    const created = db.prepare('SELECT * FROM habits WHERE id = ?').get(id) as Habit;
    const stats = type === 'habit' ? computeHabitStats(id) : computeQuitStats(id, quit_date || null);
    ok(res, { ...created, stats });
  } catch (error) {
    serverError(res, error);
  }
});

// PUT /:id — update habit
router.put('/:id', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const id = req.params.id as string;

    const existing = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(id, userId) as Habit | undefined;
    if (!existing) return fail(res, 404, 'Habit not found');

    const { title, emoji, frequency, quit_date, archived, position, subgoal_id } = req.body;
    const now = new Date().toISOString();

    // Validate subgoal ownership if linking
    if (subgoal_id !== undefined && subgoal_id !== null) {
      const sg = ownedSubGoal(subgoal_id, userId);
      if (!sg) {
        return fail(res, 400, 'Sub-goal not found or does not belong to you');
      }
    }

    db.prepare(`
      UPDATE habits SET
        title = ?, emoji = ?, frequency = ?, quit_date = ?,
        archived = ?, position = ?, subgoal_id = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(
      title ?? existing.title,
      emoji ?? existing.emoji,
      frequency ?? existing.frequency,
      quit_date !== undefined ? quit_date : existing.quit_date,
      archived !== undefined ? archived : existing.archived,
      position !== undefined ? position : existing.position,
      subgoal_id !== undefined ? subgoal_id : existing.subgoal_id,
      now, id, userId
    );

    const updated = db.prepare('SELECT * FROM habits WHERE id = ?').get(id) as Habit;
    const stats = updated.type === 'habit'
      ? computeHabitStats(id)
      : computeQuitStats(id, updated.quit_date);
    ok(res, { ...updated, stats });
  } catch (error) {
    serverError(res, error);
  }
});

// DELETE /:id — delete habit (logs cascade)
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const id = req.params.id as string;

    const result = db.prepare('DELETE FROM habits WHERE id = ? AND user_id = ?').run(id, userId);
    if (result.changes === 0) return fail(res, 404, 'Habit not found');

    ok(res, { deleted: true });
  } catch (error) {
    serverError(res, error);
  }
});

// POST /:id/logs — create log ("Did it!" or "Slipped up")
router.post('/:id/logs', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const id = req.params.id as string;
    const { log_date, note } = req.body;

    const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(id, userId) as Habit | undefined;
    if (!habit) return fail(res, 404, 'Habit not found');

    if (!log_date) return fail(res, 400, 'log_date is required');

    const logId = uuidv4();
    db.prepare(`
      INSERT INTO habit_logs (id, habit_id, log_date, note, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(logId, id, log_date, note || null);

    const stats = habit.type === 'habit'
      ? computeHabitStats(id)
      : computeQuitStats(id, habit.quit_date);

    ok(res, { log: { id: logId, habit_id: id, log_date, note: note || null }, stats });
  } catch (error) {
    serverError(res, error);
  }
});

// DELETE /:id/logs/:logId — remove a log
router.delete('/:id/logs/:logId', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const id = req.params.id as string;
    const logId = req.params.logId as string;

    // Verify ownership
    const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(id, userId) as Habit | undefined;
    if (!habit) return fail(res, 404, 'Habit not found');

    const result = db.prepare('DELETE FROM habit_logs WHERE id = ? AND habit_id = ?').run(logId, id);
    if (result.changes === 0) return fail(res, 404, 'Log not found');

    ok(res, { deleted: true });
  } catch (error) {
    serverError(res, error);
  }
});

// GET /:id/calendar — monthly calendar data + extended stats
router.get('/:id/calendar', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const id = req.params.id as string;

    const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(id, userId) as Habit | undefined;
    if (!habit) return fail(res, 404, 'Habit not found');

    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const month = parseInt(req.query.month as string) || (new Date().getMonth() + 1);

    // Get all log dates for the requested month
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const daysInMonth = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const monthLogs = db.prepare(
      'SELECT DISTINCT log_date FROM habit_logs WHERE habit_id = ? AND log_date >= ? AND log_date <= ? ORDER BY log_date ASC'
    ).all(id, startDate, endDate) as { log_date: string }[];
    const loggedDates = monthLogs.map(l => l.log_date);

    // Extended stats
    const allLogs = db.prepare(
      'SELECT DISTINCT log_date FROM habit_logs WHERE habit_id = ? ORDER BY log_date ASC'
    ).all(id) as { log_date: string }[];
    const allDateSet = new Set(allLogs.map(d => d.log_date));

    const today = new Date().toISOString().split('T')[0];
    const todayDate = new Date(today + 'T12:00:00');

    // Current streak (reuse logic)
    let currentStreak = 0;
    const checkDate = new Date(today + 'T12:00:00');
    if (!allDateSet.has(today)) {
      checkDate.setDate(checkDate.getDate() - 1);
    }
    while (allDateSet.has(checkDate.toISOString().split('T')[0])) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    // Best streak
    const sortedDates = allLogs.map(d => d.log_date);
    let bestStreak = 0;
    let tempStreak = 0;
    for (let i = 0; i < sortedDates.length; i++) {
      if (i === 0) { tempStreak = 1; }
      else {
        const prev = new Date(sortedDates[i - 1] + 'T12:00:00');
        const curr = new Date(sortedDates[i] + 'T12:00:00');
        const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
        tempStreak = Math.round(diffDays) === 1 ? tempStreak + 1 : 1;
      }
      bestStreak = Math.max(bestStreak, tempStreak);
    }

    // This week (Mon–Sun)
    const dayOfWeek = todayDate.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(todayDate);
    monday.setDate(todayDate.getDate() + mondayOffset);
    const mondayStr = monday.toISOString().split('T')[0];
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const sundayStr = sunday.toISOString().split('T')[0];
    const thisWeek = allLogs.filter(d => d.log_date >= mondayStr && d.log_date <= sundayStr).length;

    // This month
    const thisMonthStart = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-01`;
    const thisMonthDays = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0).getDate();
    const thisMonthEnd = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(thisMonthDays).padStart(2, '0')}`;
    const thisMonth = allLogs.filter(d => d.log_date >= thisMonthStart && d.log_date <= thisMonthEnd).length;

    // Avg per week
    const totalEntries = allLogs.length;
    const trackingSince = habit.created_at.split('T')[0];
    const trackingStart = new Date(trackingSince + 'T12:00:00');
    const trackingDays = Math.max(1, Math.floor((todayDate.getTime() - trackingStart.getTime()) / (1000 * 60 * 60 * 24)));
    const trackingWeeks = Math.max(1, trackingDays / 7);
    const avgPerWeek = Math.round((totalEntries / trackingWeeks) * 10) / 10;

    // Completion rate (days logged / days since tracking started, up to today)
    const elapsedDaysSinceStart = Math.min(trackingDays, daysInMonth);
    const completionCount = loggedDates.length;
    // Use days elapsed in current month context for rate
    const daysElapsedInMonth = today >= endDate ? daysInMonth : (today >= startDate ? parseInt(today.split('-')[2]) : 0);
    const completionTotal = Math.max(1, daysElapsedInMonth);
    const completionRate = Math.round((completionCount / completionTotal) * 100);

    ok(res, {
      loggedDates,
      stats: {
        completionRate,
        completionCount,
        completionTotal,
        currentStreak,
        bestStreak,
        thisWeek,
        thisWeekTotal: 7,
        thisMonth,
        thisMonthTotal: thisMonthDays,
        avgPerWeek,
        totalEntries,
        trackingSince,
        trackingSinceDays: trackingDays,
      }
    });
  } catch (error) {
    serverError(res, error);
  }
});

// GET /by-subgoal/:subgoalId — get habits linked to a specific subgoal
router.get('/by-subgoal/:subgoalId', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const subgoalId = req.params.subgoalId as string;

    const habits = db.prepare(
      'SELECT * FROM habits WHERE user_id = ? AND subgoal_id = ? AND archived = 0 ORDER BY type ASC, position ASC'
    ).all(userId, subgoalId) as Habit[];

    const result = habits.map(h => {
      if (h.type === 'habit') {
        return { ...h, stats: computeHabitStats(h.id) };
      } else {
        return { ...h, stats: computeQuitStats(h.id, h.quit_date) };
      }
    });

    ok(res, result);
  } catch (error) {
    serverError(res, error);
  }
});

export default router;
