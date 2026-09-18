# Familiens opgaver — PWA

A shared task tracker for the family: an installable Progressive Web App with
real-time sync across devices via Firebase Firestore. Plain HTML/CSS/JS modules,
no build step.

**Live:** https://kh-opgaver.netlify.app/

## Features
- Add / complete / delete tasks, filter by family member; tap a task to edit
  everything (label, emoji, date, time, alarm, repeat, assignee, stars)
- **I dag**, **Liste** and **Uge** (week) views — the week view groups tasks by
  day with overdue and no-date sections
- Recurring tasks; a recurring task with several people selected **rotates**
  assignee each time it's completed ("skiftes")
- **Points**: tasks can carry a star value; completions are logged and a weekly
  tally per member shows above the add card (resets Monday)
- **Allowance (kr)**: parents can put a Danish-krone value on a task; earned kr
  total per child each week (also resets Monday) and show in both the parent
  tally and each kid's own view. A parents-only **💰 Lommepenge** ledger tracks a
  running "til gode" balance per child (all-time earned − paid) with a **Betal ud**
  action that records each payout as durable history
- **Loans (kr)**: a parents-only **🏦 Lån** ledger tracks money lent to a child
  (e.g. an advance for clothes) against a running "skyldes" balance (all-time
  lent − repaid), with an optional reason per loan and a **Registrér betaling**
  action that logs each repayment as durable history
- Deleting shows a brief "Fortryd" undo snackbar
- PIN login per person; "remember me" per device
- Parent admins (Jesper, Line) can reset anyone's PIN
- Real-time multi-device sync; works offline and re-syncs when back online
- **Keyboard-first on desktop**: every control is reachable, the whole task list
  is a single tab stop with arrow keys inside it, and `?` shows the shortcuts

## Files
| File | Purpose |
|------|---------|
| `index.html` | App shell + service-worker registration |
| `styles.css` | Visual design |
| `app.js` | Task logic, views, Firestore real-time listener |
| `auth.js` | Login gate, PINs, `MEMBERS` list, admin reset |
| `keyboard.js` | Desktop keyboard navigation: focus that survives re-renders, roving arrow-key groups, the shortcut dispatcher and the `?` cheat sheet |
| `firebase-config.js` | Firebase init, Firestore, Anonymous Auth (`authReady`) |
| `firestore.rules` | Security rules (source of truth — paste into console to publish) |
| `manifest.json` | PWA manifest |
| `service-worker.js` | Offline caching + installability (bump `CACHE_NAME` on changes) |
| `netlify.toml` | Static-site deploy config + service-worker cache header |
| `icons/` | `icon-192.png`, `icon-512.png` |

## Keyboard (desktop)
Press `?` in the app for the live list — it is generated from the registry in
`keyboard.js`, so it can never drift from what the keys actually do.

| Key | Does |
|-----|------|
| `n` | New task |
| `1` `2` `3` | I dag / Liste / Uge (kid mode: `1` `2`) |
| `t` | Back to today / this week |
| `←` `→` | Previous / next week (in Uge view) |
| `f` / `a` | Cycle the person filter / show everyone again |
| `p` `l` `i` `m` | Lommepenge / Lån / Indstillinger / light-dark |
| `j` `k` | Jump into the task list |
| `↑` `↓` | Previous / next task |
| `←` `→` | Within a task: tick ↔ task ↔ delete |
| `Enter` / `x` / `Delete` | Edit / tick off / delete the focused task |
| `?` / `Esc` | Cheat sheet / close a sheet |

Three mechanisms make it work, all in `keyboard.js`:
- **`keepFocus(render)`** — renders rewrite regions with `innerHTML`, which drops
  focus to `<body>`. This re-finds the same control afterwards, and falls back to
  whatever took its place when the control is gone (a deleted task).
- **`roving()` / `taskGrid()`** — a group of buttons is one tab stop with the
  arrows moving inside it (only the current item has `tabindex="0"`). Without it
  the template gallery alone costs 26 tab presses to walk past.
- **`setShortcuts()`** — one document-level dispatcher. It stands down while you
  are typing in a field and while a sheet is open, and leaves the arrow keys to
  whichever group has focus.

When adding a control, give it a `data-*` hook that is listed in `KEY_ATTRS` if
focus should survive a re-render on it.

## Firebase
- Project: `familie-opgaver-bf88a` (Spark / free tier)
- Firestore collections:
  - `tasks` — `{ label, emoji, assignedTo, done, due, time, alarm, repeat,
    rotation, points, money, ts }` (`rotation` = list of names a recurring chore
    alternates between; `points` = star value; `money` = kr allowance value,
    whole kroner)
  - `completions` — one doc per task per day (id `taskId:date`):
    `{ name, date, label, emoji, points, money, ts }` — drives the weekly points
    and kr (allowance) tallies
  - `payouts` — one doc per allowance settlement: `{ name, amount, date, ts }`.
    A child's "til gode" balance is derived, never stored: all-time kr earned
    (summed from `completions.money`) minus all-time kr paid out (summed from
    `payouts.amount`). Payouts are immutable history (deletable to undo)
  - `loans` — one doc per loan handed to a child: `{ name, amount, reason, date, ts }`
    (`reason` optional, e.g. "tøj")
  - `loanPayments` — one doc per repayment: `{ name, amount, date, ts }`. A
    child's "skyldes" balance is derived, never stored: all-time kr lent
    (`loans.amount`) minus all-time kr repaid (`loanPayments.amount`). Both
    collections are immutable history (deletable to undo), and both are kept
    live in full (unlike `completions`, this history stays small)
  - `members` — one doc per person (`{ pinHash }`); PINs are hashed, not plaintext
- Auth: **Anonymous Authentication** — each device silently gets a token so the
  security rules can require an authenticated request. (This is not per-person
  identity; the family login is the client-side PIN picker.)

### Security model (light by design)
The PIN login is "keep-kids-honest" protection, not real account security —
anyone with the public config could still read/write valid data. The published
rules require an auth token and validate document shape. For true per-user
security you'd add a real sign-in method (e.g. email/password) per member.

### Re-publishing rules / auth (do in this order)
1. Firebase console → Authentication → enable **Anonymous** sign-in.
2. Deploy the app code that calls `signInAnonymously` (already in `firebase-config.js`).
3. Firestore → Rules → paste `firestore.rules` → **Publish**.

## Customising people
Edit the `MEMBERS` array at the top of `auth.js` (name, color, optional
`admin: true`). They appear automatically in the login screen, avatar filter,
and assignment chips.

## Local development
Service workers need a secure context, so use `localhost` (not a file:// path or
a LAN IP over http):
```bash
python3 -m http.server 8000      # then open http://localhost:8000/
# or: npx serve .
```

## Deploy
Hosted on **Netlify**, auto-deploying from the `main` branch of
`github.com/jesperknooph/familie-opgaver`. To publish a change:
```bash
git add -A && git commit -m "describe the change" && git push
```
Netlify normally rebuilds and publishes in ~30s. (There's no build step —
`netlify.toml` sets publish directory to the repo root.)

Prefer `./deploy.sh "message"`: it bumps the service-worker cache version and
then **waits for the new version to actually appear on the live site**, exiting
non-zero if it doesn't. A push is not a deploy — builds can be skipped (e.g. when
the Netlify account's credit limit is hit, which silently blocked every deploy
from 2026-07-19 onward), and without that check a failed deploy looks identical
to a successful one.
