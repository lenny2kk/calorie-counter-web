import { useState } from 'react';
import './App.css';
import { CalorieTrackerProvider } from './hooks/useCalorieTracker';
import { Onboarding } from './components/Onboarding';
import { Dashboard } from './components/Dashboard';
import { MealCategory } from './components/MealCategory';
import { ProductSearch } from './components/ProductSearch';
import { Gym } from './components/Gym';
import { Statistics } from './components/Statistics';
import { Settings } from './components/Settings';
import { DietitianReportModal } from './components/DietitianReportModal';
import { AISmartMealModal } from './components/AISmartMealModal';
import { useCalorieTracker } from './hooks/useCalorieTracker';
import {
  CalendarDays,
  BarChart3,
  Dumbbell,
  Settings as SettingsIcon,
} from 'lucide-react';

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
  const { onboardingCompleted } = useCalorieTracker();

  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [subPage, setSubPage] = useState<SubPage>({ view: 'dashboard' });

  // Modal visibilities
  const [isDietitianOpen, setIsDietitianOpen] = useState(false);
  const [isAISheetOpen, setIsAISheetOpen] = useState(false);
  const [aiSheetCategory, setAiSheetCategory] = useState<MealCategoryId>('breakfast');

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

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* ── Top App Bar ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-xl border-b border-slate-900/80">
        <div className="max-w-lg mx-auto px-5 py-4 flex items-center justify-between">
          <h1 className="text-lg font-black tracking-tight text-slate-100">
            {activeTab === 'dashboard' && subPage.view === 'dashboard'
              ? 'Mój Dzień'
              : activeTab === 'dashboard' && subPage.view === 'meal'
              ? ''
              : activeTab === 'dashboard' && subPage.view === 'product-search'
              ? ''
              : pageTitles[activeTab]}
          </h1>
          <div className="flex items-center space-x-1">
            <span className="text-xxs font-bold uppercase tracking-widest text-emerald-500/70 border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 rounded-full">
              CalorieCounter
            </span>
          </div>
        </div>
      </header>

      {/* ── Scrollable Main Content ──────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 pt-5">
          {renderContent()}
        </div>
      </main>

      {/* ── Bottom Tab Bar ───────────────────────────────────────────────── */}
      <nav className="sticky bottom-0 z-30 bg-slate-950/90 backdrop-blur-xl border-t border-slate-900/80">
        <div className="max-w-lg mx-auto px-2 py-2 grid grid-cols-4 gap-1">
          {tabs.map(({ id, label, Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                id={`tab-${id}`}
                onClick={() => handleTabChange(id)}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all duration-200 cursor-pointer active:scale-[0.95] ${
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'text-slate-500 hover:text-slate-400 hover:bg-slate-900'
                }`}
              >
                <Icon className={`w-5 h-5 mb-0.5 transition-transform ${isActive ? 'scale-105' : ''}`} />
                <span className={`text-[10px] font-semibold leading-none ${isActive ? 'font-bold' : ''}`}>
                  {label}
                </span>
                {isActive && (
                  <span className="mt-1 block w-4 h-0.5 rounded-full bg-emerald-500" />
                )}
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
