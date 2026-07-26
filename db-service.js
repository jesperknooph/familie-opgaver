import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { state } from "./state.js";
import { ymd, startOfWeek, nextDueDate, nextInRotation, escapeHtml } from "./utils.js";
import { MEMBERS, isAdmin } from "./auth.js";

export const tasksCol = collection(db, "tasks");
export const completionsCol = collection(db, "completions");
export const payoutsCol = collection(db, "payouts");
export const membersCol = collection(db, "members");

let updateCallback = () => {};

export function initDbService(renderCb) {
  updateCallback = renderCb;
}

// --- Completion log (drives the weekly earnings tally) ---
export async function logCompletion(t) {
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
    if (t.money) showToast(`⚠️ De ${t.money} kr blev ikke gemt — tjek forbindelsen og kryds af igen.`);
  }
}

export async function removeCompletion(t) {
  const today = ymd(new Date());
  try {
    await deleteDoc(doc(completionsCol, `${t.id}:${today}`));
  } catch (e) {
    console.warn("Could not remove completion:", e);
    if (t.money) showToast(`⚠️ Optjeningen på ${t.money} kr blev ikke fjernet — prøv igen.`);
  }
}

// Live tally of this week's completions.
export function subscribeCompletions() {
  if (state.unsubCompletions) state.unsubCompletions();
  const weekStart = ymd(startOfWeek(new Date()));
  const cq = query(completionsCol, where("date", ">=", weekStart));
  state.unsubCompletions = onSnapshot(
    cq,
    (snap) => {
      state.completions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      updateCallback();
    },
    (err) => console.warn("Completions sync error (are the new rules published?):", err)
  );
}

// Past earnings (all completions before this week) never change once the week
// has turned — you can only check/uncheck tasks for *today*, which is always in
// the current week. So we cache the per-child totals on-device, keyed by the
// week they belong to. The full-history query then runs at most once a week per
// device instead of on every app open, while the balances stay exactly as
// before (derived from real history, so they can't drift).
const ALLOW_CACHE_KEY = "familie-opgaver:allowEarnedPast";

function readEarnedPastCache(weekStart, kidNames) {
  try {
    const parsed = JSON.parse(localStorage.getItem(ALLOW_CACHE_KEY));
    if (!parsed || parsed.weekStart !== weekStart || !parsed.past) return null;
    // If a current member is missing, the cache is incomplete — re-query.
    if (!kidNames.every((n) => n in parsed.past)) return null;
    // Project onto the current roster so a removed member can't linger.
    const past = {};
    kidNames.forEach((n) => (past[n] = parsed.past[n] || 0));
    return past;
  } catch (e) {
    return null; // missing or corrupt cache — just re-query
  }
}

function writeEarnedPastCache(weekStart, past) {
  try {
    localStorage.setItem(ALLOW_CACHE_KEY, JSON.stringify({ weekStart, past }));
  } catch (e) {
    // storage disabled/full — fine, we'll simply re-query next time
  }
}

// Standing allowance balance ("til gode").
export async function loadAllowance() {
  if (state.unsubAllowPayouts) state.unsubAllowPayouts();

  const kidNames = MEMBERS.filter((m) => !m.admin).map((m) => m.name);
  if (kidNames.length === 0) return;

  // 1. Past earnings — served from the weekly cache when possible, otherwise
  // queried once and cached for the rest of the week.
  const weekStart = ymd(startOfWeek(new Date()));
  const cached = readEarnedPastCache(weekStart, kidNames);
  if (cached) {
    state.allowEarnedPast = cached;
  } else {
    try {
      const qPast = query(
        completionsCol,
        where("money", ">", 0),
        where("date", "<", weekStart)
      );
      const snap = await getDocs(qPast);
      const past = {};
      kidNames.forEach((n) => (past[n] = 0));
      snap.forEach((d) => {
        const c = d.data();
        if (c.name in past) past[c.name] += c.money || 0;
      });
      state.allowEarnedPast = past;
      writeEarnedPastCache(weekStart, past);
    } catch (e) {
      console.warn("Could not fetch past allowance earnings:", e);
    }
  }

  // 2. Keep a live subscription on payouts
  state.unsubAllowPayouts = onSnapshot(
    payoutsCol,
    (snap) => {
      const paid = {};
      kidNames.forEach((n) => (paid[n] = 0));
      snap.forEach((d) => {
        const p = d.data();
        if (p.name in paid) paid[p.name] += p.amount || 0;
      });
      state.allowPaidOut = paid;
      updateCallback();
    },
    (err) => console.warn("Payouts sync error:", err)
  );
}

// Mutates task checked status.
export async function toggleDone(id) {
  const t = state.tasks.find((t) => t.id === id);
  if (!t) return;

  if (t.repeat && !t.done) {
    const updates = { due: nextDueDate(t.due, t.repeat) };
    if (t.rotation && t.rotation.length > 1) updates.assignedTo = nextInRotation(t);
    await updateDoc(doc(tasksCol, id), updates);
    logCompletion(t);
    return;
  }

  await updateDoc(doc(tasksCol, id), { done: !t.done });
  if (!t.done) logCompletion(t);
  else removeCompletion(t);
}

export async function removeTask(id) {
  const t = state.tasks.find((t) => t.id === id);
  await deleteDoc(doc(tasksCol, id));
  if (t) showUndo(t);
}

export async function clearDone() {
  if (!confirm("Fjern alle afkrydsede opgaver?")) return;
  const toRemove = state.tasks.filter((t) => t.done);
  await Promise.all(toRemove.map((t) => deleteDoc(doc(tasksCol, t.id))));
}

export async function clearOldDone() {
  const todayStr = ymd(new Date());
  const stale = state.tasks.filter(
    (t) => t.done && !t.repeat && (!t.due || t.due < todayStr)
  );
  try {
    await Promise.all(stale.map((t) => deleteDoc(doc(tasksCol, t.id))));
  } catch (e) {
    console.warn("Auto-clearing old done tasks failed:", e);
  }
}

export async function saveLook(patch) {
  if (!state.currentUser) return;
  try {
    await setDoc(doc(membersCol, state.currentUser.name), patch, { merge: true });
  } catch (e) {
    console.warn("Could not save look:", e);
  }
}

// --- Toast and Undo managers ---
export function dismissUndo() {
  if (state.undoState) {
    clearTimeout(state.undoState.timer);
    state.undoState.el.remove();
    state.undoState = null;
  }
}

export function showToast(msg) {
  dismissUndo();
  const el = document.createElement("div");
  el.className = "toast show";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

export function showUndo(t) {
  dismissUndo();
  const el = document.createElement("div");
  el.className = "toast show toast-undo";
  el.innerHTML = `
    <span>Slettet "${escapeHtml(t.label)}".</span>
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
  state.undoState = { el, timer: setTimeout(dismissUndo, 6000) };
}
