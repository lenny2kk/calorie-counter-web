import React, { useState } from 'react';
import { useCalorieTracker, toLocalYYYYMMDD, parseLocalDate } from '../hooks/useCalorieTracker';
import { fetchDietitianReport } from '../services/dietitian';
import { Sparkles, ChevronRight, ChevronLeft, Activity, Calendar } from 'lucide-react';

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
    apiKey,
    selectedDate,
    setSelectedDate,
    mealsLoading
  } = useCalorieTracker();

  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const todayStr = toLocalYYYYMMDD(new Date());

  // Day step handlers
  const handlePrevDay = () => {
    const current = parseLocalDate(selectedDate);
    current.setDate(current.getDate() - 1);
    setSelectedDate(toLocalYYYYMMDD(current));
  };

  const handleNextDay = () => {
    if (selectedDate === todayStr) return;
    const current = parseLocalDate(selectedDate);
    current.setDate(current.getDate() + 1);
    setSelectedDate(toLocalYYYYMMDD(current));
  };

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

  const getFormattedDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    const dateObj = parseLocalDate(dateString);
    const dateStr = dateObj.toLocaleDateString('pl-PL', options);
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
      {/* Dynamic Date Selector Stepper */}
      <div className="flex items-center justify-between bg-slate-900/40 border border-slate-900/80 p-2 rounded-2xl">
        <button
          onClick={handlePrevDay}
          className="p-2 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-xl transition-all cursor-pointer active:scale-95"
          title="Poprzedni dzień"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-2 relative hover:bg-slate-805/50 px-3 py-1.5 rounded-xl transition-all cursor-pointer">
          <Calendar className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-bold text-slate-300 tracking-wide">
            {selectedDate === todayStr ? 'Dzisiaj' : getFormattedDate(selectedDate)}
          </span>
          <input
            type="date"
            max={todayStr}
            value={selectedDate}
            onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full text-base"
          />
        </div>

        <button
          onClick={handleNextDay}
          disabled={selectedDate === todayStr}
          className="p-2 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-xl transition-all cursor-pointer active:scale-95 disabled:opacity-20 disabled:cursor-not-allowed"
          title="Następny dzień"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Calories Radial Summary Card */}
      <div className="glass-card rounded-3xl p-6 flex flex-col items-center relative overflow-hidden min-h-[260px] justify-center">
        <div className="absolute top-0 right-0 p-4 opacity-5">
          <Activity className="w-24 h-24 text-slate-100" />
        </div>

        {mealsLoading ? (
          <div className="w-44 h-44 flex flex-col items-center justify-center space-y-3">
            <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Ładowanie posiłków...</span>
          </div>
        ) : (
          <>
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
          </>
        )}
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
            ? latestReport?.fullAnalysis?.statusSummary || 'Brak podsumowania'
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
