// Pure date and sorting helpers. Deliberately dependency-free (only `state`
// for the repeat-interval table) so this module can be unit-tested in plain
// Node without pulling in Firebase. See test/date-utils.test.js.
import { state } from "./state.js";

// --- Date helpers (all in local time) ---
export function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfWeek(base) {
  const d = new Date(base);
  const mondayIndex = (d.getDay() + 6) % 7; // Mandag = 0
  d.setDate(d.getDate() - mondayIndex);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function parseYmd(s) {
  const [y, m, d] = s.split("-").map(Number);
  const r = new Date(y, m - 1, d);
  r.setHours(0, 0, 0, 0);
  return r;
}

// Next occurrence for a recurring task: step forward from its due date, skipping
// past any dates already gone (so a long-untouched task lands on a future date).
export function nextDueDate(due, repeat) {
  const step = state.REPEAT_DAYS[repeat];
  if (!step) return due;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let d = due ? parseYmd(due) : today;
  do {
    d = addDays(d, step);
  } while (d < today);
  return ymd(d);
}

// Rotating chore: whoever comes after the current assignee in the rotation list.
export function nextInRotation(t) {
  if (!t.rotation || t.rotation.length < 2) return t.assignedTo;
  const i = t.rotation.indexOf(t.assignedTo);
  return t.rotation[(i + 1) % t.rotation.length];
}

export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = d.getTime();
  d.setUTCMonth(0, 1);
  if (d.getUTCDay() !== 4) {
    d.setUTCMonth(0, 1 + ((4 - d.getUTCDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - d.getTime()) / 604800000);
}

// Within a single day: open tasks first, then by clock time (timed before
// untimed), then most-recently-added.
export function byTimeThenRecent(a, b) {
  if (Number(a.done) !== Number(b.done)) return Number(a.done) - Number(b.done);
  if (a.time && b.time && a.time !== b.time) return a.time < b.time ? -1 : 1;
  if (a.time && !b.time) return -1;
  if (!a.time && b.time) return 1;
  return (b.ts || 0) - (a.ts || 0);
}
