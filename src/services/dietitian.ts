import type { DietitianReport } from '../types';

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
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  tdee: number;
  isStrictLimitMode: boolean;
}): Promise<DietitianReport> {
  const { apiKey, totalCalories, totalProtein, totalCarbs, totalFat, tdee, isStrictLimitMode } = params;

  if (!apiKey) {
    throw new Error('Brak klucza API Gemini! Skonfiguruj go w Ustawieniach.');
  }

  const prompt = `Jesteś rygorystycznym, ale motywującym Dietetykiem AI oraz ekspertem UX w aplikacji do liczenia kalorii. Twoim zadaniem jest przeanalizowanie dotychczasowego spożycia kalorii i makroskładników użytkownika z danego dnia (stan na godzinę 18:00) w odniesieniu do jego celów dobowych i wygenerowanie raportu.

Zawsze zwracaj odpowiedź wyłącznie w formacie JSON o poniższej strukturze:
{
  "push_notification": {
    "title": "Krótki, angażujący tytuł push (max 40 znaków)",
    "body": "Jedno konkretne, dynamiczne zdanie podsumowujące status lub dające radę na wieczór (max 90 znaków). Musi intrygować, by użytkownik kliknął."
  },
  "full_analysis": {
    "status_summary": "Krótkie podsumowanie obecnego stanu (np. 'Świetny balans białka, ale uważaj na tłuszcze').",
    "calories_remaining": "Informacja o pozostałych kaloriach (lub przekroczeniu) i krótki komentarz.",
    "macro_critique": {
      "protein": "Krytyczna ocena spożycia białka w tym dniu.",
      "carbs": "Krytyczna ocena spożycia węglowodanów w tym dniu.",
      "fat": "Krytyczna ocena spożycia tłuszczów w tym dniu."
    },
    "actionable_advice": "Konkretna, spersonalizowana wskazówka na resztę wieczoru. Jeśli zostało mało kalorii, zaproponuj lekką przekąskę. Jeśli brakuje białka, wskaż np. twaróg lub odżywkę. Bądź precyzyjny."
  }
}

Zasady zachowania i stylu AI:
1. Bądź bezpośredni i konstruktywny. Jeśli użytkownik przekroczył tłuszcze o 18:00, powiedz mu to wprost, ale zaproponuj jak uratować resztę dnia (np. chuda kolacja).
2. Używaj języka korzyści i motywacji, unikaj oceniania i zawstydzania.
3. Dopasowuj porady do godziny 18:00 – użytkownik ma przed sobą zazwyczaj już tylko jeden posiłek (kolację).
4. Nigdy nie przekraczaj limitu znaków w sekcji 'push_notification' (title max 40 znaków, body max 90 znaków).
5. Odpowiedz wyłącznie surowym formatem JSON, bez żadnego markdownu (nie używaj \`\`\`json), spacji i komentarzy.

Dane użytkownika z dzisiejszego dnia (stan na 18:00):
- Cel kaloryczny (TDEE): ${tdee} kcal
- Tryb limitu: ${isStrictLimitMode ? "Pilnowanie limitu (Redukcja)" : "Budowanie masy (Nadwyżka)"}
- Spożyte kalorie: ${totalCalories} kcal
- Spożyte białko: ${totalProtein} g
- Spożyte węglowodany: ${totalCarbs} g
- Spożyte tłuszcze: ${totalFat} g`;

  const response = await fetch(`${BASE_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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
    const report: DietitianReport = JSON.parse(cleanText);
    return report;
  } catch (err) {
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

  const response = await fetch(`${BASE_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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
    const mealResult: AIMealResult = JSON.parse(cleanText);
    return mealResult;
  } catch (err) {
    console.error('Błąd parsowania JSON posiłku:', rawText, err);
    throw new Error('Nie udało się zinterpretować wartości odżywczych dla potrawy.');
  }
}
