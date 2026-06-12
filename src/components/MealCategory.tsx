import React from 'react';
import { useCalorieTracker } from '../hooks/useCalorieTracker';
import { ChevronLeft, Search, Sparkles, Trash2 } from 'lucide-react';

interface MealCategoryProps {
  category: 'breakfast' | 'lunch' | 'dinner' | 'snacks';
  onBack: () => void;
  onNavigateToSearch: () => void;
  onOpenAISheet: () => void;
}

export const MealCategory: React.FC<MealCategoryProps> = ({
  category,
  onBack,
  onNavigateToSearch,
  onOpenAISheet,
}) => {
  const { meals, clearMeal, deleteMealItem, updateMealManual } = useCalorieTracker();
  const meal = meals[category];

  const categoryNameMap: Record<typeof category, string> = {
    breakfast: 'Śniadanie',
    lunch: 'Obiad',
    dinner: 'Kolacja',
    snacks: 'Przekąski',
  };

  return (
    <div className="space-y-6 pb-20 animate-fade-in">
      {/* Header Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center space-x-1 text-slate-400 hover:text-slate-200 transition-colors p-1 cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Wróć</span>
        </button>
        <h2 className="text-xl font-bold text-slate-100">{categoryNameMap[category]}</h2>
        <div className="w-12" />
      </div>

      {/* Manual Macros Inputs Card */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-0.5">
          Wpisz wartości odżywcze
        </h3>

        <div className="space-y-3">
          {(
            [
              { field: 'calories' as const, label: 'Kalorie', unit: 'kcal', step: '1' },
              { field: 'protein' as const, label: 'Białko', unit: 'g', step: '0.1' },
              { field: 'carbs' as const, label: 'Węglowodany', unit: 'g', step: '0.1' },
              { field: 'fat' as const, label: 'Tłuszcze', unit: 'g', step: '0.1' },
            ] as const
          ).map(({ field, label, unit, step }) => (
            <div
              key={field}
              className="flex items-center justify-between bg-slate-950/40 px-4 py-3 rounded-xl border border-slate-900"
            >
              <span className="text-sm text-slate-300 font-medium">{label}</span>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  step={step}
                  value={meal[field] || ''}
                  onChange={(e) =>
                    updateMealManual(
                      category,
                      field,
                      field === 'calories'
                        ? parseInt(e.target.value) || 0
                        : parseFloat(e.target.value) || 0,
                    )
                  }
                  placeholder={field === 'calories' ? '0' : '0.0'}
                  className="w-20 bg-transparent text-right text-slate-200 font-bold focus:outline-none placeholder-slate-700"
                />
                <span className="text-xs text-slate-500 font-semibold">{unit}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Helper Module Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onNavigateToSearch}
          className="flex flex-col items-center justify-center bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 font-semibold p-4 rounded-2xl transition-all cursor-pointer space-y-2 active:scale-[0.98]"
        >
          <Search className="w-5 h-5" />
          <span className="text-xs">Baza produktów</span>
        </button>

        <button
          onClick={onOpenAISheet}
          className="flex flex-col items-center justify-center bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 text-purple-400 font-semibold p-4 rounded-2xl transition-all cursor-pointer space-y-2 active:scale-[0.98]"
        >
          <Sparkles className="w-5 h-5" />
          <span className="text-xs">Asystent AI</span>
        </button>
      </div>

      {/* Added Products Section */}
      {meal.items.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">
            Dodane produkty i potrawy
          </h3>
          <div className="space-y-2.5">
            {meal.items.map((item) => (
              <div
                key={item.id}
                className="glass-card rounded-2xl p-4 flex items-center justify-between"
              >
                <div>
                  <h4 className="font-bold text-slate-200 text-sm">{item.name}</h4>
                  <p className="text-xxs text-slate-500 mt-0.5">
                    {Math.round(item.weight)}g | B: {item.protein.toFixed(1)}g | W:{' '}
                    {item.carbs.toFixed(1)}g | T: {item.fat.toFixed(1)}g
                  </p>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="font-bold text-slate-400 text-sm">{item.calories} kcal</span>
                  <button
                    onClick={() => deleteMealItem(category, item.id)}
                    className="p-1 hover:text-red-400 text-slate-500 active:scale-[0.95] cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clear Button */}
      {meal.calories > 0 && (
        <button
          onClick={() => {
            if (confirm('Czy na pewno chcesz wyczyścić ten posiłek?')) {
              clearMeal(category);
            }
          }}
          className="w-full py-4 text-center font-bold text-red-500 hover:text-red-400 border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 rounded-2xl transition-all active:scale-[0.99] cursor-pointer"
        >
          Wyczyść ten posiłek
        </button>
      )}
    </div>
  );
};
