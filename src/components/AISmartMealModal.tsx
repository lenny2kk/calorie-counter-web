import React, { useState, useEffect, useRef } from 'react';
import { useCalorieTracker } from '../hooks/useCalorieTracker';
import { fetchAIMealAnalysis, analyzeLabelImage } from '../services/dietitian';
import { Sparkles, X, Camera, Send, Check, Loader2 } from 'lucide-react';
import type { MealItem } from '../types';

interface AISmartMealModalProps {
  isOpen: boolean;
  category: 'breakfast' | 'lunch' | 'dinner' | 'snacks';
  onClose: () => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text?: string;
  image?: string; // Base64 representation of captured frame
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
}

export const AISmartMealModal: React.FC<AISmartMealModalProps> = ({ isOpen, category, onClose }) => {
  const { apiKey, updateMealItem } = useCalorieTracker();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [textInput, setTextInput] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [showFlash, setShowFlash] = useState(false);

  // Track portions input values per message card ID
  const [eatenWeights, setEatenWeights] = useState<Record<string, string>>({});
  const [addedMsgIds, setAddedMsgIds] = useState<Set<string>>(new Set());

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Initialize welcome message when modal opens
  useEffect(() => {
    if (isOpen) {
      setMessages([
        {
          id: 'welcome',
          sender: 'assistant',
          text: 'Witaj! Jestem Twoim Asystentem Dietetycznym AI. Możesz opisać słownie swój posiłek (np. "dwa jajka sadzone i banan") lub zrobić zdjęcie tabeli wartości odżywczych z opakowania, klikając ikonę aparatu 📸. Pomogę Ci dokładnie wyliczyć makro i dodać posiłek do licznika.'
        }
      ]);
      setEatenWeights({});
      setAddedMsgIds(new Set());
    }
  }, [isOpen]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle active camera streaming lifecycle
  useEffect(() => {
    let activeStream: MediaStream | null = null;
    
    if (isCameraOpen) {
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      }).then((stream) => {
        activeStream = stream;
        const videoElement = document.getElementById('camera-preview') as HTMLVideoElement;
        if (videoElement) {
          videoElement.srcObject = stream;
          videoElement.play().catch(err => console.error("Video play error:", err));
        }
      }).catch((err) => {
        console.error("Camera access error:", err);
        alert("Nie można uzyskać dostępu do aparatu. Upewnij się, że zezwoliłeś na uprawnienia kamery w przeglądarce.");
        setIsCameraOpen(false);
      });
    }
    
    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isCameraOpen]);

  if (!isOpen) return null;

  // Handles text-based message parsing
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = textInput.trim();
    if (!query) return;

    setTextInput('');

    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();

    // 1. Add user text message
    setMessages(prev => [...prev, {
      id: userMsgId,
      sender: 'user',
      text: query
    }]);

    // 2. Add assistant loader
    setMessages(prev => [...prev, {
      id: assistantMsgId,
      sender: 'assistant',
      isLoading: true,
      text: 'Analizuję Twój posiłek...'
    }]);

    try {
      const result = await fetchAIMealAnalysis({
        apiKey,
        inputText: query
      });

      // Update loader message with parsed card values
      setMessages(prev => prev.map(msg => {
        if (msg.id === assistantMsgId) {
          return {
            id: assistantMsgId,
            sender: 'assistant',
            aiResult: {
              success: true,
              productName: query.length > 40 ? query.substring(0, 40) + '...' : query,
              calories: result.kcalPer100g,
              protein: result.proteinPer100g,
              carbs: result.carbsPer100g,
              fat: result.fatPer100g,
              baseGrammage: 100
            }
          };
        }
        return msg;
      }));
    } catch (err: any) {
      console.error(err);
      setMessages(prev => prev.map(msg => {
        if (msg.id === assistantMsgId) {
          return {
            id: assistantMsgId,
            sender: 'assistant',
            text: `Nie udało się przeanalizować posiłku: ${err.message || err}. Opisz go innymi słowami.`
          };
        }
        return msg;
      }));
    }
  };

  // Handles image base64 analysis cascade
  const handleSendImageMessage = async (base64Data: string) => {
    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();

    // 1. Add user message with thumbnail
    setMessages(prev => [...prev, {
      id: userMsgId,
      sender: 'user',
      image: base64Data
    }]);

    // 2. Add assistant loader
    setMessages(prev => [...prev, {
      id: assistantMsgId,
      sender: 'assistant',
      isLoading: true,
      text: 'Asystent analizuje etykietę...'
    }]);

    try {
      const result = await analyzeLabelImage({
        apiKey,
        imageBase64: base64Data
      });

      if (result && (result.success === true || result.calories !== undefined)) {
        setMessages(prev => prev.map(msg => {
          if (msg.id === assistantMsgId) {
            return {
              id: assistantMsgId,
              sender: 'assistant',
              aiResult: {
                success: true,
                productName: String(result.productName || 'Nieznany produkt AI'),
                calories: Number(result.calories ?? 0),
                protein: Number(result.protein ?? 0),
                carbs: Number(result.carbs ?? 0),
                fat: Number(result.fat ?? 0),
                baseGrammage: Number(result.portionGrams || result.baseGrammage || 100)
              }
            };
          }
          return msg;
        }));
      } else {
        throw new Error("Nie można odczytać tabeli.");
      }
    } catch (err: any) {
      console.error(err);
      setMessages(prev => prev.map(msg => {
        if (msg.id === assistantMsgId) {
          return {
            id: assistantMsgId,
            sender: 'assistant',
            text: 'Zdjęcie jest nieczytelne lub nie znaleziono tabeli wartości odżywczych. Spróbuj zrobić zdjęcie pod lepszym kątem lub przy lepszym oświetleniu.'
          };
        }
        return msg;
      }));
    }
  };

  // Captures current webcam stream canvas screenshot
  const takeSnapshot = () => {
    const video = document.getElementById('camera-preview') as HTMLVideoElement;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || video.clientWidth;
    canvas.height = video.videoHeight || video.clientHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const base64 = dataUrl.split(',')[1];

    setShowFlash(true);
    setTimeout(() => {
      setShowFlash(false);
      setIsCameraOpen(false);
      handleSendImageMessage(base64);
    }, 150);
  };

  // Recalculates portion macros and saves item directly to Firebase
  const handleAddMealFromCard = (msgId: string, result: NonNullable<ChatMessage['aiResult']>) => {
    const weightStr = eatenWeights[msgId] ?? '100';
    const eaten = parseFloat(weightStr);
    
    if (isNaN(eaten) || eaten <= 0) {
      alert("Podaj prawidłową wagę w gramach.");
      return;
    }

    const base = Number(result.baseGrammage || 100);
    const factor = eaten / base;

    const finalKcal = Math.round(Number(result.calories) * factor);
    const finalProtein = Number(result.protein) * factor;
    const finalCarbs = Number(result.carbs) * factor;
    const finalFat = Number(result.fat) * factor;

    const newItem: MealItem = {
      id: crypto.randomUUID(),
      name: result.productName,
      calories: finalKcal,
      protein: finalProtein,
      carbs: finalCarbs,
      fat: finalFat,
      weight: eaten
    };

    updateMealItem(category, newItem);
    setAddedMsgIds(prev => new Set([...prev, msgId]));
  };

  // Renders the verification card inside the chat log window
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
          <div className="flex items-center justify-center space-x-1.5 py-2.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <Check className="w-4 h-4" />
            <span>Dodano pomyślnie! ✓</span>
          </div>
        ) : (
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between bg-slate-950 px-3 py-2 rounded-xl border border-slate-900">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Porcja (g):</span>
              <div className="flex items-center space-x-1">
                <input
                  type="number"
                  value={eatenVal}
                  onChange={(e) => setEatenWeights(prev => ({ ...prev, [msgId]: e.target.value }))}
                  placeholder="100"
                  className="w-16 bg-transparent text-right text-slate-200 font-bold text-xs focus:outline-none"
                />
                <span className="text-xxs text-slate-500 font-semibold">g</span>
              </div>
            </div>
            
            <button
              onClick={() => handleAddMealFromCard(msgId, result)}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold rounded-xl active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-emerald-500/10"
            >
              Dodaj do mojego dnia
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm z-50 animate-fade-in">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 relative shadow-2xl flex flex-col h-[85vh]">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-500 hover:text-slate-300 rounded-full hover:bg-slate-800 transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center mb-4 pt-2">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-purple-500/10 text-purple-400 mb-2">
            <Sparkles className="w-5 h-5" />
          </div>
          <h2 className="text-base font-bold text-slate-100">Asystent Dietetyczny AI</h2>
          <p className="text-slate-500 text-[10px] mt-0.5">Rozmawiaj słownie o jedzeniu lub zrób zdjęcie etykiety.</p>
        </div>

        {/* Chat log window */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4 mb-4 py-2 border-t border-b border-slate-950 flex flex-col">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.sender === 'user' ? 'items-end text-right' : 'items-start text-left'
              } space-y-1`}
            >
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

              {/* Image Bubble */}
              {msg.image && (
                <div className="max-w-[70%] border border-slate-800 rounded-2xl overflow-hidden shadow-md">
                  <img
                    src={`data:image/jpeg;base64,${msg.image}`}
                    alt="Zrzut z etykiety"
                    className="w-full h-auto object-cover max-h-48"
                  />
                </div>
              )}

              {/* Loading State */}
              {msg.isLoading && (
                <div className="flex items-center space-x-2 bg-slate-950/60 border border-slate-900 rounded-xl px-4 py-3 text-xs text-amber-400 animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>{msg.text}</span>
                </div>
              )}

              {/* AI Result Card */}
              {msg.aiResult && renderAICard(msg.id, msg.aiResult)}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar panel */}
        <form onSubmit={handleSendMessage} className="flex items-center space-x-2 pt-2">
          <button
            type="button"
            onClick={() => setIsCameraOpen(true)}
            className="p-3 bg-slate-950 border border-slate-900 text-amber-500 rounded-xl hover:bg-slate-900 active:scale-[0.95] transition-all cursor-pointer flex items-center justify-center"
            title="Zrób zdjęcie etykiety"
          >
            <Camera className="w-4 h-4" />
          </button>
          
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Opisz posiłek..."
            className="flex-1 bg-slate-950 border border-slate-905/70 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-700 focus:outline-none focus:border-purple-500 transition-colors text-xs"
          />

          <button
            type="submit"
            disabled={!textInput.trim()}
            className={`p-3 rounded-xl font-bold text-white transition-all flex items-center justify-center ${
              textInput.trim()
                ? 'bg-purple-600 hover:bg-purple-500 active:scale-[0.95] cursor-pointer'
                : 'bg-slate-850 text-slate-600 border border-slate-900 cursor-not-allowed'
            }`}
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

      </div>

      {/* CAMERA SNAPSHOT OVERLAY MODAL */}
      {isCameraOpen && (
        <div className="fixed inset-0 bg-slate-950 z-[60] flex flex-col justify-between py-6 px-5 relative animate-fade-in">
          {/* Flash visual overlay */}
          {showFlash && (
            <div className="absolute inset-0 bg-white opacity-100 z-[70] transition-opacity duration-150 pointer-events-none" />
          )}

          {/* Close button */}
          <button
            onClick={() => setIsCameraOpen(false)}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-200 rounded-full bg-slate-900/50 backdrop-blur border border-slate-800 z-30 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="text-center pt-8">
            <h3 className="text-base font-black text-slate-100 uppercase tracking-wider">Zrób zdjęcie etykiety</h3>
            <p className="text-slate-400 text-[10px] max-w-xs mx-auto leading-relaxed mt-1">
              Skieruj aparat na tabelę wartości odżywczych na opakowaniu.
            </p>
          </div>

          <div className="relative w-full max-w-sm aspect-[3/4] mx-auto rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center">
            <video id="camera-preview" className="w-full h-full object-cover" playsInline muted />
            {/* Target bracket guides */}
            <div className="absolute inset-0 border border-dashed border-amber-500/20 rounded-2xl pointer-events-none flex items-center justify-center">
              <div className="w-[85%] h-[80%] border-2 border-amber-500/35 rounded-xl relative">
                <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-amber-500 rounded-tl" />
                <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-amber-500 rounded-tr" />
                <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-amber-500 rounded-bl" />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-amber-500 rounded-br" />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center pb-4">
            <button
              onClick={takeSnapshot}
              className="w-18 h-18 rounded-full border-4 border-white/20 p-1 flex items-center justify-center bg-transparent active:scale-95 transition-all cursor-pointer"
              title="Zrób zdjęcie"
            >
              <div className="w-full h-full rounded-full bg-white flex items-center justify-center hover:bg-slate-100 transition-colors shadow-lg" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
