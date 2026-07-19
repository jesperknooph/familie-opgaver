import { authReady } from "./firebase-config.js";
import { onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ensureAuth, isAdmin } from "./auth.js";
import { state } from "./state.js";
import { ymd } from "./utils.js";
import { initUiCommon, updateWithTransition } from "./ui-common.js";
import {
  initDbService,
  subscribeCompletions,
  loadAllowance,
  membersCol,
  tasksCol,
} from "./db-service.js";
import {
  initReminders,
  scheduleReminders,
  scheduleMidnightRefresh,
  setupVisibilityListener,
} from "./reminders.js";
import { renderParentMode } from "./ui-parent.js";
import { renderKidMode } from "./ui-kid.js";

function render() {
  if (state.currentUser && !isAdmin(state.currentUser)) {
    renderKidMode();
  } else {
    renderParentMode();
  }
}

// Get an anonymous Firebase auth token before any Firestore access
try {
  await authReady;
} catch (e) {
  const appContainer = document.getElementById("app");
  if (appContainer) {
    appContainer.innerHTML = `<div class="error-banner">Kunne ikke forbinde sikkert til serveren. Genindlæs siden, eller tjek at Anonymous Authentication er slået til i Firebase.</div>`;
  }
  throw e;
}

// Gate the app behind the family login before subscribing to data.
state.currentUser = await ensureAuth();

// Initialize module rendering callbacks
initUiCommon(render);
initDbService(render);
initReminders(render);

// Live per-member looks (kid mode's "Vælg dit look"): colors and faces update
// on every device the moment a kid changes theirs.
onSnapshot(
  membersCol,
  (snap) => {
    state.looks = {};
    snap.forEach((d) => (state.looks[d.id] = d.data()));
    updateWithTransition();
  },
  (err) => console.warn("Members sync error:", err)
);

// Real-time listener — every connected device updates instantly.
const q = query(tasksCol, orderBy("ts", "desc"));
onSnapshot(
  q,
  (snapshot) => {
    state.tasks = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    state.connected = true;
    updateWithTransition();
    scheduleReminders();
  },
  (err) => {
    console.error("Firestore sync error:", err);
    state.connected = false;
    updateWithTransition();
  }
);

state.lastSeenDay = ymd(new Date());
render();
subscribeCompletions();
loadAllowance();
scheduleMidnightRefresh();
setupVisibilityListener();
