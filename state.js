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
  connected: false,
  view: "idag",
  weekOffset: 0,
  lastSeenDay: null,
  undoState: null, // { el, timer }

  // Subscription reference handles
  unsubCompletions: null,
  unsubAllowPayouts: null,

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
