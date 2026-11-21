import type { DietitianReport } from '../types';
import { formatContextForPrompt } from './dietitianContext';
import type { DietitianContext } from './dietitianContext';
import { FirebaseError } from 'firebase/app';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent';

function cleanJsonResponse(text: string): string {
  let clean = text.trim();
  if (clean.startsWith('```json')) {
    clean = clean.substring(7);
  } else if (clean.startsWith('```')) {
    clean = clean.substring(3);
  }
  if (clean.endsWith('```')) {
    clean = clean.substring(0, clean.length - 3);
  }
  return clean.trim();
}

export async function fetchDietitianReport(params: {
  apiKey: string;
  context: DietitianContext;
}): Promise<DietitianReport> {
  const { apiKey, context } = params;

  if (!apiKey) {
    throw new Error('Brak klucza API Gemini! Skonfiguruj go w Ustawieniach.');
  }

  const timeRule = context.isToday
    ? `Jest godzina ${context.time} i dzień jeszcze trwa. Dopasuj porady do pory dnia: rano/w południe planuj resztę dnia, wieczorem skup się na ostatnim posiłku.`
    : 'Analizowany dzień jest zakończony – oceń go całościowo i daj wskazówkę na kolejny dzień.';

  const prompt = `Jesteś rygorystycznym, ale motywującym Dietetykiem AI w aplikacji do liczenia kalorii. Przeanalizuj dzień użytkownika NA TLE ostatniego tygodnia, trendu wagi i treningów, a potem wygeneruj raport.

Zawsze zwracaj odpowiedź wyłącznie w formacie JSON o poniższej strukturze:
{
  "push_notification": {
    "title": "Krótki, angażujący tytuł push (max 40 znaków)",
    "body": "Jedno konkretne zdanie podsumowujące status lub dające radę (max 90 znaków)."
  },
  "full_analysis": {
    "status_summary": "1–2 zdania: jak wypada ten dzień i czy pasuje do wzorca z tygodnia.",
    "calories_remaining": "Ile kalorii zostało (lub o ile przekroczono) i krótki komentarz.",
    "macro_critique": {
      "protein": "Ocena białka w tym dniu, z odniesieniem do celu i średniej z tygodnia.",
      "carbs": "Ocena węglowodanów w tym dniu.",
      "fat": "Ocena tłuszczów w tym dniu."
    },
    "weekly_insight": "2–3 zdania o trendach: średnie z 7 dni, powtarzające się problemy, tempo zmian wagi względem celu (zdrowe tempo redukcji to ok. 0,25–1% masy ciała na tydzień; na masie ok. 0,1–0,5 kg/tydz.), wpływ treningów na zapotrzebowanie. Jeśli brakuje danych, napisz wprost, czego brakuje (np. pomiarów wagi).",
    "actionable_advice": "Jedna konkretna, spersonalizowana wskazówka na resztę dnia lub jutro (np. konkretna przekąska bogata w białko). Bądź precyzyjny."
  }
}

Zasady:
1. Opieraj się wyłącznie na podanych liczbach – nie wymyślaj danych, których nie ma.
2. Bądź bezpośredni i konstruktywny, używaj języka korzyści, bez zawstydzania.
3. Jeśli tempo zmian wagi jest za szybkie, za wolne lub w złą stronę względem celu – powiedz to i zaproponuj korektę kalorii o konkretną liczbę kcal.
4. Jeśli są dni treningowe, uwzględnij większe zapotrzebowanie na białko i regenerację.
5. ${timeRule}
6. Nigdy nie przekraczaj limitów znaków w sekcji 'push_notification'.
7. Odpowiedz wyłącznie surowym JSON-em, bez markdownu i komentarzy.

DANE UŻYTKOWNIKA:
${formatContextForPrompt(context)}`;

  const response = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Klucz w nagłówku, a nie w URL – adresy URL trafiają do logów i historii
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || `Błąd serwera (${response.status})`;
    throw new Error(message);
  }

  const result = await response.json();
  const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Brak tekstu w odpowiedzi od Gemini API.');
  }

  try {
    const cleanText = cleanJsonResponse(rawText);
    const parsed = JSON.parse(cleanText);

    // Map snake_case to camelCase mapping to prevent runtime errors
    const report: DietitianReport = {
      pushNotification: {
        title: parsed?.push_notification?.title || parsed?.pushNotification?.title || 'Podsumowanie dnia',
        body: parsed?.push_notification?.body || parsed?.pushNotification?.body || '',
      },
      fullAnalysis: {
        statusSummary: parsed?.full_analysis?.status_summary || parsed?.fullAnalysis?.statusSummary || 'Brak podsumowania',
        caloriesRemaining: parsed?.full_analysis?.calories_remaining || parsed?.fullAnalysis?.caloriesRemaining || '',
        macroCritique: {
          protein: parsed?.full_analysis?.macro_critique?.protein || parsed?.fullAnalysis?.macroCritique?.protein || '',
          carbs: parsed?.full_analysis?.macro_critique?.carbs || parsed?.fullAnalysis?.macroCritique?.carbs || '',
          fat: parsed?.full_analysis?.macro_critique?.fat || parsed?.fullAnalysis?.macroCritique?.fat || '',
        },
        actionableAdvice: parsed?.full_analysis?.actionable_advice || parsed?.fullAnalysis?.actionableAdvice || '',
        weeklyInsight: parsed?.full_analysis?.weekly_insight || parsed?.fullAnalysis?.weeklyInsight || '',
      },
      generatedAt: new Date().toISOString(),
    };
    return report;
  } catch (err) {
    if (err instanceof FirebaseError) {
      console.error('Firebase error context:', err.code);
    }
    console.error('Błąd parsowania JSON:', rawText, err);
    throw new Error('Nie udało się zinterpretować danych raportu. Odpowiedź nie była poprawnym formatem JSON.');
  }
}

export interface AIMealResult {
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}

export async function fetchAIMealAnalysis(params: {
  apiKey: string;
  inputText: string;
}): Promise<AIMealResult> {
  const { apiKey, inputText } = params;

  if (!apiKey) {
    throw new Error('Brak klucza API Gemini! Skonfiguruj go w Ustawieniach.');
  }

  const prompt = `Przeanalizuj posiłek podany przez użytkownika i oszacuj średnie wartości odżywcze W PRZELICZENIU NA 100g produktu/potrawy.
Odpowiedz wyłącznie surowym formatem JSON, bez żadnego markdownu (nie używaj \`\`\`json), spacji i komentarzy.
Format struktury ma wyglądać dokładnie tak:
{"kcalPer100g": 150, "proteinPer100g": 12.5, "carbsPer100g": 18.0, "fatPer100g": 3.2}
Jeśli tekst nie dotyczy jedzenia, zwróć same zera.
Posiłek do analizy na 100g: ${inputText}`;

  const response = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Klucz w nagłówku, a nie w URL – adresy URL trafiają do logów i historii
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || `Błąd serwera (${response.status})`;
    throw new Error(message);
  }

  const result = await response.json();
  const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Brak tekstu w odpowiedzi od Gemini API.');
  }

  try {
    const cleanText = cleanJsonResponse(rawText);
    const parsed = JSON.parse(cleanText);
    // Odpowiedź modelu traktujemy jak niezaufane dane: tylko skończone, nieujemne liczby w rozsądnym zakresie
    const num = (v: unknown, max: number) => {
      const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
      return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
    };
    const mealResult: AIMealResult = {
      kcalPer100g: num(parsed?.kcalPer100g, 1000),
      proteinPer100g: num(parsed?.proteinPer100g, 100),
      carbsPer100g: num(parsed?.carbsPer100g, 100),
      fatPer100g: num(parsed?.fatPer100g, 100),
    };
    return mealResult;
  } catch (err) {
    if (err instanceof FirebaseError) {
      console.error('Firebase error context:', err.code);
    }
    console.error('Błąd parsowania JSON posiłku:', rawText, err);
    throw new Error('Nie udało się zinterpretować wartości odżywczych dla potrawy.');
  }
}

export interface AIVisionResult {
  success?: boolean;
  productName?: string;
  portionGrams?: string | number;
  calories?: string | number;
  protein?: string | number;
  carbs?: string | number;
  fat?: string | number;
  baseGrammage?: string | number;
}

export async function analyzeLabelImage(params: {
  apiKey: string;
  imageBase64: string;
}): Promise<AIVisionResult> {
  const { apiKey, imageBase64 } = params;

  if (!apiKey) {
    throw new Error('Brak klucza API Gemini! Skonfiguruj go w Ustawieniach.');
  }

  const prompt = `Przeanalizuj to zdjęcie tabeli składników odżywczych. Wyciągnij z niego wyłącznie wartości odżywcze i zwróć je w czystym formacie JSON (bez bloków \`\`\`json i bez dodatkowego tekstu):
  {
    "portionGrams": "wartość w gramach, na jaką podane są dane w tabeli (np. 100 lub 30) - jeśli nie ma, domyślnie 100",
    "calories": "energia w kcal",
    "protein": "białko w g",
    "carbs": "węglowodany w g",
    "fat": "tłuszcz w g"
  }
  Skoncentruj się na polskich słowach kluczowych: energia, kalorie, białko, węglowodany, tłuszcz. Jeśli na zdjęciu nie ma tabeli, zwróć pusty obiekt {}.`;

  const response = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Klucz w nagłówku, a nie w URL – adresy URL trafiają do logów i historii
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: imageBase64
              }
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || `Błąd serwera (${response.status})`;
    throw new Error(message);
  }

  const result = await response.json();
  const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Brak tekstu w odpowiedzi od Gemini API.');
  }

  try {
    const cleanText = cleanJsonResponse(rawText);
    const parsed = JSON.parse(cleanText);
    return parsed;
  } catch (err) {
    console.error('Błąd parsowania JSON etykiety:', rawText, err);
    throw new Error('Nie udało się zinterpretować tabeli składników odżywczych ze zdjęcia.');
  }
}

