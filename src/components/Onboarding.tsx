import React, { useState } from 'react';
import { useCalorieTracker } from '../hooks/useCalorieTracker';
import { FirebaseError } from 'firebase/app';
import { AlertTriangle } from 'lucide-react';

export const Onboarding: React.FC = () => {
  const { saveOnboarding } = useCalorieTracker();
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<'Mężczyzna' | 'Kobieta'>('Mężczyzna');
  const [activityLevel, setActivityLevel] = useState(1.2);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const w = parseFloat(weight);
    const h = parseFloat(height);
    const a = parseInt(age);

    if (isNaN(w) || isNaN(h) || isNaN(a) || w <= 0 || h <= 0 || a <= 0) {
      alert('Proszę podać prawidłowe dane biometryczne.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    // Mifflin-St Jeor Equation
    const s = gender === 'Mężczyzna' ? 5 : -161;
    const bmr = 10 * w + 6.25 * h - 5 * a + s;
    const tdee = Math.round(bmr * activityLevel);

    try {
      await saveOnboarding(w, h, a, gender, activityLevel, tdee);
    } catch (err: any) {
      console.error('Błąd zapisu profilu:', err);
      let msg = 'Nie udało się zapisać danych. Upewnij się, że baza danych Cloud Firestore ma włączone poprawne reguły odczytu/zapisu (Security Rules).';
      if (err instanceof FirebaseError) {
        msg = `Błąd Firebase: ${err.message} (${err.code})`;
      } else if (err?.message) {
        msg = err.message;
      }
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const isFormValid = weight && height && age && !isLoading;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950">
      <div className="w-full max-w-md glass-card rounded-2xl p-6 sm:p-8 animate-fade-in">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 mb-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Witaj w CalorieCounter</h1>
          <p className="text-slate-400 text-sm mt-1">Podaj swoje parametry, aby obliczyć zapotrzebowanie kaloryczne (TDEE).</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Waga (kg)</label>
            <input
              type="number"
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="np. 80"
              required
              disabled={isLoading}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-1.5 text-slate-100 placeholder-slate-600 placeholder:text-sm focus:outline-none focus:border-emerald-500 transition-colors text-base"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Wzrost (cm)</label>
            <input
              type="number"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="np. 180"
              required
              disabled={isLoading}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-1.5 text-slate-100 placeholder-slate-600 placeholder:text-sm focus:outline-none focus:border-emerald-500 transition-colors text-base"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Wiek (lata)</label>
            <input
              type="number"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="np. 25"
              required
              disabled={isLoading}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-1.5 text-slate-100 placeholder-slate-600 placeholder:text-sm focus:outline-none focus:border-emerald-500 transition-colors text-base"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Płeć</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => setGender('Mężczyzna')}
                className={`py-3 rounded-xl border text-sm font-medium transition-all ${
                  gender === 'Mężczyzna'
                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                Mężczyzna
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={() => setGender('Kobieta')}
                className={`py-3 rounded-xl border text-sm font-medium transition-all ${
                  gender === 'Kobieta'
                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                Kobieta
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Poziom Aktywności</label>
            <select
              value={activityLevel}
              disabled={isLoading}
              onChange={(e) => setActivityLevel(parseFloat(e.target.value))}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-1.5 text-slate-100 focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer text-base"
            >
              <option value={1.2}>Brak ruchu (biurko, brak treningów)</option>
              <option value={1.375}>Niska aktywność (lekki ruch, 1-3 treningi/tydz)</option>
              <option value={1.55}>Średnia aktywność (umiarkowany ruch, 3-5 treningów/tydz)</option>
              <option value={1.725}>Wysoka aktywność (ciężka praca fizyczna lub codzienne treningi)</option>
            </select>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="flex items-start bg-red-500/10 border border-red-500/20 p-3.5 rounded-xl text-xxs text-red-400 space-x-2 animate-fade-in">
              <AlertTriangle className="w-4 h-4 flex-none" />
              <span className="leading-relaxed font-semibold">{errorMessage}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!isFormValid}
            className={`w-full py-4 rounded-xl text-center font-semibold text-white shadow-lg shadow-emerald-500/10 transition-all flex items-center justify-center space-x-2 ${
              isFormValid
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 active:scale-[0.99] cursor-pointer'
                : 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed'
            }`}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Zapisywanie danych...</span>
              </>
            ) : (
              <span>Zapisz i przejdź dalej</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
