// Repository of ready-made tasks. Each carries an emoji so the overview stays
// visual — children recognise a task by its picture, not by reading the words.
// `points` is the default star value credited when the task is completed
// (adjustable per task in the add card). Add, remove or re-word freely.
export const TASK_TEMPLATES = [
  // Køkken
  { emoji: "🍽️", label: "Tøm opvaskemaskine", points: 2 },
  { emoji: "🧽", label: "Fyld opvaskemaskine", points: 2 },
  { emoji: "🍴", label: "Dæk bord", points: 1 },
  { emoji: "🧼", label: "Tør bord af", points: 1 },
  { emoji: "🍳", label: "Lave aftensmad", points: 3 },

  // Rengøring
  { emoji: "🧹", label: "Støvsug", points: 2 },
  { emoji: "🗑️", label: "Tag skraldet ud", points: 1 },
  { emoji: "♻️", label: "Pante flasker", points: 2 },
  { emoji: "🧺", label: "Læg tøj på plads", points: 2 },
  { emoji: "🧸", label: "Ryd værelse op", points: 2 },
  { emoji: "🛏️", label: "Red seng", points: 1 },
  { emoji: "🚗", label: "Rengør bil", points: 3 },

  // Dyr & have
  { emoji: "🐕", label: "Gå med Abbey", points: 2 },
  { emoji: "🦴", label: "Giv Abbey mad", points: 1 },
  { emoji: "🪴", label: "Vand blomster", points: 1 },
  { emoji: "🌿", label: "Fjerne ukrudt", points: 3 },

  // Skole & musik
  { emoji: "📚", label: "Lav lektier", points: 2 },
  { emoji: "🎵", label: "Øv musik med far", points: 2 },
  { emoji: "🎒", label: "Pak skoletaske", points: 1 },

  // Personligt
  { emoji: "🦷", label: "Børst tænder", points: 1 },
  { emoji: "🚿", label: "Gå i bad", points: 1 },
];
