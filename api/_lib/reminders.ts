/** Czysta logika przypomnień – bez Firebase, łatwa do przetestowania. */

export interface Reminder {
  id: string;
  hour: number;
  minute: number;
}

export interface LocalNow {
  date: string; // YYYY-MM-DD w strefie użytkownika
  minutes: number; // minuty od północy w strefie użytkownika
}

/** Bieżąca data i godzina w podanej strefie czasowej (np. "Europe/Warsaw"). */
export const localNow = (now: Date, timeZone: string): LocalNow => {
  let tz = timeZone;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
  } catch {
    tz = 'Europe/Warsaw';
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
};

/**
 * Przypomnienia do wysłania teraz: godzina już minęła, ale nie dawniej niż `windowMinutes`
 * (harmonogram GitHub Actions bywa spóźniony), i nie zostały dziś jeszcze wysłane.
 */
export const dueReminders = (
  reminders: Reminder[],
  now: LocalNow,
  sentOn: Record<string, string>,
  windowMinutes = 30,
): Reminder[] =>
  reminders.filter((r) => {
    if (!Number.isInteger(r.hour) || !Number.isInteger(r.minute)) return false;
    const at = r.hour * 60 + r.minute;
    const late = now.minutes - at;
    return late >= 0 && late < windowMinutes && sentOn[r.id] !== now.date;
  });

const mealFor = (hour: number) =>
  hour < 11 ? 'śniadanie' : hour < 15 ? 'obiad' : hour < 20 ? 'kolację' : 'ostatni posiłek';

/** Treść przypomnienia z dzisiejszym bilansem kalorii. */
export const reminderMessage = (
  reminder: Reminder,
  eatenToday: number,
  tdee: number,
  isStrictLimitMode: boolean,
): { title: string; body: string } => {
  const title = `Czas na ${mealFor(reminder.hour)} 🍽️`;
  if (eatenToday <= 0) {
    return { title, body: `Nie masz dziś jeszcze wpisów. Cel na dziś: ${tdee} kcal.` };
  }
  const left = tdee - eatenToday;
  if (isStrictLimitMode) {
    return {
      title,
      body: left >= 0
        ? `Zjedzone ${eatenToday} z ${tdee} kcal – zostało ${left} kcal. Zapisz posiłek.`
        : `Limit przekroczony o ${-left} kcal. Postaw na coś lekkiego i bogatego w białko.`,
    };
  }
  return {
    title,
    body: left > 0
      ? `Zjedzone ${eatenToday} z ${tdee} kcal – do celu brakuje ${left} kcal.`
      : `Cel ${tdee} kcal osiągnięty (${eatenToday} kcal). Tak trzymaj!`,
  };
};
