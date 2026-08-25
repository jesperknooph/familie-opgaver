/* --- Keyboard navigation (desktop) ---

   Three separate jobs live here, in the order they matter:

   1. keepFocus() — every render rewrites whole regions with innerHTML, which
      drops focus on the floor: tick a task off with the keyboard and you land
      back on <body>, at the top of the page. This remembers which control had
      focus, and after the render puts it back on the same one — or, when that
      control is gone (you deleted its task), on whatever took its place.

   2. roving() / taskGrid() — a group of buttons becomes ONE tab stop with the
      arrow keys moving inside it. Without this the template gallery alone costs
      28 tab presses to walk past. This is the standard toolbar/grid pattern:
      only the current item has tabindex="0", the rest are -1.

   3. setShortcuts() — one document-level keydown dispatcher, plus the "?" cheat
      sheet that lists whatever is registered, so the shortcuts stay
      discoverable instead of being folklore.

   Nothing here knows what a task is; the app's own modules register the
   behaviour. */

import { openSheet } from "./ui-common.js";

/* ---------------------------------------------------------------- 1. Focus */

// The attributes that identify a control across a re-render, most specific
// first. They already exist in the markup as click hooks, so nothing extra
// has to be threaded through the render functions.
const KEY_ATTRS = [
  "data-toggle",
  "data-edit",
  "data-delete",
  "data-kidtoggle",
  "data-filter",
  "data-view",
  "data-kidview",
  "data-week",
  "data-emoji",
  "data-face",
  "data-color",
  "data-when",
  "data-template",
  "data-digit",
  "data-pick",
  "data-undo",
  "data-reset",
  "data-repeat",
  "data-assign",
  "data-pay",
  "data-paycancel",
  "data-payconfirm",
  "data-histmore",
  "data-earnmore",
];

function focusMemo(el) {
  for (const attr of KEY_ATTRS) {
    const value = el.getAttribute(attr);
    if (value !== null) {
      const all = [...document.querySelectorAll(`[${attr}]`)];
      return { el, attr, value, index: all.indexOf(el) };
    }
  }
  if (el.id) return { el, id: el.id };
  return null;
}

function findAgain(memo) {
  if (memo.id) return document.getElementById(memo.id);
  const all = [...document.querySelectorAll(`[${memo.attr}]`)];
  const exact = all.find((el) => el.getAttribute(memo.attr) === memo.value);
  if (exact) return exact;
  // The control itself is gone — a deleted task, a filtered-out row. Land on
  // whatever sits in that spot now so the next Enter still does something
  // sensible, and on the last row when the list got shorter.
  if (!all.length) return null;
  return all[Math.min(memo.index, all.length - 1)];
}

// Run a render with focus preserved across it.
export function keepFocus(render) {
  const active = document.activeElement;
  const memo = active && active !== document.body ? focusMemo(active) : null;

  render();

  if (!memo) return;
  if (memo.el.isConnected) return; // this region wasn't rebuilt — leave it alone
  findAgain(memo)?.focus({ preventScroll: true });
}

/* -------------------------------------------------------- 2. Roving groups */

// Which item in each group is the current one. Keyed by the container element,
// which outlives the innerHTML swaps that replace its children.
const rovingPos = new WeakMap();

function rovingItems(container) {
  return [...container.querySelectorAll(container.dataset.rovingSel)].filter(
    (el) => !el.disabled && el.getClientRects().length > 0
  );
}

function setRovingIndex(container, items, index) {
  rovingPos.set(container, index);
  items.forEach((el, i) => {
    el.tabIndex = i === index ? 0 : -1;
  });
}

// How many items fit on one visual row — for wrapped grids (emoji pickers, the
// template gallery) so ArrowDown steps a row rather than a single chip.
function perRow(items) {
  const top = items[0].offsetTop;
  const n = items.findIndex((el) => el.offsetTop > top);
  return n === -1 ? items.length : n;
}

function onRovingKey(e) {
  const container = e.currentTarget;
  const items = rovingItems(container);
  const current = items.indexOf(e.target.closest(container.dataset.rovingSel));
  if (current === -1 || !items.length) return;

  const grid = container.dataset.rovingGrid === "1";
  const step = grid ? perRow(items) : 0;
  let next = null;

  switch (e.key) {
    case "ArrowRight":
      next = (current + 1) % items.length;
      break;
    case "ArrowLeft":
      next = (current - 1 + items.length) % items.length;
      break;
    case "ArrowDown":
      if (grid) next = Math.min(current + step, items.length - 1);
      break;
    case "ArrowUp":
      if (grid) next = Math.max(current - step, 0);
      break;
    case "Home":
      next = 0;
      break;
    case "End":
      next = items.length - 1;
      break;
  }
  if (next === null) return;

  e.preventDefault();
  setRovingIndex(container, items, next);
  items[next].focus();
}

function onRovingFocus(e) {
  const container = e.currentTarget;
  const items = rovingItems(container);
  const i = items.indexOf(e.target.closest(container.dataset.rovingSel));
  if (i !== -1) setRovingIndex(container, items, i);
}

/* Make `container` a single tab stop whose `selector` children are reached with
   the arrow keys. Safe to call on every render: the listeners are bound once
   (they survive innerHTML swaps because they sit on the container), only the
   tabindexes are recomputed.

   grid: true also wires ArrowUp/ArrowDown for groups that wrap onto several
   lines. Left off, the vertical arrows keep scrolling the page. */
export function roving(container, selector, { grid = false } = {}) {
  if (!container) return;
  container.dataset.roving = "1";
  container.dataset.rovingSel = selector;
  container.dataset.rovingGrid = grid ? "1" : "0";

  if (container.dataset.rovingBound !== "1") {
    container.dataset.rovingBound = "1";
    container.addEventListener("keydown", onRovingKey);
    container.addEventListener("focusin", onRovingFocus);
  }

  const items = rovingItems(container);
  if (!items.length) return;

  // Prefer the item the user was last on; fall back to the selected one, so
  // tabbing into a fresh group lands on "I dag" rather than always the first.
  let index = rovingPos.get(container) ?? -1;
  if (index < 0 || index >= items.length) {
    const active = items.findIndex(
      (el) => el.classList.contains("active") || el.getAttribute("aria-pressed") === "true"
    );
    index = active === -1 ? 0 : active;
  }
  setRovingIndex(container, items, index);
}

/* --- The task list ---
   A two-dimensional version of the same idea: up/down moves between tasks,
   left/right between a task's three controls (tick, the task itself, delete).
   The whole list is one tab stop. On top of that the row-level keys — x to
   tick off, Delete to remove — mean the common actions never need the arrows
   at all. */
const TASK_CELLS = ".check-button, .task-body, .delete-button";

export function taskGrid(container) {
  if (!container) return;
  container.dataset.roving = "1";

  if (container.dataset.taskGridBound !== "1") {
    container.dataset.taskGridBound = "1";
    container.addEventListener("keydown", onTaskGridKey);
    container.addEventListener("focusin", (e) => {
      const cell = e.target.closest(TASK_CELLS);
      if (cell) markTaskCell(container, cell);
    });
  }

  const rows = [...container.querySelectorAll(".task-row")];
  if (!rows.length) return;

  const remembered = rovingPos.get(container) ?? 0;
  const index = Math.min(remembered, rows.length - 1);
  rows.forEach((row, i) => {
    row.querySelectorAll(TASK_CELLS).forEach((cell) => {
      cell.tabIndex = -1;
    });
    if (i === index) {
      // The label is the row's tab stop: Enter opens the task, and the tick and
      // delete buttons are a single arrow key away.
      const body = row.querySelector(".task-body");
      if (body) body.tabIndex = 0;
    }
  });
  rovingPos.set(container, index);
}

function markTaskCell(container, cell) {
  const rows = [...container.querySelectorAll(".task-row")];
  const row = cell.closest(".task-row");
  const i = rows.indexOf(row);
  if (i === -1) return;
  rovingPos.set(container, i);
  rows.forEach((r) =>
    r.querySelectorAll(TASK_CELLS).forEach((c) => {
      c.tabIndex = -1;
    })
  );
  cell.tabIndex = 0;
}

function onTaskGridKey(e) {
  const container = e.currentTarget;
  const cell = e.target.closest(TASK_CELLS);
  if (!cell) return;

  const row = cell.closest(".task-row");
  const rows = [...container.querySelectorAll(".task-row")];
  const rowIndex = rows.indexOf(row);
  const cells = [...row.querySelectorAll(TASK_CELLS)];
  const cellIndex = cells.indexOf(cell);

  const go = (targetRow, wantedCell = cellIndex) => {
    if (!targetRow) return;
    const targetCells = [...targetRow.querySelectorAll(TASK_CELLS)];
    const target = targetCells[Math.min(wantedCell, targetCells.length - 1)];
    if (!target) return;
    e.preventDefault();
    markTaskCell(container, target);
    target.focus();
  };

  switch (e.key) {
    case "ArrowDown":
    case "j":
      go(rows[rowIndex + 1]);
      return;
    case "ArrowUp":
    case "k":
      go(rows[rowIndex - 1]);
      return;
    case "ArrowRight":
      if (cellIndex < cells.length - 1) go(row, cellIndex + 1);
      return;
    case "ArrowLeft":
      if (cellIndex > 0) go(row, cellIndex - 1);
      return;
    case "Home":
      go(rows[0]);
      return;
    case "End":
      go(rows[rows.length - 1]);
      return;
    case "x":
    case "X": {
      const check = row.querySelector(".check-button");
      if (check) {
        e.preventDefault();
        check.click();
      }
      return;
    }
    case "Delete":
    case "Backspace": {
      const del = row.querySelector(".delete-button");
      if (del) {
        e.preventDefault();
        del.click();
      }
      return;
    }
  }
}

/* ------------------------------------------------------------ 3. Shortcuts */

let shortcuts = [];
let listening = false;

// Registered per mode (parent / kid), because the two share almost no actions.
// Each entry: { keys: ["n"], label, group, run }.
export function setShortcuts(list) {
  shortcuts = list;
  if (!listening) {
    listening = true;
    document.addEventListener("keydown", onShortcutKey);
  }
}

function isTyping(el) {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable === true
  );
}

function onShortcutKey(e) {
  // Browser and OS shortcuts stay the browser's and the OS's.
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (isTyping(e.target)) return;
  // A sheet owns the keyboard while it's up: Escape closes it (ui-common), Tab
  // is trapped inside it, and "n" there is just the letter n.
  if (document.body.classList.contains("sheet-open")) return;

  const inGroup = !!e.target.closest?.("[data-roving]");
  const hit = shortcuts.find((s) => {
    if (!s.run) return false; // documentation-only row (taskGrid owns the key)
    if (!s.keys.includes(e.key)) return false;
    // Arrow keys belong to whatever group has focus before they're a shortcut.
    if (inGroup && e.key.startsWith("Arrow")) return false;
    return s.when ? s.when() : true;
  });
  if (!hit) return;

  e.preventDefault();
  hit.run();
}

/* --- The ? cheat sheet ---
   Built from the registry, so a shortcut can never quietly go undocumented. */
export function openShortcutSheet() {
  const { mount } = openSheet("shortcutSheet");

  const groups = [];
  shortcuts
    .filter((s) => !s.hidden)
    .forEach((s) => {
      const name = s.group || "Andet";
      let g = groups.find((x) => x.name === name);
      if (!g) groups.push((g = { name, rows: [] }));
      g.rows.push(s);
    });

  const keyHtml = (s) =>
    (s.showKeys || s.keys)
      .map((k) => `<kbd class="kbd">${KEY_NAMES[k] || k}</kbd>`)
      .join('<span class="kbd-sep">/</span>');

  mount(`
    <div class="modal-card shortcut-card">
      <div class="modal-head">
        <h2 class="modal-title">⌨️ Tastaturgenveje</h2>
        <button class="modal-close" data-close="1" aria-label="Luk">✕</button>
      </div>
      <div class="shortcut-body">
        ${groups
          .map(
            (g) => `
          <div class="shortcut-group">
            <div class="shortcut-group-name">${g.name}</div>
            ${g.rows
              .map(
                (s) => `
              <div class="shortcut-row">
                <span class="shortcut-keys">${keyHtml(s)}</span>
                <span class="shortcut-label">${s.label}</span>
              </div>`
              )
              .join("")}
          </div>`
          )
          .join("")}
      </div>
      <p class="shortcut-foot">Tab flytter mellem grupper · piletasterne flytter inde i en gruppe</p>
    </div>
  `);
}

const KEY_NAMES = {
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Escape: "Esc",
  Delete: "Del",
  Backspace: "⌫",
  " ": "Mellemrum",
};

// The one-line nudge under the list. Pointer-based devices get no benefit from
// knowing about "?", so it only shows where there's a real keyboard.
export function hasKeyboard() {
  return window.matchMedia("(pointer: fine)").matches;
}
