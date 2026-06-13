import React, { useState, useEffect } from 'react';
import { useCalorieTracker } from '../hooks/useCalorieTracker';
import { basicProductsDatabase } from '../data/basicProducts';
import { ChevronLeft, Search, Plus, Sparkles, User, Clock, Apple, ScanBarcode } from 'lucide-react';
import type { MealItem } from '../types';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { fetchProductByBarcode } from '../services/foodApi';

interface ProductSearchProps {
  category: 'breakfast' | 'lunch' | 'dinner' | 'snacks';
  onBack: () => void;
}

export const ProductSearch: React.FC<ProductSearchProps> = ({ category, onBack }) => {
  const {
    updateMealItem,
    productsHistory,
    addProductToHistory,
    customProducts,
    addCustomProduct
  } = useCalorieTracker();

  const [searchText, setSearchText] = useState('');
  const [offProducts, setOffProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Selected item modal states
  const [selectedProduct, setSelectedProduct] = useState<{
    id: string;
    name: string;
    kcalPer100g: number;
    proteinPer100g: number;
    carbsPer100g: number;
    fatPer100g: number;
    source: 'api' | 'history' | 'custom' | 'base';
  } | null>(null);
  const [amountString, setAmountString] = useState('100');

  // Custom product creation states
  const [isCreatingCustom, setIsCreatingCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customKcal, setCustomKcal] = useState('');
  const [customProtein, setCustomProtein] = useState('');
  const [customCarbs, setCustomCarbs] = useState('');
  const [customFat, setCustomFat] = useState('');
  const [customWeight, setCustomWeight] = useState('100');

  // Scanner states
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scannedBarcode, setScannedBarcode] = useState('');

  // Filter lists based on search query
  const filteredCustom = searchText
    ? customProducts.filter(p => p.name.toLowerCase().includes(searchText.toLowerCase()))
    : [];
  
  const filteredBase = searchText
    ? basicProductsDatabase.filter(p => p.name.toLowerCase().includes(searchText.toLowerCase()))
    : [];

  const recentProducts = [...productsHistory]
    .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime())
    .slice(0, 5);

  const searchOFF = async () => {
    if (!searchText) return;
    setIsLoading(true);
    setHasSearched(true);
    try {
      const url = `https://pl.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(searchText)}&search_simple=1&action=process&json=1&page_size=20&cc=pl&lc=pl`;
      const response = await fetch(url);
      const data = await response.json();
      
      const filtered = (data.products || []).filter(
        (p: any) => p.product_name && p.nutriments && p.nutriments['energy-kcal_100g'] !== undefined
      );
      setOffProducts(filtered);
    } catch (err) {
      console.error('Błąd wyszukiwania OFF:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddProduct = () => {
    if (!selectedProduct) return;
    const amount = parseFloat(amountString);
    if (isNaN(amount) || amount <= 0) {
      alert('Podaj prawidłową wagę.');
      return;
    }

    const { kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g, name, id } = selectedProduct;

    const finalKcal = Math.round((kcalPer100g / 100) * amount);
    const finalProtein = (proteinPer100g / 100) * amount;
    const finalCarbs = (carbsPer100g / 100) * amount;
    const finalFat = (fatPer100g / 100) * amount;

    const newItem: MealItem = {
      id: crypto.randomUUID(),
      name,
      calories: finalKcal,
      protein: finalProtein,
      carbs: finalCarbs,
      fat: finalFat,
      weight: amount
    };

    updateMealItem(category, newItem);
    addProductToHistory(id, name, kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g);

    // Reset and return
    setSelectedProduct(null);
    setAmountString('100');
    onBack();
  };

  const handleSaveCustomProduct = () => {
    if (!customName || !customKcal || !customWeight) {
      alert('Proszę wypełnić wymagane pola (Nazwa, Kalorie, Waga).');
      return;
    }

    const totalKcal = parseFloat(customKcal);
    const totalWeight = parseFloat(customWeight);
    if (isNaN(totalKcal) || isNaN(totalWeight) || totalWeight <= 0) {
      alert('Wprowadź prawidłowe dane liczbowe.');
      return;
    }

    const totalProtein = parseFloat(customProtein) || 0;
    const totalCarbs = parseFloat(customCarbs) || 0;
    const totalFat = parseFloat(customFat) || 0;

    const kcalPer100 = (totalKcal / totalWeight) * 100;
    const pPer100 = (totalProtein / totalWeight) * 100;
    const cPer100 = (totalCarbs / totalWeight) * 100;
    const fPer100 = (totalFat / totalWeight) * 100;

    addCustomProduct(customName, kcalPer100, pPer100, cPer100, fPer100, scannedBarcode || undefined);

    // Reset creation fields
    setCustomName('');
    setCustomKcal('');
    setCustomProtein('');
    setCustomCarbs('');
    setCustomFat('');
    setCustomWeight('100');
    setScannedBarcode('');
    setIsCreatingCustom(false);

    // Prompt search state to find it
    setSearchText(customName);
    setHasSearched(true);
  };

  const handleBarcodeFound = async (barcode: string) => {
    setIsLoading(true);
    try {
      // 1. Look locally in customProducts
      const matchCustom = customProducts.find(p => p.barcode === barcode);
      if (matchCustom) {
        setSelectedProduct({
          id: matchCustom.id,
          name: matchCustom.name,
          kcalPer100g: matchCustom.kcalPer100g,
          proteinPer100g: matchCustom.proteinPer100g,
          carbsPer100g: matchCustom.carbsPer100g,
          fatPer100g: matchCustom.fatPer100g,
          source: 'custom'
        });
        return;
      }

      // 2. Look locally in productsHistory
      const matchHistory = productsHistory.find(p => p.id === barcode);
      if (matchHistory) {
        setSelectedProduct({
          id: matchHistory.id,
          name: matchHistory.name,
          kcalPer100g: matchHistory.kcalPer100g,
          proteinPer100g: matchHistory.proteinPer100g,
          carbsPer100g: matchHistory.carbsPer100g,
          fatPer100g: matchHistory.fatPer100g,
          source: 'history'
        });
        return;
      }

      // 3. Fallback to Open Food Facts API
      const product = await fetchProductByBarcode(barcode);
      if (product) {
        setSelectedProduct({
          id: product.barcode,
          name: product.name,
          kcalPer100g: product.kcalPer100g,
          proteinPer100g: product.proteinPer100g,
          carbsPer100g: product.carbsPer100g,
          fatPer100g: product.fatPer100g,
          source: 'api'
        });
      } else {
        // Product NOT found in Open Food Facts! Show manual creation form
        setScannedBarcode(barcode);
        setCustomName(`Produkt ${barcode}`);
        setCustomKcal('');
        setCustomProtein('');
        setCustomCarbs('');
        setCustomFat('');
        setCustomWeight('100');
        setIsCreatingCustom(true);
        alert(`Nie znaleziono produktu o kodzie ${barcode} w bazie. Możesz dodać go ręcznie.`);
      }
    } catch (err) {
      alert("Wystąpił błąd podczas szukania produktu po kodzie kreskowym.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isScanning) {
      setScanError(null);
      return;
    }
    let html5QrCode: Html5Qrcode | null = null;
    
    const startScanner = async () => {
      try {
        html5QrCode = new Html5Qrcode("reader", {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.ITF
          ],
          verbose: false
        });
        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 280, height: 160 }
          },
          async (decodedText) => {
            if (navigator.vibrate) {
              navigator.vibrate(100);
            }
            if (html5QrCode && html5QrCode.isScanning) {
              await html5QrCode.stop();
            }
            setIsScanning(false);
            handleBarcodeFound(decodedText);
          },
          () => {
            // Quiet failure callback
          }
        );
      } catch (err: any) {
        console.error("Failed to start scanner:", err);
        setScanError("Nie można uruchomić aparatu. Upewnij się, że zezwoliłeś na dostęp do kamery.");
      }
    };

    const timer = setTimeout(startScanner, 150);

    return () => {
      clearTimeout(timer);
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(console.error);
      }
    };
  }, [isScanning]);

  return (
    <div className="space-y-6 pb-20 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center space-x-1 text-slate-400 hover:text-slate-200 p-1 cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Wróć</span>
        </button>
        <h2 className="text-xl font-bold text-slate-100">Dodaj produkt</h2>
        <button
          onClick={() => setIsCreatingCustom(true)}
          className="p-2 bg-slate-900 border border-slate-800 text-emerald-400 rounded-xl hover:bg-slate-800 active:scale-[0.95] transition-all cursor-pointer"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Search Input Bar */}
      <div className="flex space-x-2">
        <input
          type="text"
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value);
            if (!e.target.value) {
              setHasSearched(false);
              setOffProducts([]);
            }
          }}
          onKeyDown={(e) => e.key === 'Enter' && searchOFF()}
          placeholder="Wyszukaj produkt (np. jajko, kurczak)..."
          className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors text-sm"
        />
        <button
          onClick={() => setIsScanning(true)}
          className="p-3 bg-slate-900 border border-slate-800 text-emerald-400 rounded-xl hover:bg-slate-800 active:scale-[0.95] transition-all cursor-pointer flex items-center justify-center"
          title="Skanuj kod kreskowy"
        >
          <ScanBarcode className="w-5 h-5" />
        </button>
        <button
          onClick={searchOFF}
          disabled={!searchText || isLoading}
          className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-5 py-3 rounded-xl active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer flex items-center"
        >
          <Search className="w-4 h-4" />
        </button>
      </div>

      {/* Search Content */}
      {isLoading ? (
        <div className="text-center py-10">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Szukam w bazach danych...</p>
        </div>
      ) : hasSearched && offProducts.length === 0 && filteredCustom.length === 0 && filteredBase.length === 0 ? (
        <div className="text-center py-12 glass-card rounded-2xl">
          <svg className="w-12 h-12 text-slate-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h4 className="font-bold text-slate-300">Brak produktu w bazach</h4>
          <button
            onClick={() => {
              setCustomName(searchText);
              setIsCreatingCustom(true);
            }}
            className="mt-4 inline-flex items-center space-x-2 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 text-amber-400 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Dodaj własny produkt</span>
          </button>
        </div>
      ) : hasSearched ? (
        <div className="space-y-5">
          {/* Custom Products */}
          {filteredCustom.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1 pl-1">
                <User className="w-3.5 h-3.5 text-amber-400" />
                <span>Własne produkty</span>
              </h4>
              <div className="space-y-2">
                {filteredCustom.map(p => (
                  <div
                    key={p.id}
                    onClick={() => setSelectedProduct({ ...p, source: 'custom' })}
                    className="glass-card-interactive rounded-xl p-3.5 flex items-center justify-between text-left"
                  >
                    <div>
                      <div className="font-bold text-slate-200 text-sm">{p.name}</div>
                      <div className="text-xxs text-slate-400 mt-1">
                        B: {Math.round(p.proteinPer100g)}g  W: {Math.round(p.carbsPer100g)}g  T: {Math.round(p.fatPer100g)}g  ({Math.round(p.kcalPer100g)} kcal/100g)
                      </div>
                    </div>
                    <Plus className="w-4 h-4 text-amber-500" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preloaded Base Products */}
          {filteredBase.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1 pl-1">
                <Apple className="w-3.5 h-3.5 text-emerald-400" />
                <span>Produkty Podstawowe</span>
              </h4>
              <div className="space-y-2">
                {filteredBase.map(p => (
                  <div
                    key={p.id}
                    onClick={() => setSelectedProduct({ ...p, source: 'base' })}
                    className="glass-card-interactive rounded-xl p-3.5 flex items-center justify-between text-left"
                  >
                    <div>
                      <div className="font-bold text-slate-200 text-sm">{p.name}</div>
                      <div className="text-xxs text-slate-400 mt-1">
                        B: {Math.round(p.proteinPer100g)}g  W: {Math.round(p.carbsPer100g)}g  T: {Math.round(p.fatPer100g)}g  ({Math.round(p.kcalPer100g)} kcal/100g)
                      </div>
                    </div>
                    <Plus className="w-4 h-4 text-emerald-500" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Web results OFF */}
          {offProducts.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1 pl-1">
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                <span>Wyniki z internetu (Polska)</span>
              </h4>
              <div className="space-y-2">
                {offProducts.map(p => {
                  const kcal = p.nutriments['energy-kcal_100g'] || 0;
                  const protein = p.nutriments.proteins || 0;
                  const carbs = p.nutriments.carbohydrates || 0;
                  const fat = p.nutriments.fat || 0;
                  const name = p.product_name || 'Nieznany produkt';
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedProduct({
                        id: p.id,
                        name,
                        kcalPer100g: kcal,
                        proteinPer100g: protein,
                        carbsPer100g: carbs,
                        fatPer100g: fat,
                        source: 'api'
                      })}
                      className="glass-card-interactive rounded-xl p-3.5 flex items-center justify-between text-left"
                    >
                      <div>
                        <div className="font-bold text-slate-200 text-sm">{name}</div>
                        <div className="text-xxs text-slate-400 mt-1">
                          B: {Math.round(protein)}g  W: {Math.round(carbs)}g  T: {Math.round(fat)}g  ({Math.round(kcal)} kcal/100g)
                        </div>
                      </div>
                      <Plus className="w-4 h-4 text-blue-400" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* History lists (if no search text) */
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1 pl-1">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Ostatnio wybrane</span>
          </h4>
          {recentProducts.length > 0 ? (
            <div className="space-y-2">
              {recentProducts.map(p => (
                <div
                  key={p.id}
                  onClick={() => setSelectedProduct({ ...p, source: 'history' })}
                  className="glass-card-interactive rounded-xl p-3.5 flex items-center justify-between text-left"
                >
                  <span className="font-semibold text-slate-300 text-sm">{p.name}</span>
                  <span className="text-xs text-slate-500 font-medium">{Math.round(p.kcalPer100g)} kcal/100g</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-600 text-xs pl-1 italic">Brak ostatnio wybranych produktów.</p>
          )}
        </div>
      )}

      {/* GRAMS SELECTOR POPUP MODAL */}
      {selectedProduct && (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm z-50 animate-fade-in">
          <div className="w-full max-w-sm glass-card rounded-2xl p-6 relative border border-slate-800">
            <h3 className="text-base font-bold text-slate-100 mb-2">Podaj wagę porcji</h3>
            <p className="text-slate-400 text-xs mb-4">Wpisz ilość w gramach dla: <span className="text-emerald-400 font-bold">{selectedProduct.name}</span></p>
            
            <div className="flex items-center justify-between bg-slate-950 px-4 py-3 rounded-xl border border-slate-900 mb-5">
              <span className="text-sm text-slate-300 font-medium">Ilość</span>
              <div className="flex items-center space-x-1">
                <input
                  type="number"
                  value={amountString}
                  onChange={(e) => setAmountString(e.target.value)}
                  placeholder="100"
                  className="w-20 bg-transparent text-right text-slate-200 font-bold focus:outline-none"
                />
                <span className="text-xs text-slate-500 font-semibold">g</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSelectedProduct(null)}
                className="py-3 bg-slate-900 border border-slate-800 text-slate-400 rounded-xl hover:bg-slate-800 text-sm font-semibold transition-all active:scale-[0.98] cursor-pointer"
              >
                Anuluj
              </button>
              <button
                onClick={handleAddProduct}
                className="py-3 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-sm font-bold transition-all active:scale-[0.98] cursor-pointer"
              >
                Dodaj
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE CUSTOM PRODUCT MODAL */}
      {isCreatingCustom && (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm z-50 animate-fade-in">
          <div className="w-full max-w-sm glass-card rounded-2xl p-6 relative border border-slate-800 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-slate-100 mb-1">Nowy produkt</h3>
            <p className="text-slate-500 text-xxs mb-4">Wpisz dane z opakowania – puste makra zapiszą się jako 0.0.</p>
            
            <div className="space-y-3.5 mb-5">
              <div>
                <label className="block text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Nazwa produktu *</label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="np. Skyr owocowy"
                  className="w-full bg-slate-950 border border-slate-900 rounded-xl px-4 py-2.5 text-slate-200 placeholder-slate-700 focus:outline-none text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Kalorie (kcal) *</label>
                  <input
                    type="number"
                    value={customKcal}
                    onChange={(e) => setCustomKcal(e.target.value)}
                    placeholder="kcal"
                    className="w-full bg-slate-950 border border-slate-900 rounded-xl px-4 py-2.5 text-slate-200 placeholder-slate-700 focus:outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Masa porcji (g) *</label>
                  <input
                    type="number"
                    value={customWeight}
                    onChange={(e) => setCustomWeight(e.target.value)}
                    placeholder="g"
                    className="w-full bg-slate-950 border border-slate-900 rounded-xl px-4 py-2.5 text-slate-200 placeholder-slate-700 focus:outline-none text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Białko (g)</label>
                <input
                  type="number"
                  step="0.1"
                  value={customProtein}
                  onChange={(e) => setCustomProtein(e.target.value)}
                  placeholder="g"
                  className="w-full bg-slate-950 border border-slate-900 rounded-xl px-4 py-2.5 text-slate-200 placeholder-slate-700 focus:outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Węglowodany (g)</label>
                <input
                  type="number"
                  step="0.1"
                  value={customCarbs}
                  onChange={(e) => setCustomCarbs(e.target.value)}
                  placeholder="g"
                  className="w-full bg-slate-950 border border-slate-900 rounded-xl px-4 py-2.5 text-slate-200 placeholder-slate-700 focus:outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Tłuszcze (g)</label>
                <input
                  type="number"
                  step="0.1"
                  value={customFat}
                  onChange={(e) => setCustomFat(e.target.value)}
                  placeholder="g"
                  className="w-full bg-slate-950 border border-slate-900 rounded-xl px-4 py-2.5 text-slate-200 placeholder-slate-700 focus:outline-none text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setIsCreatingCustom(false);
                  setScannedBarcode('');
                }}
                className="py-3 bg-slate-900 border border-slate-800 text-slate-400 rounded-xl hover:bg-slate-800 text-sm font-semibold transition-all active:scale-[0.98] cursor-pointer"
              >
                Anuluj
              </button>
              <button
                onClick={handleSaveCustomProduct}
                className="py-3 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-sm font-bold transition-all active:scale-[0.98] cursor-pointer"
              >
                Zapisz
              </button>
            </div>
          </div>
        </div>
      )}
      {/* SCAN BARCODE MODAL */}
      {isScanning && (
        <div className="fixed inset-0 flex flex-col bg-slate-950/95 z-50 animate-fade-in justify-between py-8 px-5">
          <div className="text-center space-y-2">
            <h3 className="text-lg font-black text-slate-100 uppercase tracking-wide">Skanuj kod kreskowy</h3>
            <p className="text-slate-400 text-xs max-w-xs mx-auto leading-relaxed">
              Zezwól na dostęp do aparatu i umieść kod kreskowy wewnątrz ramki.
            </p>
          </div>

          <div className="relative w-full max-w-sm aspect-square mx-auto rounded-3xl overflow-hidden border border-slate-800/85 bg-slate-950 flex items-center justify-center">
            {scanError ? (
              <div className="text-center p-6 space-y-3.5 max-w-xs">
                <p className="text-red-400 text-sm font-semibold leading-relaxed">{scanError}</p>
                <p className="text-slate-500 text-xxs leading-relaxed">
                  Spróbuj ręcznie wpisać kod w pasek wyszukiwania lub kliknij przycisk "+" u góry, aby dodać produkt.
                </p>
              </div>
            ) : (
              <>
                <div id="reader" className="w-full h-full object-cover" />
                <div className="absolute inset-0 border-2 border-dashed border-emerald-500/20 rounded-3xl pointer-events-none flex items-center justify-center">
                  <div className="w-64 h-32 border-2 border-emerald-500 rounded-xl relative shadow-[0_0_0_9999px_rgba(15,23,42,0.65)]">
                    <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-emerald-400 rounded-tl" />
                    <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-emerald-400 rounded-tr" />
                    <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-emerald-400 rounded-bl" />
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-emerald-400 rounded-br" />
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="w-full max-w-sm mx-auto">
            <button
              onClick={() => setIsScanning(false)}
              className="w-full py-3.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-bold rounded-xl transition-all active:scale-[0.98] cursor-pointer"
            >
              Anuluj
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
