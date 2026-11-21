import type { WeightEntry } from '../types';

export interface MacroGoals {
  protein: number;
  carbs: number;
  fat: number;
}

/**
 * Orientacyjne cele makro: białko z masy ciała (2,0 g/kg na redukcji, 1,8 g/kg na masie),
 * tłuszcz 27% TDEE, reszta kalorii z węglowodanów.
 */
export const computeMacroGoals = (tdee: number, weight: number, isStrictLimitMode: boolean): MacroGoals => {
  const protein = Math.round(weight * (isStrictLimitMode ? 2.0 : 1.8));
  const fat = Math.round((tdee * 0.27) / 9);
  const carbs = Math.max(0, Math.round((tdee - protein * 4 - fat * 9) / 4));
  return { protein, carbs, fat };
};

export const DAY_MS = 24 * 60 * 60 * 1000;

const dateToTs = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};

/** Tempo zmian wagi w kg/tydzień – nachylenie prostej dopasowanej do pomiarów z ostatnich 30 dni. */
export const weeklyWeightPace = (log: WeightEntry[]): number | null => {
  if (log.length < 2) return null;
  const lastT = dateToTs(log[log.length - 1].date);
  const pts = log
    .filter((e) => dateToTs(e.date) >= lastT - 30 * DAY_MS)
    .map((e) => ({ x: dateToTs(e.date) / DAY_MS, y: e.weight }));
  if (pts.length < 2 || pts[pts.length - 1].x - pts[0].x < 7) return null;
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const num = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const den = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  return den === 0 ? null : (num / den) * 7;
};

/** Zmiana wagi między najnowszym pomiarem a ostatnim pomiarem sprzed co najmniej `days` dni. */
export const weightChangeOver = (log: WeightEntry[], days: number): number | null => {
  if (log.length < 2) return null;
  const last = log[log.length - 1];
  const cutoff = dateToTs(last.date) - days * DAY_MS;
  const before = [...log].reverse().find((e) => dateToTs(e.date) <= cutoff);
  return before ? Math.round((last.weight - before.weight) * 10) / 10 : null;
};
