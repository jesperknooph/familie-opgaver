import { state } from "./state.js";
import { MEMBERS } from "./auth.js";

// Pure date/sort helpers live in their own dependency-light module so they can
// be unit-tested in Node; re-exported here so existing imports keep working.
export {
  ymd,
  startOfWeek,
  addDays,
  parseYmd,
  nextDueDate,
  nextInRotation,
  isoWeek,
  byTimeThenRecent,
} from "./date-utils.js";

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

