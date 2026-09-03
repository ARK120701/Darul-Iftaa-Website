/*
  Firebase configuration for the Darul Iftaa New York project (dunydaruliftaa).

  Still to do before the admin panel is fully live:
  1. Deploy the rules in firestore.rules to this project's Firestore
     (Firebase Console > Firestore Database > Rules tab > paste > Publish).
  2. Enable Email/Password sign-in (Build > Authentication > Sign-in method).
  3. Add yourself as a user (Authentication > Users > Add user) — that
     email/password is what you'll use to log into the admin panel on the
     Iftaa page (the lock icon, bottom-right).

  If Firestore/Auth aren't set up yet, the site still works fine — it just
  falls back to storing fatwas in the browser's localStorage instead of
  syncing to the cloud (see the FIREBASE_ENABLED check in iftaa.html).
*/
const FIREBASE_ENABLED = true;

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyApHMimSRaI1Dx3pJAbstC_0Mo30CWvWfk",
  authDomain: "dunydaruliftaa.firebaseapp.com",
  projectId: "dunydaruliftaa",
  storageBucket: "dunydaruliftaa.firebasestorage.app",
  messagingSenderId: "535860811822",
  appId: "1:535860811822:web:9ed4421a106fbd00dce7bf",
  measurementId: "G-S1J3HN493C"
};
