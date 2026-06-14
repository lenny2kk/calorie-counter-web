import React, { useState, useEffect } from 'react';
import { useCalorieTracker } from '../hooks/useCalorieTracker';
import { Settings as SettingsIcon, Bell, Shield, Key, Database, RefreshCw, Trash2, LogOut } from 'lucide-react';

export const Settings: React.FC = () => {
  const {
    tdee,
    isStrictLimitMode,
    weight,
    height,
    age,
    gender,
    activityLevel,
    apiKey,
    reminders,
    updateProfile,
    setStrictLimitMode,
    addReminder,
    deleteReminder,
    setApiKey,
    loadDemoData,
    user,
    logout
  } = useCalorieTracker();

  // Biometrics editing states
  const [tempWeight, setTempWeight] = useState(String(weight));
  const [tempHeight, setTempHeight] = useState(String(height));
  const [tempAge, setTempAge] = useState(String(age));
  const [tempGender, setTempGender] = useState<'Mężczyzna' | 'Kobieta'>(gender);
  const [tempActivityLevel, setTempActivityLevel] = useState(activityLevel);
  const [tempTdee, setTempTdee] = useState(String(tdee));

  // Gemini API key state
  const [tempApiKey, setTempApiKey] = useState(apiKey);
  const [keySaved, setKeySaved] = useState(false);

  // Reminders states
  const [reminderHour, setReminderHour] = useState('08');
  const [reminderMinute, setReminderMinute] = useState('00');
  const [notificationsAuthorized, setNotificationsAuthorized] = useState(false);

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationsAuthorized(Notification.permission === 'granted');
    }
  }, []);

  const requestNotificationPermission = () => {
    if (!('Notification' in window)) {
      alert('Powiadomienia nie są obsługiwane przez Twoją przeglądarkę.');
      return;
    }
    Notification.requestPermission().then((permission) => {
      setNotificationsAuthorized(permission === 'granted');
      if (permission === 'granted') {
        new Notification('CalorieCounter', {
          body: 'Powiadomienia zostały włączone!',
        });
      }
    });
  };

  const handleAddReminderClick = () => {
    const h = parseInt(reminderHour);
    const m = parseInt(reminderMinute);
    if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
      alert('Podaj prawidłową godzinę.');
      return;
    }
    addReminder(h, m);
  };

  // Recalculates TDEE using Mifflin-St Jeor Formula
  const computeTdeeValue = (w: number, h: number, a: number, g: 'Mężczyzna' | 'Kobieta', al: number) => {
    const s = g === 'Mężczyzna' ? 5 : -161;
    const bmr = 10 * w + 6.25 * h - 5 * a + s;
    return Math.round(bmr * al);
  };

  const handleSaveBiometrics = () => {
    const w = parseFloat(tempWeight);
    const h = parseFloat(tempHeight);
    const a = parseInt(tempAge);
    const al = parseFloat(String(tempActivityLevel));

    if (isNaN(w) || isNaN(h) || isNaN(a) || w <= 0 || h <= 0 || a <= 0) {
      alert('Wprowadź prawidłowe dane biometryczne.');
      return;
    }

    const calculatedTdee = computeTdeeValue(w, h, a, tempGender, al);

    updateProfile({
      weight: w,
      height: h,
      age: a,
      gender: tempGender,
      activityLevel: al,
      tdee: calculatedTdee,
    });

    setTempTdee(String(calculatedTdee));
    alert('Profil biometryczny został zaktualizowany! Nowe TDEE zostało obliczone automatycznie.');
  };

  const handleManualTdeeChange = (valueStr: string) => {
    setTempTdee(valueStr);
    const val = parseFloat(valueStr);
    if (!isNaN(val) && val > 0) {
      updateProfile({ tdee: val });
    }
  };

  const handleSaveApiKey = () => {
    setApiKey(tempApiKey.trim());
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  };

  const hasBiometricsChanged =
    tempWeight !== String(weight) ||
    tempHeight !== String(height) ||
    tempAge !== String(age) ||
    tempGender !== gender ||
    tempActivityLevel !== activityLevel;

  return (
    <div className="space-y-6 pb-20 animate-fade-in">
      {/* SECTION: BIOMETRICS PROFILE */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-200 flex items-center space-x-2">
          <SettingsIcon className="w-5 h-5 text-emerald-400" />
          <span>Profil biometryczny (TDEE)</span>
        </h3>

        <div className="space-y-3">
          {/* Target calories input */}
          <div className="flex items-center justify-between bg-slate-950/40 px-4 py-3 rounded-xl border border-slate-900">
            <span className="text-sm text-slate-300 font-medium">Cel kaloryczny (TDEE)</span>
            <div className="flex items-center space-x-2">
              <input
                type="number"
                value={tempTdee}
                onChange={(e) => handleManualTdeeChange(e.target.value)}
                className="w-20 bg-transparent text-right text-slate-200 font-bold focus:outline-none text-base"
              />
              <span className="text-xs text-slate-500 font-semibold">kcal</span>
            </div>
          </div>

          <div className="flex items-center justify-between bg-slate-950/40 px-4 py-3 rounded-xl border border-slate-900">
            <span className="text-sm text-slate-300 font-medium">Płeć</span>
            <select
              value={tempGender}
              onChange={(e) => setTempGender(e.target.value as any)}
              className="bg-transparent text-right text-slate-200 font-bold focus:outline-none cursor-pointer text-base"
            >
              <option value="Mężczyzna">Mężczyzna</option>
              <option value="Kobieta">Kobieta</option>
            </select>
          </div>

          <div className="flex items-center justify-between bg-slate-950/40 px-4 py-3 rounded-xl border border-slate-900">
            <span className="text-sm text-slate-300 font-medium">Aktywność</span>
            <select
              value={tempActivityLevel}
              onChange={(e) => setTempActivityLevel(parseFloat(e.target.value))}
              className="bg-transparent text-right text-slate-200 font-bold focus:outline-none cursor-pointer max-w-[150px] truncate text-base"
            >
              <option value={1.2}>Brak ruchu</option>
              <option value={1.375}>Niska</option>
              <option value={1.55}>Średnia</option>
              <option value={1.725}>Wysoka</option>
            </select>
          </div>

          <div className="flex items-center justify-between bg-slate-950/40 px-4 py-3 rounded-xl border border-slate-900">
            <span className="text-sm text-slate-300 font-medium">Waga (kg)</span>
            <input
              type="number"
              step="0.1"
              value={tempWeight}
              onChange={(e) => setTempWeight(e.target.value)}
              className="w-16 bg-transparent text-right text-slate-200 font-bold focus:outline-none text-base"
            />
          </div>

          <div className="flex items-center justify-between bg-slate-950/40 px-4 py-3 rounded-xl border border-slate-900">
            <span className="text-sm text-slate-300 font-medium">Wzrost (cm)</span>
            <input
              type="number"
              value={tempHeight}
              onChange={(e) => setTempHeight(e.target.value)}
              className="w-16 bg-transparent text-right text-slate-200 font-bold focus:outline-none text-base"
            />
          </div>

          <div className="flex items-center justify-between bg-slate-950/40 px-4 py-3 rounded-xl border border-slate-900">
            <span className="text-sm text-slate-300 font-medium">Wiek (lat)</span>
            <input
              type="number"
              value={tempAge}
              onChange={(e) => setTempAge(e.target.value)}
              className="w-16 bg-transparent text-right text-slate-200 font-bold focus:outline-none text-base"
            />
          </div>
        </div>

        {hasBiometricsChanged && (
          <button
            onClick={handleSaveBiometrics}
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl text-sm transition-all active:scale-[0.98] cursor-pointer"
          >
            Oblicz i zatwierdź zmiany
          </button>
        )}
      </div>

      {/* SECTION: CONTROL POLICIES DEFICIT / SURPLUS */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-200 flex items-center space-x-2">
          <Shield className="w-5 h-5 text-emerald-400" />
          <span>Tryb kontroli kalorii</span>
        </h3>

        <div className="flex items-center justify-between">
          <div className="max-w-[75%] space-y-1">
            <span className="block text-sm font-semibold text-slate-200">
              {isStrictLimitMode ? 'Tryb: Pilnuję limitu (Redukcja)' : 'Tryb: Buduję masę (Nadwyżka)'}
            </span>
            <span className="block text-[11px] text-slate-500 leading-normal">
              {isStrictLimitMode
                ? 'Aplikacja ostrzega na czerwono po przekroczeniu celu kalorycznego.'
                : 'Powiadomienia i dashboard informują, ile jeszcze musisz zjeść do celu.'}
            </span>
          </div>
          <button
            onClick={() => setStrictLimitMode(!isStrictLimitMode)}
            className={`w-11 h-6 rounded-full transition-colors relative flex items-center p-0.5 cursor-pointer ${
              isStrictLimitMode ? 'bg-emerald-500' : 'bg-slate-800'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white transition-all shadow-md ${
                isStrictLimitMode ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* SECTION: GEMINI API KEY */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-200 flex items-center space-x-2">
          <Key className="w-5 h-5 text-emerald-400" />
          <span>Klucz API Gemini</span>
        </h3>
        
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Klucz API jest potrzebny do działania Asystenta Dietetycznego AI i Smart Posiłku. Klucz jest zapisywany wyłącznie na Twoim urządzeniu.
        </p>

        <div className="space-y-3">
          <input
            type="password"
            value={tempApiKey}
            onChange={(e) => setTempApiKey(e.target.value)}
            placeholder="Wklej klucz API Gemini..."
            className="w-full bg-slate-950 border border-slate-900 rounded-xl px-4 py-1.5 text-slate-200 placeholder-slate-800 placeholder:text-sm focus:outline-none focus:border-emerald-500 transition-colors text-base"
          />
          <button
            onClick={handleSaveApiKey}
            className={`w-full py-3 rounded-xl text-xs font-bold transition-all active:scale-[0.98] cursor-pointer ${
              keySaved ? 'bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            {keySaved ? 'Zapisano klucz!' : 'Zapisz klucz API'}
          </button>
        </div>
      </div>

      {/* SECTION: MEAL REMINDERS */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-200 flex items-center space-x-2">
          <Bell className="w-5 h-5 text-emerald-400" />
          <span>Przypomnienia o posiłkach</span>
        </h3>

        {!notificationsAuthorized && (
          <button
            onClick={requestNotificationPermission}
            className="w-full py-2.5 text-center text-xs font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl hover:bg-emerald-500/20 cursor-pointer"
          >
            Włącz powiadomienia w przeglądarce
          </button>
        )}

        <div className="flex items-center space-x-3 text-xs bg-slate-950 border border-slate-900 rounded-xl p-2.5">
          <span className="text-slate-400 font-medium">Wybierz godzinę:</span>
          <div className="flex items-center space-x-1.5">
            <select
              value={reminderHour}
              onChange={(e) => setReminderHour(e.target.value)}
              className="bg-slate-900 text-slate-200 font-bold border border-slate-800 rounded-lg px-2 py-1 cursor-pointer focus:outline-none text-base"
            >
              {Array.from({ length: 24 }).map((_, i) => {
                const s = String(i).padStart(2, '0');
                return <option key={s} value={s}>{s}</option>;
              })}
            </select>
            <span className="font-bold text-slate-600">:</span>
            <select
              value={reminderMinute}
              onChange={(e) => setReminderMinute(e.target.value)}
              className="bg-slate-900 text-slate-200 font-bold border border-slate-800 rounded-lg px-2 py-1 cursor-pointer focus:outline-none text-base"
            >
              {Array.from({ length: 12 }).map((_, i) => {
                const s = String(i * 5).padStart(2, '0');
                return <option key={s} value={s}>{s}</option>;
              })}
            </select>
          </div>
          <button
            onClick={handleAddReminderClick}
            className="ml-auto bg-emerald-500 hover:bg-emerald-400 text-white font-bold p-2 rounded-lg active:scale-[0.9] transition-all cursor-pointer"
          >
            Dodaj
          </button>
        </div>

        {/* Reminders List */}
        {reminders.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-0.5">Aktywne powiadomienia</h4>
            <div className="space-y-1.5">
              {reminders.map((reminder) => {
                const hourStr = String(reminder.hour).padStart(2, '0');
                const minuteStr = String(reminder.minute).padStart(2, '0');
                return (
                  <div
                    key={reminder.id}
                    className="flex items-center justify-between bg-slate-950/20 border border-slate-900 px-4 py-2.5 rounded-xl text-slate-300 text-xs"
                  >
                    <span>Codziennie o {hourStr}:{minuteStr}</span>
                    <button
                      onClick={() => deleteReminder(reminder.id)}
                      className="text-red-500 hover:text-red-400 font-bold cursor-pointer text-xxs border border-red-500/10 px-2 py-1 bg-red-500/5 hover:bg-red-500/10 rounded-lg"
                    >
                      Usuń
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* SECTION: DEVELOPER DEMO DATA */}
      <div className="glass-card rounded-2xl p-5 border border-dashed border-slate-800 space-y-4">
        <h3 className="text-xs font-bold text-slate-400 flex items-center space-x-2">
          <Database className="w-4 h-4" />
          <span>Zarządzanie danymi i testy</span>
        </h3>
        <p className="text-[10px] text-slate-500 leading-normal">
          Załaduj przykładową historię kalorii z ostatnich 14 dni oraz logi treningów na siłowni, aby zweryfikować działanie wykresów postępów.
        </p>
        
        <div className="space-y-2.5">
          <button
            onClick={loadDemoData}
            className="w-full flex items-center justify-center space-x-2 py-3 border border-slate-800 bg-slate-950 hover:bg-slate-900 text-emerald-400 font-bold rounded-xl text-xs active:scale-[0.98] transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Załaduj demo historyczne</span>
          </button>

          <button
            onClick={() => {
              if (confirm('Czy na pewno chcesz usunąć wszystkie dane, statystyki i profil? Zostaniesz przeniesiony do ekranu powitalnego.')) {
                localStorage.clear();
                window.location.reload();
              }
            }}
            className="w-full flex items-center justify-center space-x-2 py-3 border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-500 font-bold rounded-xl text-xs active:scale-[0.98] transition-all cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Usuń wszystkie dane aplikacji</span>
          </button>
        </div>
      </div>

      {/* SECTION: USER ACCOUNT */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-200 flex items-center space-x-2">
          <LogOut className="w-5 h-5 text-red-400" />
          <span>Moje Konto</span>
        </h3>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="block text-xxs font-bold text-slate-500 uppercase tracking-wider">Zalogowany e-mail</span>
            <span className="text-xs text-slate-300 font-medium">{user?.email || 'Brak danych'}</span>
          </div>
          <button
            onClick={() => {
              if (confirm('Czy na pewno chcesz się wylogować?')) {
                logout();
              }
            }}
            className="flex items-center space-x-1.5 px-4 py-2 border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-400 font-bold rounded-xl text-xs active:scale-[0.95] transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Wyloguj się</span>
          </button>
        </div>
      </div>
    </div>
  );
};
