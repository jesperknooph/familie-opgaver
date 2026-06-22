# Familiens opgaver — PWA

A shared task tracker for the family: an installable Progressive Web App with
real-time sync across devices via Firebase Firestore. Plain HTML/CSS/JS modules,
no build step.

**Live:** https://kh-opgaver.netlify.app/

## Features
- Add / complete / delete tasks, filter by family member
- **Liste** and **Uge** (week) views — the week view groups tasks by day with
  overdue and no-date sections
- PIN login per person; "remember me" per device
- Parent admins (Jesper, Line) can reset anyone's PIN
- Real-time multi-device sync; works offline and re-syncs when back online

## Files
| File | Purpose |
|------|---------|
| `index.html` | App shell + service-worker registration |
| `styles.css` | Visual design |
| `app.js` | Task logic, views, Firestore real-time listener |
| `auth.js` | Login gate, PINs, `MEMBERS` list, admin reset |
| `firebase-config.js` | Firebase init, Firestore, Anonymous Auth (`authReady`) |
| `firestore.rules` | Security rules (source of truth — paste into console to publish) |
| `manifest.json` | PWA manifest |
| `service-worker.js` | Offline caching + installability (bump `CACHE_NAME` on changes) |
| `netlify.toml` | Static-site deploy config + service-worker cache header |
| `icons/` | `icon-192.png`, `icon-512.png` |

## Firebase
- Project: `familie-opgaver-bf88a` (Spark / free tier)
- Firestore collections:
  - `tasks` — `{ label, assignedTo, done, due, ts }`
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
Netlify rebuilds and publishes in ~30s. (There's no build step — `netlify.toml`
sets publish directory to the repo root.)
