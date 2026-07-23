// ============================================================
// 1) Paste your Firebase project's web config here.
//    Get it from: Firebase Console → Project settings →
//    "Your apps" → Web app (</>) → SDK setup and configuration.
//    This config is public/safe to publish - it is not a secret.
//    Real protection happens in firestore.rules.
// ============================================================
export const firebaseConfig = {
 apiKey: "AIzaSyDAMMbmhzJozyn_R4sXVKTrkUiyysDzELI",
  authDomain: "utility-tracker-66568.firebaseapp.com",
  projectId: "utility-tracker-66568",
  storageBucket: "utility-tracker-66568.firebasestorage.app",
  messagingSenderId: "313043893805",
  appId: "1:313043893805:web:42ebf92bb72aea6ddcc2a4"};

// ============================================================
// 2) List the Google account emails that are allowed to use
//    this app. This is a first line of defense in the UI -
//    the real enforcement is in firestore.rules (see README).
// ============================================================
export const allowedEmails = [
  "barak.shir.gordon@gmail.com",
  "shirya93@gmail.com"
];

// ============================================================
// 3) reCAPTCHA v3 site key, used by Firebase App Check to
//    protect the Gemini API (needed for the photo auto-fill
//    feature). Get this from Firebase Console → Build → App
//    Check → Apps → register your web app. See README.
// ============================================================
export const recaptchaSiteKey = "6LepOmItAAAAAGu6jOA3KPS9MFn2S1h24k7-jTtF";
