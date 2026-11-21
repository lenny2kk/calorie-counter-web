import { useState } from 'react';
import { useCalorieTracker } from './useCalorieTracker';
import { fetchDietitianReport } from '../services/dietitian';
import { buildDietitianContext } from '../services/dietitianContext';

/** Generuje raport Dietetyka AI dla wybranego dnia z kontekstem tygodnia, wagi i treningów. */
export const useDietitianReport = () => {
  const {
    apiKey,
    selectedDate,
    totalEaten,
    totalProtein,
    totalCarbs,
    totalFat,
    tdee,
    isStrictLimitMode,
    weight,
    historicalDays,
    weightLog,
    workoutEntries,
    setLatestReport,
  } = useCalorieTracker();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async (): Promise<boolean> => {
    if (isLoading) return false;
    setIsLoading(true);
    setError(null);
    try {
      const context = buildDietitianContext({
        date: selectedDate,
        day: { calories: totalEaten, protein: totalProtein, carbs: totalCarbs, fat: totalFat },
        tdee,
        isStrictLimitMode,
        profileWeight: weight,
        historicalDays,
        weightLog,
        workoutEntries,
      });
      const report = await fetchDietitianReport({ apiKey, context });
      await setLatestReport(report);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wystąpił błąd podczas generowania raportu.');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return { generate, isLoading, error };
};
