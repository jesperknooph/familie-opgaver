import { db, authReady } from "./firebase-config.js";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { MEMBERS, ensureAuth, signOut, isAdmin, resetPin } from "./auth.js";
import { TASK_TEMPLATES } from "./templates.js";

const DAY_NAMES = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"];
const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

const tasksCol = collection(db, "tasks");

let tasks = [];
let filter = "alle";
let currentUser = null;
let newAssigned = null;
let newEmoji = "";
let newDue = "";
let showTemplates = false;
let view = "liste"; // "liste" | "uge"
let weekOffset = 0; // 0 = denne uge
let connected = false;

const app = document.getElementById("app");

function colorFor(name) {
  return MEMBERS.find((m) => m.name === name)?.color || "#8A8296";
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
  return `
    <div class="task-row ${t.done ? "done" : ""}" style="border-left-color:${colorFor(t.assignedTo)}; view-transition-name: task-${t.id};">
      <button class="check-button" data-toggle="${t.id}">
        ${t.done ? icon("check", colorFor(t.assignedTo)) : icon("circle", "#D6CFE0")}
      </button>
      ${emojiTile}
      <div class="task-body">
        <span class="task-label ${t.done ? "done" : ""}">${escapeHtml(t.label)}</span>
        <span class="task-assignee" style="color:${colorFor(t.assignedTo)}">${t.assignedTo}</span>
      </div>
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
          ? `<div class="empty">Ingen opgaver her.</div>`
          : visible.map(taskRow).join("")
      }
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
      .sort((a, b) => Number(a.done) - Number(b.done) || (b.ts || 0) - (a.ts || 0));
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
      <button class="view-btn" data-view="liste">Liste</button>
      <button class="view-btn" data-view="uge">Uge</button>
    </div>

    <section class="avatar-row" id="avatarRow"></section>

    <section class="add-card" id="addCard">
      <div class="label-row">
        <span class="add-emoji" id="addEmoji"></span>
        <input class="input" id="newLabel" placeholder="Ny opgave …" />
      </div>
      <button class="template-toggle" id="templateToggle"></button>
      <div class="template-gallery" id="templateGallery"></div>
      <div class="add-meta">
        <span class="date-field-label">Forfald</span>
        <input type="date" class="date-input" id="newDue" />
        <span id="dateClearContainer"></span>
      </div>
      <div class="add-row2">
        <div class="assign-row" id="assignRow"></div>
        <button class="add-button" id="addBtn">${icon("plus", "#fff", 16)}</button>
      </div>
    </section>

    <div id="list-container"></div>
    <div id="footer-container"></div>
  `;

  // Attach shell-level handlers (only once)
  document.getElementById("addBtn").onclick = addTask;
  document.getElementById("newLabel").onkeydown = (e) => {
    if (e.key === "Enter") addTask();
  };
  document.getElementById("newDue").onchange = (e) => {
    newDue = e.target.value;
    updateDateClearButton();
  };
  document.getElementById("templateToggle").onclick = () => {
    showTemplates = !showTemplates;
    renderTemplateGallery();
  };

  document.querySelectorAll("[data-view]").forEach((el) => {
    el.onclick = () => {
      view = el.dataset.view;
      updateWithTransition();
    };
  });
}

function updateDateClearButton() {
  const container = document.getElementById("dateClearContainer");
  if (!container) return;
  if (newDue) {
    container.innerHTML = `<button class="date-clear" id="clearDue">ryd</button>`;
    document.getElementById("clearDue").onclick = () => {
      newDue = "";
      document.getElementById("newDue").value = "";
      updateDateClearButton();
    };
  } else {
    container.innerHTML = "";
  }
}

// Reflects the chosen template's emoji next to the new-task input.
function updateEmojiIndicator() {
  const el = document.getElementById("addEmoji");
  if (!el) return;
  el.textContent = newEmoji;
  el.classList.toggle("show", !!newEmoji);
}

// The tap-to-add gallery of preset tasks. Picking one fills the form (label +
// emoji) and keeps the chosen person, so a parent just confirms who and when.
function renderTemplateGallery() {
  const toggle = document.getElementById("templateToggle");
  if (toggle) {
    toggle.innerHTML = `📋 Skabeloner ${showTemplates ? "▴" : "▾"}`;
    toggle.classList.toggle("open", showTemplates);
  }
  const gallery = document.getElementById("templateGallery");
  if (!gallery) return;
  if (!showTemplates) {
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
      newEmoji = tpl.emoji;
      const input = document.getElementById("newLabel");
      input.value = tpl.label;
      updateEmojiIndicator();
      input.focus();
    };
  });
}

function render() {
  if (!document.getElementById("addCard")) {
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
        ${isAdmin(currentUser) ? `<button class="admin-btn" id="resetPinBtn">Nulstil PIN</button>` : ""}
        <button class="logout-btn" id="logoutBtn">Log ud</button>
      </span>
    `;
    document.getElementById("logoutBtn").onclick = signOut;
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
  const counts = MEMBERS.reduce((acc, m) => {
    acc[m.name] = tasks.filter((t) => t.assignedTo === m.name && !t.done).length;
    return acc;
  }, {});

  const avatarRow = document.getElementById("avatarRow");
  if (avatarRow) {
    avatarRow.innerHTML = MEMBERS.map(
      (m) => `
      <button class="avatar ${filter === m.name ? "active" : ""}" data-filter="${m.name}"
        style="border-color:${m.color}; background:${filter === m.name ? m.color : "#fff"}; view-transition-name: avatar-${m.name};">
        <span class="avatar-initial" style="color:${filter === m.name ? "#fff" : m.color}">${m.name[0]}</span>
        <span class="avatar-badge" style="background:${filter === m.name ? "#fff" : m.color}; color:${filter === m.name ? m.color : "#fff"};">${counts[m.name]}</span>
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

  // Update assign-chips
  const assignRow = document.getElementById("assignRow");
  if (assignRow) {
    assignRow.innerHTML = MEMBERS.map(
      (m) => `<button class="assign-chip ${newAssigned === m.name ? "active" : ""}" data-assign="${m.name}"
        style="background:${newAssigned === m.name ? m.color : "#F6F3EC"}">${m.name}</button>`
    ).join("");

    document.querySelectorAll("[data-assign]").forEach((el) => {
      el.onclick = () => {
        newAssigned = el.dataset.assign;
        render();
        document.getElementById("newLabel").focus();
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
    } else {
      listContainer.innerHTML = listSection(listVisible);
    }
  }

  // Sync date input values without resetting them
  const dateInput = document.getElementById("newDue");
  if (dateInput && dateInput.value !== newDue) {
    dateInput.value = newDue;
  }
  updateDateClearButton();
  updateEmojiIndicator();
  renderTemplateGallery();

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
    el.onclick = () => toggleDone(el.dataset.toggle);
  });
  document.querySelectorAll("[data-delete]").forEach((el) => {
    el.onclick = () => removeTask(el.dataset.delete);
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

async function addTask() {
  const input = document.getElementById("newLabel");
  const label = input.value.trim();
  if (!label) return;
  const id = uid();
  await setDoc(doc(tasksCol, id), {
    label,
    emoji: newEmoji || null,
    assignedTo: newAssigned,
    done: false,
    due: newDue || null,
    ts: Date.now(),
  });
  input.value = "";
  newEmoji = "";
  updateEmojiIndicator();
}

async function toggleDone(id) {
  const t = tasks.find((t) => t.id === id);
  if (!t) return;
  await setDoc(doc(tasksCol, id), {
    label: t.label,
    emoji: t.emoji || null,
    assignedTo: t.assignedTo,
    done: !t.done,
    due: t.due || null,
    ts: t.ts || Date.now(),
  });
}

async function removeTask(id) {
  await deleteDoc(doc(tasksCol, id));
}

async function clearDone() {
  if (!confirm("Fjern alle afkrydsede opgaver?")) return;
  const toRemove = tasks.filter((t) => t.done);
  await Promise.all(toRemove.map((t) => deleteDoc(doc(tasksCol, t.id))));
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
                      <span class="user-dot" style="background:${m.color}"></span>${m.name}
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
newAssigned = currentUser.name;

// Real-time listener — every connected device updates instantly.
const q = query(tasksCol, orderBy("ts", "desc"));
onSnapshot(
  q,
  (snapshot) => {
    tasks = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    connected = true;
    updateWithTransition();
  },
  (err) => {
    console.error("Firestore sync error:", err);
    connected = false;
    updateWithTransition();
  }
);

render();
