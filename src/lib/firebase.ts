import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIza....",
  authDomain: "fitcoach-24d4a.firebaseapp.com",
  projectId: "fitcoach-24d4a",
  storageBucket: "fitcoach-24d4a.firebasestorage.app",
  messagingSenderId: "214057135700",
  appId: "1:214057135700:web:336dd7d722652849a287c1",
  measurementId: "G-EFVZ8ZDND5"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
