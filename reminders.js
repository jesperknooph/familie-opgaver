import { state } from "./state.js";
import { ymd } from "./utils.js";
import { isAdmin } from "./auth.js";
import { subscribeCompletions, loadAllowance, clearOldDone } from "./db-service.js";

let updateCallback = () => {};

export function initReminders(renderCb) {
  updateCallback = renderCb;
}

// Fire a local notification for a task
export function fireReminder(t) {
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

// (Re)schedule timers for every alarmed task that is due today
export function scheduleReminders() {
  state.reminderTimers.forEach((id) => clearTimeout(id));
  state.reminderTimers.clear();
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const now = new Date();
  const todayStr = ymd(now);
  state.tasks.forEach((t) => {
    if (!t.alarm || t.done || !t.time || t.due !== todayStr) return;
    if (state.currentUser && !isAdmin(state.currentUser) && t.assignedTo !== state.currentUser.name) return;
    const [h, m] = t.time.split(":").map(Number);
    const fireAt = new Date();
    fireAt.setHours(h, m, 0, 0);
    const delay = fireAt.getTime() - now.getTime();
    if (delay <= 0 || delay > 86_400_000) return;
    state.reminderTimers.set(t.id, setTimeout(() => fireReminder(t), delay));
  });
}

// Everything that must happen when the calendar day changes
export function dayRollover() {
  state.lastSeenDay = ymd(new Date());
  scheduleReminders();
  subscribeCompletions();
  loadAllowance();
  clearOldDone();
  updateCallback();
}

// A device left open overnight rolls over at midnight
export function scheduleMidnightRefresh() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 5, 0); // 00:00:05 tonight
  setTimeout(() => {
    dayRollover();
    scheduleMidnightRefresh();
  }, next.getTime() - now.getTime());
}

// Visbility change listener setup helper
export function setupVisibilityListener() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && ymd(new Date()) !== state.lastSeenDay) {
      dayRollover();
    }
  });
}
