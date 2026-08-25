import { doc, setDoc, updateDoc, deleteDoc, deleteField, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { state } from "./state.js";
import {
  escapeHtml,
  icon,
  colorFor,
  faceFor,
  ymd,
  parseYmd,
  addDays,
  startOfWeek,
  nextInRotation,
  byTimeThenRecent,
  isoWeek,
  uid,
  DAY_NAMES,
  MONTHS,
} from "./utils.js";
import { MEMBERS, isAdmin, resetPin, signOut } from "./auth.js";
import { TASK_TEMPLATES } from "./templates.js";
import {
  confettiBurst,
  toggleTheme,
  updateWithTransition,
  openSheet,
  fieldError,
  skeletonRows,
} from "./ui-common.js";
import {
  tasksCol,
  completionsCol,
  payoutsCol,
  toggleDone,
  removeTask,
  clearDone,
  showToast,
} from "./db-service.js";
import {
  roving,
  taskGrid,
  keepFocus,
  setShortcuts,
  openShortcutSheet,
  hasKeyboard,
} from "./keyboard.js";

export function renderParentMode() {
  if (!document.getElementById("openAdd")) {
    renderShell();
  }

  // Update sync status
  const syncStatus = document.getElementById("syncStatus");
  if (syncStatus) {
    // Offline wins over `connected`: Firestore keeps answering from its cache
    // with no network, so claiming "synkroniseret" there would be a lie.
    const ok = state.connected && state.online;
    syncStatus.title = !state.online ? "Offline — ændringer sendes når du er online igen"
      : state.connected ? "Forbundet" : "Forbinder...";
    syncStatus.innerHTML = `
      <span class="sync-dot ${ok ? "" : "pulse"}"></span>
      <span class="sync-text">${!state.online ? "offline" : state.connected ? "synkroniseret" : "forbinder"}</span>
    `;
  }

  // Update counts
  const openCount = state.tasks.filter((t) => !t.done).length;
  const doneCount = state.tasks.length - openCount;
  const countsElement = document.getElementById("taskCounts");
  if (countsElement) {
    countsElement.textContent = !state.loaded && state.tasks.length === 0
      ? "Henter opgaver …"
      : openCount === 0
        ? "Alt er gjort."
        : `${openCount} tilbage · ${doneCount} klaret`;
  }

  // Update user bar
  const userBar = document.getElementById("userBar");
  if (userBar) {
    const weekMoneyAll = state.completions.reduce((s, c) => s + (c.money || 0), 0);
    const totalEarnedPast = state.allowEarnedPast ? Object.values(state.allowEarnedPast).reduce((a, b) => a + b, 0) : 0;
    const totalPaidOut = state.allowPaidOut ? Object.values(state.allowPaidOut).reduce((a, b) => a + b, 0) : 0;
    const famBalance =
      state.allowEarnedPast !== null && state.allowPaidOut !== null
        ? totalEarnedPast + weekMoneyAll - totalPaidOut
        : null;
    const balanceBit = famBalance > 0 ? ` · ${famBalance} kr` : "";
    
    userBar.innerHTML = `
      <span class="user-me">
        <span class="user-dot" style="background:${colorFor(state.currentUser.name)}"></span>
        Logget ind som <strong>${state.currentUser.name}</strong>
      </span>
      <span class="user-actions">
        <button class="admin-btn" id="payoutBtn">💰 Lommepenge${balanceBit}</button>
        <button class="theme-btn" id="settingsBtn" title="Indstillinger" aria-label="Indstillinger">⚙️</button>
      </span>
    `;
    document.getElementById("payoutBtn").onclick = openPayoutSheet;
    document.getElementById("settingsBtn").onclick = openSettingsSheet;
  }

  // Update view toggle active classes. aria-pressed carries the same fact to
  // screen readers that the colour carries to everyone else.
  document.querySelectorAll("[data-view]").forEach((el) => {
    const on = el.dataset.view === state.view;
    el.classList.toggle("active", on);
    el.setAttribute("aria-pressed", on ? "true" : "false");
  });
  roving(document.getElementById("viewToggle"), "[data-view]");

  // Update avatar-row counts & filter status
  const avatarRow = document.getElementById("avatarRow");
  if (avatarRow) {
    const counts = MEMBERS.reduce((acc, m) => {
      acc[m.name] = state.tasks.filter((t) => t.assignedTo === m.name && !t.done).length;
      return acc;
    }, {});
    avatarRow.innerHTML = MEMBERS.map(
      (m) => {
        const faceHtml = faceFor(m.name);
        return `
        <button class="avatar ${state.filter === m.name ? "active" : ""}" data-filter="${m.name}"
          aria-pressed="${state.filter === m.name}"
          aria-label="Vis kun ${m.name}s opgaver (${counts[m.name]} tilbage)"
          style="border-color:${colorFor(m.name)}; background:${state.filter === m.name ? colorFor(m.name) : "var(--card-bg)"}; view-transition-name: avatar-${m.name};">
          <span class="avatar-initial" style="color:${state.filter === m.name ? "#fff" : colorFor(m.name)}">${faceHtml}</span>
          <span class="avatar-badge" style="background:${state.filter === m.name ? "#fff" : colorFor(m.name)}; color:${state.filter === m.name ? colorFor(m.name) : "#fff"};">${counts[m.name]}</span>
        </button>`;
      }
    ).join("");

    document.querySelectorAll("[data-filter]").forEach((el) => {
      el.onclick = () => {
        const name = el.dataset.filter;
        state.filter = state.filter === name ? "alle" : name;
        updateWithTransition();
      };
    });
    roving(avatarRow, "[data-filter]");
  }

  // Update list-container (Liste or Uge or I dag)
  const visible = state.tasks.filter((t) => (state.filter === "alle" ? true : t.assignedTo === state.filter));
  const listVisible = visible
    .slice()
    .sort((a, b) => Number(a.done) - Number(b.done) || (b.ts || 0) - (a.ts || 0));

  const listContainer = document.getElementById("list-container");
  if (listContainer) {
    if (state.view === "uge") {
      listContainer.innerHTML = weekSection(visible);
    } else if (state.view === "idag") {
      listContainer.innerHTML = todaySection(visible);
    } else {
      listContainer.innerHTML = listSection(listVisible);
    }
  }

  renderEarnings();

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
      ${
        hasKeyboard()
          ? `<p class="footer-note kbd-hint">Tryk <kbd class="kbd">?</kbd> for tastaturgenveje</p>`
          : ""
      }
    `;
  }

  // Attach dynamic handlers
  const clearFilterEl = document.getElementById("clearFilter");
  if (clearFilterEl) clearFilterEl.onclick = () => { state.filter = "alle"; updateWithTransition(); };

  document.querySelectorAll("[data-toggle]").forEach((el) => {
    el.onclick = () => {
      const t = state.tasks.find((x) => x.id === el.dataset.toggle);
      if (t && !t.done) confettiBurst(el, colorFor(t.assignedTo));
      toggleDone(el.dataset.toggle);
    };
  });
  document.querySelectorAll("[data-delete]").forEach((el) => {
    el.onclick = () => removeTask(el.dataset.delete);
  });
  document.querySelectorAll("[data-edit]").forEach((el) => {
    el.onclick = () => {
      const t = state.tasks.find((x) => x.id === el.dataset.edit);
      if (t) openEditSheet(t);
    };
  });
  document.querySelectorAll("[data-week]").forEach((el) => {
    el.onclick = () => {
      state.weekOffset += Number(el.dataset.week);
      updateWithTransition();
    };
  });
  const weekTodayEl = document.getElementById("weekToday");
  if (weekTodayEl) weekTodayEl.onclick = () => { state.weekOffset = 0; updateWithTransition(); };

  const clearDoneEl = document.getElementById("clearDone");
  if (clearDoneEl) clearDoneEl.onclick = clearDone;

  // The whole task list is one tab stop with the arrows moving inside it — see
  // taskGrid() in keyboard.js. Re-applied here because the rows are new nodes
  // after every render.
  taskGrid(listContainer);
}

function renderShell() {
  const appContainer = document.getElementById("app");
  appContainer.innerHTML = `
    <a class="skip-link" href="#list-container">Spring til opgaverne</a>
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

    <section class="earnings-row" id="earningsRow"></section>

    <button class="add-trigger" id="openAdd">
      <span class="add-trigger-plus">${icon("plus", "#fff", 16)}</span>
      <span class="add-trigger-text">Ny opgave …</span>
    </button>

    <div id="list-container" tabindex="-1"></div>
    <div id="footer-container"></div>
  `;

  document.getElementById("openAdd").onclick = openAddSheet;

  document.querySelectorAll("[data-view]").forEach((el) => {
    el.onclick = () => {
      state.view = el.dataset.view;
      updateWithTransition();
    };
  });

  registerParentShortcuts();
}

/* Everything a parent does often, one key away. Registered once with the shell;
   the dispatcher in keyboard.js handles the guards (no shortcuts while typing,
   or while a sheet is open). */
function registerParentShortcuts() {
  const setView = (view) => {
    state.view = view;
    updateWithTransition();
  };

  setShortcuts([
    { keys: ["n", "N"], showKeys: ["n"], label: "Ny opgave", group: "Handlinger", run: openAddSheet },
    {
      keys: ["p", "P"],
      showKeys: ["p"],
      label: "Lommepenge",
      group: "Handlinger",
      run: openPayoutSheet,
    },
    {
      keys: ["i", "I"],
      showKeys: ["i"],
      label: "Indstillinger",
      group: "Handlinger",
      run: openSettingsSheet,
    },
    {
      keys: ["m", "M"],
      showKeys: ["m"],
      label: "Lys / mørk",
      group: "Handlinger",
      run: toggleTheme,
    },
    { keys: ["1"], label: "I dag", group: "Visning", run: () => setView("idag") },
    { keys: ["2"], label: "Liste", group: "Visning", run: () => setView("liste") },
    { keys: ["3"], label: "Uge", group: "Visning", run: () => setView("uge") },
    {
      keys: ["t", "T"],
      showKeys: ["t"],
      label: "Tilbage til i dag / denne uge",
      group: "Visning",
      run: () => {
        state.weekOffset = 0;
        setView("idag");
      },
    },
    {
      keys: ["ArrowLeft"],
      label: "Forrige uge",
      group: "Visning",
      when: () => state.view === "uge",
      run: () => {
        state.weekOffset -= 1;
        updateWithTransition();
      },
    },
    {
      keys: ["ArrowRight"],
      label: "Næste uge",
      group: "Visning",
      when: () => state.view === "uge",
      run: () => {
        state.weekOffset += 1;
        updateWithTransition();
      },
    },
    {
      keys: ["f", "F"],
      showKeys: ["f"],
      label: "Skift person-filter",
      group: "Filter",
      run: () => {
        const names = ["alle", ...MEMBERS.map((m) => m.name)];
        const i = names.indexOf(state.filter);
        state.filter = names[(i + 1) % names.length];
        updateWithTransition();
      },
    },
    {
      keys: ["a", "A", "Escape"],
      showKeys: ["a", "Escape"],
      label: "Vis alle igen",
      group: "Filter",
      run: () => {
        if (state.filter === "alle") return;
        state.filter = "alle";
        updateWithTransition();
      },
    },
    {
      keys: ["j", "k"],
      showKeys: ["j", "k"],
      label: "Hop ned i opgavelisten",
      group: "I listen",
      run: () => {
        const start =
          document.querySelector('#list-container .task-body[tabindex="0"]') ||
          document.querySelector("#list-container .task-body");
        start?.focus();
      },
    },

    // Rows below have no run(): taskGrid() owns these keys once focus is in the
    // list. They're listed so the cheat sheet tells the whole story.
    { keys: ["ArrowUp", "ArrowDown"], label: "Forrige / næste opgave", group: "I listen" },
    { keys: ["ArrowLeft", "ArrowRight"], label: "Afkryds ↔ opgave ↔ slet", group: "I listen" },
    { keys: ["Enter"], label: "Ret opgaven", group: "I listen" },
    { keys: ["x"], label: "Kryds af / fortryd", group: "I listen" },
    { keys: ["Delete"], label: "Slet opgaven", group: "I listen" },

    { keys: ["?"], label: "Denne oversigt", group: "Hjælp", run: openShortcutSheet },
    { keys: ["Escape"], label: "Luk et vindue", group: "Hjælp" },
  ]);
}

export function renderEarnings() {
  const row = document.getElementById("earningsRow");
  if (!row) return;
  const moneyInUse =
    state.tasks.some((t) => t.money) || state.completions.some((c) => c.money);
  const weekMoney = {};
  MEMBERS.forEach((m) => {
    weekMoney[m.name] = 0;
  });
  state.completions.forEach((c) => {
    if (c.name in weekMoney) {
      weekMoney[c.name] += c.money || 0;
    }
  });
  const shown = MEMBERS.filter((m) => weekMoney[m.name] > 0);
  if (!moneyInUse || shown.length === 0) {
    row.innerHTML = "";
    row.classList.remove("show");
    return;
  }
  row.classList.add("show");
  row.innerHTML =
    `<span class="earnings-label">💰 Denne uge</span>` +
    shown.map((m) => {
      const kr = `<span class="earnings-money">${weekMoney[m.name]} kr</span>`;
      return `<span class="earnings-chip" style="color:${colorFor(m.name)}">${m.name} ${kr}</span>`;
    }).join("");
}

export function taskRow(t) {
  const emojiTile = t.emoji
    ? `<span class="task-emoji" style="background:${colorFor(t.assignedTo)}1A">${escapeHtml(t.emoji)}</span>`
    : "";
  const rotationBit =
    t.rotation && t.rotation.length > 1
      ? `<span class="task-repeat">🔄 ${escapeHtml(nextInRotation(t))} er næste</span>`
      : "";
  return `
    <div class="task-row ${t.done ? "done" : ""}" style="border-left-color:${colorFor(t.assignedTo)}; view-transition-name: task-${t.id};">
      <button class="check-button" data-toggle="${t.id}" aria-label="${t.done ? "Fjern flueben" : "Kryds af"}">
        ${t.done ? icon("check", colorFor(t.assignedTo)) : icon("circle", "#D6CFE0")}
      </button>
      ${emojiTile}
      <button class="task-body" data-edit="${t.id}" title="Tryk for at rette" aria-label="Ret ${escapeHtml(t.label)}">
        <span class="task-label ${t.done ? "done" : ""}">${escapeHtml(t.label)}</span>
        <span class="task-assignee" style="color:${colorFor(t.assignedTo)}">${t.assignedTo}${
          t.repeat ? `<span class="task-repeat">🔁 ${state.REPEAT_LABELS[t.repeat] || ""}</span>` : ""
        }${rotationBit}</span>
      </button>
      ${t.money ? `<span class="task-money">💰 ${t.money} kr</span>` : ""}
      ${t.time ? `<span class="task-time ${t.alarm ? "has-alarm" : ""}">${t.alarm ? "🔔" : "🕐"} ${t.time}</span>` : ""}
      <button class="delete-button" data-delete="${t.id}" aria-label="Slet opgave">${icon("trash", "#D6CFE0", 14)}</button>
    </div>`;
}

export function listSection(visible) {
  return `
    <section class="list">
      ${
        state.filter !== "alle"
          ? `<div class="filter-note">${state.filter} · <button class="filter-clear" id="clearFilter">vis alle</button></div>`
          : ""
      }
      ${
        visible.length === 0
          ? state.loaded
            ? `<div class="empty"><span class="empty-emoji">🌈</span>Ingen opgaver her.</div>`
            : skeletonRows()
          : visible.map(taskRow).join("")
      }
    </section>`;
}

export function todaySection(visible) {
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

  const totalCount = overdue.length + dueToday.length + noDate.length;
  const doneCount = totalCount - todoCount;
  const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

  return `
    <section class="today">
      <div class="today-head">
        <span class="today-day">${dateLabel}</span>
        <span class="today-count">${
          !state.loaded && totalCount === 0
            ? "henter …"
            : todoCount === 0
              ? "alt klaret 🎉"
              : `${todoCount} at gøre`
        }</span>
      </div>

      ${
        totalCount
          ? `<div class="today-progress ${pct === 100 ? "complete" : ""}">
              <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
              <span class="progress-count">${pct === 100 ? "🏆" : "✅"} ${doneCount}/${totalCount}</span>
            </div>`
          : ""
      }

      ${
        state.filter !== "alle"
          ? `<div class="filter-note">${state.filter} · <button class="filter-clear" id="clearFilter">vis alle</button></div>`
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

      ${nothing ? (state.loaded ? `<div class="empty"><span class="empty-emoji">🎈</span>Ingen opgaver i dag – fri leg!</div>` : skeletonRows()) : ""}
    </section>`;
}

export function weekSection(visible) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = ymd(today);
  const start = startOfWeek(addDays(today, state.weekOffset * 7));
  const end = addDays(start, 6);

  const overdue = state.weekOffset === 0
    ? visible.filter((t) => t.due && t.due < todayStr && !t.done)
    : [];
  const noDate = state.weekOffset === 0 ? visible.filter((t) => !t.due) : [];

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
        <button class="week-nav-btn" data-week="-1" aria-label="Forrige uge">${icon("chevL", "#6B6478", 18)}</button>
        <button class="week-title" id="weekToday">
          <span class="week-num">Uge ${isoWeek(start)}</span>
          <span class="week-range">${rangeLabel}${state.weekOffset !== 0 ? " · tilbage til i dag" : ""}</span>
        </button>
        <button class="week-nav-btn" data-week="1" aria-label="Næste uge">${icon("chevR", "#6B6478", 18)}</button>
      </div>

      ${
        state.filter !== "alle"
          ? `<div class="filter-note">${state.filter} · <button class="filter-clear" id="clearFilter">vis alle</button></div>`
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

export function openAddSheet() {
  const { host, mount, close } = openSheet("addSheet");

  let due = "";
  let time = "";
  let alarm = false;
  let repeat = null;
  let assignees = [state.currentUser.name];
  let showTpl = false;
  let busy = false;

  mount(`
      <div class="modal-card edit-card">
        <div class="modal-head">
          <h2 class="modal-title">Ny opgave</h2>
          <button class="modal-close" data-close="1" aria-label="Luk">✕</button>
        </div>

        <button class="template-toggle" id="addTplToggle"></button>
        <div class="template-gallery" id="addTplGallery"></div>

        <div class="label-row edit-label-row">
          <input class="input edit-emoji-input" id="addEmoji" maxlength="16" placeholder="Ikon" />
          <input class="input" id="addLabel" placeholder="Hvad skal der gøres?" />
        </div>

        <div class="add-meta">
          <span class="meta-group">
            <span class="date-field-label">Forfald</span>
            <input type="date" class="date-input" id="addDue" />
          </span>
          <span class="meta-group">
            <span class="date-field-label">Kl.</span>
            <input type="time" class="date-input time-input" id="addTime" />
          </span>
          <button class="alarm-toggle" id="addAlarm"></button>
        </div>

        <div class="repeat-row" id="addRepeatRow"></div>
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
      </div>`);

  const dueInput = host.querySelector("#addDue");
  const timeInput = host.querySelector("#addTime");
  dueInput.onchange = () => { due = dueInput.value; };
  timeInput.onchange = () => { time = timeInput.value; drawAlarm(); };

  function drawTemplates(focusGallery = false) {
    const toggle = host.querySelector("#addTplToggle");
    toggle.innerHTML = `📋 Skabeloner ${showTpl ? "▴" : "▾"}`;
    toggle.classList.toggle("open", showTpl);
    toggle.setAttribute("aria-expanded", showTpl ? "true" : "false");
    toggle.onclick = () => {
      showTpl = !showTpl;
      drawTemplates(showTpl);
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
        host.querySelector("#addMoneyInput").value = tpl.money || "";
        drawChips();
        showTpl = false;
        drawTemplates();
        // The template filled the fields in; the next thing anyone does is
        // adjust the text, so put the caret there rather than back on a
        // gallery that just closed.
        host.querySelector("#addLabel").focus();
      };
    });
    // 30-odd chips would otherwise be 30 tab stops between the toggle and the
    // text field. One stop, arrows to move — and opening the gallery from the
    // keyboard jumps straight into it.
    roving(gallery, "[data-template]", { grid: true });
    if (focusGallery) gallery.querySelector('[data-template][tabindex="0"]')?.focus();
  }

  function drawAlarm() {
    const btn = host.querySelector("#addAlarm");
    const supported = "Notification" in window;
    btn.classList.toggle("active", alarm);
    btn.classList.toggle("disabled", !supported);
    btn.textContent = alarm ? "🔔 Alarm til" : "🔔 Alarm";
    btn.onclick = async () => {
      if (!supported) return showToast("Denne enhed understøtter ikke notifikationer.");
      if (alarm) { alarm = false; return drawAlarm(); }
      if (Notification.permission === "denied")
        return showToast("Notifikationer er blokeret. Tillad dem i browserens indstillinger for siden.");
      if (Notification.permission === "default") {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") return;
      }
      alarm = true;
      drawAlarm();
    };
  }

  // Redrawing replaces the chip that was just pressed, which on a keyboard means
  // focus falls to nowhere — keepFocus puts it back on the new copy.
  function drawChips() {
    keepFocus(paintChips);
  }

  function paintChips() {
    host.querySelector("#addRepeatRow").innerHTML = `
      <span class="repeat-row-label">Gentag</span>
      <div class="repeat-chips">
        ${state.REPEAT_OPTIONS.map(
          (o) => `<button class="repeat-chip ${repeat === o.id ? "active" : ""}" data-repeat="${o.id}" aria-pressed="${repeat === o.id}">${o.label}</button>`
        ).join("")}
      </div>`;

    const admin = isAdmin(state.currentUser);
    const assignable = admin ? MEMBERS : MEMBERS.filter((m) => m.name === state.currentUser.name);
    host.querySelector("#addAssignRow").innerHTML = assignable.map(
      (m) => `<button class="assign-chip ${assignees.includes(m.name) ? "active" : ""}" data-assign="${m.name}"
        aria-pressed="${assignees.includes(m.name)}"
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
        if (!repeat && assignees.length > 1) assignees = [assignees[0]];
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

    roving(host.querySelector("#addRepeatRow"), "[data-repeat]");
    roving(host.querySelector("#addAssignRow"), "[data-assign]");
  }

  async function save() {
    if (busy) return;
    const labelInput = host.querySelector("#addLabel");
    const label = labelInput.value.trim();
    if (!label) return fieldError(labelInput, "Opgaven skal have en tekst.");
    const emoji = host.querySelector("#addEmoji").value.trim();
    const money = Number(host.querySelector("#addMoneyInput").value) || null;
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
    if (repeat && assignees.length > 1) data.rotation = [...assignees];
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
      showToast("Kunne ikke gemme opgaven. Er du online?");
    }
  }

  host.querySelector("#addSave").onclick = save;
  host.querySelector("#addLabel").onkeydown = (e) => {
    if (e.key === "Enter") save();
  };

  drawTemplates();
  drawAlarm();
  drawChips();

  // openSheet deliberately doesn't focus a field — on a phone that throws the
  // on-screen keyboard over the sheet. With a real keyboard the opposite is
  // true: "n", type, Enter should add a task without touching the mouse.
  if (hasKeyboard()) host.querySelector("#addLabel").focus();
}

export function openEditSheet(t) {
  const { host, mount, close } = openSheet("editSheet");

  let due = t.due || "";
  let time = t.time || "";
  let alarm = !!t.alarm;
  let repeat = t.repeat || null;
  let assignees = t.rotation && t.rotation.length > 1 ? [...t.rotation] : [t.assignedTo];
  let busy = false;

  mount(`
      <div class="modal-card edit-card">
        <div class="modal-head">
          <h2 class="modal-title">Ret opgave</h2>
          <button class="modal-close" data-close="1" aria-label="Luk">✕</button>
        </div>

        <div class="label-row edit-label-row">
          <input class="input edit-emoji-input" id="editEmoji" maxlength="16" placeholder="Ikon" value="${escapeHtml(t.emoji || "")}" />
          <input class="input" id="editLabel" value="${escapeHtml(t.label)}" />
        </div>

        <div class="add-meta">
          <span class="meta-group">
            <span class="date-field-label">Forfald</span>
            <input type="date" class="date-input" id="editDue" value="${due}" />
          </span>
          <span class="meta-group">
            <span class="date-field-label">Kl.</span>
            <input type="time" class="date-input time-input" id="editTime" value="${time}" />
          </span>
          <button class="alarm-toggle" id="editAlarm"></button>
        </div>

        <div class="repeat-row" id="editRepeatRow"></div>
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
      </div>`);

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
      if (!supported) return showToast("Denne enhed understøtter ikke notifikationer.");
      if (alarm) { alarm = false; return drawAlarm(); }
      if (Notification.permission === "denied")
        return showToast("Notifikationer er blokeret. Tillad dem i browserens indstillinger for siden.");
      if (Notification.permission === "default") {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") return;
      }
      alarm = true;
      drawAlarm();
    };
  }

  function drawChips() {
    keepFocus(paintChips);
  }

  function paintChips() {
    host.querySelector("#editRepeatRow").innerHTML = `
      <span class="repeat-row-label">Gentag</span>
      <div class="repeat-chips">
        ${state.REPEAT_OPTIONS.map(
          (o) => `<button class="repeat-chip ${repeat === o.id ? "active" : ""}" data-repeat="${o.id}" aria-pressed="${repeat === o.id}">${o.label}</button>`
        ).join("")}
      </div>`;

    const admin = isAdmin(state.currentUser);
    const shown = admin ? MEMBERS : MEMBERS.filter((m) => assignees.includes(m.name));
    host.querySelector("#editAssignRow").innerHTML = shown.map(
      (m) => `<button class="assign-chip ${assignees.includes(m.name) ? "active" : ""}" data-assign="${m.name}"
        aria-pressed="${assignees.includes(m.name)}"
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
        if (!repeat && assignees.length > 1)
          assignees = [admin ? assignees[0] : state.currentUser.name];
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

    roving(host.querySelector("#editRepeatRow"), "[data-repeat]");
    roving(host.querySelector("#editAssignRow"), "[data-assign]");
  }

  async function save() {
    if (busy) return;
    const labelInput = host.querySelector("#editLabel");
    const label = labelInput.value.trim();
    if (!label) return fieldError(labelInput, "Opgaven skal have en tekst.");
    const emoji = host.querySelector("#editEmoji").value.trim();
    const money = Number(host.querySelector("#editMoneyInput").value) || null;
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
        money: money || deleteField(),
      });
      close();
    } catch (e) {
      console.error("Saving task failed:", e);
      busy = false;
      saveBtn.textContent = "Gem";
      showToast("Kunne ikke gemme ændringerne. Er du online?");
    }
  }

  host.querySelector("#editSave").onclick = save;
  // Enter saves, same as in the add sheet — retitling a task shouldn't need a
  // trip to the Gem button.
  host.querySelector("#editLabel").onkeydown = (e) => {
    if (e.key === "Enter") save();
  };

  drawAlarm();
  drawChips();

  if (hasKeyboard()) {
    const labelInput = host.querySelector("#editLabel");
    labelInput.focus();
    labelInput.setSelectionRange(labelInput.value.length, labelInput.value.length);
  }
}

export function openSettingsSheet() {
  const { host, mount, close } = openSheet("settingsSheet");

  function draw() {
    keepFocus(paint);
  }

  function paint() {
    const dark = document.documentElement.classList.contains("dark");
    mount(`
        <div class="modal-card">
          <div class="modal-head">
            <h2 class="modal-title">Indstillinger</h2>
            <button class="modal-close" data-close="1" aria-label="Luk">✕</button>
          </div>
          <div class="settings-list">
            <button class="settings-row" id="setTheme">${dark ? "☀️ Skift til lyst tema" : "🌙 Skift til mørkt tema"}</button>
            <button class="settings-row" id="setResetPin">🔑 Nulstil PIN-kode</button>
            <button class="settings-row danger" id="setLogout">🚪 Log ud</button>
          </div>
        </div>`);
    host.querySelector("#setTheme").onclick = () => {
      toggleTheme();
      draw();
    };
    host.querySelector("#setResetPin").onclick = () => {
      close();
      openResetPanel();
    };
    host.querySelector("#setLogout").onclick = signOut;
  }

  draw();
}

export function openResetPanel() {
  const { host, mount } = openSheet("pinReset");
  const others = MEMBERS.filter((m) => m.name !== state.currentUser.name);
  const status = {};

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
      showToast("Kunne ikke nulstille PIN. Er du online?");
    }
    draw();
  }

  function draw() {
    keepFocus(paint);
  }

  function paint() {
    mount(`
        <div class="modal-card">
          <div class="modal-head">
            <h2 class="modal-title">Nulstil PIN-kode</h2>
            <button class="modal-close" data-close="1" aria-label="Luk">✕</button>
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
        </div>`);

    host.querySelectorAll("[data-reset]").forEach((el) => {
      el.onclick = () => doReset(el.dataset.reset);
    });
  }

  draw();
}

export async function openPayoutSheet() {
  const { host, mount } = openSheet("payoutSheet");

  let earned = {};
  let earnings = [];
  let payouts = [];
  let loading = true;
  let error = false;
  let payingFor = null;
  const histOpen = {};
  const earnOpen = {};
  const busy = {};

  async function load() {
    loading = true;
    error = false;
    draw();
    try {
      const [compSnap, paySnap] = await Promise.all([
        getDocs(query(completionsCol, where("money", ">", 0))),
        getDocs(payoutsCol),
      ]);
      earned = {};
      earnings = [];
      MEMBERS.forEach((m) => (earned[m.name] = 0));
      compSnap.forEach((d) => {
        const c = d.data();
        if (c.name in earned) {
          earned[c.name] += c.money || 0;
          earnings.push(c);
        }
      });
      payouts = paySnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.error("Loading payouts failed (are the new rules published?):", e);
      error = true;
    }
    loading = false;
    draw();
  }

  function paidFor(name) {
    return payouts
      .filter((p) => p.name === name)
      .reduce((s, p) => s + (p.amount || 0), 0);
  }

  async function pay(name, amount) {
    if (busy[name] || !(amount > 0)) return;
    busy[name] = true;
    payingFor = null;
    draw();
    try {
      await setDoc(doc(payoutsCol, uid()), {
        name,
        amount,
        date: ymd(new Date()),
        ts: Date.now(),
      });
    } catch (e) {
      console.error("Payout failed:", e);
      showToast("Kunne ikke gemme udbetalingen. Er du online?");
    }
    busy[name] = false;
    await load();
  }

  async function undo(id) {
    if (!confirm("Fjern denne udbetaling? Beløbet lægges tilbage til gode.")) return;
    try {
      await deleteDoc(doc(payoutsCol, id));
    } catch (e) {
      console.error("Undo payout failed:", e);
      showToast("Kunne ikke fjerne udbetalingen. Er du online?");
    }
    await load();
  }

  function fmtDate(ds) {
    const d = parseYmd(ds);
    return `${d.getDate()}. ${MONTHS[d.getMonth()]}`;
  }

  // Every action here re-mounts the whole sheet; keepFocus stops that from
  // dumping the keyboard user back on the dialog card each time.
  function draw() {
    keepFocus(paint);
  }

  function paint() {
    const active = MEMBERS.filter(
      (m) => (earned[m.name] || 0) > 0 || paidFor(m.name) > 0
    );

    let body;
    if (loading) {
      body = `<p class="modal-sub">Henter…</p>`;
    } else if (error) {
      body = `<p class="modal-sub">Kunne ikke hente lommepenge. Er de nye regler udgivet i Firebase?</p>`;
    } else if (active.length === 0) {
      body = `<div class="payout-empty"><span class="payout-empty-emoji">💰</span>Ingen optjente lommepenge endnu.<br>Sæt et kr-beløb på en opgave, så begynder det at tælle.</div>`;
    } else {
      body = active
        .map((m) => {
          const name = m.name;
          const e = earned[name] || 0;
          const p = paidFor(name);
          const bal = e - p;
          const hist = payouts
            .filter((x) => x.name === name)
            .sort((a, b) => (b.ts || 0) - (a.ts || 0));
          const histShown = histOpen[name] ? hist : hist.slice(0, 5);
          const histHidden = hist.length - histShown.length;
          const earns = earnings
            .filter((x) => x.name === name)
            .sort((a, b) => (b.ts || 0) - (a.ts || 0));
          const earnsShown = earnOpen[name] ? earns : earns.slice(0, 5);
          const earnsHidden = earns.length - earnsShown.length;
          const isPaying = payingFor === name;
          return `
            <div class="payout-card" style="border-left-color:${colorFor(name)}">
              <div class="payout-top">
                <span class="payout-name" style="color:${colorFor(name)}">${name}</span>
                <span class="payout-balance ${bal < 0 ? "negative" : ""}">${bal} kr <span class="payout-balance-label">til gode</span></span>
              </div>
              <div class="payout-sub">Optjent i alt ${e} kr · Udbetalt ${p} kr</div>
              ${
                bal < 0
                  ? `<div class="payout-negative-note">Udbetalt mere end optjent — det sker fx når en opgave krydses af igen efter udbetaling. Nye optjeninger udligner først minusset.</div>`
                  : ""
              }
              ${
                isPaying
                  ? `<div class="payout-pay-row">
                       <input type="number" min="1" max="100000" step="1" inputmode="numeric" class="input payout-amount" value="${bal}" />
                       <span class="money-suffix">kr</span>
                       <button class="btn-primary payout-confirm" data-payconfirm="${name}" ${busy[name] ? "disabled" : ""}>${busy[name] ? "…" : "Bekræft"}</button>
                       <button class="btn-ghost payout-cancel" data-paycancel="${name}">Annullér</button>
                      </div>`
                  : `<button class="payout-btn" data-pay="${name}" ${bal <= 0 || busy[name] ? "disabled" : ""}>Betal ud</button>`
              }
              ${
                earns.length
                  ? `<div class="payout-hist"><div class="payout-hist-label">Optjent</div>${earnsShown
                      .map(
                        (x) =>
                          `<div class="payout-hist-row"><span class="payout-earn-label">${x.emoji ? escapeHtml(x.emoji) + " " : ""}${escapeHtml(x.label || "")}</span><span class="payout-hist-date">${fmtDate(x.date)}</span><span class="payout-earn-amt">+${x.money} kr</span></div>`
                      )
                      .join("")}${
                      earnsHidden > 0
                        ? `<button class="payout-hist-more" data-earnmore="${name}">Vis alle (${earns.length})</button>`
                        : ""
                    }</div>`
                  : ""
              }
              ${
                hist.length
                  ? `<div class="payout-hist"><div class="payout-hist-label">Udbetalt</div>${histShown
                      .map(
                        (x) =>
                          `<div class="payout-hist-row"><span class="payout-hist-date">${fmtDate(x.date)}</span><span class="payout-hist-amt">${x.amount} kr</span><button class="payout-hist-del" data-undo="${x.id}" title="Fjern udbetaling" aria-label="Fjern udbetaling">✕</button></div>`
                      )
                      .join("")}${
                      histHidden > 0
                        ? `<button class="payout-hist-more" data-histmore="${name}">Vis alle (${hist.length})</button>`
                        : ""
                    }</div>`
                  : ""
              }
            </div>`;
        })
        .join("");
    }

    mount(`
        <div class="modal-card">
          <div class="modal-head">
            <h2 class="modal-title">💰 Lommepenge</h2>
            <button class="modal-close" data-close="1" aria-label="Luk">✕</button>
          </div>
          <p class="modal-sub">Til gode = optjent minus udbetalt. Udbetalinger gemmes som historik.</p>
          <div class="payout-list">${body}</div>
        </div>`);

    host.querySelectorAll("[data-pay]").forEach((el) => {
      el.onclick = () => {
        payingFor = el.dataset.pay;
        draw();
        // The button just became an amount field — go straight there with the
        // suggested amount selected, so typing replaces it.
        const amount = host.querySelector(".payout-amount");
        amount?.focus();
        amount?.select();
      };
    });
    host.querySelectorAll("[data-paycancel]").forEach((el) => {
      el.onclick = () => {
        payingFor = null;
        draw();
      };
    });
    host.querySelectorAll("[data-payconfirm]").forEach((el) => {
      el.onclick = () => {
        const name = el.dataset.payconfirm;
        const amountInput = host.querySelector(".payout-amount");
        const amt = Math.round(Number(amountInput.value));
        if (!(amt > 0)) return fieldError(amountInput, "Skriv et beløb større end 0.");
        pay(name, amt);
      };
    });
    host.querySelectorAll("[data-undo]").forEach((el) => {
      el.onclick = () => undo(el.dataset.undo);
    });
    host.querySelectorAll("[data-histmore]").forEach((el) => {
      el.onclick = () => {
        histOpen[el.dataset.histmore] = true;
        draw();
      };
    });
    host.querySelectorAll("[data-earnmore]").forEach((el) => {
      el.onclick = () => {
        earnOpen[el.dataset.earnmore] = true;
        draw();
      };
    });
  }

  load();
}
