# Familiens opgaver — PWA

A small shared task tracker for the family, built as an installable PWA with
real-time sync across devices via Firebase Firestore.

## What's here
- `index.html` — app shell
- `styles.css` — visual design
- `app.js` — app logic, Firestore real-time listener
- `firebase-config.js` — **needs your Firebase project's keys** (see below)
- `manifest.json` — PWA manifest (name, colors, icons)
- `service-worker.js` — offline caching + installability
- `icons/` — drop a 192×192 and 512×512 PNG app icon here as
  `icon-192.png` and `icon-512.png`

## Setup (in Claude Code)
1. Go to https://console.firebase.google.com → create a project (free tier
   is plenty for this).
2. Add a Web App in the project, copy the config object it gives you into
   `firebase-config.js` (replace the `YOUR_...` placeholders).
3. In Firestore Database → create database → start in **test mode** for now
   (lock down rules later if you want — see note below).
4. Serve the folder over HTTPS or localhost — service workers and PWA
   install require it. Easiest: `npx serve .` from inside this folder, or
   deploy to Netlify/Vercel/Firebase Hosting (you've used Netlify before for
   Familietrackers, so that'd work too).
5. Open it on each family member's phone → "Add to Home Screen" → it
   installs like a native app, works offline, and syncs instantly when
   anyone makes a change.

## Security note
Test mode Firestore rules allow anyone with the URL to read/write. Since
this is just for your family and not public, that's probably fine — but if
you want to lock it down, add Firestore rules restricting writes to
authenticated users, or at minimum set an expiry date on the test rules
(Firebase nudges you to do this automatically).

## Customizing people
Edit the `MEMBERS` array at the top of `app.js` (name + color) — same
people show up automatically in the avatar row and assignment chips.
