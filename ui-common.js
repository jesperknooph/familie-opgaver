let updateCallback = () => {};

export function initUiCommon(renderCb) {
  updateCallback = renderCb;
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
