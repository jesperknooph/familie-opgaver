// Comprehensive Vector Icon Library & Emoji Resolver for Familie-opgaver

const SVG_ICONS = {
  // --- Task & Category Icons ---
  dish: `<path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 3a7 7 0 110 14 7 7 0 010-14z" fill="currentColor" opacity="0.2"/><path d="M7 2v6m0 0a2 2 0 002 2h0a2 2 0 002-2V2m-4 6v14M17 2v20m0-20c2 0 2 3 2 6v3h-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  sponge: `<rect x="3" y="6" width="18" height="12" rx="3" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="7.5" cy="10.5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="16.5" cy="10" r="1" fill="currentColor"/><circle cx="9.5" cy="14.5" r="1.2" fill="currentColor"/><circle cx="15" cy="14.5" r="1" fill="currentColor"/>`,
  cutlery: `<path d="M7 2v6m0 0a2 2 0 002 2h0a2 2 0 002-2V2m-4 6v14M17 2v20m0-20c2 0 2 3 2 6v3h-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  soap: `<rect x="3" y="10" width="18" height="10" rx="3" stroke="currentColor" stroke-width="2" fill="none"/><path d="M7 10V7a3 3 0 013-3h4a3 3 0 013 3v3" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="7" cy="4" r="1.5" fill="currentColor" opacity="0.6"/><circle cx="11" cy="2.5" r="1" fill="currentColor" opacity="0.6"/>`,
  cook: `<path d="M12 18a7 7 0 100-14 7 7 0 000 14z" stroke="currentColor" stroke-width="2" fill="none"/><path d="M19 12h3M12 21v2M12 11a1 1 0 100-2 1 1 0 000 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="11" r="2.5" fill="currentColor" opacity="0.3"/>`,
  broom: `<path d="M19 3L11.5 10.5M5.5 13.5l5 5M4 20l3-3M6.5 11L13 17.5l4-2-8.5-8.5-2 4z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M19 3l2 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  trash: `<path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  recycle: `<path d="M7 19H4.8a2 2 0 01-1.7-3l2.5-4.3M12.7 4.5l-1.4-2.5a2 2 0 00-3.4 0L6 5M16 11l5 1-2.5 4.3a2 2 0 01-1.7 1h-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M10 21l-3-3 3-3M3 7l4 1.5M21 15l-3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  laundry: `<path d="M4 8h16l-1.5 12a2 2 0 01-2 1.8h-9a2 2 0 01-2-1.8L4 8z" stroke="currentColor" stroke-width="2" fill="none"/><path d="M8 8V5a2 2 0 012-2h4a2 2 0 012 2v3M9 13h6M10 17h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  toys: `<path d="M12 8a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM7.5 14a3 3 0 100-6 3 3 0 000 6zM16.5 14a3 3 0 100-6 3 3 0 000 6zM5 21a2 2 0 002-2v-2h10v2a2 2 0 104 0v-4a3 3 0 00-3-3H6a3 3 0 00-3 3v4a2 2 0 002 2z" stroke="currentColor" stroke-width="1.8" fill="none"/>`,
  bed: `<path d="M2 4v16M2 11h20M22 17v3M2 17h20M6 11V8a2 2 0 012-2h3a2 2 0 012 2v3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  car: `<path d="M5 17h14M4 11l2-5h12l2 5M3 11a2 2 0 00-2 2v3a1 1 0 001 1h16a1 1 0 001-1v-3a2 2 0 00-2-2H3z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="7" cy="16" r="1.5" fill="currentColor"/><circle cx="17" cy="16" r="1.5" fill="currentColor"/>`,
  dog: `<path d="M10 5.5A2.5 2.5 0 007.5 3H6a3 3 0 00-3 3v2.5M14 5.5A2.5 2.5 0 0116.5 3H18a3 3 0 013 3v2.5M8 14v5M16 14v5M12 18v3" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M5 9c0 5 3 8 7 8s7-3 7-8a7 7 0 00-14 0z" stroke="currentColor" stroke-width="2" fill="none"/><ellipse cx="12" cy="13.5" rx="1.5" ry="1" fill="currentColor"/>`,
  petfood: `<path d="M17 4a2 2 0 00-3 2v.5a2 2 0 00-4 0V6a2 2 0 00-3-2 2 2 0 00-2 2c0 1.2.8 2.2 2 2.7V15a2 2 0 00-2 2.3A2 2 0 007 20a2 2 0 003-2v-.5a2 2 0 004 0v.5a2 2 0 003 2 2 2 0 002-2.7A2 2 0 0017 15V8.7c1.2-.5 2-1.5 2-2.7a2 2 0 00-2-2z" stroke="currentColor" stroke-width="2" fill="none"/>`,
  plant: `<path d="M7 11h10l-1.2 9a2 2 0 01-2 1H10.2a2 2 0 01-2-1L7 11zM12 11V3" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M12 7c-2.5-3-6-3-6 0s3.5 3 6 0zM12 5c2.5-3 6-3 6 0s-3.5 3-6 0z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="none"/>`,
  leaf: `<path d="M11 20A9 9 0 0020 11C20 4 13 3 13 3s1 7-6 13a9 9 0 004 4z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M11 20c.5-5 4-8.5 9-9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  book: `<path d="M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 006.5 22H20V3H6.5A2.5 2.5 0 004 5.5v14z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M9 7h6M9 11h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  music: `<path d="M9 18V5l12-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zm12 0a3 3 0 11-6 0 3 3 0 016 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  backpack: `<path d="M4 10a4 4 0 014-4h8a4 4 0 014 4v9a3 3 0 01-3 3H7a3 3 0 01-3-3v-9z" stroke="currentColor" stroke-width="2" fill="none"/><path d="M9 6V4a2 2 0 012-2h2a2 2 0 012 2v2M8 12h8M8 16h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  tooth: `<path d="M12 2C8.5 2 6 4.5 6 7c0 3 1.5 7.5 3 11.5 1.5 4 3 3.5 3 1.5s1-2.5 1-2.5.5.5 1 2.5c0 2 1.5 2.5 3-1.5C18.5 14.5 20 10 20 7c0-2.5-2.5-5-6-5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="16.5" cy="5.5" r="1" fill="currentColor"/>`,
  shower: `<path d="M4 4h7a4 4 0 014 4v3M15 11a3 3 0 100 6 3 3 0 000-6z" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M13 20v1M15 20v2M17 20v1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  ball: `<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 7l2.5 1.8-.9 3h-3.2l-.9-3L12 7zm-4.5 1.5L5 11m9.5-2.5L19 11M6.5 17.5L9 14.5m8.5 3L15 14.5M12 16.5V20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  gamepad: `<rect x="2" y="6" width="20" height="12" rx="6" stroke="currentColor" stroke-width="2" fill="none"/><path d="M6 12h4M8 10v4M15 11h.01M17 13h.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`,
  art: `<path d="M12 2a10 10 0 100 20c1.5 0 2.5-1 2.5-2.5 0-.7-.3-1.3-.8-1.7-.4-.5-.6-1-.6-1.8 0-1.4 1.1-2.5 2.5-2.5H17a5 5 0 005-5c0-4.4-4.5-6.5-10-6.5z" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="6.5" cy="11.5" r="1.5" fill="currentColor"/><circle cx="9.5" cy="7.5" r="1.5" fill="currentColor"/><circle cx="14.5" cy="7.5" r="1.5" fill="currentColor"/><circle cx="17.5" cy="11.5" r="1.5" fill="currentColor"/>`,
  task: `<rect x="5" y="4" width="14" height="17" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><path d="M9 9h6M9 13h6M9 17h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 2h6v3H9z" stroke="currentColor" stroke-width="1.8" fill="none"/>`,

  // --- UI Icons ---
  sun: `<circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  moon: `<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  calendar: `<rect x="3" y="4" width="18" height="18" rx="3" stroke="currentColor" stroke-width="2" fill="none"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  list: `<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  sparkles: `<path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3zM5 17l.8 1.9L7.7 19.7l-1.9.8L5 22.5l-.8-1.9-1.9-.8 1.9-.8L5 17zM19 16l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8.8-1.9z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  coins: `<circle cx="9" cy="12" r="6" stroke="currentColor" stroke-width="2" fill="none"/><path d="M15 6a6 6 0 110 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M9 9.5v5M7.5 11h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
  piggy: `<path d="M19 10a6 6 0 00-6-6H9a6 6 0 00-6 6c0 3.5 2.5 6.5 6 7v3h3v-3h2v3h3v-3.5c2-.8 3.5-2.5 4-4.5h2v-2h-4z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="7.5" cy="9.5" r="1" fill="currentColor"/>`,
  clock: `<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 7v5l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  bell: `<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  repeat: `<path d="M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  rotate: `<path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  settings: `<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" fill="none"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  logout: `<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  pencil: `<path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  plus: `<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`,
  check: `<path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  checkCircle: `<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none"/><path d="M8.5 12.5l2.3 2.3 4.7-5.1" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  circle: `<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none"/>`,
  trophy: `<path d="M8 21h8M12 17v4M6 4h12v4a6 6 0 01-12 0V4z" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M6 5H3v3a3 3 0 003 3M18 5h3v3a3 3 0 01-3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>`,
  star: `<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  balloon: `<path d="M12 16a5 5 0 100-10 5 5 0 000 10z" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 16l-1 2h2l-1-2zM12 18c0 3-2 4-2 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>`,
  wave: `<path d="M18 11V6a2 2 0 00-4 0v3M14 8V4a2 2 0 00-4 0v5M10 9V5a2 2 0 00-4 0v8a7 7 0 0014 0v-2a2 2 0 00-4 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  chevL: `<path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  chevR: `<path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  key: `<path d="M21 2l-2 2m-3 1l-4 4M9 11a5 5 0 100 10 5 5 0 000-10zM13 7l2 2m-1 1l2 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,

  // --- Avatar Badges ---
  cool: `<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none"/><path d="M5 10h14l-2 4h-3l-1-2-1 2H8L6 10zM9 17a3 3 0 006 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  unicorn: `<path d="M17 3l-4 6 3 1-3 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M7 21c0-4 2-8 7-8a5 5 0 005-5c-2 0-4 1-5 2L11 7a5 5 0 00-5 5c0 3 1 6 1 9z" stroke="currentColor" stroke-width="2" fill="none"/>`,
  cat: `<path d="M12 18a6 6 0 100-12 6 6 0 000 12z" stroke="currentColor" stroke-width="2" fill="none"/><path d="M6 9L3 4l5 2M18 9l3-4-5 2M9 12h.01M15 12h.01M12 15l-1-1h2l-1 1z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  fox: `<path d="M12 21l-8-8V5l6 3 2-1 2 1 6-3v8l-8 8z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="none"/><circle cx="8.5" cy="11.5" r="1" fill="currentColor"/><circle cx="15.5" cy="11.5" r="1" fill="currentColor"/><polygon points="12,16 10.5,14 13.5,14" fill="currentColor"/>`,
  panda: `<circle cx="12" cy="13" r="7" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="6" cy="7" r="2.5" fill="currentColor"/><circle cx="18" cy="7" r="2.5" fill="currentColor"/><ellipse cx="9.5" cy="12.5" rx="1.5" ry="2" stroke="currentColor" stroke-width="1.5"/><ellipse cx="14.5" cy="12.5" rx="1.5" ry="2" stroke="currentColor" stroke-width="1.5"/><ellipse cx="12" cy="15" rx="1" ry="0.7" fill="currentColor"/>`,
  guitar: `<path d="M18.5 2.5l-6 6M15 4l5 5M6 13a4 4 0 105.6 5.6L16 14.2l-3.8-3.8L6 13z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="8.5" cy="15.5" r="1" fill="currentColor"/>`,
  rocket: `<path d="M4.5 16.5c-1.5 1.5-1.5 4.5-1.5 4.5s3 0 4.5-1.5l2.5-2.5-5.5-5.5-2.5 2.5zM12 15l-3-3 7.5-7.5c1.7-1.7 4-2.5 5.5-2.5 0 1.5-.8 3.8-2.5 5.5L12 15z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="15" cy="9" r="1" fill="currentColor"/>`,
};

// Emoji string to icon name map
const EMOJI_TO_ICON = {
  "🍽️": "dish",
  "🧽": "sponge",
  "🍴": "cutlery",
  "🧼": "soap",
  "🍳": "cook",
  "🧹": "broom",
  "🗑️": "trash",
  "♻️": "recycle",
  "🧺": "laundry",
  "🧸": "toys",
  "🛏️": "bed",
  "🚗": "car",
  "🐕": "dog",
  "🦴": "petfood",
  "🪴": "plant",
  "🌿": "leaf",
  "📚": "book",
  "🎵": "music",
  "🎒": "backpack",
  "🦷": "tooth",
  "🚿": "shower",
  "⚽": "ball",
  "🏀": "ball",
  "🎮": "gamepad",
  "🎨": "art",
  "📋": "task",
  "☀️": "sun",
  "🌙": "moon",
  "📅": "calendar",
  "💰": "coins",
  "🐷": "piggy",
  "🕐": "clock",
  "🔔": "bell",
  "🔁": "repeat",
  "🔄": "rotate",
  "🏆": "trophy",
  "⭐": "star",
  "🎈": "balloon",
  "👋": "wave",
  "✏️": "pencil",
  "⚙️": "settings",
  "🔑": "key",
  "😎": "cool",
  "🦄": "unicorn",
  "🐱": "cat",
  "🐶": "dog",
  "🦊": "fox",
  "🐼": "panda",
  "🎸": "guitar",
  "🚀": "rocket",
  "✨": "sparkles",
};

/**
 * Resolves an icon key or legacy emoji character to an internal icon name.
 */
export function resolveIconName(keyOrEmoji) {
  if (!keyOrEmoji) return "task";
  if (SVG_ICONS[keyOrEmoji]) return keyOrEmoji;
  if (EMOJI_TO_ICON[keyOrEmoji]) return EMOJI_TO_ICON[keyOrEmoji];
  // Strip variation selectors if present
  const cleanKey = keyOrEmoji.replace(/[\uFE00-\uFE0F]/g, "");
  return EMOJI_TO_ICON[cleanKey] || "task";
}

/**
 * Renders an SVG icon string.
 * @param {string} keyOrEmoji - Icon key (e.g. 'dish') or legacy emoji (e.g. '🍽️')
 * @param {Object} options - Options for size, color, extra CSS classes, etc.
 */
export function renderIcon(keyOrEmoji, options = {}) {
  const {
    size = 20,
    color = "currentColor",
    className = "",
    badge = false,
    badgeBg = "var(--kid-accent, #7C5CFF)",
  } = options;

  const iconName = resolveIconName(keyOrEmoji);
  const pathSvg = SVG_ICONS[iconName] || SVG_ICONS.task;

  const svgStr = `<svg class="svg-icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" style="${color !== "currentColor" ? `color:${color};` : ""}">${pathSvg}</svg>`;

  if (badge) {
    return `<span class="icon-badge" style="background:${badgeBg}1F; color:${badgeBg}">${svgStr}</span>`;
  }

  return svgStr;
}

export { SVG_ICONS, EMOJI_TO_ICON };
