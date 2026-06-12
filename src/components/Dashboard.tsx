import React, { useState } from 'react';
import { useCalorieTracker } from '../hooks/useCalorieTracker';
import { fetchDietitianReport } from '../services/dietitian';
import { Sparkles, ChevronRight, Activity, Calendar } from 'lucide-react';

interface DashboardProps {
  onNavigateToMeal: (category: 'breakfast' | 'lunch' | 'dinner' | 'snacks') => void;
  onOpenDietitianReport: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigateToMeal, onOpenDietitianReport }) => {
  const {
    tdee,
    isStrictLimitMode,
    meals,
    totalEaten,
    totalProtein,
    totalCarbs,
    totalFat,
    latestReport,
    setLatestReport,
    apiKey
  } = useCalorieTracker();

  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // SVG Progress Ring calculations
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const progressRatio = Math.min(1, totalEaten / tdee);
  const strokeDashoffset = circumference - progressRatio * circumference;

  // Decide colors based on mode and intake
  let ringColor = 'stroke-emerald-500';
  let centerTextColor = 'text-slate-100';
  let statusText = 'kcal pozostało';

  if (isStrictLimitMode) {
    if (totalEaten > tdee) {
      ringColor = 'stroke-red-500';
      centerTextColor = 'text-red-400';
      statusText = 'kcal przekroczono';
    } else {
      ringColor = 'stroke-emerald-500';
      centerTextColor = 'text-emerald-400';
      statusText = 'kcal pozostało';
    }
  } else {
    // Bulking mode
    if (totalEaten >= tdee) {
      ringColor = 'stroke-emerald-500';
      centerTextColor = 'text-emerald-400';
      statusText = 'kcal nadwyżki';
    } else {
      ringColor = 'stroke-amber-500';
      centerTextColor = 'text-amber-400';
      statusText = 'kcal do celu';
    }
  }

  const handleGenerateReport = async () => {
    if (isLoadingAI) return;
    setIsLoadingAI(true);
    setAiError(null);
    try {
      const report = await fetchDietitianReport({
        apiKey,
        totalCalories: totalEaten,
        totalProtein,
        totalCarbs,
        totalFat,
        tdee,
        isStrictLimitMode
      });
      setLatestReport(report);
      onOpenDietitianReport();
    } catch (err: any) {
      setAiError(err.message || 'Wystąpił błąd podczas generowania raportu.');
    } finally {
      setIsLoadingAI(false);
    }
  };

  const getFormattedDate = () => {
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    const dateStr = new Date().toLocaleDateString('pl-PL', options);
    // Capitalize first letter
    return dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
  };

  const mealItems = [
    { key: 'breakfast' as const, label: '🥣 Śniadanie', entry: meals.breakfast },
    { key: 'lunch' as const, label: '🥩 Obiad', entry: meals.lunch },
    { key: 'dinner' as const, label: '🥪 Kolacja', entry: meals.dinner },
    { key: 'snacks' as const, label: '🍎 Przekąski', entry: meals.snacks },
  ];

  return (
    <div className="space-y-6 pb-20 animate-fade-in">
      {/* Date Header */}
      <div className="flex items-center space-x-2 text-slate-400">
        <Calendar className="w-4 h-4 text-emerald-400" />
        <span className="text-sm font-medium">{getFormattedDate()}</span>
      </div>

      {/* Calories Radial Summary Card */}
      <div className="glass-card rounded-3xl p-6 flex flex-col items-center relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-5">
          <Activity className="w-24 h-24 text-slate-100" />
        </div>

        <div className="relative w-44 h-44 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90">
            {/* Background Ring */}
            <circle
              cx="88"
              cy="88"
              r={radius}
              className="stroke-slate-800"
              strokeWidth="12"
              fill="transparent"
            />
            {/* Foreground Ring */}
            <circle
              cx="88"
              cy="88"
              r={radius}
              className={`transition-all duration-500 ease-out ${ringColor}`}
              strokeWidth="12"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
            />
          </svg>

          {/* Center Text */}
          <div className="absolute flex flex-col items-center text-center">
            <span className={`text-4xl font-extrabold tracking-tight ${centerTextColor}`}>
              {isStrictLimitMode
                ? (totalEaten > tdee ? totalEaten - tdee : tdee - totalEaten)
                : (totalEaten >= tdee ? totalEaten - tdee : tdee - totalEaten)
              }
            </span>
            <span className="text-slate-400 text-xs font-semibold mt-0.5">{statusText}</span>
          </div>
        </div>

        {/* Info label about total eaten / target */}
        <div className="mt-4 flex space-x-4 text-sm font-semibold text-slate-400">
          <div>Zjedzone: <span className="text-slate-200">{totalEaten} kcal</span></div>
          <div className="text-slate-700">|</div>
          <div>Cel TDEE: <span className="text-slate-200">{tdee} kcal</span></div>
        </div>
      </div>

      {/* Macro Indicators */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-card rounded-2xl p-4 text-center">
          <span className="block text-xs font-medium text-slate-400">Białko</span>
          <span className="block text-lg font-bold text-blue-400 mt-1">{totalProtein.toFixed(1)}g</span>
        </div>
        <div className="glass-card rounded-2xl p-4 text-center">
          <span className="block text-xs font-medium text-slate-400">Węgle</span>
          <span className="block text-lg font-bold text-amber-500 mt-1">{totalCarbs.toFixed(1)}g</span>
        </div>
        <div className="glass-card rounded-2xl p-4 text-center">
          <span className="block text-xs font-medium text-slate-400">Tłuszcze</span>
          <span className="block text-lg font-bold text-purple-400 mt-1">{totalFat.toFixed(1)}g</span>
        </div>
      </div>

      {/* AI Dietitian Card */}
      <div className="relative overflow-hidden glass-card rounded-2xl p-5 border border-purple-500/20 shadow-purple-500/5">
        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-purple-500/10 to-indigo-500/10 rounded-bl-full pointer-events-none" />
        
        <div className="flex items-center space-x-2 text-purple-400 font-bold mb-2">
          <Sparkles className="w-5 h-5" />
          <h3 className="text-sm uppercase tracking-wider">Dietetyk AI</h3>
          {isLoadingAI && (
            <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin ml-2" />
          )}
        </div>

        <p className="text-slate-300 text-sm mb-4 leading-relaxed min-h-[40px]">
          {latestReport
            ? latestReport.fullAnalysis.statusSummary
            : 'Zaloguj posiłki, aby otrzymać spersonalizowaną wieczorną analizę i wskazówki od Twojego Dietetyka AI.'
          }
        </p>

        {aiError && (
          <p className="text-red-400 text-xs font-semibold mb-3">{aiError}</p>
        )}

        <button
          onClick={latestReport ? onOpenDietitianReport : handleGenerateReport}
          disabled={isLoadingAI}
          className="w-full flex items-center justify-between bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm py-3 px-4 rounded-xl active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer"
        >
          <span>{latestReport ? 'Otwórz wieczorny raport' : 'Generuj analizę'}</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Meals Navigation List */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">Posiłki</h3>
        <div className="space-y-2.5">
          {mealItems.map(({ key, label, entry }) => (
            <div
              key={key}
              onClick={() => onNavigateToMeal(key)}
              className="glass-card-interactive rounded-2xl p-4 flex items-center justify-between"
            >
              <div>
                <h4 className="font-bold text-slate-200">{label}</h4>
                <p className="text-xs text-slate-400 mt-1">
                  B: {Math.round(entry.protein)}g  |  W: {Math.round(entry.carbs)}g  |  T: {Math.round(entry.fat)}g
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <span className="font-semibold text-slate-300">{entry.calories} kcal</span>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
