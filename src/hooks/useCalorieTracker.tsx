import React, { createContext, useContext, useState, useEffect } from 'react';
import type { MealEntry, MealItem, HistoricalDay, WorkoutEntry, WorkoutSet, HistoryProduct, CustomProduct, ReminderTime, DietitianReport, WeightEntry } from '../types';
import { auth, db } from '../services/firebase';
import { onAuthStateChanged, signOut, deleteUser, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, onSnapshot, setDoc, collection, deleteDoc, getDocs, writeBatch, deleteField } from 'firebase/firestore';

interface CalorieTrackerContextType {
  user: User | null;
  authLoading: boolean;
  mealsLoading: boolean;
  statsLoading: boolean;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  onboardingCompleted: boolean;
  tdee: number;
  isStrictLimitMode: boolean;
  meals: {
    breakfast: MealEntry;
    lunch: MealEntry;
    dinner: MealEntry;
    snacks: MealEntry;
  };
  historicalDays: HistoricalDay[];
  latestReport: DietitianReport | null;
  workoutEntries: WorkoutEntry[];
  productsHistory: HistoryProduct[];
  customProducts: CustomProduct[];
  reminders: ReminderTime[];
  weightLog: WeightEntry[];
  weight: number;
  height: number;
  age: number;
  gender: 'Mężczyzna' | 'Kobieta';
  activityLevel: number;
  /** Klucz faktycznie używany do zapytań AI (własny klucz użytkownika albo klucz wspólny z konfiguracji). */
  apiKey: string;
  /** Klucz wpisany przez użytkownika w Ustawieniach (pusty, jeśli nie podał własnego). */
  userApiKey: string;
  totalEaten: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  
  // Setters & Actions
  saveOnboarding: (weight: number, height: number, age: number, gender: 'Mężczyzna' | 'Kobieta', activityLevel: number, tdee: number) => Promise<void>;
  updateMealItem: (category: 'breakfast' | 'lunch' | 'dinner' | 'snacks', item: MealItem) => Promise<void>;
  deleteMealItem: (category: 'breakfast' | 'lunch' | 'dinner' | 'snacks', itemId: string) => Promise<void>;
  updateMealManual: (category: 'breakfast' | 'lunch' | 'dinner' | 'snacks', field: 'calories' | 'protein' | 'carbs' | 'fat', value: number) => Promise<void>;
  clearMeal: (category: 'breakfast' | 'lunch' | 'dinner' | 'snacks') => Promise<void>;
  updateProfile: (profile: { weight?: number; height?: number; age?: number; gender?: 'Mężczyzna' | 'Kobieta'; activityLevel?: number; tdee?: number }) => Promise<void>;
  setStrictLimitMode: (mode: boolean) => Promise<void>;
  addWorkoutEntry: (entry: Omit<WorkoutEntry, 'id'>) => Promise<void>;
  deleteWorkoutEntry: (id: string) => Promise<void>;
  addProductToHistory: (id: string, name: string, kcalPer100g: number, proteinPer100g: number, carbsPer100g: number, fatPer100g: number) => Promise<void>;
  addCustomProduct: (name: string, kcalPer100g: number, proteinPer100g: number, carbsPer100g: number, fatPer100g: number, barcode?: string) => Promise<void>;
  addReminder: (hour: number, minute: number) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
  addWeightEntry: (date: string, weight: number, options?: { syncProfile?: boolean }) => Promise<void>;
  deleteWeightEntry: (date: string) => Promise<void>;
  setApiKey: (key: string) => Promise<void>;
  setLatestReport: (report: DietitianReport | null) => Promise<void>;
  loadDemoData: () => Promise<void>;
  logout: () => Promise<void>;
  deleteAllUserData: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
}

export const toLocalYYYYMMDD = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const parseLocalDate = (dateStr: string): Date => {
  const [yr, mo, dy] = dateStr.split('-').map(Number);
  return new Date(yr, mo - 1, dy);
};

export const normalizeWorkoutEntries = (entries: any[]): WorkoutEntry[] => {
  return entries.map(entry => {
    if (entry && Array.isArray(entry.sets)) {
      return entry as WorkoutEntry;
    }
    // Backward compatibility for old entries
    const oldSets = typeof entry?.sets === 'number' ? entry.sets : 1;
    const oldWeight = typeof entry?.weight === 'number' ? entry.weight : 0;
    const oldReps = typeof entry?.reps === 'number' ? entry.reps : 0;
    const normalizedSets: WorkoutSet[] = Array.from({ length: oldSets }, () => ({
      weight: oldWeight,
      reps: oldReps
    }));
    return {
      id: entry.id || crypto.randomUUID(),
      date: entry.date || new Date().toISOString(),
      exerciseName: entry.exerciseName || '',
      sets: normalizedSets
    };
  });
};

const CalorieTrackerContext = createContext<CalorieTrackerContextType | undefined>(undefined);

const DEFAULT_MEAL = (): MealEntry => ({ calories: 0, protein: 0, carbs: 0, fat: 0, items: [] });
/**
 * Zamienia dowolną wartość (np. z odpowiedzi AI lub Open Food Facts) na skończoną,
 * nieujemną liczbę z rozsądnym górnym limitem – chroni sumy i statystyki przed NaN,
 * wartościami ujemnymi i absurdalnymi danymi zapisanymi do bazy.
 */
const safeNum = (val: unknown, max: number): number => {
  const n = typeof val === 'number' ? val : parseFloat(String(val ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
};
const MAX_KCAL = 20000;
const MAX_GRAMS = 5000;
const MAX_NAME_LENGTH = 120;
const safeName = (val: unknown) => String(val ?? '').trim().slice(0, MAX_NAME_LENGTH) || 'Produkt';

/** TDEE wzorem Mifflin-St Jeor – ten sam w onboardingu, Ustawieniach i dzienniku wagi. */
export const computeTdee = (w: number, h: number, a: number, g: 'Mężczyzna' | 'Kobieta', activity: number): number => {
  const s = g === 'Mężczyzna' ? 5 : -161;
  const bmr = 10 * w + 6.25 * h - 5 * a + s;
  return Math.round(bmr * activity);
};

export const MIN_BODY_WEIGHT = 25;
export const MAX_BODY_WEIGHT = 350;

/** Czyści i sortuje dziennik wagi wczytany z bazy (jeden wpis na dzień, rosnąco po dacie). */
const normalizeWeightLog = (raw: unknown): WeightEntry[] => {
  if (!Array.isArray(raw)) return [];
  const byDate = new Map<string, number>();
  for (const e of raw) {
    const date = typeof e?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : null;
    const weight = Number(e?.weight);
    if (date && Number.isFinite(weight) && weight >= MIN_BODY_WEIGHT && weight <= MAX_BODY_WEIGHT) {
      byDate.set(date, Math.round(weight * 10) / 10);
    }
  }
  return [...byDate.entries()]
    .map(([date, weight]) => ({ date, weight }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

const DEFAULT_API_KEY = (import.meta.env.VITE_GEMINI_API_KEY as string) || '';

export const CalorieTrackerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [mealsLoading, setMealsLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);

  // Date selection state (YYYY-MM-DD)
  const [selectedDate, setSelectedDate] = useState<string>(() => toLocalYYYYMMDD(new Date()));

  // Profile fields
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean>(false);
  const [tdee, setTdee] = useState<number>(2000);
  const [isStrictLimitMode, setStrictLimitModeState] = useState<boolean>(true);
  const [weight, setWeight] = useState<number>(80);
  const [height, setHeight] = useState<number>(180);
  const [age, setAge] = useState<number>(25);
  const [gender, setGender] = useState<'Mężczyzna' | 'Kobieta'>('Mężczyzna');
  const [activityLevel, setActivityLevel] = useState<number>(1.2);
  const [userApiKey, setUserApiKey] = useState<string>('');
  const apiKey = userApiKey || DEFAULT_API_KEY;

  // Meals (Loaded per selected date)
  const [meals, setMeals] = useState<{
    breakfast: MealEntry;
    lunch: MealEntry;
    dinner: MealEntry;
    snacks: MealEntry;
  }>({
    breakfast: DEFAULT_MEAL(),
    lunch: DEFAULT_MEAL(),
    dinner: DEFAULT_MEAL(),
    snacks: DEFAULT_MEAL(),
  });
  const [latestReport, setLatestReportState] = useState<DietitianReport | null>(null);

  // Lists stored in `/users/{userId}/statistics/data`
  const [historicalDays, setHistoricalDays] = useState<HistoricalDay[]>([]);
  const [workoutEntries, setWorkoutEntries] = useState<WorkoutEntry[]>([]);
  const [productsHistory, setProductsHistory] = useState<HistoryProduct[]>([]);
  const [customProducts, setCustomProducts] = useState<CustomProduct[]>([]);
  const [reminders, setReminders] = useState<ReminderTime[]>([]);
  const [weightLog, setWeightLog] = useState<WeightEntry[]>([]);

  // Derived Totals
  const totalEaten = meals.breakfast.calories + meals.lunch.calories + meals.dinner.calories + meals.snacks.calories;
  const totalProtein = meals.breakfast.protein + meals.lunch.protein + meals.dinner.protein + meals.snacks.protein;
  const totalCarbs = meals.breakfast.carbs + meals.lunch.carbs + meals.dinner.carbs + meals.snacks.carbs;
  const totalFat = meals.breakfast.fat + meals.lunch.fat + meals.dinner.fat + meals.snacks.fat;

  // Listen to Auth State changes
  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  // Listen to Firestore documents when user is logged in
  useEffect(() => {
    if (!user || !db) {
      // Clear data states if logged out
      setOnboardingCompleted(false);
      setTdee(2000);
      setStrictLimitModeState(true);
      setWeight(80);
      setHeight(180);
      setAge(25);
      setGender('Mężczyzna');
      setActivityLevel(1.2);
      setUserApiKey('');
      setMeals({
        breakfast: DEFAULT_MEAL(),
        lunch: DEFAULT_MEAL(),
        dinner: DEFAULT_MEAL(),
        snacks: DEFAULT_MEAL(),
      });
      setLatestReportState(null);
      setHistoricalDays([]);
      setWorkoutEntries([]);
      setProductsHistory([]);
      setCustomProducts([]);
      setReminders([]);
      setWeightLog([]);
      setMealsLoading(false);
      setStatsLoading(false);
      return;
    }

    setMealsLoading(true);
    setStatsLoading(true);

    // 1. Subscribe to User Profile
    const profileRef = doc(db!, 'users', user.uid, 'profile', 'data');
    const unsubProfile = onSnapshot(profileRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setWeight(data.weight || 80);
        setHeight(data.height || 180);
        setAge(data.age || 25);
        setGender(data.gender || 'Mężczyzna');
        setActivityLevel(data.activityLevel || 1.2);
        setTdee(data.tdee || 2000);
        setStrictLimitModeState(data.isStrictLimitMode !== false);
        // Starsze wersje kopiowały wspólny klucz z konfiguracji do profilu każdego
        // użytkownika – taki wpis nie jest kluczem użytkownika, więc go usuwamy.
        if (DEFAULT_API_KEY && data.apiKey === DEFAULT_API_KEY) {
          setUserApiKey('');
          setDoc(profileRef, { apiKey: deleteField() }, { merge: true }).catch(() => {});
        } else {
          setUserApiKey(typeof data.apiKey === 'string' ? data.apiKey : '');
        }
        setOnboardingCompleted(data.onboardingCompleted === true);
      } else {
        setUserApiKey('');
        setOnboardingCompleted(false);
      }
    });

    // 2. Subscribe to Selected Date's Meals
    const mealsRef = doc(db!, 'users', user.uid, 'meals', selectedDate);
    const unsubMeals = onSnapshot(mealsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setMeals({
          breakfast: data.breakfast || DEFAULT_MEAL(),
          lunch: data.lunch || DEFAULT_MEAL(),
          dinner: data.dinner || DEFAULT_MEAL(),
          snacks: data.snacks || DEFAULT_MEAL(),
        });
        setLatestReportState(data.latestReport || null);
      } else {
        setMeals({
          breakfast: DEFAULT_MEAL(),
          lunch: DEFAULT_MEAL(),
          dinner: DEFAULT_MEAL(),
          snacks: DEFAULT_MEAL(),
        });
        setLatestReportState(null);
      }
      setMealsLoading(false);
    }, (err) => {
      console.error("Error loading meals document:", err);
      setMealsLoading(false);
    });

    // 3. Subscribe to Statistics dataset (excluding historicalDays)
    const statsRef = doc(db!, 'users', user.uid, 'statistics', 'data');
    const unsubStats = onSnapshot(statsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const rawWorkouts = data.workoutEntries || [];
        setWorkoutEntries(normalizeWorkoutEntries(rawWorkouts));
        setProductsHistory(data.productsHistory || []);
        setCustomProducts(data.customProducts || []);
        setReminders(data.reminders || []);
        setWeightLog(normalizeWeightLog(data.weightLog));
      } else {
        setWeightLog([]);
      }
    });

    // 4. Subscribe to All Meals collection dynamically (for Statistics)
    const mealsCollectionRef = collection(db!, 'users', user.uid, 'meals');
    const unsubAllMeals = onSnapshot(mealsCollectionRef, (querySnap) => {
      const days: HistoricalDay[] = [];
      querySnap.forEach((docSnap) => {
        const data = docSnap.data();
        const breakfastCal = data.breakfast?.calories || 0;
        const lunchCal = data.lunch?.calories || 0;
        const dinnerCal = data.dinner?.calories || 0;
        const snacksCal = data.snacks?.calories || 0;
        const total = breakfastCal + lunchCal + dinnerCal + snacksCal;

        const [yr, mo, dy] = docSnap.id.split('-').map(Number);
        const dateObj = new Date(yr, mo - 1, dy, 12, 0, 0);
        const isoDate = dateObj.toISOString();

        const sumMacro = (key: 'protein' | 'carbs' | 'fat') =>
          ['breakfast', 'lunch', 'dinner', 'snacks'].reduce((acc, m) => acc + (Number(data[m]?.[key]) || 0), 0);

        days.push({
          id: docSnap.id,
          date: isoDate,
          caloriesEaten: total,
          protein: sumMacro('protein'),
          carbs: sumMacro('carbs'),
          fat: sumMacro('fat'),
        });
      });
      setHistoricalDays(days);
      setStatsLoading(false);
    }, (err) => {
      console.error("Error loading all meals collection:", err);
      setStatsLoading(false);
    });

    return () => {
      unsubProfile();
      unsubMeals();
      unsubStats();
      unsubAllMeals();
    };
  }, [user, selectedDate]);



  // Actions
  const saveOnboarding = async (w: number, h: number, a: number, g: 'Mężczyzna' | 'Kobieta', al: number, computedTdee: number) => {
    if (!user || !db) return;
    const profileRef = doc(db!, 'users', user.uid, 'profile', 'data');
    await setDoc(profileRef, {
      weight: w,
      height: h,
      age: a,
      gender: g,
      activityLevel: al,
      tdee: computedTdee,
      isStrictLimitMode,
      onboardingCompleted: true
    }, { merge: true });
    // Pierwszy punkt na wykresie wagi
    await addWeightEntry(toLocalYYYYMMDD(new Date()), w, { syncProfile: false });
  };

  const updateMealItem = async (category: 'breakfast' | 'lunch' | 'dinner' | 'snacks', item: MealItem) => {
    if (!user || !db) return;
    const mealsRef = doc(db!, 'users', user.uid, 'meals', selectedDate);
    const currentEntry = meals[category];
    item = {
      ...item,
      name: safeName(item.name),
      calories: Math.round(safeNum(item.calories, MAX_KCAL)),
      protein: safeNum(item.protein, MAX_GRAMS),
      carbs: safeNum(item.carbs, MAX_GRAMS),
      fat: safeNum(item.fat, MAX_GRAMS),
      weight: safeNum(item.weight, MAX_GRAMS * 4),
    };
    const updatedItems = [...currentEntry.items, item];

    const updatedEntry: MealEntry = {
      calories: currentEntry.calories + item.calories,
      protein: currentEntry.protein + item.protein,
      carbs: currentEntry.carbs + item.carbs,
      fat: currentEntry.fat + item.fat,
      items: updatedItems
    };

    await setDoc(mealsRef, {
      [category]: updatedEntry
    }, { merge: true });
  };

  const deleteMealItem = async (category: 'breakfast' | 'lunch' | 'dinner' | 'snacks', itemId: string) => {
    if (!user || !db) return;
    const mealsRef = doc(db!, 'users', user.uid, 'meals', selectedDate);
    const currentEntry = meals[category];
    const targetItem = currentEntry.items.find(it => it.id === itemId);
    if (!targetItem) return;

    const updatedItems = currentEntry.items.filter(it => it.id !== itemId);
    const updatedEntry: MealEntry = {
      calories: Math.max(0, currentEntry.calories - targetItem.calories),
      protein: Math.max(0, currentEntry.protein - targetItem.protein),
      carbs: Math.max(0, currentEntry.carbs - targetItem.carbs),
      fat: Math.max(0, currentEntry.fat - targetItem.fat),
      items: updatedItems
    };

    await setDoc(mealsRef, {
      [category]: updatedEntry
    }, { merge: true });
  };

  const updateMealManual = async (category: 'breakfast' | 'lunch' | 'dinner' | 'snacks', field: 'calories' | 'protein' | 'carbs' | 'fat', value: number) => {
    if (!user || !db) return;
    const mealsRef = doc(db!, 'users', user.uid, 'meals', selectedDate);
    const currentEntry = meals[category];
    const updatedEntry = {
      ...currentEntry,
      [field]: field === 'calories' ? Math.round(safeNum(value, MAX_KCAL)) : safeNum(value, MAX_GRAMS)
    };

    await setDoc(mealsRef, {
      [category]: updatedEntry
    }, { merge: true });
  };

  const clearMeal = async (category: 'breakfast' | 'lunch' | 'dinner' | 'snacks') => {
    if (!user || !db) return;
    const mealsRef = doc(db!, 'users', user.uid, 'meals', selectedDate);
    await setDoc(mealsRef, {
      [category]: DEFAULT_MEAL()
    }, { merge: true });
  };

  const updateProfile = async (profile: { weight?: number; height?: number; age?: number; gender?: 'Mężczyzna' | 'Kobieta'; activityLevel?: number; tdee?: number }) => {
    if (!user || !db) return;
    const profileRef = doc(db!, 'users', user.uid, 'profile', 'data');
    await setDoc(profileRef, profile, { merge: true });
  };

  const setStrictLimitMode = async (mode: boolean) => {
    if (!user || !db) return;
    const profileRef = doc(db!, 'users', user.uid, 'profile', 'data');
    await setDoc(profileRef, { isStrictLimitMode: mode }, { merge: true });
  };

  const addWorkoutEntry = async (entry: Omit<WorkoutEntry, 'id'>) => {
    if (!user || !db) return;
    const statsRef = doc(db!, 'users', user.uid, 'statistics', 'data');
    const workoutId = crypto.randomUUID();
    const newWorkout: WorkoutEntry = {
      ...entry,
      id: workoutId
    };
    await setDoc(statsRef, {
      workoutEntries: [...workoutEntries, newWorkout]
    }, { merge: true });

    // Save as individual document in subcollection 'workouts'
    const workoutDocRef = doc(db!, 'users', user.uid, 'workouts', workoutId);
    await setDoc(workoutDocRef, newWorkout);
  };

  const deleteWorkoutEntry = async (id: string) => {
    if (!user || !db) return;
    const statsRef = doc(db!, 'users', user.uid, 'statistics', 'data');
    const updated = workoutEntries.filter(w => w.id !== id);
    await setDoc(statsRef, {
      workoutEntries: updated
    }, { merge: true });

    // Delete document from subcollection 'workouts'
    const workoutDocRef = doc(db!, 'users', user.uid, 'workouts', id);
    await deleteDoc(workoutDocRef);
  };

  const addProductToHistory = async (id: string, name: string, kcal100: number, p100: number, c100: number, f100: number) => {
    if (!user || !db) return;
    name = safeName(name);
    kcal100 = safeNum(kcal100, 1000); p100 = safeNum(p100, 100); c100 = safeNum(c100, 100); f100 = safeNum(f100, 100);
    const statsRef = doc(db!, 'users', user.uid, 'statistics', 'data');
    const idx = productsHistory.findIndex(item => item.id === id);
    
    let updatedHistory = [...productsHistory];
    if (idx >= 0) {
      updatedHistory[idx] = {
        ...updatedHistory[idx],
        useCount: updatedHistory[idx].useCount + 1,
        lastUsed: new Date().toISOString()
      };
    } else {
      updatedHistory.push({
        id,
        name,
        kcalPer100g: kcal100,
        proteinPer100g: p100,
        carbsPer100g: c100,
        fatPer100g: f100,
        lastUsed: new Date().toISOString(),
        useCount: 1
      });
    }

    await setDoc(statsRef, {
      productsHistory: updatedHistory
    }, { merge: true });
  };

  const addCustomProduct = async (name: string, kcalPer100g: number, proteinPer100g: number, carbsPer100g: number, fatPer100g: number, barcode?: string) => {
    if (!user || !db) return;
    name = safeName(name);
    kcalPer100g = safeNum(kcalPer100g, 1000); proteinPer100g = safeNum(proteinPer100g, 100);
    carbsPer100g = safeNum(carbsPer100g, 100); fatPer100g = safeNum(fatPer100g, 100);
    const statsRef = doc(db!, 'users', user.uid, 'statistics', 'data');
    const newProduct: CustomProduct = {
      id: crypto.randomUUID(),
      name,
      kcalPer100g,
      proteinPer100g,
      carbsPer100g,
      fatPer100g,
      barcode
    };

    await setDoc(statsRef, {
      customProducts: [...customProducts, newProduct]
    }, { merge: true });
  };

  const addReminder = async (hour: number, minute: number) => {
    if (!user || !db) return;
    const statsRef = doc(db!, 'users', user.uid, 'statistics', 'data');
    const newReminder: ReminderTime = {
      id: crypto.randomUUID(),
      hour,
      minute
    };

    await setDoc(statsRef, {
      reminders: [...reminders, newReminder]
    }, { merge: true });
  };

  /**
   * Zapisuje pomiar wagi (jeden na dzień – kolejny z tą samą datą go zastępuje).
   * Jeśli to najnowszy pomiar, aktualizuje też wagę w profilu, a TDEE przelicza
   * tylko wtedy, gdy nie był wpisany ręcznie (czyli zgadza się z wyliczonym wzorem).
   */
  const addWeightEntry = async (date: string, newWeight: number, options: { syncProfile?: boolean } = {}) => {
    if (!user || !db) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const w = Math.round(safeNum(newWeight, MAX_BODY_WEIGHT) * 10) / 10;
    if (w < MIN_BODY_WEIGHT) return;

    const updatedLog = normalizeWeightLog([...weightLog.filter(e => e.date !== date), { date, weight: w }]);
    const statsRef = doc(db!, 'users', user.uid, 'statistics', 'data');
    await setDoc(statsRef, { weightLog: updatedLog }, { merge: true });

    const isLatest = updatedLog[updatedLog.length - 1]?.date === date;
    if (options.syncProfile !== false && isLatest) {
      await syncProfileWeight(w);
    }
  };

  const deleteWeightEntry = async (date: string) => {
    if (!user || !db) return;
    const wasLatest = weightLog[weightLog.length - 1]?.date === date;
    const updatedLog = weightLog.filter(e => e.date !== date);
    const statsRef = doc(db!, 'users', user.uid, 'statistics', 'data');
    await setDoc(statsRef, { weightLog: updatedLog }, { merge: true });
    if (wasLatest && updatedLog.length > 0) {
      await syncProfileWeight(updatedLog[updatedLog.length - 1].weight);
    }
  };

  const syncProfileWeight = async (w: number) => {
    if (!user || !db || w === weight) return;
    const profileRef = doc(db!, 'users', user.uid, 'profile', 'data');
    const tdeeIsAuto = Math.abs(tdee - computeTdee(weight, height, age, gender, activityLevel)) <= 1;
    await setDoc(profileRef, {
      weight: w,
      ...(tdeeIsAuto ? { tdee: computeTdee(w, height, age, gender, activityLevel) } : {}),
    }, { merge: true });
  };

  const deleteReminder = async (id: string) => {
    if (!user || !db) return;
    const statsRef = doc(db!, 'users', user.uid, 'statistics', 'data');
    const updated = reminders.filter(r => r.id !== id);
    await setDoc(statsRef, {
      reminders: updated
    }, { merge: true });
  };

  const setApiKey = async (key: string) => {
    if (!user || !db) return;
    const profileRef = doc(db!, 'users', user.uid, 'profile', 'data');
    await setDoc(profileRef, { apiKey: key }, { merge: true });
  };

  const setLatestReport = async (report: DietitianReport | null) => {
    if (!user || !db) return;
    const mealsRef = doc(db!, 'users', user.uid, 'meals', selectedDate);
    await setDoc(mealsRef, { latestReport: report }, { merge: true });
  };

  const loadDemoData = async () => {
    if (!user || !db) return;
    const statsRef = doc(db!, 'users', user.uid, 'statistics', 'data');

    // Generate historical meals (last 14 days)
    const now = new Date();
    const batchPromises = [];
    for (let i = 14; i >= 1; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dateStr = toLocalYYYYMMDD(d);
      
      const randomBase = Math.floor(Math.random() * 400) + 350; // 350 to 750
      const mealDocRef = doc(db!, 'users', user.uid, 'meals', dateStr);
      
      batchPromises.push(setDoc(mealDocRef, {
        breakfast: { calories: randomBase, protein: Math.round(randomBase * 0.05), carbs: Math.round(randomBase * 0.12), fat: Math.round(randomBase * 0.03), items: [] },
        lunch: { calories: randomBase + 200, protein: Math.round((randomBase + 200) * 0.06), carbs: Math.round((randomBase + 200) * 0.1), fat: Math.round((randomBase + 200) * 0.04), items: [] },
        dinner: { calories: randomBase - 100, protein: Math.round((randomBase - 100) * 0.05), carbs: Math.round((randomBase - 100) * 0.11), fat: Math.round((randomBase - 100) * 0.03), items: [] },
        snacks: { calories: 150, protein: 5, carbs: 20, fat: 5, items: [] }
      }));
    }

    // Generate workout entries
    const demoWorkouts: WorkoutEntry[] = [
      { id: crypto.randomUUID(), date: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(), exerciseName: 'Wyciskanie leżąc', sets: Array.from({ length: 4 }, () => ({ weight: 60, reps: 10 })) },
      { id: crypto.randomUUID(), date: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(), exerciseName: 'Przysiad ze sztangą', sets: Array.from({ length: 3 }, () => ({ weight: 80, reps: 8 })) },
      { id: crypto.randomUUID(), date: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(), exerciseName: 'Wyciskanie leżąc', sets: Array.from({ length: 4 }, () => ({ weight: 62.5, reps: 10 })) },
      { id: crypto.randomUUID(), date: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(), exerciseName: 'Martwy ciąg', sets: Array.from({ length: 3 }, () => ({ weight: 100, reps: 5 })) },
      { id: crypto.randomUUID(), date: now.toISOString(), exerciseName: 'Wyciskanie leżąc', sets: Array.from({ length: 4 }, () => ({ weight: 65, reps: 9 })) }
    ];

    demoWorkouts.forEach(workout => {
      const workoutDocRef = doc(db!, 'users', user.uid, 'workouts', workout.id);
      batchPromises.push(setDoc(workoutDocRef, workout));
    });

    // Prepopulate custom products
    const demoCustom: CustomProduct[] = [
      { id: crypto.randomUUID(), name: "Odżywka Białkowa WPI", kcalPer100g: 380, proteinPer100g: 85, carbsPer100g: 3, fatPer100g: 2 },
      { id: crypto.randomUUID(), name: "Kreatyna Monohydrat", kcalPer100g: 0, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 0 }
    ];

    await Promise.all(batchPromises);

    await setDoc(statsRef, {
      workoutEntries: demoWorkouts,
      customProducts: demoCustom
    }, { merge: true });

    alert("Załadowano dane demonstracyjne w chmurze Firestore!");
  };

  /** Usuwa z Firestore wszystkie dokumenty użytkownika: posiłki, treningi, statystyki i profil. */
  const deleteAllUserData = async () => {
    if (!user || !db) return;
    const uid = user.uid;
    const [mealsSnap, workoutsSnap, pushSnap] = await Promise.all([
      getDocs(collection(db, 'users', uid, 'meals')),
      getDocs(collection(db, 'users', uid, 'workouts')),
      getDocs(collection(db, 'users', uid, 'pushTokens')),
    ]);
    const refs = [
      ...mealsSnap.docs.map(d => d.ref),
      ...workoutsSnap.docs.map(d => d.ref),
      ...pushSnap.docs.map(d => d.ref),
      doc(db, 'users', uid, 'private', 'push'),
      doc(db, 'users', uid, 'statistics', 'data'),
      doc(db, 'users', uid, 'profile', 'data'),
    ];
    // Firestore przyjmuje maks. 500 operacji w jednym batchu
    for (let i = 0; i < refs.length; i += 450) {
      const batch = writeBatch(db);
      refs.slice(i, i + 450).forEach(ref => batch.delete(ref));
      await batch.commit();
    }
    localStorage.clear();
  };

  /** Potwierdza hasło, usuwa wszystkie dane, a na końcu samo konto Firebase Auth. */
  const deleteAccount = async (password: string) => {
    if (!user || !user.email) return;
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    await deleteAllUserData();
    await deleteUser(user);
  };

  const logout = async () => {
    if (!auth) return;
    await signOut(auth!);
  };

  return (
    <CalorieTrackerContext.Provider value={{
      user,
      authLoading,
      mealsLoading,
      statsLoading,
      selectedDate,
      setSelectedDate,
      onboardingCompleted,
      tdee,
      isStrictLimitMode,
      meals,
      historicalDays,
      latestReport,
      workoutEntries,
      productsHistory,
      customProducts,
      reminders,
      weightLog,
      weight,
      height,
      age,
      gender,
      activityLevel,
      apiKey,
      userApiKey,
      totalEaten,
      totalProtein,
      totalCarbs,
      totalFat,
      
      saveOnboarding,
      updateMealItem,
      deleteMealItem,
      updateMealManual,
      clearMeal,
      updateProfile,
      setStrictLimitMode,
      addWorkoutEntry,
      deleteWorkoutEntry,
      addProductToHistory,
      addCustomProduct,
      addReminder,
      deleteReminder,
      addWeightEntry,
      deleteWeightEntry,
      setApiKey,
      setLatestReport,
      loadDemoData,
      logout,
      deleteAllUserData,
      deleteAccount
    }}>
      {children}
    </CalorieTrackerContext.Provider>
  );
};

export const useCalorieTracker = () => {
  const context = useContext(CalorieTrackerContext);
  if (context === undefined) {
    throw new Error('useCalorieTracker must be used within a CalorieTrackerProvider');
  }
  return context;
};
