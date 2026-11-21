import { adminDb, json, secretMatches, sendToUser } from './_lib/firebaseAdmin.js';
import { dueReminders, localNow, reminderMessage } from './_lib/reminders.js';
import type { Reminder } from './_lib/reminders.js';

/**
 * Wywoływane co ~10 minut przez GitHub Actions (.github/workflows/meal-reminders.yml).
 * Dla każdego użytkownika z zarejestrowanym urządzeniem sprawdza jego przypomnienia
 * w jego strefie czasowej i wysyła te, których godzina właśnie minęła.
 */
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null;
  if (!secretMatches(auth, process.env.CRON_SECRET)) {
    return json(401, { error: 'Brak autoryzacji' });
  }

  const db = adminDb();
  const now = new Date();

  // Użytkownicy z co najmniej jednym urządzeniem → strefa czasowa z ostatnio zapisanego tokenu
  const tokensSnap = await db.collectionGroup('pushTokens').get();
  const timeZones = new Map<string, string>();
  for (const d of tokensSnap.docs) {
    const uid = d.ref.parent.parent?.id;
    if (uid) timeZones.set(uid, (d.get('timeZone') as string) || 'Europe/Warsaw');
  }

  let notified = 0;
  const errors: string[] = [];

  await Promise.all(
    [...timeZones.entries()].map(async ([uid, timeZone]) => {
      try {
        const userRef = db.collection('users').doc(uid);
        const [statsSnap, stateSnap] = await Promise.all([
          userRef.collection('statistics').doc('data').get(),
          userRef.collection('private').doc('push').get(),
        ]);
        const reminders = (statsSnap.get('reminders') as Reminder[] | undefined) ?? [];
        if (reminders.length === 0) return;

        const local = localNow(now, timeZone);
        const sentOn = (stateSnap.get('sentOn') as Record<string, string> | undefined) ?? {};
        const due = dueReminders(reminders, local, sentOn);
        if (due.length === 0) return;

        // Dzisiejszy bilans do treści powiadomienia
        const [profileSnap, mealsSnap] = await Promise.all([
          userRef.collection('profile').doc('data').get(),
          userRef.collection('meals').doc(local.date).get(),
        ]);
        const tdee = Number(profileSnap.get('tdee')) || 2000;
        const strict = profileSnap.get('isStrictLimitMode') !== false;
        const eaten = ['breakfast', 'lunch', 'dinner', 'snacks'].reduce(
          (sum, m) => sum + (Number(mealsSnap.get(`${m}.calories`)) || 0),
          0,
        );

        // Kilka zaległych przypomnień naraz → jedno powiadomienie (najpóźniejsze)
        const latest = due.reduce((a, b) => (a.hour * 60 + a.minute >= b.hour * 60 + b.minute ? a : b));
        const sent = await sendToUser(uid, { ...reminderMessage(latest, Math.round(eaten), tdee, strict), tag: 'meal-reminder' });
        if (sent > 0) notified++;

        const update: Record<string, string> = {};
        for (const r of due) update[r.id] = local.date;
        await userRef.collection('private').doc('push').set({ sentOn: { ...sentOn, ...update } }, { merge: true });
      } catch (err) {
        errors.push(`${uid.slice(0, 6)}…: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
  );

  return json(errors.length ? 207 : 200, { users: timeZones.size, notified, errors });
}
