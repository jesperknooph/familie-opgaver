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
import { confettiBurst, toggleTheme, updateWithTransition } from "./ui-common.js";
import { tasksCol, toggleDone, saveLook } from "./db-service.js";
import { signOut } from "./auth.js";

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
      <div class="kid-day ${isToday ? "kid-today" : ""}" style="${delays}" ${isToday ? 'data-kidgotoday="1" title="Gå til i dag"' : ""}>
        <span class="kid-day-name">${DAY_NAMES[i].slice(0, 3)}</span>
        ${middle}
        ${stateDelayed}
      </div>`;
  }
  return rows;
}

export function renderKidMode() {
  const me = state.currentUser.name;
  document.documentElement.style.setProperty("--kid-accent", colorFor(me));

  const today = new Date();
  const todayStr = ymd(today);
  const dateLabel = `${DAY_NAMES[(today.getDay() + 6) % 7]} ${today.getDate()}. ${MONTHS[today.getMonth()]}`;

  const list = kidTodayTasks();
  const doneToday = kidCompletionsOn(todayStr).length;
  const open = list.filter((t) => !t.done).length;
  const total = open + doneToday;
  const pct = total ? Math.round((doneToday / total) * 100) : 0;
  const myCompletions = state.completions.filter((c) => c.name === me);
  const weekMoney = myCompletions.reduce((s, c) => s + (c.money || 0), 0);
  const moneyInUse = state.tasks.some((t) => t.money) || state.completions.some((c) => c.money);
  
  const kidBalance =
    state.allowEarnedPast !== null && state.allowPaidOut !== null
      ? (state.allowEarnedPast[me] || 0) + weekMoney - (state.allowPaidOut[me] || 0)
      : null;
  const isDark = document.documentElement.classList.contains("dark");
  const customized = !!(state.looks[me]?.face || state.looks[me]?.color);

  const faceVal = faceFor(me);
  const faceHtml = faceVal;

  const appContainer = document.getElementById("app");
  appContainer.innerHTML = `
    <div class="${state.kidAnimate ? "kid-enter" : ""}">
      <div class="kid-hello">
        <button class="kid-face ${customized ? "customized" : ""}" id="kidFace" title="Vælg dit look">
          <span>${faceHtml}</span><span class="kid-face-edit">✏️</span>
        </button>
        <span class="kid-hello-text">
          <div class="kid-hi">Hej ${me}! <span class="kid-wave">👋</span></div>
          <div class="kid-date">${dateLabel}</div>
        </span>
        <button class="theme-btn" id="themeBtn" title="Skift mellem lys og mørk" aria-label="Skift mellem lys og mørk">${isDark ? "☀️" : "🌙"}</button>
        <button class="logout-btn" id="logoutBtn">Log ud</button>
      </div>

      <div class="kid-progress" style="${state.kidAnimate ? "animation-delay:0.08s;" : ""} view-transition-name: kid-progress;">
        <div class="kid-progress-top">
          <span class="kid-progress-label">Din dag</span>
          <span class="kid-progress-count">${total === 0 ? "Fri i dag 🎈" : `✅ ${doneToday} af ${total}`}</span>
        </div>
        ${total > 0 ? `<div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>` : ""}
        ${moneyInUse ? `<div class="kid-week-money">💰 Du har tjent ${weekMoney} kr denne uge</div>` : ""}
        ${moneyInUse && kidBalance !== null ? `<div class="kid-piggy">🐷 Du har ${kidBalance} kr i sparegrisen</div>` : ""}
      </div>

      <div class="kid-tabs" style="${state.kidAnimate ? "animation-delay:0.15s;" : ""}">
        <button class="kid-tab ${state.kidView === "idag" ? "active" : ""}" data-kidview="idag">☀️ I dag</button>
        <button class="kid-tab ${state.kidView === "uge" ? "active" : ""}" data-kidview="uge">📅 Min uge</button>
      </div>

      ${
        state.kidView === "idag"
          ? list.length === 0
            ? `<div class="empty" style="${state.kidAnimate ? "animation-delay:0.22s;" : ""}"><span class="empty-emoji">🎈</span>Ingen opgaver i dag – fri leg!</div>`
            : list.map(kidTaskCard).join("")
          : kidWeekRows()
      }
    </div>

    <button class="kid-fab" id="kidAddBtn" title="Tilføj opgave" aria-label="Tilføj opgave">＋</button>
  `;
  state.kidAnimate = false;

  document.getElementById("kidAddBtn").onclick = openKidAddSheet;
  document.getElementById("logoutBtn").onclick = signOut;
  document.getElementById("themeBtn").onclick = toggleTheme;
  document.getElementById("kidFace").onclick = openLookSheet;

  document.querySelectorAll("[data-kidview]").forEach((el) => {
    el.onclick = () => {
      if (state.kidView === el.dataset.kidview) return;
      state.kidView = el.dataset.kidview;
      state.kidAnimate = true;
      updateWithTransition();
    };
  });

  document.querySelectorAll("[data-kidtoggle]").forEach((el) => {
    el.onclick = () => kidToggle(el);
  });

  const todayRow = document.querySelector("[data-kidgotoday]");
  if (todayRow) {
    todayRow.onclick = () => {
      state.kidView = "idag";
      state.kidAnimate = true;
      updateWithTransition();
    };
  }
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
  let host = document.getElementById("kidAddSheet");
  if (!host) {
    host = document.createElement("div");
    host.id = "kidAddSheet";
    host.style.cssText = "position:fixed; inset:0; z-index:1150;";
    document.body.appendChild(host);
  }

  let emoji = "🧹";
  let when = "today";
  let pickedDate = "";
  let busy = false;

  function close() {
    host.remove();
  }

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
    const label = host.querySelector("#kidAddLabel").value.trim();
    if (!label) return alert("Skriv hvad du skal lave 🙂");
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
      alert("Kunne ikke gemme opgaven. Er du online?");
    }
  }

  host.querySelector("#kidAddSave").onclick = save;
  host.querySelector("#kidAddLabel").onkeydown = (e) => {
    if (e.key === "Enter") save();
  };
}

export function openLookSheet() {
  let host = document.getElementById("lookSheet");
  if (!host) {
    host = document.createElement("div");
    host.id = "lookSheet";
    host.style.cssText = "position:fixed; inset:0; z-index:1150;";
    document.body.appendChild(host);
  }
  const me = state.currentUser.name;
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
        </div>
      </div>`;

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
    host.querySelectorAll("[data-close]").forEach((el) => (el.onclick = close));
    host.querySelector(".modal-wrap").onclick = (e) => {
      if (e.target === e.currentTarget) close();
    };
  }

  draw();
}
