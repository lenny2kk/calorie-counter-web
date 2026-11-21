import { getMessaging, getToken, deleteToken, isSupported } from 'firebase/messaging';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import app from './firebase';
import { db } from './firebase';

/**
 * Powiadomienia push przez Firebase Cloud Messaging.
 * Token urządzenia trafia do users/{uid}/pushTokens/{id}; serwer (api/send-reminders)
 * czyta tokeny i przypomnienia użytkownika i wysyła powiadomienia o wybranych godzinach.
 */

const VAPID_KEY = (import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined)?.replace(/['"]/g, '').trim();
const LOCAL_TOKEN_ID = 'cc-push-token-id';

export type PushSupport = 'supported' | 'needs-install' | 'unsupported' | 'not-configured';

const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const getPushSupport = async (): Promise<PushSupport> => {
  if (!VAPID_KEY) return 'not-configured';
  // Na iPhonie/iPadzie Web Push działa tylko w aplikacji dodanej do ekranu początkowego (iOS 16.4+)
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('Notification' in window) || !('PushManager' in window)) return 'unsupported';
  return (await isSupported().catch(() => false)) ? 'supported' : 'unsupported';
};

export const isPushEnabledHere = () =>
  'Notification' in window && Notification.permission === 'granted' && !!localStorage.getItem(LOCAL_TOKEN_ID);

const sha256 = async (text: string) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

export const registerServiceWorker = () => navigator.serviceWorker.register('/sw.js', { scope: '/' });

/** Prosi o zgodę, rejestruje urządzenie w FCM i zapisuje token na koncie użytkownika. */
export const enablePush = async (uid: string): Promise<void> => {
  if (!app || !db) throw new Error('Brak połączenia z Firebase.');
  if (!VAPID_KEY) throw new Error('Powiadomienia nie są jeszcze skonfigurowane (brak klucza VAPID).');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Powiadomienia są zablokowane. Zezwól na nie w ustawieniach przeglądarki lub telefonu.');
  }

  const registration = await registerServiceWorker();
  await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) throw new Error('Nie udało się zarejestrować urządzenia do powiadomień.');

  const id = (await sha256(token)).slice(0, 40);
  await setDoc(doc(db, 'users', uid, 'pushTokens', id), {
    token,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw',
    platform: isIOS() ? 'ios' : /Android/i.test(navigator.userAgent) ? 'android' : 'desktop',
    updatedAt: serverTimestamp(),
  });
  localStorage.setItem(LOCAL_TOKEN_ID, id);
};

/** Wyrejestrowuje to urządzenie – inne urządzenia użytkownika dalej dostają powiadomienia. */
export const disablePush = async (uid: string): Promise<void> => {
  const id = localStorage.getItem(LOCAL_TOKEN_ID);
  localStorage.removeItem(LOCAL_TOKEN_ID);
  if (app) await deleteToken(getMessaging(app)).catch(() => {});
  if (db && id) await deleteDoc(doc(db, 'users', uid, 'pushTokens', id)).catch(() => {});
};

/** Prosi serwer o wysłanie testowego powiadomienia na wszystkie urządzenia użytkownika. */
export const sendTestPush = async (idToken: string): Promise<number> => {
  const res = await fetch('/api/send-test', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Błąd serwera (${res.status})`);
  return Number(body?.sent ?? 0);
};
