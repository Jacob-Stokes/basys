// Natural language task parser — Vikunja-style
//
// TOKEN SYNTAX (stripped from title):
//   @<date/time expr>   → due_date (ISO datetime or date)
//   !<1-4>              → priority
//   #<name>             → project hint
//   ~<name>             → label hint
//
// DATE EXPRESSIONS supported after @:
//   Relative:      today, tomorrow, yesterday
//                  monday–sunday (next occurrence)
//                  next week, next month, next year
//                  in 3 days / in 2 weeks / in 1 month
//                  3d / 3days / 3 days
//                  3w / 3weeks / 3 weeks
//                  3m / 3months / 3 months
//                  3 days from now / 2 weeks from now
//                  end of week / end of month / end of year
//   Absolute:      Jan 5 / January 5 / 5 Jan / jan5
//                  3/15 or 15/3 (M/D US style)
//                  2026-03-15 (ISO)
//                  2026-03-15T14:30 (ISO with time)
//
// TIME EXPRESSIONS (follow the date, or standalone for "today at"):
//   3pm / 3 pm / 9am / 12pm / midnight / noon
//   9:30 / 9:30am / 9:30 pm / 14:00 / 14:30:00
//   at 3pm / at 9:30
//
// COMBINED EXAMPLES:
//   @tomorrow 3pm
//   @monday at 9:30am
//   @next week 14:00
//   @Jan 15 at noon
//   @in 3 days 8am
//   @end of month
//   @3pm  (means today at 3pm)
//   @9:30 (means today at 9:30)

export interface ParsedTask {
  title: string;
  due_date: string | null;   // ISO: YYYY-MM-DDTHH:MM:00 or YYYY-MM-DD
  priority: number | null;
  repeat_after: number | null;  // seconds
  repeat_mode: number;           // 0 = default
  projectHint: string | null;
  labelHints: string[];
}

// ── Helpers ────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toISODateTime(d: Date, h: number, m: number): string {
  return `${toISODate(d)}T${pad(h)}:${pad(m)}:00`;
}

// ── Time parsing ───────────────────────────────────────────────────

// Returns [hours, minutes] or null
// Handles: 3pm, 9am, 12pm, midnight, noon, 9:30, 9:30am, 14:00, 14:30:00, 9:30 pm
function parseTime(raw: string): [number, number] | null {
  const t = raw.toLowerCase().trim().replace(/\s+/g, '');

  if (t === 'midnight') return [0, 0];
  if (t === 'noon') return [12, 0];

  // HH:MM[:SS][am/pm]
  const hhmm = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?(am|pm)?$/);
  if (hhmm) {
    let h = parseInt(hhmm[1]);
    const m = parseInt(hhmm[2]);
    const ap = hhmm[3];
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h >= 0 && h < 24 && m >= 0 && m < 60) return [h, m];
  }

  // H[am/pm] — e.g. 3pm, 9am
  const hap = t.match(/^(\d{1,2})(am|pm)$/);
  if (hap) {
    let h = parseInt(hap[1]);
    if (hap[2] === 'pm' && h < 12) h += 12;
    if (hap[2] === 'am' && h === 12) h = 0;
    if (h >= 0 && h < 24) return [h, 0];
  }

  return null;
}

// Tries to parse a time from 1–2 consecutive words (handles "9:30 pm", "at 3pm", "at 9:30 am")
// Returns [hours, minutes, wordsConsumed] or null
function parseTimeWords(words: string[], startIdx: number): [number, number, number] | null {
  if (startIdx >= words.length) return null;

  let idx = startIdx;
  // skip leading "at"
  if (words[idx]?.toLowerCase() === 'at') idx++;
  if (idx >= words.length) return null;

  // try two words joined (e.g. "9:30 pm")
  if (idx + 1 < words.length) {
    const twoWord = words[idx] + words[idx + 1].toLowerCase();
    const t = parseTime(twoWord);
    if (t) return [t[0], t[1], idx - startIdx + 2];
  }

  // try single word
  const t = parseTime(words[idx]);
  if (t) return [t[0], t[1], idx - startIdx + 1];

  return null;
}

// ── Date parsing ───────────────────────────────────────────────────

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const DAY_ABBR  = ['sun','mon','tue','wed','thu','fri','sat'];
const MONTH_NAMES = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const MONTH_ABBR  = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

function monthIndex(s: string): number {
  const sl = s.toLowerCase();
  const full = MONTH_NAMES.findIndex(m => m.startsWith(sl) || sl.startsWith(m.slice(0,3)));
  if (full !== -1) return full;
  return MONTH_ABBR.findIndex(m => sl.startsWith(m));
}

// Returns a Date at midnight, or null.
// Accepts a phrase of 1–4 words.
function parseDatePhrase(phrase: string): Date | null {
  const t = phrase.toLowerCase().trim();
  const today = startOfDay(new Date());

  // ── Single keywords ──
  if (t === 'today') return new Date(today);
  if (t === 'tomorrow' || t === 'tmr' || t === 'tmrw') { const d = new Date(today); d.setDate(d.getDate() + 1); return d; }
  if (t === 'yesterday') { const d = new Date(today); d.setDate(d.getDate() - 1); return d; }
  if (t === 'eow' || t === 'end of week') {
    const d = new Date(today);
    d.setDate(d.getDate() + (5 - d.getDay() + 7) % 7 || 7); // next Friday
    return d;
  }
  if (t === 'eom' || t === 'end of month') {
    return new Date(today.getFullYear(), today.getMonth() + 1, 0);
  }
  if (t === 'eoy' || t === 'end of year') {
    return new Date(today.getFullYear(), 11, 31);
  }

  // ── Day names (full or abbrev) ──
  const dayFull = DAY_NAMES.indexOf(t);
  if (dayFull !== -1) {
    const d = new Date(today);
    const diff = (dayFull - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return d;
  }
  const dayAbbr = DAY_ABBR.indexOf(t);
  if (dayAbbr !== -1) {
    const d = new Date(today);
    const diff = (dayAbbr - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return d;
  }

  // ── "next X" ──
  const nextMatch = t.match(/^next\s+(week|month|year|mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  if (nextMatch) {
    const what = nextMatch[1];
    const d = new Date(today);
    if (what === 'week') { d.setDate(d.getDate() + 7); return d; }
    if (what === 'month') { d.setMonth(d.getMonth() + 1); return d; }
    if (what === 'year') { d.setFullYear(d.getFullYear() + 1); return d; }
    const dayI = DAY_NAMES.indexOf(what) !== -1 ? DAY_NAMES.indexOf(what) : DAY_ABBR.indexOf(what);
    if (dayI !== -1) {
      const diff = (dayI - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      return d;
    }
  }

  // ── "this X" (same as next occurrence) ──
  const thisMatch = t.match(/^this\s+(week|month|mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  if (thisMatch) {
    const what = thisMatch[1];
    const d = new Date(today);
    if (what === 'week') { d.setDate(d.getDate() + 7); return d; }
    if (what === 'month') { d.setMonth(d.getMonth() + 1); return d; }
    const dayI = DAY_NAMES.indexOf(what) !== -1 ? DAY_NAMES.indexOf(what) : DAY_ABBR.indexOf(what);
    if (dayI !== -1) {
      const diff = (dayI - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      return d;
    }
  }

  // ── "in N days/weeks/months" ──
  const inRel = t.match(/^in\s+(\d+)\s*(d(?:ays?)?|w(?:eeks?)?|m(?:onths?)?)$/);
  if (inRel) {
    const n = parseInt(inRel[1]);
    const unit = inRel[2][0];
    const d = new Date(today);
    if (unit === 'd') d.setDate(d.getDate() + n);
    else if (unit === 'w') d.setDate(d.getDate() + n * 7);
    else if (unit === 'm') d.setMonth(d.getMonth() + n);
    return d;
  }

  // ── "N days/weeks/months from now" ──
  const fromNow = t.match(/^(\d+)\s*(d(?:ays?)?|w(?:eeks?)?|m(?:onths?)?)\s+from\s+now$/);
  if (fromNow) {
    const n = parseInt(fromNow[1]);
    const unit = fromNow[2][0];
    const d = new Date(today);
    if (unit === 'd') d.setDate(d.getDate() + n);
    else if (unit === 'w') d.setDate(d.getDate() + n * 7);
    else if (unit === 'm') d.setMonth(d.getMonth() + n);
    return d;
  }

  // ── Bare relative: 3d, 3days, 3w, 3weeks, 3m ──
  const bareRel = t.match(/^(\d+)\s*(d(?:ays?)?|w(?:eeks?)?|m(?:onths?)?)$/);
  if (bareRel) {
    const n = parseInt(bareRel[1]);
    const unit = bareRel[2][0];
    const d = new Date(today);
    if (unit === 'd') d.setDate(d.getDate() + n);
    else if (unit === 'w') d.setDate(d.getDate() + n * 7);
    else if (unit === 'm') d.setMonth(d.getMonth() + n);
    return d;
  }

  // ── ISO: 2026-03-15 ──
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const d = new Date(t + 'T00:00:00');
    if (!isNaN(d.getTime())) return startOfDay(d);
  }

  // ── ISO datetime: 2026-03-15T14:30 ──
  if (/^\d{4}-\d{2}-\d{2}t\d{2}:\d{2}/.test(t)) {
    const d = new Date(phrase); // keep original casing for T
    if (!isNaN(d.getTime())) return d; // return as-is (has time embedded)
  }

  // ── MonthName Day: Jan 5, January 5, Jan5, 5 Jan, 5 January ──
  const mdn1 = t.match(/^([a-z]+)\s*(\d{1,2})(?:st|nd|rd|th)?$/);   // Jan5, Jan 5, January 5th
  const mdn2 = t.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)$/);   // 5 Jan, 5th January
  const md = mdn1 || mdn2;
  if (md) {
    const [, a, b] = md;
    let mStr: string, dayNum: number;
    if (/^\d+$/.test(a)) { dayNum = parseInt(a); mStr = b; }
    else { mStr = a; dayNum = parseInt(b); }
    const mIdx = monthIndex(mStr);
    if (mIdx !== -1 && dayNum >= 1 && dayNum <= 31) {
      const year = today.getFullYear();
      const d = new Date(year, mIdx, dayNum);
      if (d < today) d.setFullYear(year + 1);
      return d;
    }
  }

  // ── MonthName Day Year: Jan 5 2027, January 5 2027 ──
  const mdyr = t.match(/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})$/) ||
               t.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s+(\d{4})$/);
  if (mdyr) {
    const [, a, b, c] = mdyr;
    let mStr: string, dayNum: number, year: number;
    if (/^\d{4}$/.test(c)) {
      year = parseInt(c);
      if (/^\d+$/.test(a)) { dayNum = parseInt(a); mStr = b; }
      else { mStr = a; dayNum = parseInt(b); }
    } else {
      year = parseInt(b); mStr = a; dayNum = parseInt(c);
    }
    const mIdx = monthIndex(mStr);
    if (mIdx !== -1 && dayNum >= 1 && dayNum <= 31 && year >= 2020) {
      return new Date(year, mIdx, dayNum);
    }
  }

  // ── M/D (US) or D/M — try M/D first ──
  const slash = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slash) {
    const year = slash[3] ? (parseInt(slash[3]) < 100 ? 2000 + parseInt(slash[3]) : parseInt(slash[3])) : today.getFullYear();
    const month = parseInt(slash[1]) - 1;
    const day = parseInt(slash[2]);
    if (month >= 0 && month < 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month, day);
      if (!slash[3] && d < today) d.setFullYear(year + 1);
      return d;
    }
  }

  return null;
}

// ── Full @token parser: date phrase + optional time ────────────────
// raw = everything after @, may be many words
// Returns ISO string or null

function parseDateTimeRaw(raw: string): { result: string; wordsConsumed: number } | null {
  const words = raw.trim().split(/\s+/);

  // Special case: @<time-only> means "today at <time>"
  // Try single word and "H:MM am/pm" (2 words) as pure time first
  const timeOnly2 = parseTimeWords(words, 0);
  if (timeOnly2) {
    const today = startOfDay(new Date());
    return {
      result: toISODateTime(today, timeOnly2[0], timeOnly2[1]),
      wordsConsumed: timeOnly2[2],
    };
  }

  // Try date phrases from longest (up to 4 words) down to 1, then look for trailing time
  for (let dateLen = Math.min(words.length, 4); dateLen >= 1; dateLen--) {
    const datePhrase = words.slice(0, dateLen).join(' ');
    const dateObj = parseDatePhrase(datePhrase);
    if (!dateObj) continue;

    // ISO datetime embedded (e.g. "2026-03-15T14:30") — detect the ISO "T" separator
    if (/\d{4}-\d{2}-\d{2}T/i.test(datePhrase)) {
      return { result: toISODate(dateObj) + 'T' + pad(dateObj.getHours()) + ':' + pad(dateObj.getMinutes()) + ':00', wordsConsumed: dateLen };
    }

    // Look for trailing time (skip "at" connector)
    const timeResult = parseTimeWords(words, dateLen);
    if (timeResult) {
      return {
        result: toISODateTime(dateObj, timeResult[0], timeResult[1]),
        wordsConsumed: dateLen + timeResult[2],
      };
    }

    // Date only
    return { result: toISODate(dateObj), wordsConsumed: dateLen };
  }

  return null;
}

// ── Main parser ────────────────────────────────────────────────────

// ── Repeat parsing ─────────────────────────────────────────────────
// "every day" → 86400s, "every 3 days" → 259200s, etc.
export function parseRepeat(phrase: string): { repeat_after: number; repeat_mode: number } | null {
  const t = phrase.toLowerCase().trim();
  // "every N unit" or "every unit"
  const m = t.match(/^every\s+(?:(\d+)\s+)?(day|days|week|weeks|month|months|year|years|hour|hours)$/);
  if (!m) return null;
  const n = m[1] ? parseInt(m[1]) : 1;
  const unit = m[2].replace(/s$/, ''); // normalise to singular
  const secs: Record<string, number> = {
    hour: 3600, day: 86400, week: 604800,
    month: 2592000,  // 30 days
    year: 31536000,  // 365 days
  };
  if (!(unit in secs)) return null;
  return { repeat_after: n * secs[unit], repeat_mode: 0 };
}

export function parseTaskInput(input: string): ParsedTask {
  let title = input;
  let due_date: string | null = null;
  let priority: number | null = null;
  let repeat_after: number | null = null;
  let repeat_mode = 0;
  let projectHint: string | null = null;
  const labelHints: string[] = [];

  // Priority: !1 !2 !3 !4
  title = title.replace(/(?:^|\s)!([1-4])(?=\s|$)/g, (_, n) => {
    priority = parseInt(n);
    return ' ';
  });

  // Priority words: !urgent !high !medium !low
  title = title.replace(/(?:^|\s)!(urgent|high|medium|low)(?=\s|$)/gi, (_, w) => {
    const map: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
    priority = map[w.toLowerCase()];
    return ' ';
  });

  // Project: #word or #"multi word"
  title = title.replace(/(?:^|\s)#"([^"]+)"/g, (_, name) => { projectHint = name.trim(); return ' '; });
  title = title.replace(/(?:^|\s)#(\S+)/g, (_, name) => { projectHint = name.trim(); return ' '; });

  // Label: ~word or ~"multi word"
  title = title.replace(/(?:^|\s)~"([^"]+)"/g, (_, name) => { labelHints.push(name.trim()); return ' '; });
  title = title.replace(/(?:^|\s)~(\S+)/g, (_, name) => { labelHints.push(name.trim()); return ' '; });

  // Due date+time: @<expr>
  // parseDateTimeRaw handles the full phrase (date + optional time) and returns wordsConsumed
  title = title.replace(/@([^\s@!#~]+(?:\s+[^\s@!#~]+){0,6})/g, (match, raw) => {
    if (due_date) return match;
    const parsed = parseDateTimeRaw(raw.trim());
    if (parsed) {
      due_date = parsed.result;
      const words = raw.trim().split(/\s+/);
      const remainder = words.slice(parsed.wordsConsumed).join(' ');
      return remainder ? ' ' + remainder : ' ';
    }
    return match; // unrecognised — leave in title
  });

  // Repeat: "every day", "every 3 weeks", etc. (up to 3 words)
  title = title.replace(/\bevery\s+(?:\d+\s+)?(?:day|days|week|weeks|month|months|year|years|hour|hours)\b/gi, match => {
    const r = parseRepeat(match.trim());
    if (r) { repeat_after = r.repeat_after; repeat_mode = r.repeat_mode; return ' '; }
    return match;
  });

  return {
    title: title.replace(/\s{2,}/g, ' ').trim(),
    due_date,
    priority,
    repeat_after,
    repeat_mode,
    projectHint,
    labelHints,
  };
}

// ── Display helpers ────────────────────────────────────────────────

const PRIORITY_LABELS: Record<number, string> = { 1: 'low', 2: 'medium', 3: 'high', 4: 'urgent' };

export function formatParsedPreview(parsed: ParsedTask): string[] {
  const parts: string[] = [];
  if (parsed.due_date) {
    const hasTime = parsed.due_date.includes('T');
    const d = new Date(hasTime ? parsed.due_date : parsed.due_date + 'T00:00:00');
    const dateStr = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const timeStr = hasTime ? ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
    parts.push('due ' + dateStr + timeStr);
  }
  if (parsed.priority !== null) parts.push('!' + PRIORITY_LABELS[parsed.priority]);
  if (parsed.repeat_after) {
    const secs = parsed.repeat_after;
    let repeatStr = '';
    if (secs % 31536000 === 0) repeatStr = `every ${secs / 31536000 === 1 ? '' : secs / 31536000 + ' '}year`.trim();
    else if (secs % 2592000 === 0) repeatStr = `every ${secs / 2592000 === 1 ? '' : secs / 2592000 + ' '}month`.trim();
    else if (secs % 604800 === 0) repeatStr = `every ${secs / 604800 === 1 ? '' : secs / 604800 + ' '}week`.trim();
    else if (secs % 86400 === 0) repeatStr = `every ${secs / 86400 === 1 ? '' : secs / 86400 + ' '}day`.trim();
    else if (secs % 3600 === 0) repeatStr = `every ${secs / 3600 === 1 ? '' : secs / 3600 + ' '}hour`.trim();
    if (repeatStr) parts.push('↻ ' + repeatStr);
  }
  if (parsed.projectHint) parts.push('#' + parsed.projectHint);
  parsed.labelHints.forEach(l => parts.push('~' + l));
  return parts;
}
