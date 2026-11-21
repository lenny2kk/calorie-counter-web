import { initializeApp, cert, getApps } from 'firebase-admin/app';
import type { App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getAuth } from 'firebase-admin/auth';
import { timingSafeEqual } from 'node:crypto';

/**
 * Konto serwisowe Firebase z zmiennej FIREBASE_SERVICE_ACCOUNT
 * (cały plik JSON z konsoli Firebase – jako tekst albo zakodowany w base64).
 */
const loadServiceAccount = () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('Brak zmiennej FIREBASE_SERVICE_ACCOUNT');
  const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return JSON.parse(json);
};

let app: App | undefined;
const adminApp = () => {
  if (!app) app = getApps()[0] ?? initializeApp({ credential: cert(loadServiceAccount()) });
  return app;
};

export const adminDb = () => getFirestore(adminApp());
export const adminMessaging = () => getMessaging(adminApp());
export const adminAuth = () => getAuth(adminApp());

/** Porównanie sekretu w stałym czasie (ochrona przed atakiem czasowym). */
export const secretMatches = (given: string | null, expected: string | undefined) => {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * Wysyła powiadomienie na wszystkie urządzenia użytkownika i usuwa tokeny, które wygasły.
 * Zwraca liczbę udanych wysyłek.
 */
export const sendToUser = async (
  uid: string,
  message: { title: string; body: string; tag?: string; url?: string },
): Promise<number> => {
  const db = adminDb();
  const tokensSnap = await db.collection('users').doc(uid).collection('pushTokens').get();
  const tokenDocs = tokensSnap.docs.filter((d) => typeof d.get('token') === 'string');
  if (tokenDocs.length === 0) return 0;

  const res = await adminMessaging().sendEach(
    tokenDocs.map((d) => ({
      token: d.get('token') as string,
      // Wiadomość „data-only” – treść pokazuje nasz service worker (public/sw.js)
      data: {
        title: message.title,
        body: message.body,
        tag: message.tag ?? 'calorie-counter',
        url: message.url ?? '/',
      },
      webpush: { headers: { Urgency: 'high', TTL: '3600' } },
    })),
  );

  await Promise.all(
    res.responses.map((r, i) =>
      !r.success && r.error && INVALID_TOKEN_CODES.has(r.error.code) ? tokenDocs[i].ref.delete() : null,
    ),
  );
  return res.successCount;
};
