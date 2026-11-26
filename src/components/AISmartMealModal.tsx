import React, { useState, useEffect, useRef } from 'react';
import { useCalorieTracker } from '../hooks/useCalorieTracker';
import { fetchAIMealAnalysis, analyzeLabelImage } from '../services/dietitian';
import { estimateDishFromPhoto, NotFoodError } from '../services/mealPhoto';
import type { DishEstimate, EstimateConfidence } from '../services/mealPhoto';
import { fileToJpegBase64, videoFrameToJpegBase64 } from '../utils/image';
import { Sparkles, X, Camera, Send, Check, Loader2, ImagePlus, UtensilsCrossed, ScanText } from 'lucide-react';
import type { MealItem } from '../types';

const sanitizeNumber = (val: unknown): number => {
  if (typeof val === 'number') return Number.isFinite(val) && val > 0 ? val : 0;
  if (!val) return 0;
  // Zamień polskie przecinki na kropki i usuń wszystkie znaki, które nie są cyframi lub kropką
  const cleaned = String(val).replace(',', '.').replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

interface AISmartMealModalProps {
  isOpen: boolean;
  category: 'breakfast' | 'lunch' | 'dinner' | 'snacks';
  /** Otwórz od razu aparat w trybie zdjęcia potrawy */
  startWithCamera?: boolean;
  onClose: () => void;
}

type CameraMode = 'dish' | 'label';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text?: string;
  image?: string; // JPEG base64
  isLoading?: boolean;
  aiResult?: {
    success: boolean;
    productName: string;
    calories: number;
    protein: number;
    carbs: number | string;
    fat: number;
    baseGrammage: number;
  };
  dishResult?: DishEstimate;
}

/** Mnożniki porcji – zamiast wpisywania gramów, których użytkownik nie zna */
const PORTION_FACTORS: { value: number; label: string }[] = [
  { value: 0.5, label: '½' },
  { value: 0.75, label: '¾' },
  { value: 1, label: '1×' },
  { value: 1.25, label: '1¼' },
  { value: 1.5, label: '1½' },
  { value: 2, label: '2×' },
];

const CONFIDENCE_UI: Record<EstimateConfidence, { label: string; className: string }> = {
  high: { label: 'Pewność: wysoka', className: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25' },
  medium: { label: 'Pewność: średnia', className: 'text-teal-300 bg-teal-500/10 border-teal-500/25' },
  low: { label: 'Pewność: niska', className: 'text-amber-300 bg-amber-500/10 border-amber-500/25' },
};

const WELCOME =
  'Zrób zdjęcie talerza i dopisz kilka słów, np. „schabowy z ziemniakami, smażony na smalcu”. Oszacuję wielkość porcji i kalorie – bez ważenia. Możesz też opisać posiłek słownie albo sfotografować tabelę wartości odżywczych z opakowania.';

const NO_CAMERA_API = 'Ta przeglądarka nie daje dostępu do aparatu. Wybierz zdjęcie z galerii.';
const hasCameraApi = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/** Każde otwarcie montuje asystenta od nowa – świeża rozmowa, a zamknięcie wyłącza aparat. */
export const AISmartMealModal: React.FC<AISmartMealModalProps> = (props) =>
  props.isOpen ? <AISmartMealSheet {...props} /> : null;

const AISmartMealSheet: React.FC<AISmartMealModalProps> = ({ category, startWithCamera = false, onClose }) => {
  const { apiKey, updateMealItem } = useCalorieTracker();

  const [messages, setMessages] = useState<ChatMessage[]>([{ id: 'welcome', sender: 'assistant', text: WELCOME }]);
  const [textInput, setTextInput] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(startWithCamera);
  const [cameraMode, setCameraMode] = useState<CameraMode>('dish');
  const [cameraError, setCameraError] = useState<string | null>(() => (hasCameraApi() ? null : NO_CAMERA_API));
  const [showFlash, setShowFlash] = useState(false);
  /** Zdjęcie potrawy czekające na (opcjonalny) opis przed wysłaniem */
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);

  // Gramatura (etykieta/opis) i mnożnik porcji (zdjęcie potrawy) per karta
  const [eatenWeights, setEatenWeights] = useState<Record<string, string>>({});
  const [portionFactors, setPortionFactors] = useState<Record<string, number>>({});
  const [addedMsgIds, setAddedMsgIds] = useState<Set<string>>(new Set());

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);

  // Scroll to bottom on new messages and updates
  useEffect(() => {
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
    return () => clearTimeout(timer);
  }, [messages, pendingPhoto]);

  // Handle active camera streaming lifecycle
  useEffect(() => {
    if (!isCameraOpen || !hasCameraApi()) return;
    let activeStream: MediaStream | null = null;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1440 } } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        activeStream = stream;
        setCameraError(null);
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.play().catch((err) => console.error('Video play error:', err));
        }
      })
      .catch((err) => {
        console.error('Camera access error:', err);
        if (!cancelled) {
          setCameraError('Brak dostępu do aparatu. Zezwól na niego w ustawieniach albo wybierz zdjęcie z galerii.');
        }
      });

    return () => {
      cancelled = true;
      activeStream?.getTracks().forEach((track) => track.stop());
    };
  }, [isCameraOpen]);

  const replaceMessage = (id: string, next: ChatMessage) =>
    setMessages((prev) => prev.map((msg) => (msg.id === id ? next : msg)));

  const pushUserAndLoader = (user: Omit<ChatMessage, 'id' | 'sender'>, loadingText: string) => {
    const assistantMsgId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), sender: 'user', ...user },
      { id: assistantMsgId, sender: 'assistant', isLoading: true, text: loadingText },
    ]);
    return assistantMsgId;
  };

  // Opis słowny → wartości na 100 g, gramaturę podaje użytkownik
  const handleSendTextMessage = async (query: string) => {
    const assistantMsgId = pushUserAndLoader({ text: query }, 'Analizuję Twój posiłek...');
    try {
      const result = await fetchAIMealAnalysis({ apiKey, inputText: query });
      replaceMessage(assistantMsgId, {
        id: assistantMsgId,
        sender: 'assistant',
        aiResult: {
          success: true,
          productName: query.length > 40 ? query.substring(0, 40) + '...' : query,
          calories: sanitizeNumber(result.kcalPer100g),
          protein: sanitizeNumber(result.proteinPer100g),
          carbs: sanitizeNumber(result.carbsPer100g),
          fat: sanitizeNumber(result.fatPer100g),
          baseGrammage: 100,
        },
      });
    } catch (err) {
      console.error(err);
      replaceMessage(assistantMsgId, {
        id: assistantMsgId,
        sender: 'assistant',
        text: `Nie udało się przeanalizować posiłku: ${errorMessage(err)}. Opisz go innymi słowami.`,
      });
    }
  };

  // Zdjęcie potrawy + krótki opis → szacunek całej porcji
  const handleSendDishMessage = async (photo: string, description: string) => {
    const assistantMsgId = pushUserAndLoader(
      { image: photo, text: description || undefined },
      'Oceniam porcję i liczę kalorie...',
    );
    try {
      const estimate = await estimateDishFromPhoto({ apiKey, imageBase64: photo, description });
      replaceMessage(assistantMsgId, { id: assistantMsgId, sender: 'assistant', dishResult: estimate });
    } catch (err) {
      console.error(err);
      replaceMessage(assistantMsgId, {
        id: assistantMsgId,
        sender: 'assistant',
        text:
          err instanceof NotFoodError
            ? 'Na tym zdjęciu nie widzę jedzenia. Zrób zdjęcie talerza z góry lub lekko z boku, tak żeby cała porcja była w kadrze.'
            : `Nie udało się oszacować posiłku: ${errorMessage(err)}`,
      });
    }
  };

  // Zdjęcie etykiety → odczyt tabeli wartości odżywczych
  const handleSendLabelMessage = async (base64Data: string) => {
    const assistantMsgId = pushUserAndLoader({ image: base64Data }, 'Asystent analizuje etykietę...');
    try {
      const result = await analyzeLabelImage({ apiKey, imageBase64: base64Data });
      if (!result || (result.success !== true && result.calories === undefined)) {
        throw new Error('Nie można odczytać tabeli.');
      }
      replaceMessage(assistantMsgId, {
        id: assistantMsgId,
        sender: 'assistant',
        aiResult: {
          success: true,
          productName: String(result.productName || 'Nieznany produkt AI'),
          calories: sanitizeNumber(result.calories),
          protein: sanitizeNumber(result.protein),
          carbs: sanitizeNumber(result.carbs),
          fat: sanitizeNumber(result.fat),
          baseGrammage: sanitizeNumber(result.portionGrams || result.baseGrammage || 100),
        },
      });
    } catch (err) {
      console.error(err);
      replaceMessage(assistantMsgId, {
        id: assistantMsgId,
        sender: 'assistant',
        text: 'Zdjęcie jest nieczytelne lub nie znaleziono tabeli wartości odżywczych. Spróbuj zrobić zdjęcie pod lepszym kątem lub przy lepszym oświetleniu.',
      });
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const query = textInput.trim();
    if (pendingPhoto) {
      const photo = pendingPhoto;
      setPendingPhoto(null);
      setTextInput('');
      void handleSendDishMessage(photo, query);
      return;
    }
    if (!query) return;
    setTextInput('');
    void handleSendTextMessage(query);
  };

  // Zdjęcie gotowe: etykieta idzie od razu, potrawa czeka na krótki opis
  const handlePhotoReady = (base64: string) => {
    setIsCameraOpen(false);
    if (cameraMode === 'label') {
      void handleSendLabelMessage(base64);
    } else {
      setPendingPhoto(base64);
      setTimeout(() => textInputRef.current?.focus(), 100);
    }
  };

  const takeSnapshot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    let base64: string;
    try {
      base64 = videoFrameToJpegBase64(video);
    } catch (err) {
      setCameraError(errorMessage(err));
      return;
    }
    setShowFlash(true);
    setTimeout(() => {
      setShowFlash(false);
      handlePhotoReady(base64);
    }, 150);
  };

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // pozwala wybrać to samo zdjęcie ponownie
    if (!file) return;
    try {
      handlePhotoReady(await fileToJpegBase64(file));
    } catch (err) {
      setCameraError(errorMessage(err));
    }
  };

  const openCamera = () => {
    setCameraError(hasCameraApi() ? null : NO_CAMERA_API);
    setIsCameraOpen(true);
  };

  const markAdded = (msgId: string) => setAddedMsgIds((prev) => new Set([...prev, msgId]));

  // Recalculates portion macros and saves item directly to Firebase
  const handleAddMealFromCard = (msgId: string, result: NonNullable<ChatMessage['aiResult']>) => {
    const eaten = parseFloat((eatenWeights[msgId] ?? '100').replace(',', '.'));
    if (isNaN(eaten) || eaten <= 0) {
      alert('Podaj prawidłową wagę w gramach.');
      return;
    }
    const factor = eaten / Number(result.baseGrammage || 100);
    const newItem: MealItem = {
      id: crypto.randomUUID(),
      name: result.productName,
      calories: Math.round(Number(result.calories) * factor),
      protein: Number(result.protein) * factor,
      carbs: Number(result.carbs) * factor,
      fat: Number(result.fat) * factor,
      weight: eaten,
    };
    updateMealItem(category, newItem);
    markAdded(msgId);
  };

  const handleAddDish = (msgId: string, dish: DishEstimate) => {
    const f = portionFactors[msgId] ?? 1;
    updateMealItem(category, {
      id: crypto.randomUUID(),
      name: dish.name,
      calories: Math.round(dish.calories * f),
      protein: dish.protein * f,
      carbs: dish.carbs * f,
      fat: dish.fat * f,
      weight: Math.round(dish.portionGrams * f),
    });
    markAdded(msgId);
  };

  const addedBadge = (
    <div className="flex items-center justify-center space-x-1.5 py-2.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
      <Check className="w-4 h-4" />
      <span>Dodano do posiłku</span>
    </div>
  );

  // Karta szacunku ze zdjęcia potrawy
  const renderDishCard = (msgId: string, dish: DishEstimate) => {
    const f = portionFactors[msgId] ?? 1;
    const isAdded = addedMsgIds.has(msgId);
    const conf = CONFIDENCE_UI[dish.confidence];
    const r1 = (v: number) => Math.round(v * f * 10) / 10;

    return (
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4 space-y-3.5 w-[92%] shadow-xl mt-1.5 animate-fade-in text-left">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-bold text-slate-100 leading-snug">{dish.name}</h4>
          <span className={`shrink-0 text-[10px] font-semibold border px-2 py-0.5 rounded-full whitespace-nowrap ${conf.className}`}>
            {conf.label}
          </span>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="font-display text-3xl font-bold text-emerald-400 tabular-nums">{Math.round(dish.calories * f)}</span>
          <span className="text-xs text-slate-400 font-semibold">kcal</span>
          <span className="ml-auto text-xs text-slate-500">ok. {Math.round(dish.portionGrams * f)} g</span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'Białko', value: r1(dish.protein), color: 'text-blue-400' },
            { label: 'Węgle', value: r1(dish.carbs), color: 'text-amber-400' },
            { label: 'Tłuszcz', value: r1(dish.fat), color: 'text-purple-400' },
          ].map((m) => (
            <div key={m.label} className="bg-slate-900/40 p-2 rounded-xl border border-slate-900/60">
              <span className={`block text-[10px] font-bold ${m.color}`}>{m.label}</span>
              <span className="text-xs font-bold text-slate-200">{m.value} g</span>
            </div>
          ))}
        </div>

        {dish.components.length > 0 && (
          <ul className="space-y-1 text-[11px] text-slate-400">
            {dish.components.map((c, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="truncate">{c.name}</span>
                <span className="shrink-0 tabular-nums text-slate-500">
                  {c.grams ? `${Math.round(c.grams * f)} g · ` : ''}
                  {Math.round(c.calories * f)} kcal
                </span>
              </li>
            ))}
          </ul>
        )}

        {dish.assumptions && <p className="text-[11px] leading-relaxed text-slate-500">{dish.assumptions}</p>}

        {isAdded ? (
          addedBadge
        ) : (
          <div className="space-y-2.5 pt-1">
            <div>
              <span className="block text-[11px] text-slate-400 font-semibold mb-1.5">
                Porcja wyszła mniejsza lub większa? Dopasuj ją:
              </span>
              <div className="grid grid-cols-6 gap-1" role="radiogroup" aria-label="Wielkość porcji">
                {PORTION_FACTORS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    role="radio"
                    aria-checked={f === p.value}
                    onClick={() => setPortionFactors((prev) => ({ ...prev, [msgId]: p.value }))}
                    className={`py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      f === p.value
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => handleAddDish(msgId, dish)}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-xl active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-emerald-500/10"
            >
              Dodaj {Math.round(dish.calories * f)} kcal do posiłku
            </button>
          </div>
        )}
      </div>
    );
  };

  // Karta wartości na 100 g / na porcję z etykiety – użytkownik podaje gramaturę
  const renderAICard = (msgId: string, result: NonNullable<ChatMessage['aiResult']>) => {
    const eatenVal = eatenWeights[msgId] ?? '100';
    const isAdded = addedMsgIds.has(msgId);

    return (
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4 space-y-3.5 max-w-[90%] shadow-xl mt-1.5 animate-fade-in text-left">
        <div className="flex items-center justify-between pb-2 border-b border-slate-900">
          <span className="text-xs font-black text-amber-400 truncate max-w-[65%]">{result.productName}</span>
          <span className="text-[10px] text-slate-500 font-bold bg-slate-900 border border-slate-800 px-2.5 py-0.5 rounded-full">
            Baza: {result.baseGrammage}g
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2 text-center text-slate-300">
          <div className="bg-slate-900/40 p-2 rounded-xl border border-slate-900/60">
            <span className="block text-[9px] font-bold text-red-400 uppercase">Kcal</span>
            <span className="text-xs font-bold">{Math.round(result.calories)}</span>
          </div>
          <div className="bg-slate-900/40 p-2 rounded-xl border border-slate-900/60">
            <span className="block text-[9px] font-bold text-blue-400 uppercase">Białko</span>
            <span className="text-xs font-bold">{Math.round(Number(result.protein) * 10) / 10}g</span>
          </div>
          <div className="bg-slate-900/40 p-2 rounded-xl border border-slate-900/60">
            <span className="block text-[9px] font-bold text-amber-400 uppercase">Węgle</span>
            <span className="text-xs font-bold">{Math.round(Number(result.carbs) * 10) / 10}g</span>
          </div>
          <div className="bg-slate-900/40 p-2 rounded-xl border border-slate-900/60">
            <span className="block text-[9px] font-bold text-purple-400 uppercase">Tłuszcz</span>
            <span className="text-xs font-bold">{Math.round(Number(result.fat) * 10) / 10}g</span>
          </div>
        </div>

        {isAdded ? (
          addedBadge
        ) : (
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between bg-slate-950 px-3 py-2 rounded-xl border border-slate-900">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Porcja (g):</span>
              <div className="flex items-center space-x-1">
                <input
                  type="number"
                  inputMode="decimal"
                  value={eatenVal}
                  onChange={(e) => setEatenWeights((prev) => ({ ...prev, [msgId]: e.target.value }))}
                  placeholder="100"
                  className="w-16 bg-transparent text-right text-slate-200 font-bold text-base focus:outline-none placeholder:text-sm"
                />
                <span className="text-xxs text-slate-500 font-semibold">g</span>
              </div>
            </div>

            <button
              onClick={() => handleAddMealFromCard(msgId, result)}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-xl active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-emerald-500/10"
            >
              Dodaj do mojego dnia
            </button>
          </div>
        )}
      </div>
    );
  };

  const canSend = !!pendingPhoto || !!textInput.trim();

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 animate-fade-in flex justify-end">
      {/* 100dvh = faktycznie widoczna wysokość (bez paska przeglądarki); safe-area = notch i pasek „home” */}
      <div className="relative w-full sm:w-[450px] h-[100dvh] flex flex-col bg-slate-900 shadow-2xl border-l border-slate-800/80 px-5 sm:px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Zamknij"
          className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 p-2 text-slate-500 hover:text-slate-300 rounded-full hover:bg-slate-800 transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center mb-4 pt-2">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-purple-500/10 text-purple-400 mb-2">
            <Sparkles className="w-5 h-5" />
          </div>
          <h2 className="text-base font-bold text-slate-100">Asystent Dietetyczny AI</h2>
          <p className="text-slate-500 text-[10px] mt-0.5">Zdjęcie talerza, opis słowny albo zdjęcie etykiety.</p>
        </div>

        {/* Chat log window */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 space-y-4 mb-3 py-2 border-t border-b border-slate-950 flex flex-col">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end text-right' : 'items-start text-left'} space-y-1`}
            >
              {/* Image Bubble */}
              {msg.image && (
                <div className="max-w-[70%] border border-slate-800 rounded-2xl overflow-hidden shadow-md">
                  <img
                    src={`data:image/jpeg;base64,${msg.image}`}
                    alt="Wysłane zdjęcie"
                    className="w-full h-auto object-cover max-h-48"
                  />
                </div>
              )}

              {/* Text Bubble */}
              {msg.text && !msg.isLoading && (
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-purple-600 text-slate-100 rounded-tr-none'
                      : 'bg-slate-950 border border-slate-900 text-slate-300 rounded-tl-none'
                  }`}
                >
                  {msg.text}
                </div>
              )}

              {/* Loading State */}
              {msg.isLoading && (
                <div className="flex items-center space-x-2 bg-slate-950/60 border border-slate-900 rounded-xl px-4 py-3 text-xs text-amber-400 animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>{msg.text}</span>
                </div>
              )}

              {msg.aiResult && renderAICard(msg.id, msg.aiResult)}
              {msg.dishResult && renderDishCard(msg.id, msg.dishResult)}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Zdjęcie potrawy czekające na opis */}
        {pendingPhoto && (
          <div className="flex items-center gap-3 bg-slate-950 border border-slate-800 rounded-2xl p-2 mb-2 animate-fade-in">
            <img
              src={`data:image/jpeg;base64,${pendingPhoto}`}
              alt="Zdjęcie posiłku do wysłania"
              className="w-14 h-14 rounded-xl object-cover shrink-0"
            />
            <p className="flex-1 text-[11px] leading-snug text-slate-400">
              Dopisz, co to jest i jak przygotowane – szacunek będzie dokładniejszy. Możesz też od razu wysłać.
            </p>
            <button
              type="button"
              onClick={() => setPendingPhoto(null)}
              aria-label="Usuń zdjęcie"
              className="p-2 text-slate-500 hover:text-slate-300 rounded-full hover:bg-slate-800 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Input Bar panel */}
        <form onSubmit={handleSubmit} className="flex items-center space-x-2 pt-2">
          <button
            type="button"
            onClick={openCamera}
            className="p-3 bg-slate-950 border border-slate-900 text-amber-500 rounded-xl hover:bg-slate-900 active:scale-[0.95] transition-all cursor-pointer flex items-center justify-center"
            title="Zrób zdjęcie posiłku lub etykiety"
            aria-label="Zrób zdjęcie posiłku lub etykiety"
          >
            <Camera className="w-4 h-4" />
          </button>

          <input
            ref={textInputRef}
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            maxLength={300}
            placeholder={pendingPhoto ? 'np. schabowy z ziemniakami, smażony' : 'Opisz posiłek...'}
            className="flex-1 min-w-0 bg-slate-950 border border-slate-900/70 rounded-xl px-4 py-1.5 text-slate-200 placeholder-slate-700 placeholder:text-sm focus:outline-none focus:border-purple-500 transition-colors text-base"
          />

          <button
            type="submit"
            disabled={!canSend}
            aria-label="Wyślij"
            className={`p-3 rounded-xl font-bold text-white transition-all flex items-center justify-center ${
              canSend
                ? 'bg-purple-600 hover:bg-purple-500 active:scale-[0.95] cursor-pointer'
                : 'bg-slate-800 text-slate-600 border border-slate-900 cursor-not-allowed'
            }`}
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* Ukryty wybór zdjęcia – na telefonie otwiera też systemowy aparat */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFilePicked} />

      {/* CAMERA OVERLAY */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center gap-4 px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-fade-in">
          {showFlash && <div className="absolute inset-0 bg-white z-[110] pointer-events-none" />}

          <button
            onClick={() => setIsCameraOpen(false)}
            aria-label="Zamknij aparat"
            className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 p-2 text-slate-400 hover:text-slate-200 rounded-full bg-slate-900/50 backdrop-blur border border-slate-800 z-30 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Tryb: potrawa / etykieta */}
          <div className="pt-8 flex flex-col items-center gap-2 text-center">
            <div className="inline-flex p-1 rounded-full bg-slate-900 border border-slate-800" role="radiogroup" aria-label="Co fotografujesz">
              {(
                [
                  { mode: 'dish' as const, label: 'Potrawa', Icon: UtensilsCrossed },
                  { mode: 'label' as const, label: 'Etykieta', Icon: ScanText },
                ]
              ).map(({ mode, label, Icon }) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={cameraMode === mode}
                  onClick={() => setCameraMode(mode)}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                    cameraMode === mode ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:text-slate-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
            <p className="text-slate-400 text-[11px] max-w-xs leading-relaxed">
              {cameraMode === 'dish'
                ? 'Sfotografuj cały talerz z góry lub lekko z boku. Sztućce albo dłoń w kadrze pomagają ocenić porcję.'
                : 'Skieruj aparat na tabelę wartości odżywczych na opakowaniu.'}
            </p>
          </div>

          <div className="relative w-full max-w-sm flex-1 min-h-0 max-h-[60dvh] mx-auto rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center">
            {cameraError ? (
              <div className="p-6 text-center space-y-4">
                <p className="text-sm text-slate-300 leading-relaxed">{cameraError}</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold cursor-pointer"
                >
                  <ImagePlus className="w-4 h-4" />
                  Wybierz zdjęcie
                </button>
              </div>
            ) : (
              <>
                <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                {cameraMode === 'label' && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-[85%] h-[80%] border-2 border-amber-500/35 rounded-xl relative">
                      <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-amber-500 rounded-tl" />
                      <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-amber-500 rounded-tr" />
                      <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-amber-500 rounded-bl" />
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-amber-500 rounded-br" />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="w-full max-w-sm grid grid-cols-3 items-center">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Wybierz zdjęcie z galerii"
              className="justify-self-start flex flex-col items-center gap-1 text-slate-300 hover:text-slate-100 cursor-pointer p-2"
            >
              <ImagePlus className="w-6 h-6" />
              <span className="text-[10px] font-semibold">Galeria</span>
            </button>
            <button
              onClick={takeSnapshot}
              disabled={!!cameraError}
              className="justify-self-center w-18 h-18 rounded-full border-4 border-white/20 p-1 flex items-center justify-center bg-transparent active:scale-95 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Zrób zdjęcie"
            >
              <div className="w-full h-full rounded-full bg-white hover:bg-slate-100 transition-colors shadow-lg" />
            </button>
            <span />
          </div>
        </div>
      )}
    </div>
  );
};
