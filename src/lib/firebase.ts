import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDMe5HJcGDxjE-olKyDCDo7bmn2Wy3zRXE",
  authDomain: "ai-fitness-tracker-a45de.firebaseapp.com",
  projectId: "ai-fitness-tracker-a45de",
  storageBucket: "ai-fitness-tracker-a45de.firebasestorage.app",
  messagingSenderId: "1033267648703",
  appId: "1:1033267648703:web:98644e9b24872b54cd8e0a",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
