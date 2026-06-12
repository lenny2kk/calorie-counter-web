import React, { useState } from 'react';
import { useCalorieTracker } from '../hooks/useCalorieTracker';
import { fetchAIMealAnalysis } from '../services/dietitian';
import { Sparkles, X, AlertTriangle } from 'lucide-react';
import type { MealItem } from '../types';


interface AISmartMealModalProps {
  isOpen: boolean;
  category: 'breakfast' | 'lunch' | 'dinner' | 'snacks';
  onClose: () => void;
}

export const AISmartMealModal: React.FC<AISmartMealModalProps> = ({ isOpen, category, onClose }) => {
  const { apiKey, updateMealItem } = useCalorieTracker();

  const [aiInputText, setAiInputText] = useState('');
  const [weightString, setWeightString] = useState('100');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInputText.trim()) return;

    const weight = parseFloat(weightString);
    if (isNaN(weight) || weight <= 0) {
      setErrorMessage('Waga musi być liczbą większą niż 0.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const result = await fetchAIMealAnalysis({
        apiKey,
        inputText: aiInputText
      });

      const calculatedKcal = Math.round((result.kcalPer100g / 100.0) * weight);
      const calculatedProtein = (result.proteinPer100g / 100.0) * weight;
      const calculatedCarbs = (result.carbsPer100g / 100.0) * weight;
      const calculatedFat = (result.fatPer100g / 100.0) * weight;

      const cleanName = aiInputText.trim() || 'Potrawa AI';

      const newItem: MealItem = {
        id: crypto.randomUUID(),
        name: cleanName.length > 30 ? cleanName.substring(0, 30) + '...' : cleanName,
        calories: calculatedKcal,
        protein: calculatedProtein,
        carbs: calculatedCarbs,
        fat: calculatedFat,
        weight: weight
      };

      // Add item to active meal category
      updateMealItem(category, newItem);

      // Reset states
      setAiInputText('');
      setWeightString('100');
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Błąd analizy posiłku.');
    } finally {
      setIsLoading(false);
    }
  };

  const isValid = aiInputText.trim() && parseFloat(weightString) > 0 && !isLoading;

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm z-50 animate-fade-in">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 relative shadow-2xl">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 p-2 text-slate-500 hover:text-slate-300 rounded-full hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-30"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-purple-500/10 text-purple-400 mb-3">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-100">Asystent Dietetyczny AI</h2>
          <p className="text-slate-500 text-xxs mt-0.5">Opisz co zjadłeś, a Gemini oszacuje kalorie i makroskładniki.</p>
        </div>

        <form onSubmit={handleAnalyze} className="space-y-4">
          {/* Textarea Description */}
          <div>
            <label className="block text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-2">Opisz swój posiłek</label>
            <textarea
              value={aiInputText}
              onChange={(e) => setAiInputText(e.target.value)}
              disabled={isLoading}
              placeholder="np. Kotlet schabowy panierowany, ziemniaki z koperkiem i mizeria śmietankowa..."
              rows={3}
              className="w-full bg-slate-950 border border-slate-905/70 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-700 focus:outline-none focus:border-purple-500 transition-colors text-sm resize-none"
            />
          </div>

          {/* Weight */}
          <div className="flex items-center justify-between bg-slate-950 px-4 py-3 rounded-xl border border-slate-905">
            <span className="text-xs text-slate-300 font-semibold uppercase tracking-wider">Gramatura (Waga porcji)</span>
            <div className="flex items-center space-x-1.5">
              <input
                type="number"
                value={weightString}
                onChange={(e) => setWeightString(e.target.value)}
                disabled={isLoading}
                placeholder="100"
                className="w-16 bg-transparent text-right text-slate-200 font-bold focus:outline-none placeholder-slate-750"
              />
              <span className="text-xs text-slate-500 font-semibold">g</span>
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="flex items-start bg-red-500/10 border border-red-500/20 p-3 rounded-xl text-xxs text-red-400 space-x-2">
              <AlertTriangle className="w-4 h-4 flex-none" />
              <span className="leading-relaxed font-medium">{errorMessage}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!isValid}
            className={`w-full py-3.5 rounded-xl font-bold text-white shadow-lg transition-all flex items-center justify-center space-x-2 ${
              isValid
                ? 'bg-purple-600 hover:bg-purple-500 active:scale-[0.99] shadow-purple-500/10 cursor-pointer'
                : 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed'
            }`}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Gemini przelicza potrawę...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Zatwierdź i dolicz do licznika</span>
              </>
            )}
          </button>
        </form>

      </div>
    </div>
  );
};
