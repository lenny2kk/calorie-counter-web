import type { HistoricalDay, WeightEntry, WorkoutEntry } from '../types';
import { computeMacroGoals, weeklyWeightPace, weightChangeOver, DAY_MS } from '../utils/nutrition';
import type { MacroGoals } from '../utils/nutrition';

/** Wszystko, co Dietetyk AI wie o użytkowniku przy generowaniu raportu (tylko liczby, bez nazw produktów). */
export interface DietitianContext {
  /** Analizowany dzień (YYYY-MM-DD) */
  date: string;
  isToday: boolean;
  /** Godzina wygenerowania raportu, np. "18:40" (ma znaczenie tylko dla dzisiejszego dnia) */
  time: string;
  isStrictLimitMode: boolean;
  tdee: number;
  goals: MacroGoals;
  day: { calories: number; protein: number; carbs: number; fat: number };
  /** 7 dni poprzedzających analizowany dzień – tylko dni z wpisami */
  week: {
    loggedDays: number;
    avgCalories: number;
    avgProtein: number;
    avgCarbs: number;
    avgFat: number;
    daysOverTarget: number;
    daysProteinBelowGoal: number;
    days: { date: string; calories: number; protein: number }[];
  } | null;
  weight: {
    current: number;
    lastMeasured: string | null;
    pacePerWeek: number | null;
    change30d: number | null;
    measurements30d: number;
  };
  workouts: { sessions7d: number; exercises7d: string[] };
}

const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ymdToTs = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};
const r1 = (v: number) => Math.round(v * 10) / 10;

export const buildDietitianContext = (args: {
  date: string;
  day: { calories: number; protein: number; carbs: number; fat: number };
  tdee: number;
  isStrictLimitMode: boolean;
  profileWeight: number;
  historicalDays: HistoricalDay[];
  weightLog: WeightEntry[];
  workoutEntries: WorkoutEntry[];
  now?: Date;
}): DietitianContext => {
  const now = args.now ?? new Date();
  const dayTs = ymdToTs(args.date);
  const goals = computeMacroGoals(args.tdee, args.profileWeight, args.isStrictLimitMode);

  // ── Ostatnie 7 dni (bez analizowanego) ───────────────────────────────────
  const weekDays = args.historicalDays
    .map((h) => ({ ...h, ymd: toYMD(new Date(h.date)) }))
    .filter((h) => {
      const t = ymdToTs(h.ymd);
      return t < dayTs && t >= dayTs - 7 * DAY_MS && h.caloriesEaten > 0;
    })
    .sort((a, b) => a.ymd.localeCompare(b.ymd));

  const avg = (f: (h: (typeof weekDays)[number]) => number) =>
    weekDays.length ? Math.round(weekDays.reduce((s, h) => s + f(h), 0) / weekDays.length) : 0;

  const overTarget = (kcal: number) =>
    args.isStrictLimitMode ? kcal > args.tdee : kcal < args.tdee * 0.95;

  const week = weekDays.length
    ? {
        loggedDays: weekDays.length,
        avgCalories: avg((h) => h.caloriesEaten),
        avgProtein: avg((h) => h.protein ?? 0),
        avgCarbs: avg((h) => h.carbs ?? 0),
        avgFat: avg((h) => h.fat ?? 0),
        daysOverTarget: weekDays.filter((h) => overTarget(h.caloriesEaten)).length,
        daysProteinBelowGoal: weekDays.filter((h) => (h.protein ?? 0) < goals.protein * 0.9).length,
        days: weekDays.map((h) => ({ date: h.ymd, calories: h.caloriesEaten, protein: Math.round(h.protein ?? 0) })),
      }
    : null;

  // ── Waga ─────────────────────────────────────────────────────────────────
  const logUpToDay = args.weightLog.filter((e) => ymdToTs(e.date) <= dayTs);
  const latest = logUpToDay[logUpToDay.length - 1];
  const weight = {
    current: latest?.weight ?? args.profileWeight,
    lastMeasured: latest?.date ?? null,
    pacePerWeek: (() => {
      const p = weeklyWeightPace(logUpToDay);
      return p === null ? null : r1(p);
    })(),
    change30d: weightChangeOver(logUpToDay, 30),
    measurements30d: logUpToDay.filter((e) => ymdToTs(e.date) >= dayTs - 30 * DAY_MS).length,
  };

  // ── Treningi z 7 dni kończących się na analizowanym dniu ────────────────
  const recentWorkouts = args.workoutEntries.filter((w) => {
    const t = ymdToTs(toYMD(new Date(w.date)));
    return t <= dayTs && t > dayTs - 7 * DAY_MS;
  });
  const workouts = {
    sessions7d: new Set(recentWorkouts.map((w) => toYMD(new Date(w.date)))).size,
    exercises7d: [...new Set(recentWorkouts.map((w) => w.exerciseName).filter(Boolean))].slice(0, 8),
  };

  return {
    date: args.date,
    isToday: args.date === toYMD(now),
    time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    isStrictLimitMode: args.isStrictLimitMode,
    tdee: args.tdee,
    goals,
    day: {
      calories: Math.round(args.day.calories),
      protein: r1(args.day.protein),
      carbs: r1(args.day.carbs),
      fat: r1(args.day.fat),
    },
    week,
    weight,
    workouts,
  };
};

const signed = (v: number) => `${v > 0 ? '+' : ''}${v}`;

/** Zamienia kontekst na czytelny blok danych dla modelu. */
export const formatContextForPrompt = (c: DietitianContext): string => {
  const lines: string[] = [];
  lines.push(`Cel: ${c.isStrictLimitMode ? 'redukcja (pilnowanie limitu kalorii)' : 'budowanie masy (nadwyżka kaloryczna)'}`);
  lines.push(`Dzienny cel kalorii (TDEE): ${c.tdee} kcal`);
  lines.push(`Orientacyjne cele makro: białko ${c.goals.protein} g, węglowodany ${c.goals.carbs} g, tłuszcze ${c.goals.fat} g`);
  lines.push('');
  lines.push(
    c.isToday
      ? `ANALIZOWANY DZIEŃ: dzisiaj (${c.date}), stan na godzinę ${c.time} – dzień jeszcze trwa`
      : `ANALIZOWANY DZIEŃ: ${c.date} – dzień zakończony`,
  );
  lines.push(`- Kalorie: ${c.day.calories} kcal`);
  lines.push(`- Białko: ${c.day.protein} g, węglowodany: ${c.day.carbs} g, tłuszcze: ${c.day.fat} g`);
  lines.push('');

  if (c.week) {
    lines.push(`OSTATNIE 7 DNI PRZED ANALIZOWANYM (dni z wpisami: ${c.week.loggedDays}/7):`);
    lines.push(`- Średnio: ${c.week.avgCalories} kcal, białko ${c.week.avgProtein} g, węglowodany ${c.week.avgCarbs} g, tłuszcze ${c.week.avgFat} g`);
    lines.push(
      c.isStrictLimitMode
        ? `- Dni powyżej limitu kalorii: ${c.week.daysOverTarget}`
        : `- Dni wyraźnie poniżej celu kalorii: ${c.week.daysOverTarget}`,
    );
    lines.push(`- Dni z białkiem poniżej 90% celu: ${c.week.daysProteinBelowGoal}`);
    lines.push(`- Dzień po dniu (kcal / białko g): ${c.week.days.map((d) => `${d.date.slice(5)}: ${d.calories}/${d.protein}`).join(', ')}`);
  } else {
    lines.push('OSTATNIE 7 DNI: brak wpisów – oceniaj tylko analizowany dzień.');
  }
  lines.push('');

  lines.push('WAGA:');
  lines.push(`- Aktualna: ${c.weight.current} kg${c.weight.lastMeasured ? ` (pomiar z ${c.weight.lastMeasured})` : ' (z profilu, brak pomiarów)'}`);
  if (c.weight.pacePerWeek !== null) lines.push(`- Tempo z 30 dni: ${signed(c.weight.pacePerWeek)} kg/tydzień`);
  if (c.weight.change30d !== null) lines.push(`- Zmiana w ostatnich 30 dniach: ${signed(c.weight.change30d)} kg`);
  if (c.weight.pacePerWeek === null) lines.push(`- Za mało pomiarów do oceny trendu (pomiary z 30 dni: ${c.weight.measurements30d})`);
  lines.push('');

  lines.push('TRENINGI SIŁOWE (7 dni):');
  lines.push(
    c.workouts.sessions7d > 0
      ? `- Dni treningowe: ${c.workouts.sessions7d}; ćwiczenia: ${c.workouts.exercises7d.join(', ')}`
      : '- Brak zapisanych treningów',
  );
  return lines.join('\n');
};
