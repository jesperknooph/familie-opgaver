// Shared application state and constants for the Familie-opgaver app.
export const state = {
  tasks: [],
  completions: [],
  looks: {},
  filter: "alle",
  currentUser: null,
  kidView: "idag",
  kidAnimate: true,
  allowEarnedPast: null,
  allowPaidOut: null,
  loans: [],
  loanPayments: [],
  connected: false,
  // False until the first tasks snapshot lands. Without it an empty state.tasks
  // is indistinguishable from "this family has no tasks", so the app cheerfully
  // announces "fri leg!" while it is still loading.
  loaded: false,
  // navigator.onLine, kept in state so a render can read it synchronously.
  // Firestore's offline cache means onSnapshot often keeps succeeding with no
  // network, so `connected` alone never notices that the device dropped off.
  online: navigator.onLine,
  view: "idag",
  weekOffset: 0,
  lastSeenDay: null,
  undoState: null, // { el, timer }

  // Subscription reference handles
  unsubCompletions: null,
  unsubAllowPayouts: null,
  unsubLoans: null,
  unsubLoanPayments: null,

  // Pending reminder timers, keyed by task id
  reminderTimers: new Map(),

  // Constants
  REPEAT_OPTIONS: [
    { id: null, label: "Aldrig" },
    { id: "daily", label: "Dagligt" },
    { id: "2day", label: "Hver 2. dag" },
    { id: "weekly", label: "Ugentligt" },
    { id: "2week", label: "Hver 2. uge" },
  ],
  REPEAT_DAYS: { daily: 1, "2day": 2, weekly: 7, "2week": 14 },
  REPEAT_LABELS: { daily: "Dagligt", "2day": "Hver 2. dag", weekly: "Ugentligt", "2week": "Hver 2. uge" },
};
