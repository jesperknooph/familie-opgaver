import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { state } from "./state.js";
import {
  escapeHtml,
  colorFor,
  faceFor,
  ymd,
  parseYmd,
  addDays,
  startOfWeek,
  byTimeThenRecent,
  uid,
  DAY_NAMES,
  MONTHS,
} from "./utils.js";
import {
  confettiBurst,
  toggleTheme,
  updateWithTransition,
  openSheet,
  fieldError,
  skeletonRows,
} from "./ui-common.js";
import { tasksCol, toggleDone, saveLook, showToast } from "./db-service.js";
import { signOut } from "./auth.js";
import {
  roving,
  keepFocus,
  setShortcuts,
  openShortcutSheet,
  hasKeyboard,
} from "./keyboard.js";

const KID_CHECK_SVG = `<svg width="22" height="22" viewBox="0 0 24 24"><path d="M5 13l5 5L20 7" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const LOOK_COLORS = ["#7C5CFF", "#FF5E7A", "#38BDF8", "#10B981", "#F97316", "#EF4444", "#14B8A6", "#D946EF"];
const LOOK_FACES = ["😎", "🦄", "🐱", "🐶", "🦊", "🐼", "⚽", "🎮", "🎸", "🚀"];

export function kidTodayTasks() {
  const todayStr = ymd(new Date());
  const mine = state.tasks.filter((t) => t.assignedTo === state.currentUser.name);
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

export function kidCompletionsOn(dateStr) {
  return state.completions.filter((c) => c.name === state.currentUser.name && c.date === dateStr);
}

export function kidTaskCard(t, i) {
  const todayStr = ymd(new Date());
  const late = t.due && t.due < todayStr && !t.done;
  const userColor = colorFor(state.currentUser.name);
  return `
    <div class="kid-task ${t.done ? "done" : ""}"
      style="${state.kidAnimate ? `animation-delay:${0.2 + i * 0.07}s;` : ""} view-transition-name: task-${t.id};">
      <span class="kid-task-emoji">${t.emoji ? escapeHtml(t.emoji) : "📋"}</span>
      <span class="kid-task-body">
        <div class="kid-task-label">${escapeHtml(t.label)}</div>
        <div class="kid-task-meta">
          ${t.time ? `<span class="task-time ${t.alarm ? "has-alarm" : ""}">${t.alarm ? "🔔" : "🕐"} ${t.time}</span>` : ""}
          ${t.money ? `<span class="task-money">💰 ${t.money} kr</span>` : ""}
          ${t.repeat ? `<span class="task-time">🔁 ${state.REPEAT_LABELS[t.repeat] || ""}</span>` : ""}
          ${late ? `<span class="task-time">⏰ Fra tidligere</span>` : ""}
        </div>
      </span>
      <button class="kid-check ${t.done ? "done" : ""}" data-kidtoggle="${t.id}" aria-label="${t.done ? "Fjern flueben" : "Kryds af"}">${t.done ? KID_CHECK_SVG : ""}</button>
    </div>`;
}

export function kidWeekRows() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = ymd(today);
  const start = startOfWeek(today);
  const mine = state.tasks.filter((t) => t.assignedTo === state.currentUser.name);

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

    const icons = dayTasks.map((t) => t.emoji || "📋").join("");
    const middle = icons
      ? `<span class="kid-day-emojis">${icons}</span>`
      : `<span class="kid-day-free">${doneCount > 0 ? "" : "Fri 🎈"}</span>`;

    const delays = state.kidAnimate
      ? `animation-delay:${0.05 * i}s;`
      : "";
    const stateDelayed = state.kidAnimate && stateHtml
      ? stateHtml.replace('class="kid-day-state', `style="animation-delay:${0.3 + 0.08 * i}s" class="kid-day-state`)
      : stateHtml;

    rows += `
      <${isToday ? "button" : "div"} class="kid-day ${isToday ? "kid-today" : ""}" style="${delays}" ${
        isToday ? 'data-kidgotoday="1" title="Gå til i dag" aria-label="Gå til i dag"' : ""
      }>
        <span class="kid-day-name">${DAY_NAMES[i].slice(0, 3)}</span>
        ${middle}
        ${stateDelayed}
      </${isToday ? "button" : "div"}>`;
  }
  return rows;
}

// The shell is built once. Every later render rewrites only the regions whose
// contents actually changed — replacing all of #app on each Firestore snapshot
// (which is what this used to do) restarted the entry animations and threw away
// the scroll position whenever anyone in the family touched a task.
function renderKidShell() {
  document.getElementById("app").innerHTML = `
    <div id="kidRoot">
      <div class="kid-hello" id="kidHello"></div>
      <div class="kid-progress" id="kidProgress" style="view-transition-name: kid-progress;"></div>
      <div class="kid-tabs" id="kidTabs"></div>
      <div id="kidList"></div>
    </div>

    <button class="kid-fab" id="kidAddBtn" title="Tilføj opgave" aria-label="Tilføj opgave">＋</button>
  `;
  document.getElementById("kidAddBtn").onclick = openKidAddSheet;
  registerKidShortcuts();
}

// A shorter list than the parent's — a kid's whole app is "see today, tick it
// off, add one". Same dispatcher, same ? sheet.
function registerKidShortcuts() {
  const setView = (view) => {
    if (state.kidView === view) return;
    state.kidView = view;
    state.kidAnimate = true;
    updateWithTransition();
  };

  setShortcuts([
    { keys: ["n", "N"], showKeys: ["n"], label: "Ny opgave", group: "Handlinger", run: openKidAddSheet },
    { keys: ["m", "M"], showKeys: ["m"], label: "Lys / mørk", group: "Handlinger", run: toggleTheme },
    { keys: ["1"], label: "I dag", group: "Visning", run: () => setView("idag") },
    { keys: ["2"], label: "Min uge", group: "Visning", run: () => setView("uge") },
    {
      keys: ["j", "k"],
      showKeys: ["j", "k"],
      label: "Hop ned i listen",
      group: "I listen",
      run: () => {
        const start =
          document.querySelector('#kidList [data-kidtoggle][tabindex="0"]') ||
          document.querySelector("#kidList [data-kidtoggle]");
        start?.focus();
      },
    },
    { keys: ["ArrowUp", "ArrowDown"], label: "Forrige / næste opgave", group: "I listen" },
    { keys: [" "], showKeys: [" "], label: "Kryds af", group: "I listen" },
    { keys: ["?"], label: "Denne oversigt", group: "Hjælp", run: openShortcutSheet },
    { keys: ["Escape"], label: "Luk et vindue", group: "Hjælp" },
  ]);
}

export function renderKidMode() {
  const me = state.currentUser.name;
  document.documentElement.style.setProperty("--kid-accent", colorFor(me));

  if (!document.getElementById("kidList")) renderKidShell();

  // The entry animations are CSS rules under .kid-enter; carrying the class only
  // while kidAnimate is set keeps them to first paint and tab switches.
  document.getElementById("kidRoot").classList.toggle("kid-enter", state.kidAnimate);

  updateKidHello(me);
  updateKidProgress(me);
  updateKidTabs();
  updateKidList();

  state.kidAnimate = false;
}

function updateKidHello(me) {
  const today = new Date();
  const dateLabel = `${DAY_NAMES[(today.getDay() + 6) % 7]} ${today.getDate()}. ${MONTHS[today.getMonth()]}`;
  const isDark = document.documentElement.classList.contains("dark");
  const customized = !!(state.looks[me]?.face || state.looks[me]?.color);

  const el = document.getElementById("kidHello");
  el.innerHTML = `
    <button class="kid-face ${customized ? "customized" : ""}" id="kidFace" title="Vælg dit look">
      <span>${faceFor(me)}</span><span class="kid-face-edit">✏️</span>
    </button>
    <span class="kid-hello-text">
      <div class="kid-hi">Hej ${escapeHtml(me)}! <span class="kid-wave">👋</span></div>
      <div class="kid-date">${dateLabel}</div>
    </span>
    <button class="theme-btn" id="themeBtn" title="Skift mellem lys og mørk" aria-label="Skift mellem lys og mørk">${isDark ? "☀️" : "🌙"}</button>
    <button class="logout-btn" id="logoutBtn">Log ud</button>
  `;
  el.querySelector("#logoutBtn").onclick = signOut;
  el.querySelector("#themeBtn").onclick = toggleTheme;
  el.querySelector("#kidFace").onclick = openLookSheet;
}

function updateKidProgress(me) {
  const todayStr = ymd(new Date());
  const list = kidTodayTasks();
  const doneToday = kidCompletionsOn(todayStr).length;
  const total = list.filter((t) => !t.done).length + doneToday;
  const pct = total ? Math.round((doneToday / total) * 100) : 0;
  const weekMoney = state.completions
    .filter((c) => c.name === me)
    .reduce((s, c) => s + (c.money || 0), 0);
  const moneyInUse = state.tasks.some((t) => t.money) || state.completions.some((c) => c.money);
  const kidBalance =
    state.allowEarnedPast !== null && state.allowPaidOut !== null
      ? (state.allowEarnedPast[me] || 0) + weekMoney - (state.allowPaidOut[me] || 0)
      : null;

  // "Fri i dag 🎈" before the first snapshot would be a promise the app can't
  // keep — an empty task list means "not loaded yet" until state.loaded says so.
  const countText = !state.loaded && total === 0
    ? "Henter …"
    : total === 0
      ? "Fri i dag 🎈"
      : `✅ ${doneToday} af ${total}`;

  const el = document.getElementById("kidProgress");
  el.style.animationDelay = state.kidAnimate ? "0.08s" : "";
  el.innerHTML = `
    <div class="kid-progress-top">
      <span class="kid-progress-label">Din dag</span>
      <span class="kid-progress-count">${countText}</span>
    </div>
    ${total > 0 ? `<div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>` : ""}
    ${moneyInUse ? `<div class="kid-week-money">💰 Du har tjent ${weekMoney} kr denne uge</div>` : ""}
    ${moneyInUse && kidBalance !== null ? `<div class="kid-piggy">🐷 Du har ${kidBalance} kr i sparegrisen</div>` : ""}
    ${
      state.online
        ? ""
        : `<div class="kid-offline">📴 Du er offline — dine flueben gemmes, når nettet er tilbage</div>`
    }
  `;
}

function updateKidTabs() {
  const el = document.getElementById("kidTabs");
  el.style.animationDelay = state.kidAnimate ? "0.15s" : "";
  el.innerHTML = `
    <button class="kid-tab ${state.kidView === "idag" ? "active" : ""}" data-kidview="idag" aria-pressed="${state.kidView === "idag"}">☀️ I dag</button>
    <button class="kid-tab ${state.kidView === "uge" ? "active" : ""}" data-kidview="uge" aria-pressed="${state.kidView === "uge"}">📅 Min uge</button>
  `;
  el.querySelectorAll("[data-kidview]").forEach((tab) => {
    tab.onclick = () => {
      if (state.kidView === tab.dataset.kidview) return;
      state.kidView = tab.dataset.kidview;
      state.kidAnimate = true;
      updateWithTransition();
    };
  });
  roving(el, "[data-kidview]");
}

function updateKidList() {
  const list = kidTodayTasks();
  const el = document.getElementById("kidList");

  if (state.kidView === "uge") {
    el.innerHTML = kidWeekRows();
  } else if (list.length > 0) {
    el.innerHTML = list.map(kidTaskCard).join("");
  } else if (!state.loaded) {
    el.innerHTML = skeletonRows(3, true);
  } else {
    el.innerHTML = `<div class="empty" style="${
      state.kidAnimate ? "animation-delay:0.22s;" : ""
    }"><span class="empty-emoji">🎈</span>Ingen opgaver i dag – fri leg!</div>`;
  }

  el.querySelectorAll("[data-kidtoggle]").forEach((btn) => {
    btn.onclick = () => kidToggle(btn);
  });

  const todayRow = el.querySelector("[data-kidgotoday]");
  if (todayRow) {
    todayRow.onclick = () => {
      state.kidView = "idag";
      state.kidAnimate = true;
      updateWithTransition();
    };
  }

  // The day's tasks are one tab stop; ↑/↓ walks them, Enter/Space ticks one off.
  roving(el, "[data-kidtoggle]", { grid: true });
}

export function kidToggle(btn) {
  const t = state.tasks.find((x) => x.id === btn.dataset.kidtoggle);
  if (!t) return;
  if (!t.done) {
    const card = btn.closest(".kid-task");
    btn.classList.add("done");
    btn.innerHTML = KID_CHECK_SVG;
    if (card) card.classList.add("pop");
    confettiBurst(btn, colorFor(state.currentUser.name));
    const openLeft = kidTodayTasks().filter((x) => !x.done).length;
    if (openLeft === 1) setTimeout(kidCelebrate, 650);
  }
  toggleDone(t.id);
}

export function kidCelebrate() {
  if (document.querySelector(".kid-celebrate")) return;
  const el = document.createElement("div");
  el.className = "kid-celebrate";
  el.innerHTML = `
    <div class="kid-celebrate-card">
      <span class="kid-celebrate-trophy">🏆</span>
      <div class="kid-celebrate-title">Alt klaret!</div>
      <div class="kid-celebrate-sub">Sikke en sej dag, ${state.currentUser.name}!</div>
      <div class="kid-celebrate-stars">
        <span style="animation-delay:0.5s">⭐</span>
        <span style="animation-delay:0.65s">⭐</span>
        <span style="animation-delay:0.8s">⭐</span>
        <span style="animation-delay:0.95s">⭐</span>
        <span style="animation-delay:1.1s">⭐</span>
      </div>
    </div>`;
  el.onclick = () => el.remove();
  document.body.appendChild(el);
  confettiBurst(el.querySelector(".kid-celebrate-trophy"), colorFor(state.currentUser.name), true);
  setTimeout(() => {
    const stars = el.querySelector(".kid-celebrate-stars");
    if (stars) confettiBurst(stars, colorFor(state.currentUser.name), true);
  }, 600);
  setTimeout(() => el.remove(), 7000);
}

const KID_EMOJI_QUICKPICKS = ["🧹", "🧸", "📚", "🦷", "🚿", "🍽️", "🐕", "🎵", "⚽", "🎮", "🎨", "🧽"];

export function openKidAddSheet() {
  const { host, mount, close } = openSheet("kidAddSheet");

  let emoji = "🧹";
  let when = "today";
  let pickedDate = "";
  let busy = false;

  function dueFor() {
    if (when === "tomorrow") return ymd(addDays(new Date(), 1));
    if (when === "date" && pickedDate) return pickedDate;
    return ymd(new Date());
  }

  mount(`
      <div class="modal-card kid-add-card">
        <div class="modal-head">
          <h2 class="modal-title">Ny opgave ✨</h2>
          <button class="modal-close" data-close="1" aria-label="Luk">✕</button>
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
          <button class="btn-primary" id="kidAddSave">Tilføj ✨</button>
        </div>
      </div>`);

  host.querySelectorAll("[data-emoji]").forEach((el) => {
    el.onclick = () => {
      emoji = el.dataset.emoji;
      host.querySelectorAll("[data-emoji]").forEach((b) => {
        b.classList.toggle("active", b === el);
        b.setAttribute("aria-pressed", b === el ? "true" : "false");
      });
    };
  });
  roving(host.querySelector(".kid-add-emojis"), "[data-emoji]", { grid: true });

  const dateInput = host.querySelector("#kidAddDate");
  const dateChip = host.querySelector("#kidWhenDate");

  function selectWhen(val, chip) {
    when = val;
    host.querySelectorAll("[data-when]").forEach((b) => {
      b.classList.toggle("active", b === chip);
      b.setAttribute("aria-pressed", b === chip ? "true" : "false");
    });
  }

  host.querySelectorAll("[data-when]").forEach((el) => {
    el.onclick = () => {
      if (el.dataset.when === "date") {
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

  dateInput.onchange = () => {
    if (!dateInput.value) return;
    pickedDate = dateInput.value;
    const d = parseYmd(pickedDate);
    dateChip.innerHTML = `📅 ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
    selectWhen("date", dateChip);
  };

  async function save() {
    if (busy) return;
    const labelInput = host.querySelector("#kidAddLabel");
    const label = labelInput.value.trim();
    if (!label) return fieldError(labelInput, "Skriv hvad du skal lave 🙂");
    const data = {
      label,
      emoji: emoji || null,
      assignedTo: state.currentUser.name,
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
      saveBtn.innerHTML = "Tilføj ✨";
      showToast("Kunne ikke gemme opgaven. Er du online?");
    }
  }

  host.querySelector("#kidAddSave").onclick = save;
  host.querySelector("#kidAddLabel").onkeydown = (e) => {
    if (e.key === "Enter") save();
  };

  roving(host.querySelector(".kid-when-chips"), "[data-when]");

  // With a real keyboard, "n" then typing should just work. On a tablet the
  // on-screen keyboard would cover the sheet, so it stays hands-off there.
  if (hasKeyboard()) host.querySelector("#kidAddLabel").focus();
}

export function openLookSheet() {
  const { host, mount } = openSheet("lookSheet");
  const me = state.currentUser.name;
  const faces = [me[0], ...LOOK_FACES];

  function draw() {
    keepFocus(paint);
  }

  function paint() {
    const face = faceFor(me);
    const color = colorFor(me);
    mount(`
        <div class="modal-card">
          <div class="modal-head">
            <h2 class="modal-title">Vælg dit look</h2>
            <button class="modal-close" data-close="1" aria-label="Luk">✕</button>
          </div>
          <div class="kid-look-label">Din figur</div>
          <div class="kid-emoji-grid">
            ${faces
              .map(
                (f) => `<button class="kid-emoji-opt ${f === face ? "active" : ""}" data-face="${f}">
                  ${f}
                </button>`
              )
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
        </div>`);

    host.querySelectorAll("[data-face]").forEach((el) => {
      el.onclick = () => {
        state.looks[me] = { ...state.looks[me], face: el.dataset.face };
        saveLook({ face: el.dataset.face });
        updateWithTransition();
        draw();
      };
    });
    host.querySelectorAll("[data-color]").forEach((el) => {
      el.onclick = () => {
        state.looks[me] = { ...state.looks[me], color: el.dataset.color };
        saveLook({ color: el.dataset.color });
        updateWithTransition();
        draw();
      };
    });

    roving(host.querySelector(".kid-emoji-grid"), "[data-face]", { grid: true });
    roving(host.querySelector(".kid-color-row"), "[data-color]", { grid: true });
  }

  draw();
}
