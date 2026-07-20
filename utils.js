import { state } from "./state.js";
import { MEMBERS } from "./auth.js";

export const DAY_NAMES = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"];
export const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

// A member's chosen look (kid mode "Vælg dit look") wins over the default.
export function colorFor(name) {
  return state.looks[name]?.color || MEMBERS.find((m) => m.name === name)?.color || "#8A8296";
}

export function faceFor(name) {
  return state.looks[name]?.face || name[0];
}

export function uid() {
  return Math.random().toString(36).slice(2, 9);
}

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

const UI_ICONS = {
  trash: `<path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  check: `<path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  circle: `<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none"/>`,
  chevL: `<path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  chevR: `<path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  plus: `<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`,
};

export function icon(name, color = "currentColor", size = 19) {
  const path = UI_ICONS[name] || "";
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="color:${color};flex-shrink:0;">${path}</svg>`;
}

export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
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

