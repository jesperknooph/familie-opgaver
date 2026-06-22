import { db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// The fixed set of family users. Shared with app.js so there's one source of truth.
export const MEMBERS = [
  { name: "Jesper", color: "#3D6B5C", admin: true },
  { name: "Line", color: "#B5563C", admin: true },
  { name: "Anker", color: "#2E7DAF" },
  { name: "Edith", color: "#7C5CFF" },
];

const STORAGE_KEY = "familie-opgaver:user";
const MEMBERS_COL = "members";

let currentUser = null;

export function getCurrentUser() {
  return currentUser;
}

// Parents (admins) may reset other members' PINs.
export function isAdmin(user) {
  return !!MEMBERS.find((m) => m.name === user?.name)?.admin;
}

// Clears a member's PIN. They'll choose a new one on their next login.
export async function resetPin(name) {
  await setDoc(doc(db, MEMBERS_COL, name), { pinHash: null }, { merge: true });
}

export function signOut() {
  currentUser = null;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

// Light, consistent hashing. Not real security — a 4-digit PIN never is — but it
// keeps PINs out of plaintext in the Firestore console and works in every browser
// context (incl. plain http:// on a phone, where crypto.subtle is unavailable).
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

function pinHash(name, pin) {
  return cyrb53(`familie-opgaver:${name}:${pin}`, 0x9e37);
}

// Resolves with the logged-in member. Shows the login gate when needed.
export function ensureAuth() {
  return new Promise((resolve) => {
    const remembered = localStorage.getItem(STORAGE_KEY);
    const match = MEMBERS.find((m) => m.name === remembered);
    if (match) {
      currentUser = match;
      resolve(currentUser);
      return;
    }
    renderLogin(resolve);
  });
}

function renderLogin(resolve) {
  let host = document.getElementById("login");
  if (!host) {
    host = document.createElement("div");
    host.id = "login";
    document.body.appendChild(host);
  }

  let step = "who"; // "who" | "pin"
  let selected = null; // member
  let mode = "enter"; // "enter" | "setup"
  let firstPin = ""; // first entry while setting up
  let entry = "";
  let error = "";
  let busy = false;
  let remember = true;

  async function pick(member) {
    selected = member;
    busy = true;
    error = "";
    draw();
    let hash = null;
    try {
      const snap = await getDoc(doc(db, MEMBERS_COL, member.name));
      hash = snap.exists() ? snap.data().pinHash || null : null;
    } catch (e) {
      console.error("Login lookup failed:", e);
      error = "Kunne ikke hente profil. Er du online?";
      step = "who";
      busy = false;
      draw();
      return;
    }
    mode = hash ? "enter" : "setup";
    step = "pin";
    entry = "";
    firstPin = "";
    busy = false;
    draw();
  }

  async function submitPin() {
    if (entry.length !== 4) return;

    if (mode === "setup") {
      if (firstPin === "") {
        firstPin = entry;
        entry = "";
        error = "";
        draw();
        return;
      }
      if (entry !== firstPin) {
        error = "PIN'erne matchede ikke. Prøv igen.";
        firstPin = "";
        entry = "";
        draw();
        return;
      }
      busy = true;
      draw();
      try {
        await setDoc(
          doc(db, MEMBERS_COL, selected.name),
          { pinHash: pinHash(selected.name, entry) },
          { merge: true }
        );
      } catch (e) {
        console.error("Saving PIN failed:", e);
        error = "Kunne ikke gemme PIN. Prøv igen.";
        entry = "";
        firstPin = "";
        busy = false;
        draw();
        return;
      }
      finish();
      return;
    }

    // mode === "enter"
    busy = true;
    draw();
    let snap;
    try {
      snap = await getDoc(doc(db, MEMBERS_COL, selected.name));
    } catch (e) {
      console.error("PIN check failed:", e);
      error = "Netværksfejl. Prøv igen.";
      entry = "";
      busy = false;
      draw();
      return;
    }
    const ok = snap.exists() && snap.data().pinHash === pinHash(selected.name, entry);
    if (!ok) {
      error = "Forkert PIN.";
      entry = "";
      busy = false;
      draw();
      return;
    }
    finish();
  }

  function finish() {
    currentUser = selected;
    if (remember) localStorage.setItem(STORAGE_KEY, selected.name);
    host.remove();
    resolve(currentUser);
  }

  function press(d) {
    if (busy || entry.length >= 4) return;
    entry += d;
    error = "";
    if (entry.length === 4) {
      draw();
      submitPin();
      return;
    }
    draw();
  }

  function backspace() {
    if (busy) return;
    entry = entry.slice(0, -1);
    draw();
  }

  function dotsHtml() {
    let s = "";
    for (let i = 0; i < 4; i++) {
      s += `<span class="pin-dot ${i < entry.length ? "filled" : ""}"></span>`;
    }
    return s;
  }

  function keypadHtml() {
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];
    return keys
      .map((k) => {
        if (k === "") return `<span class="key key-empty"></span>`;
        if (k === "back")
          return `<button class="key key-back" data-back="1">⌫</button>`;
        return `<button class="key" data-digit="${k}">${k}</button>`;
      })
      .join("");
  }

  function draw() {
    if (step === "who") {
      host.innerHTML = `
        <div class="login-wrap">
          <div class="login-card">
            <h1 class="login-title">Hvem er du?</h1>
            <p class="login-sub">Vælg din profil</p>
            <div class="login-avatars">
              ${MEMBERS.map(
                (m) => `
                <button class="login-avatar" data-pick="${m.name}" ${busy ? "disabled" : ""}>
                  <span class="login-circle" style="border-color:${m.color}">
                    <span style="color:${m.color}">${m.name[0]}</span>
                  </span>
                  <span class="login-name">${m.name}</span>
                </button>`
              ).join("")}
            </div>
            ${error ? `<div class="login-error">${error}</div>` : ""}
          </div>
        </div>`;
    } else {
      const prompt =
        mode === "setup"
          ? firstPin
            ? "Bekræft din nye PIN"
            : "Vælg en 4-cifret PIN"
          : "Indtast din PIN";
      host.innerHTML = `
        <div class="login-wrap">
          <div class="login-card">
            <button class="login-back" data-back-step="1">‹ tilbage</button>
            <div class="login-who">
              <span class="login-circle small" style="border-color:${selected.color}">
                <span style="color:${selected.color}">${selected.name[0]}</span>
              </span>
              <span class="login-who-name">${selected.name}</span>
            </div>
            <p class="login-sub">${prompt}</p>
            <div class="pin-dots">${dotsHtml()}</div>
            ${error ? `<div class="login-error">${error}</div>` : ""}
            <div class="keypad">${keypadHtml()}</div>
            <label class="login-remember">
              <input type="checkbox" id="rememberMe" ${remember ? "checked" : ""}/>
              Husk mig på denne enhed
            </label>
          </div>
        </div>`;
    }
    attach();
  }

  function attach() {
    host.querySelectorAll("[data-pick]").forEach((el) => {
      el.onclick = () => pick(MEMBERS.find((m) => m.name === el.dataset.pick));
    });
    host.querySelectorAll("[data-digit]").forEach((el) => {
      el.onclick = () => press(el.dataset.digit);
    });
    const backEl = host.querySelector("[data-back]");
    if (backEl) backEl.onclick = backspace;
    const backStepEl = host.querySelector("[data-back-step]");
    if (backStepEl)
      backStepEl.onclick = () => {
        step = "who";
        entry = "";
        firstPin = "";
        error = "";
        draw();
      };
    const rememberEl = host.querySelector("#rememberMe");
    if (rememberEl) rememberEl.onchange = (e) => { remember = e.target.checked; };
  }

  draw();
}
