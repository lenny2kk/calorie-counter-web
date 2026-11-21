export interface MealItem {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  weight: number;
}

export interface MealEntry {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  items: MealItem[];
}

export interface HistoricalDay {
  id: string;
  date: string; // ISO string format
  caloriesEaten: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

export interface WorkoutSet {
  weight: number;
  reps: number;
}

export interface WorkoutEntry {
  id: string;
  date: string; // ISO string format
  exerciseName: string;
  sets: WorkoutSet[];
}

export interface DietitianReport {
  pushNotification: {
    title: string;
    body: string;
  };
  fullAnalysis: {
    statusSummary: string;
    caloriesRemaining: string;
    macroCritique: {
      protein: string;
      carbs: string;
      fat: string;
    };
    actionableAdvice: string;
    /** Komentarz do trendów z ostatnich 7 dni i wagi (nowsze raporty). */
    weeklyInsight?: string;
  };
  /** Kiedy raport wygenerowano (ISO) – nowsze raporty. */
  generatedAt?: string;
}

export interface ReminderTime {
  id: string;
  hour: number;
  minute: number;
}

export interface HistoryProduct {
  id: string;
  name: string;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  lastUsed: string; // ISO string
  useCount: number;
}

export interface CustomProduct {
  id: string;
  name: string;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  barcode?: string;
}

export interface BaseProduct {
  id: string;
  name: string;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}

export interface WeightEntry {
  date: string; // YYYY-MM-DD (lokalna data pomiaru)
  weight: number; // kg
}
