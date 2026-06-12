import React, { useState } from 'react';
import { auth, db } from '../services/firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { Mail, Lock, AlertTriangle, KeyRound } from 'lucide-react';
import { FirebaseError } from 'firebase/app';

export const Auth: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorMessage('Wpisz e-mail oraz hasło.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Hasło musi składać się z przynajmniej 6 znaków.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      if (isRegisterMode) {
        // Create user
        const credential = await createUserWithEmailAndPassword(auth!, email.trim(), password);
        const user = credential.user;

        // Initialize default profile document in Firestore
        await setDoc(doc(db!, 'users', user.uid, 'profile', 'data'), {
          weight: 80,
          height: 180,
          age: 25,
          gender: 'Mężczyzna',
          activityLevel: 1.2,
          tdee: 2000,
          isStrictLimitMode: true,
          apiKey: '',
          onboardingCompleted: false
        });

        // Initialize default statistics document in Firestore
        await setDoc(doc(db!, 'users', user.uid, 'statistics', 'data'), {
          historicalDays: [],
          workoutEntries: [],
          productsHistory: [],
          customProducts: [],
          reminders: []
        });
      } else {
        // Sign in
        const userCredential = await signInWithEmailAndPassword(auth!, email.trim(), password);
        const user = userCredential.user;
        console.log('Zalogowano użytkownika:', user.uid);
      }
    } catch (err: any) {
      console.error('Błąd autoryzacji:', err);
      let plMessage = 'Nie udało się połączyć z kontem. Sprawdź swoje dane logowania.';
      if (err instanceof FirebaseError) {
        if (err.code === 'auth/email-already-in-use') {
          plMessage = 'Ten adres e-mail jest już zajęty.';
        } else if (err.code === 'auth/invalid-email') {
          plMessage = 'Niepoprawny format adresu e-mail.';
        } else if (err.code === 'auth/weak-password') {
          plMessage = 'Hasło jest zbyt słabe.';
        } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
          plMessage = 'Niepoprawny e-mail lub hasło.';
        }
      }
      setErrorMessage(plMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
      {/* Brand Header */}
      <div className="text-center mb-8 animate-fade-in">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-400 mb-3 border border-emerald-500/20">
          <KeyRound className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-black tracking-tight text-slate-100">CalorieCounter</h1>
        <p className="text-slate-500 text-xs mt-1">Twój inteligentny dziennik kalorii w chmurze</p>
      </div>

      {/* Auth Card */}
      <div className="w-full max-w-sm glass-card rounded-3xl p-6 shadow-2xl border border-slate-900 relative overflow-hidden animate-fade-in delay-100">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
        
        <h2 className="text-lg font-bold text-slate-100 mb-6">
          {isRegisterMode ? 'Stwórz nowe konto' : 'Zaloguj się do konta'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email input */}
          <div className="space-y-1.5">
            <label className="block text-xxs font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Adres E-mail</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-600" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                placeholder="np. jan.kowalski@example.com"
                className="w-full bg-slate-950 border border-slate-900 rounded-xl pl-10 pr-4 py-3 text-slate-200 placeholder-slate-700 focus:outline-none focus:border-emerald-500 transition-colors text-sm"
              />
            </div>
          </div>

          {/* Password input */}
          <div className="space-y-1.5">
            <label className="block text-xxs font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Hasło</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-600" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-900 rounded-xl pl-10 pr-4 py-3 text-slate-200 placeholder-slate-700 focus:outline-none focus:border-emerald-500 transition-colors text-sm"
              />
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="flex items-start bg-red-500/10 border border-red-500/20 p-3.5 rounded-xl text-xxs text-red-400 space-x-2 animate-fade-in">
              <AlertTriangle className="w-4 h-4 flex-none" />
              <span className="leading-relaxed font-semibold">{errorMessage}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className={`w-full py-3.5 rounded-xl font-bold text-white shadow-lg transition-all flex items-center justify-center space-x-2 active:scale-[0.99] cursor-pointer ${
              isLoading
                ? 'bg-slate-800 border border-slate-700 text-slate-500'
                : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-500/10'
            }`}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Łączenie z Firebase...</span>
              </>
            ) : (
              <span>{isRegisterMode ? 'Zarejestruj się' : 'Zaloguj się'}</span>
            )}
          </button>
        </form>

        {/* Toggle mode links */}
        <div className="mt-6 text-center text-xs text-slate-500">
          {isRegisterMode ? (
            <p>
              Masz już konto?{' '}
              <button
                type="button"
                onClick={() => {
                  setIsRegisterMode(false);
                  setErrorMessage('');
                }}
                className="text-emerald-400 font-bold hover:underline ml-1 cursor-pointer bg-transparent border-none p-0"
              >
                Zaloguj się
              </button>
            </p>
          ) : (
            <p>
              Nie masz konta?{' '}
              <button
                type="button"
                onClick={() => {
                  setIsRegisterMode(true);
                  setErrorMessage('');
                }}
                className="text-emerald-400 font-bold hover:underline ml-1 cursor-pointer bg-transparent border-none p-0"
              >
                Zarejestruj się
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
