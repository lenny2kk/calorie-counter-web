import React, { useState } from 'react';
import { useCalorieTracker } from '../hooks/useCalorieTracker';
import { fetchDietitianReport } from '../services/dietitian';
import { Sparkles, Flame, RefreshCw, X, Award } from 'lucide-react';

interface DietitianReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DietitianReportModal: React.FC<DietitianReportModalProps> = ({ isOpen, onClose }) => {
  const {
    latestReport,
    setLatestReport,
    totalEaten,
    totalProtein,
    totalCarbs,
    totalFat,
    tdee,
    isStrictLimitMode,
    apiKey
  } = useCalorieTracker();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRefresh = async () => {
    setIsLoading(true);
    setError(null);
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
    } catch (err: any) {
      setError(err.message || 'Błąd odświeżania raportu.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm z-50 animate-fade-in overflow-y-auto">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 relative shadow-2xl max-h-[90vh] overflow-y-auto">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-500 hover:text-slate-300 rounded-full hover:bg-slate-800 transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center mb-6 pt-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-500/10 text-purple-400 mb-3 relative">
            <Sparkles className="w-8 h-8" />
            <div className="absolute inset-0 rounded-full border border-purple-500/20 animate-ping opacity-25" />
          </div>
          <h2 className="text-xl font-black text-slate-100">Raport Dietetyka AI</h2>
          <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Stan na godzinę 18:00</span>
        </div>

        {/* Loading Indicator overlay */}
        {isLoading && (
          <div className="py-12 text-center space-y-4">
            <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-slate-400 text-sm">Przeliczam bilans dnia przez AI...</p>
          </div>
        )}

        {/* Main report body */}
        {!isLoading && latestReport && (
          <div className="space-y-5">
            {/* Status Summary */}
            <div className="bg-slate-950/40 border border-slate-950 p-4 rounded-2xl">
              <span className="block text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-1">Podsumowanie dnia</span>
              <p className="text-sm font-semibold text-slate-200 leading-relaxed">{latestReport.fullAnalysis.statusSummary}</p>
            </div>

            {/* Calorie Critique */}
            <div className="bg-slate-950/40 border border-slate-950 p-4 rounded-2xl flex items-start space-x-3">
              <div className="p-2 bg-red-500/10 text-red-400 rounded-xl mt-0.5">
                <Flame className="w-5 h-5 fill-red-500/10" />
              </div>
              <div>
                <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Bilans energetyczny</span>
                <p className="text-sm font-semibold text-slate-200 leading-normal">{latestReport.fullAnalysis.caloriesRemaining}</p>
              </div>
            </div>

            {/* Macros Critique */}
            <div className="bg-slate-950/40 border border-slate-950 rounded-2xl p-4 space-y-4">
              <span className="block text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-2">Analiza makroskładników</span>
              
              {/* Protein Row */}
              <div className="flex items-start space-x-3 text-xs">
                <div className="w-6 h-6 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-bold flex-none mt-0.5">B</div>
                <div className="space-y-0.5">
                  <span className="font-bold text-blue-400">Białko</span>
                  <p className="text-slate-400 leading-relaxed">{latestReport.fullAnalysis.macroCritique.protein}</p>
                </div>
              </div>

              <hr className="border-slate-800" />

              {/* Carbs Row */}
              <div className="flex items-start space-x-3 text-xs">
                <div className="w-6 h-6 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-bold flex-none mt-0.5">W</div>
                <div className="space-y-0.5">
                  <span className="font-bold text-amber-400">Węglowodany</span>
                  <p className="text-slate-400 leading-relaxed">{latestReport.fullAnalysis.macroCritique.carbs}</p>
                </div>
              </div>

              <hr className="border-slate-800" />

              {/* Fats Row */}
              <div className="flex items-start space-x-3 text-xs">
                <div className="w-6 h-6 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center font-bold flex-none mt-0.5">T</div>
                <div className="space-y-0.5">
                  <span className="font-bold text-purple-400">Tłuszcze</span>
                  <p className="text-slate-400 leading-relaxed">{latestReport.fullAnalysis.macroCritique.fat}</p>
                </div>
              </div>
            </div>

            {/* Advice Box */}
            <div className="bg-gradient-to-r from-purple-900/10 to-indigo-900/10 border border-purple-500/20 p-4 rounded-2xl space-y-1">
              <div className="flex items-center space-x-1.5 text-amber-400 font-bold text-xs">
                <Award className="w-4 h-4" />
                <span>Wskazówka na wieczór</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{latestReport.fullAnalysis.actionableAdvice}</p>
            </div>
          </div>
        )}

        {error && (
          <p className="text-red-400 text-xs font-semibold text-center mt-4">{error}</p>
        )}

        {/* Actions */}
        {!isLoading && (
          <div className="mt-6 pt-4 border-t border-slate-800/60 flex space-x-3">
            <button
              onClick={handleRefresh}
              className="flex-1 py-3 px-4 bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 rounded-2xl text-xs font-bold transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center space-x-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Odśwież raport</span>
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-2xl text-xs font-bold transition-all active:scale-[0.98] cursor-pointer"
            >
              Gotowe
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
