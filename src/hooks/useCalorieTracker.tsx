import React, { createContext, useContext, useState, useEffect } from 'react';
import type { MealEntry, MealItem, HistoricalDay, WorkoutEntry, HistoryProduct, CustomProduct, ReminderTime, DietitianReport } from '../types';

interface CalorieTrackerContextType {
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
  
  // Setters
  saveOnboarding: (weight: number, height: number, age: number, gender: 'Mężczyzna' | 'Kobieta', activityLevel: number, tdee: number) => void;
  updateMealItem: (category: 'breakfast' | 'lunch' | 'dinner' | 'snacks', item: MealItem) => void;
  deleteMealItem: (category: 'breakfast' | 'lunch' | 'dinner' | 'snacks', itemId: string) => void;
  updateMealManual: (category: 'breakfast' | 'lunch' | 'dinner' | 'snacks', field: 'calories' | 'protein' | 'carbs' | 'fat', value: number) => void;
  clearMeal: (category: 'breakfast' | 'lunch' | 'dinner' | 'snacks') => void;
  updateProfile: (profile: { weight?: number; height?: number; age?: number; gender?: 'Mężczyzna' | 'Kobieta'; activityLevel?: number; tdee?: number }) => void;
  setStrictLimitMode: (mode: boolean) => void;
  addWorkoutEntry: (entry: Omit<WorkoutEntry, 'id'>) => void;
  deleteWorkoutEntry: (id: string) => void;
  addProductToHistory: (id: string, name: string, kcalPer100g: number, proteinPer100g: number, carbsPer100g: number, fatPer100g: number) => void;
  addCustomProduct: (name: string, kcalPer100g: number, proteinPer100g: number, carbsPer100g: number, fatPer100g: number) => void;
  addReminder: (hour: number, minute: number) => void;
  deleteReminder: (id: string) => void;
  setApiKey: (key: string) => void;
  setLatestReport: (report: DietitianReport | null) => void;
  loadDemoData: () => void;
}

const CalorieTrackerContext = createContext<CalorieTrackerContextType | undefined>(undefined);

const DEFAULT_MEAL = (): MealEntry => ({ calories: 0, protein: 0, carbs: 0, fat: 0, items: [] });
const DEFAULT_API_KEY = 'AQ.Ab8RN6Ico5N5yuZzpEMDUd35PGQ2gNiVHkKYhP56nbI91N87vA';

export const CalorieTrackerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Biometrics
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean>(() => localStorage.getItem('has_completed_onboarding') === 'true');
  const [tdee, setTdee] = useState<number>(() => Number(localStorage.getItem('user_tdee')) || 2000);
  const [isStrictLimitMode, setStrictLimitModeState] = useState<boolean>(() => localStorage.getItem('is_strict_limit_mode') !== 'false');
  const [weight, setWeight] = useState<number>(() => Number(localStorage.getItem('user_weight')) || 80);
  const [height, setHeight] = useState<number>(() => Number(localStorage.getItem('user_height')) || 180);
  const [age, setAge] = useState<number>(() => Number(localStorage.getItem('user_age')) || 25);
  const [gender, setGender] = useState<'Mężczyzna' | 'Kobieta'>(() => (localStorage.getItem('user_gender') as 'Mężczyzna' | 'Kobieta') || 'Mężczyzna');
  const [activityLevel, setActivityLevel] = useState<number>(() => Number(localStorage.getItem('user_activity_level')) || 1.2);
  const [apiKey, setApiKeyState] = useState<string>(() => localStorage.getItem('gemini_api_key') || DEFAULT_API_KEY);

  // Meals
  const [meals, setMeals] = useState<{
    breakfast: MealEntry;
    lunch: MealEntry;
    dinner: MealEntry;
    snacks: MealEntry;
  }>(() => {
    const b = localStorage.getItem('meal_breakfast_json');
    const l = localStorage.getItem('meal_lunch_json');
    const d = localStorage.getItem('meal_dinner_json');
    const s = localStorage.getItem('meal_snacks_json');
    return {
      breakfast: b ? JSON.parse(b) : DEFAULT_MEAL(),
      lunch: l ? JSON.parse(l) : DEFAULT_MEAL(),
      dinner: d ? JSON.parse(d) : DEFAULT_MEAL(),
      snacks: s ? JSON.parse(s) : DEFAULT_MEAL(),
    };
  });

  // History & Gym
  const [historicalDays, setHistoricalDays] = useState<HistoricalDay[]>(() => {
    const days = localStorage.getItem('historical_days_json');
    return days ? JSON.parse(days) : [];
  });
  const [latestReport, setLatestReportState] = useState<DietitianReport | null>(() => {
    const r = localStorage.getItem('latest_dietitian_report');
    return r ? JSON.parse(r) : null;
  });
  const [workoutEntries, setWorkoutEntries] = useState<WorkoutEntry[]>(() => {
    const workouts = localStorage.getItem('workout_entries_json');
    return workouts ? JSON.parse(workouts) : [];
  });

  // Product Lists & Reminders
  const [productsHistory, setProductsHistory] = useState<HistoryProduct[]>(() => {
    const hist = localStorage.getItem('products_history_json');
    return hist ? JSON.parse(hist) : [];
  });
  const [customProducts, setCustomProducts] = useState<CustomProduct[]>(() => {
    const cust = localStorage.getItem('custom_products_json');
    return cust ? JSON.parse(cust) : [];
  });
  const [reminders, setReminders] = useState<ReminderTime[]>(() => {
    const rems = localStorage.getItem('user_reminders_list');
    return rems ? JSON.parse(rems) : [];
  });

  // Derived Totals
  const totalEaten = meals.breakfast.calories + meals.lunch.calories + meals.dinner.calories + meals.snacks.calories;
  const totalProtein = meals.breakfast.protein + meals.lunch.protein + meals.dinner.protein + meals.snacks.protein;
  const totalCarbs = meals.breakfast.carbs + meals.lunch.carbs + meals.dinner.carbs + meals.snacks.carbs;
  const totalFat = meals.breakfast.fat + meals.lunch.fat + meals.dinner.fat + meals.snacks.fat;

  // Persists to localStorage whenever values change
  useEffect(() => {
    localStorage.setItem('has_completed_onboarding', String(onboardingCompleted));
    localStorage.setItem('user_tdee', String(tdee));
    localStorage.setItem('is_strict_limit_mode', String(isStrictLimitMode));
    localStorage.setItem('user_weight', String(weight));
    localStorage.setItem('user_height', String(height));
    localStorage.setItem('user_age', String(age));
    localStorage.setItem('user_gender', gender);
    localStorage.setItem('user_activity_level', String(activityLevel));
    localStorage.setItem('gemini_api_key', apiKey);
  }, [onboardingCompleted, tdee, isStrictLimitMode, weight, height, age, gender, activityLevel, apiKey]);

  useEffect(() => {
    localStorage.setItem('meal_breakfast_json', JSON.stringify(meals.breakfast));
    localStorage.setItem('meal_lunch_json', JSON.stringify(meals.lunch));
    localStorage.setItem('meal_dinner_json', JSON.stringify(meals.dinner));
    localStorage.setItem('meal_snacks_json', JSON.stringify(meals.snacks));
  }, [meals]);

  useEffect(() => {
    localStorage.setItem('historical_days_json', JSON.stringify(historicalDays));
  }, [historicalDays]);

  useEffect(() => {
    localStorage.setItem('latest_dietitian_report', latestReport ? JSON.stringify(latestReport) : '');
  }, [latestReport]);

  useEffect(() => {
    localStorage.setItem('workout_entries_json', JSON.stringify(workoutEntries));
  }, [workoutEntries]);

  useEffect(() => {
    localStorage.setItem('products_history_json', JSON.stringify(productsHistory));
  }, [productsHistory]);

  useEffect(() => {
    localStorage.setItem('custom_products_json', JSON.stringify(customProducts));
  }, [customProducts]);

  useEffect(() => {
    localStorage.setItem('user_reminders_list', JSON.stringify(reminders));
  }, [reminders]);

  // Save Current Day's totals to history
  const saveCurrentDayLive = (customEaten?: number) => {
    const eaten = customEaten !== undefined ? customEaten : totalEaten;
    const todayStr = new Date().toISOString().split('T')[0];
    
    setHistoricalDays((prevDays) => {
      const idx = prevDays.findIndex((day) => day.date.startsWith(todayStr));
      if (idx >= 0) {
        const updated = [...prevDays];
        updated[idx] = { ...updated[idx], caloriesEaten: eaten };
        return updated;
      } else {
        return [...prevDays, { id: crypto.randomUUID(), date: new Date().toISOString(), caloriesEaten: eaten }];
      }
    });
  };

  // Run day reset check on mount
  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const lastOpened = localStorage.getItem('last_opened_date') || '';
    
    if (!lastOpened) {
      localStorage.setItem('last_opened_date', todayStr);
      saveCurrentDayLive();
    } else if (lastOpened !== todayStr) {
      // Midnight reset! Clear meals, archive previous day
      setMeals({
        breakfast: DEFAULT_MEAL(),
        lunch: DEFAULT_MEAL(),
        dinner: DEFAULT_MEAL(),
        snacks: DEFAULT_MEAL(),
      });
      // Clear latest dietitian report for a new day
      setLatestReportState(null);
      localStorage.setItem('last_opened_date', todayStr);
      // Create empty day in history
      setHistoricalDays((prevDays) => {
        const idx = prevDays.findIndex((day) => day.date.startsWith(todayStr));
        if (idx >= 0) return prevDays;
        return [...prevDays, { id: crypto.randomUUID(), date: new Date().toISOString(), caloriesEaten: 0 }];
      });
    }
  }, []);

  // Save current day whenever totalEaten changes
  useEffect(() => {
    if (onboardingCompleted) {
      saveCurrentDayLive(totalEaten);
    }
  }, [totalEaten, onboardingCompleted]);

  // Core Setters
  const saveOnboarding = (w: number, h: number, a: number, g: 'Mężczyzna' | 'Kobieta', al: number, computedTdee: number) => {
    setWeight(w);
    setHeight(h);
    setAge(a);
    setGender(g);
    setActivityLevel(al);
    setTdee(computedTdee);
    setOnboardingCompleted(true);
  };

  const updateMealItem = (category: 'breakfast' | 'lunch' | 'dinner' | 'snacks', item: MealItem) => {
    setMeals((prev) => {
      const entry = prev[category];
      const items = [...entry.items, item];
      
      const calories = entry.calories + item.calories;
      const protein = entry.protein + item.protein;
      const carbs = entry.carbs + item.carbs;
      const fat = entry.fat + item.fat;

      return {
        ...prev,
        [category]: { calories, protein, carbs, fat, items }
      };
    });
  };

  const deleteMealItem = (category: 'breakfast' | 'lunch' | 'dinner' | 'snacks', itemId: string) => {
    setMeals((prev) => {
      const entry = prev[category];
      const idx = entry.items.findIndex(item => item.id === itemId);
      if (idx === -1) return prev;

      const item = entry.items[idx];
      const items = entry.items.filter(it => it.id !== itemId);
      
      const calories = Math.max(0, entry.calories - item.calories);
      const protein = Math.max(0, entry.protein - item.protein);
      const carbs = Math.max(0, entry.carbs - item.carbs);
      const fat = Math.max(0, entry.fat - item.fat);

      return {
        ...prev,
        [category]: { calories, protein, carbs, fat, items }
      };
    });
  };

  const updateMealManual = (category: 'breakfast' | 'lunch' | 'dinner' | 'snacks', field: 'calories' | 'protein' | 'carbs' | 'fat', value: number) => {
    setMeals((prev) => {
      const entry = prev[category];
      return {
        ...prev,
        [category]: {
          ...entry,
          [field]: value
        }
      };
    });
  };

  const clearMeal = (category: 'breakfast' | 'lunch' | 'dinner' | 'snacks') => {
    setMeals((prev) => ({
      ...prev,
      [category]: DEFAULT_MEAL()
    }));
  };

  const updateProfile = (profile: { weight?: number; height?: number; age?: number; gender?: 'Mężczyzna' | 'Kobieta'; activityLevel?: number; tdee?: number }) => {
    if (profile.weight !== undefined) setWeight(profile.weight);
    if (profile.height !== undefined) setHeight(profile.height);
    if (profile.age !== undefined) setAge(profile.age);
    if (profile.gender !== undefined) setGender(profile.gender);
    if (profile.activityLevel !== undefined) setActivityLevel(profile.activityLevel);
    if (profile.tdee !== undefined) setTdee(profile.tdee);
  };

  const setStrictLimitMode = (mode: boolean) => {
    setStrictLimitModeState(mode);
  };

  const addWorkoutEntry = (entry: Omit<WorkoutEntry, 'id'>) => {
    const newEntry: WorkoutEntry = {
      ...entry,
      id: crypto.randomUUID()
    };
    setWorkoutEntries(prev => [...prev, newEntry]);
  };

  const deleteWorkoutEntry = (id: string) => {
    setWorkoutEntries(prev => prev.filter(entry => entry.id !== id));
  };

  const addProductToHistory = (id: string, name: string, kcal100: number, p100: number, c100: number, f100: number) => {
    setProductsHistory(prev => {
      const idx = prev.findIndex(item => item.id === id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          useCount: updated[idx].useCount + 1,
          lastUsed: new Date().toISOString()
        };
        return updated;
      } else {
        const newHist: HistoryProduct = {
          id,
          name,
          kcalPer100g: kcal100,
          proteinPer100g: p100,
          carbsPer100g: c100,
          fatPer100g: f100,
          lastUsed: new Date().toISOString(),
          useCount: 1
        };
        return [...prev, newHist];
      }
    });
  };

  const addCustomProduct = (name: string, kcalPer100g: number, proteinPer100g: number, carbsPer100g: number, fatPer100g: number) => {
    const newProduct: CustomProduct = {
      id: crypto.randomUUID(),
      name,
      kcalPer100g,
      proteinPer100g,
      carbsPer100g,
      fatPer100g
    };
    setCustomProducts(prev => [...prev, newProduct]);
  };

  const addReminder = (hour: number, minute: number) => {
    const newReminder: ReminderTime = {
      id: crypto.randomUUID(),
      hour,
      minute
    };
    setReminders(prev => [...prev, newReminder]);
  };

  const deleteReminder = (id: string) => {
    setReminders(prev => prev.filter(rem => rem.id !== id));
  };

  const setApiKey = (key: string) => {
    setApiKeyState(key);
  };

  const setLatestReport = (report: DietitianReport | null) => {
    setLatestReportState(report);
  };

  const loadDemoData = () => {
    // Generate historical days (last 14 days)
    const demoHistory: HistoricalDay[] = [];
    const now = new Date();
    for (let i = 14; i >= 1; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      // Random calories between 1600 and 2400
      const randomCalories = Math.floor(Math.random() * 800) + 1600;
      demoHistory.push({
        id: crypto.randomUUID(),
        date: d.toISOString(),
        caloriesEaten: randomCalories
      });
    }

    // Generate workout entries
    const demoWorkouts: WorkoutEntry[] = [
      {
        id: crypto.randomUUID(),
        date: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        exerciseName: 'Wyciskanie leżąc',
        weight: 60,
        sets: 4,
        reps: 10
      },
      {
        id: crypto.randomUUID(),
        date: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        exerciseName: 'Przysiad ze sztangą',
        weight: 80,
        sets: 3,
        reps: 8
      },
      {
        id: crypto.randomUUID(),
        date: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        exerciseName: 'Wyciskanie leżąc',
        weight: 62.5,
        sets: 4,
        reps: 10
      },
      {
        id: crypto.randomUUID(),
        date: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        exerciseName: 'Martwy ciąg',
        weight: 100,
        sets: 3,
        reps: 5
      },
      {
        id: crypto.randomUUID(),
        date: now.toISOString(),
        exerciseName: 'Wyciskanie leżąc',
        weight: 65,
        sets: 4,
        reps: 9
      }
    ];

    setHistoricalDays(demoHistory);
    setWorkoutEntries(demoWorkouts);
    
    // Add custom products
    const demoCustom: CustomProduct[] = [
      { id: crypto.randomUUID(), name: "Odżywka Białkowa WPI", kcalPer100g: 380, proteinPer100g: 85, carbsPer100g: 3, fatPer100g: 2 },
      { id: crypto.randomUUID(), name: "Kreatyna Monohydrat", kcalPer100g: 0, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 0 }
    ];
    setCustomProducts(demoCustom);
    
    // Alert the user
    alert("Załadowano dane demonstracyjne! Wykresy w Statystykach i Siłowni posiadają teraz dane.");
  };

  return (
    <CalorieTrackerContext.Provider value={{
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
      loadDemoData
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
