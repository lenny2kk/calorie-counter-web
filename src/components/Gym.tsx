import React, { useState } from 'react';
import { useCalorieTracker, toLocalYYYYMMDD, parseLocalDate } from '../hooks/useCalorieTracker';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Dumbbell, Plus, Minus, Trash2, Calendar as CalendarIcon, TrendingUp } from 'lucide-react';

export const Gym: React.FC = () => {
  const { workoutEntries, addWorkoutEntry, deleteWorkoutEntry } = useCalorieTracker();

  // Logging Form states
  const [exerciseName, setExerciseName] = useState('');
  const [weight, setWeight] = useState('');
  const [sets, setSets] = useState(3);
  const [reps, setReps] = useState(10);
  const [dateStr, setDateStr] = useState(() => toLocalYYYYMMDD(new Date()));

  // Chart states
  const [timeUnit, setTimeUnit] = useState<'weeks' | 'months'>('weeks');
  const [selectedExerciseFilter, setSelectedExerciseFilter] = useState('Wszystkie');
  const [selectedMetric, setSelectedMetric] = useState<'maxWeight' | 'volume'>('maxWeight');

  const predefinedSuggestions = [
    'Wyciskanie leżąc',
    'Przysiad ze sztangą',
    'Martwy ciąg',
    'Wyciskanie żołnierskie',
    'Wiosłowanie sztangą',
    'Uginanie przedramion',
  ];

  // List of unique logged exercises
  const loggedExercises = Array.from(
    new Set(workoutEntries.map(e => e.exerciseName.trim()))
  ).filter(name => name.length > 0).sort();

  const suggestionList = loggedExercises.length > 0 ? loggedExercises : predefinedSuggestions;

  const isInputValid = exerciseName.trim() && parseFloat(weight) > 0 && sets > 0 && reps > 0;

  const handleAddWorkout = (e: React.FormEvent) => {
    e.preventDefault();
    const w = parseFloat(weight);
    if (isNaN(w) || w <= 0) return;

    const [yr, mo, dy] = dateStr.split('-').map(Number);
    const localNoonDate = new Date(yr, mo - 1, dy, 12, 0, 0);

    addWorkoutEntry({
      date: localNoonDate.toISOString(),
      exerciseName: exerciseName.trim(),
      weight: w,
      sets,
      reps
    });

    setWeight('');
  };

  // Process data for charts
  // Groups entries by Week or Month, and aggregates
  const getChartData = () => {
    if (workoutEntries.length === 0) return [];

    // Filter by exercise
    const filteredEntries = selectedExerciseFilter === 'Wszystkie'
      ? workoutEntries
      : workoutEntries.filter(entry => entry.exerciseName === selectedExerciseFilter);

    // Group by period (Week or Month start date)
    const groups: { [key: string]: typeof workoutEntries } = {};

    filteredEntries.forEach(entry => {
      const entryDate = new Date(entry.date);
      let periodKey = '';

      if (timeUnit === 'weeks') {
        // Find Monday of the week
        const day = entryDate.getDay();
        const diff = entryDate.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(entryDate.setDate(diff));
        periodKey = toLocalYYYYMMDD(monday);
      } else {
        // Month start
        periodKey = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, '0')}-01`;
      }

      const exerciseGroupKey = `${entry.exerciseName}_${periodKey}`;
      if (!groups[exerciseGroupKey]) {
        groups[exerciseGroupKey] = [];
      }
      groups[exerciseGroupKey].push(entry);
    });

    // Compute metric value per group
    // Chart points: date, [exerciseName]: value
    const chartPointsMap: { [periodKey: string]: { date: string; [exercise: string]: any } } = {};

    Object.entries(groups).forEach(([key, entries]) => {
      const [exercise, periodKey] = key.split('_');
      
      let val = 0;
      if (selectedMetric === 'maxWeight') {
        val = Math.max(...entries.map(e => e.weight));
      } else {
        // Volume: sum (weight * sets * reps)
        val = entries.reduce((sum, e) => sum + (e.weight * e.sets * e.reps), 0);
      }

      if (!chartPointsMap[periodKey]) {
        chartPointsMap[periodKey] = { date: periodKey };
      }
      chartPointsMap[periodKey][exercise] = val;
    });

    // Format for Recharts and sort chronologically
    return Object.values(chartPointsMap).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  };

  const chartData = getChartData();
  const sortedHistory = [...workoutEntries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const formatXAxisDate = (dateStr: string) => {
    try {
      const d = parseLocalDate(dateStr);
      if (timeUnit === 'weeks') {
        return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
      } else {
        const months = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];
        return `${months[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
      }
    } catch {
      return dateStr;
    }
  };

  // Get active exercises in chart to render Lines in Recharts
  const activeExercises = selectedExerciseFilter === 'Wszystkie'
    ? loggedExercises
    : [selectedExerciseFilter];

  const colors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#38bdf8'];

  return (
    <div className="space-y-6 pb-20 animate-fade-in">
      {/* ADD EXERCISE CARD */}
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
              placeholder="Nazwa ćwiczenia (np. Przysiad)"
              required
              className="w-full bg-slate-950 border border-slate-900 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-700 focus:outline-none focus:border-emerald-500 transition-colors text-sm"
            />
          </div>

          {/* Suggestions Chips */}
          <div className="flex overflow-x-auto py-1 scroll-none gap-2">
            {suggestionList.map(suggestion => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setExerciseName(suggestion)}
                className={`flex-none px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                  exerciseName === suggestion
                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 font-bold'
                    : 'bg-slate-950 border-slate-900 text-slate-400 hover:border-slate-800'
                }`}
              >
                {suggestion}
              </button>
            ))}
          </div>

          {/* Inputs Row 1: Weight & Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1">Ciężar (kg)</label>
              <input
                type="number"
                step="0.5"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="np. 60"
                required
                className="w-full bg-slate-950 border border-slate-900 rounded-xl px-4 py-2.5 text-slate-200 placeholder-slate-700 focus:outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1">Data treningu</label>
              <div className="relative">
                <input
                  type="date"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-900 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none text-sm cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Inputs Row 2: Sets & Reps */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1">Serie</label>
              <div className="flex items-center justify-between bg-slate-950 border border-slate-900 rounded-xl px-2 py-2">
                <button
                  type="button"
                  onClick={() => setSets(s => Math.max(1, s - 1))}
                  className="p-1 text-emerald-400 active:scale-[0.9] cursor-pointer"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="font-bold text-slate-200 text-sm">{sets}</span>
                <button
                  type="button"
                  onClick={() => setSets(s => s + 1)}
                  className="p-1 text-emerald-400 active:scale-[0.9] cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1">Powtórzenia</label>
              <div className="flex items-center justify-between bg-slate-950 border border-slate-900 rounded-xl px-2 py-2">
                <button
                  type="button"
                  onClick={() => setReps(r => Math.max(1, r - 1))}
                  className="p-1 text-emerald-400 active:scale-[0.9] cursor-pointer"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="font-bold text-slate-200 text-sm">{reps}</span>
                <button
                  type="button"
                  onClick={() => setReps(r => r + 1)}
                  className="p-1 text-emerald-400 active:scale-[0.9] cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
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

      {/* CHARTS PROGRESS CARD */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-200 flex items-center space-x-2">
          <TrendingUp className="w-5 h-5 text-emerald-400" />
          <span>Postępy</span>
        </h3>

        {/* TimeUnit Picker */}
        <div className="grid grid-cols-2 gap-1 bg-slate-950 border border-slate-900 rounded-xl p-1">
          <button
            onClick={() => setTimeUnit('weeks')}
            className={`py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              timeUnit === 'weeks' ? 'bg-emerald-500/10 text-emerald-400 font-bold' : 'text-slate-500'
            }`}
          >
            Tygodnie
          </button>
          <button
            onClick={() => setTimeUnit('months')}
            className={`py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              timeUnit === 'months' ? 'bg-emerald-500/10 text-emerald-400 font-bold' : 'text-slate-500'
            }`}
          >
            Miesiące
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-xxs font-semibold text-slate-500 uppercase tracking-wider mb-1">Ćwiczenie</label>
            <select
              value={selectedExerciseFilter}
              onChange={(e) => setSelectedExerciseFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-900 text-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none cursor-pointer"
            >
              <option value="Wszystkie">Wszystkie</option>
              {loggedExercises.map(ex => (
                <option key={ex} value={ex}>{ex}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xxs font-semibold text-slate-500 uppercase tracking-wider mb-1">Wskaźnik</label>
            <select
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-900 text-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none cursor-pointer"
            >
              <option value="maxWeight">Maks. ciężar (kg)</option>
              <option value="volume">Objętość (kg*ser*pow)</option>
            </select>
          </div>
        </div>

        {/* Recharts Progress Graph */}
        {chartData.length === 0 ? (
          <div className="h-44 flex flex-col items-center justify-center text-slate-600 text-center px-4 border border-dashed border-slate-800 rounded-xl">
            <svg className="w-8 h-8 opacity-40 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <span className="text-xxs">Dodaj treningi powyżej, aby zobaczyć wykres postępów.</span>
          </div>
        ) : (
          <div className="h-56 w-full -ml-5 text-xxs">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis
                  dataKey="date"
                  tickFormatter={formatXAxisDate}
                  stroke="#475569"
                  fontSize={10}
                />
                <YAxis stroke="#475569" fontSize={10} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }}
                  labelClassName="text-slate-400 font-bold"
                />
                {selectedExerciseFilter === 'Wszystkie' && <Legend iconType="circle" />}
                {activeExercises.map((ex, idx) => (
                  <Line
                    key={ex}
                    type="monotone"
                    dataKey={ex}
                    name={ex}
                    stroke={colors[idx % colors.length]}
                    strokeWidth={2}
                    activeDot={{ r: 5 }}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* LOG HISTORY */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">Ostatnie wpisy</h3>
        
        {sortedHistory.length === 0 ? (
          <p className="text-slate-600 text-xs italic pl-1">Brak zapisanych treningów.</p>
        ) : (
          <div className="space-y-2.5">
            {sortedHistory.map(entry => (
              <div
                key={entry.id}
                className="glass-card rounded-xl p-4 flex flex-col space-y-2"
              >
                <div className="flex items-start justify-between">
                  <span className="font-bold text-slate-200 text-sm leading-tight max-w-[85%]">{entry.exerciseName}</span>
                  <button
                    onClick={() => {
                      if (confirm('Usunąć ten wpis z historii treningów?')) {
                        deleteWorkoutEntry(entry.id);
                      }
                    }}
                    className="p-1 hover:text-red-400 text-slate-600 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="flex items-center justify-between text-xxs">
                  <span className="text-slate-500 flex items-center space-x-1">
                    <CalendarIcon className="w-3.5 h-3.5 text-slate-500 mr-1" />
                    <span>{new Date(entry.date).toLocaleDateString('pl-PL')}</span>
                  </span>
                  <span className="font-bold text-emerald-400">
                    {entry.weight} kg  ×  {entry.sets} ser.  ×  {entry.reps} powt.
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
