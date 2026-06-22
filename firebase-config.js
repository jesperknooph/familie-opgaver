// Fill these in with your own Firebase project's config
// (Firebase Console → Project settings → General → Your apps → SDK setup)
// This mirrors the setup used in your other family app, "Familietrackers".

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  enableIndexedDbPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCsYsHYz6vEra9t2gliRwAMFYgklbUy7Lc",
  authDomain: "familie-opgaver-bf88a.firebaseapp.com",
  projectId: "familie-opgaver-bf88a",
  storageBucket: "familie-opgaver-bf88a.firebasestorage.app",
  messagingSenderId: "983955283320",
  appId: "1:983955283320:web:836ff6c33ceb55bb39bc8d",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Lets the app keep working offline and sync once back online.
enableIndexedDbPersistence(db).catch((err) => {
  console.warn("Offline persistence not enabled:", err.code);
});

// Anonymous Authentication: each device silently gets a Firebase auth token so
// security rules can require an authenticated request. The app awaits `authReady`
// before any Firestore access. On later loads the existing anonymous user is
// returned, so the device's uid stays stable.
export const auth = getAuth(app);
export const authReady = signInAnonymously(auth)
  .then((cred) => cred.user)
  .catch((err) => {
    console.error("Anonymous sign-in failed:", err);
    throw err;
  });
