let updateCallback = () => {};

export function initUiCommon(renderCb) {
  updateCallback = renderCb;
}

/* --- Sheets (modal dialogs) ---
   Every pop-out in the app goes through openSheet(). It gives them the dialog
   behaviour the hand-rolled hosts never had — Escape to close, a tab trap,
   focus restored to whatever opened the sheet, and the page behind frozen —
   and absorbs the create-host / close / backdrop-click boilerplate that each
   sheet used to repeat.

   Sheets can stack (Settings → Nulstil PIN), so keydown is resolved against
   the top of this stack rather than per-sheet. */
const sheetStack = [];

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function openSheet(id) {
  // Re-opening a sheet that is already up (a double tap, or a re-render
  // rebinding the opener) has to retire the old one through close(): dropping
  // just its element would leave a stale entry on the stack still holding the
  // scroll lock, so the page would stay frozen after the new sheet closed.
  sheetStack.find((s) => s.host.id === id)?.close();
  document.getElementById(id)?.remove();

  const host = document.createElement("div");
  host.id = id;
  host.className = "sheet-host";
  document.body.appendChild(host);

  // Whatever had focus when the sheet opened gets it back on close, so keyboard
  // users land back on the button they came from instead of at the top of the page.
  const returnFocusTo = document.activeElement;
  const entry = { host, close };

  sheetStack.push(entry);
  document.body.classList.add("sheet-open");
  document.addEventListener("keydown", onKeydown, true);

  function visibleFocusables() {
    // getClientRects() rather than offsetParent: the host is position:fixed,
    // for which offsetParent is null even when the element is plainly visible.
    return [...host.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
  }

  function onKeydown(e) {
    if (sheetStack[sheetStack.length - 1] !== entry) return; // not the top sheet
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "Tab") return;

    const items = visibleFocusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];

    if (!host.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function close() {
    const i = sheetStack.indexOf(entry);
    if (i === -1) return; // already closed
    sheetStack.splice(i, 1);
    document.removeEventListener("keydown", onKeydown, true);
    host.remove();
    if (!sheetStack.length) document.body.classList.remove("sheet-open");
    if (returnFocusTo?.isConnected) returnFocusTo.focus();
  }

  // Call with the .modal-card markup; the dialog wrapper is added here. Sheets
  // that redraw themselves (payout, look, settings) just call mount() again.
  function mount(cardHtml) {
    host.innerHTML = `<div class="modal-wrap" role="dialog" aria-modal="true">${cardHtml}</div>`;
    const wrap = host.firstElementChild;

    wrap.onclick = (e) => {
      if (e.target === wrap) close();
    };
    host.querySelectorAll("[data-close]").forEach((el) => (el.onclick = close));

    // Name the dialog from its own heading, so no call site has to pass one.
    const title = host.querySelector(".modal-title");
    if (title) {
      if (!title.id) title.id = `${id}-title`;
      wrap.setAttribute("aria-labelledby", title.id);
    }

    // Move focus in so the dialog is announced and the trap has an anchor, but
    // only when focus isn't already inside — a redraw shouldn't yank the user
    // out of a field. Deliberately the card and not the first input: these
    // sheets are mostly used on phones, where auto-focusing a text field would
    // throw up the keyboard over the content above it.
    if (!host.contains(document.activeElement)) {
      const card = host.querySelector(".modal-card") || wrap;
      card.setAttribute("tabindex", "-1");
      card.focus({ preventScroll: true });
    }
    return host;
  }

  return { host, mount, close };
}

/* --- Inline field validation ---
   Replaces alert() for "you left this empty" cases: the message appears next to
   the offending field, focus moves there, and it clears as soon as you type. */
export function fieldError(input, msg) {
  if (!input) return;
  clearFieldError(input);

  input.classList.add("invalid", "shake");
  input.setAttribute("aria-invalid", "true");
  input.addEventListener("animationend", () => input.classList.remove("shake"), { once: true });

  const err = document.createElement("div");
  err.className = "field-error";
  err.setAttribute("role", "alert");
  err.textContent = msg;
  errorAnchor(input).insertAdjacentElement("afterend", err);

  input.focus();
  input.addEventListener("input", () => clearFieldError(input), { once: true });
}

export function clearFieldError(input) {
  if (!input) return;
  input.classList.remove("invalid");
  input.removeAttribute("aria-invalid");
  const next = errorAnchor(input).nextElementSibling;
  if (next?.classList.contains("field-error")) next.remove();
}

// Hang the message off the input's row, not the input itself — several of these
// fields sit in flex rows where an injected sibling would land beside the input
// instead of under it.
function errorAnchor(input) {
  return input.closest(".label-row, .money-field, .payout-pay-row") || input;
}

// Manual light/dark switch. Until the 🌙/☀️ button is tapped, the app follows
// the device setting (the head script in index.html applies it pre-paint);
// after a tap the choice is saved per device and wins over the system.
export function applyTheme(dark) {
  document.documentElement.classList.toggle("dark", dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? "#0A0E1C" : "#EAEFFB";
}

export function toggleTheme() {
  const dark = !document.documentElement.classList.contains("dark");
  localStorage.setItem("theme", dark ? "dark" : "light");
  applyTheme(dark);
  updateWithTransition(); // refresh the button icon
}

// Track live system changes only while no manual choice is saved.
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
  if (!localStorage.getItem("theme")) {
    applyTheme(e.matches);
    updateWithTransition();
  }
});

export function updateWithTransition(callback) {
  const cb = callback || updateCallback;
  if (document.startViewTransition) {
    document.startViewTransition(cb);
  } else {
    cb();
  }
}

// A confetti burst from the checkbox when a task is completed.
export function confettiBurst(anchor, color, big = false) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const rect = anchor.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const colors = [color, "#FFC53D", "#FF5E7A", "#38BDF8", "#4ADE80", "#A78BFA"];
  const count = big ? 60 : 22;
  for (let i = 0; i < count; i++) {
    const bit = document.createElement("span");
    bit.className = "confetti-bit";
    const size = 5 + Math.random() * (big ? 7 : 6);
    const h = Math.random() > 0.5 ? size : size * 0.4;
    bit.style.cssText = `left:${cx}px; top:${cy}px; width:${size}px; height:${h}px; background:${colors[i % colors.length]};`;
    document.body.appendChild(bit);
    const angle = Math.random() * Math.PI * 2;
    const dist = (big ? 90 : 40) + Math.random() * (big ? 160 : 80);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - (big ? 120 : 60);
    bit
      .animate(
        [
          { transform: "translate(0, 0) rotate(0deg) scale(1)", opacity: 1 },
          {
            transform: `translate(${dx}px, ${dy + (big ? 260 : 120)}px) rotate(${Math.random() * 720 - 360}deg) scale(0.5)`,
            opacity: 0,
          },
        ],
        {
          duration: (big ? 1100 : 700) + Math.random() * 600,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "forwards",
        }
      )
      .onfinish = () => bit.remove();
  }
}
