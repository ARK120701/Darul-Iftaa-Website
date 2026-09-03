/*
  Firebase configuration — REPLACE with your own project's values.

  1. Create a project at https://console.firebase.google.com
  2. Add a Web App to the project, copy the config object it gives you into
     FIREBASE_CONFIG below.
  3. Enable Firestore (Build > Firestore Database > Create database).
  4. Deploy the rules in firestore.rules to that database
     (Firestore Database > Rules tab > paste > Publish).
  5. Enable Email/Password sign-in (Build > Authentication > Sign-in method),
     then add yourself as a user (Authentication > Users > Add user) — that
     email/password is what you'll use to log into the admin panel on the
     Iftaa page (the lock icon, bottom-right).

  Until you fill this in, the site keeps working — it just falls back to
  storing fatwas in the browser's localStorage instead of syncing to the
  cloud (see the FIREBASE_ENABLED check in iftaa.html).
*/
const FIREBASE_ENABLED = false;

const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
