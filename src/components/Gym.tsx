import React, { useState, useMemo, useEffect } from 'react';
import { useCalorieTracker, toLocalYYYYMMDD } from '../hooks/useCalorieTracker';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import type { WorkoutEntry } from '../types';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';
import { 
  Dumbbell, 
  Plus, 
  Minus, 
  Trash2, 
  Calendar as CalendarIcon, 
  TrendingUp, 
  ArrowLeft, 
  Trophy, 
  ChevronRight, 
  Award, 
  Activity 
} from 'lucide-react';

// ==========================================
// 1. BEZPIECZNE UTILITY DO PARSOWANIA I FORMATOWANIA DAT
// ==========================================

/**
 * Bezpiecznie parsuje datę (w formacie ISO lub YYYY-MM-DD) do obiektu Date,
 * unikając przesunięć strefy czasowej (UTC vs Local).
 */
export const parseSafeDate = (dateVal: string | Date | undefined | null): Date => {
  if (!dateVal) return new Date();
  if (dateVal instanceof Date) return dateVal;
  
  const dateStr = String(dateVal).trim();
  
  // Wzór YYYY-MM-DD - parsujemy lokalnie o godzinie 12:00, aby uniknąć przesunięcia o strefę czasową
  const yyyymmddMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (yyyymmddMatch) {
    const [_, y, m, d] = yyyymmddMatch.map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  }
  
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  
  return new Date();
};

/** Formatuje datę lokalną na format DD.MM (np. 27.06) do osi X wykresu */
export const formatLocalDDMM = (date: Date): string => {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}.${m}`;
};

/** Formatuje datę lokalną na format YYYY-MM-DD */
export const formatLocalYYYYMMDD = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Formatuje datę na pełny polski zapis (np. Sobota, 27 czerwca 2026) */
export const formatPolishDate = (date: Date): string => {
  const days = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
  const months = [
    'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
    'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'
  ];
  return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
};

/** Formatuje datę lokalną na format DD.MM.YYYY */
export const formatDDMMYYYY = (date: Date): string => {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}.${m}.${y}`;
};

/** Pomocnicza funkcja do odmiany słowa "seria" po polsku */
export const getSetsWord = (count: number): string => {
  if (count === 1) return 'seria';
  if (count >= 2 && count <= 4) return 'serie';
  return 'serii';
};

/** Pomocnicza funkcja do odmiany słowa "powtórzenie" po polsku */
export const getRepsWord = (count: number): string => {
  if (count === 1) return 'powtórzenie';
  if (count >= 2 && count <= 4) return 'powtórzenia';
  return 'powtórzeń';
};

export const Gym: React.FC = () => {
  const { user, workoutEntries, addWorkoutEntry, deleteWorkoutEntry } = useCalorieTracker();

  // ==========================================
  // STANY DLA FORMULARZA ZAPISYWANIA TRENINGU
  // ==========================================
  const [exerciseName, setExerciseName] = useState('');
  const [setsList, setSetsList] = useState<Array<{ weight: string; reps: number }>>([{ weight: '', reps: 10 }]);
  const [dateStr, setDateStr] = useState(() => toLocalYYYYMMDD(new Date()));
  
  // State for last workout preview (undefined = loading, null = first time / empty, WorkoutEntry = data)
  const [lastWorkout, setLastWorkout] = useState<WorkoutEntry | null | undefined>(undefined);

  useEffect(() => {
    const trimmedName = exerciseName.trim();
    if (!trimmedName) {
      setLastWorkout(null);
      return;
    }

    setLastWorkout(undefined);

    const delayDebounce = setTimeout(async () => {
      try {
        if (!user || !db) {
          // Fallback to local entries if db or user is not available
          const localMatches = workoutEntries
            .filter(e => e.exerciseName.trim().toLowerCase() === trimmedName.toLowerCase())
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setLastWorkout(localMatches.length > 0 ? localMatches[0] : null);
          return;
        }

        const workoutsRef = collection(db, 'users', user.uid, 'workouts');
        const q = query(
          workoutsRef,
          where('exerciseName', '==', trimmedName),
          orderBy('date', 'desc'),
          limit(1)
        );
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const docData = querySnapshot.docs[0].data();
          setLastWorkout({
            id: querySnapshot.docs[0].id,
            date: docData.date,
            exerciseName: docData.exerciseName,
            sets: docData.sets || []
          } as WorkoutEntry);
        } else {
          // If Firestore subcollection doesn't contain it yet, check local state
          const localMatches = workoutEntries
            .filter(e => e.exerciseName.trim().toLowerCase() === trimmedName.toLowerCase())
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setLastWorkout(localMatches.length > 0 ? localMatches[0] : null);
        }
      } catch (err) {
        console.error("Error fetching last workout from Firestore subcollection:", err);
        // Fallback to local search if query fails
        const localMatches = workoutEntries
          .filter(e => e.exerciseName.trim().toLowerCase() === trimmedName.toLowerCase())
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setLastWorkout(localMatches.length > 0 ? localMatches[0] : null);
      }
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [exerciseName, user, workoutEntries]);

  // ==========================================
  // STANY DLA NOWEJ TRÓJSTOPNIOWEJ ARCHITEKTURY UX
  // ==========================================
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);
  const [selectedExerciseName, setSelectedExerciseName] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<'maxWeight' | 'volume'>('maxWeight');

  // Predefiniowane sugestie ćwiczeń
  const predefinedSuggestions = [
    'Wyciskanie leżąc',
    'Przysiad ze sztangą',
    'Martwy ciąg',
    'Wyciskanie żołnierskie',
    'Wiosłowanie sztangą',
    'Uginanie przedramion',
    'Wznosy bokiem'
  ];

  // Lista unikalnych, zalogowanych ćwiczeń do podpowiedzi
  const loggedExercises = useMemo(() => {
    return Array.from(
      new Set(workoutEntries.map(e => e.exerciseName.trim()))
    ).filter(name => name.length > 0).sort();
  }, [workoutEntries]);

  const suggestionList = loggedExercises.length > 0 ? loggedExercises : predefinedSuggestions;

  const isInputValid = 
    exerciseName.trim() && 
    setsList.length > 0 && 
    setsList.every(s => s.weight.trim() !== '' && !isNaN(parseFloat(s.weight)) && parseFloat(s.weight) > 0 && s.reps > 0);

  // Dodawanie treningu
  const handleAddWorkout = (e: React.FormEvent) => {
    e.preventDefault();

    const formattedSets = setsList.map(s => ({
      weight: parseFloat(s.weight),
      reps: s.reps
    }));

    if (formattedSets.some(s => isNaN(s.weight) || s.weight <= 0 || s.reps <= 0)) return;

    const [yr, mo, dy] = dateStr.split('-').map(Number);
    const localNoonDate = new Date(yr, mo - 1, dy, 12, 0, 0);

    addWorkoutEntry({
      date: localNoonDate.toISOString(),
      exerciseName: exerciseName.trim(),
      sets: formattedSets
    });

    // Reset formularza
    setExerciseName('');
    setSetsList([{ weight: '', reps: 10 }]);
    
    // Automatycznie przełącz na dodany dzień, aby użytkownik widział swój wpis
    const addedDayStr = formatLocalYYYYMMDD(localNoonDate);
    setSelectedDateStr(addedDayStr);
    setSelectedExerciseName(exerciseName.trim());
  };

  // ==========================================
  // DANE DO ARCHITEKTURY UX: KROK 1, 2, 3
  // ==========================================

  // Grupowanie wpisów według unikalnych dni kalendarzowych (Local Time)
  const groupedDaysMap = useMemo(() => {
    const map: { [dateStr: string]: typeof workoutEntries } = {};
    workoutEntries.forEach(entry => {
      const parsed = parseSafeDate(entry.date);
      const dayStr = formatLocalYYYYMMDD(parsed);
      if (!map[dayStr]) {
        map[dayStr] = [];
      }
      map[dayStr].push(entry);
    });
    return map;
  }, [workoutEntries]);

  // Sortowanie dni chronologicznie malejąco (najnowsze na górze)
  const sortedGroupedDays = useMemo(() => {
    return Object.entries(groupedDaysMap)
      .map(([dateStr, entries]) => ({
        dateStr,
        dateObj: parseSafeDate(dateStr),
        entries
      }))
      .sort((a, b) => b.dateStr.localeCompare(a.dateStr));
  }, [groupedDaysMap]);

  // Reaktywny powrót / reset stanów w przypadku usunięcia ostatniego ćwiczenia
  useEffect(() => {
    if (selectedDateStr) {
      const workoutsForDay = groupedDaysMap[selectedDateStr];
      if (!workoutsForDay || workoutsForDay.length === 0) {
        setSelectedDateStr(null);
        setSelectedExerciseName(null);
      } else if (selectedExerciseName) {
        const hasExercise = workoutsForDay.some(
          e => e.exerciseName.trim().toLowerCase() === selectedExerciseName.trim().toLowerCase()
        );
        if (!hasExercise) {
          setSelectedExerciseName(null);
        }
      }
    }
  }, [workoutEntries, selectedDateStr, selectedExerciseName, groupedDaysMap]);

  // Wyliczenie historii i statystyk progresu dla wybranego ćwiczenia (KROK 3)
  const exerciseProgress = useMemo(() => {
    if (!selectedExerciseName) return null;

    // Pobierz wszystkie wpisy dla tego jednego ćwiczenia, posortowane chronologicznie rosnąco
    const history = workoutEntries
      .filter(e => e.exerciseName.trim().toLowerCase() === selectedExerciseName.trim().toLowerCase())
      .map(e => {
        const parsed = parseSafeDate(e.date);
        const maxWeight = Math.max(...e.sets.map(s => s.weight));
        const volume = e.sets.reduce((sum, s) => sum + (s.weight * s.reps), 0);
        return {
          id: e.id,
          dateStr: formatLocalYYYYMMDD(parsed),
          displayDate: formatLocalDDMM(parsed),
          maxWeight,
          volume,
          setsCount: e.sets.length,
          sets: e.sets
        };
      })
      .sort((a, b) => a.dateStr.localeCompare(b.dateStr));

    // Rekordy życiowe
    const prWeight = history.length > 0 ? Math.max(...history.map(h => h.maxWeight)) : 0;
    const prVolume = history.length > 0 ? Math.max(...history.map(h => h.volume)) : 0;

    // Bieżący i poprzedni trening dla wybranego dnia
    let currentWorkout = null;
    let previousWorkout = null;

    if (selectedDateStr) {
      const currIdx = history.findIndex(h => h.dateStr === selectedDateStr);
      if (currIdx !== -1) {
        currentWorkout = history[currIdx];
        if (currIdx > 0) {
          previousWorkout = history[currIdx - 1];
        }
      }
    }

    return {
      history,
      prWeight,
      prVolume,
      currentWorkout,
      previousWorkout
    };
  }, [workoutEntries, selectedExerciseName, selectedDateStr]);

  const renderLastWorkoutPreview = () => {
    const trimmedName = exerciseName.trim();
    if (!trimmedName) return null;

    if (lastWorkout === undefined) {
      return (
        <div className="bg-slate-900/40 border border-slate-900/60 rounded-xl px-3 py-2 text-xs text-slate-500 animate-pulse">
          Ładowanie podglądu ostatniego treningu...
        </div>
      );
    }

    if (lastWorkout === null) {
      return (
        <div className="bg-slate-900/30 border border-slate-900/60 border-dashed rounded-xl px-3 py-2 text-xs text-slate-400 italic animate-fade-in flex items-center space-x-1.5">
          <span role="img" aria-label="sparkles">✨</span>
          <span>To Twoje pierwsze podejście do tego ćwiczenia. Powodzenia!</span>
        </div>
      );
    }

    // Format details
    const firstSet = lastWorkout.sets[0];
    if (!firstSet) return null;

    const allSameWeight = lastWorkout.sets.every(s => s.weight === firstSet.weight);
    const allSameReps = lastWorkout.sets.every(s => s.reps === firstSet.reps);

    let weightStr = '';
    let setsRepsStr = '';

    if (allSameWeight && allSameReps) {
      weightStr = `${firstSet.weight}kg`;
      setsRepsStr = `${lastWorkout.sets.length} ${getSetsWord(lastWorkout.sets.length)} x ${firstSet.reps} ${getRepsWord(firstSet.reps)}`;
    } else {
      const maxWeight = Math.max(...lastWorkout.sets.map(s => s.weight));
      const minReps = Math.min(...lastWorkout.sets.map(s => s.reps));
      const maxReps = Math.max(...lastWorkout.sets.map(s => s.reps));
      weightStr = `${maxWeight}kg (max)`;
      setsRepsStr = `${lastWorkout.sets.length} ${getSetsWord(lastWorkout.sets.length)} x ${minReps === maxReps ? minReps : `${minReps}-${maxReps}`} ${getRepsWord(maxReps)}`;
    }

    return (
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl px-3 py-2.5 text-xs text-slate-300 flex flex-wrap items-center gap-x-2 gap-y-1 animate-fade-in shadow-sm">
        <span className="text-emerald-400 font-bold flex items-center gap-1">
          <span>🏋️</span>
          <span>Ostatnio:</span>
        </span>
        <span className="font-semibold text-slate-100">{lastWorkout.exerciseName}</span>
        <span className="text-slate-700">|</span>
        <span className="text-slate-300">{formatDDMMYYYY(parseSafeDate(lastWorkout.date))}</span>
        <span className="text-slate-700">|</span>
        <span className="font-bold text-amber-400">{weightStr}</span>
        <span className="text-slate-700">|</span>
        <span className="text-slate-300 font-medium">{setsRepsStr}</span>
      </div>
    );
  };

  // Obsługa powrotu (wstecz) w nawigacji
  const handleBack = () => {
    if (selectedExerciseName) {
      setSelectedExerciseName(null);
    } else if (selectedDateStr) {
      setSelectedDateStr(null);
    }
  };

  return (
    <div className="space-y-6 pb-20 animate-fade-in text-slate-100">
      
      {/* ==========================================
          SEKCJA: ZAPISZ ĆWICZENIE (FORMULARZ)
          ========================================== */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-200 flex items-center space-x-2">
          <Dumbbell className="w-5 h-5 text-emerald-400" />
          <span>Zapisz ćwiczenie</span>
        </h3>

        <form onSubmit={handleAddWorkout} className="space-y-4">
          <div>
            <input
              type="text"
              value={exerciseName}
              onChange={(e) => setExerciseName(e.target.value)}
              placeholder="Nazwa ćwiczenia (np. Wznosy bokiem)"
              required
              className="w-full bg-slate-950 border border-slate-900 rounded-xl px-4 py-1.5 text-slate-100 placeholder-slate-700 placeholder:text-sm focus:outline-none focus:border-emerald-500 transition-colors text-base"
            />
          </div>

          {/* Sugestie ćwiczeń */}
          <div className="flex overflow-x-auto py-1 scroll-none gap-2">
            {suggestionList.map(suggestion => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setExerciseName(suggestion)}
                className={`flex-none px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                  exerciseName.toLowerCase() === suggestion.toLowerCase()
                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 font-bold'
                    : 'bg-slate-950 border-slate-900 text-slate-400 hover:border-slate-800'
                }`}
              >
                {suggestion}
              </button>
            ))}
          </div>

          {renderLastWorkoutPreview()}

          {/* Data */}
          <div>
            <label className="block text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1">Data treningu</label>
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              required
              className="w-full bg-slate-950 border border-slate-900 rounded-xl px-4 py-1.5 text-slate-200 focus:outline-none text-base cursor-pointer"
            />
          </div>

          {/* Edytor serii */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xxs font-semibold text-slate-400 uppercase tracking-wider">Serie treningowe</label>
              <span className="text-xxs text-slate-500 font-medium">
                Suma objętości: <span className="text-emerald-400 font-bold">{
                  setsList.reduce((sum, s) => sum + (parseFloat(s.weight) || 0) * (s.reps || 0), 0)
                } kg</span>
              </span>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {setsList.map((set, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-slate-950/60 border border-slate-900/60 rounded-xl p-2">
                  <div className="w-7 h-7 flex items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 font-bold text-xs flex-none">
                    {idx + 1}
                  </div>

                  {/* Ciężar */}
                  <div className="flex-1 min-w-[70px]">
                    <div className="relative flex items-center">
                      <input
                        type="number"
                        step="0.5"
                        placeholder="Ciężar"
                        value={set.weight}
                        onChange={(e) => {
                          const newList = [...setsList];
                          newList[idx].weight = e.target.value;
                          setSetsList(newList);
                        }}
                        required
                        className="w-full bg-slate-950 border border-slate-900 rounded-lg px-2 py-1 text-slate-200 placeholder-slate-700 text-xs focus:outline-none focus:border-emerald-500/50"
                      />
                      <span className="absolute right-2 text-[10px] text-slate-600 font-semibold pointer-events-none">kg</span>
                    </div>
                  </div>

                  {/* Powtórzenia */}
                  <div className="flex items-center justify-between bg-slate-950 border border-slate-900 rounded-lg px-1.5 py-1 min-w-[90px]">
                    <button
                      type="button"
                      onClick={() => {
                        const newList = [...setsList];
                        newList[idx].reps = Math.max(1, newList[idx].reps - 1);
                        setSetsList(newList);
                      }}
                      className="p-0.5 text-emerald-400 active:scale-[0.8] cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-bold text-slate-200 text-xs px-1">{set.reps}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const newList = [...setsList];
                        newList[idx].reps = newList[idx].reps + 1;
                        setSetsList(newList);
                      }}
                      className="p-0.5 text-emerald-400 active:scale-[0.8] cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Usuwanie serii */}
                  <button
                    type="button"
                    disabled={setsList.length <= 1}
                    onClick={() => {
                      if (setsList.length > 1) {
                        setSetsList(setsList.filter((_, i) => i !== idx));
                      }
                    }}
                    className={`p-1.5 rounded-lg transition-colors ${
                      setsList.length > 1
                        ? 'text-red-400/70 hover:text-red-400 hover:bg-red-500/5 cursor-pointer'
                        : 'text-slate-800 cursor-not-allowed'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                const lastSet = setsList[setsList.length - 1];
                setSetsList([...setsList, { 
                  weight: lastSet ? lastSet.weight : '', 
                  reps: lastSet ? lastSet.reps : 10 
                }]);
              }}
              className="w-full py-2 bg-slate-900/40 hover:bg-slate-900 border border-dashed border-slate-800 hover:border-slate-700 text-emerald-400 hover:text-emerald-300 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.99]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Dodaj serię</span>
            </button>
          </div>

          <button
            type="submit"
            disabled={!isInputValid}
            className={`w-full py-3.5 rounded-xl font-bold text-white shadow-lg transition-all ${
              isInputValid
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 active:scale-[0.99] shadow-emerald-500/10 cursor-pointer'
                : 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed'
            }`}
          >
            Dodaj trening
          </button>
        </form>
      </div>

      {/* ==========================================
          SEKCJA: HISTORIA I PROGRES (TRÓJSTOPNIOWE UX)
          ========================================== */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        
        {/* Nagłówek sekcji */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-900">
          <h3 className="text-sm font-bold text-slate-200 flex items-center space-x-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            <span>Dziennik Treningowy i Postępy</span>
          </h3>
          
          {(selectedDateStr || selectedExerciseName) && (
            <button
              onClick={handleBack}
              className="flex items-center space-x-1 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-all cursor-pointer bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 px-2.5 py-1 rounded-lg"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Cofnij</span>
            </button>
          )}
        </div>

        {/* ==========================================
            KROK 1: Segregacja na dni
            ========================================== */}
        {!selectedDateStr && (
          <div className="space-y-3">
            <label className="block text-xxs font-bold text-slate-500 uppercase tracking-widest pl-1">
              Krok 1: Wybierz dzień treningowy
            </label>
            
            {sortedGroupedDays.length === 0 ? (
              <div className="py-10 text-center border border-dashed border-slate-900 rounded-xl">
                <CalendarIcon className="w-8 h-8 mx-auto text-slate-700 mb-2" />
                <p className="text-slate-500 text-xs italic">Brak zapisanych treningów w historii.</p>
              </div>
            ) : (
              <div className="grid gap-2.5">
                {sortedGroupedDays.map(({ dateStr: dStr, dateObj, entries }) => {
                  // Zliczamy unikalne ćwiczenia tego dnia
                  const exerciseCount = new Set(entries.map(e => e.exerciseName)).size;
                  
                  return (
                    <button
                      key={dStr}
                      onClick={() => setSelectedDateStr(dStr)}
                      className="w-full text-left glass-card hover:bg-slate-900/60 border border-slate-900 hover:border-slate-800/80 p-4 rounded-xl flex items-center justify-between transition-all group active:scale-[0.99] cursor-pointer"
                    >
                      <div className="space-y-1">
                        <div className="font-bold text-slate-200 text-sm group-hover:text-emerald-400 transition-colors">
                          {formatPolishDate(dateObj)}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {Array.from(new Set(entries.map(e => e.exerciseName))).map((ex, i) => (
                            <span key={i} className="text-[10px] bg-slate-950 px-2 py-0.5 rounded text-slate-400 border border-slate-900">
                              {ex}
                            </span>
                          ))}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2 flex-none">
                        <div className="text-right">
                          <span className="block text-xs font-bold text-emerald-400">{exerciseCount} {exerciseCount === 1 ? 'ćwiczenie' : exerciseCount < 5 ? 'ćwiczenia' : 'ćwiczeń'}</span>
                          <span className="block text-[10px] text-slate-500">{entries.reduce((sum, e) => sum + e.sets.length, 0)} serii</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ==========================================
            KROK 2: Lista ćwiczeń z danego dnia
            ========================================== */}
        {selectedDateStr && !selectedExerciseName && (
          <div className="space-y-4">
            <div>
              <label className="block text-xxs font-bold text-slate-500 uppercase tracking-widest pl-1 mb-1">
                Krok 2: Wybierz ćwiczenie z dnia
              </label>
              <div className="text-xs text-emerald-400 font-bold bg-emerald-500/5 border border-emerald-500/10 px-3 py-1.5 rounded-lg">
                Wybrana data: {formatPolishDate(parseSafeDate(selectedDateStr))}
              </div>
            </div>

            <div className="space-y-2.5">
              {groupedDaysMap[selectedDateStr]?.map(entry => {
                const maxWeight = Math.max(...entry.sets.map(s => s.weight));
                const volume = entry.sets.reduce((sum, s) => sum + (s.weight * s.reps), 0);
                
                return (
                  <div
                    key={entry.id}
                    className="glass-card border border-slate-900 hover:border-slate-800 p-4 rounded-xl flex items-center justify-between transition-all group hover:bg-slate-900/40"
                  >
                    {/* Kliknięcie w treść wybiera ćwiczenie */}
                    <button
                      onClick={() => setSelectedExerciseName(entry.exerciseName)}
                      className="flex-1 text-left space-y-1 cursor-pointer"
                    >
                      <div className="font-bold text-slate-200 text-sm group-hover:text-emerald-400 transition-colors">
                        {entry.exerciseName}
                      </div>
                      <div className="flex gap-3 text-xxs text-slate-400">
                        <span>Serie: <strong className="text-slate-300">{entry.sets.length}</strong></span>
                        <span>Maks: <strong className="text-slate-300">{maxWeight} kg</strong></span>
                        <span>Objętość: <strong className="text-emerald-500/90">{volume} kg</strong></span>
                      </div>
                    </button>

                    {/* Usuwanie wpisu */}
                    <button
                      onClick={() => {
                        if (confirm(`Czy na pewno chcesz usunąć wpis "${entry.exerciseName}" z historii?`)) {
                          deleteWorkoutEntry(entry.id);
                        }
                      }}
                      className="p-2 ml-2 text-slate-600 hover:text-red-400 hover:bg-red-500/5 rounded-lg transition-all cursor-pointer flex-none"
                      title="Usuń trening"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
            
            {/* Lista serii w danym dniu */}
            <div className="bg-slate-950/60 border border-slate-900/60 rounded-xl p-3.5 space-y-2 text-xxs text-slate-400">
              <div className="font-bold text-slate-300">Szczegóły wykonanych serii:</div>
              {groupedDaysMap[selectedDateStr]?.map(entry => (
                <div key={entry.id} className="border-b border-slate-900 pb-2 last:border-b-0 last:pb-0">
                  <div className="font-semibold text-slate-300 mb-1">{entry.exerciseName}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {entry.sets.map((s, sIdx) => (
                      <span key={sIdx} className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-400">
                        <span className="text-emerald-400 font-bold">{sIdx + 1}.</span> {s.weight} kg × {s.reps}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==========================================
            KROK 3: Wykres Progresu i Porównanie
            ========================================== */}
        {selectedDateStr && selectedExerciseName && exerciseProgress && (
          <div className="space-y-5">
            
            {/* Nagłówek ćwiczenia i data */}
            <div className="space-y-1">
              <label className="block text-xxs font-bold text-slate-500 uppercase tracking-widest pl-1">
                Krok 3: Analiza progresu ćwiczenia
              </label>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 bg-slate-950/80 border border-slate-900 p-3 rounded-xl">
                <div>
                  <h4 className="font-extrabold text-slate-100 text-base">{selectedExerciseName}</h4>
                  <p className="text-xxs text-slate-400">
                    Trening z dnia: {formatPolishDate(parseSafeDate(selectedDateStr))}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setSelectedMetric('maxWeight')}
                    className={`px-3 py-1 rounded-lg text-xxs font-bold transition-all cursor-pointer ${
                      selectedMetric === 'maxWeight' 
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                        : 'bg-slate-900 text-slate-500 border border-transparent hover:text-slate-400'
                    }`}
                  >
                    Maks. Ciężar
                  </button>
                  <button
                    onClick={() => setSelectedMetric('volume')}
                    className={`px-3 py-1 rounded-lg text-xxs font-bold transition-all cursor-pointer ${
                      selectedMetric === 'volume' 
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                        : 'bg-slate-900 text-slate-500 border border-transparent hover:text-slate-400'
                    }`}
                  >
                    Objętość
                  </button>
                </div>
              </div>
            </div>

            {/* Statystyki: Bieżące vs Poprzednio oraz PR */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              
              {/* Box 1: Ciężar Maksymalny */}
              <div className="bg-slate-950/40 border border-slate-900 p-3 rounded-xl space-y-1">
                <span className="text-[10px] text-slate-500 font-semibold block uppercase">Ciężar Maksymalny</span>
                <div className="text-base font-black text-slate-200">
                  {exerciseProgress.currentWorkout?.maxWeight || 0} kg
                </div>
                {exerciseProgress.previousWorkout && (
                  <div className="text-[10px] font-medium">
                    {(() => {
                      const diff = (exerciseProgress.currentWorkout?.maxWeight || 0) - exerciseProgress.previousWorkout.maxWeight;
                      if (diff > 0) return <span className="text-emerald-400">+{diff} kg vs poprz.</span>;
                      if (diff < 0) return <span className="text-red-400">{diff} kg vs poprz.</span>;
                      return <span className="text-slate-500">bez zmian vs poprz.</span>;
                    })()}
                  </div>
                )}
              </div>

              {/* Box 2: Objętość Treningowa */}
              <div className="bg-slate-950/40 border border-slate-900 p-3 rounded-xl space-y-1">
                <span className="text-[10px] text-slate-500 font-semibold block uppercase">Objętość Sesji</span>
                <div className="text-base font-black text-slate-200">
                  {exerciseProgress.currentWorkout?.volume || 0} kg
                </div>
                {exerciseProgress.previousWorkout && (
                  <div className="text-[10px] font-medium">
                    {(() => {
                      const diff = (exerciseProgress.currentWorkout?.volume || 0) - exerciseProgress.previousWorkout.volume;
                      if (diff > 0) return <span className="text-emerald-400">+{diff} kg vs poprz.</span>;
                      if (diff < 0) return <span className="text-red-400">{diff} kg vs poprz.</span>;
                      return <span className="text-slate-500">bez zmian</span>;
                    })()}
                  </div>
                )}
              </div>

              {/* Box 3: Rekord Życiowy (PR) */}
              <div className="col-span-2 md:col-span-1 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 border border-emerald-500/10 p-3 rounded-xl flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 font-semibold block uppercase flex items-center gap-1">
                    <Trophy className="w-3.5 h-3.5 text-amber-400" />
                    Rekord Życiowy (PR)
                  </span>
                  <div className="text-base font-black text-amber-300">
                    {exerciseProgress.prWeight} kg
                  </div>
                  <span className="block text-[9px] text-slate-500">
                    Maks. objętość: {exerciseProgress.prVolume} kg
                  </span>
                </div>
                {exerciseProgress.currentWorkout?.maxWeight === exerciseProgress.prWeight && exerciseProgress.history.length > 1 && (
                  <div className="bg-amber-400/10 border border-amber-400/20 text-amber-300 font-bold px-2 py-0.5 rounded text-[9px] animate-pulse">
                    NOWY PR!
                  </div>
                )}
              </div>
            </div>

            {/* Wykres Recharts dla jednego ćwiczenia */}
            <div className="space-y-2">
              <div className="flex items-center justify-between pl-1">
                <span className="text-xxs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  Wykres Progresu na Przestrzeni Czasu
                </span>
                <span className="text-[10px] text-slate-500">
                  {exerciseProgress.history.length} {exerciseProgress.history.length === 1 ? 'trening' : exerciseProgress.history.length < 5 ? 'treningi' : 'treningów'} w bazie
                </span>
              </div>

              <div className="bg-slate-950/40 border border-slate-900 rounded-2xl p-4">
                {exerciseProgress.history.length < 2 ? (
                  <div className="h-44 flex flex-col items-center justify-center text-slate-600 text-center px-4 border border-dashed border-slate-800/80 rounded-xl">
                    <Award className="w-8 h-8 opacity-40 mb-2 text-slate-500" />
                    <span className="text-xxs">Zapisz to ćwiczenie w inne dni, aby odblokować linię trendu progresu.</span>
                  </div>
                ) : (
                  <div className="h-56 w-full -ml-4 text-xxs">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={exerciseProgress.history}>
                        <XAxis
                          dataKey="displayDate"
                          stroke="#475569"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis 
                          stroke="#475569" 
                          fontSize={10} 
                          tickLine={false}
                          axisLine={false}
                          domain={['auto', 'auto']}
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }}
                          labelClassName="text-slate-400 font-bold"
                          formatter={(value: any) => [`${value} kg`, selectedMetric === 'maxWeight' ? 'Maksymalny Ciężar' : 'Objętość'] }
                        />
                        <Line
                          type="monotone"
                          dataKey={selectedMetric}
                          stroke="#10b981"
                          strokeWidth={2.5}
                          activeDot={{ r: 6, fill: '#10b981', stroke: '#020617', strokeWidth: 2 }}
                          dot={(props: any) => {
                            const { cx, cy, payload } = props;
                            // Wyróżnij dzisiejszy/wybrany punkt na wykresie
                            const isCurrent = payload.dateStr === selectedDateStr;
                            return (
                              <circle 
                                key={payload.dateStr}
                                cx={cx} 
                                cy={cy} 
                                r={isCurrent ? 5 : 3.5} 
                                fill={isCurrent ? '#f59e0b' : '#10b981'} 
                                stroke="#020617" 
                                strokeWidth={isCurrent ? 2 : 1.5} 
                              />
                            );
                          }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>

            {/* Serie z tego dnia */}
            <div className="bg-slate-950/60 border border-slate-900 rounded-xl p-4 space-y-2">
              <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                Zapisane serie dla tego ćwiczenia (z {formatLocalDDMM(parseSafeDate(selectedDateStr))}):
              </span>
              <div className="flex flex-wrap gap-2">
                {exerciseProgress.currentWorkout?.sets.map((s, sIdx) => (
                  <span 
                    key={sIdx} 
                    className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 flex items-center space-x-1"
                  >
                    <span className="text-emerald-400 font-bold">{sIdx + 1}.</span>
                    <span>{s.weight} kg × {s.reps}</span>
                  </span>
                ))}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
};
