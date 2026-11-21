import { lazy, Suspense, useState } from 'react';
import './App.css';
import { CalorieTrackerProvider } from './hooks/useCalorieTracker';
import { Onboarding } from './components/Onboarding';
import { Dashboard } from './components/Dashboard';
import { MealCategory } from './components/MealCategory';
import { Settings } from './components/Settings';
import { DietitianReportModal } from './components/DietitianReportModal';
import { AISmartMealModal } from './components/AISmartMealModal';
import { Auth } from './components/Auth';
import { useCalorieTracker } from './hooks/useCalorieTracker';
import { firebaseInitError } from './services/firebase';
import {
  CalendarDays,
  BarChart3,
  Dumbbell,
  Settings as SettingsIcon,
} from 'lucide-react';

// Ciężkie ekrany (recharts, skaner kodów) ładowane dopiero przy pierwszym wejściu
const ProductSearch = lazy(() => import('./components/ProductSearch').then(m => ({ default: m.ProductSearch })));
const Gym = lazy(() => import('./components/Gym').then(m => ({ default: m.Gym })));
const Statistics = lazy(() => import('./components/Statistics').then(m => ({ default: m.Statistics })));

const ScreenFallback = () => (
  <div className="py-24 grid place-items-center">
    <div className="w-8 h-8 border-[3px] border-emerald-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

// ─── Types ────────────────────────────────────────────────────────────────────
type TabId = 'dashboard' | 'statistics' | 'gym' | 'settings';
type MealCategoryId = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

// Navigation page stack for sub-views inside "Mój Dzień"
type SubPage =
  | { view: 'dashboard' }
  | { view: 'meal'; category: MealCategoryId }
  | { view: 'product-search'; category: MealCategoryId }
;

// ─── Inner App (has access to context) ───────────────────────────────────────
function InnerApp() {
  const { user, authLoading, onboardingCompleted } = useCalorieTracker();

  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [subPage, setSubPage] = useState<SubPage>({ view: 'dashboard' });

  // Modal visibilities
  const [isDietitianOpen, setIsDietitianOpen] = useState(false);
  const [isAISheetOpen, setIsAISheetOpen] = useState(false);
  const [aiSheetCategory, setAiSheetCategory] = useState<MealCategoryId>('breakfast');

  if (firebaseInitError) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center space-y-6 animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center border border-red-500/20 shadow-lg shadow-red-500/5">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div className="space-y-2 max-w-sm">
          <h1 className="text-xl font-bold text-slate-100">Błąd konfiguracji Firebase</h1>
          <p className="text-slate-400 text-xs leading-relaxed">
            Aplikacja nie mogła połączyć się z usługą Firebase. Upewnij się, że dodałeś poprawne zmienne środowiskowe w panelu Vercel (np. bez cudzysłowów).
          </p>
          <div className="bg-red-950/20 border border-red-500/10 rounded-xl p-3.5 text-left text-[11px] font-mono text-red-400 mt-4 overflow-x-auto whitespace-pre-wrap max-w-md mx-auto">
            {firebaseInitError}
          </div>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 text-sm font-medium">Wczytywanie Twojego profilu…</p>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  if (!onboardingCompleted) {
    return <Onboarding />;
  }

  // Navigation helpers
  const navigateToMeal = (category: MealCategoryId) => {
    setSubPage({ view: 'meal', category });
    setActiveTab('dashboard');
  };

  const navigateToSearch = (category: MealCategoryId) => {
    setSubPage({ view: 'product-search', category });
  };

  const openAISheet = (category: MealCategoryId) => {
    setAiSheetCategory(category);
    setIsAISheetOpen(true);
  };

  const navigateBack = () => {
    if (subPage.view === 'product-search') {
      const cat = (subPage as { view: 'product-search'; category: MealCategoryId }).category;
      setSubPage({ view: 'meal', category: cat });
    } else {
      setSubPage({ view: 'dashboard' });
    }
  };

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    // Reset subpage when switching tabs away from dashboard
    if (tab !== 'dashboard') {
      setSubPage({ view: 'dashboard' });
    }
  };

  // Which content to render in the main area
  const renderContent = () => {
    if (activeTab === 'statistics') return <Statistics />;
    if (activeTab === 'gym') return <Gym />;
    if (activeTab === 'settings') return <Settings />;

    // Dashboard tab – subpage routing
    if (subPage.view === 'dashboard') {
      return (
        <Dashboard
          onNavigateToMeal={navigateToMeal}
          onOpenDietitianReport={() => setIsDietitianOpen(true)}
        />
      );
    }

    if (subPage.view === 'meal') {
      return (
        <MealCategory
          category={subPage.category}
          onBack={navigateBack}
          onNavigateToSearch={() => navigateToSearch(subPage.category)}
          onOpenAISheet={() => openAISheet(subPage.category)}
        />
      );
    }

    if (subPage.view === 'product-search') {
      return (
        <ProductSearch
          category={subPage.category}
          onBack={navigateBack}
        />
      );
    }
  };

  const tabs: { id: TabId; label: string; Icon: React.FC<{ className?: string }> }[] = [
    { id: 'dashboard', label: 'Mój Dzień', Icon: CalendarDays },
    { id: 'statistics', label: 'Statystyki', Icon: BarChart3 },
    { id: 'gym', label: 'Siłownia', Icon: Dumbbell },
    { id: 'settings', label: 'Ustawienia', Icon: SettingsIcon },
  ];

  const pageTitles: Record<TabId, string> = {
    dashboard: 'Mój Dzień',
    statistics: 'Statystyki',
    gym: 'Siłownia',
    settings: 'Ustawienia',
  };

  const isSubPage = activeTab === 'dashboard' && subPage.view !== 'dashboard';

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Top App Bar (podstrony posiłku mają własny nagłówek z „Wróć”) ── */}
      {!isSubPage && (
      <header className="sticky top-0 z-30 bg-slate-950/75 backdrop-blur-xl pt-[env(safe-area-inset-top)]">
        <div className="max-w-lg mx-auto px-5 h-14 flex items-center justify-between">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-50">
            {pageTitles[activeTab]}
          </h1>
          <div className="flex items-center gap-2 text-slate-400" aria-label="CalorieCounter">
            <svg viewBox="0 0 64 64" className="w-7 h-7" aria-hidden="true">
              <circle cx="32" cy="32" r="18" fill="none" className="stroke-slate-800" strokeWidth="8" />
              <circle cx="32" cy="32" r="18" fill="none" className="stroke-emerald-500" strokeWidth="8" strokeLinecap="round" strokeDasharray="80 200" transform="rotate(-90 32 32)" />
              <circle cx="32" cy="32" r="18" fill="none" className="stroke-teal-500" strokeWidth="8" strokeLinecap="round" strokeDasharray="22 200" strokeDashoffset="-86" transform="rotate(-90 32 32)" />
            </svg>
          </div>
        </div>
      </header>
      )}

      {/* ── Scrollable Main Content ──────────────────────────────────────── */}
      <main className={`flex-1 ${isSubPage ? 'pt-[calc(env(safe-area-inset-top)+0.75rem)]' : ''}`}>
        <div className="max-w-lg mx-auto px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
          <Suspense fallback={<ScreenFallback />}>{renderContent()}</Suspense>
        </div>
      </main>

      {/* ── Floating Tab Dock ────────────────────────────────────────────── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pointer-events-none"
        aria-label="Nawigacja główna"
      >
        <div className="pointer-events-auto max-w-lg mx-auto grid grid-cols-4 gap-1 p-1.5 rounded-[22px] bg-slate-900/90 border border-slate-800 backdrop-blur-xl shadow-[0_16px_40px_-12px_rgb(0_0_0/0.7)]">
          {tabs.map(({ id, label, Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                id={`tab-${id}`}
                onClick={() => handleTabChange(id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-2xl transition-colors duration-200 cursor-pointer active:scale-[0.96] ${
                  isActive
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className={`text-[11px] leading-none ${isActive ? 'font-bold' : 'font-medium'}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Global Modals ────────────────────────────────────────────────── */}
      <DietitianReportModal
        isOpen={isDietitianOpen}
        onClose={() => setIsDietitianOpen(false)}
      />

      <AISmartMealModal
        isOpen={isAISheetOpen}
        category={aiSheetCategory}
        onClose={() => setIsAISheetOpen(false)}
      />
    </div>
  );
}

// ─── Root App (wraps with Context Provider) ───────────────────────────────────
function App() {
  return (
    <CalorieTrackerProvider>
      <InnerApp />
    </CalorieTrackerProvider>
  );
}

export default App;
