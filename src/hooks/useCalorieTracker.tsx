import React, { createContext, useContext, useState, useEffect } from 'react';
import type { MealEntry, MealItem, HistoricalDay, WorkoutEntry, WorkoutSet, HistoryProduct, CustomProduct, ReminderTime, DietitianReport } from '../types';
import { auth, db } from '../services/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, onSnapshot, setDoc, collection, deleteDoc } from 'firebase/firestore';

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
  weight: number;
  height: number;
  age: number;
  gender: 'Mężczyzna' | 'Kobieta';
  activityLevel: number;
  apiKey: string;
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
  setApiKey: (key: string) => Promise<void>;
  setLatestReport: (report: DietitianReport | null) => Promise<void>;
  loadDemoData: () => Promise<void>;
  logout: () => Promise<void>;
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
  const [apiKey, setApiKeyState] = useState<string>(DEFAULT_API_KEY);

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
      setApiKeyState(DEFAULT_API_KEY);
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
        setApiKeyState(data.apiKey || DEFAULT_API_KEY);
        setOnboardingCompleted(data.onboardingCompleted === true);
      } else {
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

        days.push({
          id: docSnap.id,
          date: isoDate,
          caloriesEaten: total
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
      apiKey,
      onboardingCompleted: true
    }, { merge: true });
  };

  const updateMealItem = async (category: 'breakfast' | 'lunch' | 'dinner' | 'snacks', item: MealItem) => {
    if (!user || !db) return;
    const mealsRef = doc(db!, 'users', user.uid, 'meals', selectedDate);
    const currentEntry = meals[category];
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
      [field]: value
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
      weight,
      height,
      age,
      gender,
      activityLevel,
      apiKey,
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
      setApiKey,
      setLatestReport,
      loadDemoData,
      logout
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
