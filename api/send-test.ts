import { adminAuth, adminDb, json, sendToUser } from './_lib/firebaseAdmin.js';

/** Testowe powiadomienie na urządzenia zalogowanego użytkownika (z Ustawień). */
export async function POST(request: Request) {
  const idToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!idToken) return json(401, { error: 'Brak autoryzacji' });

  let uid: string;
  try {
    uid = (await adminAuth().verifyIdToken(idToken)).uid;
  } catch {
    return json(401, { error: 'Sesja wygasła – zaloguj się ponownie.' });
  }

  // Prosty limit: jeden test na 30 sekund
  const stateRef = adminDb().collection('users').doc(uid).collection('private').doc('push');
  const last = (await stateRef.get()).get('lastTestAt') as number | undefined;
  if (last && Date.now() - last < 30_000) {
    return json(429, { error: 'Poczekaj chwilę przed kolejnym testem.' });
  }
  await stateRef.set({ lastTestAt: Date.now() }, { merge: true });

  try {
    const sent = await sendToUser(uid, {
      title: 'Powiadomienia działają ✅',
      body: 'Tak będą wyglądać przypomnienia o posiłkach z CalorieCounter.',
      tag: 'test',
    });
    return json(200, { sent });
  } catch (err) {
    console.error('send-test failed', err);
    return json(500, { error: 'Nie udało się wysłać powiadomienia.' });
  }
}
