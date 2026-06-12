import { initializeApp, getApp, getApps } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

let app: FirebaseApp | undefined;
let auth: Auth | null = null;
let db: Firestore | null = null;
let firebaseInitError: string | null = null;

try {
  if (!firebaseConfig.apiKey) {
    throw new Error("Missing VITE_FIREBASE_API_KEY configuration.");
  }

  // Remove any surrounding single/double quotes from string values
  const sanitize = (val?: string) => val ? val.replace(/['"]/g, '') : '';

  const sanitizedConfig = {
    apiKey: sanitize(firebaseConfig.apiKey),
    authDomain: sanitize(firebaseConfig.authDomain),
    projectId: sanitize(firebaseConfig.projectId),
    storageBucket: sanitize(firebaseConfig.storageBucket),
    messagingSenderId: sanitize(firebaseConfig.messagingSenderId),
    appId: sanitize(firebaseConfig.appId),
    measurementId: sanitize(firebaseConfig.measurementId),
  };

  app = getApps().length === 0 ? initializeApp(sanitizedConfig) : getApp();
  auth = getAuth(app);
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch (error: any) {
  console.error("Firebase initialization failed:", error);
  firebaseInitError = error?.message || String(error);
}

export { auth, db, firebaseInitError };
export default app;
