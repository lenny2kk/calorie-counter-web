import React, { useState } from 'react';
import { useCalorieTracker, toLocalYYYYMMDD } from '../hooks/useCalorieTracker';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { ChevronLeft, ChevronRight, Scale, Info } from 'lucide-react';
import { WeightLog } from './WeightLog';

export const Statistics: React.FC = () => {
  const { historicalDays, weight, height, statsLoading } = useCalorieTracker();
  const [weekOffset, setWeekOffset] = useState(0);

  // BMI calculations
  const heightInMeters = height / 100;
  const bmi = heightInMeters > 0 ? weight / (heightInMeters * heightInMeters) : 0;

  const getBmiCategory = (val: number) => {
    if (val < 18.5) return { label: 'Niedowaga', color: 'text-blue-400', barBg: 'bg-blue-400' };
    if (val < 25.0) return { label: 'Waga prawidłowa', color: 'text-emerald-400', barBg: 'bg-emerald-400' };
    if (val < 30.0) return { label: 'Nadwaga', color: 'text-amber-500', barBg: 'bg-amber-500' };
    return { label: 'Otyłość', color: 'text-red-500', barBg: 'bg-red-500' };
  };

  const bmiCat = getBmiCategory(bmi);

  // Get start of target week (Monday) based on offset
  const getMondayOfOffset = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset * 7);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  };

  const currentWeekDays = () => {
    const monday = getMondayOfOffset(weekOffset);
    const items = [];
    const dayNames = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];

    for (let i = 0; i < 7; i++) {
      const targetDate = new Date(monday);
      targetDate.setDate(monday.getDate() + i);
      const dateStr = toLocalYYYYMMDD(targetDate);

      // Find calorie count in historical days
      const match = historicalDays.find((day) => {
        const dStr = toLocalYYYYMMDD(new Date(day.date));
        return dStr === dateStr;
      });

      const dayLabel = `${dayNames[i]} ${String(targetDate.getDate()).padStart(2, '0')}.${String(targetDate.getMonth() + 1).padStart(2, '0')}`;

      items.push({
        name: dayLabel,
        calories: match ? match.caloriesEaten : 0,
        rawDate: targetDate
      });
    }
    return items;
  };

  const weekDays = currentWeekDays();

  // Header Title
  const getWeekRangeTitle = () => {
    if (weekOffset === 0) return 'Bieżący tydzień';
    const monday = getMondayOfOffset(weekOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const formatter = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${formatter.format(monday)} - ${formatter.format(sunday)}`;
  };

  // Calorie summary totals
  const totalWeekCalories = weekDays.reduce((sum, d) => sum + d.calories, 0);
  const activeDaysCount = weekDays.filter((d) => d.calories > 0).length;
  const averageCalories = activeDaysCount > 0 ? Math.round(totalWeekCalories / activeDaysCount) : 0;
  const averageWeeklyCalories = Math.round(totalWeekCalories / 7);

  // BMI Slider pointer offset
  const minBmi = 15;
  const maxBmi = 35;
  const clampedBmi = Math.max(minBmi, Math.min(maxBmi, bmi));
  const pointerPercentage = ((clampedBmi - minBmi) / (maxBmi - minBmi)) * 100;

  if (statsLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[350px] space-y-4">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-semibold text-slate-400">Ładowanie statystyk...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 animate-fade-in">
      {/* WEEK NAVIGATION BAR */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setWeekOffset(w => w - 1)}
          className="p-2 bg-slate-900 border border-slate-800 text-emerald-400 rounded-xl hover:bg-slate-800 active:scale-[0.95] cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <span className="font-bold text-slate-200 text-sm">{getWeekRangeTitle()}</span>

        <button
          onClick={() => setWeekOffset(w => w + 1)}
          disabled={weekOffset >= 0}
          className="p-2 bg-slate-900 border border-slate-800 text-emerald-400 rounded-xl hover:bg-slate-800 active:scale-[0.95] disabled:opacity-30 cursor-pointer"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Dzisiaj back shortcut button */}
      {weekOffset !== 0 && (
        <button
          onClick={() => setWeekOffset(0)}
          className="w-full py-2.5 text-center text-xs font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl hover:bg-emerald-500/20 cursor-pointer"
        >
          Wróć do obecnego tygodnia
        </button>
      )}

      {/* BAR CHART */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <div className="h-64 w-full -ml-6 text-xxs">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekDays}>
              <XAxis dataKey="name" stroke="#5a5067" fontSize={9} />
              <YAxis stroke="#5a5067" fontSize={9} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1f1a27', borderColor: '#2d2637', borderRadius: '12px' }}
                cursor={{ fill: '#2d2637', opacity: 0.2 }}
                labelClassName="text-slate-400 font-bold"
              />
              <Bar dataKey="calories" fill="#f5b21f" radius={[4, 4, 0, 0]}>
                {weekDays.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.calories > 0 ? 'url(#emeraldGradient)' : '#2d2637'}
                  />
                ))}
              </Bar>
              <defs>
                <linearGradient id="emeraldGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f5b21f" stopOpacity={1} />
                  <stop offset="100%" stopColor="#d9930f" stopOpacity={0.6} />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ENERGY AVERAGES SUMMARY PANEL */}
      <div className="glass-card rounded-2xl p-5 space-y-3.5 text-sm">
        <div className="flex items-center justify-between text-slate-300">
          <span>Suma kalorii w tygodniu</span>
          <span className="font-bold text-slate-100">{totalWeekCalories} kcal</span>
        </div>
        <hr className="border-slate-800" />
        <div className="flex items-center justify-between text-slate-300">
          <span>Średnia z wpisanych dni</span>
          <span className="font-bold text-emerald-400">{averageCalories} kcal</span>
        </div>
        <hr className="border-slate-800" />
        <div className="flex items-center justify-between text-slate-300">
          <span>Średnia w całym tygodniu (7 dni)</span>
          <span className="font-bold text-blue-400">{averageWeeklyCalories} kcal</span>
        </div>
      </div>

      {/* WEIGHT LOG */}
      <WeightLog />

      {/* BMI PANEL */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-200 flex items-center space-x-2">
          <Scale className="w-5 h-5 text-emerald-400" />
          <span>Wskaźnik BMI</span>
        </h3>

        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-black text-slate-100">{bmi.toFixed(1)}</span>
          <span className={`text-sm font-bold ${bmiCat.color}`}>({bmiCat.label})</span>
        </div>

        {/* Graphical Slider Bar */}
        <div className="relative pt-6 pb-2">
          {/* Moving Pointer Arrow */}
          <div
            className="absolute top-0 transform -translate-x-1/2 transition-all duration-300"
            style={{ left: `${pointerPercentage}%` }}
          >
            <div className={`w-3 h-3 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-slate-200`} />
          </div>

          {/* Color Scale Bar */}
          <div className="h-2 grid grid-cols-[17.5%_32.5%_25%_25%] rounded-full overflow-hidden border border-slate-950">
            <div className="bg-blue-500" title="Niedowaga (< 18.5)" />
            <div className="bg-emerald-500" title="Norma (18.5 - 25)" />
            <div className="bg-amber-500" title="Nadwaga (25 - 30)" />
            <div className="bg-red-500" title="Otyłość (> 30)" />
          </div>

          {/* X Axis Labels */}
          <div className="relative text-[9px] text-slate-500 font-bold h-4 mt-1">
            <span className="absolute left-0">15</span>
            <span className="absolute left-[17.5%] -translate-x-1/2">18.5</span>
            <span className="absolute left-[50%] -translate-x-1/2">25</span>
            <span className="absolute left-[75%] -translate-x-1/2">30</span>
            <span className="absolute right-0">35</span>
          </div>
        </div>

        <div className="flex items-start bg-slate-950/40 p-3 rounded-xl border border-slate-900 text-xxs text-slate-400 space-x-2">
          <Info className="w-4 h-4 text-emerald-400 flex-none" />
          <p className="leading-relaxed">
            BMI (Wskaźnik Masy Ciała) liczony jest z najnowszego pomiaru wagi i wzrostu z profilu. Zakres 18.5–25 jest uważany za prawidłowy.
          </p>
        </div>
      </div>
    </div>
  );
};
