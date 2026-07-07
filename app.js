import { db, authReady } from "./firebase-config.js";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  onSnapshot,
  query,
  orderBy,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { MEMBERS, ensureAuth, signOut, isAdmin, resetPin } from "./auth.js";
import { TASK_TEMPLATES } from "./templates.js";

const DAY_NAMES = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"];
const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

const tasksCol = collection(db, "tasks");
const completionsCol = collection(db, "completions");
const membersCol = collection(db, "members");

let tasks = [];
let completions = []; // this week's completion log (drives the points tally)
let unsubCompletions = null;
let filter = "alle";
let currentUser = null;
let looks = {}; // per-member custom look from Firestore: name -> { face, color }
let kidView = "idag"; // kid mode: "idag" | "uge"
let kidAnimate = true; // entrance animations on first paint & tab switch only

// Pending reminder timers, keyed by task id, so we can cancel/reschedule cleanly.
const reminderTimers = new Map();

// Recurrence options shown in the add sheet, plus the step (in days) each implies.
const REPEAT_OPTIONS = [
  { id: null, label: "Aldrig" },
  { id: "daily", label: "Dagligt" },
  { id: "2day", label: "Hver 2. dag" },
  { id: "weekly", label: "Ugentligt" },
  { id: "2week", label: "Hver 2. uge" },
];
const REPEAT_DAYS = { daily: 1, "2day": 2, weekly: 7, "2week": 14 };
const REPEAT_LABELS = { daily: "Dagligt", "2day": "Hver 2. dag", weekly: "Ugentligt", "2week": "Hver 2. uge" };
const POINTS_OPTIONS = [null, 1, 2, 3, 5];
let view = "idag"; // "idag" | "liste" | "uge"
let weekOffset = 0; // 0 = denne uge
let connected = false;

const app = document.getElementById("app");

// A member's chosen look (kid mode "Vælg dit look") wins over the default.
function colorFor(name) {
  return looks[name]?.color || MEMBERS.find((m) => m.name === name)?.color || "#8A8296";
}
function faceFor(name) {
  return looks[name]?.face || name[0];
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// --- Date helpers (all in local time) ---
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function startOfWeek(base) {
  const d = new Date(base);
  const mondayIndex = (d.getDay() + 6) % 7; // Mandag = 0
  d.setDate(d.getDate() - mondayIndex);
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function parseYmd(s) {
  const [y, m, d] = s.split("-").map(Number);
  const r = new Date(y, m - 1, d);
  r.setHours(0, 0, 0, 0);
  return r;
}
// Next occurrence for a recurring task: step forward from its due date, skipping
// past any dates already gone (so a long-untouched task lands on a future date).
function nextDueDate(due, repeat) {
  const step = REPEAT_DAYS[repeat];
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
function nextInRotation(t) {
  if (!t.rotation || t.rotation.length < 2) return t.assignedTo;
  const i = t.rotation.indexOf(t.assignedTo);
  return t.rotation[(i + 1) % t.rotation.length];
}

// --- Completion log (drives the weekly points tally) ---
// One doc per task per day, id `taskId:date`, so re-completing the same day
// overwrites instead of double-counting, and un-checking can delete it exactly.
// Failures are non-fatal: if the rules for `completions` aren't published yet,
// tasks still complete — only the points go unrecorded.
async function logCompletion(t) {
  const today = ymd(new Date());
  try {
    await setDoc(doc(completionsCol, `${t.id}:${today}`), {
      name: t.assignedTo,
      date: today,
      label: t.label,
      emoji: t.emoji || null,
      points: t.points || 0,
      money: t.money || 0,
      ts: Date.now(),
    });
  } catch (e) {
    console.warn("Could not log completion (are the new rules published?):", e);
  }
}
async function removeCompletion(t) {
  const today = ymd(new Date());
  try {
    await deleteDoc(doc(completionsCol, `${t.id}:${today}`));
  } catch (e) {
    console.warn("Could not remove completion:", e);
  }
}

// Live tally of this week's completions. Re-subscribed at midnight so the
// week window rolls over on Monday.
function subscribeCompletions() {
  if (unsubCompletions) unsubCompletions();
  const weekStart = ymd(startOfWeek(new Date()));
  const cq = query(completionsCol, where("date", ">=", weekStart));
  unsubCompletions = onSnapshot(
    cq,
    (snap) => {
      completions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      render();
    },
    (err) => console.warn("Completions sync error (are the new rules published?):", err)
  );
}
function isoWeek(date) {
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

// Fire a local notification for a task — via the service worker when possible
// (more reliable on mobile), falling back to a page Notification.
function fireReminder(t) {
  const title = `🔔 ${t.emoji ? t.emoji + " " : ""}${t.label}`;
  const opts = {
    body: `Kl. ${t.time} · ${t.assignedTo}`,
    icon: "icons/icon-192.png?v=2",
    badge: "icons/icon-192.png?v=2",
    tag: `task-${t.id}`,
  };
  if (navigator.serviceWorker && navigator.serviceWorker.ready) {
    navigator.serviceWorker.ready
      .then((reg) => reg.showNotification(title, opts))
      .catch(() => { try { new Notification(title, opts); } catch (e) {} });
  } else {
    try { new Notification(title, opts); } catch (e) {}
  }
}

// (Re)schedule timers for every alarmed task that is due today, has a time still
// ahead of now, and isn't done. Cancels stale timers first. In-app only: these
// fire while the app/PWA is alive — a phone that has fully closed it may miss them.
function scheduleReminders() {
  reminderTimers.forEach((id) => clearTimeout(id));
  reminderTimers.clear();
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const now = new Date();
  const todayStr = ymd(now);
  tasks.forEach((t) => {
    if (!t.alarm || t.done || !t.time || t.due !== todayStr) return;
    // Kids' devices only ring for their own tasks.
    if (currentUser && !isAdmin(currentUser) && t.assignedTo !== currentUser.name) return;
    const [h, m] = t.time.split(":").map(Number);
    const fireAt = new Date();
    fireAt.setHours(h, m, 0, 0);
    const delay = fireAt.getTime() - now.getTime();
    if (delay <= 0 || delay > 86_400_000) return; // already passed, or absurdly far
    reminderTimers.set(t.id, setTimeout(() => fireReminder(t), delay));
  });
}

// A device left open overnight (the kitchen iPad) must roll over at midnight:
// re-schedule the new day's alarms and re-render so "I dag" shows the right day.
function scheduleMidnightRefresh() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 5, 0); // 00:00:05 tonight
  setTimeout(() => {
    scheduleReminders();
    subscribeCompletions(); // Monday: the points week window rolls over
    updateWithTransition();
    scheduleMidnightRefresh();
  }, next.getTime() - now.getTime());
}

function icon(name, color = "currentColor", size = 19) {
  const paths = {
    circle: `<circle cx="12" cy="12" r="9" stroke="${color}" stroke-width="1.6" fill="none"/>`,
    check: `<circle cx="12" cy="12" r="9" stroke="${color}" stroke-width="1.6" fill="none"/><path d="M8.5 12.5l2.3 2.3 4.7-5.1" stroke="${color}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    trash: `<path d="M4 6h16M9 6V4.5A1.5 1.5 0 0110.5 3h3A1.5 1.5 0 0115 4.5V6m1.5 0l-.6 13.2a2 2 0 01-2 1.8H10.1a2 2 0 01-2-1.8L7.5 6" stroke="${color}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
    plus: `<path d="M12 5v14M5 12h14" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`,
    chevL: `<path d="M15 6l-6 6 6 6" stroke="${color}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    chevR: `<path d="M9 6l6 6-6 6" stroke="${color}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  };
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24">${paths[name] || ""}</svg>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function taskRow(t) {
  const emojiTile = t.emoji
    ? `<span class="task-emoji" style="background:${colorFor(t.assignedTo)}1A">${t.emoji}</span>`
    : "";
  const rotationBit =
    t.rotation && t.rotation.length > 1
      ? `<span class="task-repeat">🔄 ${escapeHtml(nextInRotation(t))} er næste</span>`
      : "";
  return `
    <div class="task-row ${t.done ? "done" : ""}" style="border-left-color:${colorFor(t.assignedTo)}; view-transition-name: task-${t.id};">
      <button class="check-button" data-toggle="${t.id}">
        ${t.done ? icon("check", colorFor(t.assignedTo)) : icon("circle", "#D6CFE0")}
      </button>
      ${emojiTile}
      <div class="task-body" data-edit="${t.id}" title="Tryk for at rette">
        <span class="task-label ${t.done ? "done" : ""}">${escapeHtml(t.label)}</span>
        <span class="task-assignee" style="color:${colorFor(t.assignedTo)}">${t.assignedTo}${
          t.repeat ? `<span class="task-repeat">🔁 ${REPEAT_LABELS[t.repeat] || ""}</span>` : ""
        }${rotationBit}</span>
      </div>
      ${t.points ? `<span class="task-points">⭐ ${t.points}</span>` : ""}
      ${t.money ? `<span class="task-money">💰 ${t.money} kr</span>` : ""}
      ${t.time ? `<span class="task-time ${t.alarm ? "has-alarm" : ""}">${t.alarm ? "🔔" : "🕐"} ${t.time}</span>` : ""}
      <button class="delete-button" data-delete="${t.id}">${icon("trash", "#D6CFE0", 14)}</button>
    </div>`;
}

function listSection(visible) {
  return `
    <section class="list">
      ${
        filter !== "alle"
          ? `<div class="filter-note">${filter} · <span class="filter-clear" id="clearFilter">vis alle</span></div>`
          : ""
      }
      ${
        visible.length === 0
          ? `<div class="empty"><span class="empty-emoji">🌈</span>Ingen opgaver her.</div>`
          : visible.map(taskRow).join("")
      }
    </section>`;
}

// Within a single day: open tasks first, then by clock time (timed before
// untimed), then most-recently-added.
function byTimeThenRecent(a, b) {
  if (Number(a.done) !== Number(b.done)) return Number(a.done) - Number(b.done);
  if (a.time && b.time && a.time !== b.time) return a.time < b.time ? -1 : 1;
  if (a.time && !b.time) return -1;
  if (!a.time && b.time) return 1;
  return (b.ts || 0) - (a.ts || 0);
}

function todaySection(visible) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = ymd(today);

  const sortOpenFirst = (a, b) =>
    Number(a.done) - Number(b.done) || (b.ts || 0) - (a.ts || 0);

  const dueToday = visible.filter((t) => t.due === todayStr).sort(byTimeThenRecent);
  const overdue = visible
    .filter((t) => t.due && t.due < todayStr && !t.done)
    .sort((a, b) => (a.due < b.due ? -1 : 1));
  const noDate = visible.filter((t) => !t.due).sort(sortOpenFirst);

  const dayName = DAY_NAMES[(today.getDay() + 6) % 7];
  const dateLabel = `${dayName} ${today.getDate()}. ${MONTHS[today.getMonth()]}`;
  const todoCount = overdue.length + dueToday.filter((t) => !t.done).length + noDate.filter((t) => !t.done).length;

  const nothing = overdue.length === 0 && dueToday.length === 0 && noDate.length === 0;

  // Progress bar: how many of today's tasks are done (overdue counts as not done).
  const totalCount = overdue.length + dueToday.length + noDate.length;
  const doneCount = totalCount - todoCount;
  const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

  return `
    <section class="today">
      <div class="today-head">
        <span class="today-day">${dateLabel}</span>
        <span class="today-count">${
          todoCount === 0 ? "alt klaret 🎉" : `${todoCount} at gøre`
        }</span>
      </div>

      ${
        totalCount
          ? `<div class="today-progress ${pct === 100 ? "complete" : ""}">
              <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
              <span class="progress-count">${pct === 100 ? "🏆" : "⭐"} ${doneCount}/${totalCount}</span>
            </div>`
          : ""
      }

      ${
        filter !== "alle"
          ? `<div class="filter-note">${filter} · <span class="filter-clear" id="clearFilter">vis alle</span></div>`
          : ""
      }

      ${
        overdue.length
          ? `<div class="section-label overdue">Forsinket</div>${overdue.map(taskRow).join("")}`
          : ""
      }

      ${
        dueToday.length
          ? `<div class="section-label">I dag</div>${dueToday.map(taskRow).join("")}`
          : ""
      }

      ${
        noDate.length
          ? `<div class="section-label">Når du kan</div>${noDate.map(taskRow).join("")}`
          : ""
      }

      ${nothing ? `<div class="empty"><span class="empty-emoji">🎈</span>Ingen opgaver i dag – fri leg!</div>` : ""}
    </section>`;
}

function weekSection(visible) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = ymd(today);
  const start = startOfWeek(addDays(today, weekOffset * 7));
  const end = addDays(start, 6);
  const startStr = ymd(start);
  const endStr = ymd(end);

  const inWeek = (t) => t.due && t.due >= startStr && t.due <= endStr;
  const overdue = weekOffset === 0
    ? visible.filter((t) => t.due && t.due < todayStr && !t.done)
    : [];
  const noDate = weekOffset === 0 ? visible.filter((t) => !t.due) : [];

  const rangeLabel = `${start.getDate()}.–${end.getDate()}. ${MONTHS[end.getMonth()]}`;

  let days = "";
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const dStr = ymd(d);
    const isToday = dStr === todayStr;
    const dayTasks = visible
      .filter((t) => t.due === dStr)
      .sort(byTimeThenRecent);
    days += `
      <div class="day-card ${isToday ? "is-today" : ""}">
        <div class="day-head">
          <span class="day-name">${DAY_NAMES[i]}${isToday ? ` <span class="today-pill">i dag</span>` : ""}</span>
          <span class="day-date">${d.getDate()}. ${MONTHS[d.getMonth()]}</span>
        </div>
        ${dayTasks.length === 0 ? `<div class="day-empty">—</div>` : dayTasks.map(taskRow).join("")}
      </div>`;
  }

  return `
    <section class="week">
      <div class="week-nav">
        <button class="week-nav-btn" data-week="-1">${icon("chevL", "#6B6478", 18)}</button>
        <button class="week-title" id="weekToday">
          <span class="week-num">Uge ${isoWeek(start)}</span>
          <span class="week-range">${rangeLabel}${weekOffset !== 0 ? " · tilbage til i dag" : ""}</span>
        </button>
        <button class="week-nav-btn" data-week="1">${icon("chevR", "#6B6478", 18)}</button>
      </div>

      ${
        filter !== "alle"
          ? `<div class="filter-note">${filter} · <span class="filter-clear" id="clearFilter">vis alle</span></div>`
          : ""
      }

      ${
        overdue.length
          ? `<div class="section-label overdue">Forfaldne</div>${overdue
              .sort((a, b) => (a.due < b.due ? -1 : 1))
              .map(taskRow)
              .join("")}`
          : ""
      }

      ${days}

      ${
        noDate.length
          ? `<div class="section-label">Uden dato</div>${noDate
              .sort((a, b) => Number(a.done) - Number(b.done) || (b.ts || 0) - (a.ts || 0))
              .map(taskRow)
              .join("")}`
          : ""
      }
    </section>`;
}

function updateWithTransition(callback) {
  const cb = callback || render;
  if (document.startViewTransition) {
    document.startViewTransition(cb);
  } else {
    cb();
  }
}

function renderShell() {
  app.innerHTML = `
    <header class="header">
      <div class="header-top">
        <h1 class="h1">Opgaver</h1>
        <div class="sync-wrap" id="syncStatus"></div>
      </div>
      <p class="subtitle" id="taskCounts"></p>
    </header>

    <div class="user-bar" id="userBar"></div>

    <div class="view-toggle" id="viewToggle">
      <button class="view-btn" data-view="idag">☀️ I dag</button>
      <button class="view-btn" data-view="liste">📋 Liste</button>
      <button class="view-btn" data-view="uge">📅 Uge</button>
    </div>

    <section class="avatar-row" id="avatarRow"></section>

    <section class="stars-row" id="starsRow"></section>

    <button class="add-trigger" id="openAdd">
      <span class="add-trigger-plus">${icon("plus", "#fff", 16)}</span>
      <span class="add-trigger-text">Ny opgave …</span>
    </button>

    <div id="list-container"></div>
    <div id="footer-container"></div>
  `;

  // Attach shell-level handlers (only once)
  document.getElementById("openAdd").onclick = openAddSheet;

  document.querySelectorAll("[data-view]").forEach((el) => {
    el.onclick = () => {
      view = el.dataset.view;
      updateWithTransition();
    };
  });
}

// This week's star + kr tally per family member. Hidden until points or money
// are in use anywhere.
function renderStars() {
  const row = document.getElementById("starsRow");
  if (!row) return;
  const inUse =
    completions.length > 0 || tasks.some((t) => t.points || t.money);
  if (!inUse) {
    row.innerHTML = "";
    row.classList.remove("show");
    return;
  }
  const weekPoints = {};
  const weekMoney = {};
  MEMBERS.forEach((m) => {
    weekPoints[m.name] = 0;
    weekMoney[m.name] = 0;
  });
  completions.forEach((c) => {
    if (c.name in weekPoints) {
      weekPoints[c.name] += c.points || 0;
      weekMoney[c.name] += c.money || 0;
    }
  });
  // Only show the kr figure once money is actually in play, so families who
  // only use stars don't suddenly see "0 kr" everywhere.
  const moneyInUse =
    tasks.some((t) => t.money) || completions.some((c) => c.money);
  row.classList.add("show");
  row.innerHTML =
    `<span class="stars-label">⭐ Denne uge</span>` +
    MEMBERS.map(
      (m) =>
        `<span class="stars-chip" style="color:${colorFor(m.name)}">${m.name} <strong>${weekPoints[m.name]}</strong>${
          moneyInUse ? `<span class="stars-money">💰 ${weekMoney[m.name]} kr</span>` : ""
        }</span>`
    ).join("");
}

function render() {
  // Anker & Edith get the simplified kid mode; parents get the full app.
  if (currentUser && !isAdmin(currentUser)) {
    renderKidMode();
    return;
  }

  if (!document.getElementById("openAdd")) {
    renderShell();
  }

  // Update sync status
  const syncStatus = document.getElementById("syncStatus");
  if (syncStatus) {
    syncStatus.title = connected ? "Forbundet" : "Forbinder...";
    syncStatus.innerHTML = `
      <span class="sync-dot ${connected ? "" : "pulse"}"></span>
      <span class="sync-text">${connected ? "synkroniseret" : "forbinder"}</span>
    `;
  }

  // Update counts
  const openCount = tasks.filter((t) => !t.done).length;
  const doneCount = tasks.length - openCount;
  const countsElement = document.getElementById("taskCounts");
  if (countsElement) {
    countsElement.textContent = 
      openCount === 0 ? "Alt er gjort." : `${openCount} tilbage · ${doneCount} klaret`;
  }

  // Update user bar
  const userBar = document.getElementById("userBar");
  if (userBar) {
    userBar.innerHTML = `
      <span class="user-me">
        <span class="user-dot" style="background:${colorFor(currentUser.name)}"></span>
        Logget ind som <strong>${currentUser.name}</strong>
      </span>
      <span class="user-actions">
        <button class="theme-btn" id="themeBtn" title="Skift mellem lys og mørk">${
          document.documentElement.classList.contains("dark") ? "☀️" : "🌙"
        }</button>
        ${isAdmin(currentUser) ? `<button class="admin-btn" id="resetPinBtn">Nulstil PIN</button>` : ""}
        <button class="logout-btn" id="logoutBtn">Log ud</button>
      </span>
    `;
    document.getElementById("logoutBtn").onclick = signOut;
    document.getElementById("themeBtn").onclick = toggleTheme;
    const resetPinBtn = document.getElementById("resetPinBtn");
    if (resetPinBtn) resetPinBtn.onclick = openResetPanel;
  }

  // Update view toggle active classes
  document.querySelectorAll("[data-view]").forEach((el) => {
    if (el.dataset.view === view) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  });

  // Update avatar-row counts & filter status
  const avatarRow = document.getElementById("avatarRow");
  if (avatarRow) {
    const counts = MEMBERS.reduce((acc, m) => {
      acc[m.name] = tasks.filter((t) => t.assignedTo === m.name && !t.done).length;
      return acc;
    }, {});
    avatarRow.innerHTML = MEMBERS.map(
      (m) => `
      <button class="avatar ${filter === m.name ? "active" : ""}" data-filter="${m.name}"
        style="border-color:${colorFor(m.name)}; background:${filter === m.name ? colorFor(m.name) : "var(--card-bg)"}; view-transition-name: avatar-${m.name};">
        <span class="avatar-initial" style="color:${filter === m.name ? "#fff" : colorFor(m.name)}">${faceFor(m.name)}</span>
        <span class="avatar-badge" style="background:${filter === m.name ? "#fff" : colorFor(m.name)}; color:${filter === m.name ? colorFor(m.name) : "#fff"};">${counts[m.name]}</span>
      </button>`
    ).join("");

    document.querySelectorAll("[data-filter]").forEach((el) => {
      el.onclick = () => {
        const name = el.dataset.filter;
        filter = filter === name ? "alle" : name;
        updateWithTransition();
      };
    });
  }

  // Update list-container (Liste or Uge)
  const visible = tasks.filter((t) => (filter === "alle" ? true : t.assignedTo === filter));
  const listVisible = visible
    .slice()
    .sort((a, b) => Number(a.done) - Number(b.done) || (b.ts || 0) - (a.ts || 0));

  const listContainer = document.getElementById("list-container");
  if (listContainer) {
    if (view === "uge") {
      listContainer.innerHTML = weekSection(visible);
    } else if (view === "idag") {
      listContainer.innerHTML = todaySection(visible);
    } else {
      listContainer.innerHTML = listSection(listVisible);
    }
  }

  renderStars();

  // Update footer container
  const footerContainer = document.getElementById("footer-container");
  if (footerContainer) {
    footerContainer.innerHTML = `
      ${
        doneCount > 0
          ? `<div class="footer"><button class="clear-button" id="clearDone">Ryd klarede (${doneCount})</button></div>`
          : ""
      }
      <p class="footer-note">Deles automatisk med hele familien</p>
    `;
  }

  // Attach dynamic handlers
  const clearFilterEl = document.getElementById("clearFilter");
  if (clearFilterEl) clearFilterEl.onclick = () => { filter = "alle"; updateWithTransition(); };

  document.querySelectorAll("[data-toggle]").forEach((el) => {
    el.onclick = () => {
      const t = tasks.find((x) => x.id === el.dataset.toggle);
      if (t && !t.done) confettiBurst(el, colorFor(t.assignedTo));
      toggleDone(el.dataset.toggle);
    };
  });
  document.querySelectorAll("[data-delete]").forEach((el) => {
    el.onclick = () => removeTask(el.dataset.delete);
  });
  document.querySelectorAll("[data-edit]").forEach((el) => {
    el.onclick = () => {
      const t = tasks.find((x) => x.id === el.dataset.edit);
      if (t) openEditSheet(t);
    };
  });
  document.querySelectorAll("[data-week]").forEach((el) => {
    el.onclick = () => {
      weekOffset += Number(el.dataset.week);
      updateWithTransition();
    };
  });
  const weekTodayEl = document.getElementById("weekToday");
  if (weekTodayEl) weekTodayEl.onclick = () => { weekOffset = 0; updateWithTransition(); };

  const clearDoneEl = document.getElementById("clearDone");
  if (clearDoneEl) clearDoneEl.onclick = clearDone;
}

// The "Ny opgave" pop-out. All creation options live here, so the main screen
// stays clean. Mirrors openEditSheet, plus the template gallery.
function openAddSheet() {
  let host = document.getElementById("addSheet");
  if (!host) {
    host = document.createElement("div");
    host.id = "addSheet";
    document.body.appendChild(host);
  }

  // Local draft state; text/date inputs are read from the DOM on save.
  let due = "";
  let time = "";
  let alarm = false;
  let repeat = null;
  let assignees = [currentUser.name];
  let points = null;
  let showTpl = false;
  let busy = false;

  function close() {
    host.remove();
  }

  host.innerHTML = `
    <div class="modal-wrap">
      <div class="modal-card edit-card">
        <div class="modal-head">
          <h2 class="modal-title">Ny opgave</h2>
          <button class="modal-close" data-close="1">✕</button>
        </div>

        <button class="template-toggle" id="addTplToggle"></button>
        <div class="template-gallery" id="addTplGallery"></div>

        <div class="label-row edit-label-row">
          <input class="input edit-emoji-input" id="addEmoji" maxlength="8" placeholder="🙂" />
          <input class="input" id="addLabel" placeholder="Hvad skal der gøres?" />
        </div>

        <div class="add-meta">
          <span class="date-field-label">Forfald</span>
          <input type="date" class="date-input" id="addDue" />
          <span class="date-field-label">Kl.</span>
          <input type="time" class="date-input time-input" id="addTime" />
          <button class="alarm-toggle" id="addAlarm"></button>
        </div>

        <div class="repeat-row" id="addRepeatRow"></div>
        <div class="repeat-row" id="addPointsRow"></div>
        <div class="repeat-row money-row">
          <span class="repeat-row-label">Kr</span>
          <div class="money-field">
            <input type="number" min="0" max="1000" step="1" inputmode="numeric" class="input money-input" id="addMoneyInput" placeholder="0" />
            <span class="money-suffix">kr</span>
          </div>
        </div>
        <div class="assign-hint" id="addAssignHint"></div>
        <div class="assign-row edit-assign-row" id="addAssignRow"></div>

        <div class="sheet-actions">
          <button class="btn-ghost" data-close="1">Annullér</button>
          <button class="btn-primary" id="addSave">Tilføj</button>
        </div>
      </div>
    </div>`;

  const dueInput = host.querySelector("#addDue");
  const timeInput = host.querySelector("#addTime");
  dueInput.onchange = () => { due = dueInput.value; };
  timeInput.onchange = () => { time = timeInput.value; drawAlarm(); };

  // Tap-to-add gallery of preset tasks; picking one fills the form.
  function drawTemplates() {
    const toggle = host.querySelector("#addTplToggle");
    toggle.innerHTML = `📋 Skabeloner ${showTpl ? "▴" : "▾"}`;
    toggle.classList.toggle("open", showTpl);
    toggle.onclick = () => {
      showTpl = !showTpl;
      drawTemplates();
    };
    const gallery = host.querySelector("#addTplGallery");
    if (!showTpl) {
      gallery.innerHTML = "";
      gallery.classList.remove("open");
      return;
    }
    gallery.classList.add("open");
    gallery.innerHTML = TASK_TEMPLATES.map(
      (tpl, i) => `
        <button class="template-chip" data-template="${i}">
          <span class="template-emoji">${tpl.emoji}</span>
          <span class="template-label">${escapeHtml(tpl.label)}</span>
        </button>`
    ).join("");
    gallery.querySelectorAll("[data-template]").forEach((el) => {
      el.onclick = () => {
        const tpl = TASK_TEMPLATES[Number(el.dataset.template)];
        host.querySelector("#addEmoji").value = tpl.emoji;
        host.querySelector("#addLabel").value = tpl.label;
        points = tpl.points || null;
        host.querySelector("#addMoneyInput").value = tpl.money || "";
        drawChips();
        showTpl = false; // collapse the gallery once a template is chosen
        drawTemplates();
      };
    });
  }

  function drawAlarm() {
    const btn = host.querySelector("#addAlarm");
    const supported = "Notification" in window;
    btn.classList.toggle("active", alarm);
    btn.classList.toggle("disabled", !supported);
    btn.textContent = alarm ? "🔔 Alarm til" : "🔔 Alarm";
    btn.onclick = async () => {
      if (!supported) return alert("Denne enhed understøtter ikke notifikationer.");
      if (alarm) { alarm = false; return drawAlarm(); }
      if (Notification.permission === "denied")
        return alert("Notifikationer er blokeret. Tillad dem i browserens indstillinger for siden.");
      if (Notification.permission === "default") {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") return;
      }
      alarm = true;
      drawAlarm();
    };
  }

  function drawChips() {
    host.querySelector("#addRepeatRow").innerHTML = `
      <span class="repeat-row-label">Gentag</span>
      <div class="repeat-chips">
        ${REPEAT_OPTIONS.map(
          (o) => `<button class="repeat-chip ${repeat === o.id ? "active" : ""}" data-repeat="${o.id}">${o.label}</button>`
        ).join("")}
      </div>`;
    host.querySelector("#addPointsRow").innerHTML = `
      <span class="repeat-row-label">Stjerner</span>
      <div class="repeat-chips">
        ${POINTS_OPTIONS.map(
          (p) => `<button class="repeat-chip ${points === p ? "active" : ""}" data-points="${p}">${p === null ? "Ingen" : `⭐ ${p}`}</button>`
        ).join("")}
      </div>`;
    // Kids can only give tasks to themselves — they just get their own chip.
    const admin = isAdmin(currentUser);
    const assignable = admin ? MEMBERS : MEMBERS.filter((m) => m.name === currentUser.name);
    host.querySelector("#addAssignRow").innerHTML = assignable.map(
      (m) => `<button class="assign-chip ${assignees.includes(m.name) ? "active" : ""}" data-assign="${m.name}"
        style="background:${assignees.includes(m.name) ? colorFor(m.name) : "var(--bg-app)"}">${m.name}</button>`
    ).join("");
    host.querySelector("#addAssignHint").textContent = repeat && admin
      ? assignees.length > 1
        ? `🔄 Skiftes: ${assignees.join(" → ")}`
        : "Tip: vælg flere personer, så skiftes de"
      : "";

    host.querySelectorAll("[data-repeat]").forEach((el) => {
      el.onclick = () => {
        const val = el.dataset.repeat;
        repeat = val === "null" ? null : val;
        // Rotation only makes sense for a recurring task — collapse to one person.
        if (!repeat && assignees.length > 1) assignees = [assignees[0]];
        drawChips();
      };
    });
    host.querySelectorAll("[data-points]").forEach((el) => {
      el.onclick = () => {
        const val = el.dataset.points;
        points = val === "null" ? null : Number(val);
        drawChips();
      };
    });
    host.querySelectorAll("[data-assign]").forEach((el) => {
      el.onclick = () => {
        const name = el.dataset.assign;
        if (!repeat) {
          assignees = [name];
        } else if (assignees.includes(name)) {
          if (assignees.length > 1) assignees = assignees.filter((n) => n !== name);
        } else {
          assignees = [...assignees, name];
        }
        drawChips();
      };
    });
  }

  host.querySelectorAll("[data-close]").forEach((el) => (el.onclick = close));
  host.querySelector(".modal-wrap").onclick = (e) => {
    if (e.target === e.currentTarget) close();
  };

  async function save() {
    if (busy) return;
    const label = host.querySelector("#addLabel").value.trim();
    if (!label) return alert("Opgaven skal have en tekst.");
    const emoji = host.querySelector("#addEmoji").value.trim();
    const money = Number(host.querySelector("#addMoneyInput").value) || null;
    // A recurring task (or a one-off alarm) needs a date to anchor it — default to today.
    const needsAnchor = repeat || (alarm && time);
    const finalDue = needsAnchor && !due ? ymd(new Date()) : due || null;
    const data = {
      label,
      emoji: emoji || null,
      assignedTo: assignees[0],
      done: false,
      due: finalDue,
      time: time || null,
      alarm: !!(alarm && time),
      repeat: repeat || null,
      ts: Date.now(),
    };
    // New optional fields are omitted (not written as null) when unused, so
    // documents stay valid even under the previous published rules.
    if (repeat && assignees.length > 1) data.rotation = [...assignees];
    if (points) data.points = points;
    if (money) data.money = money;
    busy = true;
    const saveBtn = host.querySelector("#addSave");
    saveBtn.textContent = "…";
    try {
      await setDoc(doc(tasksCol, uid()), data);
      close();
    } catch (e) {
      console.error("Adding task failed:", e);
      busy = false;
      saveBtn.textContent = "Tilføj";
      alert("Kunne ikke gemme opgaven. Er du online?");
    }
  }

  host.querySelector("#addSave").onclick = save;
  host.querySelector("#addLabel").onkeydown = (e) => {
    if (e.key === "Enter") save();
  };

  // No autofocus on the text field: on mobile that pops the keyboard and hides
  // the rest of the form. Let the user pick person/time first, then tap to type.
  drawTemplates();
  drawAlarm();
  drawChips();
}

// Manual light/dark switch. Until the 🌙/☀️ button is tapped, the app follows
// the device setting (the head script in index.html applies it pre-paint);
// after a tap the choice is saved per device and wins over the system.
function applyTheme(dark) {
  document.documentElement.classList.toggle("dark", dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? "#1E1B18" : "#FDF7ED";
}

function toggleTheme() {
  const dark = !document.documentElement.classList.contains("dark");
  localStorage.setItem("theme", dark ? "dark" : "light");
  applyTheme(dark);
  render(); // refresh the button icon
}

// Track live system changes only while no manual choice is saved.
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
  if (!localStorage.getItem("theme")) {
    applyTheme(e.matches);
    if (document.getElementById("openAdd")) render();
  }
});

// A confetti burst from the checkbox when a task is completed. `big` is the
// kid-mode celebration cannon: more pieces, wider spread, longer fall.
function confettiBurst(anchor, color, big = false) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const rect = anchor.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const colors = [color, "#FFC53D", "#FF5E7A", "#38BDF8", "#4ADE80", "#A78BFA"];
  const count = big ? 60 : 22;
  for (let i = 0; i < count; i++) {
    const bit = document.createElement("span");
    bit.className = "confetti-bit";
    const size = 5 + Math.random() * (big ? 7 : 6);
    const h = Math.random() > 0.5 ? size : size * 0.4;
    bit.style.cssText = `left:${cx}px; top:${cy}px; width:${size}px; height:${h}px; background:${colors[i % colors.length]};`;
    document.body.appendChild(bit);
    const angle = Math.random() * Math.PI * 2;
    const dist = (big ? 90 : 40) + Math.random() * (big ? 160 : 80);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - (big ? 120 : 60);
    bit
      .animate(
        [
          { transform: "translate(0, 0) rotate(0deg) scale(1)", opacity: 1 },
          {
            transform: `translate(${dx}px, ${dy + (big ? 260 : 120)}px) rotate(${Math.random() * 720 - 360}deg) scale(0.5)`,
            opacity: 0,
          },
        ],
        {
          duration: (big ? 1100 : 700) + Math.random() * 600,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "forwards",
        }
      )
      .onfinish = () => bit.remove();
  }
}

// ============================================================
// Kid mode — the simplified interface for Anker & Edith.
// Their own tasks only, big tap targets, no create/edit/delete.
// ============================================================

const KID_CHECK_SVG = `<svg width="22" height="22" viewBox="0 0 24 24"><path d="M5 13l5 5L20 7" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const LOOK_COLORS = ["#7C5CFF", "#FF5E7A", "#38BDF8", "#10B981", "#F97316", "#EF4444", "#14B8A6", "#D946EF"];
const LOOK_FACES = ["😎", "🦄", "🐱", "🐶", "🦊", "🐼", "⚽", "🏀", "🎮", "🎸", "🚀"];

// One flat list for the kid's day: overdue first, then today's (timed before
// untimed), then "whenever" tasks — with everything done sunk to the bottom.
function kidTodayTasks() {
  const todayStr = ymd(new Date());
  const mine = tasks.filter((t) => t.assignedTo === currentUser.name);
  const overdue = mine
    .filter((t) => t.due && t.due < todayStr && !t.done)
    .sort((a, b) => (a.due < b.due ? -1 : 1));
  const dueToday = mine.filter((t) => t.due === todayStr).sort(byTimeThenRecent);
  const noDate = mine
    .filter((t) => !t.due)
    .sort((a, b) => Number(a.done) - Number(b.done) || (b.ts || 0) - (a.ts || 0));
  const all = [...overdue, ...dueToday, ...noDate];
  return [...all.filter((t) => !t.done), ...all.filter((t) => t.done)];
}

function kidCompletionsOn(dateStr) {
  return completions.filter((c) => c.name === currentUser.name && c.date === dateStr);
}

function kidTaskCard(t, i) {
  const todayStr = ymd(new Date());
  const late = t.due && t.due < todayStr && !t.done;
  return `
    <div class="kid-task ${t.done ? "done" : ""}"
      style="${kidAnimate ? `animation-delay:${0.2 + i * 0.07}s;` : ""} view-transition-name: task-${t.id};">
      <span class="kid-task-emoji">${t.emoji || "📋"}</span>
      <span class="kid-task-body">
        <div class="kid-task-label">${escapeHtml(t.label)}</div>
        <div class="kid-task-meta">
          ${t.time ? `<span class="task-time ${t.alarm ? "has-alarm" : ""}">${t.alarm ? "🔔" : "🕐"} ${t.time}</span>` : ""}
          ${t.points ? `<span class="task-points">⭐ ${t.points}</span>` : ""}
          ${t.money ? `<span class="task-money">💰 ${t.money} kr</span>` : ""}
          ${t.repeat ? `<span class="task-time">🔁 ${REPEAT_LABELS[t.repeat] || ""}</span>` : ""}
          ${late ? `<span class="task-time">⏰ Fra tidligere</span>` : ""}
        </div>
      </span>
      <button class="kid-check ${t.done ? "done" : ""}" data-kidtoggle="${t.id}">${t.done ? KID_CHECK_SVG : ""}</button>
    </div>`;
}

// The week at a glance: one row per day, that day's task emojis, and a status.
// Past days count via the completions log (recurring tasks roll forward, so
// the task list alone can't say what got done yesterday).
function kidWeekRows() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = ymd(today);
  const start = startOfWeek(today);
  const mine = tasks.filter((t) => t.assignedTo === currentUser.name);

  let rows = "";
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const ds = ymd(d);
    const isToday = ds === todayStr;
    const dayTasks = mine.filter((t) => t.due === ds);
    const open = dayTasks.filter((t) => !t.done).length;
    const doneCount = kidCompletionsOn(ds).length;

    let stateHtml = "";
    if (ds < todayStr) {
      if (open > 0) stateHtml = `<span class="kid-day-state late">${open} mangler</span>`;
      else if (doneCount > 0) stateHtml = `<span class="kid-day-state">✓ Færdig</span>`;
    } else if (isToday) {
      const total = open + doneCount;
      if (total === 0) stateHtml = "";
      else if (open === 0) stateHtml = `<span class="kid-day-state">✓ Færdig</span>`;
      else stateHtml = `<span class="kid-day-state pending">${doneCount}/${total}</span>`;
    } else if (dayTasks.length > 0) {
      stateHtml = `<span class="kid-day-state pending">${dayTasks.length}</span>`;
    }

    const emojis = dayTasks.map((t) => t.emoji || "🔹").join("");
    const middle = emojis
      ? `<span class="kid-day-emojis">${emojis}</span>`
      : `<span class="kid-day-free">${doneCount > 0 ? "" : "Fri 🎈"}</span>`;

    const delays = kidAnimate
      ? `animation-delay:${0.05 * i}s;`
      : "";
    const stateDelayed = kidAnimate && stateHtml
      ? stateHtml.replace('class="kid-day-state', `style="animation-delay:${0.3 + 0.08 * i}s" class="kid-day-state`)
      : stateHtml;

    rows += `
      <div class="kid-day ${isToday ? "kid-today" : ""}" style="${delays}" ${isToday ? 'data-kidgotoday="1" title="Gå til i dag"' : ""}>
        <span class="kid-day-name">${DAY_NAMES[i].slice(0, 3)}</span>
        ${middle}
        ${stateDelayed}
      </div>`;
  }
  return rows;
}

function renderKidMode() {
  const me = currentUser.name;
  document.documentElement.style.setProperty("--kid-accent", colorFor(me));

  const today = new Date();
  const todayStr = ymd(today);
  const dateLabel = `${DAY_NAMES[(today.getDay() + 6) % 7]} ${today.getDate()}. ${MONTHS[today.getMonth()]}`;

  const list = kidTodayTasks();
  // Progress counts completions, not just visible done-tasks: a completed
  // recurring chore rolls its due date forward and leaves the list, but the
  // completion log still remembers it was done today.
  const doneToday = kidCompletionsOn(todayStr).length;
  const open = list.filter((t) => !t.done).length;
  const total = open + doneToday;
  const pct = total ? Math.round((doneToday / total) * 100) : 0;
  const myCompletions = completions.filter((c) => c.name === me);
  const weekStars = myCompletions.reduce((s, c) => s + (c.points || 0), 0);
  const weekMoney = myCompletions.reduce((s, c) => s + (c.money || 0), 0);
  const moneyInUse = tasks.some((t) => t.money) || completions.some((c) => c.money);
  const isDark = document.documentElement.classList.contains("dark");
  const customized = !!(looks[me]?.face || looks[me]?.color);

  app.innerHTML = `
    <div class="${kidAnimate ? "kid-enter" : ""}">
      <div class="kid-hello">
        <button class="kid-face ${customized ? "customized" : ""}" id="kidFace" title="Vælg dit look">
          <span>${faceFor(me)}</span><span class="kid-face-edit">✏️</span>
        </button>
        <span class="kid-hello-text">
          <div class="kid-hi">Hej ${me}! <span class="kid-wave">👋</span></div>
          <div class="kid-date">${dateLabel}</div>
        </span>
        <button class="theme-btn" id="themeBtn" title="Skift mellem lys og mørk">${isDark ? "☀️" : "🌙"}</button>
        <button class="logout-btn" id="logoutBtn">Log ud</button>
      </div>

      <div class="kid-progress" style="${kidAnimate ? "animation-delay:0.08s;" : ""} view-transition-name: kid-progress;">
        <div class="kid-progress-top">
          <span class="kid-progress-label">Din dag</span>
          <span class="kid-progress-count">${total === 0 ? "Fri i dag 🎈" : `⭐ ${doneToday} af ${total}`}</span>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="kid-week-stars">🏆 Denne uge: ${weekStars} ${weekStars === 1 ? "stjerne" : "stjerner"}</div>
        ${moneyInUse ? `<div class="kid-week-money">💰 Du har tjent ${weekMoney} kr denne uge</div>` : ""}
      </div>

      <div class="kid-tabs" style="${kidAnimate ? "animation-delay:0.15s;" : ""}">
        <button class="kid-tab ${kidView === "idag" ? "active" : ""}" data-kidview="idag">☀️ I dag</button>
        <button class="kid-tab ${kidView === "uge" ? "active" : ""}" data-kidview="uge">📅 Min uge</button>
      </div>

      ${
        kidView === "idag"
          ? list.length === 0
            ? `<div class="empty" style="${kidAnimate ? "animation-delay:0.22s;" : ""}"><span class="empty-emoji">🎈</span>Ingen opgaver i dag – fri leg!</div>`
            : list.map(kidTaskCard).join("")
          : kidWeekRows()
      }
    </div>

    <button class="kid-fab" id="kidAddBtn" title="Tilføj opgave" aria-label="Tilføj opgave">+</button>
  `;
  kidAnimate = false;

  document.getElementById("kidAddBtn").onclick = openKidAddSheet;
  document.getElementById("logoutBtn").onclick = signOut;
  document.getElementById("themeBtn").onclick = toggleTheme;
  document.getElementById("kidFace").onclick = openLookSheet;

  document.querySelectorAll("[data-kidview]").forEach((el) => {
    el.onclick = () => {
      if (kidView === el.dataset.kidview) return;
      kidView = el.dataset.kidview;
      kidAnimate = true;
      updateWithTransition();
    };
  });

  document.querySelectorAll("[data-kidtoggle]").forEach((el) => {
    el.onclick = () => kidToggle(el);
  });

  const todayRow = document.querySelector("[data-kidgotoday]");
  if (todayRow) {
    todayRow.onclick = () => {
      kidView = "idag";
      kidAnimate = true;
      updateWithTransition();
    };
  }
}

// Tap the big circle: optimistic flourish right away (pop, drawn check,
// confetti), then the shared toggleDone writes the real state — including
// rolling recurring chores forward and logging/removing the completion.
function kidToggle(btn) {
  const t = tasks.find((x) => x.id === btn.dataset.kidtoggle);
  if (!t) return;
  if (!t.done) {
    const card = btn.closest(".kid-task");
    btn.classList.add("done");
    btn.innerHTML = KID_CHECK_SVG;
    if (card) card.classList.add("pop");
    confettiBurst(btn, colorFor(currentUser.name));
    const openLeft = kidTodayTasks().filter((x) => !x.done).length;
    if (openLeft === 1) setTimeout(kidCelebrate, 650); // that was the last one!
  }
  toggleDone(t.id);
}

// The payoff for finishing the day: trophy, twinkling stars, confetti cannons.
function kidCelebrate() {
  if (document.querySelector(".kid-celebrate")) return;
  const el = document.createElement("div");
  el.className = "kid-celebrate";
  el.innerHTML = `
    <div class="kid-celebrate-card">
      <span class="kid-celebrate-trophy">🏆</span>
      <div class="kid-celebrate-title">Alt klaret!</div>
      <div class="kid-celebrate-sub">Sikke en sej dag, ${currentUser.name}!</div>
      <div class="kid-celebrate-stars">
        <span style="animation-delay:0.5s">⭐</span><span style="animation-delay:0.65s">⭐</span><span style="animation-delay:0.8s">⭐</span><span style="animation-delay:0.95s">⭐</span><span style="animation-delay:1.1s">⭐</span>
      </div>
    </div>`;
  el.onclick = () => el.remove();
  document.body.appendChild(el);
  confettiBurst(el.querySelector(".kid-celebrate-trophy"), colorFor(currentUser.name), true);
  setTimeout(() => {
    const stars = el.querySelector(".kid-celebrate-stars");
    if (stars) confettiBurst(stars, colorFor(currentUser.name), true);
  }, 600);
  setTimeout(() => el.remove(), 7000);
}

// Kids add their own tasks with a stripped-down sheet: tap an emoji, type what
// to do, and pick when — I dag, I morgen, or a specific day (native date
// picker). No points, repeat, alarm or assignee choice: a kid's task is always
// for today/tomorrow/that day and always assigned to themselves. Those richer
// options stay parent-only in the full add sheet.
const KID_EMOJI_QUICKPICKS = ["📋", "🧸", "📚", "🦷", "🚿", "🧹", "🐕", "🎵", "⚽", "🎮", "🎨", "🍽️"];

function openKidAddSheet() {
  let host = document.getElementById("kidAddSheet");
  if (!host) {
    host = document.createElement("div");
    host.id = "kidAddSheet";
    host.style.cssText = "position:fixed; inset:0; z-index:1150;";
    document.body.appendChild(host);
  }

  let emoji = "📋";
  let when = "today"; // "today" | "tomorrow" | "date"
  let pickedDate = ""; // ymd, only set once "Vælg dag" picks a day
  let busy = false;

  function close() {
    host.remove();
  }

  // Resolve the chosen "when" to a due date (ymd). A specific day that wasn't
  // actually picked falls back to today so a task always lands somewhere sane.
  function dueFor() {
    if (when === "tomorrow") return ymd(addDays(new Date(), 1));
    if (when === "date" && pickedDate) return pickedDate;
    return ymd(new Date());
  }

  host.innerHTML = `
    <div class="modal-wrap">
      <div class="modal-card kid-add-card">
        <div class="modal-head">
          <h2 class="modal-title">Ny opgave ✨</h2>
          <button class="modal-close" data-close="1">✕</button>
        </div>

        <div class="kid-add-emojis">
          ${KID_EMOJI_QUICKPICKS.map(
            (e) => `<button class="kid-emoji-pick ${emoji === e ? "active" : ""}" data-emoji="${e}">${e}</button>`
          ).join("")}
        </div>

        <input class="input kid-add-input" id="kidAddLabel" placeholder="Hvad skal du lave?" />

        <div class="kid-add-when-label">Hvornår?</div>
        <div class="kid-when-chips">
          <button class="kid-when-chip active" data-when="today">☀️ I dag</button>
          <button class="kid-when-chip" data-when="tomorrow">🌙 I morgen</button>
          <button class="kid-when-chip" data-when="date" id="kidWhenDate">📅 Vælg dag</button>
        </div>
        <input type="date" id="kidAddDate" class="kid-hidden-date" />

        <div class="sheet-actions">
          <button class="btn-ghost" data-close="1">Annullér</button>
          <button class="btn-primary" id="kidAddSave">Tilføj ⭐</button>
        </div>
      </div>
    </div>`;

  host.querySelectorAll("[data-close]").forEach((el) => (el.onclick = close));
  host.querySelector(".modal-wrap").onclick = (e) => {
    if (e.target === e.currentTarget) close();
  };

  host.querySelectorAll("[data-emoji]").forEach((el) => {
    el.onclick = () => {
      emoji = el.dataset.emoji;
      host.querySelectorAll("[data-emoji]").forEach((b) => b.classList.toggle("active", b === el));
    };
  });

  const dateInput = host.querySelector("#kidAddDate");
  const dateChip = host.querySelector("#kidWhenDate");

  function selectWhen(val, chip) {
    when = val;
    host.querySelectorAll("[data-when]").forEach((b) => b.classList.toggle("active", b === chip));
  }

  host.querySelectorAll("[data-when]").forEach((el) => {
    el.onclick = () => {
      if (el.dataset.when === "date") {
        // Open the native date picker as part of this tap (a user gesture, so
        // showPicker is allowed); fall back to focusing the input if unsupported.
        try {
          dateInput.showPicker();
        } catch {
          dateInput.focus();
        }
        return;
      }
      selectWhen(el.dataset.when, el);
    };
  });

  // Only commit to the "specific day" choice once a date is actually picked.
  dateInput.onchange = () => {
    if (!dateInput.value) return;
    pickedDate = dateInput.value;
    const d = parseYmd(pickedDate);
    dateChip.textContent = `📅 ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
    selectWhen("date", dateChip);
  };

  async function save() {
    if (busy) return;
    const label = host.querySelector("#kidAddLabel").value.trim();
    if (!label) return alert("Skriv hvad du skal lave 🙂");
    const data = {
      label,
      emoji: emoji || null,
      assignedTo: currentUser.name,
      done: false,
      due: dueFor(),
      time: null,
      alarm: false,
      repeat: null,
      ts: Date.now(),
    };
    busy = true;
    const saveBtn = host.querySelector("#kidAddSave");
    saveBtn.textContent = "…";
    try {
      await setDoc(doc(tasksCol, uid()), data);
      close();
    } catch (e) {
      console.error("Kid adding task failed:", e);
      busy = false;
      saveBtn.textContent = "Tilføj ⭐";
      alert("Kunne ikke gemme opgaven. Er du online?");
    }
  }

  host.querySelector("#kidAddSave").onclick = save;
  host.querySelector("#kidAddLabel").onkeydown = (e) => {
    if (e.key === "Enter") save();
  };
}

// "Vælg dit look": pick a face (emoji or your initial) and an accent color.
// Saved per member in Firestore, so the look follows the kid across devices —
// and their color takes over everywhere in the family's views too.
async function saveLook(patch) {
  try {
    await setDoc(doc(membersCol, currentUser.name), patch, { merge: true });
  } catch (e) {
    console.error("Saving look failed:", e);
    alert("Kunne ikke gemme dit look. Er du online?");
  }
}

function openLookSheet() {
  let host = document.getElementById("lookSheet");
  if (!host) {
    host = document.createElement("div");
    host.id = "lookSheet";
    host.style.cssText = "position:fixed; inset:0; z-index:1150;";
    document.body.appendChild(host);
  }
  const me = currentUser.name;
  const faces = [me[0], ...LOOK_FACES];

  function close() {
    host.remove();
  }

  function draw() {
    const face = faceFor(me);
    const color = colorFor(me);
    host.innerHTML = `
      <div class="modal-wrap">
        <div class="modal-card">
          <div class="modal-head">
            <h2 class="modal-title">Vælg dit look</h2>
            <button class="modal-close" data-close="1">✕</button>
          </div>
          <div class="kid-look-label">Din figur</div>
          <div class="kid-emoji-grid">
            ${faces
              .map((f) => `<button class="kid-emoji-opt ${f === face ? "active" : ""}" data-face="${f}">${f}</button>`)
              .join("")}
          </div>
          <div class="kid-look-label">Din farve</div>
          <div class="kid-color-row">
            ${LOOK_COLORS
              .map((c) => `<button class="kid-color-dot ${c === color ? "active" : ""}" data-color="${c}" style="background:${c}"></button>`)
              .join("")}
          </div>
          <div class="sheet-actions">
            <button class="btn-primary" data-close="1">Færdig</button>
          </div>
        </div>
      </div>`;

    host.querySelectorAll("[data-face]").forEach((el) => {
      el.onclick = () => {
        // Optimistic: repaint immediately, then persist. The members snapshot
        // confirms (or corrects) shortly after.
        looks[me] = { ...looks[me], face: el.dataset.face };
        saveLook({ face: el.dataset.face });
        render();
        draw();
      };
    });
    host.querySelectorAll("[data-color]").forEach((el) => {
      el.onclick = () => {
        looks[me] = { ...looks[me], color: el.dataset.color };
        saveLook({ color: el.dataset.color });
        render();
        draw();
      };
    });
    host.querySelectorAll("[data-close]").forEach((el) => (el.onclick = close));
    host.querySelector(".modal-wrap").onclick = (e) => {
      if (e.target === e.currentTarget) close();
    };
  }

  draw();
}

// Only touch the fields we mean to change (updateDoc, not a full setDoc
// overwrite) so a stale local copy can't revert edits made on another device.
async function toggleDone(id) {
  const t = tasks.find((t) => t.id === id);
  if (!t) return;

  // Recurring task: instead of marking done, roll it forward to the next date —
  // and if it rotates, hand it to the next person in the rotation.
  if (t.repeat && !t.done) {
    const updates = { due: nextDueDate(t.due, t.repeat) };
    if (t.rotation && t.rotation.length > 1) updates.assignedTo = nextInRotation(t);
    await updateDoc(doc(tasksCol, id), updates);
    logCompletion(t); // credited to whoever had it when it was checked off
    return;
  }

  await updateDoc(doc(tasksCol, id), { done: !t.done });
  if (!t.done) logCompletion(t);
  else removeCompletion(t); // un-checking the same day takes the stars back
}

async function removeTask(id) {
  const t = tasks.find((t) => t.id === id);
  await deleteDoc(doc(tasksCol, id));
  if (t) showUndo(t);
}

// A brief "Fortryd" snackbar after a delete, so one stray tap isn't final.
// Restoring simply rewrites the same document under its old id.
let undoState = null; // { el, timer }

function dismissUndo() {
  if (!undoState) return;
  clearTimeout(undoState.timer);
  undoState.el.remove();
  undoState = null;
}

function showUndo(t) {
  dismissUndo();
  const el = document.createElement("div");
  el.className = "undo-snackbar";
  el.innerHTML = `
    <span class="undo-text">Slettede "${escapeHtml(t.label)}"</span>
    <button class="undo-btn">Fortryd</button>`;
  document.body.appendChild(el);
  el.querySelector(".undo-btn").onclick = async () => {
    const { id, ...data } = t;
    dismissUndo();
    try {
      await setDoc(doc(tasksCol, id), data);
    } catch (e) {
      console.error("Undo failed:", e);
      alert("Kunne ikke gendanne opgaven. Er du online?");
    }
  };
  undoState = { el, timer: setTimeout(dismissUndo, 6000) };
}

async function clearDone() {
  if (!confirm("Fjern alle afkrydsede opgaver?")) return;
  const toRemove = tasks.filter((t) => t.done);
  await Promise.all(toRemove.map((t) => deleteDoc(doc(tasksCol, t.id))));
}

// Tap a task to edit everything about it: label, emoji, date, time, alarm,
// repeat, who (incl. rotation) and stars. Saves via updateDoc so only the
// edited fields are touched; cleared optional fields are removed with
// deleteField() to stay valid under the previous published rules.
function openEditSheet(t) {
  let host = document.getElementById("editSheet");
  if (!host) {
    host = document.createElement("div");
    host.id = "editSheet";
    document.body.appendChild(host);
  }

  // Local draft state; text/date inputs are read from the DOM on save.
  let due = t.due || "";
  let time = t.time || "";
  let alarm = !!t.alarm;
  let repeat = t.repeat || null;
  let assignees = t.rotation && t.rotation.length > 1 ? [...t.rotation] : [t.assignedTo];
  let points = t.points || null;
  let busy = false;

  function close() {
    host.remove();
  }

  host.innerHTML = `
    <div class="modal-wrap">
      <div class="modal-card edit-card">
        <div class="modal-head">
          <h2 class="modal-title">Ret opgave</h2>
          <button class="modal-close" data-close="1">✕</button>
        </div>

        <div class="label-row edit-label-row">
          <input class="input edit-emoji-input" id="editEmoji" maxlength="8" placeholder="🙂" value="${escapeHtml(t.emoji || "")}" />
          <input class="input" id="editLabel" value="${escapeHtml(t.label)}" />
        </div>

        <div class="add-meta">
          <span class="date-field-label">Forfald</span>
          <input type="date" class="date-input" id="editDue" value="${due}" />
          <span class="date-field-label">Kl.</span>
          <input type="time" class="date-input time-input" id="editTime" value="${time}" />
          <button class="alarm-toggle" id="editAlarm"></button>
        </div>

        <div class="repeat-row" id="editRepeatRow"></div>
        <div class="repeat-row" id="editPointsRow"></div>
        <div class="repeat-row money-row">
          <span class="repeat-row-label">Kr</span>
          <div class="money-field">
            <input type="number" min="0" max="1000" step="1" inputmode="numeric" class="input money-input" id="editMoneyInput" placeholder="0" value="${t.money || ""}" />
            <span class="money-suffix">kr</span>
          </div>
        </div>
        <div class="assign-hint" id="editAssignHint"></div>
        <div class="assign-row edit-assign-row" id="editAssignRow"></div>

        <div class="sheet-actions">
          <button class="btn-ghost" data-close="1">Annullér</button>
          <button class="btn-primary" id="editSave">Gem</button>
        </div>
      </div>
    </div>`;

  const dueInput = host.querySelector("#editDue");
  const timeInput = host.querySelector("#editTime");
  dueInput.onchange = () => { due = dueInput.value; };
  timeInput.onchange = () => { time = timeInput.value; drawAlarm(); };

  function drawAlarm() {
    const btn = host.querySelector("#editAlarm");
    const supported = "Notification" in window;
    btn.classList.toggle("active", alarm);
    btn.classList.toggle("disabled", !supported);
    btn.textContent = alarm ? "🔔 Alarm til" : "🔔 Alarm";
    btn.onclick = async () => {
      if (!supported) return alert("Denne enhed understøtter ikke notifikationer.");
      if (alarm) { alarm = false; return drawAlarm(); }
      if (Notification.permission === "denied")
        return alert("Notifikationer er blokeret. Tillad dem i browserens indstillinger for siden.");
      if (Notification.permission === "default") {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") return;
      }
      alarm = true;
      drawAlarm();
    };
  }

  function drawChips() {
    host.querySelector("#editRepeatRow").innerHTML = `
      <span class="repeat-row-label">Gentag</span>
      <div class="repeat-chips">
        ${REPEAT_OPTIONS.map(
          (o) => `<button class="repeat-chip ${repeat === o.id ? "active" : ""}" data-repeat="${o.id}">${o.label}</button>`
        ).join("")}
      </div>`;
    host.querySelector("#editPointsRow").innerHTML = `
      <span class="repeat-row-label">Stjerner</span>
      <div class="repeat-chips">
        ${POINTS_OPTIONS.map(
          (p) => `<button class="repeat-chip ${points === p ? "active" : ""}" data-points="${p}">${p === null ? "Ingen" : `⭐ ${p}`}</button>`
        ).join("")}
      </div>`;
    // Kids can't hand a task to someone else: the current assignees are shown
    // locked, so a shared rotation stays intact when a kid edits other fields.
    const admin = isAdmin(currentUser);
    const shown = admin ? MEMBERS : MEMBERS.filter((m) => assignees.includes(m.name));
    host.querySelector("#editAssignRow").innerHTML = shown.map(
      (m) => `<button class="assign-chip ${assignees.includes(m.name) ? "active" : ""}" data-assign="${m.name}"
        ${admin ? "" : "disabled"} style="background:${assignees.includes(m.name) ? colorFor(m.name) : "var(--bg-app)"}">${m.name}</button>`
    ).join("");
    host.querySelector("#editAssignHint").textContent = repeat
      ? assignees.length > 1
        ? `🔄 Skiftes: ${assignees.join(" → ")}`
        : admin
          ? "Tip: vælg flere personer, så skiftes de"
          : ""
      : "";

    host.querySelectorAll("[data-repeat]").forEach((el) => {
      el.onclick = () => {
        const val = el.dataset.repeat;
        repeat = val === "null" ? null : val;
        // Collapsing a rotation: a kid keeps the task themselves, never hands
        // it to whoever happens to be first in the rotation list.
        if (!repeat && assignees.length > 1)
          assignees = [admin ? assignees[0] : currentUser.name];
        drawChips();
      };
    });
    host.querySelectorAll("[data-points]").forEach((el) => {
      el.onclick = () => {
        const val = el.dataset.points;
        points = val === "null" ? null : Number(val);
        drawChips();
      };
    });
    if (admin) {
      host.querySelectorAll("[data-assign]").forEach((el) => {
        el.onclick = () => {
          const name = el.dataset.assign;
          if (!repeat) {
            assignees = [name];
          } else if (assignees.includes(name)) {
            if (assignees.length > 1) assignees = assignees.filter((n) => n !== name);
          } else {
            assignees = [...assignees, name];
          }
          drawChips();
        };
      });
    }
  }

  host.querySelectorAll("[data-close]").forEach((el) => (el.onclick = close));
  host.querySelector(".modal-wrap").onclick = (e) => {
    if (e.target === e.currentTarget) close();
  };

  host.querySelector("#editSave").onclick = async () => {
    if (busy) return;
    const label = host.querySelector("#editLabel").value.trim();
    if (!label) return alert("Opgaven skal have en tekst.");
    const emoji = host.querySelector("#editEmoji").value.trim();
    const money = Number(host.querySelector("#editMoneyInput").value) || null;
    // Same anchoring rule as the add sheet: repeats and alarms need a date.
    const needsAnchor = repeat || (alarm && time);
    const finalDue = needsAnchor && !due ? ymd(new Date()) : due || null;
    const rotation = repeat && assignees.length > 1 ? [...assignees] : null;
    busy = true;
    const saveBtn = host.querySelector("#editSave");
    saveBtn.textContent = "…";
    try {
      await updateDoc(doc(tasksCol, t.id), {
        label,
        emoji: emoji || null,
        assignedTo: assignees.includes(t.assignedTo) ? t.assignedTo : assignees[0],
        due: finalDue,
        time: time || null,
        alarm: !!(alarm && time),
        repeat: repeat,
        rotation: rotation || deleteField(),
        points: points || deleteField(),
        money: money || deleteField(),
      });
      close();
    } catch (e) {
      console.error("Saving task failed:", e);
      busy = false;
      saveBtn.textContent = "Gem";
      alert("Kunne ikke gemme ændringerne. Er du online?");
    }
  };

  // No autofocus, same as the add sheet — don't pop the mobile keyboard.
  drawAlarm();
  drawChips();
}

// Admin-only: reset another member's PIN. They pick a new one at next login.
function openResetPanel() {
  let host = document.getElementById("pinReset");
  if (!host) {
    host = document.createElement("div");
    host.id = "pinReset";
    document.body.appendChild(host);
  }
  const others = MEMBERS.filter((m) => m.name !== currentUser.name);
  const status = {}; // name -> "busy" | "done"

  function close() {
    host.remove();
  }

  async function doReset(name) {
    if (!confirm(`Nulstil PIN for ${name}? De vælger en ny ved næste login.`)) return;
    status[name] = "busy";
    draw();
    try {
      await resetPin(name);
      status[name] = "done";
    } catch (e) {
      console.error("PIN reset failed:", e);
      delete status[name];
      alert("Kunne ikke nulstille PIN. Er du online?");
    }
    draw();
  }

  function draw() {
    host.innerHTML = `
      <div class="modal-wrap">
        <div class="modal-card">
          <div class="modal-head">
            <h2 class="modal-title">Nulstil PIN-kode</h2>
            <button class="modal-close" data-close="1">✕</button>
          </div>
          <p class="modal-sub">Vælg hvem der skal vælge en ny PIN ved næste login.</p>
          <div class="reset-list">
            ${others
              .map((m) => {
                const st = status[m.name];
                const right =
                  st === "done"
                    ? `<span class="reset-done">Nulstillet ✓</span>`
                    : `<button class="reset-btn" data-reset="${m.name}" ${st === "busy" ? "disabled" : ""}>${st === "busy" ? "…" : "Nulstil"}</button>`;
                return `
                  <div class="reset-row">
                    <span class="reset-name">
                      <span class="user-dot" style="background:${colorFor(m.name)}"></span>${m.name}
                    </span>
                    ${right}
                  </div>`;
              })
              .join("")}
          </div>
          <p class="modal-note">Adgangen bevares — personen bliver blot bedt om at vælge en ny PIN næste gang.</p>
        </div>
      </div>`;

    host.querySelector("[data-close]").onclick = close;
    host.querySelectorAll("[data-reset]").forEach((el) => {
      el.onclick = () => doReset(el.dataset.reset);
    });
  }

  draw();
}

// Get an anonymous Firebase auth token before any Firestore access (the login
// flow reads Firestore to check PINs, so this must come first).
try {
  await authReady;
} catch (e) {
  app.innerHTML = `<div class="error-banner">Kunne ikke forbinde sikkert til serveren. Genindlæs siden, eller tjek at Anonymous Authentication er slået til i Firebase.</div>`;
  throw e;
}

// Gate the app behind the family login before subscribing to data.
currentUser = await ensureAuth();

// Live per-member looks (kid mode's "Vælg dit look"): colors and faces update
// on every device the moment a kid changes theirs.
onSnapshot(
  membersCol,
  (snap) => {
    looks = {};
    snap.forEach((d) => (looks[d.id] = d.data()));
    updateWithTransition();
  },
  (err) => console.warn("Members sync error:", err)
);

// Real-time listener — every connected device updates instantly.
const q = query(tasksCol, orderBy("ts", "desc"));
onSnapshot(
  q,
  (snapshot) => {
    tasks = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    connected = true;
    updateWithTransition();
    scheduleReminders();
  },
  (err) => {
    console.error("Firestore sync error:", err);
    connected = false;
    updateWithTransition();
  }
);

render();
subscribeCompletions();
scheduleMidnightRefresh();
