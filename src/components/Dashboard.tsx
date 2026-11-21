import React, { useState } from 'react';
import { useCalorieTracker, toLocalYYYYMMDD, parseLocalDate } from '../hooks/useCalorieTracker';
import { fetchDietitianReport } from '../services/dietitian';
import { Sparkles, ChevronRight, ChevronLeft, Calendar } from 'lucide-react';

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
    mealsLoading,
    weight
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

  // ── Status kalorii ──────────────────────────────────────────────────────
  const isOver = totalEaten > tdee;
  const diff = Math.abs(tdee - totalEaten);
  let statusText: string;
  let centerTextColor: string;
  if (isStrictLimitMode) {
    statusText = isOver ? 'kcal ponad limit' : 'kcal zostało';
    centerTextColor = isOver ? 'text-red-400' : 'text-slate-50';
  } else {
    statusText = totalEaten >= tdee ? 'kcal nadwyżki' : 'kcal do celu';
    centerTextColor = totalEaten >= tdee ? 'text-emerald-400' : 'text-slate-50';
  }

  // ── Cele makro (orientacyjne, wyliczone z TDEE i masy ciała) ─────────────
  const proteinGoal = Math.round(weight * (isStrictLimitMode ? 2.0 : 1.8));
  const fatGoal = Math.round((tdee * 0.27) / 9);
  const carbsGoal = Math.max(0, Math.round((tdee - proteinGoal * 4 - fatGoal * 9) / 4));

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

  // Każdy posiłek ma własny kolor – ten sam w pierścieniu i na liście
  const mealItems = [
    { key: 'breakfast' as const, label: 'Śniadanie', emoji: '🥣', entry: meals.breakfast, stroke: 'stroke-emerald-300', swatch: 'bg-emerald-300' },
    { key: 'lunch' as const, label: 'Obiad', emoji: '🍲', entry: meals.lunch, stroke: 'stroke-emerald-500', swatch: 'bg-emerald-500' },
    { key: 'dinner' as const, label: 'Kolacja', emoji: '🥪', entry: meals.dinner, stroke: 'stroke-teal-500', swatch: 'bg-teal-500' },
    { key: 'snacks' as const, label: 'Przekąski', emoji: '🍎', entry: meals.snacks, stroke: 'stroke-amber-400', swatch: 'bg-amber-400' },
  ];

  // ── Pierścień „talerz”: segmenty posiłków na tle dziennego celu ───────────
  const RING_R = 84;
  const RING_C = 2 * Math.PI * RING_R;
  const SEG_GAP = 4;
  const scale = Math.max(tdee, totalEaten, 1);
  let cursor = 0;
  const segments = mealItems
    .filter(m => m.entry.calories > 0)
    .map(m => {
      const len = (m.entry.calories / scale) * RING_C;
      const seg = { key: m.key, stroke: m.stroke, offset: cursor, len: Math.max(0, len - SEG_GAP) };
      cursor += len;
      return seg;
    });

  const macros = [
    { label: 'Białko', value: totalProtein, goal: proteinGoal, bar: 'bg-sky-400', text: 'text-sky-300' },
    { label: 'Węglowodany', value: totalCarbs, goal: carbsGoal, bar: 'bg-amber-400', text: 'text-amber-300' },
    { label: 'Tłuszcze', value: totalFat, goal: fatGoal, bar: 'bg-purple-400', text: 'text-purple-300' },
  ];

  return (
    <div className="space-y-5 pb-20 animate-fade-in">
      {/* Date stepper */}
      <div className="flex items-center justify-between">
        <button
          onClick={handlePrevDay}
          className="w-10 h-10 grid place-items-center text-slate-400 hover:text-slate-100 hover:bg-slate-900 rounded-full transition-colors cursor-pointer active:scale-95"
          aria-label="Poprzedni dzień"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <label className="relative flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer">
          <Calendar className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-semibold text-slate-200">
            {selectedDate === todayStr ? 'Dzisiaj' : getFormattedDate(selectedDate)}
          </span>
          <input
            type="date"
            max={todayStr}
            value={selectedDate}
            onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            aria-label="Wybierz dzień"
          />
        </label>

        <button
          onClick={handleNextDay}
          disabled={selectedDate === todayStr}
          className="w-10 h-10 grid place-items-center text-slate-400 hover:text-slate-100 hover:bg-slate-900 rounded-full transition-colors cursor-pointer active:scale-95 disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          aria-label="Następny dzień"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Hero: talerz kalorii + makro */}
      <section className="glass-card rounded-[28px] p-5 pt-6">
        {mealsLoading ? (
          <div className="h-[300px] flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-[3px] border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-slate-500 font-medium">Ładowanie posiłków…</span>
          </div>
        ) : (
          <>
            <div className="relative w-56 h-56 mx-auto">
              <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90" aria-hidden="true">
                <circle
                  cx="100" cy="100" r={RING_R}
                  fill="none" strokeWidth="18"
                  className={isStrictLimitMode && isOver ? 'stroke-red-500/25' : 'stroke-slate-800'}
                />
                {segments.map(seg => (
                  <circle
                    key={seg.key}
                    cx="100" cy="100" r={RING_R}
                    fill="none" strokeWidth="18"
                    className={`arc-in ${seg.stroke}`}
                    strokeDasharray={`${seg.len} ${RING_C}`}
                    strokeDashoffset={-seg.offset}
                  />
                ))}
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className={`font-display text-[52px] leading-none font-extrabold tracking-tight ${centerTextColor}`}>
                  {diff}
                </span>
                <span className="text-slate-400 text-sm font-medium mt-1.5">{statusText}</span>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-2 text-center">
              <div>
                <dt className="text-xs text-slate-500">Zjedzone</dt>
                <dd className="font-display text-lg font-bold text-slate-100">{totalEaten} <span className="text-xs font-medium text-slate-500">kcal</span></dd>
              </div>
              <div className="border-l border-slate-800">
                <dt className="text-xs text-slate-500">{isStrictLimitMode ? 'Limit dzienny' : 'Cel dzienny'}</dt>
                <dd className="font-display text-lg font-bold text-slate-100">{tdee} <span className="text-xs font-medium text-slate-500">kcal</span></dd>
              </div>
            </dl>

            <div className="mt-5 pt-5 border-t border-slate-800 space-y-3.5">
              {macros.map(m => {
                const pct = m.goal > 0 ? Math.min(100, (m.value / m.goal) * 100) : 0;
                return (
                  <div key={m.label}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-slate-300 font-medium">{m.label}</span>
                      <span className="text-slate-500">
                        <span className={`font-bold ${m.text}`}>{Math.round(m.value)}</span> / {m.goal} g
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${m.bar} transition-[width] duration-500 ease-out`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <p className="text-[11px] text-slate-500 pt-0.5">
                Cele makro są orientacyjne – wyliczone z Twojego TDEE i masy ciała ({weight} kg).
              </p>
            </div>
          </>
        )}
      </section>

      {/* Meals */}
      <section className="space-y-2.5">
        <h2 className="text-lg font-bold text-slate-100 px-1">Posiłki</h2>
        <div className="glass-card rounded-3xl divide-y divide-slate-800 overflow-hidden">
          {mealItems.map(({ key, label, emoji, entry, swatch }) => (
            <button
              key={key}
              onClick={() => onNavigateToMeal(key)}
              className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left hover:bg-slate-800/50 active:bg-slate-800 transition-colors cursor-pointer"
            >
              <span className="relative w-11 h-11 shrink-0 grid place-items-center rounded-2xl bg-slate-800 text-xl">
                {emoji}
                <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 ${swatch} ${entry.calories > 0 ? '' : 'opacity-30'}`} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-slate-100">{label}</span>
                <span className="flex gap-2.5 text-xs text-slate-500 mt-0.5 truncate">
                  {entry.calories > 0 ? (
                    <>
                      <span>B {Math.round(entry.protein)} g</span>
                      <span>W {Math.round(entry.carbs)} g</span>
                      <span>T {Math.round(entry.fat)} g</span>
                    </>
                  ) : 'Dodaj pierwszy produkt'}
                </span>
              </span>
              <span className="font-display font-bold text-slate-200 tabular-nums">
                {entry.calories}
                <span className="text-xs font-medium text-slate-500 ml-1">kcal</span>
              </span>
              <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
            </button>
          ))}
        </div>
      </section>

      {/* AI Dietitian */}
      <section className="relative overflow-hidden rounded-3xl p-5 border border-purple-400/20 bg-gradient-to-br from-purple-500/[0.12] via-slate-900/80 to-slate-900/80">
        <div className="flex items-center gap-2 text-purple-300 mb-2">
          <Sparkles className="w-5 h-5" />
          <h2 className="text-base font-bold">Dietetyk AI</h2>
          {isLoadingAI && (
            <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin ml-1" />
          )}
        </div>

        <p className="text-slate-300 text-sm mb-4 leading-relaxed">
          {latestReport
            ? latestReport?.fullAnalysis?.statusSummary || 'Brak podsumowania'
            : 'Zapisz posiłki z dzisiaj, a Dietetyk AI oceni bilans dnia i podpowie, co zjeść jutro.'
          }
        </p>

        {aiError && (
          <p className="text-red-400 text-xs font-semibold mb-3">{aiError}</p>
        )}

        <button
          onClick={latestReport ? onOpenDietitianReport : handleGenerateReport}
          disabled={isLoadingAI}
          className="w-full flex items-center justify-between bg-purple-500 hover:bg-purple-400 text-white font-bold text-sm py-3 px-4 rounded-2xl active:scale-[0.99] transition-colors disabled:opacity-50 cursor-pointer"
        >
          <span>{latestReport ? 'Otwórz raport' : 'Generuj analizę dnia'}</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </section>
    </div>
  );
};
